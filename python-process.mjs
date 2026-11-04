// Processi Python della suite avviati dall'estensione e dagli strumenti: interprete, timeout, annullamento e limiti in
// un solo posto. Restituisce codice di uscita, stdout e la parte finale di stderr; il chiamante ne interpreta l'esito.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const pythonPath = (executable = 'python.exe') =>
  process.env.PI_SUITE_PYTHON || path.join(root, '.venv', 'Scripts', executable);

export function runPython(
  script,
  args = [],
  {
    input = '',
    timeoutMs,
    timeoutMessage = 'Operazione scaduta',
    abortMessage = 'Operazione interrotta',
    signal,
    stderrTail = 6000,
    maxOutput = 16000000
  } = {}
) {
  const python = pythonPath();
  if (!fs.existsSync(python)) return Promise.reject(Error('Runtime Python assente. Esegui Install.cmd.'));
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(root, script), ...args], {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' }
    });
    let stdout = '',
      stderr = '',
      settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => {
      child.kill();
      finish(Error(abortMessage));
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(Error(timeoutMessage));
    }, timeoutMs);
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (stdout.length > maxOutput) {
        child.kill();
        finish(Error('Risultato troppo grande: restringi la richiesta'));
      }
    });
    child.stderr.on('data', chunk => (stderr = (stderr + chunk.toString('utf8')).slice(-stderrTail)));
    child.on('error', error => finish(error));
    child.stdin.on('error', () => {});
    child.on('close', code => finish(null, { code, stdout, stderr }));
    child.stdin.end(input);
  });
}
