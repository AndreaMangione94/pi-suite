const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const home=path.join(__dirname,'.test-suite','folder-picker-'+Date.now());
  const script=`
import json,sys
from pathlib import Path
from suite import Suite,Server
home=Path(sys.argv[1]);app=Suite(home);app.catalog=[]
project=app.add_project(name='Picker test')
server=Server(('127.0.0.1',0),app,'picker-test-token')
print(json.dumps({'url':'http://127.0.0.1:'+str(server.server_port),'project':project['id']}),flush=True)
server.serve_forever()
`;
  const server=spawn(process.env.WORKSPACE_PYTHON||'python',['-u','-c',script,home],{cwd:__dirname,windowsHide:true});
  let output='',log='',browser;
  server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>log+=b);
  try{
    let marker;for(let i=0;i<100;i++){try{marker=JSON.parse(output.trim());break;}catch{await new Promise(r=>setTimeout(r,100));}}
    assert(marker,'Fixture failed: '+log);
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    let result={path:'C:\\Dati è\\Cartella con spazi'},delay=false,release;
    await page.route('**/api/folder',async route=>{
      requests.push(route.request().postDataJSON());
      if(delay)await new Promise(r=>release=r);
      await route.fulfill({status:result.error?400:200,contentType:'application/json',body:JSON.stringify(result)});
    });
    await page.goto(marker.url+'/#picker-test-token');
    await page.locator('#project option[value="'+marker.project+'"]').waitFor({state:'attached'});
    // Authenticated native endpoints remain inaccessible to other pages.
    assert.equal((await page.request.post(marker.url+'/api/folder',{data:{}})).status(),401);
    await page.locator('#new-project').click();await page.locator('#browse-project').click();
    await page.waitForFunction(()=>document.querySelector('#project-path').value.includes('Cartella con spazi'));
    assert.equal(requests.at(-1).context,'project');
    assert.equal(await page.locator('#project-name').inputValue(),'Cartella con spazi');
    result={path:''};await page.locator('#project-path').click();
    await page.waitForFunction(()=>!document.querySelector('#browse-project').disabled);
    assert.equal(await page.locator('#project-path').inputValue(),'C:\\Dati è\\Cartella con spazi');
    assert.equal(requests.at(-1).initialPath,'C:\\Dati è\\Cartella con spazi');
    result={error:'Selettore non disponibile'};await page.locator('#browse-project').click();
    await page.locator('#project-dialog [data-modal-notice]').filter({hasText:result.error}).waitFor();
    assert(await page.locator('#browse-project').isEnabled());
    result={path:'C:\\Dati è\\Selezionata'};delay=true;
    await page.locator('#browse-project').click();
    await page.waitForFunction(()=>document.querySelector('#browse-project').disabled);
    assert(await page.locator('#create-project').isDisabled());
    const count=requests.length;await page.locator('#project-path').click();assert.equal(requests.length,count);
    await page.locator('#project-dialog [data-close-dialog]').first().click();release();delay=false;
    await page.waitForFunction(()=>!document.querySelector('#browse-project').disabled);
    assert.equal(await page.locator('#project-path').inputValue(),'C:\\Dati è\\Cartella con spazi');
    await page.locator('#project').selectOption(marker.project);await page.locator('#open-graph').click();
    await page.locator('#graph-dialog details').filter({hasText:'Collega una cartella o un repository'}).locator('summary').click();
    for(const kind of ['sharepoint-local','onedrive-local','azure-local']){
      await page.locator('#source-kind').selectOption(kind);
      await page.locator('#source-path').fill('');await page.locator('#browse-source').click();
      await page.waitForFunction(()=>document.querySelector('#source-path').value.includes('Selezionata'));
      assert.equal(requests.at(-1).context,'source');
    }
    result={path:'C:\\Dati è\\Dal campo'};await page.locator('#source-path').click();
    await page.waitForFunction(()=>document.querySelector('#source-path').value.includes('Dal campo'));
    await page.locator('#source-kind').selectOption('onedrive-graph');assert(await page.locator('#browse-source').isHidden());
    await page.locator('#graph-dialog [data-close-dialog]').first().click();await page.locator('#open-asis').click();
    result={path:'C:\\Dossier è\\AS-IS'};await page.locator('#browse-dossier').click();
    await page.waitForFunction(()=>document.querySelector('#dossier-workspace').value.includes('AS-IS'));
    assert.equal(requests.at(-1).context,'dossier');
    result={path:''};await page.locator('#dossier-workspace').press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#browse-dossier').disabled);
    assert.equal(await page.locator('#dossier-workspace').inputValue(),'C:\\Dossier è\\AS-IS');
    await page.setViewportSize({width:390,height:844});
    await page.locator('#browse-dossier').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await fs.mkdir(home,{recursive:true});await page.screenshot({path:path.join(home,'picker-mobile.png')});
    assert.deepEqual(errors,[]);
    console.log('Folder picker UI passed: all contexts, field/button/keyboard, Unicode, cancel, error/retry, duplicate prevention, closed dialog, auth, mobile.');
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
