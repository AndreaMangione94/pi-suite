const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');

const {chromium}=require('playwright-core');

(async()=>{

 const work=path.resolve('tests/tmp/documentazione-tecnico-funzionale-modal-check');fs.mkdirSync(work,{recursive:true});process.env.TEMP=work;process.env.TMP=work;

 let files=[],calls=[],job={id:'idle',state:'idle'},busy=false,docText='# documentazione tecnico funzionale prodotto';

 const graph={id:'saved:doc',name:'Grafo documentale',kind:'document',createdAt:1700000000,path:'graph.json'};

 const project={id:'demo',name:'Demo',path:'C:\\Demo',graph:null,workspace:{}};

 const settings={providers:[],roles:{},projects:[project],skills:[],enabledSkills:[],maxCalls:24,maxParallelWorkers:2,modelChecks:{}};

 const server=http.createServer(async(req,res)=>{

  const u=new URL(req.url,'http://localhost');let result;

  if(req.method==='POST'){

   let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);calls.push([u.pathname,data]);

   if(u.pathname==='/api/project-references'){assert.equal(data.section,'documentation');project.workspace.documentation=data.references;result=project.workspace;}

   else if(u.pathname==='/api/sources')result=[{id:'source:docs',name:data.name}];

   else if(u.pathname==='/api/action'){assert.ok(['prepare-documentation','auto-documentation'].includes(data.operation));job={id:String(calls.length),state:'running',operation:data.operation};busy=true;result=job;}

   else throw Error('Unexpected write '+u.pathname);

  }else if(u.pathname==='/api/state')result={settings,busy,job};

  else if(u.pathname==='/api/models'||u.pathname==='/api/sources')result=[];

  else if(u.pathname==='/api/project')result=project;

  else if(u.pathname==='/api/project-files')result={graphs:[graph],documentation:files};

  else if(u.pathname==='/api/project-file')result={text:docText};

  else {const f=path.join('suite-ui',u.pathname==='/'?'index.html':u.pathname.slice(1));if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));return;}

  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));

 });

 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;

 try{browser=await chromium.launch({channel:'msedge',headless:true});for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){

  files=[];calls=[];busy=false;job={id:'idle',state:'idle'};project.workspace={};docText='# documentazione tecnico funzionale prodotto';

  const errors=[];const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));

  await page.goto(`http://127.0.0.1:${server.address().port}/#test`);await page.waitForFunction(()=>document.querySelector('#setup').children.length===3);

  await page.locator('#open-project').click();await page.locator('[data-project-id=demo]').click();await page.locator('#open-documentation').click();
  assert.equal(await page.locator('#configure-documentation').isDisabled(),true);
  await page.locator('#add-documentation-source').click();await page.locator('#source-name').fill('Documentazione selezionata');await page.locator('#generate-graph').click();
  await page.waitForFunction(()=>!document.querySelector('#graph-dialog').open);
  assert.equal(await page.locator('#configure-documentation').isEnabled(),true);
  await page.locator('#open-documentation').click();await page.locator('#configure-documentation').click();const dialog=page.locator('#documentation-dialog');await dialog.waitFor({state:'visible'});

  assert.equal(await page.locator('#documentation-graph-list input').isChecked(),false);

  assert.deepEqual(await dialog.locator('.dialog-body > section > h2').allTextContents(),['Documentazione tecnico funzionale salvata','Crea una documentazione tecnico funzionale']);

  assert.equal(await dialog.locator('.dialog-footer').count(),0);assert.equal(await dialog.getByRole('button',{name:'Salva riferimenti',exact:true}).count(),0);assert.equal(await dialog.locator('#documentation-create-form').evaluate(n=>!!n.closest('.card')),false);

  await page.locator('#documentation-name').fill('documentazione tecnico funzionale gestionale');await page.locator('#documentation-objective').fill('Descrivi i processi');await page.locator('#documentation-refresh-sources').check();

  await page.waitForFunction(()=>document.querySelector('#documentation-save-state').textContent==='Impostazioni salvate automaticamente.');

  assert.equal(project.workspace.documentation.name,'documentazione tecnico funzionale gestionale');assert.equal(project.workspace.documentation.refreshSources,true);

  await dialog.getByRole('button',{name:'Chiudi Documentazione tecnico funzionale',exact:true}).click();await page.locator('#open-documentation').click();await page.locator('#configure-documentation').click();await page.waitForFunction(()=>document.querySelector('#generate-documentation').disabled===false);

  assert.equal(await page.locator('#documentation-name').inputValue(),'documentazione tecnico funzionale gestionale');assert.equal(await page.locator('#documentation-refresh-sources').isChecked(),true);

  await page.screenshot({path:path.join(work,`creation-${viewport.width}.png`),fullPage:true});

  const started=page.waitForResponse(r=>r.url().endsWith('/api/action'));await page.locator('#generate-documentation').click();await started;await page.waitForFunction(()=>state.busy);

  assert.equal(await dialog.isVisible(),true);const action=calls.find(([route])=>route==='/api/action')[1];assert.equal(action.operation,'auto-documentation');assert.equal(action.name,'documentazione tecnico funzionale gestionale');assert.deepEqual(action.graphs,[]);

  await page.locator('#documentation-objective').fill('Obiettivo modificato durante la generazione');await new Promise(r=>setTimeout(r,400));

  job={...job,state:'done',result:{project:'demo',workspace:'C:\\Dossier'}};busy=false;await page.evaluate(()=>refresh());assert.equal(files.length,0);

  assert.equal(project.workspace.documentation.objective,'Obiettivo modificato durante la generazione');

  files=[{id:'documentation:dossier:DOCUMENTAZIONE-TECNICO-FUNZIONALE.md',name:'documentazione tecnico funzionale gestionale',createdAt:1700000000,modifiedAt:1,path:'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md'}];await page.evaluate(()=>refresh());

  assert.equal(await page.locator('#documentation-saved-files .saved-file').count(),1);assert.equal(await page.locator('#documentation-explore-title, #documentation-explorer, #documentation-file-preview').count(),0);

  docText='# documentazione tecnico funzionale aggiornato';files[0].modifiedAt=2;await page.evaluate(()=>refresh());assert.equal(await page.locator('#documentation-saved-files .saved-file').count(),1);

  assert.equal(await page.locator('#documentation-saved-files button').count(),0);

  await dialog.getByRole('button',{name:'Chiudi Documentazione tecnico funzionale',exact:true}).click();await page.locator('#open-documentation').click();await page.locator('#configure-documentation').click();await page.waitForFunction(()=>document.querySelector('#documentation-dialog').open);

  assert.equal(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth),true);assert.deepEqual(errors,[]);await page.close();console.log(`documentazione tecnico funzionale modal ${viewport.width}px: sections, one CTA, autosave, pending edits, generation in modal, document discovery and no exploration section OK`);

 }}finally{await browser?.close();await new Promise(r=>server.close(r));}

})().catch(e=>{console.error(e);process.exitCode=1;});

