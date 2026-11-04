// Uso: node --test tests/graph-query.test.mjs   (dalla radice del repository)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { queryGraph } from '../graph-query.mjs';

const tmp = fs.mkdtempSync(path.resolve('tests/tmp/graph-query-')),
  file = path.join(tmp, 'graph.json');
const write = names =>
  fs.writeFileSync(
    file,
    JSON.stringify({
      base: 'abc',
      createdAt: 1,
      limits: [],
      nodes: names.map(name => ({ id: name, label: name.toUpperCase() })),
      edges: names.slice(1).map(name => ({ source: names[0], target: name }))
    })
  );
write(['ordini', 'ordine-riga', 'clienti']);
const item = { id: 'g', path: file };
let found = queryGraph(item, { query: 'ORDIN', maxNodes: 1 });
assert.deepEqual(
  found.nodes.map(n => n.id),
  ['ordini']
);
assert.equal(found.totalMatches, 2);
assert.equal(found.truncated, true);
assert.equal(found.edges.length, 2);
assert.deepEqual(
  queryGraph(item, { nodeId: 'clienti', maxNodes: 5 }).nodes.map(n => n.id),
  ['clienti']
);
// Un grafo rigenerato si rilegge: la cache vale solo finché il file non cambia.
write(['fatture']);
fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
found = queryGraph(item, { query: '', maxNodes: 10 });
assert.deepEqual(
  found.nodes.map(n => n.id),
  ['fatture']
);
console.log('graph_query condiviso: ricerca, limiti, nodo esatto e invalidazione della cache OK');
