"""Benchmark report contract and persistence; no provider calls or inferred telemetry."""
import copy
import json
import subprocess
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from suite_benchmarks import Benchmarks, measurements, report_dimensions
from suite_inspect import check_answer


def observed(value, measure, unit, **extra):
    return dict(status='measured', value=value, origin='chat_report', measure=measure,
                unit=unit, method='Lettura contatore esportato', evidence='usage.json: calls[0]',
                note='Solo orchestratore; subagenti non esposti; totale completo non disponibile.', **extra)


class BenchmarkMetricsTests(unittest.TestCase):
    def setUp(self):
        home = Path(__file__).parent / '.test-suite' / ('benchmark-metrics-' + uuid.uuid4().hex)
        self.bench = Benchmarks(home)
        self.case = next(c for c in self.bench.all('case') if c['key'] == 'math-001')
        self.trial = self.bench.trial({'caseId': self.case['id']})

    def payload(self, **extra):
        return dict(trialId=self.trial['id'], architectureId=self.trial['architectures'][0]['id'],
                    answer=' 25\n', notes='', outcome='not_evaluated',
                    dimensions={**measurements({}), 'tokens': observed(123, 'Token del solo orchestratore', 'token')}, **extra)

    def test_packet_requests_only_observed_metrics_and_keeps_case_independent(self):
        packet = self.bench.case_packet(self.case['id'])
        self.assertEqual(packet, self.bench.packet(self.trial['id'], self.trial['architectures'][1]['id']))
        content = packet['content']
        for phrase in ('export consultabile', 'senza stimarlo', 'Token del solo orchestratore',
                       'totale completo resta non disponibile', 'Mantieni invariato il formato richiesto per `answer`'):
            self.assertIn(phrase, content)
        template = json.loads(content.split('```json\n')[-1].split('\n```')[0])
        self.assertEqual(template['answer'], '')
        for key in ('tokens', 'performance', 'cost'):
            self.assertEqual(template['dimensions'][key]['status'], 'unavailable')
            self.assertIsNone(template['dimensions'][key]['value'])
        self.assertEqual(len(measurements(template['dimensions'])), 16)
        report_dimensions(template)
        self.assertIn('report strutturato è obbligatorio', content)
        self.assertNotIn('Puoi lasciare `dimensions: {}`', content)

    def test_rejects_incomplete_reports_before_persistence(self):
        for field in ('answer', 'notes', 'outcome', 'dimensions'):
            payload = self.payload()
            del payload[field]
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'obbligatori'):
                self.bench.run(payload)
        for metric in ('tokens', 'performance', 'cost'):
            payload = self.payload()
            del payload['dimensions'][metric]
            with self.subTest(metric=metric), self.assertRaisesRegex(ValueError, 'obbligatorio'):
                self.bench.run(payload)
            for field in ('status', 'value', 'origin', 'measure', 'unit', 'method', 'evidence', 'note'):
                payload = self.payload()
                del payload['dimensions'][metric][field]
                with self.subTest(metric=metric, field=field), self.assertRaises(ValueError):
                    self.bench.run(payload)
        self.assertEqual(self.bench.all('run'), [])

    def test_contract_applies_to_every_case_and_unavailable_metrics_are_explicit(self):
        for case in self.bench.all('case'):
            packet = self.bench.case_packet(case['id'])
            template = json.loads(packet['content'].split('```json\n')[-1].split('\n```')[0])
            template['answer'] = 'Risposta completa'
            trial = self.bench.trial({'caseId': case['id']})
            template.update(trialId=trial['id'], architectureId=trial['architectures'][1]['id'])
            saved = self.bench.run(template)
            self.assertEqual(saved['answer'], 'Risposta completa')
            for key in ('tokens', 'performance', 'cost'):
                self.assertEqual(saved['dimensions'][key]['status'], 'unavailable')
                self.assertIsNone(saved['dimensions'][key]['value'])
                self.assertTrue(saved['dimensions'][key]['note'])

    def test_operational_metrics_reject_negative_counts_fractional_tokens_and_wrong_units(self):
        for key, value, unit in (('tokens', -1, 'token'), ('tokens', 1.5, 'token'),
                                 ('tokens', 2, 'characters'), ('performance', -1, 's'),
                                 ('performance', 1, 'ms'), ('cost', -1, 'EUR')):
            payload = self.payload()
            payload['dimensions'][key] = observed(value, 'Misura osservata', unit)
            with self.subTest(key=key, value=value, unit=unit), self.assertRaises(ValueError):
                self.bench.run(payload)

    def test_preserves_answer_and_partial_metric_without_inventing_total(self):
        run = self.bench.run(self.payload())
        stored = self.bench.get('run', run['id'])
        self.assertEqual(stored['answer'], ' 25\n')
        self.assertEqual(stored['dimensions']['tokens']['measure'], 'Token del solo orchestratore')
        self.assertIn('totale completo non disponibile', stored['dimensions']['tokens']['note'])
        self.assertEqual(stored['dimensions']['tokens']['value'], 123)
        self.assertEqual(stored['dimensions']['performance']['status'], 'unavailable')
        self.assertIsNone(stored['dimensions']['performance']['value'])

    def test_missing_data_are_unavailable_and_measured_zero_is_valid(self):
        self.assertTrue(all(m['status'] == 'unavailable' and m['value'] is None for m in measurements({}).values()))
        self.assertEqual(measurements({'tokens': observed(0, 'Token osservati', 'token')})['tokens']['value'], 0)
        for status in ('unavailable', 'not_applicable'):
            with self.assertRaises(ValueError):
                measurements({'tokens': {'status': status, 'value': 0, 'note': 'Mancanti'}})

    def test_rejects_missing_evidence_and_non_numeric_metrics(self):
        for key in ('measure', 'unit', 'method', 'evidence'):
            metric = observed(123, 'Token del solo orchestratore', 'token')
            metric[key] = ''
            with self.subTest(key=key), self.assertRaises(ValueError):
                measurements({'tokens': metric})
        for value in (True, '123', float('nan'), float('inf')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                measurements({'tokens': observed(value, 'Token del solo orchestratore', 'token')})

    def test_evaluation_and_revision_keep_operational_dimensions(self):
        original = self.bench.run(self.payload())
        values, _ = check_answer(self.case, original['answer'])
        metrics = copy.deepcopy(original['dimensions'])
        for key, value in values.items():
            metrics[key] = dict(observed(value, 'Criteri soddisfatti', '0/1'), origin='runner')
        scored = self.bench.run(dict(self.payload(sourceRunId=original['id']), dimensions=metrics))
        self.assertEqual(scored['dimensions']['tokens'], original['dimensions']['tokens'])
        self.assertEqual(scored['dimensions']['task_success']['value'], 1)
        revised = self.bench.run(dict(self.payload(sourceRunId=scored['id']), dimensions=metrics, answer='26'))
        self.assertEqual(revised['dimensions']['tokens'], original['dimensions']['tokens'])
        self.assertEqual(revised['dimensions']['task_success']['status'], 'unavailable')
        self.assertEqual(self.bench.get('run', original['id'])['answer'], ' 25\n')

    def fake_inspect(self, command, **kwargs):
        bundle = json.loads(Path(command[2]).read_text(encoding='utf-8'))
        run = copy.deepcopy(bundle['run'])
        values, explanation = check_answer(bundle['trial']['case'], run['answer'])
        run['dimensions'] = measurements(run['dimensions'])
        for key in ('task_success', 'correctness', 'constraints'):
            value = values.get(key)
            run['dimensions'][key] = (dict(observed(value, 'Criteri soddisfatti', '0/1'), origin='runner')
                if value is not None else measurements({})[key])
        run['evaluation'] = {'engine':'Inspect AI', 'scorer':'test-fixture', 'modelCalls':0,
                             'sourceRunId':run['id'], 'note':explanation}
        run['evaluator'] = 'Inspect AI / test-fixture'
        run['outcome'] = 'passed' if values['task_success'] else 'failed'
        run['sourceRunId'] = run.pop('id')
        run['provenance'] = 'Tre dimensioni valutate da Inspect.'
        Path(command[3]).write_text(json.dumps(run), encoding='utf-8')
        return subprocess.CompletedProcess(command, 0, '', '')

    def preview(self, payload):
        with patch.object(self.bench, 'inspect_python', return_value=Path(__file__)), \
             patch('suite_benchmarks.subprocess.run', side_effect=self.fake_inspect):
            return self.bench.preview_score(payload)

    def test_inspect_upload_preview_is_not_saved_until_explicit_save(self):
        payload = self.payload()
        result = self.preview(payload)
        self.assertEqual(self.bench.all('run'), [])
        self.assertEqual(result['dimensions']['task_success']['value'], 1)
        payload['evaluationPreviewId'] = result['previewId']
        payload['dimensions']['task_success'] = observed(0, 'Dato alterato nel client', '0/1')
        saved = self.bench.run(payload)
        self.assertEqual(len(self.bench.all('run')), 1)
        self.assertEqual(saved['answer'], payload['answer'])
        self.assertEqual(saved['dimensions']['tokens'], payload['dimensions']['tokens'])
        self.assertEqual(saved['dimensions']['task_success']['value'], 1)
        self.assertEqual(saved['dimensions']['task_success']['origin'], 'runner')
        self.assertEqual(saved['evaluation']['modelCalls'], 0)
        self.assertNotIn('sourceRunId', saved['evaluation'])
        self.assertNotIn('sourceRunId', saved)

    def test_inspect_preview_rejects_changed_answer_architecture_and_invalid_id(self):
        payload = self.payload()
        result = self.preview(payload)
        for changes in ({'answer':'26'}, {'architectureId':self.trial['architectures'][1]['id']}):
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, 'modificata'):
                self.bench.run({**payload, 'evaluationPreviewId':result['previewId'], **changes})
        for preview_id in ('../output', 'f'*32):
            with self.subTest(preview_id=preview_id), self.assertRaises(ValueError):
                self.bench.run({**payload, 'evaluationPreviewId':preview_id})
        self.assertEqual(self.bench.all('run'), [])

    def test_inspect_failure_and_unsupported_cases_do_not_save_runs(self):
        with patch.object(self.bench, 'inspect_python', return_value=Path(__file__)), \
             patch('suite_benchmarks.subprocess.run', return_value=subprocess.CompletedProcess([], 1, '', 'Errore runner')):
            with self.assertRaisesRegex(ValueError, 'Errore runner'):
                self.bench.preview_score(self.payload())
        coding = next(c for c in self.bench.all('case') if c['key']=='coding-001')
        trial = self.bench.trial({'caseId':coding['id']})
        with self.assertRaisesRegex(ValueError, 'supportati'):
            self.bench.preview_score({**self.payload(), 'trialId':trial['id'], 'architectureId':trial['architectures'][0]['id']})
        self.assertEqual(self.bench.all('run'), [])


if __name__ == '__main__':
    unittest.main()
