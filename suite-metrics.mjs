// Registro dei consumi per sessione: una riga JSON per ogni risposta del genitore e per ogni figlio.
import fs from 'node:fs';
import path from 'node:path';

export function metricsFile(home, sessionId) {
  if (!/^[A-Za-z0-9_.-]{1,200}$/.test(String(sessionId))) throw Error('Sessione non valida');
  return path.join(home, 'metrics', sessionId + '.jsonl');
}
export function recordUsage(home, sessionId, entry) {
  const file = metricsFile(home, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8');
}
const number = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
export function usageEntry(kind, model, usage, extra = {}) {
  return {
    kind,
    model,
    input: number(usage?.input),
    output: number(usage?.output),
    cacheRead: number(usage?.cacheRead),
    cacheWrite: number(usage?.cacheWrite),
    cost: number(typeof usage?.cost === 'number' ? usage.cost : usage?.cost?.total),
    ...extra
  };
}
export function summarizeUsage(home, sessionId) {
  const file = metricsFile(home, sessionId),
    totals = {};
  if (!fs.existsSync(file)) return totals;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const t = (totals[row.kind] ??= { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });
    t.calls++;
    for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'cost']) {
      const value = number(row[k]);
      if (value === null) {
        t.missing ??= {};
        t.missing[k] = (t.missing[k] || 0) + 1;
      } else t[k] += value;
    }
  }
  return totals;
}
