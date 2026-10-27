'use strict';
const $=id=>document.getElementById(id);
const token=location.hash.slice(1)||sessionStorage.getItem('pi-suite-token')||'';
if(location.hash){sessionStorage.setItem('pi-suite-token',token);history.replaceState(null,'',location.pathname+location.search);}
let state,settings,catalog=[],project=null,lastJob='',activePage='work',lastDelegations='';
let workspaceFiles={graphs:[],asis:[]};const chosenGraphs=new Set();
function asisAvailability(){
  const available=workspaceFiles.graphs.some(g=>chosenGraphs.has(g.id));
  for(const id of ['auto-asis','prepare-asis'])$(id).disabled=!available||!!state?.busy;
  $('asis-graph-help').textContent=!workspaceFiles.graphs.length?'Per creare un AS-IS, crea prima un grafo di conoscenza per questo progetto.':!available?'Seleziona almeno un grafo di conoscenza come riferimento.':'L’AS-IS userà le fonti dei grafi selezionati.';
  document.querySelectorAll('[data-asis-update]').forEach(b=>b.disabled=!available||!!state?.busy);
}
async function previewWorkspaceFile(kind,item){
  const pid=project.id,result=await api('project-file?id='+encodeURIComponent(pid)+'&file='+encodeURIComponent(item.id));
  if(project?.id!==pid)return;
  const host=$(kind+'-file-preview');host.replaceChildren(el('h3',item.name),el('pre',result.text));host.hidden=false;
}
function renderSavedFiles(kind,items){
  const host=$(kind+'-saved-files');host.replaceChildren();
  if(!items.length){host.append(el('p',kind==='asis'?'Nessun documento AS-IS salvato per questo progetto.':'Nessun grafo di conoscenza salvato per questo progetto.','muted'));return;}
  for(const item of items){
    const tile=btn('',()=>previewWorkspaceFile(kind,item),'saved-file');tile.title=item.path;
    const icon=el('span',undefined,'file-icon');icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<svg viewBox="0 0 24 28" width="26" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 1h12l6 6v20H3z"/><path d="M15 1v7h6M7 13h10M7 18h10M7 23h7"/></svg>';
    const timestamp=typeof item.createdAt==='number'?item.createdAt*1000:item.createdAt;
    const date=el('time','Creato il '+new Date(timestamp).toLocaleString('it-IT'));date.dateTime=new Date(timestamp).toISOString();
    tile.append(icon,el('strong',item.name),date);host.append(tile);
  }
}
async function refreshWorkspaceFiles(){
  if(!project)return;const pid=project.id,files=await api('project-files?id='+encodeURIComponent(pid));if(project?.id!==pid)return;
  workspaceFiles=files;for(const id of chosenGraphs)if(!files.graphs.some(g=>g.id===id))chosenGraphs.delete(id);
  renderSavedFiles('asis',files.asis);renderSavedFiles('graph',files.graphs);
  const host=$('asis-graph-list');host.replaceChildren();
  for(const graph of files.graphs){const check=input('','checkbox');check.checked=chosenGraphs.has(graph.id);check.onchange=()=>{if(check.checked)chosenGraphs.add(graph.id);else chosenGraphs.delete(graph.id);asisAvailability();};const label=el('label',graph.name,'graph-choice');label.prepend(check);host.append(label);}
  asisAvailability();
}
async function startAsis(operation,objective=$('asis-objective').value){
  await refreshWorkspaceFiles();if(!workspaceFiles.graphs.some(g=>chosenGraphs.has(g.id)))throw Error('Seleziona almeno un grafo di conoscenza disponibile per questo progetto.');
  await saveReferences('asis');return action(operation,{project:project.id,graphs:[...chosenGraphs],objective,openChat:true});
}
const roleNames={orchestrator:['Orchestratore','Definisce piano e criteri, delega ai figli configurati e verifica; senza figli svolge direttamente il lavoro'],worker:['Subagenti','Facoltativi: se selezioni un modello, ricevono sempre il lavoro operativo. Modello e ragionamento indipendenti']};
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function notice(text,error=false){for(const host of [$('notice'),...document.querySelectorAll('dialog[open] [data-modal-notice]')]){host.textContent=text;host.classList.toggle('error',error);host.hidden=false;}}
async function api(path,data){const res=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'X-Suite-Token':token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const result=await res.json();if(!res.ok)throw Error(result.error||'Richiesta non riuscita');return result;}
function bind(id,fn){$(id).addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>notice(e.message,true)));}
function btn(text,fn,cls='secondary'){const b=el('button',text,cls);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(e=>notice(e.message,true));return b;}
function input(value='',type='text'){const n=el('input');n.type=type;n.value=value;return n;}
function field(text,control,cls='grow'){const l=el('label',text,cls);l.append(control);return l;}
function options(select,items,value){select.replaceChildren();for(const [v,label] of items){const o=el('option',label);o.value=v;select.append(o);}if(value!==undefined)select.value=value;}
function page(name){closeWorkspaceDialogs();activePage=name;for(const section of document.querySelectorAll('.page'))section.hidden=section.id!=='page-'+name;for(const b of document.querySelectorAll('[data-page]'))b.classList.toggle('active',b.dataset.page===name);$('breadcrumb').textContent='Workspace / '+({work:'Il tuo workspace',runs:'Attività subagenti',providers:'Connessioni e modelli',roles:'Orchestratore e subagenti',skills:'Skill installate',benchmarks:'Benchmark e confronti'}[name]);if(name==='runs')loadDelegations().catch(e=>notice(e.message,true));}
function closeWorkspaceDialogs(){document.querySelectorAll('.workspace-dialog[open]').forEach(d=>d.close());}
for(const dialog of document.querySelectorAll('.workspace-dialog')){
  dialog.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>dialog.close());
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
}
async function openWorkspaceDialog(kind){
  if(!project)throw Error('Seleziona prima un progetto.');
  const dialog=$(kind+'-dialog');dialog.querySelector('[data-dialog-project]').textContent=project.name;
  dialog.querySelector('[data-modal-notice]').hidden=true;
  restoreReferences(kind);dialog.showModal();dialog.querySelector('.dialog-body').scrollTop=0;
  await refreshWorkspaceFiles();
  if(kind==='asis'){fillSource();await loadSources();await refreshEvidenceRegistry();}
  else if(project.graph)await loadGraph();
}
function restoreReferences(kind){
  const refs=project?.workspace?.[kind]||{};
  for(const section of ['asis','graph']){$(section+'-file-preview').replaceChildren();$(section+'-file-preview').hidden=true;$(section+'-saved-files').replaceChildren(el('p','Caricamento file salvati…','muted'));}
  if(kind==='asis'){chosenGraphs.clear();for(const id of refs.graphs||[])chosenGraphs.add(id);workspaceFiles={graphs:[],asis:[]};asisAvailability();}
  if(kind==='asis'){$('source-list').replaceChildren(el('p','Caricamento fonti…','muted'));$('asis-registry').replaceChildren();$('relation-proposals').replaceChildren();chosenSources.clear();for(const id of refs.sources||[])chosenSources.add(id);$('asis-objective').value=refs.objective||'';$('dossier-workspace').value=refs.dossierWorkspace||'';$('evidence-query').value='';$('evidence-results').replaceChildren();$('evidence-reader').replaceChildren();}
  else{$('graph-path').value=project?.path||'';$('graph-search').value=refs.query||'';$('graph-stats').replaceChildren();$('graph-canvas').replaceChildren();$('graph-results').replaceChildren();}
}
async function saveReferences(kind){
  if(!project)throw Error('Seleziona prima un progetto.');
  const references=kind==='asis'?{sources:[...chosenSources],graphs:[...chosenGraphs],objective:$('asis-objective').value,dossierWorkspace:$('dossier-workspace').value}:{query:$('graph-search').value};
  project.workspace=await api('project-references',{project:project.id,section:kind,references});
  notice('Riferimenti salvati per '+project.name+'.');
}
bind('open-asis',()=>openWorkspaceDialog('asis'));bind('open-graph',()=>openWorkspaceDialog('graph'));
bind('save-asis-references',()=>saveReferences('asis'));bind('save-graph-references',()=>saveReferences('graph'));
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));
function setup(){referenceAvailability();const steps=[['Connessioni',`${settings.providers.length} provider configurati`,'providers',settings.providers.length>0],['La tua squadra',settings.roles.worker?'Orchestratore + subagenti':settings.roles.orchestrator?'Solo orchestratore':'Scegli l’orchestratore','roles',!!settings.roles.orchestrator],['Contesto locale',project?.name||'Scegli il tuo progetto','work',!!project]];$('setup').replaceChildren();steps.forEach(([title,desc,target,done],i)=>{const b=btn('',()=>page(target),'setup-step');b.append(el('span',done?'✓':String(i+1),'step-number'));const d=el('div',title);d.append(el('small',desc));b.append(d);$('setup').append(b);});}
function projects(){options($('project'),[['','Seleziona un progetto'],...settings.projects.map(p=>[p.id,settings.projects.filter(other=>other.name===p.name).length>1?p.name+' · '+p.path:p.name])],project?.id||'');for(const option of $('project').options)option.title=settings.projects.find(p=>p.id===option.value)?.path||'';}
async function refresh(initial=false){state=await api('state');if(initial||!settings)settings=state.settings;else settings.projects=state.settings.projects;setup();renderJob();if(activePage==='runs')await loadDelegations();if(initial){projects();renderProviders();renderRoles();renderSkills();}const signature=state.job.id+':'+state.job.state;if(signature!==lastJob){lastJob=signature;if(state.job.state==='done'){notice('Operazione completata.');projects();if(state.job.operation==='graph'&&project){project=await api('project?id='+project.id);await loadGraph();}if(['sync-source','prepare-asis','auto-asis','index-sources','register-asis'].includes(state.job.operation)){await loadSources();if(project)await refreshWorkspaceFiles();if(state.job.result?.workspace)notice('Dossier pronto in '+state.job.result.workspace+'. La chat scriverà la documentazione.');}if(state.job.operation==='probe'){settings.modelChecks=state.settings.modelChecks;renderProviders();}if(state.job.operation==='probe')notice('Connessione e tool calling verificati. Ragionamento effettivo: '+state.job.result.effective);}if(state.job.state==='failed')notice(state.job.error,true);}document.querySelectorAll('[data-job-button]').forEach(b=>b.disabled=state.busy);asisAvailability();}
bind('open-chat',async()=>{if(!project)throw Error('Seleziona un progetto.');const result=await api('chat',{project:project.id});notice('Chat Pi aperta per '+project.name+' in '+result.folder);});
async function loadDelegations(){const batches=await api('delegations'),host=$('delegation-list'),signature=JSON.stringify(batches);if(signature===lastDelegations)return;lastDelegations=signature;host.replaceChildren();for(const batch of batches){const card=el('div',undefined,'card');card.append(el('h2','Delega dalla chat · '+batch.state),el('p',batch.plan));for(const task of batch.tasks){const detail=el('details');detail.append(el('summary',task.title+' · '+task.state),el('pre',task.assignment),el('p','Artefatti: '+task.directory),el('pre',task.result?.result?.text||task.result?.error||task.error||'In attesa del risultato.'));card.append(detail);}host.append(card);}}
async function save(){settings=await api('settings',settings);catalog=await api('models');renderProviders();renderRoles();renderSkills();setup();notice('Configurazione salvata.');}
function modelCard(p,m){
  const box=el('div',undefined,'model-editor');
  box.append(el('h3',m.name||m.id||'Nuovo modello'));
  const row=el('div',undefined,'row');
  const id=input(m.id),name=input(m.name||m.id),context=input(m.contextWindow||32000,'number'),output=input(m.maxTokens||4096,'number');
  id.oninput=()=>{const old=m.id;m.id=id.value.trim();for(const profile of Object.values(settings.roles))if(profile.provider===p.id&&profile.model===old)profile.model=m.id;};name.oninput=()=>m.name=name.value;
  context.oninput=()=>m.contextWindow=Number(context.value);output.oninput=()=>m.maxTokens=Number(output.value);
  row.append(field('ID remoto / deployment',id),field('Nome visualizzato',name),field('Contesto totale (token)',context),field('Output massimo',output));box.append(row);
  const caps=el('div',undefined,'row');
  for(const [label,key,value] of [['Strumenti','toolCalling',m.toolCalling],['Streaming','streaming',m.streaming]]){
    const select=el('select');options(select,[['unknown','Non verificato'],['true','Supportato'],['false','Non supportato']],value==null?'unknown':String(value));
    select.onchange=()=>m[key]=select.value==='unknown'?null:select.value==='true';caps.append(field(label,select));
  }
  const vision=input('','checkbox');vision.checked=(m.input||[]).includes('image');vision.onchange=()=>m.input=vision.checked?['text','image']:['text'];caps.append(field('Supporta immagini',vision));
  const defaultEffort=el('select');const updateDefault=()=>options(defaultEffort,[['off','Disattivato'],...(m.reasoningLevels||[]).filter(x=>x!=='off').map(x=>[x,x])],m.defaultEffort||'off');defaultEffort.onchange=()=>m.defaultEffort=defaultEffort.value;updateDefault();
  const reasoning=input('','checkbox');reasoning.checked=!!m.reasoning;reasoning.onchange=()=>{m.reasoning=reasoning.checked;if(!m.reasoning){m.reasoningLevels=[];m.defaultEffort='off';levels.value='';}levels.disabled=!m.reasoning;updateDefault();};caps.append(field('Ragionamento configurabile',reasoning));
  const levels=input((m.reasoningLevels||[]).join(', '));levels.placeholder='low, medium, high';levels.disabled=!m.reasoning;levels.oninput=()=>{m.reasoningLevels=levels.value.split(',').map(x=>x.trim()).filter(Boolean);if(!m.reasoningLevels.includes(m.defaultEffort))m.defaultEffort='off';updateDefault();};caps.append(field('Livelli accettati (separati da virgola)',levels),field('Ragionamento predefinito per nuove assegnazioni',defaultEffort));box.append(caps);
  box.append(btn('Verifica modello',async()=>{await save();await api('byok/probe',{provider:p.id,model:m.id,effort:'off'});notice('Verifica avviata: può consumare token sul provider selezionato.');}),btn('Rimuovi modello',()=>{p.models=p.models.filter(x=>x!==m);for(const [role,profile] of Object.entries(settings.roles))if(profile.provider===p.id&&profile.model===m.id)delete settings.roles[role];renderProviders();},'text-button'));
  const reports=Object.values(settings.modelChecks||{}).filter(c=>c.provider===p.id&&c.model===m.id);
  if(reports.length){const check=reports[0];box.append(el('p',(check.current?'':'Da riverificare · ')+(check.status==='verified'?'Ciclo strumenti verificato':'Verifica fallita')+' · '+new Date(check.checkedAt*1000).toLocaleString('it-IT')+(check.error?' · '+check.error:''),'muted'));}
  return box;
}
function renderProviders(){
  const customIds=new Set(settings.providers.filter(p=>p.custom||p.providerType&&p.providerType!==p.id).map(p=>p.id));
  const available=[...new Set(catalog.filter(m=>!customIds.has(m.provider)).map(m=>m.provider))].sort();
  options($('new-provider'),[['__local','Server locale (senza account)'],['__custom','Endpoint personalizzato'],...available.map(p=>[p,p])]);
  $('byok-directory').textContent='Dati locali: '+settings.dataDirectory;
  const host=$('provider-list');host.replaceChildren();
  for(const p of settings.providers){
    const card=el('div',undefined,'card');card.dataset.provider=p.id;
    const top=el('div',undefined,'provider-header');top.append(el('h2',p.name||p.id),btn('Rimuovi connessione',()=>{settings.providers=settings.providers.filter(x=>x!==p);for(const [r,v]of Object.entries(settings.roles))if(v.provider===p.id)delete settings.roles[r];renderProviders();},'text-button'));card.append(top);
    const name=input(p.name||p.id);name.oninput=()=>p.name=name.value;card.append(field('Nome connessione',name),el('p','ID: '+p.id+' · Tipo: '+(p.providerType||p.id),'muted'));
    if(p.custom){
      const row=el('div',undefined,'row'),url=input(p.baseUrl);url.oninput=()=>p.baseUrl=url.value;
      const protocol=el('select');options(protocol,[['openai-completions','OpenAI Chat Completions'],['openai-responses','OpenAI Responses'],['anthropic-messages','Anthropic Messages'],['google-generative-ai','Google Generative AI']],p.api);protocol.onchange=()=>p.api=protocol.value;
      row.append(field('Base URL (senza /chat/completions, /responses o /messages)',url),field('Protocollo',protocol));card.append(row);
    }
    p.auth=p.auth||{type:'none'};
    const auth=el('select');options(auth,[['none','Nessuna autenticazione'],['secret','Chiave protetta su questo PC'],['env','Variabile ambiente']],p.auth.type);
    auth.onchange=()=>{p.auth=auth.value==='secret'?{type:'secret',ref:'byok/'+p.id}:auth.value==='env'?{type:'env',name:'PI_SUITE_KEY_'+p.id.toUpperCase().replace(/[^A-Z0-9]/g,'_')}:{type:'none'};delete p.apiKey;renderProviders();};card.append(field('Autenticazione del server',auth));
    if(p.auth.type==='secret'){
      const key=input(p.apiKey||'','password');key.autocomplete='new-password';key.placeholder=p.hasKey?'Chiave salvata: lascia vuoto per conservarla':'Chiave non ancora inserita';key.oninput=()=>p.apiKey=key.value;card.append(field('API key',key));
      if(p.hasKey){const clear=input('','checkbox');clear.checked=!!p.clearKey;clear.onchange=()=>p.clearKey=clear.checked;card.append(field('Rimuovi la chiave al salvataggio',clear));}
    } else if(p.auth.type==='env'){const env=input(p.auth.name);env.oninput=()=>p.auth.name=env.value;card.append(field('Nome della variabile (valore mai esportato)',env));}
    else card.append(el('p','Nessun account o chiave richiesto dalla suite per questa connessione. Il server deve consentire accesso senza autenticazione.','muted'));
    for(const m of p.models||[])card.append(modelCard(p,m));
    if(p.custom)card.append(btn('Aggiungi modello',()=>{p.models.push({id:'',name:'',contextWindow:32000,maxTokens:4096,input:['text'],reasoning:false,reasoningLevels:[],toolCalling:null,streaming:true});renderProviders();}));
    else {
      const choice=input();const list=el('datalist');list.id='native-'+p.id;choice.setAttribute('list',list.id);
      const type=p.providerType||p.id;catalog.filter(m=>m.provider===type).forEach(m=>{const o=el('option');o.value=m.model;o.label=m.name;list.append(o);});
      card.append(field('Personalizza un modello del catalogo',choice),list,btn('Aggiungi scheda modello',()=>{
        const m=catalog.find(m=>m.provider===type&&m.model===choice.value);if(!m)throw Error('Seleziona un ID presente nel catalogo.');
        if(!p.models.some(x=>x.id===m.model))p.models.push({id:m.model,name:m.name,contextWindow:m.contextWindow,maxTokens:m.maxTokens,input:m.input,reasoning:m.reasoning,reasoningLevels:m.reasoningLevels||[],toolCalling:null,streaming:true});renderProviders();
      }));
    }
    host.append(card);
  }
}
bind('add-provider',()=>{
  const type=$('new-provider').value,custom=type.startsWith('__');let n=1,id=custom?'local-1':type;
  while(settings.providers.some(p=>p.id===id))id=(custom?'local':type)+'-'+(++n);
  settings.providers.push({id,name:custom?'Server locale':type,providerType:custom?(type==='__local'?'lmstudio':'custom'):type,custom,models:[],
    ...(custom?{api:'openai-completions',baseUrl:'http://127.0.0.1:1234/v1'}:{}),auth:custom?{type:'none'}:{type:'secret',ref:'byok/'+id}});renderProviders();
});
bind('save-providers',save);
let byokPreview=null,byokGeneration=0;
function resetByokPreview(){byokGeneration++;byokPreview=null;$('apply-byok').disabled=true;$('byok-preview').textContent='';}
$('byok-editor').oninput=resetByokPreview;$('byok-format').onchange=resetByokPreview;$('byok-profiles').onchange=resetByokPreview;
$('byok-file').onchange=async()=>{
  resetByokPreview();$('byok-key').value='';const file=$('byok-file').files[0];if(!file)return;
  try{if(file.size>700000)throw Error('Massimo 700 KB.');const generation=byokGeneration,content=await file.text();if(generation!==byokGeneration)return;
    $('byok-editor').value=content;$('byok-format').value=/\.ya?ml$/i.test(file.name)?'yaml':'json';notice('File caricato nell’editor. Controlla la configurazione e apri l’anteprima.');
  }catch(e){notice(e.message,true);}
};
bind('example-byok',()=>{
  resetByokPreview();$('byok-key').value='';$('byok-file').value='';$('byok-format').value='json';
  $('byok-editor').value=JSON.stringify([{name:'Il mio endpoint',vendor:'customendpoint',apiKey:'${key}',apiType:'chat-completions',models:[{
    id:'custom-model',name:'Modello personalizzato',url:'https://api.example.com/v1/chat/completions',apiType:'chat-completions',toolCalling:true,vision:true,thinking:true,
    supportsReasoningEffort:['none','low','medium','xhigh'],contextWindow:32000,maxOutputTokens:4096}],settings:{'custom-model':{reasoningEffort:'xhigh'}}}],null,2);
  notice('Esempio caricato. Sostituisci URL, ID e capacità con quelli del server; verifica i limiti di token.');
});
bind('format-byok',async()=>{
  if($('byok-format').value!=='json')throw Error('La formattazione è disponibile per JSON.');
  // Validate first, so JSON.parse cannot silently discard duplicate keys.
  const content=$('byok-editor').value,generation=byokGeneration;
  await api('byok/import/preview',{content,format:'json',includeProfiles:$('byok-profiles').checked});
  if(generation!==byokGeneration)return;
  $('byok-editor').value=JSON.stringify(JSON.parse(content.replace(/^\uFEFF/,'')),null,2);resetByokPreview();
});
bind('preview-byok',async()=>{
  resetByokPreview();const content=$('byok-editor').value;if(!content.trim())throw Error('Incolla una configurazione o carica un file JSON/YAML.');
  const generation=byokGeneration,request={content,format:$('byok-format').value,includeProfiles:$('byok-profiles').checked};
  const preview=await api('byok/import/preview',request);if(generation!==byokGeneration)return;byokPreview={...request,revision:preview.revision};
  $('byok-preview').textContent=preview.changes.map(c=>c.action+' · '+c.name+' ('+c.id+')\nDestinazione: '+c.endpoint+'\nAutenticazione: '+c.auth.type+' '+(c.auth.ref||c.auth.name||'')+(c.missingSecret?' · credenziale da configurare':'')).join('\n\n')+'\n\n'+preview.notice+'\n\nModelli: '+preview.config.connections.filter(c=>preview.changes.some(x=>x.id===c.id)).flatMap(c=>c.models.map(m=>m.name+' · '+m.id+' · reasoning predefinito: '+(m.reasoning.defaultEffort||'off'))).join('\n');
  $('apply-byok').disabled=false;
});
bind('apply-byok',async()=>{
  if(!byokPreview)throw Error('Ripeti l’anteprima.');$('apply-byok').disabled=true;
  try{settings=await api('byok/import/apply',{...byokPreview,apiKey:$('byok-key').value});$('byok-key').value='';resetByokPreview();renderProviders();setup();catalog=await api('models');renderProviders();renderRoles();notice('Configurazione importata. Le chiavi inserite sono cifrate su questo PC. Seleziona i modelli nella squadra e apri una nuova chat.');}
  finally{$('apply-byok').disabled=!byokPreview;}
});
for(const format of ['json','yaml'])bind('export-'+format,async()=>{
  const result=await api('byok/export?format='+format);const blob=new Blob([result.content],{type:format==='json'?'application/json':'application/yaml'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='pi-models.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Esportata la configurazione salvata, senza chiavi.');
});
function renderRoles(){
  const host=$('role-list');host.replaceChildren();
  for(const [role,[name,description]] of Object.entries(roleNames)){
    const card=el('div',undefined,'card role-card');card.dataset.role=role;const intro=el('div');intro.append(el('h3',name),el('p',description));
    const provider=el('select');provider.id='provider-'+role;options(provider,[['',role==='worker'?'Nessuno · solo orchestratore':'Scegli connessione'],...settings.providers.map(p=>[p.id,p.name||p.id])],settings.roles[role]?.provider||'');
    const model=input(settings.roles[role]?.model||'');model.id='model-'+role;model.setAttribute('list','models-'+role);model.placeholder='Cerca o seleziona un modello';
    const list=el('datalist');list.id='models-'+role;const effort=el('select');effort.id='effort-'+role;
    let effortIdentity=null;
    const updateEffort=()=>{const m=catalog.find(m=>m.provider===provider.value&&m.model===model.value),identity=provider.value+'\n'+model.value,saved=settings.roles[role];const selected=identity===effortIdentity?effort.value:saved?.provider===provider.value&&saved?.model===model.value?saved.effort:m?.defaultEffort||'off';effortIdentity=identity;const levels=m?.reasoning?(m.reasoningLevels||[]):[];options(effort,[['off','Disattivato'],...levels.filter(x=>x!=='off').map(x=>[x,x])],levels.includes(selected)?selected:'off');};
    const updateList=()=>{list.replaceChildren();catalog.filter(m=>m.provider===provider.value&&m.toolCalling!==false&&m.streaming!==false).forEach(m=>{const o=el('option');o.value=m.model;o.label=m.name;list.append(o);});updateEffort();};
    provider.onchange=()=>{model.value='';updateList();};model.oninput=updateEffort;updateList();
    card.append(intro,field('Connessione',provider),field('Modello',model),field('Ragionamento',effort),btn('Verifica',async()=>{captureRoles();await save();await action('probe',{role});}));if(role==='worker')card.append(btn('Nessun subagente',()=>{delete settings.roles.worker;renderRoles();notice('Modalità solo orchestratore selezionata. Premi Salva squadra e apri una nuova chat.');},'secondary clear-worker'));card.append(list);host.append(card);
  }
  $('max-calls').value=settings.maxCalls;$('parallel').value=settings.maxParallelWorkers;
}
function captureRoles(){for(const role of Object.keys(roleNames)){const provider=$('provider-'+role).value,model=$('model-'+role).value.trim();if(provider&&model)settings.roles[role]={provider,model,effort:$('effort-'+role).value};else delete settings.roles[role];}settings.maxCalls=Number($('max-calls').value);settings.maxParallelWorkers=Number($('parallel').value);}
bind('save-roles',async()=>{captureRoles();await save();});bind('copy-role',()=>{captureRoles();if(!settings.roles.orchestrator)throw Error('Scegli prima il modello dell’orchestratore.');const main=settings.roles.orchestrator,effort=settings.roles.worker?.effort||'off';const m=catalog.find(m=>m.provider===main.provider&&m.model===main.model);settings.roles.worker={...main,effort:m?.reasoning&&m.reasoningLevels?.includes(effort)?effort:'off'};renderRoles();});
function renderSkills(){const host=$('skill-list');host.replaceChildren();for(const s of settings.skills){const card=el('div',undefined,'card skill-item'),check=input('','checkbox');check.checked=settings.enabledSkills.includes(s.name);check.onchange=()=>{settings.enabledSkills=settings.enabledSkills.filter(n=>n!==s.name);if(check.checked)settings.enabledSkills.push(s.name);};const description=el('label',s.name);description.append(el('p',s.description));check.id='skill-'+s.name;description.htmlFor=check.id;card.append(check,description);host.append(card);}}
bind('save-skills',save);
bind('import-skill',async()=>{const file=$('skill-file').files[0];if(!file)throw Error('Seleziona un file SKILL.md.');settings=await api('skills',{content:await file.text()});renderSkills();notice('Skill importata e attivata.');});
let projectRequest=0;
async function openProject(){
  const id=$('project').value,request=++projectRequest;
  closeWorkspaceDialogs();project=null;$('open-chat').disabled=true;$('open-asis').disabled=true;$('open-graph').disabled=true;$('chat-project-info').textContent='Seleziona un progetto per aprire la sua chat.';setup();
  $('project-info').textContent=id?'Apertura progetto…':'Seleziona un progetto dalla lista o creane uno nuovo.';
  if(!id)return;
  try{
    const loaded=await api('project?id='+encodeURIComponent(id));if(request!==projectRequest)return;
    project=loaded;setup();$('open-chat').disabled=false;$('chat-project-info').textContent='La chat userà la cartella e i riferimenti di '+project.name+'.';
    $('project-info').textContent=project.path;$('open-asis').disabled=false;$('open-graph').disabled=false;
    $('graph-project').textContent=project.name;$('graph-state').textContent=project.graph?(project.graph.stale?'Grafo da aggiornare · ':'Grafo aggiornato · ')+project.graph.stats.nodes+' nodi':'Il grafo non è ancora stato creato.';
  }catch(e){if(request===projectRequest){$('project').value='';$('project-info').textContent='Progetto non disponibile. Scegli un’altra cartella.';throw e;}}
}
$('project').onchange=()=>openProject().catch(e=>notice(e.message,true));
bind('new-project',()=>{
  $('project-form').reset();$('clear-project-path').hidden=true;$('project-dialog').querySelector('[data-modal-notice]').hidden=true;
  $('project-location-help').textContent='Con il solo nome, la suite crea una cartella nella propria area progetti.';
  $('project-dialog').showModal();$('project-name').focus();
});
let choosingProjectFolder=false;
async function chooseProjectFolder(){
  if(choosingProjectFolder)return;
  choosingProjectFolder=true;$('browse-project').disabled=true;$('create-project').disabled=true;
  const requestDialog=$('project-dialog');requestDialog.querySelector('[data-modal-notice]').hidden=true;
  try{
    const result=await api('project-folder',{});
    if(result.path&&requestDialog.open){$('project-path').value=result.path;if(!$('project-name').value.trim())$('project-name').value=result.path.split(/[\\/]/).filter(Boolean).at(-1)||'';$('clear-project-path').hidden=false;$('project-location-help').textContent='La cartella scelta verrà collegata quando premi Crea progetto.';}
  }finally{choosingProjectFolder=false;$('browse-project').disabled=false;$('create-project').disabled=false;}
}
bind('browse-project',chooseProjectFolder);bind('project-path',chooseProjectFolder);
$('project-path').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseProjectFolder().catch(e=>notice(e.message,true));}};
bind('clear-project-path',()=>{$('project-path').value='';$('clear-project-path').hidden=true;$('project-location-help').textContent='Con il solo nome, la suite crea una cartella nella propria area progetti.';});
$('project-form').onsubmit=event=>{
  event.preventDefault();if(choosingProjectFolder)return;
  $('create-project').disabled=true;
  Promise.resolve().then(async()=>{
    const created=await api('projects',{name:$('project-name').value.trim(),path:$('project-path').value});
    state=await api('state');settings.projects=state.settings.projects;projects();$('project').value=created.id;
    await openProject();notice('Progetto pronto: '+created.name+'.');
  }).catch(e=>notice(e.message,true)).finally(()=>$('create-project').disabled=false);
};
async function action(operation,data={}){await api('action',{operation,...data});page('runs');await refresh();notice('Operazione avviata. Puoi seguirne lo stato qui.');}
bind('build-graph',()=>{if(!project)throw Error('Apri un progetto nel workspace.');return saveReferences('graph').then(()=>action('graph',{project:project.id}));});bind('search-graph',()=>loadGraph());$('graph-search').onkeydown=e=>{if(e.key==='Enter')loadGraph().catch(e=>notice(e.message,true));};
async function loadGraph(node){if(!project)return;const data=await api('graph?id='+project.id+'&q='+encodeURIComponent($('graph-search').value)+(node?'&node='+encodeURIComponent(node):''));$('graph-project').textContent=project.name;$('graph-state').textContent=project.graph?.stale?'Il codice è cambiato: aggiorna il grafo.':'Grafo persistente del progetto · nessun consumo API';$('graph-stats').replaceChildren();for(const [label,value]of [['Nodi',data.stats.nodes],['Relazioni',data.stats.edges],['File riutilizzati',data.stats.reused],['File rianalizzati',data.stats.extracted]]){const s=el('div');s.append(el('strong',String(value)),el('small',label));$('graph-stats').append(s);}drawGraph(data);$('graph-results').replaceChildren();if(data.truncated)$('graph-results').append(el('p','Risultati parziali: restringi la ricerca.','muted'));if(!data.nodes.length)$('graph-results').append(el('p','Nessun simbolo corrispondente.','muted'));for(const n of data.nodes){const row=el('div',undefined,'graph-node');row.append(btn(n.label||n.id,()=>loadGraph(n.id),'text-button'),el('small',n.source_file+' · '+(n.source_location||'')));row.append(btn('Leggi sorgente',async()=>{const source=await api('source?id='+project.id+'&path='+encodeURIComponent(n.source_file.replace(/^repo\//,'')));const existing=$('graph-source');if(existing)existing.remove();const pre=el('pre',source.text);pre.id='graph-source';$('graph-results').prepend(pre);},'text-button'));$('graph-results').append(row);}}
function drawGraph(data){const svg=$('graph-canvas'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();const nodes=data.nodes.slice(0,40),positions=new Map();nodes.forEach((n,i)=>{const columns=Math.min(6,nodes.length),rows=Math.ceil(nodes.length/columns);positions.set(n.id,{x:80+(i%columns)*(740/Math.max(1,columns-1)),y:65+Math.floor(i/columns)*(280/Math.max(1,rows-1))});});for(const edge of data.edges){const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)continue;const line=document.createElementNS(ns,'line');Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}).forEach(([k,v])=>line.setAttribute(k,v));svg.append(line);}for(const n of nodes){const p=positions.get(n.id),g=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r','11');const title=document.createElementNS(ns,'title');title.textContent=n.label+' · '+n.source_file;circle.append(title);circle.onclick=()=>loadGraph(n.id).catch(e=>notice(e.message,true));circle.setAttribute('tabindex','0');circle.setAttribute('role','button');circle.setAttribute('aria-label',n.label||n.id);circle.onkeydown=e=>{if(e.key==='Enter')circle.onclick();};const text=document.createElementNS(ns,'text');text.setAttribute('x',p.x);text.setAttribute('y',p.y+25);text.setAttribute('text-anchor','middle');text.textContent=(n.label||n.id).slice(0,23);g.append(circle,text);svg.append(g);}}
function renderJob(){const host=$('job-panel');host.replaceChildren();const j=state.job;host.append(el('h2',j.state==='running'?'Operazione in corso…':j.state==='failed'?'Operazione non completata':'Centro attività'));host.append(el('p',j.operation?`${j.operation} · ${j.state}`:'Il prossimo task apparirà qui.','muted'));if(j.error)host.append(el('p',j.error));if(j.result&&j.operation==='probe')host.append(el('pre',JSON.stringify(j.result,null,2)));if(j.log){const details=el('details');details.append(el('summary','Log dell’operazione'),el('pre',j.log));host.append(details);}}
(async()=>{try{state=await api('state');settings=state.settings;catalog=await api('models');await refresh(true);setInterval(()=>refresh().catch(e=>notice(e.message,true)),4000);}catch(e){notice(e.message,true);}})();

const chosenSources=new Set();let sourceRows=[];
function sourceMode(){const kind=$('source-kind').value;$('source-local').hidden=!kind.endsWith('local');$('source-graph').hidden=kind!=='sharepoint-graph';$('source-branch-row').hidden=!kind.startsWith('azure');$('source-token-row').hidden=kind!=='sharepoint-graph'&&kind!=='azure-remote';$('source-url-row').hidden=kind==='sharepoint-graph'||kind==='azure-local';}
$('source-kind').onchange=sourceMode;
function fillSource(s={}){for(const [id,key]of [['source-id','id'],['source-name','name'],['source-path','path'],['source-url','url'],['source-drive','driveId'],['source-folder','folderId']])$(id).value=s[key]||'';$('source-kind').value=s.kind||'sharepoint-local';$('source-branch').value=s.branch||'main';$('source-token').value='';sourceMode();}
bind('new-source',()=>fillSource());
bind('save-source',async()=>{await api('sources',{id:$('source-id').value||undefined,name:$('source-name').value,kind:$('source-kind').value,path:$('source-path').value,url:$('source-url').value,driveId:$('source-drive').value,folderId:$('source-folder').value,branch:$('source-branch').value,token:$('source-token').value});fillSource();await loadSources();notice('Fonte salvata. Sincronizzala per renderla disponibile agli agenti.');});
async function loadSources(){sourceRows=await api('sources');const host=$('source-list');host.replaceChildren();for(const s of sourceRows){const card=el('div',undefined,'card'),check=input('','checkbox');check.checked=chosenSources.has(s.id);check.onchange=()=>{if(check.checked)chosenSources.add(s.id);else chosenSources.delete(s.id);};const title=el('label',s.name);title.prepend(check);card.append(title,el('p',s.kind+' · '+(s.path||s.url||'Drive '+s.driveId),'muted'));if(s.snapshot)card.append(el('p',s.snapshot.documents.length+' documenti · '+s.snapshot.excluded.length+' esclusi · '+s.snapshot.createdAt+(s.snapshot.revision?' · commit '+s.snapshot.revision:''),'muted'));else card.append(el('p','Non ancora sincronizzata.','muted'));if(s.snapshot?.index)card.append(el('p',s.snapshot.index.nodes+' nodi · '+s.snapshot.index.edges+' relazioni · indice '+s.snapshot.index.version,'muted'));card.append(btn('Sincronizza',async()=>{await saveReferences('asis');return action('sync-source',{source:s.id});}),btn('Modifica collegamento',()=>fillSource(s)));if(s.snapshot?.excluded.length){const detail=el('details');detail.append(el('summary','File esclusi'),el('pre',JSON.stringify(s.snapshot.excluded,null,2)));card.append(detail);}host.append(card);}}
bind('prepare-asis',()=>startAsis('prepare-asis'));
sourceMode();

bind('auto-asis',()=>startAsis('auto-asis'));
bind('asis-open-graphs',()=>{closeWorkspaceDialogs();return openWorkspaceDialog('graph');});

function referenceAvailability(){
  const ready=!!project;
  $('workspace-project-placeholder').hidden=ready;
  for(const id of ['open-asis','open-graph']){
    const button=$(id);button.disabled=!ready;
    if(ready){button.removeAttribute('title');button.removeAttribute('aria-describedby');}
    else{button.title='Scegli un progetto per continuare.';button.setAttribute('aria-describedby','workspace-project-placeholder');}
  }
}
