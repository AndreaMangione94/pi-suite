// Processi Python della suite avviati dall'estensione e dagli strumenti: interprete, timeout, annullamento e limiti in
// un solo posto. Restituisce codice di uscita, stdout e la parte finale di stderr; il chiamante ne interpreta l'esito.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const pythonPath = (executable = 'python.exe') =>
  process.env.PI_SUITE_PYTHON || path.join(root, '.venv', 'Scripts', executable);

// Worker persistenti (suite_evidence_cli.py --serve) per le consultazioni brevi delle evidenze: evitano circa 150 ms di
// avvio di Python a ogni chiamata. Ogni worker serve una richiesta alla volta; scadenza, annullamento o risposta
// illeggibile chiudono quel worker, che si ricrea alla richiesta successiva. I worker non tengono vivo il processo Node.
const POOL_SIZE = 3,
  idle = [],
  waiting = [];
let workers = 0,
  sequence = 0;
function startWorker() {
  const child = spawn(pythonPath(), [path.join(root, 'suite_evidence_cli.py'), '--serve'], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: '1' }
  });
  const worker = { child, buffer: '', stderr: '', current: null, dead: false };
  workers++;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    worker.buffer += chunk;
    if (worker.buffer.length > 16000000)
      return worker.current?.finish(Error('Risultato troppo grande: restringi la richiesta'), undefined, true);
    for (let newline; (newline = worker.buffer.indexOf('\n')) >= 0; ) {
      const line = worker.buffer.slice(0, newline);
      worker.buffer = worker.buffer.slice(newline + 1);
      worker.current?.receive(line);
    }
  });
  child.stderr.on('data', chunk => (worker.stderr = (worker.stderr + chunk).slice(-4000)));
  const lost = error => {
    if (worker.dead) return;
    worker.dead = true;
    workers--;
    if (idle.includes(worker)) idle.splice(idle.indexOf(worker), 1);
    worker.current?.finish(error || Error(worker.stderr.trim() || 'Processo delle evidenze terminato'));
    dispatch();
  };
  child.on('error', lost);
  child.on('exit', () => lost());
  child.stdin.on('error', () => {});
  for (const handle of [child, child.stdin, child.stdout, child.stderr]) handle.unref?.();
  return worker;
}
function dispatch() {
  while (waiting.length) {
    const worker = idle.pop() || (workers < POOL_SIZE ? startWorker() : null);
    if (!worker) return;
    serve(worker, waiting.shift());
  }
}
function serve(worker, job) {
  // Annullata mentre era in coda: non parte.
  if (job.signal?.aborted) {
    idle.push(worker);
    return job.reject(Error(job.abortMessage));
  }
  const id = ++sequence;
  let timer;
  const onAbort = () => worker.current?.finish(Error(job.abortMessage), undefined, true);
  worker.current = {
    finish(error, value, kill = false) {
      if (worker.current?.id !== id) return;
      worker.current = null;
      clearTimeout(timer);
      job.signal?.removeEventListener('abort', onAbort);
      if (kill) worker.child.kill();
      else if (!worker.dead) idle.push(worker);
      error ? job.reject(error) : job.resolve(value);
      dispatch();
    },
    receive(line) {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return this.finish(Error('Risposta evidenze non valida'), undefined, true);
      }
      if (message.id === id)
        message.error === undefined ? this.finish(null, message.result) : this.finish(Error(message.error));
    },
    id
  };
  timer = setTimeout(() => worker.current?.finish(Error(job.timeoutMessage), undefined, true), job.timeoutMs);
  job.signal?.addEventListener('abort', onAbort, { once: true });
  const env = Object.fromEntries(
    ['PI_SUITE_SESSION_ID', 'PI_SUITE_CONTEXT'].map(name => [name, process.env[name] || ''])
  );
  worker.child.stdin.write(JSON.stringify({ ...job.request, env, id }) + '\n');
}
export const evidenceWorkerCount = () => workers;
export function askEvidenceWorker(
  request,
  { timeoutMs, timeoutMessage = 'Operazione scaduta', abortMessage = 'Operazione interrotta', signal } = {}
) {
  if (!fs.existsSync(pythonPath())) return Promise.reject(Error('Runtime Python assente. Esegui Install.cmd.'));
  if (signal?.aborted) return Promise.reject(Error(abortMessage));
  return new Promise((resolve, reject) => {
    waiting.push({ request, resolve, reject, timeoutMs, timeoutMessage, abortMessage, signal });
    dispatch();
  });
}

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
