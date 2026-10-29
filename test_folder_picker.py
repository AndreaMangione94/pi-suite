import threading
import unittest
from unittest.mock import patch

from suite import Suite


class FolderPickerTests(unittest.TestCase):
    def setUp(self):
        self.app = Suite.__new__(Suite)
        self.app.picker_guard = threading.Lock()

    def test_contexts_unicode_and_cancellation(self):
        for context in ('project', 'source', 'dossier'):
            with self.subTest(context=context), patch('suite.choose_folder', return_value='C:\\dati è\\documenti') as picker:
                self.assertEqual(self.app.pick_folder({'context': context, 'initialPath': 'C:\\dati è'}),
                                 {'path': 'C:\\dati è\\documenti'})
                self.assertEqual(picker.call_args.args[0], 'C:\\dati è')
        with patch('suite.choose_folder', return_value=''):
            self.assertEqual(self.app.pick_project_folder(), {'path': ''})

    def test_failure_releases_picker(self):
        with patch('suite.choose_folder', side_effect=OSError('unavailable')):
            with self.assertRaises(OSError):
                self.app.pick_folder()
        with patch('suite.choose_folder', return_value=''):
            self.assertEqual(self.app.pick_folder(), {'path': ''})

    def test_only_one_native_dialog_at_a_time(self):
        opened, finish = threading.Event(), threading.Event()
        def picker(*args):
            opened.set()
            finish.wait(5)
            return ''
        with patch('suite.choose_folder', side_effect=picker):
            worker = threading.Thread(target=self.app.pick_folder)
            worker.start()
            try:
                self.assertTrue(opened.wait(5))
                with self.assertRaisesRegex(ValueError, 'già aperto'):
                    self.app.pick_folder({'context': 'source'})
            finally:
                finish.set()
                worker.join(5)
        self.assertFalse(self.app.picker_guard.locked())

    def test_reject_invalid_requests_before_opening_native_dialog(self):
        with patch('suite.choose_folder') as picker:
            for data in ({'context': []}, {'context': 'other'}, {'initialPath': []},
                         {'initialPath': 'x\0y'}, {'initialPath': 'x' * 32768}):
                with self.subTest(data=str(data)[:80]), self.assertRaises(ValueError):
                    self.app.pick_folder(data)
            picker.assert_not_called()


if __name__ == '__main__':
    unittest.main()
