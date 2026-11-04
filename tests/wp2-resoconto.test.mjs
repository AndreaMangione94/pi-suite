import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const repo = path.resolve(process.argv[2] || '.');
const load = name => import(pathToFileURL(path.join(repo, name)).href);
const temp = prefix => fs.realpathSync(fs.mkdtempSync(path.join(repo, 'tests', 'tmp', prefix)));
const ev = await load('evidence-reading.mjs');
const tmp = temp('wp2-'),
  source = 'a'.repeat(32),
  snapshot = 'b'.repeat(32),
  docA = 'c'.repeat(20),
  docB = 'd'.repeat(20);
const dir = path.join(tmp, 'snap');
fs.mkdirSync(dir);
const textA = ['uno', 'due', 'tre', 'quattro', 'cinque'].join('\n'),
  textB = 'solo\nb',
  sha = t => crypto.createHash('sha256').update(t).digest('hex');
fs.writeFileSync(path.join(dir, docA + '.txt'), textA);
fs.writeFileSync(path.join(dir, docB + '.txt'), textB);
const ref = {
  source,
  snapshot,
  directory: dir,
  manifest: {
    documents: [
      { id: docA, path: 'a.md', textSha256: sha(textA) },
      { id: docB, path: 'b.md', textSha256: sha(textB) }
    ]
  }
};
const scope = {
  version: 1,
  origin: 'explicit',
  focus: 'f',
  questions: ['q'],
  limits: 'l',
  expectedOutput: 'o',
  graphNodes: [],
  sources: [],
  initialDocuments: [{ source, snapshot, document: docB, path: 'b.md', textSha256: sha(textB) }]
};
const contract = { connectedSources: [ref], evidenceScope: scope },
  task = path.join(tmp, 'task');
fs.mkdirSync(task);
ev.recordEvidenceRead(task, contract, 'read_evidence', {
  source,
  snapshot,
  document: docA,
  path: 'a.md',
  mode: 'passage',
  startLine: 1,
  endLine: 2,
  offset: 0,
  nextOffset: null,
  rangeStartOffset: 0,
  totalRangeChars: 7,
  returnedChars: 7,
  documentTotalChars: textA.length,
  documentTotalLines: 5,
  textSha256: sha(textA),
  text: 'uno\ndue'
});
const tool = ev.evidenceReadingTool(task, contract);
const out = JSON.parse(
  (
    await tool.execute('1', {
      summary: 'ok',
      citations: [
        { source, document: docA, startLine: 1, endLine: 2 },
        { source, document: docA, startLine: 3, endLine: 4 },
        { source: 'S1', document: 'D1', startLine: 1, endLine: 1 }
      ],
      unreadDocuments: [{ source, document: docA, reason: 'x' }]
    })
  ).content[0].text
);
const decl = out.declaration;
assert.equal(decl.citations.length, 2);
assert.equal(decl.citations[0].verified, true);
assert.equal(decl.citations[1].verified, false);
assert.equal(decl.citations[1].issue, 'righe non lette integralmente');
assert.ok(decl.warnings.some(w => w.startsWith('Citazione scartata')));
assert.ok(decl.warnings.some(w => w.startsWith('Letto in parte')));
assert.ok(decl.unreadDocuments.some(u => u.path === 'b.md' && u.reason === 'non letto e non dichiarato dal figlio'));
assert.equal(out.reportMissing, false);
await assert.rejects(tool.execute('2', {}), /summary/);
console.log('WP2 OK');
fs.writeFileSync(path.join(dir, docA + '.txt'), 'alterato');
await assert.rejects(
  tool.execute('3', { summary: 'ok', citations: [{ source, document: docA, startLine: 1, endLine: 2 }] }),
  /alterato/
);
