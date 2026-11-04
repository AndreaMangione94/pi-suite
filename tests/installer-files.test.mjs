// Uso: node --test tests/installer-files.test.mjs   (dalla radice del repository)
// L'installer copia solo i file elencati in Install.ps1: un modulo nuovo non elencato romperebbe l'app installata.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(process.argv[2] || '.');
const installer = fs.readFileSync(path.join(repo, 'Install.ps1'), 'utf8');
const listed = new Set(
  [...installer.matchAll(/^\s*\$files \+?= @\(([^)]*)\)/gm)].flatMap(m =>
    [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
  )
);
const folders = installer.match(/foreach \(\$name in @\(([^)]*)\)\) \{ Copy-Item/)[1];
const updater = fs.readFileSync(path.join(repo, 'Aggiorna.ps1'), 'utf8');

for (const file of listed) assert.ok(fs.existsSync(path.join(repo, file)), 'elencato ma assente: ' + file);
const application = fs
  .readdirSync(repo, { withFileTypes: true })
  .filter(e => e.isFile() && !e.name.startsWith('.') && /\.(py|mjs|ts|json)$/.test(e.name))
  .map(e => e.name);
for (const file of application) assert.ok(listed.has(file), 'file applicativo non copiato da Install.ps1: ' + file);
for (const folder of ['skills', 'suite-ui', 'prompts', 'docs']) {
  assert.ok(folders.includes("'" + folder + "'"), 'cartella non copiata da Install.ps1: ' + folder);
  assert.ok(updater.includes("'" + folder + "'"), 'cartella non copiata da Aggiorna.ps1: ' + folder);
}
assert.ok(!listed.has('benchmark-catalog.json'), 'the private catalog belongs to the external module');
console.log('Installer: ' + listed.size + ' file e cartelle applicative coperti');
