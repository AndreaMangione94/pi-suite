import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const repo = path.resolve(process.argv[2] || '.');
const load = name => import(pathToFileURL(path.join(repo, name)).href);
const temp = prefix => fs.realpathSync(fs.mkdtempSync(path.join(repo, 'tests', 'tmp', prefix)));
const doc = await load('documentation-workflow.mjs');
const ws = temp('wp11-');
fs.mkdirSync(path.join(ws, 'moduli'));
fs.writeFileSync(path.join(ws, 'FONTI.json'), '[]');
fs.writeFileSync(path.join(ws, 'INCARICO-DOCUMENTAZIONE-TECNICO-FUNZIONALE.md'), 'x');
fs.writeFileSync(path.join(ws, 'moduli', '00-INTRODUZIONE.md'), '# Introduzione\nVedi [[F-001]].');
fs.writeFileSync(
  path.join(ws, 'moduli', 'F-001.md'),
  '# F-001 Ordini\n## Flusso\n```md\n# non toccare\n```\nRimanda a [[F-002]] e [[F-999]].'
);
const out = doc.assembleDocumentation(ws, { order: ['F-001', 'F-002'], intro: 'moduli/00-INTRODUZIONE.md' });
const body = fs.readFileSync(out.path, 'utf8');
assert.match(body, /^# Documentazione tecnico funzionale\n\n## Introduzione\nVedi \[F-001\]\(#F-001\)\./);
assert.match(body, /<a id="F-001"><\/a>\n\n## F-001 Ordini\n### Flusso\n```md\n# non toccare\n```/);
assert.match(body, /\[F-002\]\(#F-002\) e F-999/);
assert.deepEqual(out.missing, ['F-002']);
assert.deepEqual(out.unresolvedRefs, ['F-999']);
assert.match(body, /Sezione F-002 non disponibile/);
assert.throws(
  () => doc.assembleDocumentation(temp('wp11b-'), { order: ['F-001'] }),
  /solo nella cartella di un dossier/
);
console.log('WP11 OK');
