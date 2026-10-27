const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const custom={id:'custom-test',name:'test',providerType:'custom',protocol:'openai-completions',baseUrl:'https://gateway.example/v1',auth:{type:'secret',ref:'byok/custom-test'},models:[]};
const native={id:'openai',name:'OpenAI lavoro',providerType:'openai',auth:{type:'secret',ref:'byok/openai'},models:[]};
function fixture(handler=async()=>{}){
  const source=fs.readFileSync(path.join(__dirname,'suite-ui/app.js'),'utf8');
  const elements=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,checked:false,hidden:false,classList:{toggle(){}}});
    return elements.get(id);
  };
  const providers=[{...custom,custom:true,hasKey:true},{...native,custom:false,hasKey:true}];
  const context={
    $:element,
    options:(select,items,value)=>{select.items=items;select.value=value||'';},
    api:async(route,data)=>{
      calls.push([route,data]);
      const result=await handler(route,data);
      if(result!==undefined)return result;
      if(route==='byok/config')return {revision:'revision-1',config:{connections:[custom,native]}};
      if(route==='byok/connections')return {providers,roles:{}};
      if(route==='models')return [];
      throw Error('Unexpected API route: '+route);
    },
    setup(){},renderRoles(){calls.push(['renderRoles']);},
    settings:{providers,roles:{},dataDirectory:'test-data'},catalog:[{provider:'openai',model:'gpt-test'}],
  };
  vm.runInNewContext(source.slice(source.indexOf('let connectionMode='),source.indexOf('function renderRoles()')),context);
  return {element,calls,context};
}

test('one save sends the original JSON and key without a preview request',async()=>{
  const ui=fixture();await ui.context.renderProviders();
  const content='[{"name":"test","settings":{},"settings":{}}]';
  ui.element('byok-editor').value=content;ui.element('byok-key').value='test-key';
  await ui.context.saveConnection();
  const saves=ui.calls.filter(([route])=>route==='byok/connections');
  assert.equal(saves.length,1);
  assert.equal(saves[0][1].content,content);
  assert.equal(saves[0][1].apiKey,'test-key');
  assert.equal(ui.element('byok-key').value,'');
  assert(!ui.calls.some(([route])=>route.includes('preview')));
  assert(ui.calls.some(([route])=>route==='renderRoles'));
});

test('selecting saved custom config loads its JSON without the stored secret',async()=>{
  const ui=fixture();await ui.context.renderProviders();
  ui.element('saved-connection').value=custom.id;ui.element('saved-connection').onchange();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.parse(ui.element('byok-editor').value).connections[0].id,custom.id);
  assert.equal(ui.element('native-connection').hidden,true);
  assert.equal(ui.element('custom-connection').hidden,false);
  assert.equal(ui.element('byok-key').value,'');
  assert.match(ui.element('byok-key').placeholder,/salvata/);
});

test('selecting a native provider hides JSON and populates the provider fields',async()=>{
  const ui=fixture();await ui.context.renderProviders();
  ui.element('saved-connection').value=native.id;ui.element('saved-connection').onchange();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.element('native-connection').hidden,false);
  assert.equal(ui.element('custom-connection').hidden,true);
  assert.equal(ui.element('connection-name').value,native.name);
  assert.equal(ui.element('native-provider').value,'openai');
  assert.equal(ui.element('mode-provider').checked,true);
  await ui.context.saveConnection();
  const [,request]=ui.calls.find(([route])=>route==='byok/connections');
  assert.equal(request.connectionId,native.id);
  assert.equal(JSON.parse(request.content).connections[0].auth.ref,native.auth.ref);
});

test('switching modes clears the key and keeps only one form visible',async()=>{
  const ui=fixture();await ui.context.renderProviders();
  ui.element('byok-key').value='discarded-key';ui.element('byok-editor').value='discarded draft';
  ui.element('mode-provider').onchange();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.element('byok-key').value,'');assert.equal(ui.element('byok-editor').value,'');
  assert.equal(ui.element('custom-connection').hidden,true);assert.equal(ui.element('native-connection').hidden,false);
  assert.equal(ui.element('save-connection').disabled,true);
});

test('save errors remain beside the form and allow correction without losing the key',async()=>{
  const ui=fixture(async route=>{if(route==='byok/connections')throw Error('JSON: chiave duplicata');});
  await ui.context.renderProviders();ui.element('byok-editor').value='invalid JSON';ui.element('byok-key').value='test-key';
  await ui.context.saveConnection();
  assert.equal(ui.element('connection-status').textContent,'JSON: chiave duplicata');
  assert.equal(ui.element('connection-status').hidden,false);
  assert.equal(ui.element('save-connection').disabled,false);
  assert.equal(ui.element('byok-key').value,'test-key');
});

test('double submit cannot issue two saves',async()=>{
  let finish;
  const ui=fixture(route=>route==='byok/connections'?new Promise(resolve=>{finish=resolve;}):undefined);
  await ui.context.renderProviders();ui.element('byok-editor').value='{}';
  const pending=ui.context.saveConnection();await ui.context.saveConnection();
  assert.equal(ui.calls.filter(([route])=>route==='byok/connections').length,1);
  assert.equal(ui.element('save-connection').disabled,true);
  finish({providers:ui.context.settings.providers});await pending;
  assert.equal(ui.element('saved-connection').disabled,false);
});

test('save displays transport and credential notices returned by the backend',async()=>{
  const notices=['Endpoint HTTP: chiave in chiaro.','Chiave API mancante.'];
  const ui=fixture(route=>route==='byok/connections'?{providers:[{...custom,custom:true,hasKey:false}],connectionNotices:notices}:undefined);
  await ui.context.renderProviders();ui.element('byok-editor').value='[]';
  await ui.context.saveConnection();
  assert.equal(ui.element('connection-status').textContent,'Configurazione salvata. '+notices.join(' '));
  assert.equal(ui.element('connection-status').hidden,false);
});

test('a late selection response cannot replace the most recently selected configuration',async()=>{
  const pending=[];
  const ui=fixture(route=>route==='byok/config'?new Promise(resolve=>pending.push(resolve)):undefined);
  ui.element('saved-connection').value=custom.id;ui.element('saved-connection').onchange();
  ui.element('saved-connection').value=native.id;ui.element('saved-connection').onchange();
  const result={revision:'revision-1',config:{connections:[custom,native]}};
  pending[1](result);await new Promise(resolve=>setImmediate(resolve));
  pending[0](result);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.element('connection-name').value,native.name);
  assert.equal(ui.element('native-connection').hidden,false);
  assert.equal(ui.element('custom-connection').hidden,true);
});

test('the connections page exposes only one save command and no old import actions',()=>{
  const html=fs.readFileSync(path.join(__dirname,'suite-ui/index.html'),'utf8');
  const section=html.slice(html.indexOf('<section id="page-providers"'),html.indexOf('<section id="page-roles"'));
  assert.equal((section.match(/<button\b/g)||[]).length,1);
  assert(!/preview-byok|apply-byok|export-json|export-yaml|example-byok|format-byok|add-provider/.test(section));
});