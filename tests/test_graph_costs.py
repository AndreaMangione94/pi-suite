import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import suite
import suite_refresh_graphs
import suite_workspace as workspace


class GraphCostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=suite.ROOT / 'tests' / 'tmp')
        self.addCleanup(self.temp.cleanup)
        self.app = suite.Suite(Path(self.temp.name) / 'data')
        self.profile = {'provider': 'prov', 'model': 'modello'}

    def test_chat_graph_usage_reaches_consumi(self):
        usage = [
            {'input': 100, 'output': 20, 'cacheRead': 5, 'cacheWrite': 0, 'cost': {'total': 0.01}},
            {'input': 50, 'output': 10, 'cacheRead': 0, 'cacheWrite': 0, 'cost': 0.005},
        ]
        with patch.dict(os.environ, {'PI_SUITE_SESSION_ID': ''}):
            self.app.record_session_usage(self.profile, usage)
        self.assertFalse((self.app.home / 'metrics').exists(), 'fuori da una chat non si registra nulla')
        with patch.dict(os.environ, {'PI_SUITE_SESSION_ID': 'sessione-1'}):
            self.app.record_session_usage(self.profile, usage)
        script = (
            "import {summarizeUsage} from './suite-metrics.mjs';"
            f'console.log(JSON.stringify(summarizeUsage({json.dumps(str(self.app.home))},"sessione-1")))'
        )
        result = subprocess.run(
            ['node', '--input-type=module', '-e', script], cwd=suite.ROOT, capture_output=True, text=True, timeout=60
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        graph = json.loads(result.stdout)['graph']
        self.assertEqual((graph['calls'], graph['input'], graph['output']), (2, 150, 30))
        self.assertAlmostEqual(graph['cost'], 0.015)

    def test_project_change_marks_document_graph_without_model_calls(self):
        root = Path(self.temp.name) / 'project'
        root.mkdir()
        (root / 'requisiti.md').write_text('# Ordini\n', encoding='utf-8')
        pid = 'b' * 16
        self.app.settings['projects'] = [{'id': pid, 'name': 'Demo', 'path': str(root)}]
        graph = {'id': 'saved:doc', 'name': 'Grafo', 'kind': 'document', 'path': str(root / 'g.json'), 'reference': {}}
        with (
            patch.object(workspace, 'project_source_id', return_value='locale'),
            patch.object(workspace, 'inventory', return_value={'graphs': [graph], 'documentation': []}),
            patch('suite_document_graph.load_graph', return_value={'dependencies': [{'source': 'locale'}]}),
            patch.object(self.app, 'build_document_graph') as build,
            patch.object(self.app.sources, 'sync') as sync,
        ):
            suite_refresh_graphs.refresh(self.app, root, baseline=True)
            (root / 'requisiti.md').write_text('# Ordini aggiornati\n', encoding='utf-8')
            self.assertEqual(suite_refresh_graphs.refresh(self.app, root), ['saved:doc'])
            build.assert_not_called()
            sync.assert_not_called()
        marker = workspace.stale_markers(self.app, pid)['saved:doc']
        self.assertEqual(marker['path'], graph['path'])
        self.assertIn('progetto è cambiato', marker['reason'])

    def test_dedicated_documentation_process_preserves_session_and_records_costs(self):
        # Processo e bridge reali; si simula soltanto il lavoro documentale che chiamerebbe il modello.
        script = """
import os
from unittest.mock import patch
from suite import Suite
from suite_evidence_cli import main
def document(self, *args, **kwargs):
    self.record_session_usage({'provider':'prov','model':'modello'},
        [{'input':100,'output':20,'cost':{'total':0.01}}])
    return {'session':os.environ.get('PI_SUITE_SESSION_ID'), 'context':os.environ.get('PI_SUITE_CONTEXT')}
with patch.object(Suite, 'finalize_documentation', document), patch.object(Suite, 'prepare_technical_functional_documentation', document):
    main()
"""
        for action in ('prepare_documentation', 'register_documentation'):
            with self.subTest(action=action):
                session = 'session-' + action
                request = {
                    'action': action,
                    'args': {'sources': ['test-source']},
                    'bundle': [],
                    'home': str(self.app.home),
                    'workspace': str(self.app.home),
                }
                result = subprocess.run(
                    [sys.executable, '-c', script],
                    input=json.dumps(request),
                    cwd=suite.ROOT,
                    env={
                        **os.environ,
                        'PYTHONUTF8': '1',
                        'PI_SUITE_SESSION_ID': session,
                        'PI_SUITE_CONTEXT': 'context.json',
                    },
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout), {'session': session, 'context': 'context.json'})
                rows = [
                    json.loads(line)
                    for line in (self.app.home / 'metrics' / (session + '.jsonl')).read_text().splitlines()
                ]
                self.assertEqual(len(rows), 1)
                self.assertEqual((rows[0]['kind'], rows[0]['input'], rows[0]['cost']), ('graph', 100, 0.01))

    def test_worker_replaces_and_clears_request_environment(self):
        script = """
import os
from unittest.mock import patch
from suite_evidence_cli import main
with patch('suite_evidence_cli.query', lambda *args: {name:os.environ.get(name) for name in ('PI_SUITE_SESSION_ID','PI_SUITE_CONTEXT')}):
    main()
"""
        environments = [
            {'PI_SUITE_SESSION_ID': 'first', 'PI_SUITE_CONTEXT': 'first.json'},
            {'PI_SUITE_SESSION_ID': 'second', 'PI_SUITE_CONTEXT': 'second.json'},
            {},
        ]
        requests = [
            {
                'id': i,
                'action': 'knowledge_search',
                'args': {'query': 'x'},
                'bundle': [],
                'home': str(self.app.home),
                'env': env,
            }
            for i, env in enumerate(environments)
        ]
        result = subprocess.run(
            [sys.executable, '-c', script, '--serve'],
            input=''.join(json.dumps(r) + '\n' for r in requests),
            cwd=suite.ROOT,
            env={**os.environ, 'PI_SUITE_SESSION_ID': 'inherited', 'PI_SUITE_CONTEXT': 'inherited.json'},
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([r['id'] for r in responses], [0, 1, 2])
        self.assertEqual(
            [r['result'] for r in responses],
            [
                environments[0],
                environments[1],
                {'PI_SUITE_SESSION_ID': None, 'PI_SUITE_CONTEXT': None},
            ],
        )


if __name__ == '__main__':
    unittest.main()
