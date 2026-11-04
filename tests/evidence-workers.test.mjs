// Uso: node --test tests/evidence-workers.test.mjs   (dalla radice del repository, con la .venv)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { askEvidenceWorker, evidenceWorkerCount } from '../python-process.mjs';

const home = fs.mkdtempSync(path.resolve('tests/tmp/evidence-workers-'));
const search = (query, options = {}) =>
  askEvidenceWorker(
    { action: 'knowledge_search', args: { query }, bundle: [], home },
    { timeoutMs: 60000, ...options }
  );

// Scadenza: il primo worker deve ancora avviare Python (~150 ms), quindi 20 ms scadono sempre; il worker viene chiuso.
await assert.rejects(() => search('lenta', { timeoutMs: 20, timeoutMessage: 'scaduto' }), /^Error: scaduto$/);

// Dopo il primo avvio le consultazioni non pagano più l'avvio di Python.
await search('primo');
const started = Date.now();
for (let i = 0; i < 10; i++) assert.deepEqual((await search('q' + i)).hits, []);
const average = (Date.now() - started) / 10;
assert.ok(average < 80, 'media per consultazione ' + average + ' ms');

// Richieste parallele: tutte servite, al massimo 3 worker.
const parallel = await Promise.all(Array.from({ length: 8 }, (_, i) => search('p' + i)));
assert.equal(parallel.length, 8);
assert.ok(evidenceWorkerCount() <= 3, 'worker attivi: ' + evidenceWorkerCount());

// Un errore riguarda solo la sua richiesta.
await assert.rejects(
  () => askEvidenceWorker({ action: 'inesistente', bundle: [], home }, { timeoutMs: 60000 }),
  /non supportata/
);
assert.deepEqual((await search('dopo errore')).hits, []);

// L'annullamento chiude il worker interessato; la richiesta successiva ne usa uno nuovo.
const controller = new AbortController();
const pending = search('annullata', { signal: controller.signal, abortMessage: 'annullato' });
controller.abort();
await assert.rejects(() => pending, /^Error: annullato$/);
assert.deepEqual((await search('ripresa')).hits, []);

// I worker inattivi non impediscono al processo Node di terminare.
const script =
  "import {askEvidenceWorker} from './python-process.mjs';" +
  `await askEvidenceWorker({action:'knowledge_search',args:{query:'x'},bundle:[],home:${JSON.stringify(home)}},{timeoutMs:60000});`;
const exit = spawnSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 20000 });
assert.equal(exit.status, 0, String(exit.stderr));
console.log('Worker delle evidenze: media ' + Math.round(average) + ' ms, parallelismo, errori, scadenza e uscita OK');
