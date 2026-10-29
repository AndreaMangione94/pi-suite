const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
  const home=path.join(__dirname,'.test-suite','judge-ui-'+Date.now());
  const script=`
import json,sys
from pathlib import Path
from suite import Suite,Server
from suite_benchmarks import measurements
from suite_inspect import check_answer
app=Suite(Path(sys.argv[1]));app.catalog=[]
b=app.benchmarks
c=next(c for c in b.all('case') if c['key']=='math-001')
t=b.trial({'caseId':c['id']})
empty=b.trial({'caseId':c['id']})
d=measurements({})
d['tokens']={'status':'measured','value':120,'origin':'harness_export','measure':'Token totali osservati','unit':'token','method':'Contatore','evidence':'usage.json','note':''}
for key,value in check_answer(c,' 25\\n')[0].items():
 d[key]={'status':'measured','value':value,'origin':'runner','measure':'Fixture deterministica','unit':'0/1','method':'Fixture per il collaudo','evidence':'answer','note':''}
r=b.run({'trialId':t['id'],'architectureId':t['architectures'][0]['id'],'answer':' 25\\n','notes':'Risposta originale','dimensions':d,'outcome':'passed'})
server=Server(('127.0.0.1',0),app,'judge-test-token')
print(json.dumps({'url':'http://127.0.0.1:'+str(server.server_port),'trial':t,'emptyTrial':empty,'source':r}),flush=True)
server.serve_forever()
`;
  const server=spawn(process.env.WORKSPACE_PYTHON||'python',['-u','-c',script,home],{cwd:__dirname,windowsHide:true});
  let output='',log='',browser;
  server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>log+=b);
  try{
    let marker;for(let i=0;i<100;i++){try{marker=JSON.parse(output.trim());break;}catch{await new Promise(r=>setTimeout(r,100));}}
    assert(marker,'Fixture failed: '+log);
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const headers={'X-Suite-Token':'judge-test-token'},source=marker.source;
    const api=async route=>(await page.request.get(marker.url+'/api/benchmarks'+route,{headers})).json();
    const navigate=async(view,id)=>page.goto(marker.url+'/?page=benchmarks&view='+view+'&id='+encodeURIComponent(id)+'#judge-test-token');
    await navigate('trial',marker.emptyTrial.id);
    const exportButtons=page.getByRole('button',{name:'Esporta prova per valutatore esterno',exact:true});
    await exportButtons.first().waitFor();
    assert.equal(await exportButtons.count(),2);
    assert(await exportButtons.nth(0).isDisabled());assert(await exportButtons.nth(1).isDisabled());
    await navigate('run',source.id);
    await exportButtons.waitFor();assert(await exportButtons.isEnabled());
    await page.getByRole('button',{name:'Completa con valutazione LLM',exact:true}).click();
    await page.locator('#bench-judge-file').waitFor();
    const packet=await api('/judge-packet?run='+source.id);
    assert.equal(packet.dimensions.length,10);
    const waiting=page.waitForEvent('download');
    await exportButtons.click();
    const downloaded=await waiting,archive=await fs.readFile(await downloaded.path());
    assert(downloaded.suggestedFilename().endsWith('.zip'));
    const contents=JSON.parse(execFileSync(process.env.WORKSPACE_PYTHON||'python',['-c',
      "import io,sys,json,zipfile;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps({n:z.read(n).decode('utf-8') for n in z.namelist()}))"],
      {input:archive,windowsHide:true,encoding:'utf8'}));
    const folder=downloaded.suggestedFilename().slice(0,-4);
    assert.deepEqual(Object.keys(contents).sort(),['01-prova.md','02-risposta.json','03-istruzioni-valutatore.md'].map(name=>folder+'/'+name));
    const files=['01-prova.md','02-risposta.json','03-istruzioni-valutatore.md'].map(name=>({name,content:contents[folder+'/'+name]}));
    assert.equal(JSON.parse(files[1].content).answer,source.answer);
    assert.match(files[2].content,/Criteri riservati/);
    assert.match(files[2].content,/Invia questo comando/);
    assert.match(files[2].content,/"reportType": "pi-judge-v1"/);
    assert.equal(files[0].content,packet.testFile.content);
    const save=page.getByRole('button',{name:'Salva valutazione nella prova',exact:true});
    assert(await save.isDisabled());
    const report=structuredClone(packet.template);
    report.evaluator.model='Fixture judge 1';
    report.notes='Valutazione esterna simulata per il collaudo.';
    for(const m of Object.values(report.dimensions))m.note='Evidenze sufficienti non disponibili per questa dimensione.';
    report.dimensions.relevance={...report.dimensions.relevance,status:'measured',value:0.75,evidence:'answer e requisiti della prova',note:'Tre requisiti su quattro secondo la fixture di collaudo.'};
    report.dimensions.sources={...report.dimensions.sources,status:'not_applicable',value:null,note:'Il compito di calcolo non richiede citazioni.'};
    const upload=async value=>page.locator('#bench-judge-file').setInputFiles({name:'valutazione.md',mimeType:'text/plain',buffer:Buffer.from('\uFEFF```json\n'+JSON.stringify(value)+'\n```')});
    await upload({...report,answerSha256:'wrong'});
    await page.locator('#notice.error').filter({hasText:'answerSha256'}).waitFor();
    assert(await save.isDisabled());
    assert.equal((await api('')).runs.length,1);
    await upload({...report,dimensions:{...report.dimensions,tokens:source.dimensions.tokens}});
    await page.locator('#notice.error').filter({hasText:'dimensioni mancanti'}).waitFor();
    assert(await save.isDisabled());
    await upload(report);
    await page.getByRole('heading',{name:'Anteprima · valutatore Fixture judge 1'}).waitFor();
    assert.equal(await page.locator('#bench-judge-preview tbody tr').count(),16);
    assert.match(await page.locator('#bench-judge-preview').innerText(),/Giudizio LLM esterno/);
    assert.equal((await api('')).runs.length,1);
    await page.screenshot({path:path.join(home,'judge-desktop.png'),fullPage:true});
    await save.click();
    await page.getByRole('heading',{name:'Valutazione LLM · Fixture judge 1'}).waitFor();
    const savedId=new URL(page.url()).searchParams.get('id');
    const saved=await api('/record?kind=run&id='+savedId);
    assert.equal(saved.sourceRunId,source.id);
    assert.equal(saved.answer,source.answer);
    assert.equal(saved.notes,source.notes);
    assert.equal(saved.outcome,source.outcome);
    for(const key of ['tokens','performance','cost','task_success','correctness','constraints'])assert.deepEqual(saved.dimensions[key],source.dimensions[key]);
    assert.equal(saved.dimensions.relevance.value,0.75);
    assert.equal(saved.dimensions.relevance.origin,'model_judge');
    assert.deepEqual(saved.judgeEvaluations[0].report,report);
    assert.deepEqual(await api('/record?kind=run&id='+source.id),source);
    await page.reload();
    await page.getByRole('heading',{name:'Valutazione LLM · Fixture judge 1'}).waitFor();
    const next=await api('/judge-packet?run='+savedId);
    assert(!next.dimensions.includes('relevance'));
    assert(!next.dimensions.includes('sources'));
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Completa con valutazione LLM',exact:true}).click();
    await page.locator('#bench-judge-file').waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(home,'judge-mobile.png'),fullPage:true});
    await navigate('trial',marker.trial.id);
    await page.getByRole('heading',{name:'Schede delle esecuzioni',exact:true}).waitFor();
    assert(await page.getByRole('button',{name:'Valutazione LLM',exact:true}).count()===2);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const failure=await page.request.post(marker.url+'/api/benchmarks/run',{headers,data:{trialId:marker.emptyTrial.id,architectureId:marker.emptyTrial.architectures[0].id,
      answer:'',notes:'Nessuna risposta disponibile.',outcome:'failed',dimensions:Object.fromEntries(['tokens','performance','cost'].map(key=>[key,source.dimensions[key]]))}});
    assert.equal(failure.status(),200);const failed=await failure.json();
    await navigate('run',failed.id);await exportButtons.waitFor();assert(await exportButtons.isDisabled());
    assert.match(await exportButtons.getAttribute('title'),/Risposta del modello non disponibile/);
    const blocked=await page.request.get(marker.url+'/api/benchmarks/judge-archive?run='+failed.id,{headers});
    assert.equal(blocked.status(),400);
    await navigate('judge',failed.id);await exportButtons.waitFor();assert(await exportButtons.isDisabled());
    assert.equal(await page.locator('#bench-judge-file').count(),0);
    await page.screenshot({path:path.join(home,'judge-export-disabled.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Judge workflow UI passed: one ZIP with three resources, disabled export for missing resources, server guard, bound report, preview/import, preserved measurements, provenance, reload and mobile.');
    console.log('Screenshots: '+home);
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
