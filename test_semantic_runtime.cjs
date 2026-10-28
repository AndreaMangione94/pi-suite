// Exercise the real Pi adapter against a local, simulated OpenAI-compatible provider.
const http=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');

(async()=>{
  const app=process.env.SEMANTIC_RUNTIME_APP||__dirname,python=process.env.WORKSPACE_PYTHON||path.join(app,'.venv','Scripts','python.exe');
  const home=path.join(app,'.test-suite','runtime-'+randomUUID().slice(0,8));
  let requests=0;const tools=[],providerErrors=[];
  const server=http.createServer(async(req,res)=>{
    try{
      let raw='';for await(const chunk of req)raw+=chunk;
      const body=JSON.parse(raw);requests++;assert.equal(req.url,'/v1/chat/completions');assert(!req.headers.authorization);
      const message=body.messages.find(m=>m.role==='user');
      const text=typeof message.content==='string'?message.content:message.content.map(c=>c.text||'').join('');
      const task=JSON.parse(text),context=task.context,called=body.messages.filter(m=>m.role==='tool');
      const assistantCalls=body.messages.filter(m=>m.role==='assistant').flatMap(m=>m.tool_calls||[]).map(t=>t.function.name);
      let call;
      if(!called.length){
        call=task.phase==='documents'?{name:'read_evidence',args:{source:context.source,document:context.document,mode:'full',maxChars:2000}}:{name:'read_draft_document_graph',args:{query:'Processo',limit:8}};
      }else if(!assistantCalls.includes('submit_document_graph')){
        let nodes=[],edges=[];
        if(task.phase==='documents'){
          const quote=context.text.trim();const evidence=[{source:context.source,document:context.document,startLine:context.startLine,endLine:context.endLine,quote}];
          nodes=[{key:'concept',label:'Processo '+path.parse(context.path).name,kind:'process',summary:quote,evidence}];
        }else if(context.concepts.length>1){
          const [a,b]=context.concepts;
          const evidence=[a,b].flatMap(n=>n.evidence.slice(0,1)).map(e=>Object.fromEntries(['source','document','startLine','endLine','quote'].map(k=>[k,e[k]])));
          edges=[{source:a.id,target:b.id,relation:'feeds',reason:'Relazione restituita dal provider simulato durante la sintesi.',evidence}];
        }
        call={name:'submit_document_graph',args:{nodes,edges,notes:'Provider locale simulato per verificare il protocollo.'}};
      }
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      const emit=(delta,finish=null)=>res.write('data: '+JSON.stringify({id:'chatcmpl-test',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:body.model,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n');
      if(call){tools.push(call.name);emit({role:'assistant',tool_calls:[{index:0,id:'call_'+randomUUID().replaceAll('-',''),type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]});emit({},'tool_calls');}
      else{emit({role:'assistant',content:'Consegna completata.'});emit({},'stop');}
      res.end('data: [DONE]\n\n');
    }catch(error){providerErrors.push(error.message);res.writeHead(500);res.end(JSON.stringify({error:{message:error.message}}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const worker=`
import json,sys,os
from pathlib import Path
from suite import Suite
from suite_document_graph import current_ref
home=Path(sys.argv[1]);home.mkdir(parents=True);app=Suite(home/'data')
config=json.loads(Path('models.config.example.json').read_text(encoding='utf-8'))
connection=config['connections'][0];connection['baseUrl']='http://127.0.0.1:'+sys.argv[2]+'/v1';connection['models'][0]['id']='fixture-model';connection['models'][0]['capabilities']['vision']=False
config['profiles']={'orchestrator':{'connectionId':connection['id'],'modelId':'fixture-model','effort':'off'}}
app._commit_byok(config)
repo=home/'repo';repo.mkdir();(repo/'main.py').write_text('def run(): return 1\\n',encoding='utf-8');pid=app.add_project(str(repo),'Ordini')['id']
docs=home/'docs';docs.mkdir();(docs/'portale.txt').write_text('Il portale raccoglie le richieste di acquisto.',encoding='utf-8');(docs/'ordini.txt').write_text('Il servizio ordini elabora le richieste ricevute.',encoding='utf-8')
sid=app.sources.save({'name':'Documenti','kind':'sharepoint-local','path':str(docs)})[-1]['id'];app.save_project_references(pid,'graph',{'sources':[sid]})
first=app.build_document_graph(pid,[sid]);second=app.build_document_graph(pid,[sid]);assert second['stats']['cachedPasses']==3
code=app.sources.save({'name':'Codebase','kind':'sharepoint-local','path':str(repo)})[-1]['id'];app.sources.sync(code)
result=app.prepare_documented_asis([sid,code],'Ordini',False,pid,current_ref(app.home,pid))
assert first['stats']['semanticNodes']==2 and first['stats']['semanticEdges']==1
print(json.dumps({'home':str(app.home),'workspace':result['workspace'],'stats':second['stats'],'version':result['documentGraph']['version']}),flush=True)
`;
  try{
    const output=await new Promise((resolve,reject)=>{
      const child=spawn(python,['-u','-c',worker,home,String(server.address().port)],{cwd:app,windowsHide:true,env:{...process.env,PI_SUITE_PYTHON:python}});
      let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('Runtime test timed out'));},90000);
      child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
      child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code?reject(Error(err||out)):resolve(out);});
    });
    const result=JSON.parse(output);
    const {sourceBundle,connectedTools}=await import(pathToFileURL(path.join(app,'connected-sources.mjs')).href);
    const {knowledgeTools}=await import(pathToFileURL(path.join(app,'evidence-tools.mjs')).href);
    const refs=sourceBundle(result.home,result.workspace);process.env.PI_SUITE_PYTHON=python;
    const semantic=JSON.parse((await knowledgeTools(refs,{home:result.home}).find(t=>t.name==='document_graph').execute('graph',{query:'Processo'})).content[0].text);
    const code=JSON.parse((await connectedTools(refs).find(t=>t.name==='connected_graph').execute('code',{query:'run'})).content[0].text);
    assert.equal(semantic.version,result.version);assert.equal(semantic.stats.semanticEdges,1);assert(code.graphs.some(g=>g.nodes.length));
    assert(tools.includes('read_evidence'));assert(tools.includes('read_draft_document_graph'));assert.equal(tools.filter(t=>t==='submit_document_graph').length,3);
    console.log('Semantic runtime: passed (real Pi adapter, simulated local provider, evidence tools, cross-document synthesis, cache reuse, pinned AS-IS graph and codebase). HTTP requests: '+requests);
  }catch(error){throw Error(error.message+'\nProvider requests: '+requests+'; simulated-provider errors: '+JSON.stringify(providerErrors));}
  finally{server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
