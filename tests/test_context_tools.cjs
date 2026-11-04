const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const root = fs.mkdtempSync(path.resolve('tests/tmp/context-tools-')),
    doc = path.join(root, 'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md');
  fs.writeFileSync(doc, '# documentazione tecnico funzionale\n## Ordini\nPrima fase\nSeconda fase\n');
  const { contextTools } = await import(pathToFileURL(path.resolve('chat-context.mjs')));
  const selection = { graphs: [], documentation: [{ id: 'documentation:one', name: 'Ordini', path: doc }], bundle: [] };
  const tool = contextTools(selection)[0],
    read = async args => JSON.parse((await tool.execute('t', args)).content[0].text);
  assert.equal((await read({})).documents.length, 1);
  const first = await read({ id: 'documentation:one', limit: 2 });
  assert.equal(first.nextOffset, 2);
  const next = await read({ id: 'documentation:one', offset: first.nextOffset, limit: 2 });
  assert.deepEqual(
    next.rows.map(r => r.line),
    [3, 4]
  );
  assert.equal((await read({ id: 'documentation:one', query: 'ordini' })).rows[0].line, 2);
  await assert.rejects(() => read({ id: 'documentation:unselected' }), /non selezionato/);
  assert.deepEqual(JSON.parse((await contextTools(null)[0].execute('t', {})).content[0].text).documents, []);
  const contextFile = path.join(root, 'context.json');
  fs.writeFileSync(contextFile, JSON.stringify(selection));
  process.env.PI_SUITE_CONTEXT = contextFile;
  const { sourceBundle, connectedTools } = await import(pathToFileURL(path.resolve('connected-sources.mjs')));
  assert.deepEqual(sourceBundle(root, root), []);
  const graphDir = path.join(root, 'snapshot');
  fs.mkdirSync(graphDir);
  fs.writeFileSync(
    path.join(graphDir, 'graph.json'),
    JSON.stringify({ nodes: [{ id: 'secret' }], edges: [], limits: [] })
  );
  const connected = connectedTools([{ source: 'x', directory: graphDir, allowCodeGraph: false }]).find(
    t => t.name === 'connected_graph'
  );
  assert.deepEqual(JSON.parse((await connected.execute('t', {})).content[0].text).graphs, []);
  delete process.env.PI_SUITE_CONTEXT;
  console.log(
    'documentazione tecnico funzionale lookup, pagination, exact selection and unselected graph exclusion: OK'
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
