import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const repo = path.resolve(process.argv[2] || '.');
const load = name => import(pathToFileURL(path.join(repo, name)).href);
const temp = prefix => fs.realpathSync(fs.mkdtempSync(path.join(repo, 'tests', 'tmp', prefix)));
const m = await load('suite-metrics.mjs');
const home = temp('wp0-');
m.recordUsage(
  home,
  's1',
  m.usageEntry('parent', 'opus', { input: 100, output: 20, cacheRead: 50, cacheWrite: 0, cost: { total: 0.01 } })
);
m.recordUsage(
  home,
  's1',
  m.usageEntry('parent', 'opus', { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: { total: 0.002 } })
);
m.recordUsage(
  home,
  's1',
  m.usageEntry(
    'child',
    'haiku',
    { input: 1000, output: 300, cacheRead: 0, cacheWrite: 0, cost: 0.003 },
    { batch: 'b', task: 1 }
  )
);
const t = m.summarizeUsage(home, 's1');
assert.deepEqual(t.parent, { calls: 2, input: 110, output: 25, cacheRead: 50, cacheWrite: 0, cost: 0.012 });
assert.equal(t.child.output, 300);
assert.throws(() => m.metricsFile(home, '../x'), /non valida/);
console.log('WP0 OK');
const unknown = m.usageEntry('child', 'missing', {});
assert.equal(unknown.input, null);
assert.equal(unknown.cost, null);
m.recordUsage(home, 'partial', unknown);
m.recordUsage(home, 'partial', m.usageEntry('child', 'known', { input: 10, output: 2, cost: 0 }));
const partial = m.summarizeUsage(home, 'partial').child;
assert.equal(partial.input, 10);
assert.equal(partial.missing.input, 1);
assert.equal(partial.cost, 0);
assert.equal(partial.missing.cost, 1);
