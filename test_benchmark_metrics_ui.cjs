const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
  const home=path.join(__dirname,'.test-suite','benchmark-metrics-'+Date.now());
  const script=`
import copy,json,sys,uuid
from pathlib import Path
from suite import Suite,Server
from suite_benchmarks import measurements
from suite_inspect import check_answer
app=Suite(Path(sys.argv[1]));app.catalog=[]
b=app.benchmarks
c=next(c for c in b.all('case') if c['key']=='math-001')
t=b.trial({'caseId':c['id']})
m={'status':'measured','value':1,'origin':'runner','measure':'Criteri soddisfatti','unit':'0/1','method':'Fixture deterministica','evidence':'Risposta 25','note':''}
r=b.run({'trialId':t['id'],'architectureId':t['architectures'][0]['id'],'answer':'25','notes':'','dimensions':{**measurements({}),'task_success':m},'outcome':'passed'})
def fixture_inspect(run,trial):
    result=copy.deepcopy(run)
    values,explanation=check_answer(trial['case'],run['answer'])
    for key in ('task_success','correctness','constraints'):
        result['dimensions'][key]=dict(m,value=values[key],note=explanation) if key in values else measurements({})[key]
    result.update(evaluator='Inspect AI / UI fixture',outcome='passed' if values['task_success'] else 'failed',provenance='Inspect UI fixture')
    result['evaluation']={'engine':'Inspect AI','scorer':'ui-fixture','modelCalls':0,'note':explanation,'sourceRunId':run['id']}
    folder=b.path.parent/'benchmark-evaluations'/uuid.uuid4().hex;folder.mkdir(parents=True)
    (folder/'output.json').write_text(json.dumps(result),encoding='utf-8')
    return folder.name,result
b._inspect=fixture_inspect
server=Server(('127.0.0.1',0),app,'benchmark-test-token')
print(json.dumps({'url':'http://127.0.0.1:'+str(server.server_port),'trial':t,'source':r['id']}),flush=True)
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
    const t=marker.trial,headers={'X-Suite-Token':'benchmark-test-token'};
    const open=async(view,id)=>{await page.goto(marker.url+'/?page=benchmarks&view='+view+'&id='+encodeURIComponent(id)+'#benchmark-test-token');await page.locator('#bench-report-file').waitFor();};
    const upload=async(id,r,markdown=false)=>page.locator(id).setInputFiles({name:markdown?'risposta.md':'risposta.json',mimeType:'text/plain',buffer:Buffer.from(markdown?'\uFEFFEcco il report:\n```json\n'+JSON.stringify(r)+'\n```':JSON.stringify(r))});
    const unavailable=note=>({status:'unavailable',value:null,origin:'chat_report',measure:'',unit:'',method:'',evidence:'',note});
    const token={status:'measured',value:123,origin:'chat_report',measure:'Token del solo orchestratore',unit:'token',method:'Lettura usage del ruolo orchestratore',evidence:'export.json: calls[0].usage',note:'Subagenti non esposti; totale completo non disponibile.'};
    const duration={status:'measured',value:3.5,origin:'harness_export',measure:'Durata della prova',unit:'s',method:'Fine meno inizio nel log',evidence:'trace.json: start=0, end=3.5',note:'Include il confezionamento del report.'};
    const report={caseId:t.case.id,caseVersion:t.case.version,answer:' 25\n',notes:'',outcome:'not_evaluated',dimensions:{tokens:token,performance:unavailable('L’harness non espone un timer.'),cost:unavailable('L’harness non espone il costo.')}};
    await open('runForm',t.id+'~A');
    await upload('#bench-report-file',report);
    await page.waitForFunction(()=>document.querySelector('#bench-tokens-value').value==='123');
    assert.equal(await page.locator('#bench-answer').inputValue(),report.answer);
    assert.equal(await page.locator('#bench-tokens-origin').inputValue(),'chat_report');
    const preview=page.locator('#bench-dimensions-preview');
    assert.equal(await preview.locator('tbody tr').count(),16);
    assert.match(await preview.innerText(),/123 token[\s\S]*Token del solo orchestratore/);
    assert.match(await preview.innerText(),/Subagenti non esposti; totale completo non disponibile/);
    assert.match(await preview.innerText(),/L’harness non espone un timer/);
    assert.equal(await page.locator('#bench-performance-value').inputValue(),'');
    // Reject malformed data before any field is replaced or coerced.
    for(const [value,evidence,message] of [['123',token.evidence,'valore numerico'],[true,token.evidence,'valore numerico'],[123,'','evidence obbligatorio']]){
      await upload('#bench-report-file',{...report,answer:'invalid replacement',dimensions:{...report.dimensions,tokens:{...token,value,evidence}}});
      await page.locator('#notice.error').filter({hasText:message}).waitFor();
      assert.equal(await page.locator('#bench-answer').inputValue(),report.answer);
      assert.equal(await page.locator('#bench-tokens-value').inputValue(),'123');
    }
    // Neither uploader can bypass the envelope, even with valid task JSON.
    for(const selector of ['#bench-report-file','#bench-answer-file']){
      for(const [invalid,message] of [[{answer:'replacement'},'obbligatorio'],[{...report,dimensions:{}},'dimensions.tokens'],[{...report,dimensions:{tokens:token,performance:report.dimensions.performance}},'dimensions.cost'],[{...report,dimensions:{...report.dimensions,tokens:{...token,value:-1}}},'negativo']]){
        await upload(selector,invalid);
        await page.locator('#notice.error').filter({hasText:message}).waitFor();
        assert.equal(await page.locator('#bench-answer').inputValue(),report.answer);
        assert.equal(await page.locator('#bench-tokens-value').inputValue(),'123');
      }
    }
    const rejected=await page.request.post(marker.url+'/api/benchmarks/run',{headers,data:{trialId:t.id,architectureId:t.architectures[0].id,answer:'bypass'}});
    assert.equal(rejected.status(),400);
    await upload('#bench-report-file',{...report,caseId:'wrong-case'});
    await page.locator('#notice.error').filter({hasText:'caso diverso'}).waitFor();
    // The ordinary answer uploader also extracts the report and its fenced JSON.
    await upload('#bench-answer-file',{...report,dimensions:{...report.dimensions,performance:duration}},true);
    await page.waitForFunction(()=>document.querySelector('#bench-performance-value').value==='3.5');
    assert.equal(await page.locator('#bench-answer').inputValue(),report.answer);
    await page.getByRole('button',{name:'Salva scheda esecuzione',exact:true}).click();
    await page.getByRole('button',{name:'Esporta scheda completa JSON'}).waitFor();
    const savedId=new URL(page.url()).searchParams.get('id');
    const saved=await (await page.request.get(marker.url+'/api/benchmarks/record?kind=run&id='+savedId,{headers})).json();
    assert.equal(saved.answer,report.answer);assert.equal(saved.dimensions.tokens.value,123);
    assert.equal(saved.dimensions.performance.value,3.5);assert.equal(saved.dimensions.cost.value,null);
    assert.match(await page.locator('.bench-table').innerText(),/Report della chat/);
    await page.reload();await page.getByRole('button',{name:'Esporta scheda completa JSON'}).waitFor();
    await page.screenshot({path:path.join(home,'metrics-desktop.png'),fullPage:true});
    // A metrics integration keeps scores on the same response, including provenance.
    await open('revise',marker.source);
    await upload('#bench-report-file',{...report,answer:'25'});
    await page.waitForFunction(()=>document.querySelector('#bench-tokens-value').value==='123');
    assert.equal(await page.locator('#bench-task_success-value').inputValue(),'1');
    assert.equal(await page.locator('#bench-task_success-origin').inputValue(),'runner');
    await upload('#bench-telemetry-file',{trialId:t.id,architectureId:t.architectures[0].id,dimensions:{performance:duration}});
    await page.waitForFunction(()=>document.querySelector('#bench-performance-value').value==='3.5');
    assert.equal(await page.locator('#bench-tokens-value').inputValue(),'123');
    assert.match(await preview.innerText(),/1 0\/1/);
    await page.getByRole('button',{name:'Salva scheda esecuzione',exact:true}).click();
    await page.getByRole('button',{name:'Esporta scheda completa JSON'}).waitFor();
    const revisedId=new URL(page.url()).searchParams.get('id');
    const revised=await (await page.request.get(marker.url+'/api/benchmarks/record?kind=run&id='+revisedId,{headers})).json();
    assert.equal(revised.sourceRunId,marker.source);assert.equal(revised.dimensions.task_success.origin,'runner');
    assert.equal(revised.dimensions.tokens.value,123);assert.equal(revised.dimensions.performance.origin,'harness_export');
    await open('revise',marker.source);
    await upload('#bench-report-file',{...report,answer:'26'});
    await page.waitForFunction(()=>document.querySelector('#bench-answer').value==='26');
    assert.equal(await page.locator('#bench-task_success-status').inputValue(),'unavailable');
    // Text and a task's ordinary JSON must be wrapped in the required report.
    await open('runForm',t.id+'~B');
    const raw='{ "persona": "Ada", "scadenza": "2030" }\n';
    for(const content of [raw,'Il totale è 25.']){
      await page.locator('#bench-answer-file').setInputFiles({name:'task.txt',mimeType:'text/plain',buffer:Buffer.from(content)});
      await page.locator('#notice.error').filter({hasText:content===raw?'obbligatorio':'Report obbligatorio'}).waitFor();
      assert.equal(await page.locator('#bench-answer').inputValue(),'');
    }
    await upload('#bench-answer-file',{...report,answer:raw});
    await page.waitForFunction(expected=>document.querySelector('#bench-answer').value===expected,raw);
    assert.equal(await page.locator('#bench-tokens-status').inputValue(),'measured');
    await page.setViewportSize({width:390,height:844});
    await upload('#bench-answer-file',report);
    await page.waitForFunction(()=>document.querySelector('#bench-tokens-value').value==='123');
    await preview.scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert(await preview.locator('table').evaluate(n=>n.getBoundingClientRect().width<=innerWidth));
    await page.screenshot({path:path.join(home,'metrics-mobile.png'),fullPage:true});
    await preview.locator('tr').filter({hasText:'Consumo token'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(home,'metrics-mobile-detail.png')});
    // Availability is simulated; previews use the server fixture, without models.
    await page.route('**/api/benchmarks',async route=>{
      const response=await route.fetch(),state=await response.json();state.inspectAvailable=true;
      await route.fulfill({response,json:state});
    });
    await open('runForm',t.id+'~B');
    assert.equal(await page.getByRole('button',{name:/Salva e valuta|Valuta con Inspect/}).count(),0);
    const before=await (await page.request.get(marker.url+'/api/benchmarks',{headers})).json();
    await upload('#bench-answer-file',report);
    await page.locator('#bench-inspect-status').filter({hasText:'Valutazione Inspect completata'}).waitFor();
    assert.equal(await page.locator('#bench-task_success-value').inputValue(),'1');
    const afterPreview=await (await page.request.get(marker.url+'/api/benchmarks',{headers})).json();
    assert.equal(afterPreview.runs.length,before.runs.length);
    await page.getByRole('button',{name:'Salva scheda esecuzione',exact:true}).click();
    await page.getByRole('button',{name:'Esporta scheda completa JSON'}).waitFor();
    const autoId=new URL(page.url()).searchParams.get('id');
    const auto=await (await page.request.get(marker.url+'/api/benchmarks/record?kind=run&id='+autoId,{headers})).json();
    assert.equal(auto.evaluation.modelCalls,0);assert.equal(auto.answer,report.answer);
    assert.equal(auto.dimensions.task_success.origin,'runner');assert.equal(auto.dimensions.tokens.value,123);
    assert(!auto.sourceRunId);assert(!auto.evaluation.sourceRunId);
    // A late score cannot replace the score for a later upload.
    await open('runForm',t.id+'~B');
    let releaseFirst,startedFirst;
    const held=new Promise(resolve=>releaseFirst=resolve),started=new Promise(resolve=>startedFirst=resolve);
    let hold=true,fail=false;
    await page.route('**/api/benchmarks/preview-score',async route=>{
      if(fail){await route.fulfill({status:500,json:{error:'Runner non disponibile'}});return;}
      if(hold){hold=false;startedFirst();await held;}
      await route.continue();
    });
    await upload('#bench-report-file',{...report,answer:'25'});await started;
    assert(await page.getByRole('button',{name:'Salva scheda esecuzione',exact:true}).isDisabled());
    await upload('#bench-answer-file',{...report,answer:'26'});
    await page.waitForFunction(()=>document.querySelector('#bench-task_success-value').value==='0');
    releaseFirst();
    await page.waitForFunction(()=>!document.querySelector('#benchmark-root button[type="submit"]').disabled);
    assert.equal(await page.locator('#bench-answer').inputValue(),'26');
    assert.equal(await page.locator('#bench-task_success-value').inputValue(),'0');
    await page.locator('#bench-answer').fill('27');
    assert.equal(await page.locator('#bench-task_success-status').inputValue(),'unavailable');
    fail=true;await upload('#bench-report-file',report);
    await page.locator('#bench-inspect-status').filter({hasText:'Valutazione Inspect non riuscita'}).waitFor();
    assert.equal(await page.locator('#bench-answer').inputValue(),report.answer);
    assert(await page.getByRole('button',{name:'Salva scheda esecuzione',exact:true}).isEnabled());
    assert.deepEqual(errors,[]);
    console.log('Benchmark report UI passed: mandatory envelope on both uploaders and API, explicit token/time/cost fields, fenced JSON/BOM, exact answer, rejection without mutation, persistence, score integration, revisions and mobile.');
    console.log('Screenshots: '+home);
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
