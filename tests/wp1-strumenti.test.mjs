import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const repo=path.resolve(process.argv[2]||'.');
const load=name=>import(pathToFileURL(path.join(repo,name)).href);
const temp=prefix=>fs.realpathSync(fs.mkdtempSync(path.join(repo,'tests','tmp',prefix)));
const core=await load('delegation-core.mjs');
const tmp=temp('wp1-'),project=path.join(tmp,'project');
fs.mkdirSync(path.join(project,'src','sub'),{recursive:true});fs.mkdirSync(path.join(project,'node_modules','x'),{recursive:true});
fs.writeFileSync(path.join(project,'src','a.ts'),'export function alpha(){\r\n  return 1;\r\n}\r\n');
fs.writeFileSync(path.join(project,'src','sub','b.py'),'def alpha():\n    pass\n');
fs.writeFileSync(path.join(project,'node_modules','x','c.ts'),'alpha');
fs.writeFileSync(path.join(project,'big.txt'),Array.from({length:5000},(_,i)=>'riga '+(i+1)+' '+'x'.repeat(20)).join('\n'));
// read_source a intervalli
let r=core.readSourceRange(project,{path:'src/a.ts'});
assert.match(r,/^\[src\/a.ts\] righe 1-4 di 4 · file completo\n/);assert.ok(!r.includes('\r'));
r=core.readSourceRange(project,{path:'big.txt'});assert.match(r,/righe 1-300 di 5000 · continua con startLine=301/);
r=core.readSourceRange(project,{path:'big.txt',startLine:4900,lines:500});assert.match(r,/righe 4900-5000 di 5000 · fine del file/);
assert.throws(()=>core.readSourceRange(project,{path:'big.txt',startLine:6000}),/oltre la fine/);
// search_project
r=core.searchProject(project,{pattern:'alpha'});assert.match(r,/^2 corrispondenze/);
assert.ok(r.includes('src/a.ts:1: export function alpha(){'));assert.ok(!r.includes('node_modules'));
r=core.searchProject(project,{pattern:'alpha',glob:'*.py'});assert.match(r,/^1 corrispondenze\nsrc\/sub\/b.py:1:/);
r=core.searchProject(project,{pattern:'alpha',glob:'src/**/*.ts'});assert.ok(r.includes('src/a.ts:1'));
r=core.searchProject(project,{pattern:'riga',maxResults:3});assert.match(r,/troncato/);
r=core.searchProject(project,{pattern:'(',literal:true});assert.match(r,/src\/a.ts:1/);
assert.throws(()=>core.searchProject(project,{pattern:'('}),/regolare non valida/);
assert.match(core.searchProject(project,{pattern:'zzz'}),/Nessuna corrispondenza/);
// applyTextEdits conserva CRLF
assert.equal(core.applyTextEdits('a\r\nb\r\nc\r\n',[{old:'b\nc',new:'B\nC'}]),'a\r\nB\r\nC\r\n');
assert.throws(()=>core.applyTextEdits('x x',[{old:'x',new:'y'}]),/più volte/);
assert.throws(()=>core.applyTextEdits('x',[{old:'q',new:'y'}]),/non trovato/);
// propose_edit tramite scopedTools: le modifiche si accumulano sulla proposta
const task=path.join(tmp,'task');fs.mkdirSync(path.join(task,'proposals'),{recursive:true});
fs.writeFileSync(path.join(task,'contract.json'),JSON.stringify({version:1,project,context:null,documentation:false,evidenceHome:tmp,writeFiles:['src/a.ts'],graph:null,skills:[],connectedSources:[],evidenceScope:null}));
const tools=core.scopedTools(task),edit=tools.find(t=>t.name==='propose_edit');
await edit.execute('1',{path:'src/a.ts',edits:[{old:'return 1;',new:'return 2;'}]});
await edit.execute('2',{path:'src/a.ts',edits:[{old:'return 2;',new:'return 3;'}]});
assert.equal(fs.readFileSync(path.join(task,'proposals','src','a.ts'),'utf8'),'export function alpha(){\r\n  return 3;\r\n}\r\n');
assert.equal(fs.readFileSync(path.join(project,'src','a.ts'),'utf8'),'export function alpha(){\r\n  return 1;\r\n}\r\n');
await assert.rejects(edit.execute('3',{path:'src/sub/b.py',edits:[{old:'pass',new:'x'}]}),/fuori incarico/);
assert.ok(tools.some(t=>t.name==='search_project'));
console.log('WP1 OK');
fs.writeFileSync(path.join(project,'line.txt'),'x'.repeat(80010));
assert.match(core.readSourceRange(project,{path:'line.txt'}),/startLine=1 e startColumn=40000/);
assert.match(core.readSourceRange(project,{path:'line.txt',startLine:1,startColumn:40000}),/startColumn=80000/);
assert.ok(core.readSourceRange(project,{path:'line.txt',startLine:1,startColumn:80000}).endsWith('\n'+'x'.repeat(10)));
assert.ok(core.globRegExp('src/**/a.ts').test('src/a.ts'));
assert.ok(!core.globRegExp('src/**/a.ts').test('src/not-a.ts'));
