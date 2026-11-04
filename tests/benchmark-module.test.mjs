// A packed dependency must work without the module source tree or the rest of Pi Suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { python, repo } from '../scripts/python.mjs';

const work = fs.mkdtempSync(path.join(repo, 'tests', 'tmp', 'benchmark-package-'));
const consumer = path.join(work, 'consumer');
fs.mkdirSync(consumer);
fs.writeFileSync(path.join(consumer, 'package.json'), '{"name":"benchmark-consumer","private":true}');
for (const file of ['suite_benchmarks.py', 'suite_inspect.py'])
  fs.copyFileSync(path.join(repo, file), path.join(consumer, file));
const npmCli =
  process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const moduleSource = [
  path.join(repo, 'node_modules', 'pi-suite-benchmarks'),
  path.join(repo, 'modules', 'pi-suite-benchmarks')
].find(folder => fs.existsSync(path.join(folder, 'package.json')));
if (!moduleSource) {
  console.log('SKIP: sorgenti e dipendenza del modulo benchmark non presenti.');
  process.exit(0);
}

function run(command, args, cwd = consumer) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000,
    env: { ...process.env, PYTHONPATH: '', PYTHONUTF8: '1' }
  });
  assert.equal(result.status, 0, result.stdout + result.stderr + (result.error?.message || ''));
  return result.stdout;
}

const missing = spawnSync(
  python,
  ['-c', 'import suite_benchmarks; assert suite_benchmarks.load() is None; from suite_benchmarks import Benchmarks'],
  { cwd: consumer, encoding: 'utf8' }
);
assert.notEqual(missing.status, 0);
assert.match(missing.stderr, /dipendenza npm/);
const [packed] = JSON.parse(
  run(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', work], moduleSource)
);
assert.ok(packed.files.every(f => !/(__pycache__|\.pyc$|tests\/tmp)/.test(f.path)));
run(process.execPath, [
  npmCli,
  'install',
  '--offline',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  path.join(work, packed.filename)
]);
run(python, [
  '-c',
  `
from pathlib import Path
import suite_benchmarks as bridge
from suite_inspect import supported
root = Path.cwd()
module = bridge.load()
assert module.API_VERSION == 1
assert Path(module.__file__).is_relative_to(root / 'node_modules')
assert bridge.asset('benchmark-panel.js').is_file()
assert bridge.asset('benchmark.css').is_file()
for private in ('../package.json', 'benchmark-catalog.json', 'ledger.py'):
    try:
        bridge.asset(private)
    except ValueError:
        pass
    else:
        raise AssertionError(private)
ledger = bridge.Benchmarks(root / 'data', runtime=root / 'runtime')
assert ledger.inspect_python().is_relative_to(root / 'runtime')
case = ledger.case({'title': 'Standalone package', 'prompt': 'Return 25.'})
assert ledger.request('/api/benchmarks', {}, {}, False)['tests']
assert bridge.Benchmarks(root / 'data').get('case', case['id']) == case
assert sum(supported(c) for c in ledger.all('case')) == 2
assert ledger.runtime == root / 'runtime'
assert not (bridge.PACKAGE_ROOT / '.venv-inspect').exists()
`
]);
run(python, ['suite_inspect.py', '--help']);
console.log('Benchmark: archive installs offline in an isolated host; assets, API, data and Inspect bridge work.');
