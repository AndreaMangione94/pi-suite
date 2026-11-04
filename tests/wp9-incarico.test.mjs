import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const repo=path.resolve(process.argv[2]||'.');
const load=name=>import(pathToFileURL(path.join(repo,name)).href);
const temp=prefix=>fs.realpathSync(fs.mkdtempSync(path.join(repo,'tests','tmp',prefix)));
delete process.env.PI_SUITE_CONTEXT;delete process.env.PI_SUITE_CLEAN_WORKSPACE;
const core=await load('delegation-core.mjs');
const tmp=temp('wp9-'),home=path.join(tmp,'home'),project=path.join(tmp,'project');fs.mkdirSync(path.join(project,'src'),{recursive:true});fs.mkdirSync(home);
fs.writeFileSync(path.join(project,'src','a.ts'),'uno\ndue\ntre\n');fs.writeFileSync(path.join(project,'AGENTS.md'),'Regola: usa tab.');
const tasks=[{kind:'edit',title:'Fix',objective:'Correggi due',instructions:'- cambia due in DUE',writeFiles:['src/a.ts'],refs:['src/a.ts#L2']},
             {title:'Domanda',objective:'Spiega',instructions:'- leggi',writeFiles:[]}];
const {batch}=await core.prepareBatch(home,project,tasks,{skills:[]},undefined);
assert.equal(batch.tasks[0].kind,'edit');assert.equal(batch.tasks[1].kind,'analyze');assert.equal(batch.plan,'');
const md=fs.readFileSync(path.join(batch.tasks[0].directory,'INCARICO.md'),'utf8');
assert.ok(md.startsWith('## Regole comuni'));
assert.ok(md.indexOf('## Regole permanenti del progetto')<md.indexOf('# Incarico (edit): Fix'));
assert.match(md,/## Limiti\nModifica solo i file autorizzati/);
assert.match(md,/## Estratti già letti dal genitore[\s\S]*### src\/a.ts#L2-L2 \(di 4\)\n```text\ndue\n```/);
assert.ok(!fs.readFileSync(path.join(batch.tasks[1].directory,'INCARICO.md'),'utf8').includes('Estratti già letti'));
await assert.rejects(core.prepareBatch(home,project,[{kind:'boh',title:'x',objective:'y',instructions:'z',writeFiles:[]}],{skills:[]}),/kind non valido/);
await assert.rejects(core.prepareBatch(home,project,[{title:'x',objective:'y',instructions:'z',writeFiles:[],refs:['../etc']}],{skills:[]}),/perimetro|relativo/);
// refs di file
fs.writeFileSync(path.join(project,'src','long.ts'),Array.from({length:500},(_,i)=>'l'+(i+1)).join('\n')+'\n```x```');
let r=await core.resolveRefs(project,['src/long.ts#L10-L12','src/long.ts']);
assert.match(r.markdown,/### src\/long.ts#L10-L12 \(di 501\)\n```text\nl10\nl11\nl12\n```/);assert.match(r.markdown,/### src\/long.ts#L1-L300/);
r=await core.resolveRefs(project,['src/long.ts#L501']);assert.match(r.markdown,/````text\n```x```\n````/);
await assert.rejects(core.resolveRefs(project,['src/a.ts#L9']),/oltre la fine/);
// refs di snapshot: restituiscono le letture da registrare
const source='a'.repeat(32),snapshot='b'.repeat(32),docA='c'.repeat(20),snap=path.join(tmp,'snap');fs.mkdirSync(snap);
const text='uno\ndue\ntre';fs.writeFileSync(path.join(snap,docA+'.txt'),text);
const bundle=[{source,snapshot,name:'Fonte',directory:snap,manifest:{createdAt:'x',revision:null,documents:[{id:docA,path:'a.md',textSha256:crypto.createHash('sha256').update(text).digest('hex')}]}}];
r=await core.resolveRefs(project,['['+source+':'+docA+']#L2-L3'],bundle);
assert.match(r.markdown,/2: due\n3: tre/);assert.equal(r.reads.length,1);assert.equal(r.reads[0].source,source);
assert.match(await core.scopedTools(batch.tasks[0].directory).find(t=>t.name==='read_source').execute('1',{path:'src/a.ts'}).then(x=>x.content[0].text),/file completo\nuno/);
console.log('WP9 OK');
