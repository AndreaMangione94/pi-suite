// Uso: node --test tests/sicurezza-strumenti.test.mjs   (dalla radice del repository)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = path.resolve(process.argv[2] || '.');
const load = name => import(pathToFileURL(path.join(repo, name)).href);
const temp = prefix => fs.realpathSync(fs.mkdtempSync(path.join(repo, 'tests', 'tmp', prefix)));
const core = await load('delegation-core.mjs');
const { suiteContextFile, chatContext } = await load('chat-context.mjs');

// File con possibili credenziali: sicurezza-credenziali.test.py confronta la stessa regola in Python.
const SENSITIVE_CASES = {
  '.env': true,
  '.env.local': true,
  'config/.env.production': true,
  '.env.example': false,
  '.env.sample': false,
  'credentials.json': true,
  'secrets.yaml': true,
  'config/secrets.prod.yml': true,
  'client_secret.json': true,
  'secrets.example.json': false,
  'credentials_template.yaml': false,
  'server.key': true,
  'certs/cert.PEM': true,
  'store.pfx': true,
  'terraform.tfstate': true,
  'credentials.dpapi.json': true,
  id_rsa: true,
  id_ed25519: true,
  'id_rsa.pub': false,
  '.npmrc': true,
  '.git-credentials': true,
  'auth.json': true,
  '.ssh/config': true,
  'home/.aws/credentials': true,
  'src/secrets.py': false,
  'src/credentials.ts': false,
  'docs/keys.md': false,
  'package.json': false,
  'README.md': false,
  'monkey.js': false
};
for (const [file, expected] of Object.entries(SENSITIVE_CASES))
  assert.equal(core.isSensitivePath(file), expected, file);

const tmp = temp('sicurezza-'),
  project = path.join(tmp, 'project');
fs.mkdirSync(path.join(project, 'config'), { recursive: true });
fs.writeFileSync(path.join(project, 'config', 'secrets.yaml'), 'token: SEGRETO-123\n');
fs.writeFileSync(path.join(project, '.env'), 'API_KEY=SEGRETO-123\n');
fs.writeFileSync(path.join(project, '.env.example'), 'API_KEY=\n');
fs.writeFileSync(path.join(project, 'app.js'), 'const token=process.env.API_KEY; // SEGRETO-123 non qui\n');

// read_source e refs rifiutano i file sensibili; gli esempi pubblici restano leggibili.
assert.throws(() => core.readSourceRange(project, { path: '.env' }), /può contenere credenziali/);
assert.throws(() => core.readSourceRange(project, { path: 'config/secrets.yaml' }), /può contenere credenziali/);
assert.match(core.readSourceRange(project, { path: '.env.example' }), /API_KEY=/);
await assert.rejects(() => core.resolveRefs(project, ['config/secrets.yaml#L1-L1']), /può contenere credenziali/);
assert.match((await core.resolveRefs(project, ['app.js#L1'])).markdown, /process\.env/);

// search_project salta i file sensibili e lo dichiara.
const found = core.searchProject(project, { pattern: 'SEGRETO-123', literal: true });
assert.match(found, /^1 corrispondenze · 1 file con possibili credenziali esclusi/);
assert.match(found, /app\.js:1:/);
assert.doesNotMatch(found, /secrets\.yaml/);

// La ricerca protetta restituisce lo stesso risultato e interrompe una regex catastrofica.
assert.equal(await core.searchProjectGuarded(project, { pattern: 'SEGRETO-123', literal: true }), found);
fs.writeFileSync(path.join(project, 'lento.txt'), 'a'.repeat(40) + 'b\n');
const started = Date.now();
await assert.rejects(
  () => core.searchProjectGuarded(project, { pattern: '^(a+)+$' }, 1500),
  /Ricerca interrotta dopo 2 s/
);
assert.ok(Date.now() - started < 5000, 'worker interrotto alla scadenza');
await assert.rejects(() => core.searchProjectGuarded(project, { pattern: '(' }), /Espressione regolare non valida/);

// CONTESTO.json: valido solo nei dossier e nelle sessioni dell'area dati.
const home = path.join(tmp, 'home'),
  dossier = path.join(home, 'documentation', 'd1'),
  sessions = path.join(home, 'sessions');
fs.mkdirSync(dossier, { recursive: true });
fs.mkdirSync(sessions, { recursive: true });
const selection = JSON.stringify({
  graphs: [],
  documentation: [{ id: 'doc', name: 'Doc', path: path.join(project, '.env') }]
});
for (const folder of [dossier, project, home]) fs.writeFileSync(path.join(folder, 'CONTESTO.json'), selection);
fs.writeFileSync(path.join(sessions, 'context-1.json'), selection);
assert.equal(suiteContextFile(path.join(dossier, 'CONTESTO.json'), home), true);
assert.equal(suiteContextFile(path.join(sessions, 'context-1.json'), home), true);
assert.equal(suiteContextFile(path.join(project, 'CONTESTO.json'), home), false, 'cartella esterna');
assert.equal(suiteContextFile(path.join(home, 'CONTESTO.json'), home), false, "radice dell'area dati");
assert.equal(suiteContextFile(path.join(dossier, 'CONTESTO.json'), undefined), false, 'area dati sconosciuta');
const previous = { home: process.env.PI_SUITE_HOME, context: process.env.PI_SUITE_CONTEXT };
process.env.PI_SUITE_HOME = home;
delete process.env.PI_SUITE_CONTEXT;
assert.equal(chatContext(project), null, 'repository con CONTESTO.json non fidato');
assert.equal(chatContext(dossier).documentation[0].id, 'doc');
process.env.PI_SUITE_CONTEXT = path.join(project, 'CONTESTO.json');
assert.equal(chatContext(dossier).documentation[0].id, 'doc', 'il percorso indicato dal launcher resta valido');
for (const [name, value] of Object.entries({ PI_SUITE_HOME: previous.home, PI_SUITE_CONTEXT: previous.context }))
  value === undefined ? delete process.env[name] : (process.env[name] = value);
console.log('Sicurezza strumenti: file sensibili, ricerca protetta e CONTESTO.json OK');
