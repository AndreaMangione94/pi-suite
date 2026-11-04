// Python di sviluppo: PI_SUITE_TEST_PYTHON, poi .venv del repository, poi python nel PATH.
// Da riga di comando esegue Python con gli argomenti dati: node scripts/python.mjs -m ruff format .
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const python =
  process.env.PI_SUITE_TEST_PYTHON ||
  [path.join(repo, '.venv', 'Scripts', 'python.exe'), path.join(repo, '.venv', 'bin', 'python')].find(fs.existsSync) ||
  'python';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(spawnSync(python, process.argv.slice(2), { cwd: repo, stdio: 'inherit' }).status ?? 1);
