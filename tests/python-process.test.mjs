// Uso: node --test tests/python-process.test.mjs   (dalla radice del repository, con la .venv)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runPython } from '../python-process.mjs';
import { invokeEvidence } from '../evidence-tools.mjs';

const home = fs.mkdtempSync(path.resolve('tests/tmp/python-process-'));
// Chiamata reale a suite_evidence_cli.py: stdin JSON, risposta su stdout.
const answer = await invokeEvidence('knowledge_search', { query: 'ordini' }, [], { home });
assert.deepEqual([answer.hits, answer.truncated], [[], false]);
assert.match(answer.corpusVersion, /^[a-f0-9]{64}$/);
// Errore del processo: il messaggio arriva dal JSON o da stderr, mai una risposta vuota.
await assert.rejects(() => invokeEvidence('azione_inesistente', {}, [], { home }), /./);
const failed = await runPython('suite_evidence_cli.py', [], { input: 'non json', timeoutMs: 60000 });
assert.notEqual(failed.code, 0);
assert.ok(JSON.parse(failed.stdout).error, 'la CLI riporta l’errore in JSON');
// Scadenza e annullamento interrompono il processo con il messaggio richiesto.
await assert.rejects(
  () => runPython('suite_evidence_cli.py', [], { timeoutMs: 1, timeoutMessage: 'scaduto' }),
  /^Error: scaduto$/
);
const controller = new AbortController();
controller.abort();
await assert.rejects(
  () =>
    runPython('suite_evidence_cli.py', [], { timeoutMs: 60000, signal: controller.signal, abortMessage: 'annullato' }),
  /^Error: annullato$/
);
console.log('Processi Python: risposta, errore, scadenza e annullamento OK');
