const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');

(async()=>{
  const python=process.env.WORKSPACE_PYTHON||'python';process.env.PI_SUITE_PYTHON=python;
  const root=path.join(__dirname,'.test-suite','reading-'+randomUUID().slice(0,8));
  const fixture=`
import json,sys
from pathlib import Path
from suite import Suite
from suite_evidence import query
home=Path(sys.argv[1]);home.mkdir(parents=True);repo=home/'repo';repo.mkdir();app=Suite(home/'data')
docs=home/'docs';docs.mkdir();text='# Ordini\\n'+'Il portale raccoglie gli ordini. '*14+'\\n\\n## Regole\\n'+'L’ordine 🚀 richiede approvazione. '*8+'\\n\\n## Evasione\\nLa consegna segue la conferma del pagamento.'
(docs/'ordini.md').write_text(text,encoding='utf-8');(docs/'escluso.md').write_text('# Dati\\nDocumento iniziale non letto.',encoding='utf-8')
other=home/'glossario';other.mkdir();(other/'glossario.md').write_text('# Glossario\\nOrdine: richiesta di acquisto 🚀.',encoding='utf-8')
ids=[]
for folder in (docs,other):
    sid=app.sources.save({'name':folder.name,'kind':'sharepoint-local','path':str(folder)})[-1]['id'];app.sources.sync(sid);ids.append(sid)
bundle=app.sources.knowledge_bundle(ids);seed=query(bundle,'knowledge_search',{'query':'Ordini'})['nodes'][0]['id']
print(json.dumps({'home':str(app.home),'project':str(repo),'bundle':bundle,'seed':seed}),flush=True)
`;
  const info=JSON.parse(await new Promise((resolve,reject)=>{
    const child=spawn(python,['-u','-c',fixture,root],{cwd:__dirname,windowsHide:true});let out='',err='';
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(err)):resolve(out));
  }));
  const {prepareBatch,scopedTools,assignmentSystemPrompt}=await import('./delegation-core.mjs');
  const {evidenceReadingSummary}=await import('./evidence-reading.mjs');
  const a=info.bundle[0],other=info.bundle[1],doc=a.manifest.documents.find(d=>d.path==='ordini.md'),unread=a.manifest.documents.find(d=>d.path==='escluso.md'),glossary=other.manifest.documents[0];
  const base={title:'Analisi degli ordini',objective:'Ricostruisci approvazione ed evasione',context:'Corpus fissato',instructions:'Analizza le evidenze pertinenti',constraints:'Analizza lo stato corrente',acceptance:'Risultati con citazioni e copertura',deliverable:'Sintesi del processo con dubbi',writeFiles:[]};
  const scope={focus:'Ciclo ordine',questions:['Chi approva un ordine?','Quando parte la consegna?'],sourceIds:[a.source],documents:[{source:a.source,document:doc.id},{source:a.source,document:unread.id}],graphNodes:[info.seed],limits:'Ricostruisci soltanto il processo ordine',expectedOutput:'Risultati brevi con citazioni, copertura e dubbi'};
  const create=(evidenceScope=scope,settings={projects:[],connectedSources:info.bundle})=>{
    const task={...base,...(evidenceScope===undefined?{}:{evidenceScope})};
    const batch=prepareBatch(info.home,info.project,[task],settings,'Analisi documentale');
    const directory=batch.batch.tasks[0].directory;
    return {directory,contract:JSON.parse(require('node:fs').readFileSync(path.join(directory,'contract.json'),'utf8')),tool:name=>scopedTools(directory).find(t=>t.name===name)};
  };
  const parsed=result=>JSON.parse(result.content[0].text);
  const read=async(job,args)=>parsed(await job.tool('read_evidence').execute('read',{source:a.source,document:doc.id,...args}));
  const report={summary:'Il processo richiede approvazione e conferma del pagamento.',citations:[{source:a.source,document:doc.id,startLine:1,endLine:1}],unreadDocuments:[{source:a.source,document:unread.id,reason:'Fuori dalle domande operative assegnate.'}],uncertainties:['Parte del documento non ancora letta.'],scopeExpansionRequests:[]};

  const job=create();
  assert.equal(job.contract.evidenceScope.type,'operational');assert.equal(job.contract.evidenceScope.choice,'subagent');
  assert.equal(job.contract.evidenceScope.initialDocuments[0].snapshot,a.snapshot);
  assert.equal(job.contract.connectedSources.length,2);
  assert(assignmentSystemPrompt('Analizza le fonti.',job.directory).includes('mode full, section o passage'));
  assert((await fs.readFile(path.join(job.directory,'INCARICO.md'),'utf8')).includes(a.snapshot));
  const before=(await fs.readdir(path.join(info.home,'delegations'))).length;
  assert.throws(()=>create({...scope,documents:[{source:'0'.repeat(32),document:doc.id}]}),/corpus/);
  assert.throws(()=>create({...scope,documents:[{source:a.source,document:doc.id,snapshot:'0'.repeat(32)}]}),/corpus/);
  assert.equal((await fs.readdir(path.join(info.home,'delegations'))).length,before);

  const first=await read(job,{mode:'full',maxChars:140});assert(first.nextOffset>0);
  let coverage=evidenceReadingSummary(job.directory,job.contract);
  assert.equal(coverage.documents[0].availableTextFullyRead,false);assert.equal(coverage.reportMissing,true);
  const accepted=parsed(await job.tool('report_evidence_reading').execute('report',report));
  assert.equal(accepted.completeAvailableTextDocuments,0);assert.equal(accepted.unreadInitialDocuments.length,1);
  await assert.rejects(job.tool('report_evidence_reading').execute('bad',{...report,citations:[{source:a.source,document:doc.id,startLine:8,endLine:8}]}),/lette/);
  await assert.rejects(job.tool('report_evidence_reading').execute('bad',{...report,availableTextFullyRead:true}),/copertura/);
  const characters=coverage.documents[0].readCharacters;
  await read(job,{mode:'full',maxChars:140});assert.equal(evidenceReadingSummary(job.directory,job.contract).documents[0].readCharacters,characters);
  let page=first;
  while(page.nextOffset!==null)page=await read(job,{mode:'full',maxChars:140,offset:page.nextOffset});
  coverage=evidenceReadingSummary(job.directory,job.contract);
  assert.equal(coverage.documents[0].availableTextFullyRead,true);assert.equal(coverage.declarationStale,true);
  assert.equal(coverage.documents[0].readCharacters,coverage.documents[0].documentTotalChars);
  await job.tool('report_evidence_reading').execute('final',{...report,uncertainties:[]});
  assert.equal(evidenceReadingSummary(job.directory,job.contract).declarationStale,false);

  const skip=create();
  const tail=await read(skip,{mode:'full',offset:200,maxChars:200000});assert.equal(tail.nextOffset,null);
  assert.equal(evidenceReadingSummary(skip.directory,skip.contract).documents[0].availableTextFullyRead,false);
  await assert.rejects(skip.tool('report_evidence_reading').execute('bad',report),/lette/);

  const selected=create();
  let section=await read(selected,{mode:'section',startLine:4,maxChars:140});
  while(section.nextOffset!==null)section=await read(selected,{mode:'section',startLine:4,maxChars:140,offset:section.nextOffset});
  await read(selected,{mode:'passage',startLine:8,lines:1,maxChars:1000});
  const selectedCoverage=evidenceReadingSummary(selected.directory,selected.contract).documents[0];
  assert.deepEqual(selectedCoverage.modes,['section','passage']);assert.equal(selectedCoverage.availableTextFullyRead,false);
  const precise=parsed(await selected.tool('report_evidence_reading').execute('selected',{...report,citations:[{source:a.source,document:doc.id,startLine:5,endLine:5},{source:a.source,document:doc.id,startLine:8,endLine:8}]}));
  assert.equal(precise.declaration.citations.length,2);
  // Initial sources are an operational focus; another document in the frozen corpus remains readable.
  await selected.tool('read_connected_source').execute('related',{source:other.source,document:glossary.id,startLine:1,lines:300});
  assert(evidenceReadingSummary(selected.directory,selected.contract).documents.some(d=>d.source===other.source&&d.availableTextFullyRead));

  const textFile=path.join(a.directory,doc.id+'.txt'),original=await fs.readFile(textFile),count=evidenceReadingSummary(job.directory,job.contract).readCalls;
  await fs.writeFile(textFile,'Testo alterato.');
  await assert.rejects(read(job,{mode:'full'}),/alterat/i);
  assert.equal(evidenceReadingSummary(job.directory,job.contract).readCalls,count);
  await fs.writeFile(textFile,original);
  const binaryFile=path.join(a.directory,doc.original),binary=await fs.readFile(binaryFile);
  await fs.writeFile(binaryFile,'Originale alterato.');
  await assert.rejects(job.tool('report_evidence_reading').execute('tampered',report),/Originale.*alterato/);
  await fs.writeFile(binaryFile,binary);
  await assert.rejects(job.tool('report_evidence_reading').execute('unread',{...report,unreadDocuments:[]}),/non letto/);
  const generic=prepareBatch(info.home,info.project,[base],{projects:[],connectedSources:info.bundle},'Compatibilità');
  const contract=JSON.parse(await fs.readFile(path.join(generic.batch.tasks[0].directory,'contract.json'),'utf8'));
  assert.equal(contract.evidenceScope.origin,'assignment');
  const noCorpus=prepareBatch(info.home,info.project,[base],{projects:[],connectedSources:[]},'Solo codice');
  const none=JSON.parse(await fs.readFile(path.join(noCorpus.batch.tasks[0].directory,'contract.json'),'utf8'));
  assert.equal(none.evidenceScope,null);
  if(process.env.EVIDENCE_RUNTIME_APP){
    const app=process.env.EVIDENCE_RUNTIME_APP,{pathToFileURL}=require('node:url'),{EventEmitter}=require('node:events');
    const loader=await import(pathToFileURL(path.join(app,'node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js')).href);
    const childLoaded=await loader.loadExtensions([path.join(app,'suite-child.ts')],info.project);
    assert.deepEqual(childLoaded.errors,[]);const childExtension=childLoaded.extensions[0];
    const childHooks=new Map([...childExtension.handlers].map(([name,handlers])=>[name,handlers[0]])),childTools=new Map([...childExtension.tools].map(([name,tool])=>[name,tool.definition]));
    assert.equal(typeof childTools.get('report_evidence_reading').description,'string');
    const sdk=create(),ctx={cwd:sdk.directory};
    await childTools.get('read_evidence').execute('sdk-read',{source:a.source,document:doc.id,mode:'passage',startLine:1,lines:1},undefined,undefined,ctx);
    const reminder=await childHooks.get('agent_before_settle')({outcome:'completed'},ctx);
    assert.equal(reminder.continue,true);assert.equal(await childHooks.get('agent_before_settle')({outcome:'completed'},ctx),undefined);
    await childTools.get('report_evidence_reading').execute('sdk-report',report,undefined,undefined,ctx);
    assert.equal(evidenceReadingSummary(sdk.directory,sdk.contract).reportMissing,false);
    const packageFile=path.join(app,'node_modules/pi-subagents/package.json'),metadata=JSON.parse(await fs.readFile(packageFile,'utf8'));
    const api=await import(pathToFileURL(path.join(path.dirname(packageFile),metadata.exports['./delegation'].default)).href);
    const bus=new EventEmitter(),events={on:(name,fn)=>{bus.on(name,fn);return()=>bus.off(name,fn);},emit:(name,value)=>bus.emit(name,value)};
    bus.on('pi-subagents:runtime-agent-register:v1',request=>{assert(request.definition.tools.includes('report_evidence_reading'));request.result={ok:true,registration:{dispose(){}}};});
    const launch=path.join(info.home,'pi-shell');await fs.mkdir(launch,{recursive:true});
    await fs.writeFile(path.join(launch,'suite-launch.json'),JSON.stringify({worker:{provider:'fixture',model:'fixture-model',effort:'off'},projects:[],maxCalls:8,maxParallelWorkers:1,skills:[]}));
    const previous=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=launch;
    const wrapper=path.join(app,'reading-parent-fixture.ts');
    await fs.writeFile(wrapper,"import register from './suite-delegation.ts';\nexport default function(pi){register(pi,"+JSON.stringify(app)+','+JSON.stringify(info.home)+',()=>'+JSON.stringify(info.bundle)+',()=>'+JSON.stringify(info.project)+');}\n');
    const parentLoaded=await loader.loadExtensions([wrapper],info.project,events);
    assert.deepEqual(parentLoaded.errors,[]);const parentExtension=parentLoaded.extensions[0];
    const parentHooks=parentExtension.handlers,parentTools=new Map([...parentExtension.tools].map(([name,tool])=>[name,tool.definition]));
    if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;
    const parentSession=randomUUID(),parentContext={cwd:info.project,sessionManager:{getSessionId:()=>parentSession}};
    await parentHooks.get('session_start')[0]({},parentContext);
    assert(parentTools.get('delegate_tasks').parameters.properties.tasks.items.properties.evidenceScope.properties.questions);
    bus.on(api.SUBAGENT_DELEGATION_REQUEST_EVENT,request=>{
      void(async()=>{
        const child={cwd:request.cwd};
        await childTools.get('read_evidence').execute('delegated-read',{source:a.source,document:doc.id,mode:'passage',startLine:1,lines:1},undefined,undefined,child);
        await childTools.get('report_evidence_reading').execute('delegated-report',report,undefined,undefined,child);
        bus.emit(api.SUBAGENT_DELEGATION_RESPONSE_EVENT,{requestId:request.requestId,status:'completed',result:{text:'Analisi simulata del figlio con citazioni.'}});
      })().catch(error=>bus.emit(api.SUBAGENT_DELEGATION_RESPONSE_EVENT,{requestId:request.requestId,status:'failed',error:error.message}));
    });
    try{
      const result=parsed(await parentTools.get('delegate_tasks').execute('delegate',{plan:'Analisi documentale',tasks:[{...base,evidenceScope:scope}]},undefined,undefined,parentContext));
      assert.equal(result.state,'completed');assert.equal(result.tasks[0].evidenceReading.readCalls,1);
      assert.equal(result.tasks[0].evidenceReading.scope.focus,scope.focus);assert.equal(result.tasks[0].evidenceReading.reportMissing,false);
      assert.equal(result.tasks[0].evidenceReading.declaration.citations.length,1);
    }finally{await parentHooks.get('session_shutdown')[0]();}
  }
  console.log('Evidence reading: passed (pinned scope, full/section/passage autonomy, Unicode pagination, actual coverage, unread reasons, validated citations, integrity, corpus exploration, legacy tasks'+(process.env.EVIDENCE_RUNTIME_APP?', real Pi extension loader and simulated delegation events':'')+').');
})().catch(error=>{console.error(error);process.exitCode=1;});
