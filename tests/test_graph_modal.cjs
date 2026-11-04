const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
(async()=>{
 const work=path.resolve('tests/tmp/graph-modal-check');fs.mkdirSync(work,{recursive:true});process.env.TEMP=work;process.env.TMP=work;
 let graphs=[],calls=[],job={id:'idle',state:'idle'},busy=false;
 const project={id:'demo',name:'Demo',path:'C:\\Demo',graph:null,workspace:{documentation:{graphs:[],documents:[]}}};
 const settings={providers:[],roles:{},projects:[project],skills:[],enabledSkills:[],maxCalls:24,maxParallelWorkers:2,modelChecks:{}};
 const server=http.createServer(async(req,res)=>{
  try{
   const u=new URL(req.url,'http://localhost');let result;
   if(req.method==='POST'){
    let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);calls.push([u.pathname,data]);
    if(u.pathname==='/api/action'){
     assert.equal(data.operation,'generate-graph');assert.equal(data.source,undefined);
     job={id:String(calls.length),state:'done',operation:'generate-graph',result:{project:'demo',graph:'saved:code'}};
     graphs=[{id:'saved:code',name:'Grafo del codice',kind:'project',path:'graph.json',createdAt:1700000000}];result=job;
    }else if(u.pathname==='/api/project-references'){project.workspace.documentation=data.references;result=project.workspace;}
    else if(u.pathname==='/api/remove-graph'){graphs=graphs.filter(g=>g.id!==data.graph);project.workspace.documentation.graphs=[];result={graphs,documentation:[]};}
    else if(u.pathname==='/api/sources')result=[{id:'source:new',name:data.name}];
    else if(u.pathname==='/api/folder')result={path:'C:\\Scelta'};
    else if(u.pathname==='/api/chat')result={folder:project.path};
    else throw Error('Unexpected write '+u.pathname);
   }else if(u.pathname==='/api/state')result={settings,busy,job};
   else if(u.pathname==='/api/models'||u.pathname==='/api/sources'||u.pathname==='/api/delegations')result=[];
   else if(u.pathname==='/api/project')result=project;
   else if(u.pathname==='/api/project-files')result={graphs,documentation:[]};
   else if(u.pathname==='/api/graph')result={nodes:[],edges:[],stats:{nodes:0,edges:0},limits:[]};
   else {const file=path.join('suite-ui',u.pathname==='/'?'index.html':u.pathname.slice(1));if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  }catch(error){res.writeHead(500);res.end(JSON.stringify({error:error.message}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   graphs=[];calls=[];job={id:'idle',state:'idle'};project.workspace={documentation:{graphs:[],documents:[]}};
   const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/#test`);await page.waitForFunction(()=>document.querySelector('#setup').children.length===3);
   assert.equal(await page.locator('#open-graph').isDisabled(),true);
   await page.locator('#open-project').click();await page.locator('[data-project-id=demo]').click();await page.locator('#open-graph').click();
   assert.equal(await page.locator('#open-graph').evaluate(n=>!!n.closest('.project-card')),true);
   assert.equal(await page.locator('#graph-context-list button').count(),0);
   await page.locator('#quick-generate-graph').click();await page.evaluate(()=>refresh());
   await page.locator('#open-graph').click();await page.locator('#open-graph').click();
   await page.waitForFunction(()=>document.querySelectorAll('#graph-context-list .context-choice').length===1);
   await page.locator('#graph-context-list .context-choice').click();await page.evaluate(()=>flushDocumentationReferences());
   assert.deepEqual(project.workspace.documentation.graphs,['saved:code']);
   assert.equal(await page.locator('#graph-context-list .context-choice').getAttribute('aria-pressed'),'true');
   await page.screenshot({path:path.join(work,`context-${viewport.width}.png`),fullPage:true});
   await page.keyboard.press('Escape');assert.equal(await page.locator('#graph-menu').isVisible(),false);
   await page.locator('#open-documentation').click();await page.locator('#add-documentation-source').click();
   const dialog=page.locator('#graph-dialog');await dialog.waitFor({state:'visible'});
   await page.locator('#source-name').fill('Fonti ordini');await page.locator('#browse-source').click();
   await page.waitForFunction(()=>document.querySelector('#source-path').value==='C:\\Scelta');
   await page.locator('[name=graph-location][value=remote]').check();await page.locator('#source-kind').selectOption('git-remote');
   assert.equal(await page.locator('#source-branch-row').isVisible(),true);
   await page.locator('#source-kind').selectOption('sharepoint-graph');assert.equal(await page.locator('#source-drive').isVisible(),true);
   await page.locator('[name=graph-location][value=local]').check();await page.locator('#generate-graph').click();
   await page.waitForFunction(()=>!document.querySelector('#graph-dialog').open);
   assert.deepEqual(project.workspace.documentation.sources,['source:new']);
   await page.locator('#open-graph').click();await page.locator('#graph-context-list .context-remove').click();
   await page.waitForFunction(()=>document.querySelectorAll('#graph-context-list .context-choice').length===0);
   assert.deepEqual(project.workspace.documentation.graphs,[]);
   assert.equal(await page.locator('body').evaluate(n=>n.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
   await page.close();console.log(`Context menus ${viewport.width}px: generation from project, selection, deletion, sources and accessibility OK`);
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
