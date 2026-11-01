'use strict';
let folderDialogVersion=0;
const $=id=>document.getElementById(id);
const token=location.hash.slice(1)||sessionStorage.getItem('pi-suite-token')||'';
if(location.hash){sessionStorage.setItem('pi-suite-token',token);history.replaceState(null,'',location.pathname+location.search);}
let state,settings,catalog=[],project=null,lastJob='',activePage='work',lastDelegations='';
let workspaceFiles={graphs:[],asis:[]},graphExplorerId='',asisExplorerId='',asisPreviewSignature='',asisGraphListSignature='';const chosenGraphs=new Set();
function asisAvailability(){
  const available=workspaceFiles.graphs.some(g=>g.selectable!==false&&chosenGraphs.has(g.id));
  $('generate-asis').disabled=!available||!!state?.busy;
  $('asis-graph-help').textContent=!workspaceFiles.graphs.some(g=>g.selectable!==false)?'Per creare un AS-IS, crea prima il grafo documentale semantico o il grafo del codice per questo progetto.':!available?'Seleziona almeno un grafo di conoscenza come riferimento.':'L’AS-IS esplorerà prima i grafi documentali selezionati, poi confronterà il codice disponibile.';
}
async function previewWorkspaceFile(kind,item){
  const pid=project.id,result=await api('project-file?id='+encodeURIComponent(pid)+'&file='+encodeURIComponent(item.id));
  if(project?.id!==pid||(kind==='asis'&&asisExplorerId!==item.id))return;
  const host=$(kind+'-file-preview');host.replaceChildren(el('h3',item.name),el('pre',result.text));host.hidden=false;if(kind==='asis')asisPreviewSignature=item.id+':'+(item.modifiedAt||item.createdAt);
}
function renderSavedFiles(kind,items){
  const host=$(kind+'-saved-files'),signature=JSON.stringify(items);if(host.dataset.signature===signature)return;host.dataset.signature=signature;host.replaceChildren();
  if(!items.length){host.append(el('p',kind==='asis'?'Nessun documento AS-IS salvato per questo progetto.':'Nessun grafo di conoscenza salvato per questo progetto.','muted'));return;}
  for(const item of items){
    const tile=btn('',()=>kind==='graph'?selectGraph(item.id,true):selectAsis(item.id,true),'saved-file');tile.title=item.path;
    const icon=el('span',undefined,'file-icon');icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<svg viewBox="0 0 24 28" width="26" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 1h12l6 6v20H3z"/><path d="M15 1v7h6M7 13h10M7 18h10M7 23h7"/></svg>';
    const timestamp=typeof item.createdAt==='number'?item.createdAt*1000:item.createdAt;
    const date=el('time','Creato il '+new Date(timestamp).toLocaleString('it-IT'));date.dateTime=new Date(timestamp).toISOString();
    tile.append(icon,el('strong',item.name),date);host.append(tile);
  }
}
async function refreshWorkspaceFiles(){
  if(!project)return;const pid=project.id,files=await api('project-files?id='+encodeURIComponent(pid));if(project?.id!==pid)return;
  workspaceFiles=files;for(const id of chosenGraphs)if(!files.graphs.some(g=>g.id===id&&g.selectable!==false))chosenGraphs.delete(id);
  renderSavedFiles('asis',files.asis);renderSavedFiles('graph',files.graphs.filter(g=>g.selectable!==false));
  const documents=files.asis;if(!documents.some(item=>item.id===asisExplorerId)){asisExplorerId=documents[0]?.id||'';asisPreviewSignature='';}
  const documentOptions=documents.length?documents.map(item=>[item.id,item.name]):[['','Nessun AS-IS disponibile']],documentSignature=JSON.stringify(documentOptions);
  if($('asis-explorer').dataset.signature!==documentSignature){options($('asis-explorer'),documentOptions,asisExplorerId);$('asis-explorer').dataset.signature=documentSignature;}
  if($('asis-dialog').open)await selectAsis(asisExplorerId);
  const graphs=files.graphs.filter(g=>g.selectable!==false);if(!graphs.some(g=>g.id===graphExplorerId))graphExplorerId=graphs[0]?.id||'';
  options($('graph-explorer'),graphs.length?graphs.map(g=>[g.id,g.name+' · '+(g.kind==='document'?'Documentale':'Codice')]):[['','Nessun grafo disponibile']],graphExplorerId);
  const host=$('asis-graph-list'),graphSignature=()=>JSON.stringify(files.graphs.map(g=>[g.id,g.name,g.selectable,chosenGraphs.has(g.id)]));
  if(asisGraphListSignature!==graphSignature()){host.replaceChildren();
  for(const graph of files.graphs.filter(g=>g.selectable!==false)){const check=input('','checkbox');check.checked=chosenGraphs.has(graph.id);check.dataset.graphId=graph.id;check.onchange=()=>{if(check.checked){if(graph.kind==='document')for(const other of files.graphs)if(other.kind==='document')chosenGraphs.delete(other.id);chosenGraphs.add(graph.id);}else chosenGraphs.delete(graph.id);host.querySelectorAll('input').forEach(n=>n.checked=chosenGraphs.has(n.dataset.graphId));asisGraphListSignature=graphSignature();asisAvailability();queueAsisReferences();};const label=el('label',graph.name,'graph-choice');label.prepend(check);host.append(label);}
  asisGraphListSignature=graphSignature();}
  asisAvailability();
}
async function startAsis(){
  const operation=$('asis-refresh-sources').checked?'auto-asis':'prepare-asis',objective=$('asis-objective').value;
  await refreshWorkspaceFiles();if(!workspaceFiles.graphs.some(g=>g.selectable!==false&&chosenGraphs.has(g.id)))throw Error('Seleziona almeno un grafo di conoscenza disponibile per questo progetto.');
  queueAsisReferences();await flushAsisReferences();return action(operation,{project:project.id,graphs:[...chosenGraphs],name:$('asis-name').value.trim(),objective,openChat:true});
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
  dialog.addEventListener('close',()=>folderDialogVersion++);
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
  const dialog=$(kind+'-dialog');const model=settings.roles.orchestrator;$('document-graph-model').textContent=model?'Modello per il grafo: '+model.provider+' / '+model.model:'Configura il modello Orchestratore per generare il grafo semantico.';dialog.querySelector('[data-dialog-project]').textContent=project.name;
  dialog.querySelector('[data-modal-notice]').hidden=true;
  restoreReferences(kind);dialog.showModal();dialog.querySelector('.dialog-body').scrollTop=0;
  await refreshWorkspaceFiles();
  if(kind==='asis'){
    if(!Object.hasOwn(project.workspace?.asis||{},'graphs')){const graph=workspaceFiles.graphs.filter(g=>g.kind==='document').at(-1);if(graph)chosenGraphs.add(graph.id);await refreshWorkspaceFiles();}
    await selectAsis(asisExplorerId);
  }else{fillSource();await selectGraph(graphExplorerId);}
}
function restoreReferences(kind){
  const refs=(kind==='asis'?pendingAsisSaves.get(project.id):null)||project?.workspace?.[kind]||{};
  for(const section of ['asis','graph']){$(section+'-file-preview').replaceChildren();$(section+'-file-preview').hidden=true;$(section+'-saved-files').replaceChildren(el('p','Caricamento file salvati…','muted'));delete $(section+'-saved-files').dataset.signature;}
  if(kind==='asis'){chosenGraphs.clear();for(const id of refs.graphs||[])chosenGraphs.add(id);workspaceFiles={graphs:[],asis:[]};asisAvailability();}
  restoreProjectSources();
  if(kind==='asis'){asisExplorerId='';asisPreviewSignature='';$('asis-name').value=refs.name||'';$('asis-objective').value=refs.objective||'';$('asis-refresh-sources').checked=!!refs.refreshSources;}
  else{graphExplorerId='';$('graph-search').value='';$('document-graph-search').value='';$('graph-stats').replaceChildren();$('graph-canvas').replaceChildren();$('graph-results').replaceChildren();$('document-graph-reader').replaceChildren();}
}
const pendingAsisSaves=new Map();let asisSaveTimer,asisSaving;
function queueAsisReferences(){
  if(!project)return;
  const references={...project.workspace?.asis,graphs:[...chosenGraphs],name:$('asis-name').value.trim(),objective:$('asis-objective').value,refreshSources:$('asis-refresh-sources').checked};
  project.workspace={...project.workspace,asis:references};pendingAsisSaves.set(project.id,references);
  $('asis-save-state').textContent='Salvataggio automatico…';clearTimeout(asisSaveTimer);
  asisSaveTimer=setTimeout(()=>flushAsisReferences().catch(e=>notice(e.message,true)),350);
}
async function flushAsisReferences(){
  if(asisSaving)return asisSaving;
  asisSaving=(async()=>{
    while(pendingAsisSaves.size&&!state?.busy){
      const [pid,references]=pendingAsisSaves.entries().next().value;pendingAsisSaves.delete(pid);
      try{
        const workspace=await api('project-references',{project:pid,section:'asis',references});
        if(project?.id===pid&&!pendingAsisSaves.has(pid)){project.workspace=workspace;$('asis-save-state').textContent='Impostazioni salvate automaticamente.';}
      }catch(error){
        if(!pendingAsisSaves.has(pid))pendingAsisSaves.set(pid,references);
        if(project?.id===pid)$('asis-save-state').textContent='Salvataggio in attesa. Le impostazioni verranno salvate appena possibile.';
        if(!error.message.includes('corso'))throw error;
        return;
      }
    }
  })();
  try{await asisSaving;}finally{asisSaving=null;}
}
async function selectAsis(id,scroll=false){
  asisExplorerId=id;$('asis-explorer').value=id;
  const item=workspaceFiles.asis.find(doc=>doc.id===id);$('asis-explorer-empty').hidden=!!item;
  if(!item){$('asis-file-preview').replaceChildren();$('asis-file-preview').hidden=true;asisPreviewSignature='';}
  else if(asisPreviewSignature!==item.id+':'+(item.modifiedAt||item.createdAt))await previewWorkspaceFile('asis',item);
  if(scroll)$('asis-explore-title').scrollIntoView({block:'start',behavior:'smooth'});
}
$('asis-explorer').onchange=()=>selectAsis($('asis-explorer').value).catch(e=>notice(e.message,true));
for(const id of ['asis-name','asis-objective','asis-refresh-sources'])$(id).addEventListener('input',queueAsisReferences);
$('asis-create-form').onsubmit=event=>{event.preventDefault();if(state?.busy)return;$('generate-asis').disabled=true;startAsis().catch(e=>notice(e.message,true)).finally(asisAvailability);};
bind('open-asis',()=>openWorkspaceDialog('asis'));bind('open-graph',()=>openWorkspaceDialog('graph'));
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));
function setup(){referenceAvailability();const steps=[['Connessioni',`${settings.providers.length} provider configurati`,'providers',settings.providers.length>0],['La tua squadra',settings.roles.worker?'Orchestratore + subagenti':settings.roles.orchestrator?'Solo orchestratore':'Scegli l’orchestratore','roles',!!settings.roles.orchestrator],['Contesto locale',project?.name||'Scegli il tuo progetto','work',!!project]];$('setup').replaceChildren();steps.forEach(([title,desc,target,done],i)=>{const b=btn('',()=>page(target),'setup-step');b.append(el('span',done?'✓':String(i+1),'step-number'));const d=el('div',title);d.append(el('small',desc));b.append(d);$('setup').append(b);});}
function projects(){options($('project'),[['','Nessun progetto · Chat con contesto pulito'],...settings.projects.map(p=>[p.id,settings.projects.filter(other=>other.name===p.name).length>1?p.name+' · '+p.path:p.name])],project?.id||'');for(const option of $('project').options)option.title=settings.projects.find(p=>p.id===option.value)?.path||'';}
async function refresh(initial=false){state=await api('state');if(initial||!settings)settings=state.settings;else settings.projects=state.settings.projects;setup();renderJob();if(activePage==='runs')await loadDelegations();if(initial){projects();renderProviders();renderRoles();renderSkills();}const signature=state.job.id+':'+state.job.state;if(signature!==lastJob){lastJob=signature;if(state.job.state==='done'){notice('Operazione completata.');projects();if(state.job.operation==='generate-graph'&&project?.id===state.job.result?.project){project=await api('project?id='+project.id);restoreProjectSources();graphExplorerId=state.job.result.graph;await refreshWorkspaceFiles();await selectGraph(graphExplorerId);notice('Grafo creato e salvato automaticamente in I miei grafi.');}if(state.job.operation==='graph'&&project){project=await api('project?id='+project.id);await loadGraph();}if(['sync-source','document-graphs','prepare-asis','auto-asis','index-sources','register-asis'].includes(state.job.operation)){await loadSources();if(project){await refreshWorkspaceFiles();if(state.job.operation==='document-graphs')await loadDocumentGraph();}if(state.job.result?.workspace)notice('Dossier pronto in '+state.job.result.workspace+'. La chat scriverà la documentazione.');}if(state.job.operation==='probe'){settings.modelChecks=state.settings.modelChecks;renderProviders();}if(state.job.operation==='probe')notice('Connessione e tool calling verificati. Ragionamento effettivo: '+state.job.result.effective);}if(state.job.state==='failed')notice(state.job.error,true);}if(!state.busy)await flushAsisReferences();if($('asis-dialog').open)await refreshWorkspaceFiles();document.querySelectorAll('[data-job-button]').forEach(b=>b.disabled=state.busy);asisAvailability();}
bind('open-chat',async()=>{const selected=project;const result=await api('chat',selected?{project:selected.id}:{});notice(selected?'Chat Pi aperta per '+selected.name+' in '+result.folder:'Chat Pi aperta con contesto pulito in '+result.folder);});
async function loadDelegations(){
  const batches=await api('delegations'),host=$('delegation-list'),signature=JSON.stringify(batches);
  if(signature===lastDelegations)return;lastDelegations=signature;host.replaceChildren();
  for(const batch of batches){
    const card=el('div',undefined,'card');card.append(el('h2','Delega dalla chat · '+batch.state),el('p',batch.plan));
    for(const task of batch.tasks){
      const detail=el('details');detail.append(el('summary',task.title+' · '+task.state),el('pre',task.assignment),el('p','Artefatti: '+task.directory),el('pre',task.result?.result?.text||task.result?.error||task.error||'In attesa del risultato.'));
      const reading=task.evidenceReading;
      if(reading&&(reading.scope||reading.readCalls)){
        const coverage=el('div',undefined,'card');coverage.append(el('h3','Copertura delle evidenze'));
        if(reading.scope)coverage.append(el('p',reading.scope.focus));
        coverage.append(el('p','Documenti consultati: '+reading.readDocumentCount+' · testi disponibili letti integralmente: '+reading.completeAvailableTextDocuments+' · letture parziali: '+reading.partialDocuments));
        if(reading.reportMissing)coverage.append(el('p','Il figlio non ha consegnato il resoconto delle evidenze.','error'));
        if(reading.declarationStale)coverage.append(el('p','Il figlio ha effettuato altre letture dopo il resoconto: occorre aggiornarlo.','muted'));
        if(reading.declaration)coverage.append(el('p',reading.declaration.summary));
        const provenance=el('details');provenance.append(el('summary','Versioni, citazioni e parti non lette'),el('pre',JSON.stringify({
          sources:reading.scope?.sources,documents:reading.documents.map(d=>({path:d.path,source:d.source,snapshot:d.snapshot,modes:d.modes,availableTextFullyRead:d.availableTextFullyRead,extractionTruncated:d.extractionTruncated,notes:d.coverageNotes})),
          citations:reading.declaration?.citations,unread:reading.unreadInitialDocuments,unreadReasons:reading.declaration?.unreadDocuments,uncertainties:reading.declaration?.uncertainties,scopeExpansionRequests:reading.declaration?.scopeExpansionRequests},null,2)));
        coverage.append(provenance);detail.append(coverage);
      }
      card.append(detail);
    }
    host.append(card);
  }
}
async function save(){settings=await api('settings',settings);connectionRevision=settings.byokRevision;catalog=await api('models');renderProviders();renderRoles();renderSkills();setup();notice('Configurazione salvata.');}
let connectionMode='custom',selectedConnection='',connectionDraft=null,connectionRevision='',connectionGeneration=0,connectionLoading=false,connectionSaving=false;
function connectionMessage(text='',error=false){const host=$('connection-status');host.textContent=text;host.hidden=!text;host.classList.toggle('error',error);}
function connectionAvailability(){
  $('native-connection').hidden=connectionMode!=='provider';$('custom-connection').hidden=connectionMode!=='custom';
  $('mode-provider').checked=connectionMode==='provider';$('mode-custom').checked=connectionMode==='custom';
  $('connection-fields').disabled=connectionLoading||connectionSaving;
  for(const id of ['saved-connection','mode-provider','mode-custom'])$(id).disabled=connectionSaving;
  $('save-connection').disabled=connectionLoading||connectionSaving||!connectionDraft||(connectionMode==='custom'?!$('byok-editor').value.trim():!$('native-provider').value||!$('connection-name').value.trim());
  $('save-connection').textContent=connectionSaving?'Salvataggio...':selectedConnection?'Salva configurazione':'Aggiungi configurazione';
}
async function loadConnection(){
  const generation=++connectionGeneration;connectionLoading=true;connectionDraft=null;$('byok-key').value='';$('byok-editor').value='';connectionMessage();connectionAvailability();
  try{
    const result=await api('byok/config');if(generation!==connectionGeneration)return;
    connectionRevision=result.revision;
    const saved=result.config.connections.find(c=>c.id===selectedConnection);
    if(selectedConnection&&!saved)throw Error('Configurazione non disponibile. Ricarica la pagina.');
    if(saved)connectionMode=saved.baseUrl?'custom':'provider';
    connectionDraft=saved||{id:'',name:'',providerType:'',auth:{type:'secret',ref:''},models:[]};
    const aliases=new Set(settings.providers.filter(p=>p.custom||p.providerType&&p.providerType!==p.id).map(p=>p.id));
    const available=[...new Set([...catalog.filter(m=>!aliases.has(m.provider)).map(m=>m.provider),...settings.providers.filter(p=>!p.custom).map(p=>p.providerType||p.id)])].sort();
    options($('native-provider'),[['','Scegli un fornitore'],...available.map(p=>[p,p])],connectionMode==='provider'?connectionDraft.providerType:'');
    $('connection-name').value=connectionMode==='provider'?connectionDraft.name:'';
    if(saved&&connectionMode==='custom')$('byok-editor').value=JSON.stringify({schemaVersion:1,connections:[saved]},null,2);
    const hasKey=settings.providers.find(p=>p.id===selectedConnection)?.hasKey;
    const environment=saved?.auth.type==='env';
    $('connection-key-field').hidden=environment;
    $('byok-key').placeholder=hasKey?'Chiave salvata: lascia vuoto per conservarla':'API key';
    $('connection-key-status').textContent=environment?'Credenziale da variabile ambiente: '+saved.auth.name:hasKey?'Chiave protetta salvata su questo PC.':connectionMode==='custom'?'Chiave facoltativa per server senza autenticazione.':'Chiave protetta su questo PC.';
  }catch(error){if(generation===connectionGeneration)connectionMessage(error.message,true);}
  finally{if(generation===connectionGeneration){connectionLoading=false;connectionAvailability();}}
}
function renderProviders(){
  if(selectedConnection&&!settings.providers.some(p=>p.id===selectedConnection)){selectedConnection='';connectionDraft=null;}
  options($('saved-connection'),[['','Nuova configurazione'],...settings.providers.map(p=>[p.id,p.name||p.id])],selectedConnection);
  $('byok-directory').textContent='Dati locali: '+settings.dataDirectory;
  if(!connectionDraft&&!connectionLoading)return loadConnection();
}
$('saved-connection').onchange=()=>{selectedConnection=$('saved-connection').value;loadConnection();};
for(const mode of ['provider','custom'])$('mode-'+mode).onchange=()=>{connectionMode=mode;selectedConnection='';$('saved-connection').value='';loadConnection();};
for(const id of ['byok-editor','byok-key','connection-name'])$(id).oninput=()=>{connectionMessage();connectionAvailability();};
$('native-provider').onchange=()=>{if(!$('connection-name').value||$('connection-name').value===connectionDraft.providerType)$('connection-name').value=$('native-provider').value;connectionMessage();connectionAvailability();};
async function saveConnection(){
  if(connectionLoading||connectionSaving||!connectionDraft)return;
  let content=$('byok-editor').value;
  if(connectionMode==='provider'){
    const type=$('native-provider').value;if(!type)throw Error('Scegli un fornitore.');
    let id=selectedConnection||type,index=1;while(!selectedConnection&&settings.providers.some(p=>p.id===id))id=type+'-'+(++index);
    const changed=connectionDraft.providerType&&connectionDraft.providerType!==type;
    const connection={...connectionDraft,id,name:$('connection-name').value.trim(),providerType:type,models:changed?[]:connectionDraft.models};
    if(!selectedConnection||connection.auth.type==='none')connection.auth={type:'secret',ref:'byok/'+id};
    content=JSON.stringify({schemaVersion:1,connections:[connection]});
  }
  if(!content.trim())throw Error('Inserisci la configurazione JSON.');
  connectionSaving=true;connectionMessage();connectionAvailability();
  try{
    const ids=new Set(settings.providers.map(p=>p.id));
    settings=await api('byok/connections',{content,connectionId:selectedConnection,revision:connectionRevision,apiKey:$('byok-key').value});
    const savedMessage=['Configurazione salvata.',...(settings.connectionNotices||[])].join(' ');
    $('byok-key').value='';selectedConnection=selectedConnection||settings.providers.find(p=>!ids.has(p.id))?.id||'';
    connectionDraft=null;await renderProviders();setup();
    try{catalog=await api('models');renderRoles();}catch(error){connectionMessage(savedMessage+' Catalogo non aggiornato: '+error.message,true);return;}
    connectionMessage(savedMessage);
  }catch(error){connectionMessage(error.message,true);}
  finally{connectionSaving=false;connectionAvailability();}
}
$('connection-form').onsubmit=event=>{event.preventDefault();saveConnection().catch(error=>connectionMessage(error.message,true));};
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
  closeWorkspaceDialogs();project=null;$('open-chat').disabled=!!id;$('open-asis').disabled=true;$('open-graph').disabled=true;$('chat-project-info').textContent='Senza progetto si apre una nuova chat con contesto pulito e le connessioni, i modelli, i profili e le skill configurati.';setup();
  $('project-info').textContent=id?'Apertura progetto…':'Il progetto è facoltativo: selezionalo o creane uno per usare la sua cartella e i suoi riferimenti.';
  if(!id)return;
  try{
    const loaded=await api('project?id='+encodeURIComponent(id));if(request!==projectRequest)return;
    project=loaded;setup();$('open-chat').disabled=false;$('chat-project-info').textContent='La chat userà la cartella e i riferimenti di '+project.name+'.';
    $('project-info').textContent=project.path;$('open-asis').disabled=false;$('open-graph').disabled=false;
    $('graph-project').textContent=project.name;$('graph-state').textContent=project.graph?(project.graph.stale?'Grafo da aggiornare · ':'Grafo aggiornato · ')+project.graph.stats.nodes+' nodi':'Il grafo non è ancora stato creato.';
  }catch(e){if(request===projectRequest){$('project').value='';$('open-chat').disabled=false;$('project-info').textContent='Progetto non disponibile. Puoi aprire una chat con contesto pulito o scegliere un’altra cartella.';throw e;}}
}
$('project').onchange=()=>openProject().catch(e=>notice(e.message,true));
bind('new-project',()=>{
  $('project-form').reset();$('clear-project-path').hidden=true;$('project-dialog').querySelector('[data-modal-notice]').hidden=true;
  $('project-location-help').textContent='Con il solo nome, la suite crea una cartella nella propria area progetti.';
  $('project-dialog').showModal();$('project-name').focus();
});
let choosingFolder=false;
async function chooseDirectory(target,context,button,afterSelect){
  if(choosingFolder)return;
  const control=$(target),dialog=control.closest('dialog'),projectId=project?.id;
  const dialogVersion=folderDialogVersion;
  const original=control.value,sourceKind=$('source-kind').value,sourceModeValue=graphLocation();
  const blocked=[...document.querySelectorAll('[data-folder-picker]'),$('create-project'),$('generate-graph'),$('graph-kind'),...document.querySelectorAll('[name=graph-location]'),$('source-kind'),$('generate-asis'),$('clear-project-path')];
  const disabled=blocked.map(n=>n.disabled);choosingFolder=true;
  blocked.forEach(n=>n.disabled=true);$(button).setAttribute('aria-busy','true');
  dialog.querySelector('[data-modal-notice]').hidden=true;
  try{
    const result=await api('folder',{context,initialPath:original||project?.path||''});
    if(result.path&&dialog.open&&folderDialogVersion===dialogVersion&&project?.id===projectId&&control.value===original&&
      (context!=='source'||($('source-kind').value===sourceKind&&graphLocation()===sourceModeValue))){
      control.value=result.path;control.dispatchEvent(new Event('change',{bubbles:true}));afterSelect?.(result.path);
    }
  }finally{choosingFolder=false;blocked.forEach((n,i)=>n.disabled=disabled[i]);$(button).removeAttribute('aria-busy');}
}
function chooseProjectFolder(){
  return chooseDirectory('project-path','project','browse-project',path=>{
    if(!$('project-name').value.trim())$('project-name').value=path.split(/[\\/]/).filter(Boolean).at(-1)||'';
    $('clear-project-path').hidden=false;$('project-location-help').textContent='La cartella scelta verrà collegata quando premi Crea progetto.';
  });
}
bind('browse-project',chooseProjectFolder);bind('project-path',chooseProjectFolder);
$('project-path').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseProjectFolder().catch(e=>notice(e.message,true));}};
for(const [target,context,button]of [['source-path','source','browse-source']]){
  bind(button,()=>chooseDirectory(target,context,button));
  // The editable field also opens Explorer; pasting a path remains supported.
  bind(target,()=>chooseDirectory(target,context,button));
  $(target).onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();chooseDirectory(target,context,button).catch(e=>notice(e.message,true));}};
}
bind('clear-project-path',()=>{$('project-path').value='';$('clear-project-path').hidden=true;$('project-location-help').textContent='Con il solo nome, la suite crea una cartella nella propria area progetti.';});
$('project-form').onsubmit=event=>{
  event.preventDefault();if(choosingFolder)return;
  $('create-project').disabled=true;
  Promise.resolve().then(async()=>{
    const created=await api('projects',{name:$('project-name').value.trim(),path:$('project-path').value});
    state=await api('state');settings.projects=state.settings.projects;projects();$('project').value=created.id;
    await openProject();notice('Progetto pronto: '+created.name+'.');
  }).catch(e=>notice(e.message,true)).finally(()=>$('create-project').disabled=false);
};
async function action(operation,data={}){await api('action',{operation,...data});if(!((['generate-graph','graph','sync-source','document-graphs','index-sources'].includes(operation)&&$('graph-dialog').open||['prepare-asis','auto-asis'].includes(operation)&&$('asis-dialog').open)))page('runs');await refresh();if(state.busy)notice('Operazione avviata. Puoi seguirne lo stato qui.');}
bind('search-graph',()=>loadGraph());$('graph-search').onkeydown=e=>{if(e.key==='Enter')loadGraph().catch(e=>notice(e.message,true));};
async function loadGraph(node){if(!project)return;const pid=project.id,selected=graphExplorerId,data=await api('graph?id='+pid+'&file='+encodeURIComponent(selected)+'&q='+encodeURIComponent($('graph-search').value)+(node?'&node='+encodeURIComponent(node):''));if(project?.id!==pid||graphExplorerId!==selected)return;$('graph-project').textContent=workspaceFiles.graphs.find(g=>g.id===selected)?.name||project.name;$('graph-state').textContent='Grafo salvato · nessun consumo API durante l’esplorazione';$('graph-stats').replaceChildren();for(const [label,value]of [['Nodi',data.stats.nodes],['Relazioni',data.stats.edges],['File riutilizzati',data.stats.reused],['File rianalizzati',data.stats.extracted]]){const s=el('div');s.append(el('strong',String(value)),el('small',label));$('graph-stats').append(s);}drawGraph(data);$('graph-results').replaceChildren();if(data.truncated)$('graph-results').append(el('p','Risultati parziali: restringi la ricerca.','muted'));if(!data.nodes.length)$('graph-results').append(el('p','Nessun simbolo corrispondente.','muted'));for(const n of data.nodes){const row=el('div',undefined,'graph-node');row.append(btn(n.label||n.id,()=>loadGraph(n.id),'text-button'),el('small',n.source_file+' · '+(n.source_location||'')));row.append(btn('Leggi sorgente',async()=>{const source=await api('source?id='+pid+'&file='+encodeURIComponent(selected)+'&path='+encodeURIComponent(workspaceFiles.graphs.find(g=>g.id===selected)?.source?n.source_file:n.source_file.replace(/^repo\//,'')));const existing=$('graph-source');if(existing)existing.remove();const pre=el('pre',source.text);pre.id='graph-source';$('graph-results').prepend(pre);},'text-button'));$('graph-results').append(row);}}
function drawGraph(data,target='graph-canvas',onSelect=loadGraph){const svg=$(target),ns='http://www.w3.org/2000/svg';svg.replaceChildren();const nodes=data.nodes.slice(0,40),positions=new Map();nodes.forEach((n,i)=>{const columns=Math.min(6,nodes.length),rows=Math.ceil(nodes.length/columns);positions.set(n.id,{x:80+(i%columns)*(740/Math.max(1,columns-1)),y:65+Math.floor(i/columns)*(280/Math.max(1,rows-1))});});for(const edge of data.edges){const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)continue;const line=document.createElementNS(ns,'line');Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}).forEach(([k,v])=>line.setAttribute(k,v));svg.append(line);}for(const n of nodes){const p=positions.get(n.id),g=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r','11');const title=document.createElementNS(ns,'title');title.textContent=n.label+' · '+(n.source_file||n.path||n.kind||'');circle.append(title);circle.onclick=()=>onSelect(n.id).catch(e=>notice(e.message,true));circle.setAttribute('tabindex','0');circle.setAttribute('role','button');circle.setAttribute('aria-label',n.label||n.id);circle.onkeydown=e=>{if(e.key==='Enter')circle.onclick();};const text=document.createElementNS(ns,'text');text.setAttribute('x',p.x);text.setAttribute('y',p.y+25);text.setAttribute('text-anchor','middle');text.textContent=(n.label||n.id).slice(0,23);g.append(circle,text);svg.append(g);}}
function renderJob(){
  const j=state.job,names={'generate-graph':'Generazione grafo',graph:'Grafo del codice','sync-source':'Acquisizione e relazioni esplicite','document-graphs':'Grafo documentale semantico','index-sources':'Indici delle relazioni esplicite','prepare-asis':'Preparazione AS-IS','auto-asis':'Aggiornamento fonti e preparazione AS-IS','register-asis':'Registrazione AS-IS',probe:'Verifica modello'},states={running:'In corso',done:'Completata',failed:'Non completata'};
  for(const host of [$('job-panel'),$('graph-job-panel'),$('asis-job-panel')]){
    if(host.id==='graph-job-panel')host.hidden=!['generate-graph','graph','sync-source','document-graphs','index-sources'].includes(j.operation);
    if(host.id==='asis-job-panel')host.hidden=!['prepare-asis','auto-asis'].includes(j.operation);
    host.dataset.operation=j.operation||'';host.dataset.state=j.state||'';host.replaceChildren();
    host.append(el('h2',j.state==='running'?'Operazione in corso…':j.state==='failed'?'Operazione non completata':'Centro attività'));
    host.append(el('p',j.operation?`${names[j.operation]||j.operation} · ${states[j.state]||j.state}`:'Il prossimo task apparirà qui.','muted'));
    if(j.error)host.append(el('p',j.error));
    if(j.result&&j.operation==='probe')host.append(el('pre',JSON.stringify(j.result,null,2)));
    if(j.log){const details=el('details');details.append(el('summary','Log dell’operazione'),el('pre',j.log));host.append(details);}
  }
}
(async()=>{try{state=await api('state');settings=state.settings;catalog=await api('models');await refresh(true);setInterval(()=>refresh().catch(e=>notice(e.message,true)),4000);}catch(e){notice(e.message,true);}})();

const chosenSources=new Set();let sourceRows=[];
function restoreProjectSources(){chosenSources.clear();for(const id of project?.workspace?.graph?.sources??project?.workspace?.asis?.sources??[])chosenSources.add(id);}
function graphLocation(){return document.querySelector('[name=graph-location]:checked').value;}
function sourceMode(){
  const remote=graphLocation()==='remote',kind=$('source-kind').value,documental=$('graph-kind').value==='document';
  $('source-local').hidden=remote;$('source-remote').hidden=!remote;$('source-path').required=!remote;$('source-url').required=remote;
  const sharepoint=remote&&kind==='sharepoint-graph';$('source-graph').hidden=!sharepoint;$('source-branch-row').hidden=kind!=='azure-remote';
  for(const id of ['source-drive','source-folder','source-token'])$(id).required=sharepoint;
  $('source-url').placeholder=kind==='sharepoint-graph'?'https://azienda.sharepoint.com/sites/progetto/Documenti':'https://dev.azure.com/organizzazione/progetto/_git/repository';
  $('source-token-help').textContent=sharepoint?'Token Microsoft Graph con accesso in lettura alla cartella.':'PAT con permesso Code Read, oppure lascia vuoto per usare le credenziali Git configurate.';
  $('document-graph-model').hidden=!documental;
  $('graph-generation-help').textContent=documental?'Il grafo documentale usa il modello Orchestratore e può comportare costi API.':'Il grafo del codice analizza Python, JavaScript e TypeScript senza chiamare modelli.';
}
$('source-kind').onchange=sourceMode;$('graph-kind').onchange=sourceMode;
for(const control of document.querySelectorAll('[name=graph-location]'))control.onchange=sourceMode;
function fillSource(){
  $('graph-create-form').reset();$('source-path').value=project?.path||'';sourceMode();
}
async function loadSources(){sourceRows=await api('sources');}
async function selectGraph(id,scroll=false){
  graphExplorerId=id;$('graph-explorer').value=id;
  const item=workspaceFiles.graphs.find(g=>g.id===id&&g.selectable!==false);
  $('graph-explorer-empty').hidden=!!item;$('document-graph-view').hidden=item?.kind!=='document';$('code-graph-view').hidden=item?.kind!=='project';
  if(item){if(item.kind==='document')await loadDocumentGraph();else await loadGraph();}
  if(scroll)$('graph-explore-title').scrollIntoView({block:'start',behavior:'smooth'});
}
$('graph-explorer').onchange=()=>selectGraph($('graph-explorer').value).catch(e=>notice(e.message,true));
$('graph-create-form').onsubmit=event=>{
  event.preventDefault();if(choosingFolder||state?.busy)return;
  const button=$('generate-graph');button.disabled=true;
  const remote=graphLocation()==='remote',source={name:$('source-name').value,kind:remote?$('source-kind').value:'sharepoint-local',
    ...(remote?{url:$('source-url').value,driveId:$('source-drive').value,folderId:$('source-folder').value,branch:$('source-branch').value,token:$('source-token').value}:{path:$('source-path').value})};
  action('generate-graph',{project:project.id,name:$('source-name').value,graphKind:$('graph-kind').value,source})
    .then(()=>$('source-token').value='').catch(e=>notice(e.message,true)).finally(()=>button.disabled=!!state?.busy);
};
sourceMode();



function referenceAvailability(){
  const ready=!!project;
  $('workspace-project-placeholder').hidden=ready;
  for(const id of ['open-asis','open-graph']){
    const button=$(id);button.disabled=!ready;
    if(ready){button.removeAttribute('title');button.removeAttribute('aria-describedby');}
    else{button.title='Scegli un progetto per continuare.';button.setAttribute('aria-describedby','workspace-project-placeholder');}
  }
}
