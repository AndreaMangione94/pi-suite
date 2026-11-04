import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { prompt } from '../prompts.mjs';
import * as core from '../delegation-core.mjs';
import * as metrics from '../suite-metrics.mjs';
import { chatContext } from '../chat-context.mjs';
import { isDocumentationDossier } from '../documentation-workflow.mjs';
import { evidenceScopeSchema, evidenceReadingSummary } from '../evidence-reading.mjs';
const root = path.resolve('.'),
  home = fs.mkdtempSync(path.resolve('tests/tmp/runtime-'));
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
  fs,
  path,
  crypto,
  Type,
  ...core,
  ...metrics,
  chatContext,
  isDocumentationDossier,
  evidenceScopeSchema,
  evidenceReadingSummary,
  registerAgentViaEvents: () => ({ dispose() {} }),
  registerSubagentCapabilityCeiling: () => ({ dispose() {} }),
  registerRequiredChildExtensions: () => ({ dispose() {} }),
  REQUEST: 'request',
  RESPONSE: 'response',
  UPDATE: 'update',
  CANCEL: 'cancel'
};
const code = stripTypeScriptTypes(fs.readFileSync('suite-delegation.ts', 'utf8'))
  .replace(/^import\b[\s\S]*?;[ \t]*\r?\n/gm, '') // anche import su più righe
  .replace('export default function', 'return function');
const register = new Function(...Object.keys(params), code)(...Object.values(params));
delete process.env.PI_SUITE_CONTEXT;
delete process.env.PI_SUITE_CLEAN_WORKSPACE;
process.env.PI_CODING_AGENT_DIR = path.join(home, 'pi-shell');
fs.mkdirSync(process.env.PI_CODING_AGENT_DIR);
const project = path.join(home, 'project');
fs.mkdirSync(project);
async function setup(policy, worker = true, dossier = false) {
  const hooks = new Map(),
    registered = new Map(),
    events = new Map(),
    requests = [];
  fs.writeFileSync(
    path.join(process.env.PI_CODING_AGENT_DIR, 'suite-launch.json'),
    JSON.stringify({
      worker: worker ? { provider: 'test', model: 'cheap', effort: 'low' } : null,
      delegationPolicy: policy,
      skills: [],
      maxCalls: 4,
      maxParallelWorkers: 2
    })
  );
  const cwd = path.join(project, crypto.randomUUID());
  fs.mkdirSync(cwd);
  if (dossier) {
    fs.writeFileSync(path.join(cwd, 'FONTI.json'), '[]');
    fs.writeFileSync(path.join(cwd, 'INCARICO-DOCUMENTAZIONE-TECNICO-FUNZIONALE.md'), 'x');
  }
  const pi = {
    on(name, fn) {
      const values = hooks.get(name) || [];
      values.push(fn);
      hooks.set(name, values);
    },
    registerTool(t) {
      registered.set(t.name, t);
    },
    events: {
      on(name, fn) {
        const values = events.get(name) || new Set();
        values.add(fn);
        events.set(name, values);
        return () => values.delete(fn);
      },
      emit(name, value) {
        if (name === 'request') {
          requests.push(value);
          queueMicrotask(() =>
            pi.events.emit('response', {
              requestId: value.requestId,
              status: 'completed',
              result: { kind: 'text', text: 'ok' },
              usage: { input: 12, output: 3, cost: 0 }
            })
          );
        }
        for (const fn of events.get(name) || []) fn(value);
      }
    }
  };
  const ctx = { cwd, sessionManager: { getSessionId: () => crypto.randomUUID() } };
  register(pi, root, home, () => []);
  for (const fn of hooks.get('session_start')) await fn({}, ctx);
  const sections = {};
  for (const fn of hooks.get('before_agent_start'))
    await fn({ systemPrompt: 'base', systemPromptOptions: { sections } }, ctx);
  return { hooks, registered, requests, ctx, sections };
}
const settle = async harness => harness.hooks.get('agent_before_settle')[0]({ outcome: 'completed' }, harness.ctx);
assert.equal(await settle(await setup('auto')), undefined);
assert.equal(await settle(await setup('always', false)), undefined);
assert.equal((await settle(await setup('always'))).continue, true);
assert.equal((await settle(await setup('auto', true, true))).continue, true);
const h = await setup('always');
await h.registered.get('delegate_tasks').execute(
  'x',
  {
    plan: 'test',
    tasks: [
      {
        title: 'T',
        objective: 'O',
        context: 'C',
        instructions: 'I',
        constraints: 'L',
        acceptance: 'A',
        deliverable: 'D',
        writeFiles: []
      }
    ]
  },
  new AbortController().signal,
  () => {},
  h.ctx
);
assert.equal(h.requests.length, 1);
assert.equal(h.requests[0].thinking, 'low');
assert.equal(h.requests[0].model, 'test/cheap');
assert.deepEqual(h.requests[0].toolBudget, { soft: 40, hard: 64 });
assert.equal(await settle(h), undefined);
const policy = async (...a) => (await setup(...a)).sections.pi_suite_delegation;
assert.match(await policy('auto'), /^PI SUITE — ORCHESTRAZIONE \(delega automatica\)/);
assert.match(await policy('always'), /^PI SUITE — ORCHESTRAZIONE DALLA CHAT/);
assert.match(await policy('always', false), /^PI SUITE — SOLO ORCHESTRATORE/);
assert.match(await policy('auto', true, true), /^PI SUITE — ORCHESTRAZIONE DALLA CHAT/);
console.log('Sezioni del prompt: politica di delega OK');
console.log('Runtime: auto/always/dossier/solo, delega e thinking indipendente OK');
