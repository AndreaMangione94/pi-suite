import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import suite
import suite_workspace as workspace
from suite_documentation_migration import (
    LEGACY,
    PRIMARY_DOCUMENT,
    ASSIGNMENT,
    is_documentation,
    is_primary_document,
    previous_name,
)
from suite_evidence import extract_document, ensure_index, sha


class DocumentationMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=suite.ROOT / 'tests' / 'tmp')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name) / 'data'
        self.app = suite.Suite(self.home)
        self.project = Path(self.temp.name) / 'project'
        self.project.mkdir()
        self.pid = 'a' * 16
        self.dossier = self.home / 'documentation' / 'dossier'
        self.dossier.mkdir(parents=True)
        self.old_graph = next(key for key in LEGACY['identifiers'] if '-graph:' in key) + 'dossier'
        self.old_doc = LEGACY['workspaceKey'] + ':dossier:' + LEGACY['primaryDocument']

    def legacy_state(self):
        self.app.settings['documentationSchema'] = 0
        self.app.settings['enabledSkills'] = list(LEGACY['skills'])
        self.app.settings['projects'] = [
            {
                'id': self.pid,
                'name': 'Demo',
                'path': str(self.project),
                'workspace': {
                    LEGACY['workspaceKey']: {
                        'graphs': [self.old_graph],
                        'documents': [self.old_doc],
                        'sources': [],
                        'name': 'Documentazione ordini',
                    }
                },
            }
        ]
        suite.save_json(self.app.settings_path, self.app.settings)
        suite.save_json(
            self.dossier / 'PROGETTO.json',
            {'project': self.pid, 'name': 'Documentazione ordini', 'graphs': [self.old_graph]},
        )
        suite.save_json(self.dossier / 'FONTI.json', [])
        (self.dossier / LEGACY['primaryDocument']).write_text(
            '# Documento originale\n## Processo ordini\nIl sistema registra ordini.\n', encoding='utf-8'
        )
        (self.dossier / LEGACY['assignment']).write_text(
            'Usa ' + next(iter(LEGACY['skills'])) + ' e ' + next(iter(LEGACY['tools'])) + '.', encoding='utf-8'
        )

    def test_selection_files_skills_and_context_migrate_without_changing_snapshot(self):
        self.legacy_state()
        sid = 'b' * 32
        snapshot = 'c' * 32
        folder = self.app.sources.root / sid / snapshot
        folder.mkdir(parents=True)
        name = LEGACY['primaryDocument']
        raw = (self.dossier / name).read_bytes()
        docid = sha(name.encode())[:20]
        extraction = extract_document(name, raw)
        suite.save_json(folder / (docid + '.map.json'), {k: v for k, v in extraction.items() if k != 'text'})
        (folder / (docid + '.txt')).write_bytes(raw)
        manifest = {
            'id': snapshot,
            'source': sid,
            'name': 'Documento storico',
            'kind': LEGACY['kind'],
            'createdAt': '2026-01-01',
            'revision': 'd' * 64,
            'documents': [
                {
                    'id': docid,
                    'path': name,
                    'sha256': sha(raw),
                    'textSha256': sha(raw),
                    'truncated': False,
                    'mapSha256': sha((folder / (docid + '.map.json')).read_bytes()),
                }
            ],
            'excluded': [],
        }
        suite.save_json(folder / 'manifest.json', manifest)
        info = ensure_index(folder, manifest)
        bundle = [{'source': sid, 'snapshot': snapshot, 'directory': str(folder), 'manifest': manifest}]
        builder = suite.document_graph.DocumentGraphBuilder(
            self.home,
            self.pid,
            bundle,
            {'provider': 'test', 'model': 'test'},
            lambda request: {'graph': {'nodes': [], 'edges': []}},
            self.home / 'job',
            include_documentation=True,
        )
        graph = builder.build()
        ref = {'project': self.pid, 'version': graph['fingerprint']}
        graph_path = suite.document_graph.graph_path(self.home, ref)
        suite.save_json(
            self.home / 'graphs' / self.pid / 'saved.json',
            [
                {
                    'id': self.old_graph,
                    'kind': 'document',
                    'path': str(graph_path),
                    'name': 'Documento storico',
                    'reference': ref,
                    'source': sid,
                    'snapshot': snapshot,
                    'workspace': str(self.dossier),
                    'createdAt': graph['createdAt'],
                }
            ],
        )
        suite.save_json(
            self.home / 'sources' / LEGACY['registry'],
            [{'source': sid, 'snapshot': snapshot, 'workspace': str(self.dossier), 'dependencies': []}],
        )
        suite.save_json(self.home / 'sources' / sid / 'current.json', {'snapshot': snapshot})
        suite.save_json(
            self.home / 'sessions' / 'context-old.json',
            {
                'project': self.app.settings['projects'][0],
                LEGACY['workspaceKey']: [
                    {'id': self.old_doc, 'name': 'Documento storico', 'path': str(self.dossier / name)}
                ],
                'graphs': [],
                'bundle': bundle,
            },
        )
        original_manifest = (folder / 'manifest.json').read_bytes()
        original_graph = graph_path.read_bytes()
        migrated = suite.Suite(self.home)
        files = workspace.inventory(migrated, self.pid)
        context = workspace.chat_context(migrated, self.pid)
        self.assertEqual(len(context['documentation']), 1)
        self.assertEqual(len(context['graphs']), 1)
        self.assertEqual(context['documentation'][0]['id'], 'documentation:dossier:' + PRIMARY_DOCUMENT)
        self.assertTrue((self.dossier / PRIMARY_DOCUMENT).is_file())
        self.assertTrue((self.dossier / ASSIGNMENT).is_file())
        self.assertEqual((self.dossier / PRIMARY_DOCUMENT).read_bytes(), raw)
        self.assertEqual((folder / 'manifest.json').read_bytes(), original_manifest)
        self.assertEqual(graph_path.read_bytes(), original_graph)
        self.assertEqual(suite.document_graph.load_graph(self.home, ref, context['bundle'])['stats']['documents'], 1)
        self.assertEqual(migrated.settings['enabledSkills'], list(LEGACY['skills'].values()))
        self.assertNotIn(LEGACY['workspaceKey'], migrated.settings['projects'][0]['workspace'])
        current = suite.read_json(self.home / 'sessions' / 'context-old.json')
        self.assertIn('documentation', current)
        self.assertEqual(current['documentation'][0]['path'], str(self.dossier / PRIMARY_DOCUMENT))
        self.assertEqual(current['bundle'][0]['manifest']['kind'], LEGACY['kind'])
        self.assertTrue((self.home / 'sources' / 'documentation-registry.json').is_file())
        self.assertEqual(workspace.inventory(suite.Suite(self.home), self.pid), files)

    def test_new_settings_win_when_both_versions_exist(self):
        self.legacy_state()
        self.app.settings['projects'][0]['workspace']['documentation'] = {'sources': [], 'graphs': [], 'documents': []}
        suite.save_json(self.app.settings_path, self.app.settings)
        migrated = suite.Suite(self.home)
        self.assertEqual(migrated.settings['projects'][0]['workspace']['documentation']['graphs'], [])
        self.assertNotIn(LEGACY['workspaceKey'], migrated.settings['projects'][0]['workspace'])

    def test_historical_document_kinds_and_primary_names_remain_readable(self):
        self.assertTrue(is_documentation({'kind': LEGACY['kind']}))
        self.assertTrue(is_documentation({'kind': 'documentation'}))
        self.assertTrue(is_primary_document(LEGACY['primaryDocument']))
        self.assertTrue(is_primary_document(PRIMARY_DOCUMENT))
        self.assertTrue(is_primary_document(previous_name(PRIMARY_DOCUMENT)))
        self.assertFalse(is_documentation({'kind': 'sharepoint-local'}))

    def test_previous_schema_migrates_files_skills_and_selected_documents(self):
        old_document = previous_name(PRIMARY_DOCUMENT)
        old_assignment = previous_name(ASSIGNMENT)
        current_skills = list(LEGACY['skills'].values())
        title = 'Documentazione tecnico funzionale ordini'
        old_id = 'documentation:dossier:' + old_document
        self.app.settings.update(documentationSchema=1, enabledSkills=[previous_name(name) for name in current_skills])
        self.app.settings['projects'] = [
            {
                'id': self.pid,
                'name': 'Demo',
                'path': str(self.project),
                'workspace': {
                    'documentation': {'documents': [old_id], 'name': previous_name(title), 'graphs': [], 'sources': []}
                },
            }
        ]
        suite.save_json(self.app.settings_path, self.app.settings)
        raw = b'# Documento originale\nProcesso ordini.\n'
        (self.dossier / old_document).write_bytes(raw)
        (self.dossier / old_assignment).write_text('Usa ' + previous_name(current_skills[0]) + '.', encoding='utf-8')
        suite.save_json(self.dossier / 'FONTI.json', [])
        suite.save_json(self.dossier / 'PROGETTO.json', {'project': self.pid, 'name': previous_name(title)})
        suite.save_json(self.dossier / 'FINALIZZATO.json', {'sha256': sha(raw), 'graph': 'saved:graph'})
        manifest = {'kind': 'documentation', 'documents': [{'path': old_document, 'sha256': sha(raw)}]}
        bundle = [{'manifest': manifest}]
        context_path = self.home / 'sessions' / 'context-previous.json'
        suite.save_json(
            context_path,
            {'documentation': [{'id': old_id, 'path': str(self.dossier / old_document)}], 'bundle': bundle},
        )
        migrated = suite.Suite(self.home)
        self.assertEqual(migrated.settings['documentationSchema'], 2)
        self.assertEqual(migrated.settings['enabledSkills'], current_skills)
        self.assertEqual((self.dossier / PRIMARY_DOCUMENT).read_bytes(), raw)
        self.assertFalse((self.dossier / old_document).exists())
        self.assertFalse((self.dossier / old_assignment).exists())
        self.assertIn(current_skills[0], (self.dossier / ASSIGNMENT).read_text(encoding='utf-8'))
        selected = workspace.chat_context(migrated, self.pid)['documentation']
        self.assertEqual([item['id'] for item in selected], ['documentation:dossier:' + PRIMARY_DOCUMENT])
        self.assertEqual(selected[0]['name'], title)
        context = suite.read_json(context_path)
        self.assertEqual(context['documentation'][0]['path'], str(self.dossier / PRIMARY_DOCUMENT))
        self.assertEqual(context['bundle'], bundle)
        self.assertEqual(suite.read_json(self.dossier / 'FINALIZZATO.json')['sha256'], sha(raw))
        self.assertEqual(workspace.inventory(suite.Suite(self.home), self.pid), workspace.inventory(migrated, self.pid))


if __name__ == '__main__':
    unittest.main()
