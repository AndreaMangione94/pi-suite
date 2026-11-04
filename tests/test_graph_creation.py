import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
import suite
import suite_sources
import suite_workspace as workspace


class CreationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=suite.ROOT / 'tests' / 'tmp')
        self.addCleanup(self.temp.cleanup)
        self.app = suite.Suite(Path(self.temp.name) / 'data')
        self.root = Path(self.temp.name) / 'repo'
        self.root.mkdir()
        self.pid = 'a' * 16
        self.app.settings['projects'] = [{'id': self.pid, 'name': 'Demo', 'path': str(self.root)}]
        self.data = {
            'project': self.pid,
            'name': 'Mio grafo',
            'graphKind': 'project',
            'source': {'kind': 'sharepoint-local', 'path': str(self.root)},
        }

    def sync(self, sid):
        folder = self.app.sources.root / sid / ('b' * 32)
        folder.mkdir(parents=True)
        graph = {
            'createdAt': 1700000000,
            'nodes': [{'id': 'n', 'label': 'Hello', 'source_file': 'hello.py'}],
            'edges': [],
            'stats': {'nodes': 1, 'edges': 0},
            'limits': [],
        }
        suite.save_json(folder / 'graph.json', graph)
        suite.save_json(
            folder / 'manifest.json',
            {
                'id': 'b' * 32,
                'name': 'Mio grafo',
                'documents': [],
                'excluded': [],
                'createdAt': '2026-01-01',
                'revision': '',
            },
        )
        suite.save_json(self.app.sources.root / sid / 'current.json', {'snapshot': 'b' * 32})
        return {'id': 'b' * 32}

    def test_named_code_graphs_survive_reload_and_link_sources(self):
        with patch.object(self.app.sources, 'sync', side_effect=self.sync):
            first = self.app.generate_graph(self.data)
            second = self.app.generate_graph({**self.data, 'name': 'Secondo grafo'})
        rows = workspace.inventory(self.app, self.pid)['graphs']
        self.assertEqual([r['name'] for r in rows], ['Mio grafo', 'Secondo grafo'])
        self.assertNotEqual(first['graph'], second['graph'])
        self.assertEqual(len(workspace.source_references(self.app.settings['projects'][0])), 2)
        self.assertEqual(len(self.app.graph(self.pid, identifier=first['graph'])['nodes']), 1)
        self.assertEqual(len(workspace.saved_graphs(suite.Suite(self.app.home), self.pid)), 2)
        self.assertIn('Hello', workspace.read_file(self.app, self.pid, first['graph'])['text'])
        sources = workspace.prepare_sources(
            self.app, {'project': self.pid, 'graphs': [first['graph']]}, 'prepare-documentation'
        )
        self.assertEqual(sources, [rows[0]['source']])
        with self.assertRaises(ValueError):
            workspace.graph_entry(self.app, self.pid, 'saved:missing')

    def test_failure_does_not_publish_or_link_graph(self):
        with patch.object(self.app.sources, 'sync', side_effect=ValueError('Sync failed')):
            with self.assertRaisesRegex(ValueError, 'Sync failed'):
                self.app.generate_graph(self.data)
        self.assertEqual(workspace.saved_graphs(self.app, self.pid), [])
        self.assertEqual(workspace.source_references(self.app.settings['projects'][0]), [])
        self.data['graphKind'] = 'document'
        with (
            patch.object(self.app, 'document_graph_profile', return_value={}),
            patch.object(self.app.sources, 'sync', side_effect=self.sync),
            patch.object(self.app, 'build_document_graph', side_effect=ValueError('Model failed')),
        ):
            with self.assertRaisesRegex(ValueError, 'Model failed'):
                self.app.generate_graph(self.data)
        self.assertEqual(workspace.saved_graphs(self.app, self.pid), [])
        self.assertEqual(workspace.source_references(self.app.settings['projects'][0]), [])

    def test_concurrent_source_does_not_replace_graph_source(self):
        written, release = threading.Event(), threading.Event()
        update = suite_sources.update_json
        outcome = {}

        def pause_after_write(*args, **kwargs):
            result = update(*args, **kwargs)
            if threading.current_thread().name == 'graph-job':
                written.set()
                if not release.wait(10):
                    raise TimeoutError('Il test non ha sbloccato il job')
            return result

        def generate():
            try:
                outcome['result'] = self.app.generate_graph(self.data)
            except Exception as error:
                outcome['error'] = error

        other = self.root / 'other'
        other.mkdir()
        with (
            patch.object(suite_sources, 'update_json', side_effect=pause_after_write),
            patch.object(self.app.sources, 'sync', side_effect=self.sync),
        ):
            worker = threading.Thread(target=generate, name='graph-job')
            worker.start()
            try:
                self.assertTrue(written.wait(10))
                self.app.sources.save({'name': 'Fonte concorrente', 'kind': 'sharepoint-local', 'path': str(other)})
            finally:
                release.set()
                worker.join(10)
        self.assertFalse(worker.is_alive())
        self.assertNotIn('error', outcome)
        saved = workspace.saved_graphs(self.app, self.pid)[0]
        linked = next(s for s in self.app.sources.connections() if s['id'] == saved['source'])
        self.assertEqual(linked['path'], str(self.root))
        self.assertEqual(linked['name'], self.data['name'])
        self.assertEqual(workspace.source_references(self.app.settings['projects'][0]), [linked['id']])

    def test_document_graph_is_generated_and_retrievable(self):
        (self.root / 'requirements.txt').write_text('REQ-17: Il sistema registra gli ordini.\n', encoding='utf-8')
        data = {**self.data, 'graphKind': 'document'}
        profile = {
            'provider': 'test',
            'model': 'test',
            'effort': 'off',
            'contextWindow': 32000,
            'maxOutputTokens': 4000,
        }
        with (
            patch.object(self.app, 'document_graph_profile', return_value=profile),
            patch.object(self.app, '_document_graph_completion', return_value={'graph': {'nodes': [], 'edges': []}}),
        ):
            result = self.app.generate_graph(data)
        item = workspace.graph_entry(self.app, self.pid, result['graph'])
        self.assertEqual(item['documentCount'], 1)
        stored = suite.document_graph.load_graph(self.app.home, item['reference'])
        self.assertEqual(stored['dependencies'][0]['source'], item['source'])
        queried = suite.document_graph.query_graph(self.app.home, item['reference'], {'query': '', 'limit': 30})
        self.assertTrue(queried['nodes'])

    def test_no_code_and_bad_form_do_not_publish_graph(self):
        with patch.object(self.app.sources, 'sync', return_value={'id': 'c' * 32}):
            with self.assertRaisesRegex(ValueError, 'non contiene codice'):
                self.app.generate_graph(self.data)
        for key, value in [('name', ''), ('graphKind', 'invalid')]:
            with self.assertRaises(ValueError):
                self.app.generate_graph({**self.data, key: value})
        self.assertEqual(workspace.saved_graphs(self.app, self.pid), [])


if __name__ == '__main__':
    unittest.main()
