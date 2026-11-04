// Esegue tutti i test dalla radice del repository: npm test (oppure node tests/run.mjs [filtro]).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { python, repo } from '../scripts/python.mjs';

const tests = path.join(repo, 'tests'),
  filter = process.argv[2] || '';
fs.mkdirSync(path.join(tests, 'tmp'), { recursive: true });
const files = fs.readdirSync(tests).sort();
const steps = [
  [
    'Sintassi TypeScript',
    process.execPath,
    ['tests/check-ts.mjs', ...fs.readdirSync(repo).filter(f => f.endsWith('.ts'))]
  ],
  ['Python unittest', python, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-t', '.']],
  ...files.filter(f => f.endsWith('.test.py')).map(f => [f, python, ['tests/' + f, '.']]),
  ...files.filter(f => f.endsWith('.test.mjs')).map(f => [f, process.execPath, ['--test', 'tests/' + f]]),
  // test_benchmarks.cjs richiama soltanto test_configurations.cjs.
  ...files
    .filter(f => /^test_.*\.cjs$/.test(f) && f !== 'test_benchmarks.cjs')
    .map(f => [f, process.execPath, ['tests/' + f]])
].filter(([name]) => name.includes(filter));
const failed = [];
for (const [name, command, args] of steps) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1' },
    timeout: 600000
  });
  const ok = result.status === 0;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + ' (' + ((Date.now() - started) / 1000).toFixed(1) + ' s)');
  if (!ok) {
    failed.push(name);
    console.log(
      ((result.stdout || '') + (result.stderr || '') + (result.error?.message || ''))
        .trim()
        .split('\n')
        .slice(-25)
        .join('\n')
    );
  }
}
console.log(
  '\n' +
    (steps.length - failed.length) +
    '/' +
    steps.length +
    ' gruppi di test superati' +
    (failed.length ? ': falliti ' + failed.join(', ') : '')
);
process.exit(failed.length ? 1 : 0);
