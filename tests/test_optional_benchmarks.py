import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import suite
import suite_benchmarks


class OptionalBenchmarkTests(unittest.TestCase):
    def setUp(self):
        work = Path(__file__).parent / 'tmp'
        work.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=work)
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)

    def test_missing_dependency_does_not_load_the_export_source(self):
        with patch.object(suite_benchmarks, 'PACKAGE_ROOT', self.home / 'missing-package'):
            self.assertIsNone(suite_benchmarks.load())
            with self.assertRaisesRegex(ImportError, 'dipendenza npm'):
                suite_benchmarks.require()

    def test_suite_runs_without_benchmarks_and_preserves_existing_data(self):
        database = self.home / 'benchmarks.sqlite'
        previous = b'Existing benchmark data must remain untouched'
        database.write_bytes(previous)
        with patch.object(suite, 'load_benchmarks', return_value=None):
            app = suite.Suite(self.home)
        self.assertIsNone(app.benchmarks)
        self.assertEqual(database.read_bytes(), previous)
        server = suite.Server(('127.0.0.1', 0), app, 'optional-test')
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        try:
            request = urllib.request.Request(origin + '/api/state', headers={'X-Suite-Token': 'optional-test'})
            with urllib.request.urlopen(request) as response:
                self.assertFalse(json.load(response)['modules']['benchmarks'])
            with urllib.request.urlopen(origin) as response:
                html = response.read().decode()
            self.assertNotIn('data-page="benchmarks"', html)
            self.assertNotIn('/modules/benchmarks/', html)
            for route in ('/api/benchmarks', '/modules/benchmarks/benchmark-panel.js', '/benchmark.css'):
                request = urllib.request.Request(origin + route, headers={'X-Suite-Token': 'optional-test'})
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(request)
                self.assertEqual(error.exception.code, 404)
            self.assertEqual(database.read_bytes(), previous)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
