// Uso: node --test tests/pi-contract.test.mjs   (dalla radice del repository, dopo npm ci)
// Contratto con Pi e pi-subagents: ciò che la suite usa deve esistere nelle versioni installate. Da eseguire prima di
// aggiornare le dipendenze. Il caricamento reale dell'estensione (incluso '@earendil-works/pi-ai', fornito da Pi alle
// estensioni) e la sostituzione di globalThis.fetch sono coperti da tests/e2e-chat.test.py.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve('.');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const installed = name => JSON.parse(fs.readFileSync(path.join(repo, 'node_modules', name, 'package.json'), 'utf8'));

// Exact registry versions and file/Git dependencies must match their committed lock entries.
const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
for (const [name, specification] of Object.entries(pkg.dependencies)) {
  assert.equal(lock.packages[''].dependencies[name], specification, name + ': lockfile non aggiornato');
  const entry = lock.packages['node_modules/' + name];
  const version = /^\d+\.\d+\.\d+$/.test(specification)
    ? specification
    : (entry.link ? lock.packages[entry.resolved] : entry).version;
  assert.equal(installed(name).version, version, name + ': installata una versione diversa da quella fissata');
}

// pi-subagents: export usati tramite pi-bridge.mjs (un export rinominato fa fallire subito l'import).
const bridge = await import('../pi-bridge.mjs');
for (const name of ['registerAgentViaEvents', 'registerSubagentCapabilityCeiling', 'registerRequiredChildExtensions'])
  assert.equal(typeof bridge[name], 'function', name);
for (const name of Object.keys(bridge).filter(n => n.startsWith('SUBAGENT_DELEGATION_')))
  assert.ok(typeof bridge[name] === 'string' && bridge[name].length, name);
assert.equal(Object.keys(bridge).filter(n => n.startsWith('SUBAGENT_DELEGATION_')).length, 4);

// SDK di Pi usato da adapter.mjs per catalogo, verifiche e grafo documentale.
const sdk = await import('@earendil-works/pi-coding-agent');
for (const name of [
  'createAgentSession',
  'createExtensionRuntime',
  'ModelRuntime',
  'SessionManager',
  'SettingsManager'
])
  assert.equal(typeof sdk[name], 'function', 'pi-coding-agent: ' + name);

// Eventi e metodi dell'API delle estensioni usati da suite-extension.ts, suite-delegation.ts e suite-child.ts.
const piRoot = path.join(repo, 'node_modules', '@earendil-works', 'pi-coding-agent');
const types = fs.readFileSync(path.join(piRoot, 'dist/core/extensions/types.d.ts'), 'utf8');
for (const name of [
  'session_start',
  'session_shutdown',
  'before_agent_start',
  'agent_before_settle',
  'agent_end',
  'message_end',
  'tool_call',
  'systemPromptOptions',
  'sections',
  'registerTool',
  'registerCommand',
  'appendEntry',
  'sendUserMessage',
  'waitForIdle',
  'notify'
])
  assert.match(types, new RegExp('\\b' + name + '\\b'), 'API estensioni: ' + name);
const sessions = fs.readFileSync(path.join(piRoot, 'dist/core/session-manager.d.ts'), 'utf8');
for (const name of ['getSessionId', 'getBranch', 'getEntries'])
  assert.match(sessions, new RegExp('\\b' + name + '\\('), 'SessionManager: ' + name);

// Percorsi interni usati da suite_cli.py e suite.py.
for (const file of [
  'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
  'node_modules/pi-subagents/index.js',
  'node_modules/pi-subagents/skills/pi-subagents/SKILL.md'
])
  assert.ok(fs.existsSync(path.join(repo, file)), 'percorso usato dalla suite assente: ' + file);
console.log(
  'Contratto con Pi ' +
    installed('@earendil-works/pi-coding-agent').version +
    ' e pi-subagents ' +
    installed('pi-subagents').version +
    ' OK'
);
