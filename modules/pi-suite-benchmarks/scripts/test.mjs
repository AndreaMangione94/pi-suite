import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const python = process.env.PI_SUITE_TEST_PYTHON || 'python';
const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PYTHONPATH: path.join(root, 'python'), PYTHONUTF8: '1' }
});
process.exit(result.status ?? 1);
