import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import suite
import suite_cli


class ProjectlessChatTests(unittest.TestCase):
    def setUp(self):
        work = suite.ROOT / 'tests' / 'tmp'
        work.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=work)
        self.addCleanup(self.temp.cleanup)
        self.app = suite.Suite(Path(self.temp.name) / 'data')

    def test_clean_launches_have_empty_distinct_folders_and_clear_project(self):
        with (
            patch.dict(os.environ, {'PI_SUITE_PROJECT': 'old', 'PI_SUITE_CLEAN_WORKSPACE': 'old'}),
            patch('suite.subprocess.Popen') as launch,
        ):
            first = self.app.open_chat()
            second = self.app.open_chat()
        self.assertIsNone(first['project'])
        self.assertNotEqual(first['folder'], second['folder'])
        self.assertEqual(self.app.settings['projects'], [])
        for result, call in zip((first, second), launch.call_args_list):
            folder = Path(result['folder'])
            self.assertEqual(list(folder.iterdir()), [])
            self.assertEqual(folder.parent, self.app.home / 'chats')
            self.assertEqual(call.kwargs['cwd'], folder)
            self.assertNotIn('PI_SUITE_PROJECT', call.kwargs['env'])
            self.assertEqual(call.kwargs['env']['PI_SUITE_CLEAN_WORKSPACE'], str(folder))

    def test_project_and_dossier_launches_keep_their_context(self):
        project = Path(self.temp.name) / 'project'
        dossier = Path(self.temp.name) / 'dossier'
        project.mkdir()
        dossier.mkdir()
        self.app.settings['projects'] = [{'id': 'demo', 'path': str(project)}]
        with patch.dict(os.environ, {'PI_SUITE_CLEAN_WORKSPACE': 'old'}), patch('suite.subprocess.Popen') as launch:
            result = self.app.open_chat(project_id='demo')
            self.assertEqual(result['folder'], str(project))
            self.assertEqual(launch.call_args.kwargs['env']['PI_SUITE_PROJECT'], 'demo')
            self.assertNotIn('PI_SUITE_CLEAN_WORKSPACE', launch.call_args.kwargs['env'])
            self.app.open_chat(str(dossier), 'Produce documentazione tecnico funzionale')
            self.assertEqual(launch.call_args.kwargs['cwd'], dossier)
            self.assertEqual(launch.call_args.args[0][-1], 'Produce documentazione tecnico funzionale')
            self.assertNotIn('PI_SUITE_CLEAN_WORKSPACE', launch.call_args.kwargs['env'])

    def test_invalid_project_does_not_fall_back_to_clean_chat(self):
        with patch('suite.subprocess.Popen') as launch, self.assertRaisesRegex(ValueError, 'Progetto sconosciuto'):
            self.app.open_chat(project_id='missing')
        launch.assert_not_called()

    def test_cli_keeps_configuration_and_disables_inherited_instructions_only_for_clean_chat(self):
        folder = self.app.home / 'chats' / 'example'
        folder.mkdir(parents=True)
        for roles in (
            {},
            {
                'orchestrator': {'provider': 'local', 'model': 'test', 'effort': 'off'},
                'worker': {'provider': 'local', 'model': 'worker', 'effort': 'off'},
            },
        ):
            self.app.settings['roles'] = roles
            with (
                patch.dict(os.environ, {'PI_SUITE_CLEAN_WORKSPACE': str(folder)}),
                patch('suite_cli.Suite', return_value=self.app),
                patch.object(self.app, 'validate_profiles'),
                patch.object(self.app, 'secret_environment', side_effect=lambda: os.environ.copy()),
                patch('suite_cli.sys.argv', ['pi']),
                patch('suite_cli.Path.cwd', return_value=folder),
                patch('suite_cli.subprocess.call', return_value=0) as launch,
                self.assertRaises(SystemExit),
            ):
                suite_cli.main()
            command = launch.call_args.args[0]
            self.assertIn('--no-context-files', command)
            self.assertIn('--extension', command)
            self.assertIn('--skill', command)
            if roles:
                self.assertEqual(command[command.index('--model') + 1], 'test')
            else:
                self.assertNotIn('--model', command)
            session = Path(launch.call_args.kwargs['env']['PI_CODING_AGENT_DIR'])
            config = json.loads((session / 'suite-launch.json').read_text())
            self.assertEqual(config['worker'], roles.get('worker'))
            self.assertTrue(config['skills'])
            self.assertTrue((session / 'models.json').exists())
        with (
            patch.dict(os.environ, {'PI_SUITE_CLEAN_WORKSPACE': str(folder)}),
            patch('suite_cli.Suite', return_value=self.app),
            patch.object(self.app, 'validate_profiles'),
            patch.object(self.app, 'secret_environment', side_effect=lambda: os.environ.copy()),
            patch('suite_cli.sys.argv', ['pi']),
            patch('suite_cli.subprocess.call', return_value=0) as launch,
            self.assertRaises(SystemExit),
        ):
            suite_cli.main()
        self.assertNotIn('--no-context-files', launch.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
