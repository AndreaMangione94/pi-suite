import json
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

import suite
import suite_storage as storage
import suite_workspace as workspace


class MergeTests(unittest.TestCase):
    def test_changes_from_both_sides_survive(self):
        base = {'maxCalls': 24, 'projects': [{'id': 'a', 'name': 'A', 'workspace': {}}], 'roles': {}}
        mine = {'maxCalls': 30, 'projects': [{'id': 'a', 'name': 'A', 'workspace': {}}], 'roles': {}}
        theirs = {
            'maxCalls': 24,
            'projects': [{'id': 'a', 'name': 'A', 'workspace': {'documentation': {'graphs': ['g']}}}],
            'roles': {},
        }
        self.assertEqual(
            storage.merge_changes(base, mine, theirs),
            {
                'maxCalls': 30,
                'projects': [{'id': 'a', 'name': 'A', 'workspace': {'documentation': {'graphs': ['g']}}}],
                'roles': {},
            },
        )

    def test_keyed_lists_merge_additions_and_removals(self):
        base = [{'id': 'a'}, {'id': 'b'}]
        mine = [{'id': 'a'}, {'id': 'b'}, {'id': 'c'}]
        theirs = [{'id': 'a'}, {'id': 'd'}]
        self.assertEqual(storage.merge_changes(base, mine, theirs), [{'id': 'a'}, {'id': 'd'}, {'id': 'c'}])
        # Rimosso da una parte e modificato dall'altra: si conserva la modifica.
        self.assertEqual(storage.merge_changes([{'id': 'a', 'v': 1}], [], [{'id': 'a', 'v': 2}]), [{'id': 'a', 'v': 2}])

    def test_conflicts_and_plain_lists_prefer_mine(self):
        self.assertEqual(storage.merge_changes({'x': 1}, {'x': 2}, {'x': 3}), {'x': 2})
        self.assertEqual(storage.merge_changes({'l': [1]}, {'l': [1, 2]}, {'l': [1, 3]}), {'l': [1, 2]})
        self.assertEqual(storage.merge_changes({}, {'k': {'a': 1}}, {'k': {'b': 2}}), {'k': {'a': 1, 'b': 2}})


class SharedFilesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=suite.ROOT / 'tests' / 'tmp')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name) / 'data'

    def test_two_processes_saving_settings_do_not_lose_updates(self):
        panel = suite.Suite(self.home)
        panel.settings['projects'] = [{'id': 'p' * 16, 'name': 'Demo', 'path': str(self.home)}]
        panel.save_settings_file()
        chat = suite.Suite(self.home)  # un altro processo, con la propria copia in memoria
        workspace.project_record(chat, 'p' * 16)['workspace'] = {'documentation': {'graphs': ['saved:doc']}}
        chat.save_settings_file()
        panel.settings['maxCalls'] = 40  # il pannello non ha riletto il file
        panel.save_settings_file()
        disk = suite.read_json(self.home / 'settings.json')
        self.assertEqual(disk['maxCalls'], 40)
        self.assertEqual(disk['projects'][0]['workspace'], {'documentation': {'graphs': ['saved:doc']}})
        self.assertEqual(panel.settings, disk)

    def test_suite_start_does_not_rewrite_unchanged_settings(self):
        suite.Suite(self.home)
        path = self.home / 'settings.json'
        before = path.stat().st_mtime_ns
        suite.Suite(self.home)
        self.assertEqual(path.stat().st_mtime_ns, before)

    def test_public_settings_reload_changes_from_other_processes(self):
        panel = suite.Suite(self.home)
        other = suite.Suite(self.home)
        other.settings['delegationPolicy'] = 'always'
        other.save_settings_file()
        self.assertEqual(panel.public_settings()['delegationPolicy'], 'always')

    def test_update_json_serializes_threads_and_processes(self):
        path = self.home / 'counter.json'

        def increment(value):
            value['n'] += 1

        threads = [
            threading.Thread(target=lambda: [storage.update_json(path, increment, {'n': 0}) for _ in range(25)])
            for _ in range(4)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        script = (
            'import sys;sys.path.insert(0,sys.argv[1]);import suite_storage as s\n'
            'for _ in range(25):s.update_json(sys.argv[2],lambda v:v.update(n=v["n"]+1),{"n":0})'
        )
        processes = [subprocess.Popen([sys.executable, '-c', script, str(suite.ROOT), str(path)]) for _ in range(4)]
        self.assertEqual([p.wait(timeout=120) for p in processes], [0] * 4)
        self.assertEqual(json.loads(path.read_text(encoding='utf-8'))['n'], 200)


if __name__ == '__main__':
    unittest.main()
