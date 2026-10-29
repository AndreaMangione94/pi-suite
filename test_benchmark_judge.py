"""Two report boundaries, frozen response association and append-only judge import."""
import copy
import base64
import hashlib
import io
import json
import uuid
import unittest
import zipfile
from pathlib import Path

from suite_benchmarks import Benchmarks, measurements, tested_report, DETERMINISTIC


class JudgeWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.bench = Benchmarks(Path(__file__).parent / '.test-suite' / ('judge-' + uuid.uuid4().hex))
        self.case = next(c for c in self.bench.all('case') if c['key'] == 'math-001')
        self.trial = self.bench.trial({'caseId': self.case['id']})
        dimensions = measurements({})
        dimensions['tokens'] = dict(status='measured', value=120, origin='harness_export',
            measure='Token totali osservati', unit='token', method='Contatore', evidence='usage.json', note='')
        self.report = {'answer': ' 25\n', 'notes': '', 'outcome': 'not_evaluated',
            'dimensions': {key: dimensions[key] for key in ('tokens', 'performance', 'cost')}}
        for metric in self.report['dimensions'].values():
            if metric['origin'] == 'user_report':
                metric['origin'] = 'chat_report'
        self.source = self.bench.run({**self.report, 'trialId': self.trial['id'],
            'architectureId': self.trial['architectures'][0]['id'], 'testedReport': self.report})

    def judge(self, source=None):
        source = source or self.source
        report = self.bench.judge_packet(source['id'])['template']
        report['evaluator']['model'] = 'Fixture judge 1'
        report['dimensions']['relevance'].update(status='measured', value=1,
            evidence='answer: numero richiesto senza testo aggiuntivo', note='1 requisito su 1')
        return report

    def test_tested_model_is_limited_to_observed_costs(self):
        tested_report(self.report)
        for key in ('correctness', 'relevance', 'hallucinations'):
            bad = copy.deepcopy(self.report)
            bad['dimensions'][key] = measurements({})[key]
            with self.subTest(key=key), self.assertRaises(ValueError):
                tested_report(bad)
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.bench.run({**bad, 'trialId': self.trial['id'],
                    'architectureId': self.source['architectureId'], 'testedReport': bad})
        bad = copy.deepcopy(self.report)
        bad['outcome'] = 'passed'
        with self.assertRaises(ValueError):
            tested_report(bad)

    def test_packet_provides_three_files_and_excludes_deterministic_fields(self):
        packet = self.bench.judge_packet(self.source['id'])
        self.assertEqual(len(packet['dimensions']), 10)
        self.assertFalse(set(DETERMINISTIC) & set(packet['dimensions']))
        response = json.loads(packet['responseFile']['content'])
        self.assertEqual(response['answer'], self.report['answer'])
        self.assertEqual(response['answerSha256'], hashlib.sha256(self.report['answer'].encode()).hexdigest())
        self.assertEqual(set(response['dimensions']), {'tokens', 'performance', 'cost'})
        self.assertNotIn(self.case['criteria'], packet['testFile']['content'])
        self.assertIn(self.case['criteria'], packet['instructionsFile']['content'])
        self.assertIn('T0-T3', packet['instructionsFile']['content'])
        self.assertIn('Una sola esecuzione', packet['instructionsFile']['content'])

    def test_preview_does_not_save_and_import_keeps_original_evidence(self):
        report = self.judge()
        payload = {'sourceRunId': self.source['id'], 'report': report}
        preview = self.bench.preview_judge(payload)
        self.assertEqual(preview['dimensions']['relevance']['value'], 1)
        self.assertEqual(len(self.bench.all('run')), 1)
        result = self.bench.import_judge(payload)
        self.assertEqual(len(self.bench.all('run')), 2)
        for key in ('answer', 'attachments', 'notes', 'outcome', 'architecture', 'trialId', 'architectureId', 'caseVersion'):
            self.assertEqual(result[key], self.source[key])
        for key in ('tokens', 'performance', 'cost', *DETERMINISTIC):
            self.assertEqual(result['dimensions'][key], self.source['dimensions'][key])
        self.assertEqual(result['sourceRunId'], self.source['id'])
        self.assertEqual(result['dimensions']['relevance']['origin'], 'model_judge')
        self.assertIn('Fixture judge 1', result['dimensions']['relevance']['method'])
        self.assertEqual(result['judgeEvaluations'][-1]['report'], report)
        self.assertEqual(self.bench.get('run', self.source['id']), self.source)
        self.assertNotIn('relevance', self.bench.judge_packet(result['id'])['dimensions'])

    def test_export_archive_has_one_folder_and_three_complete_resources(self):
        before = self.bench.all('run')
        exported = self.bench.judge_archive(self.source['id'])
        self.assertEqual(exported['mimeType'], 'application/zip')
        self.assertEqual(exported, self.bench.judge_archive(self.source['id']))
        folder = exported['filename'][:-4]
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(exported['base64']))) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(set(archive.namelist()), {folder + '/' + name for name in (
                '01-prova.md', '02-risposta.json', '03-istruzioni-valutatore.md')})
            self.assertEqual(archive.read(folder + '/01-prova.md').decode(), self.bench.case_packet(self.case['id'])['content'])
            response = json.loads(archive.read(folder + '/02-risposta.json'))
            self.assertEqual(response['answer'], self.report['answer'])
            self.assertEqual(response['sourceRunId'], self.source['id'])
            instructions = archive.read(folder + '/03-istruzioni-valutatore.md').decode()
            self.assertIn('Invia questo comando', instructions)
            self.assertIn(self.case['criteria'], instructions)
            self.assertIn(response['answerSha256'], instructions)
            self.assertIn('"reportType": "pi-judge-v1"', instructions)
        self.assertEqual(self.bench.all('run'), before)

    def test_export_disabled_and_server_rejects_missing_resources(self):
        self.assertTrue(self.bench.state()['runs'][0]['judgeExport']['available'])
        trials = []
        for changes in ({'answer': ''}, {'dimensions': {}}, {'caseVersion': 'different'}):
            changed = {**copy.deepcopy(self.source), **changes}
            status = self.bench.judge_export_status(changed, self.trial)
            self.assertFalse(status['available'])
            self.assertTrue(status['reasons'])
        for field, value in (('prompt', ''), ('context', None), ('criteria', ''), ('version', 'different')):
            changed = copy.deepcopy(self.trial)
            changed['case'][field] = value
            self.assertFalse(self.bench.judge_export_status(self.source, changed)['available'])
            trials.append(changed)
        for changed in trials:
            self.bench.put('trial', changed, updating=True)
            self.assertFalse(self.bench.state()['runs'][0]['judgeExport']['available'])
            with self.assertRaisesRegex(ValueError, 'Esportazione non disponibile'):
                self.bench.judge_archive(self.source['id'])

    def test_rejects_wrong_identity_or_changed_answer(self):
        for key in ('reportType', 'sourceRunId', 'trialId', 'architectureId', 'caseVersion', 'answerSha256'):
            report = self.judge()
            report[key] = 'wrong'
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.bench.import_judge({'sourceRunId': self.source['id'], 'report': report})
        other = self.bench.run({**self.report, 'answer': '26', 'trialId': self.trial['id'],
            'architectureId': self.source['architectureId']})
        with self.assertRaises(ValueError):
            self.bench.import_judge({'sourceRunId': other['id'], 'report': self.judge()})
        self.assertEqual(len(self.bench.all('run')), 2)

    def test_rejects_overwrites_missing_dimensions_invalid_origin_and_scale(self):
        mutations = []
        for key in ('tokens', *DETERMINISTIC):
            mutations.append(lambda r, key=key: r['dimensions'].update({key: self.source['dimensions'][key]}))
        mutations += [lambda r: r.update(answer='26'), lambda r: r['dimensions'].pop('relevance'),
            lambda r: r['dimensions']['relevance'].update(value=2),
            lambda r: r['dimensions']['relevance'].update(origin='human_review'),
            lambda r: r['dimensions']['relevance'].update(evidence=''),
            lambda r: r['dimensions']['relevance'].update(method='my scale'),
            lambda r: r['dimensions']['robustness'].update(status='unavailable', value=0),
            lambda r: r['dimensions']['hallucinations'].update(status='measured', value=0.5, evidence='answer')]
        for mutate in mutations:
            report = self.judge()
            mutate(report)
            with self.subTest(report=report), self.assertRaises(ValueError):
                self.bench.import_judge({'sourceRunId': self.source['id'], 'report': report})
        self.assertEqual(len(self.bench.all('run')), 1)

    def test_unsupported_case_lets_judge_assess_unscored_quality(self):
        case = next(c for c in self.bench.all('case') if c['key'] == 'grounding-001')
        trial = self.bench.trial({'caseId': case['id']})
        source = self.bench.run({**self.report, 'trialId': trial['id'], 'architectureId': trial['architectures'][0]['id']})
        packet = self.bench.judge_packet(source['id'])
        self.assertEqual(len(packet['dimensions']), 13)
        report = packet['template']
        report['evaluator']['model'] = 'Fixture judge 1'
        result = self.bench.import_judge({'sourceRunId': source['id'], 'report': report})
        self.assertTrue(all(result['dimensions'][key]['value'] is None for key in packet['dimensions']))

    def test_changed_response_invalidates_judgments_and_unchanged_revision_keeps_them(self):
        result = self.bench.import_judge({'sourceRunId': self.source['id'], 'report': self.judge()})
        payload = {**result, 'sourceRunId': result['id']}
        same = self.bench.run(payload)
        self.assertEqual(same['judgeEvaluations'], result['judgeEvaluations'])
        changed = self.bench.run({**payload, 'answer': '26'})
        self.assertEqual(changed['dimensions']['relevance']['status'], 'unavailable')
        self.assertNotIn('judgeEvaluations', changed)


if __name__ == '__main__':
    unittest.main()
