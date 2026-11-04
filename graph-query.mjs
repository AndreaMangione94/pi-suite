// Ricerca nei grafi del codice, condivisa da genitore e subagenti (graph_query): ogni grafo si legge una volta e si
// riusa finché il file non cambia, invece di rileggerlo e serializzarne tutti i nodi a ogni chiamata.
import fs from 'node:fs';

const cache = new Map(),
  MAX_CACHED = 4;
function load(file) {
  const stat = fs.statSync(file),
    cached = cache.get(file);
  if (cached?.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached;
  const graph = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    graph,
    text: graph.nodes.map(n => JSON.stringify(n).toLowerCase())
  };
  cache.delete(file);
  cache.set(file, entry);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
  return entry;
}

export function queryGraph(item, { query = '', nodeId, maxNodes }) {
  const { graph, text } = load(item.path),
    needle = query.toLowerCase();
  const matches = graph.nodes.filter((node, index) => (nodeId ? node.id === nodeId : text[index].includes(needle)));
  const nodes = matches.slice(0, maxNodes),
    ids = new Set(nodes.map(node => node.id));
  const edges = graph.edges.filter(edge => ids.has(edge.source) || ids.has(edge.target));
  return {
    id: item.id,
    base: graph.base,
    createdAt: graph.createdAt,
    nodes,
    edges: edges.slice(0, 100),
    totalMatches: matches.length,
    truncated: matches.length > nodes.length || edges.length > 100,
    limits: graph.limits
  };
}
