// suite-extension.ts: baseline una volta per sessione e cartella, sezioni con nome, regole sulle evidenze persistenti.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { stripTypeScriptTypes } from 'node:module';
import { prompt } from '../prompts.mjs';
import { queryGraph } from '../graph-query.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { legacyDocumentation } from '../documentation-compat.mjs';
import { sourceBundle, connectedTools, isCleanWorkspace } from '../connected-sources.mjs';
import { knowledgeTools, invokeEvidence } from '../evidence-tools.mjs';
import { chatContext, contextTools, externalSourcesInstructions } from '../chat-context.mjs';
import {
  documentationInstructions,
  assembleDocumentation,
  isDocumentationDossier
} from '../documentation-workflow.mjs';
import { recordUsage, usageEntry, summarizeUsage } from '../suite-metrics.mjs';
delete process.env.PI_SUITE_CONTEXT;
delete process.env.PI_SUITE_CLEAN_WORKSPACE;
const tmp = fs.mkdtempSync(path.resolve('tests/tmp/sections-'));
process.env.PI_SUITE_HOME = path.join(tmp, 'home');
fs.mkdirSync(process.env.PI_SUITE_HOME);
const spawns = [];
let exitCode = 0,
  delay = 5;
const settle = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
const spawn = (_cmd, args) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.resume = () => {};
  child.stderr = new EventEmitter();
  child.kill = () => {};
  spawns.push(args);
  const code = exitCode;
  setTimeout(() => {
    if (code) child.stderr.emit('data', 'errore finto');
    child.emit('close', code);
  }, delay);
  return child;
};
// Come spawn, ma con l'interfaccia di python-process.mjs usata dall'estensione.
const runPython = (script, args) => {
  spawns.push([script, ...args]);
  const code = exitCode,
    wait = delay;
  return new Promise(resolve =>
    setTimeout(() => resolve({ code, stdout: '', stderr: code ? 'errore finto' : '' }), wait)
  );
};
const Type = new Proxy(
  {},
  {
    get:
      (_t, key) =>
      (...args) => ({ type: key, args })
  }
);
const params = {
  prompt,
  queryGraph,
  runPython,
  pythonPath: () => 'python',
  legacyDocumentation,
  spawn,
  path,
  fileURLToPath,
  fs,
  crypto,
  Type,
  registerDelegation: () => {},
  sourceBundle,
  connectedTools,
  isCleanWorkspace,
  knowledgeTools,
  invokeEvidence,
  chatContext,
  contextTools,
  externalSourcesInstructions,
  documentationInstructions,
  assembleDocumentation,
  isDocumentationDossier,
  recordUsage,
  usageEntry,
  summarizeUsage,
  META_URL: pathToFileURL(path.resolve('suite-extension.ts')).href
};
const code = stripTypeScriptTypes(fs.readFileSync('suite-extension.ts', 'utf8'))
  .replace(/^import\b[\s\S]*?;[ \t]*\r?\n/gm, '') // anche import su più righe
  .replace('export default function', 'return function')
  .replaceAll('import.meta.url', 'META_URL');
const register = new Function(...Object.keys(params), code)(...Object.values(params));
const hooks = new Map(),
  notes = [],
  entries = [];
const pi = {
  on(name, fn) {
    (hooks.get(name) || hooks.set(name, []).get(name)).push(fn);
  },
  registerTool() {},
  registerCommand() {},
  appendEntry(customType, data) {
    entries.push({ type: 'custom', customType, data });
  },
  sendUserMessage() {}
};
register(pi);
const ws = path.join(tmp, 'ws');
fs.mkdirSync(ws);
const ctx = {
  cwd: ws,
  sessionManager: { getBranch: () => entries, getSessionId: () => 's1' },
  ui: { notify: (m, l) => notes.push([l, m]) }
};
const emit = async (name, event = {}) => {
  for (const fn of hooks.get(name) || []) await fn(event, ctx);
};
const turn = async () => {
  const sections = {};
  await emit('before_agent_start', { systemPrompt: 'base', systemPromptOptions: { sections } });
  return sections;
};
const baselines = () => spawns.filter(a => a.includes('--baseline'));
await emit('session_start');
assert.equal(baselines().length, 1, 'baseline avviata in session_start');
let s = await turn();
await turn();
assert.equal(baselines().length, 1, 'nessuna baseline ripetuta nei turni successivi');
assert.match(s.pi_suite_context, /^Artefatti selezionati e consultabili: /);
assert.equal(s.pi_suite_external_sources, externalSourcesInstructions);
assert.equal(s.pi_suite_skills, '');
assert.equal(s.pi_suite_dossier_workflow, '');
assert.equal(s.pi_suite_evidence, undefined, 'senza fonti niente regole sulle evidenze');
for (const [name, value] of Object.entries(s)) assert.match(name, /^[a-z][a-z0-9_-]*$/);
// Il refresh dopo il turno gira in background, non è una baseline e non blocca il turno successivo.
const corpus = () => entries.filter(e => e.customType === 'suite-evidence-corpus').length;
await settle();
delay = 300;
const corpusBefore = corpus();
await emit('agent_end');
const started = Date.now();
s = await turn();
assert.ok(Date.now() - started < 150, 'il turno non attende il refresh');
await settle();
assert.equal(spawns.filter(a => !a.includes('--baseline')).length, 1);
assert.equal(baselines().length, 1);
// Il corpus aggiornato si applica all'inizio del turno dopo la fine del refresh, mai a metà turno.
await settle(350);
assert.equal(corpus(), corpusBefore, 'nessun cambio di corpus fra un turno e l’altro');
await turn();
assert.equal(corpus(), corpusBefore + 1);
await turn();
assert.equal(corpus(), corpusBefore + 1, 'una sola applicazione per refresh');
delay = 5;
// Con un grafo selezionato le regole compaiono e restano anche se la selezione sparisce.
const selection = JSON.stringify({
  project: { path: ws },
  graphs: [{ id: 'g1', name: 'Grafo', kind: 'project' }],
  documentation: [],
  bundle: []
});
// Un CONTESTO.json fuori dall'area dati (per esempio in un repository clonato) viene ignorato.
fs.writeFileSync(path.join(ws, 'CONTESTO.json'), selection);
s = await turn();
assert.equal(s.pi_suite_evidence, undefined, 'CONTESTO.json esterno ignorato');
assert.equal(s.pi_suite_skills, '');
fs.rmSync(path.join(ws, 'CONTESTO.json'));
const contextFile = path.join(tmp, 'context.json');
fs.writeFileSync(contextFile, selection);
process.env.PI_SUITE_CONTEXT = contextFile;
s = await turn();
assert.match(s.pi_suite_evidence, /^EVIDENZE: /);
assert.match(s.pi_suite_skills, /graph/i);
delete process.env.PI_SUITE_CONTEXT;
s = await turn();
assert.match(s.pi_suite_evidence, /^EVIDENZE: /, 'regole persistenti nella sessione');
// Cambio di cartella (dossier): una baseline per la nuova cartella, una sola volta.
const dossier = path.join(tmp, 'dossier');
fs.mkdirSync(dossier);
fs.writeFileSync(path.join(dossier, 'FONTI.json'), '[]');
fs.writeFileSync(path.join(dossier, 'INCARICO-DOCUMENTAZIONE-TECNICO-FUNZIONALE.md'), 'x');
entries.push({ type: 'custom', customType: 'suite-documentation-dossier', data: { workspace: dossier } });
s = await turn();
await turn();
assert.equal(baselines().length, 2);
assert.ok(baselines()[1].includes(dossier));
assert.ok(s.pi_suite_dossier_workflow.length > 100);
// Una baseline fallita viene segnalata e ritentata al turno successivo.
exitCode = 1;
await emit('session_start');
await turn();
await settle();
assert.ok(notes.some(([level, m]) => level === 'error' && m.includes('errore finto')));
exitCode = 0;
const before = baselines().length;
await turn();
assert.equal(baselines().length, before + 1);
await settle();
await turn();
assert.equal(baselines().length, before + 1);
// Nuova sessione: le regole sulle evidenze ripartono da zero.
entries.length = 0;
await emit('session_start');
s = await turn();
assert.equal(s.pi_suite_evidence, undefined);
console.log('Sezioni del prompt e baseline una tantum OK');
