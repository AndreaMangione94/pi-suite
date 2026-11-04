import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from pi_suite_benchmarks import API_VERSION, Benchmarks, asset
from pi_suite_benchmarks.inspect_adapter import supported


class PublicApiTests(unittest.TestCase):
    def setUp(self):
        self.work = Path(__file__).parent / 'tmp'
        self.work.mkdir(exist_ok=True)

    def test_public_assets_are_allowlisted(self):
        self.assertEqual(API_VERSION, 1)
        for name in ('benchmark-panel.js', 'benchmark.css'):
            self.assertTrue(asset(name).is_file())
        for name in ('../package.json', 'benchmark-catalog.json', 'ledger.py'):
            with self.assertRaises(ValueError):
                asset(name)

    def test_runtime_is_independent_from_the_installed_code(self):
        with tempfile.TemporaryDirectory(dir=self.work) as home:
            home = Path(home).resolve()
            ledger = Benchmarks(home)
            self.assertTrue(ledger.inspect_python().is_relative_to(home / 'benchmark-runtime'))
            runtime = home / 'custom-runtime'
            ledger = Benchmarks(home, runtime=runtime)
            self.assertTrue(ledger.inspect_python().is_relative_to(runtime))
            self.assertEqual(ledger.path, home / 'benchmarks.sqlite')

    def test_inspect_subprocess_loads_the_installed_package_and_writes_to_data(self):
        with tempfile.TemporaryDirectory(dir=self.work) as home:
            ledger = Benchmarks(home)
            case = next(c for c in ledger.all('case') if supported(c))

            def runner(args, **kwargs):
                folder = Path(args[-1]).parent
                self.assertTrue(folder.is_relative_to(Path(home).resolve() / 'benchmark-evaluations'))
                self.assertEqual(kwargs['cwd'], folder)
                self.assertEqual(args[1:3], ['-m', 'pi_suite_benchmarks.inspect_adapter'])
                self.assertTrue((Path(kwargs['env']['PYTHONPATH']) / 'pi_suite_benchmarks').is_dir())
                self.assertEqual(json.loads(Path(args[-2]).read_text())['trial']['case'], case)
                Path(args[-1]).write_text(json.dumps({'dimensions': {}}), encoding='utf-8')
                return subprocess.CompletedProcess(args, 0, '', '')

            with (
                patch.object(ledger, 'inspect_python', return_value=Path(sys.executable)),
                patch('pi_suite_benchmarks.ledger.subprocess.run', side_effect=runner) as process,
            ):
                _, result = ledger._inspect({'id': 'saved-run'}, {'case': case})
            process.assert_called_once()
            self.assertTrue(all(m['status'] == 'unavailable' for m in result['dimensions'].values()))
