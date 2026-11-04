import copy
import base64
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile
import unittest

from suite_benchmarks import Benchmarks
from suite_inspect import supported, check_answer


class MinimalCaseTests(unittest.TestCase):
    def setUp(self):
        work = Path(__file__).parent / 'tmp'
        work.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=work)
        self.addCleanup(self.temp.cleanup)
        self.ledger = Benchmarks(self.temp.name)

    def create(self, **values):
        return self.ledger.case({'title': 'Analisi qualità!', 'prompt': 'Rispondi con 25.', **values})

    def run_for(self, case):
        trial = self.ledger.trial({'caseId': case['id']})
        template = json.loads(self.ledger.case_packet(case['id'])['content'].split('Modello da compilare:')[1].split('```json\n')[1].split('```')[0])
        template.update(trialId=trial['id'], architectureId=trial['architectures'][0]['id'], answer='25')
        return trial, self.ledger.run(template)

    def test_minimal_case_generates_readable_unique_ids_without_overwriting(self):
        first, second = self.create(), self.create()
        self.assertEqual(first['id'], 'analisi-qualita')
        self.assertEqual(first['key'], first['id'])
        self.assertEqual(second['id'], 'analisi-qualita-2')
        self.assertEqual(first, self.ledger.get('case', first['id']))
        self.assertEqual(first['family'], 'Generale')
        for key in ('criteria', 'setup', 'sourceNotes', 'context'):
            self.assertEqual(first[key], '')

    def test_concurrent_saves_and_existing_catalog_codes_do_not_collide(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            cases = list(pool.map(lambda _: self.create(title='math-001'), range(4)))
        self.assertEqual({c['id'] for c in cases}, {'math-001-2', 'math-001-3', 'math-001-4', 'math-001-5'})

    def test_non_ascii_titles_have_a_safe_fallback(self):
        self.assertEqual(self.create(title='試験')['id'], 'caso')
        self.assertEqual(self.create(title='試験')['id'], 'caso-2')

    def test_required_fields_and_lengths_are_checked_without_creating_cases(self):
        count = len(self.ledger.all('case'))
        for values in ({'title': ' '}, {'prompt': ''}, {'title': 'a' * 151}, {'family': 'a' * 101}):
            with self.assertRaises(ValueError):
                self.create(**values)
        self.assertEqual(len(self.ledger.all('case')), count)

    def test_optional_context_and_category_survive_packet_and_trial_snapshot(self):
        case = self.create(context='Dati forniti: 25.', family='Categoria nuova')
        trial, run = self.run_for(case)
        self.assertEqual(trial['case']['family'], 'Categoria nuova')
        self.assertIn('Dati forniti: 25.', self.ledger.case_packet(case['id'])['content'])
        self.assertEqual(run['caseVersion'], case['version'])
        self.create(context='Dati differenti')
        self.assertEqual(self.ledger.get('trial', trial['id'])['case'], case)
        self.assertFalse(supported(case))

    def test_judge_export_and_import_work_without_criteria(self):
        case = self.create()
        trial, run = self.run_for(case)
        self.assertTrue(self.ledger.judge_export_status(run, trial)['available'])
        packet = self.ledger.judge_packet(run['id'])
        instructions = packet['instructionsFile']['content']
        self.assertIn('Valuta liberamente', instructions)
        self.assertNotIn('## Criteri riservati', instructions)
        report = copy.deepcopy(packet['template'])
        report['evaluator']['model'] = 'Test judge'
        for metric in report['dimensions'].values():
            metric['note'] = 'Non verificabile nella prova di integrazione.'
        judged = self.ledger.import_judge({'sourceRunId': run['id'], 'report': report})
        self.assertEqual(judged['answer'], run['answer'])
        self.assertEqual(judged['sourceRunId'], run['id'])
        self.assertTrue(self.ledger.judge_archive(run['id'])['base64'])

    def test_original_inspect_cases_keep_versions_and_expected_answers(self):
        cases = [c for c in self.ledger.all('case') if supported(c)]
        self.assertEqual({c['key'] for c in cases}, {'math-001', 'extract-001'})
        for case in cases:
            expected = json.loads(case['criteria'])['expected']
            answer = str(expected) if case['key'] == 'math-001' else json.dumps(expected)
            self.assertEqual(check_answer(case, answer)[0]['task_success'], 1)
            _, run = self.run_for(case)
            self.assertNotIn('task_success', self.ledger.judge_packet(run['id'])['dimensions'])

    def test_composer_defaults_to_no_catalog_write_and_saves_only_when_requested(self):
        count = len(self.ledger.all('case'))
        payload = {'title': 'Prova composta', 'prompt': 'Restituisci 25.'}
        packet = self.ledger.compose_case(payload)
        self.assertFalse(packet['savedToCatalog'])
        self.assertEqual(len(self.ledger.all('case')), count)
        self.assertIn(packet['case']['id'], packet['content'])
        self.assertIn(payload['prompt'], packet['content'])
        reopened = Benchmarks(self.temp.name)
        self.assertEqual(reopened.case_packet(packet['case']['id'])['content'],packet['content'])
        self.assertIn(packet['case']['id'],{c['id'] for c in reopened.state()['tests']})
        saved = self.ledger.compose_case({**payload, 'saveToCatalog': True})
        self.assertTrue(saved['savedToCatalog'])
        self.assertEqual(len(self.ledger.all('case')), count + 1)
        self.assertEqual(self.ledger.get('case', saved['case']['id']), saved['case'])
        with self.assertRaises(ValueError):
            self.ledger.compose_case({**payload, 'saveToCatalog': 'false'})

    def test_unsaved_case_supports_trial_restart_download_and_judging(self):
        count = len(self.ledger.all('case'))
        packet = self.ledger.compose_case({'title': 'Solo file', 'prompt': 'Restituisci 25.'})
        case = packet['case']
        trial = self.ledger.trial({'caseId': case['id'], 'caseSnapshot': case})
        self.assertEqual(len(self.ledger.all('case')), count)
        self.assertEqual(self.ledger.packet(trial['id'], trial['architectures'][0]['id'])['content'], packet['content'])
        self.ledger = Benchmarks(self.temp.name)
        trial = self.ledger.trial({'id': trial['id'], 'savedAt': trial['savedAt'], 'caseId': case['id']})
        self.assertEqual(trial['case'], case)
        report = json.loads(packet['content'].split('Modello da compilare:')[1].split('```json\n')[1].split('```')[0])
        report.update(trialId=trial['id'], architectureId=trial['architectures'][0]['id'], answer='25')
        run = self.ledger.run(report)
        self.assertTrue(self.ledger.judge_export_status(run, trial)['available'])
        self.assertTrue(self.ledger.judge_archive(run['id'])['base64'])
        regenerated = self.ledger.request('/api/benchmarks/case-packet', {'case': trial['case']}, {}, True)
        self.assertEqual(regenerated['content'], packet['content'])
        self.assertEqual(len(self.ledger.all('case')), count)

    def test_composed_case_rejects_changed_contents_and_mismatching_ids(self):
        case = self.ledger.compose_case({'title': 'Bozza', 'prompt': 'Rispondi 25.'})['case']
        with self.assertRaises(ValueError):
            self.ledger.trial({'caseId': case['id'], 'caseSnapshot': {**case, 'prompt': 'Cambiato'}})
        with self.assertRaises(ValueError):
            self.ledger.trial({'caseId': 'altro', 'caseSnapshot': case})

    def configuration_run(self, case, config, tokens=100):
        context = self.ledger.execution_context({'caseId':case['id'], 'caseSnapshot':case, 'architectureId':config['id']})
        report = json.loads(self.ledger._case_packet(case)['content'].split('Modello da compilare:')[1].split('```json\n')[1].split('```')[0])
        report.update(trialId=context['id'], architectureId=config['id'], answer='25')
        report['dimensions']['tokens'].update(status='measured', value=tokens, method='counter-v1', evidence='Trace usage', note='Intera esecuzione')
        return context, self.ledger.run(report)

    def test_configuration_test_relation_supports_many_configurations_and_many_tests(self):
        cases = [self.create(title='Prima prova'), self.create(title='Seconda prova')]
        configs = [self.ledger.architecture({'name':f'Configurazione {n}'}) for n in range(3)]
        runs = []
        for case in cases:
            for index, config in enumerate(configs):
                context, run = self.configuration_run(case, config, index+100)
                self.assertEqual(context['format'], 'configuration-test-v1')
                self.assertEqual(len(context['architectures']), 1)
                self.assertEqual(self.ledger.execution_context({'caseId':case['id'], 'architectureId':config['id']})['id'], context['id'])
                runs.append(run)
        state = self.ledger.state()
        self.assertEqual(len(state['configurations']), 3)
        for config in configs:
            self.assertEqual(len({r['caseId'] for r in state['runs'] if r['architectureId']==config['id']}), 2)
        result = self.ledger.compare_many({'caseId':cases[0]['id'], 'runIds':[r['id'] for r in runs[:3]]})
        self.assertEqual(len(result['runs']), 3)
        tokens = next(row for row in result['rows'] if row['id']=='tokens')
        self.assertTrue(tokens['comparable'])
        self.assertEqual([m['value'] for m in tokens['values']], [100,101,102])
        with self.assertRaises(ValueError):
            self.ledger.compare_many({'caseId':cases[0]['id'], 'runIds':[runs[0]['id'], runs[4]['id']]})
        _, revision = self.configuration_run(cases[0], configs[0], 999)
        with self.assertRaises(ValueError):
            self.ledger.compare_many({'caseId':cases[0]['id'], 'runIds':[runs[0]['id'], revision['id']]})

    def test_saved_multi_comparison_freezes_selected_runs_and_reports_incomparable_values(self):
        case = self.create()
        configs = [self.ledger.architecture({'name':f'Modello {i}'}) for i in range(3)]
        runs = [self.configuration_run(case, config, i+10)[1] for i, config in enumerate(configs)]
        changed = copy.deepcopy(runs[-1]);changed.pop('id');changed.pop('savedAt')
        changed['dimensions']['tokens']['method'] = 'counter-v2'
        runs[-1] = self.ledger.run(changed)
        saved = self.ledger.save_comparison({'caseId':case['id'], 'runIds':[r['id'] for r in runs]})
        self.configuration_run(case, configs[0], 777)
        result = self.ledger.saved_comparison(saved['id'])
        self.assertEqual([r['id'] for r in result['runs']], [r['id'] for r in runs])
        self.assertFalse(next(row for row in result['rows'] if row['id']=='tokens')['comparable'])
        self.assertEqual(next(row for row in result['rows'] if row['id']=='tokens')['values'][0]['value'],10)
        self.assertEqual(self.ledger.state()['comparisons'][0]['format'],'multi-configuration-v1')

    def test_configuration_edits_keep_historical_result_snapshots(self):
        case = self.create()
        config = self.ledger.architecture({'name':'Configurazione', 'model':'prima'})
        first_context, run = self.configuration_run(case, config)
        config = self.ledger.architecture({**config, 'model':'seconda'})
        second_context, second_run = self.configuration_run(case, config)
        self.assertNotEqual(first_context['id'],second_context['id'])
        self.assertEqual(self.ledger.get('run',run['id'])['architecture']['model'],'prima')
        self.assertEqual(second_run['architecture']['model'],'seconda')
        self.assertTrue(self.ledger.judge_export_status(second_run,second_context)['available'])

    def test_legacy_trials_remain_visible_without_rewriting_records(self):
        case = self.create()
        trial, run = self.run_for(case)
        before = copy.deepcopy(trial)
        state = self.ledger.state()
        self.assertIn(run['architectureId'], {c['id'] for c in state['configurations']})
        self.assertEqual(next(r for r in state['runs'] if r['id']==run['id'])['caseId'],case['id'])
        self.assertEqual(self.ledger.get('trial',trial['id']),before)


class FilePipelineTests(unittest.TestCase):
    setUp = MinimalCaseTests.setUp
    create = MinimalCaseTests.create
    def file_upload(self, case, config, report, raw=None, filename='risultato.json'):
        raw = raw if raw is not None else json.dumps(report, ensure_ascii=False, indent=2).encode('utf-8')
        importer = self.ledger.import_evaluation_file if report.get('reportType')=='pi-judge-v1' else self.ledger.import_result_file
        return importer({'caseId':case['id'], 'caseSnapshot':case,
            'architectureId':config['id'], 'filename':filename, 'base64':base64.b64encode(raw).decode()})

    def initial_file(self, case, answer='25'):
        content = self.ledger._case_packet(case)['content']
        report = json.loads(content.split('Modello da compilare:')[1].split('```json\n')[1].split('```')[0])
        report['answer'] = answer
        return report

    def evaluated_file(self, source):
        _, report = self.ledger.evaluation_file_template(source['id'])
        report['evaluator'] = {'model':'Giudice di test', 'notes':'Test'}
        report['notes'] = 'Risposta valutata rispetto al compito.'
        for key in report['dimensions']:
            report['dimensions'][key]['note'] = 'Evidenze insufficienti per questa dimensione.'
        report['dimensions']['relevance'].update(status='measured', value=0.75,
            evidence='Risposta originale, primo campo', note='Tre requisiti su quattro.')
        return report

    def test_complete_file_roundtrip_preserves_original_and_applies_deterministic_checks(self):
        case = next(c for c in self.ledger.all('case') if c['key']=='math-001')
        config = self.ledger.architecture({'name':'Configurazione file'})
        report = self.initial_file(case)
        raw = b'\xef\xbb\xbf' + json.dumps(report, ensure_ascii=False, indent=4).replace('\n','\r\n').encode('utf-8')
        first = self.file_upload(case, config, report, raw=raw)
        self.assertEqual(base64.b64decode(first['sourceFile']['base64']),raw)
        self.assertTrue(all(first['dimensions'][key]['value']==1 for key in ('task_success','correctness','constraints')))
        request = self.ledger.evaluation_request(first['id'])
        self.assertIn(raw.decode('utf-8'),request['content'])
        self.assertIn('un solo file JSON',request['content'])
        self.assertNotIn('tre file',request['content'])
        self.assertIn('Misure e controlli già registrati',request['content'])
        self.assertIn('"correctness": {',request['content'])
        evaluated = self.evaluated_file(first)
        self.assertNotIn('answer',evaluated)
        self.assertNotIn('correctness',evaluated['dimensions'])
        self.assertNotIn('tokens',evaluated['dimensions'])
        second = self.file_upload(case,config,evaluated,filename='valutato.json')
        self.assertEqual(second['sourceRunId'],first['id'])
        self.assertEqual(second['answer'],first['answer'])
        self.assertEqual(second['dimensions']['relevance']['value'],0.75)
        self.assertEqual(second['sourceFile'],first['sourceFile'])
        self.assertEqual(json.loads(base64.b64decode(second['evaluationFile']['base64'])),evaluated)
        for key in ('task_success','correctness','constraints','tokens','performance','cost'):
            self.assertEqual(second['dimensions'][key],first['dimensions'][key])

    def test_rejects_manual_text_incomplete_reports_and_wrong_associations_without_saving(self):
        case = self.create()
        config = self.ledger.architecture({'name':'File only'})
        report = self.initial_file(case)
        before = (len(self.ledger.all('trial')),len(self.ledger.all('run')))
        for changed in ({**report, 'caseVersion':'errata'}, {**report, 'dimensions':{}}, {**report, 'reportType':'altro'}):
            with self.assertRaises(ValueError):
                self.file_upload(case,config,changed)
        with self.assertRaises(ValueError):
            self.file_upload(case,config,report,filename='messaggio.md')
        with self.assertRaises(ValueError):
            self.file_upload(case,config,report,raw=b'```json\n{}\n```')
        with self.assertRaises(ValueError):
            self.file_upload(case,config,report,raw=b'{"answer":"a", "answer":"b"}')
        self.assertEqual((len(self.ledger.all('trial')),len(self.ledger.all('run'))),before)

    def test_evaluated_file_cannot_rewrite_answer_metrics_or_source_hash(self):
        case = next(c for c in self.ledger.all('case') if c['key']=='math-001')
        config = self.ledger.architecture({'name':'Protetta'})
        first = self.file_upload(case,config,self.initial_file(case))
        evaluated = self.evaluated_file(first)
        changes = []
        wrong = copy.deepcopy(evaluated);wrong['answer']='26';changes.append(wrong)
        wrong = copy.deepcopy(evaluated);wrong['dimensions']['correctness']=first['dimensions']['correctness'];changes.append(wrong)
        wrong = copy.deepcopy(evaluated);wrong['dimensions']['tokens']=first['dimensions']['tokens'];changes.append(wrong)
        wrong = copy.deepcopy(evaluated);wrong['answerSha256']='altro';changes.append(wrong)
        for changed in changes:
            with self.assertRaises(ValueError):
                self.file_upload(case,config,changed)
        other = self.ledger.architecture({'name':'Altra configurazione'})
        with self.assertRaises(ValueError):
            self.file_upload(case,other,evaluated)
        self.assertEqual(len(self.ledger.all('run')),1)
        data={'caseId':case['id'],'caseSnapshot':case,'architectureId':config['id'],'filename':'giudizio.json','base64':base64.b64encode(json.dumps(evaluated).encode()).decode()}
        with self.assertRaises(ValueError):
            self.ledger.import_result_file(data)
        data['base64']=base64.b64encode(json.dumps(self.initial_file(case)).encode()).decode()
        with self.assertRaises(ValueError):
            self.ledger.import_evaluation_file(data)

    def test_custom_case_leaves_quality_to_judge_and_failure_report_still_exports(self):
        case = self.create()
        config = self.ledger.architecture({'name':'Personalizzata'})
        source = self.file_upload(case,config,self.initial_file(case))
        for key in ('task_success','correctness','constraints'):
            self.assertEqual(source['dimensions'][key]['status'],'unavailable')
        self.assertIn('task_success',self.ledger.evaluation_file_template(source['id'])[1]['dimensions'])
        failed = self.initial_file(case,answer='');failed.update(outcome='failed',notes='Risorsa non accessibile.')
        result = self.file_upload(case,config,failed)
        self.assertTrue(self.ledger.evaluation_request(result['id'])['content'])


if __name__ == '__main__':
    unittest.main()
