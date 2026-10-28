const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const home=path.join(__dirname,'.test-suite','workspace-ui-'+Date.now());
  const script=`
import json,sys,time
from pathlib import Path
from suite import Server
from test_document_graph import ModelFixtureSuite as Suite
from suite_sources import write as save_json
from suite_graph import build_graph
home=Path(sys.argv[1]);repo=home/'repo';repo.mkdir(parents=True)
(repo/'main.py').write_text('def saluta():\\n    return "ciao"\\n')
app=Suite(home/'data');app.catalog=[]
app.settings['roles']['orchestrator']={'provider':'fixture','model':'simulated-model','effort':'off'}
p=app.add_project(str(repo),'Progetto con file');empty=app.add_project(name='Progetto vuoto')
save_json(app.home/'graphs'/p['id']/'graph.json',build_graph(repo,app.cache,prefix='repo/'))
app.start('prepare-asis',{'project':p['id'],'graphs':['project:'+p['id']],'openChat':False})
while app.busy:time.sleep(.02)
assert app.job['state']=='done',app.job
folder=Path(app.job['result']['workspace']);(folder/'AS-IS.md').write_text('# AS-IS del progetto\\nContenuto salvato.')
docs=home/'sharepoint';docs.mkdir();(docs/'specifica.md').write_text('# Requisiti ordini\\nREQ-42: approvazione ordine.')
server=Server(('127.0.0.1',0),app,'workspace-test-token')
print(json.dumps({'url':'http://127.0.0.1:'+str(server.server_port),'project':p['id'],'empty':empty['id'],'documents':str(docs)}),flush=True)
server.serve_forever()
`;
  const server=spawn(process.env.WORKSPACE_PYTHON||'python',['-u','-c',script,home],{cwd:__dirname,windowsHide:true});
  let output='',log='',browser;server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>log+=b);
  try{
    let marker;for(let i=0;i<100;i++){try{marker=JSON.parse(output.trim());break;}catch{await new Promise(r=>setTimeout(r,100));}}
    assert(marker,'Fixture failed: '+log);
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(marker.url+'/#workspace-test-token');
    await page.locator('#project option').filter({hasText:'Progetto vuoto'}).waitFor({state:'attached'});
    await page.locator('#project').selectOption(marker.empty);await page.locator('#open-asis').click();
    await page.locator('#asis-graph-help').filter({hasText:'crea prima'}).waitFor();
    assert(await page.locator('#auto-asis').isDisabled());assert(await page.locator('#prepare-asis').isDisabled());
    const headers={'X-Suite-Token':'workspace-test-token'};
    let response=await page.request.post(marker.url+'/api/action',{headers,data:{operation:'auto-asis',project:marker.empty,graphs:['project:'+marker.project],openChat:false}});
    assert.equal(response.status(),400);
    await page.locator('#asis-open-graphs').click();await page.getByRole('heading',{name:'Che cos’è un grafo di conoscenza?'}).waitFor();
    assert((await page.locator('.graph-explanation').textContent()).includes('deterministico'));
    await page.locator('#graph-dialog [data-close-dialog]').first().click();
    await page.locator('#project').selectOption(marker.project);await page.locator('#open-asis').click();
    await page.locator('#asis-saved-files .saved-file').waitFor();
    assert((await page.locator('#asis-saved-files').textContent()).includes('AS-IS.md'));assert(await page.locator('#asis-saved-files time').getAttribute('datetime'));
    assert(await page.locator('#auto-asis').isDisabled());
    await page.locator('#asis-graph-list input').first().check();assert(await page.locator('#auto-asis').isEnabled());
    await page.locator('#asis-saved-files button').click();await page.locator('#asis-file-preview pre').filter({hasText:'Contenuto salvato.'}).waitFor();
    await page.locator('#save-asis-references').click();
    await page.screenshot({path:path.join(home,'asis-desktop.png')});
    await page.locator('#asis-dialog [data-close-dialog]').first().click();await page.locator('#open-asis').click();
    await page.waitForFunction(()=>document.querySelector('#asis-graph-list input')?.checked);
    assert(await page.locator('#auto-asis').isEnabled());
    await page.locator('#asis-dialog [data-close-dialog]').first().click();await page.locator('#open-graph').click();
    await page.locator('#graph-saved-files .saved-file').first().waitFor();
    await page.screenshot({path:path.join(home,'graphs-desktop.png')});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(home,'graphs-mobile.png')});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#graph-dialog [data-close-dialog]').first().click();await page.locator('#project').selectOption(marker.empty);await page.locator('#open-asis').click();
    await page.locator('#asis-graph-help').filter({hasText:'crea prima'}).waitFor();assert.equal(await page.locator('#asis-saved-files .saved-file').count(),0);
    assert.equal(await page.locator('#asis-dialog #source-name').count(),0);
    assert.equal(await page.locator('#asis-dialog #index-sources').count(),0);
    await page.locator('#asis-open-graphs').click();
    await page.locator('#graph-dialog details').filter({hasText:'Collega una cartella o un repository'}).locator('summary').click();
    await page.locator('#source-name').fill('Documenti SharePoint');await page.locator('#source-path').fill(marker.documents);
    await page.locator('#save-source').click();
    await page.locator('#source-list').filter({hasText:'Documenti SharePoint'}).waitFor();
    assert(await page.getByRole('checkbox',{name:'Documenti SharePoint'}).isChecked());
    await page.locator('#build-document-graphs').click();
    await page.waitForFunction(()=>{const panel=document.querySelector('#graph-job-panel');return panel?.dataset.operation==='document-graphs'&&panel.dataset.state==='done';});
    assert(await page.locator('#graph-dialog').isVisible());
    await page.locator('#graph-saved-files').filter({hasText:'Grafo documentale'}).waitFor();
    assert.equal(await page.locator('#asis-saved-files .saved-file').count(),0);
    await page.locator('#document-graph-search').fill('Processo');await page.locator('#search-document-graph').click();
    await page.locator('#document-graph-results').filter({hasText:'Concetto ricostruito dal modello'}).waitFor();
    await page.locator('#document-graph-results').getByRole('button',{name:'Leggi documento originale'}).first().click();
    await page.locator('#document-graph-reader pre').filter({hasText:'REQ-42'}).waitFor();
    await page.setViewportSize({width:1365,height:1000});await page.locator('#document-graph-view-title').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(home,'semantic-graph-desktop.png')});
    await page.setViewportSize({width:390,height:844});await page.locator('#document-graph-results').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(home,'semantic-graph-mobile.png')});
    assert(await page.locator('#graph-dialog .dialog-body').evaluate(e=>e.scrollWidth<=e.clientWidth));
    await page.locator('#graph-dialog details').filter({hasText:'Ricerca e indici delle fonti'}).locator('summary').first().click();
    await page.locator('#evidence-query').fill('REQ-42');await page.locator('#evidence-search').click();
    await page.locator('#evidence-results').filter({hasText:'approvazione ordine'}).waitFor();
    await page.getByRole('button',{name:'Leggi fonte completa'}).first().click();
    await page.locator('#evidence-reader pre').filter({hasText:'REQ-42'}).waitFor();
    await page.locator('#save-graph-references').click();
    await page.screenshot({path:path.join(home,'document-graphs-mobile.png')});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#graph-dialog [data-close-dialog]').first().click();await page.locator('#open-asis').click();
    await page.waitForFunction(()=>document.querySelector('#asis-graph-list input')?.checked);
    assert(await page.locator('#prepare-asis').isEnabled());
    await page.locator('#asis-objective').fill('Ricostruisci gli ordini');await page.locator('#save-asis-references').click();
    await page.locator('#asis-dialog [data-close-dialog]').first().click();await page.reload();
    await page.locator('#project').selectOption(marker.empty);await page.locator('#open-graph').click();
    await page.locator('#source-list input:checked').waitFor();assert.equal(await page.locator('#evidence-query').inputValue(),'REQ-42');
    await page.locator('#graph-dialog [data-close-dialog]').first().click();await page.locator('#open-asis').click();
    await page.waitForFunction(()=>document.querySelector('#asis-graph-list input')?.checked);
    assert.equal(await page.locator('#asis-objective').inputValue(),'Ricostruisci gli ordini');
    const corpus=await page.request.get(marker.url+'/api/project?id='+marker.empty,{headers});
    const saved=await corpus.json();assert.equal(saved.workspace.graph.sources.length,1);
    assert.equal(saved.workspace.asis.graphs[0],'document:'+marker.empty);
    const {sourceBundle}=await import('./connected-sources.mjs');
    const refs=sourceBundle(path.join(home,'data'),saved.path);
    assert.equal(refs[0].source,saved.workspace.graph.sources[0]);
    assert(refs[0].documentGraph?.version);
    process.env.PI_SUITE_PYTHON=process.env.WORKSPACE_PYTHON;
    const {knowledgeTools}=await import('./evidence-tools.mjs');
    const semantic=JSON.parse((await knowledgeTools(refs,{home:path.join(home,'data')}).find(t=>t.name==='document_graph').execute('test',{query:'Processo'})).content[0].text);
    assert.equal(semantic.version,refs[0].documentGraph.version);assert(semantic.stats.semanticNodes>0);
    const dossier=path.join(home,'test-dossier');await fs.mkdir(dossier);
    await fs.writeFile(path.join(dossier,'FONTI.json'),JSON.stringify(refs));await fs.writeFile(path.join(dossier,'INCARICO-AS-IS.md'),'Analizza gli ordini.');
    const {prepareBatch,assignmentSystemPrompt,scopedTools}=await import('./delegation-core.mjs');
    const {evidenceReadingSummary}=await import('./evidence-reading.mjs');
    const batch=prepareBatch(path.join(home,'data'),dossier,[{title:'Analizza gli ordini',objective:'Ricostruisci il processo',context:'Fonti fissate',instructions:'Leggi le evidenze',constraints:'Solo analisi',acceptance:'Citazioni valide',deliverable:'Risposta con evidenze',writeFiles:[]}],{projects:[],connectedSources:refs},'Analisi AS-IS');
    const contract=JSON.parse(await fs.readFile(path.join(batch.batch.tasks[0].directory,'contract.json'),'utf8'));
    assert.equal(contract.asis,true);
    const prompt=assignmentSystemPrompt('Analizza le fonti.',batch.batch.tasks[0].directory);
    assert(prompt.indexOf('grafo documentale')<prompt.indexOf('grafo del codice'));
    assert.equal(contract.evidenceScope.choice,'subagent');
    const task=batch.batch.tasks[0],document=refs[0].manifest.documents[0],tools=scopedTools(task.directory);
    await tools.find(t=>t.name==='read_evidence').execute('read',{source:refs[0].source,document:document.id,mode:'full'});
    await tools.find(t=>t.name==='report_evidence_reading').execute('report',{summary:'Analisi degli ordini con evidenze lette.',citations:[{source:refs[0].source,document:document.id,startLine:1,endLine:1}],unreadDocuments:[],uncertainties:[],scopeExpansionRequests:[]});
    task.evidenceReading=evidenceReadingSummary(task.directory,contract);task.state='completed';task.result={result:{text:'Analisi completata con citazioni.'}};batch.batch.state='completed';
    await fs.writeFile(path.join(batch.root,'batch.json'),JSON.stringify(batch.batch));
    await page.locator('#asis-dialog [data-close-dialog]').first().click();await page.locator('[data-page="runs"]').click();
    await page.locator('#delegation-list > .card > details > summary').first().click();
    await page.getByRole('heading',{name:'Copertura delle evidenze'}).waitFor();
    assert((await page.locator('#delegation-list').textContent()).includes('testi disponibili letti integralmente: 1'));
    assert.deepEqual(errors,[]);console.log('Workspace UI: passed (semantic graph generation, search, original evidence, pinned model tools, AS-IS selection, project isolation, desktop/mobile). Screenshots: '+home);
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
