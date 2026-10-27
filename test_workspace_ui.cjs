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
from suite import Suite,Server
from suite_sources import write as save_json
from suite_graph import build_graph
home=Path(sys.argv[1]);repo=home/'repo';repo.mkdir(parents=True)
(repo/'main.py').write_text('def saluta():\\n    return "ciao"\\n')
app=Suite(home/'data');app.catalog=[]
p=app.add_project(str(repo),'Progetto con file');empty=app.add_project(name='Progetto vuoto')
save_json(app.home/'graphs'/p['id']/'graph.json',build_graph(repo,app.cache,prefix='repo/'))
app.start('prepare-asis',{'project':p['id'],'graphs':['project:'+p['id']],'openChat':False})
while app.busy:time.sleep(.02)
assert app.job['state']=='done',app.job
folder=Path(app.job['result']['workspace']);(folder/'AS-IS.md').write_text('# AS-IS del progetto\\nContenuto salvato.')
server=Server(('127.0.0.1',0),app,'workspace-test-token')
print(json.dumps({'url':'http://127.0.0.1:'+str(server.server_port),'project':p['id'],'empty':empty['id']}),flush=True)
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
    assert.deepEqual(errors,[]);console.log('Workspace UI: passed (empty state, selection, persisted files, project isolation, backend guard, desktop/mobile). Screenshots: '+home);
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
