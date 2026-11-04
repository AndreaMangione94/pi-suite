import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import suite
import suite_workspace as workspace


class DocumentationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=suite.ROOT / 'tests' / 'tmp')
        self.addCleanup(self.temp.cleanup)
        self.app = suite.Suite(Path(self.temp.name) / 'data')
        self.pid = 'a' * 16
        folder = Path(self.temp.name) / 'project'
        folder.mkdir()
        self.app.settings['projects'] = [{'id': self.pid, 'name': 'Demo', 'path': str(folder)}]

    def test_autosaved_preferences_persist_without_manual_button(self):
        refs = {
            'name': 'documentazione tecnico funzionale ordini',
            'graphs': [],
            'objective': 'Analizza i processi',
            'refreshSources': True,
        }
        self.app.save_project_references(self.pid, 'documentation', refs)
        restored = suite.Suite(self.app.home).settings['projects'][0]['workspace']['documentation']
        for key, value in refs.items():
            self.assertEqual(restored[key], value)
        with self.assertRaises(ValueError):
            self.app.save_project_references(self.pid, 'documentation', {**refs, 'refreshSources': 'yes'})
        with self.assertRaises(ValueError):
            self.app.save_project_references(self.pid, 'documentation', {**refs, 'name': 'x' * 151})

    def test_named_dossier_is_discovered_only_when_documents_exist(self):
        dossier = self.app.home / 'documentation' / 'dossier'
        dossier.mkdir(parents=True)
        suite.save_json(dossier / 'FONTI.json', [])
        (dossier / 'INCARICO-DOCUMENTAZIONE-TECNICO-FUNZIONALE.md').write_text('Incarico', encoding='utf-8')
        self.app.job = {'id': 'test', 'state': 'running'}
        data = {
            'project': self.pid,
            'graphs': ['test-graph'],
            'name': 'documentazione tecnico funzionale ordini',
            'openChat': False,
        }
        with (
            patch.object(workspace, 'prepare_sources', return_value=['source']),
            patch.object(
                self.app,
                'prepare_technical_functional_documentation',
                return_value={'workspace': str(dossier), 'prompt': 'Generate', 'state': 'ready_for_orchestrator'},
            ),
        ):
            self.app._work('prepare-documentation', data)
        self.assertEqual(self.app.job['state'], 'done')
        self.assertEqual(suite.read_json(dossier / 'PROGETTO.json')['name'], 'documentazione tecnico funzionale ordini')
        self.assertEqual(workspace.inventory(self.app, self.pid)['documentation'], [])
        (dossier / 'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md').write_text('# Documento prodotto', encoding='utf-8')
        item = workspace.inventory(self.app, self.pid)['documentation'][0]
        self.assertEqual(item['name'], 'documentazione tecnico funzionale ordini')
        self.assertIn('modifiedAt', item)
        self.assertEqual(workspace.read_file(self.app, self.pid, item['id'])['text'], '# Documento prodotto')
        other = Path(self.temp.name) / 'other'
        other.mkdir()
        self.app.settings['projects'].append({'id': 'b' * 16, 'name': 'Altro', 'path': str(other)})
        self.assertEqual(workspace.inventory(self.app, 'b' * 16)['documentation'], [])
        with self.assertRaises(ValueError):
            workspace.read_file(self.app, 'b' * 16, item['id'])

    def test_generation_failure_does_not_publish_a_named_dossier(self):
        self.app.job = {'id': 'failed', 'state': 'running'}
        with patch.object(workspace, 'prepare_sources', side_effect=ValueError('Grafo non disponibile')):
            self.app._work('prepare-documentation', {'project': self.pid, 'graphs': ['missing'], 'name': 'Fallito'})
        self.assertEqual(self.app.job['state'], 'failed')
        self.assertEqual(workspace.inventory(self.app, self.pid)['documentation'], [])


if __name__ == '__main__':
    unittest.main()
