'use strict';
// The ledger only calls /api/benchmarks. No harness settings, logs or provider calls.
(() => {
  let data, view = 'overview', selected = '', importedFiles = [], generatedCase = null;
  const root = $('benchmark-root');
  const statusLabels = {measured:'Misurata', not_applicable:'Non pertinente', unavailable:'Non disponibile'};
  const originLabels = {user_report:'Compilazione utente',chat_report:'Report della chat',harness_export:'Export dell’harness',runner:'Valutazione del runner',human_review:'Revisione umana',model_judge:'Giudizio LLM esterno'};
  const outcomeLabels = {passed:'Riuscito', failed:'Fallito', partial:'Parziale', not_evaluated:'Da valutare'};
  // Fonti is temporarily hidden from the navigation; its view remains available.
  const tabs = [['overview','Configurazioni'],['cases','Prove']];
  const architectureFields=[['name','Etichetta libera',false],['model','Modello orchestratore',false],['workers','Modelli dei subagenti e relativi ruoli',true],['harness','Harness e versione',false],['hosting','Modalità di hosting',false],['tools','Strumenti e memoria',true],['parameters','Parametri rilevanti',true],['notes','Note libere',true]];
  const archName=a=>a.name||('Esecuzione '+(a.slot||''));
  const detailCount=a=>architectureFields.filter(([key])=>a[key]?.trim()).length;
  const req = (path='', body) => api('benchmarks'+path, body);
  const record = (kind,id) => req('/record?kind='+kind+'&id='+encodeURIComponent(id));
  const date = value => new Date(value).toLocaleString('it-IT');
  const section = (title) => {const n=el('div',undefined,'card');if(title)n.append(el('h2',title));return n;};
  const row = (...nodes) => {const n=el('div',undefined,'row');n.append(...nodes);return n;};
  const pill = text => el('span',text,'bench-pill');
  const info = text => el('p',text,'bench-info');
  function inspectHelp(id) {
    const box=el('span',undefined,'bench-inspect-help'),button=el('button','i','bench-info-button');
    const tooltip=el('span','I controlli deterministici dell’adattatore sono disponibili per Calcolo ed Estrazione JSON nelle versioni originali. Al caricamento del file vengono verificati successo, correttezza e formato, senza chiamate a modelli. Gli altri casi e le dimensioni non misurabili deterministicamente passano al valutatore LLM esterno.','bench-info-tooltip');
    button.type='button';button.setAttribute('aria-label','Informazioni sulla copertura di Inspect');button.setAttribute('aria-describedby',id);button.setAttribute('aria-controls',id);button.setAttribute('aria-expanded','false');
    tooltip.id=id;tooltip.setAttribute('role','tooltip');tooltip.hidden=true;
    let pinned=false;
    const show=()=>{tooltip.hidden=false;tooltip.style.top='calc(100% + 8px)';tooltip.style.bottom='auto';if(tooltip.getBoundingClientRect().bottom>innerHeight-12&&box.getBoundingClientRect().top>tooltip.getBoundingClientRect().height+12){tooltip.style.top='auto';tooltip.style.bottom='calc(100% + 8px)';}button.setAttribute('aria-expanded','true');};
    const hide=()=>{tooltip.hidden=true;button.setAttribute('aria-expanded','false');};
    box.addEventListener('mouseenter',show);box.addEventListener('mouseleave',()=>{if(!pinned&&document.activeElement!==button)hide();});
    button.addEventListener('focus',show);button.addEventListener('blur',()=>{pinned=false;hide();});
    button.addEventListener('click',()=>{pinned=!pinned;pinned?show():hide();});
    button.addEventListener('keydown',event=>{if(event.key==='Escape'){pinned=false;hide();event.stopPropagation();}});
    box.append(button,tooltip);return box;
  }
  const action = (label, fn, primary=false) => btn(label, fn, primary?'primary':'secondary');
  const download = (name,content,type='application/json') => {
    const blob=content instanceof Blob?content:new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)],{type});
    const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  async function downloadCase(caseId,snapshot=null){const packet=await (snapshot?req('/case-packet',{case:snapshot}):req('/case-packet?case='+encodeURIComponent(caseId)));download(packet.filename,packet.content,'text/markdown');notice('Allega il file alla chat della configurazione da testare e invia: Esegui la prova allegata.');}
  async function exportJudge(runId){
    const packet=await req('/evaluation-request?run='+encodeURIComponent(runId));download(packet.filename,packet.content,'text/markdown');
    notice('Allega questo unico file al valutatore. Carica il suo JSON con Carica valutazione esterna.');
  }
  function judgeExportControl(run=null){
    const box=el('div'),status=run?.judgeExport;
    const button=action('Scarica richiesta valutazione',()=>exportJudge(run.id),true);
    button.disabled=!status?.available||!run?.hasSourceFile;
    if(button.disabled){const reason=status?.reasons?.join(' ')||'Carica e salva la risposta dell’esecuzione per preparare la cartella.';button.title=reason;box.append(button,el('p',reason,'muted'));}
    else box.append(button);
    return box;
  }
  function descriptionEditor(host,prefix,a={}){
    const controls={};for(const [key,label,multi] of architectureFields)controls[key]=control(host,prefix+key,label,a[key]||'',multi);
    return ()=>Object.fromEntries(Object.entries(controls).map(([key,n])=>[key,n.value]));
  }
  function control(form,key,label,value='',multiline=false,required=false) {
    const n=multiline?el('textarea'):input(value);if(multiline){n.rows=4;n.value=value;}
    n.name=key;n.required=required;n.id='bench-'+key;form.append(field(label,n));return n;
  }
  function select(form,key,label,items,value) {
    const n=el('select');n.id='bench-'+key;n.name=key;options(n,items,value);form.append(field(label,n));return n;
  }
  function submit(form,label,fn) {
    const button=el('button',label,'primary');button.type='submit';form.append(button);
    form.addEventListener('invalid',e=>{const details=e.target.closest('details');if(details)details.open=true;},true);
    form.onsubmit=async e=>{e.preventDefault();if(form.dataset.submitting||!form.reportValidity())return;form.dataset.submitting='true';const submits=[...form.querySelectorAll('button[type="submit"]')];submits.forEach(b=>b.disabled=true);
      try{await fn(Object.fromEntries(new FormData(form)),e);}catch(error){notice(error.message,true);}finally{delete form.dataset.submitting;submits.forEach(b=>b.disabled=false);}};
  }
  function heading(title,description) {
    root.append(el('div','LABORATORIO MANUALE','eyebrow'),el('h1',title),el('p',description,'lead'));
  }
  function back(label='Alle configurazioni',target='overview',id='') {root.append(btn('← '+label,()=>go(target,id),'text-button bench-back'));}
  const currentURL=()=>location.pathname+location.search;
  function detailURL(target,id,returnTo=currentURL()){
    const url=new URL(location.href);url.search='';url.hash=token;url.searchParams.set('page','benchmarks');url.searchParams.set('view',target);url.searchParams.set('id',id);url.searchParams.set('returnTo',returnTo);return url;
  }
  function detailBack(fallback){
    root.append(btn('← Indietro',()=>{
      const candidate=new URLSearchParams(location.search).get('returnTo')||history.state?.previousURL;
      if(candidate){try{const destination=new URL(candidate,location.href);if(destination.origin===location.origin&&destination.pathname===location.pathname){
        if(history.state?.previousURL===destination.pathname+destination.search&&history.length>1)history.back();else location.assign(destination.href);return;
      }}catch{}}
      return go(fallback);
    },'text-button bench-back'));
  }
  function selectionToolbar(box,selection,readTest,readConfiguration,target){
    const configurationPage=target==='case',toolbar=el('div',undefined,'bench-selection-row'+(configurationPage?' bench-selection-configuration':' bench-selection-single'));
    let selectedRun=null,uploadTarget=null,busy=false;
    const picker=input('','file');picker.accept='.json,application/json';picker.id='bench-result-file';picker.hidden=true;
    const evaluationPicker=input('','file');evaluationPicker.accept='.json,application/json';evaluationPicker.id='bench-evaluation-file';evaluationPicker.hidden=true;
    const uploadButton=action('Carica risultati',()=>{uploadTarget={test:readTest(),configurationId:readConfiguration()};picker.click();},true);
    const evaluationButton=action('Carica valutazione esterna',()=>{uploadTarget={test:readTest(),configurationId:readConfiguration()};evaluationPicker.click();});
    const downloadButton=action(configurationPage?'Scarica richiesta valutazione':'Scarica prova',()=>configurationPage?exportJudge(selectedRun.id):downloadCase(readTest().id,readTest()));
    toolbar.append(selection.parentElement,...(configurationPage?[uploadButton,downloadButton,evaluationButton]:[downloadButton]));
    const link=el('a',target==='case'?'Vai al dettaglio della prova':'Vai al dettaglio della configurazione','bench-detail-link');
    link.onclick=event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();const url=new URL(link.href);go(target,url.searchParams.get('id'),true,currentURL()).catch(e=>notice(e.message,true));};
    box.append(toolbar,link);if(configurationPage)box.append(picker,evaluationPicker);
    const update=(run=null)=>{selectedRun=run;const c=readTest(),configurationId=readConfiguration();uploadButton.disabled=busy||!c||!configurationId;
      downloadButton.disabled=configurationPage?busy||!run?.judgeExport?.available||!run?.hasSourceFile:!c;
      evaluationButton.disabled=busy||!run||!c||!configurationId;
      downloadButton.title=configurationPage&&downloadButton.disabled?(run?.judgeExport?.reasons?.join(' ')||'Carica prima il file JSON completo prodotto dalla chat.') : '';
      link.hidden=!c||!configurationId;if(c&&configurationId)link.href=detailURL(target,target==='case'?c.id+'~'+configurationId:configurationId+'~'+c.id).href;};
    const upload=async(inputFile,route)=>{const file=inputFile.files[0],destination=uploadTarget;if(!file||!destination?.test)return;busy=true;update(selectedRun);
      try{if(!file.name.toLowerCase().endsWith('.json')||file.size>1500000)throw Error('Carica un unico file JSON prodotto dalla chat.');
        const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
        await req(route,{caseId:destination.test.id,caseSnapshot:destination.test,architectureId:destination.configurationId,filename:file.name,base64:btoa(raw)});
        await go('architecture',destination.configurationId+'~'+destination.test.id,false);notice('File caricato. Risposta, controlli e valutazioni disponibili sono stati aggiornati automaticamente.');
      }catch(e){notice(e.message,true);}finally{busy=false;inputFile.value='';if(box.isConnected)update(selectedRun);}
    };
    picker.onchange=()=>upload(picker,'/import-result-file');evaluationPicker.onchange=()=>upload(evaluationPicker,'/import-evaluation-file');
    return update;
  }
  function empty(title,description,label,fn) {
    const box=el('div',undefined,'bench-empty');box.append(el('h2',title),el('p',description));if(label)box.append(action(label,fn,true));root.append(box);
  }
  async function go(next='overview',id='',push=true,returnTo=null) {
    const previousURL=currentURL();
    data=await req();if(generatedCase&&!data.tests.some(c=>c.id===generatedCase.id))data.tests.push({...generatedCase,inspectSupported:false});view=next;selected=id;page('benchmarks');$('breadcrumb').textContent='Workspace / Benchmark e confronti';
    if(push){const url=new URL(location.href);url.search='';url.searchParams.set('page','benchmarks');url.searchParams.set('view',next);if(id)url.searchParams.set('id',id);if(returnTo)url.searchParams.set('returnTo',returnTo);history.pushState({previousURL},'',url);}
    root.replaceChildren();
    const nav=el('div',undefined,'bench-tabs');
    for(const [key,label] of tabs){const b=action(label,()=>go(key));if(key===view)b.classList.add('active');nav.append(b);}root.append(nav);
    const resultConfiguration=async()=>{const r=await record('run',selected),t=await record('trial',r.trialId);await go('architecture',r.architectureId+'~'+t.case.id);};
    const renderers={overview,architectures,architecture:architectureDetail,architectureForm,cases,case:caseDetail,caseForm,sources,trialForm,editTrial:async()=>trialForm(await record('trial',selected)),trial:trialDetail,runForm:async()=>{const t=await record('trial',selected.split('~')[0]);await go('architecture',t.architectures[0].id+'~'+t.case.id);},revise:resultConfiguration,run:runDetail,judge:resultConfiguration,compare,compareTest:compareTest,savedCompareMany:async()=>compareTest(await req('/comparison?id='+encodeURIComponent(selected))),savedCompare:async()=>compare(await record('comparison',selected)),assign:assignTest};
    try{await (renderers[view]||overview)();}catch(e){root.append(info(e.message));}
  }
  function overview() {
    heading('Configurazioni da testare.','Crea una configurazione, seleziona una prova e carica i risultati. Ogni prova può essere eseguita su più configurazioni.');
    const stats=el('div',undefined,'bench-stats');
    for(const [number,label] of [[data.configurations.length,'configurazioni'],[data.tests.length,'prove disponibili'],[data.runs.length,'risultati caricati']]){const n=el('div',undefined,'bench-stat');n.append(el('strong',String(number)),el('span',label));stats.append(n);}root.append(stats);
    root.append(row(action('Crea configurazione',()=>go('architectureForm'),true),action('Crea prova',()=>go('caseForm'))));
    if(!data.configurations.length)return empty('Crea la prima configurazione.','Descrivi il modello e gli strumenti che vuoi testare. Potrai applicare più prove alla stessa configurazione.');
    const search=input();search.placeholder='Cerca una configurazione…';search.setAttribute('aria-label','Cerca una configurazione');search.className='bench-filter';root.append(search);
    const list=el('div');root.append(list);
    function render(){list.replaceChildren();for(const a of data.configurations.filter(a=>(archName(a)+' '+a.model+' '+a.harness).toLowerCase().includes(search.value.toLowerCase()))){
      const card=section(archName(a)),runs=data.runs.filter(r=>r.architectureId===a.id);
      card.append(el('p',[a.model,a.harness].filter(Boolean).join(' · ')||'Dettagli da completare'),el('p',new Set(runs.map(r=>r.caseId)).size+' prove eseguite · '+runs.length+' risultati','muted'),action('Apri configurazione',()=>go('architecture',a.id)));list.append(card);
    }}search.oninput=render;render();
  }
  function architectures() {
    overview();
  }
  function architectureForm() {
    back();const old=data.architectures.find(a=>a.id===selected)||{};
    heading(old.id?'Modifica configurazione.':'Crea una configurazione.','Descrivi ciò che userai nelle chat. Questi dati documentano le esecuzioni e non modificano l’harness.');
    const form=el('form',undefined,'card bench-form');root.append(form);
    for(const [key,label,multi,required] of [['name','Nome configurazione',false,true],['harness','Harness e versione',false,false],['model','Modello orchestratore · revisione / checkpoint',false,false],['hosting','Hosting · locale, privato o API',false,false],['workers','Subagenti · modelli, revisioni e ruoli',true,false],['parameters','Parametri · temperatura, seed, ragionamento, quantizzazione',true,false],['tools','Strumenti, memoria, contesto e fonti disponibili',true,false],['notes','Note e informazioni non verificabili',true,false]])control(form,key,label,old[key]||'',multi,required);
    form.append(info('Le prove già create conservano la descrizione originale. Le modifiche valgono solo per le nuove prove.'));
    submit(form,'Salva configurazione',async values=>{const a=await req('/architecture',{...values,...(old.id?{id:old.id}:{})});await go('architecture',a.id);notice('Configurazione salvata.');});
  }
  function architectureSummary(a) {
    const box=section(archName(a));for(const [k,label] of [['harness','Harness'],['model','Modello'],['hosting','Hosting'],['workers','Subagenti'],['parameters','Parametri'],['tools','Strumenti e memoria'],['notes','Note']]){const p=el('p');p.append(el('b',label+': '),document.createTextNode(a[k]||'Non dichiarato'));box.append(p);}return box;
  }
  function architectureDetail() {
    const [id,testId]=selected.split('~'),a=data.configurations.find(a=>a.id===id);if(!a)throw Error('Configurazione non trovata.');
    detailBack('overview');heading(archName(a),'Seleziona una prova per visualizzare le dimensioni misurate su questa configurazione.');
    const details=el('details');details.append(el('summary','Dettagli della configurazione'),architectureSummary(a));root.append(details);
    if(a.editable)root.append(action('Modifica configurazione',()=>go('architectureForm',a.id)));
    const form=section(),defaultTest=testId||data.runs.find(r=>r.architectureId===id)?.caseId||data.tests[0]?.id;
    const test=select(form,'selectedTest','Prova',data.tests.map(c=>[c.id,c.title+' · '+c.version.slice(0,8)]),defaultTest),updateToolbar=selectionToolbar(form,test,()=>data.tests.find(c=>c.id===test.value),()=>a.id,'case');root.append(form);
    const host=el('div');root.append(host);
    const render=()=>{const c=data.tests.find(c=>c.id===test.value);if(c){replaceSelection(a.id+'~'+c.id);updateToolbar();renderResultPanel(host,c,a.id,updateToolbar);}};
    test.onchange=render;render();
  }
  function replaceSelection(id){const url=new URL(location.href);url.searchParams.set('id',id);history.replaceState(history.state,'',url);}
  async function startRun(c,configurationId){const t=await req('/execution-context',{caseId:c.id,caseSnapshot:c,architectureId:configurationId});await go('runForm',t.id);}
  function renderResultPanel(host,c,configurationId,onSelected=()=>{}){
    host.replaceChildren();const token={};host._request=token;
    onSelected(null);
    const runs=data.runs.filter(r=>r.architectureId===configurationId&&r.caseId===c.id&&r.caseVersion===c.version),box=section('Risultati della prova');host.append(box);
    if(!runs.length){box.append(info('Nessun risultato caricato per questa prova e configurazione.'),metricTable(data.dimensions.map(d=>({label:d.label,left:blankDimensions()[d.id]})),['Dimensione','Valore']));return;}
    const selection=select(box,'resultRun','Esecuzione / revisione',runs.map(r=>[r.id,r.label+' · '+date(r.savedAt)]),runs[0].id),output=el('div');box.append(output);
    let serial=0;
    const render=async()=>{const current=++serial;onSelected(runs.find(r=>r.id===selection.value));output.replaceChildren(el('p','Caricamento risultati…','muted'));try{const r=await record('run',selection.value);if(host._request!==token||current!==serial||!host.isConnected)return;output.replaceChildren(pill(outcomeLabels[r.outcome]),el('p','Configurazione dichiarata nell’esecuzione: '+archName(r.architecture),'muted'),metricTable(data.dimensions.map(d=>({label:d.label,left:r.dimensions[d.id]})),['Dimensione','Valore e provenienza']),action('Apri risultato completo',()=>go('run',r.id)));}catch(e){if(host._request===token&&current===serial)output.replaceChildren(info(e.message));}};
    selection.onchange=render;render();
  }
  function assignTest(){
    const c=generatedCase?.id===selected?generatedCase:data.tests.find(c=>c.id===selected);if(!c)throw Error('Prova non trovata.');
    back('Alle prove','cases');heading(c.title,'Scegli la configurazione su cui eseguire la prova.');
    if(!data.configurations.length){root.append(info('Crea una configurazione, poi seleziona questa prova nel suo dettaglio.'),action('Crea configurazione',()=>go('architectureForm'),true));return;}
    const form=el('form',undefined,'card bench-form');root.append(form);const config=select(form,'configuration','Configurazione',data.configurations.map(a=>[a.id,archName(a)]));
    submit(form,'Apri configurazione',()=>go('architecture',config.value+'~'+c.id));
  }
  function sources() {
    heading('Fonti per progettare le prove.','Riferimenti primari verificati il 25 ottobre 2026. I casi locali sono originali; le fonti ne orientano il metodo.');
    root.append(info('Nessun dataset di terzi è redistribuito. Per importare casi ufficiali fissa revisione, split, ID e licenze; segnala traduzioni e adattamenti.'));
    const grid=el('div',undefined,'bench-grid bench-sources');root.append(grid);
    for(const source of data.sources){const card=section(source.title),link=el('a','Apri fonte primaria ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';card.append(el('p',source.use),el('p',source.limits,'muted'),link);grid.append(card);}
  }
  function cases() {
    heading('Prove.','Ogni prova è indipendente dalle configurazioni. Aprila per selezionare una configurazione, vedere i risultati o avviare un confronto.');
    root.append(action('Crea prova',()=>go('caseForm'),true));
    const grid=el('div',undefined,'bench-grid');root.append(grid);
    for(const c of data.tests){const card=section(c.title);card.append(pill(c.inspectSupported?'Scoring Inspect disponibile':c.family),el('p',c.key+' · versione '+c.version.slice(0,10),'bench-code'),el('p',c.prompt.slice(0,160)+(c.prompt.length>160?'…':''),'muted'),action('Apri prova',()=>go('case',c.id)));grid.append(card);}
  }
  function chatPacket(c) {return c.prompt+(c.context?'\n\nCONTESTO E RISORSE\n'+c.context:'');}
  function caseContent(c) {
    const box=section('Materiale per la chat');box.append(el('pre',chatPacket(c),'bench-copy'));
    box.append(action('Copia solo prompt e contesto',async()=>{await navigator.clipboard.writeText(chatPacket(c));notice('Copiati prompt e contesto, senza criteri di valutazione.');}),action('Scarica prompt .txt',()=>download(c.key+'-prompt.txt',chatPacket(c),'text/plain')));root.append(box);
    if(c.setup||c.sourceNotes){const setup=section('Preparazione manuale');if(c.setup)setup.append(el('p',c.setup));if(c.sourceNotes)setup.append(el('p',c.sourceNotes,'muted'));root.append(setup);}
    if(c.criteria){const criteria=el('details',undefined,'bench-restricted');criteria.append(el('summary',c.inspectSupported?'Risposte attese · controllo Inspect':'Criteri del caso originale'),el('p','Conservati con il caso originale. Il valutatore LLM giudica compito e risposta senza questi criteri.'),el('pre',c.criteria));root.append(criteria);}
    if(c.sourceIds.length){const sourceBox=section('Fonti metodologiche');for(const id of c.sourceIds){const source=data.sources.find(s=>s.id===id);if(source){const a=el('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';sourceBox.append(a,el('p',source.limits,'muted'));}}root.append(sourceBox);}
  }
  function caseDetail() {
    const [id,configurationId]=selected.split('~'),c=data.tests.find(c=>c.id===id);if(!c)throw Error('Prova non trovata.');
    detailBack('cases');heading(c.title,'Seleziona una configurazione per vedere i risultati di questa prova.');
    root.append(action('Confronta configurazioni',()=>go('compareTest',c.id)));
    const completed=data.configurations.filter(a=>data.runs.some(r=>r.architectureId===a.id&&r.caseId===c.id&&r.caseVersion===c.version));
    if(completed.length){const box=section(),defaultConfig=completed.some(a=>a.id===configurationId)?configurationId:completed[0].id;
      const config=select(box,'selectedConfiguration','Configurazione',completed.map(a=>[a.id,archName(a)]),defaultConfig),updateToolbar=selectionToolbar(box,config,()=>c,()=>config.value,'architecture');root.append(box);const host=el('div');root.append(host);
      const render=()=>{replaceSelection(c.id+'~'+config.value);updateToolbar();renderResultPanel(host,c,config.value);};config.onchange=render;render();
    }else{const box=section(),config=select(box,'selectedConfiguration','Configurazione',[['','Nessuna configurazione con risultati per questa prova']]),updateToolbar=selectionToolbar(box,config,()=>c,()=>'', 'architecture');config.disabled=true;updateToolbar();root.append(box,info('Scarica la prova, eseguila in chat e carica il file di risposta nella pagina della configurazione.'));}
    const saved=data.comparisons.filter(x=>x.caseId===c.id&&x.format==='multi-configuration-v1');if(saved.length){root.append(el('h2','Confronti salvati'));for(const comparison of saved)root.append(action(comparison.name,()=>go('savedCompareMany',comparison.id)));}
    caseContent(c);
  }
  function caseForm() {
    back('Alle prove','cases');heading('Componi il file della prova.','Inserisci nome e compito e genera il file da usare con le configurazioni che vuoi testare. Il salvataggio nel catalogo è facoltativo.');
    const form=el('form',undefined,'card bench-form');root.append(form);
    const name=control(form,'title','Nome della prova','',false,true);name.maxLength=150;
    const prompt=control(form,'prompt','Compito e istruzioni per la chat','',true,true);prompt.rows=7;prompt.maxLength=30000;
    prompt.placeholder='Descrivi cosa deve fare la chat, i vincoli, il formato della risposta e i dati necessari al compito.';
    const families=[...new Set(data.cases.map(c=>c.family).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
    const family=select(form,'family','Categoria (facoltativa)',[['','Nessuna categoria'],...families.map(f=>[f,f])],'');
    const add=el('option','+ Nuova categoria…');family.append(add);
    const newFamily=control(form,'newFamily','Nuova categoria');newFamily.maxLength=100;newFamily.parentElement.hidden=true;newFamily.disabled=true;
    family.onchange=()=>{const creating=family.selectedOptions[0]===add;newFamily.parentElement.hidden=!creating;newFamily.disabled=!creating;newFamily.required=creating;if(creating)newFamily.focus();};
    const save=input('','checkbox');save.id='bench-saveToCatalog';const saveLabel=field('Salva anche nel catalogo',save);saveLabel.prepend(save);form.append(saveLabel);
    const result=section();result.hidden=true;root.append(result);
    let generated=null,signature='';
    submit(form,'Genera file della prova',async values=>{
      const payload={title:values.title,prompt:values.prompt,family:family.selectedOptions[0]===add?newFamily.value:values.family,saveToCatalog:save.checked};
      const current=JSON.stringify(payload);
      if(current!==signature){generated=await req('/compose-case',payload);signature=current;}
      generatedCase=generated.case;
      download(generated.filename,generated.content,'text/markdown');
      result.hidden=false;result.replaceChildren(el('h2','File della prova generato'),el('p',generated.savedToCatalog?'La prova è stata salvata anche nel catalogo.':'Il file è stato generato senza salvare la prova nel catalogo.'),el('p','Allega il file alla chat della configurazione da testare e invia «Esegui la prova allegata». Puoi usare la stessa prova su tutte le configurazioni desiderate.'),action('Usa questa prova su una configurazione',()=>go('assign',generated.case.id),true));
      notice('File generato. Allega il file a una nuova chat e invia: Esegui la prova allegata.');
    });
  }
  function trialForm(previous=null) {
    back();heading(previous?'Riprendi la bozza.':'Nuova prova.','Scegli un caso: il file per la chat è subito disponibile. Tutti i dettagli descrittivi di A e B sono facoltativi.');
    const form=el('form',undefined,'card bench-form');root.append(form);
    const extra=previous?.case||(generatedCase?.id===selected?generatedCase:null),availableCases=[...data.cases];
    if(extra&&!availableCases.some(c=>c.id===extra.id))availableCases.push(extra);
    const caseSelect=select(form,'caseId','Caso e versione',[['','Scegli un caso…'],...availableCases.map(c=>[c.id,c.title+(c.inspectSupported?' · scoring Inspect':'')+' · '+c.version.slice(0,8)])],previous?.case.id||selected||'');
    caseSelect.required=true;
    const downloadButton=action('Scarica file per la chat',()=>downloadCase(caseSelect.value,availableCases.find(c=>c.id===caseSelect.value)),true);form.append(downloadButton);
    const preview=el('p','Il download dipende soltanto dal caso selezionato.','muted');form.append(preview);
    const updateCase=()=>{downloadButton.disabled=!caseSelect.value;};caseSelect.onchange=updateCase;updateCase();
    if(previous&&data.runs.some(r=>r.trialId===previous.id)){caseSelect.disabled=true;form.append(info('Sono già presenti risultati: caso e versione sono fissati. Puoi completare i dettagli della bozza.'));}
    control(form,'name','Nome prova (facoltativo)',previous?.name||'');
    control(form,'conditions','Condizioni comuni e note di protocollo (facoltative)',previous?.conditions||'',true);
    form.append(info('I campi descrivono ciò che hai usato. Puoi lasciarli vuoti o scrivere “non noto”; non configurano l’harness e non entrano nel file per la chat.'));
    const editors={};
    const payload=status=>({caseId:caseSelect.value,name:form.elements.namedItem('name').value,conditions:form.elements.namedItem('conditions').value,status,
      ...(!data.cases.some(c=>c.id===caseSelect.value)?{caseSnapshot:availableCases.find(c=>c.id===caseSelect.value)}:{}),
      executions:Object.fromEntries(Object.entries(editors).map(([slot,read])=>[slot,read()])),...(previous?{id:previous.id,savedAt:previous.savedAt}:{})});
    for(const slot of ['A','B']){const box=el('details',undefined,'bench-execution-editor');box.append(el('summary','Esecuzione '+slot+' · dettagli facoltativi'));form.append(box);
      const old=previous?.architectures.find(a=>a.slot===slot)||{};editors[slot]=descriptionEditor(box,slot+'-',old);
      box.append(action('Carica risultati '+slot,async()=>{if(!caseSelect.value)throw Error('Scegli prima un caso.');const t=await req('/trial',payload('draft'));await go('runForm',t.id+'~'+slot);}));
    }
    submit(form,'Salva bozza',async (_,event)=>{const t=await req('/trial',payload(event.submitter?.dataset.finalize?'saved':'draft'));await go('trial',t.id);notice(t.status==='draft'?'Bozza salvata.':'Prova salvata: caso e descrizioni conservati.');});
    const save=el('button','Salva prova','secondary');save.type='submit';save.dataset.finalize='true';form.append(save);
  }
  function runList(runs) {
    if(!runs.length){root.append(el('p','Nessun risultato caricato.','muted'));return;}
    for(const r of runs){const n=el('div',undefined,'bench-result'),title=el('div');title.append(el('h3',r.label),el('p',outcomeLabels[r.outcome]+' · caricato '+date(r.savedAt),'muted'));n.append(title,action('Apri scheda',()=>go('run',r.id)),action('Valutazione LLM',()=>go('judge',r.id)));root.append(n);}
  }
  async function trialDetail() {
    back();const t=await record('trial',selected);heading(t.name,t.case.title+' · versione '+t.case.version.slice(0,12));
    root.append(pill(t.status==='draft'?'Bozza':t.status==='saved'?'Prova salvata':'Prova precedente'),action('Scarica file per la chat',()=>downloadCase(t.case.id,t.case),true));
    if(t.status==='draft')root.append(action('Completa bozza',()=>go('editTrial',t.id)));
    root.append(info(t.conditions||'Condizioni aggiuntive non dichiarate. Usa lo stesso caso in una nuova chat per ogni esecuzione.'));
    const grid=el('div',undefined,'bench-grid');root.append(grid);
    for(const [index,a] of t.architectures.entries()){
      const slot=a.slot||String.fromCharCode(65+index),runs=data.runs.filter(r=>r.trialId===t.id&&r.architectureId===a.id),snapshot=runs[0]?.architecture||a,card=section('Esecuzione '+slot);
      card.append(pill(runs.length?runs.length+' schede caricate':'Risultati da caricare'),el('p',archName(snapshot)),el('p',(snapshot.model||'Modello non dichiarato')+' · '+(snapshot.harness||'Harness non dichiarato'),'muted'),el('p',detailCount(snapshot)+' / 8 dettagli compilati','muted'),action('Carica risposta e metriche '+slot,()=>go('runForm',t.id+'~'+slot),true),judgeExportControl(runs[0]));grid.append(card);
    }
    root.append(info('Scarica una volta il file del caso, allegalo alle chat scelte per A e B e invia «Esegui la prova allegata». Carica poi i risultati nelle rispettive schede; puoi descrivere le esecuzioni in quel momento.'));
    root.append(row(action('Carica risultati di un’esecuzione',()=>go('runForm',t.id),true),action('Confronta due esecuzioni',()=>go('compare',t.id))),el('h2','Schede delle esecuzioni'));
    runList(data.runs.filter(r=>r.trialId===t.id));
    const comparisons=data.comparisons.filter(c=>c.trialId===t.id);
    if(comparisons.length){root.append(el('h2','Confronti salvati'));for(const c of comparisons)root.append(action('Apri confronto · '+c.name,()=>go('savedCompare',c.id)));}
    const snapshots=el('details');snapshots.append(el('summary','Descrizioni delle architetture fissate per questa prova'));t.architectures.forEach(a=>snapshots.append(architectureSummary(a)));root.append(snapshots);
    caseContent(t.case);
  }
  function blankDimensions() {return Object.fromEntries(data.dimensions.map(d=>[d.id,{status:'unavailable',value:null,origin:'user_report',measure:'',unit:'',method:'',evidence:'',note:'Dati non forniti per questa esecuzione.'}]));}
  function readReport(raw) {
    const clean=raw.replace(/^\uFEFF/,'');let r;
    try{r=JSON.parse(clean);}catch{
      const blocks=[...clean.matchAll(/```json\s*\n([\s\S]*?)\n```/gi)];
      if(blocks.length!==1)throw Error('Report obbligatorio: serve un file JSON o un messaggio con un unico blocco ```json completo. La sola risposta testuale non è accettata.');
      try{r=JSON.parse(blocks[0][1]);}catch{throw Error('Il blocco JSON del report non è valido.');}
    }
    if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Serve un oggetto JSON.');
    return r;
  }
  function reportDimensions(raw={},origin='chat_report') {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Dimensioni non valide.');
    const result={};
    for(const [key,m] of Object.entries(raw)){
      const label=data.dimensions.find(d=>d.id===key)?.label;
      if(!label||!m||typeof m!=='object'||Array.isArray(m)||!Object.hasOwn(statusLabels,m.status))throw Error('Dimensione o stato non valido: '+key);
      if(m.status==='measured'){
        if(typeof m.value!=='number'||!Number.isFinite(m.value)||Math.abs(m.value)>1e100)throw Error(label+': serve un valore numerico finito.');
      }else if(m.value!=null)throw Error(label+': le misure mancanti devono avere value null.');
      const item={...m,value:m.value??null,origin:origin==='harness_export'?origin:(m.origin??origin)};
      if(!Object.hasOwn(originLabels,item.origin))throw Error(label+': provenienza non valida.');
      for(const [k,limit] of [['measure',300],['unit',60],['method',1000],['evidence',2000],['note',2000]]){
        const v=item[k]??'',required=m.status==='measured'?k!=='note':k==='note';
        if(typeof v!=='string'||v.length>limit||(required&&!v.trim()))throw Error(label+': '+k+' obbligatorio o non valido.');
        item[k]=v;
      }
      result[key]=item;
    }
    return result;
  }
  function validateReport(r) {
    for(const key of data.reportContract.required)if(!Object.hasOwn(r,key))throw Error('Report incompleto: campo obbligatorio '+key+'.');
    if(typeof r.answer!=='string'||r.answer.length>150000)throw Error('answer deve essere una stringa di massimo 150.000 caratteri.');
    if(typeof r.notes!=='string'||r.notes.length>10000)throw Error('notes deve essere una stringa di massimo 10.000 caratteri.');
    if(!Object.hasOwn(outcomeLabels,r.outcome))throw Error('Esito non valido.');
    if(!r.dimensions||typeof r.dimensions!=='object'||Array.isArray(r.dimensions))throw Error('Dimensioni non valide.');
    for(const key of data.reportContract.operational){
      const m=r.dimensions[key];
      if(!m||typeof m!=='object'||Array.isArray(m))throw Error('Report incompleto: dimensions.'+key+' obbligatorio, anche se non disponibile.');
      for(const field of data.reportContract.metricFields)if(!Object.hasOwn(m,field))throw Error(key+': campo obbligatorio '+field+'.');
      for(const field of data.reportContract.metricFields.filter(f=>f!=='value'))if(typeof m[field]!=='string')throw Error(key+': '+field+' deve essere una stringa.');
      if(m.status!=='measured'&&m.value!==null)throw Error(key+': le misure mancanti devono avere value null.');
    }
    const dimensions=reportDimensions(r.dimensions);
    for(const key of data.reportContract.operational){
      const m=dimensions[key];if(m.status!=='measured')continue;
      if(m.value<0)throw Error(key+': il consumo o la durata non può essere negativo.');
      if(key==='tokens'&&(m.unit!=='token'||!Number.isInteger(m.value)))throw Error('tokens: usare un conteggio intero e unità token.');
      if(key==='performance'&&m.unit!=='s')throw Error('performance: esprimere la durata in secondi, unità s.');
    }
    return dimensions;
  }
  function validateTestReport(r) {
    const dimensions=validateReport(r);
    if(Object.keys(r.dimensions).some(key=>!data.reportContract.operational.includes(key)))throw Error('Il report del modello testato può contenere solo tokens, performance e cost. Usa Carica valutazione LLM per le altre dimensioni.');
    if(!['not_evaluated','failed'].includes(r.outcome))throw Error('Il modello testato non può autovalutare il successo.');
    for(const key of data.reportContract.operational)if(!['chat_report','harness_export'].includes(dimensions[key].origin))throw Error(key+': serve provenienza chat_report o harness_export.');
    return dimensions;
  }
  async function runForm(previous=null) {
    const [trialId,requestedSlot]=selected.split('~');
    const t=await record('trial',previous?.trialId||trialId);back('Alla configurazione','architecture',(previous?.architectureId||t.architectures[0].id)+'~'+t.case.id);heading(previous?'Integra il risultato.':'Carica i risultati.',t.case.title+' · '+archName(t.architectures[0]));
    root.append(info('Report strutturato obbligatorio: risposta, note, esito, token, durata e costo. I dati non osservabili richiedono uno stato non disponibile e un motivo. Nessuna lettura automatica dell’harness.'));
    const form=el('form',undefined,'card bench-form');root.append(form);importedFiles=[];
    const arch=select(form,'architectureId','Configurazione',t.architectures.map(a=>[a.id,archName(a)]),previous?.architectureId||t.architectures.find(a=>a.slot===requestedSlot)?.id);if(t.format==='configuration-test-v1')arch.disabled=true;
    const descriptions=el('details',undefined,'bench-execution-editor');descriptions.append(el('summary','Descrivi l’esecuzione · tutti i campi sono facoltativi'));form.append(descriptions);
    let descriptionGetter;
    const setDescription=a=>{descriptions.replaceChildren(el('summary','Descrivi l’esecuzione · tutti i campi sono facoltativi'));descriptionGetter=descriptionEditor(descriptions,'execution-',a);};
    const snapshotFor=id=>previous?.architecture||(data.runs.find(r=>r.trialId===t.id&&r.architectureId===id)?.architecture)||t.architectures.find(a=>a.id===id)||{};
    setDescription(snapshotFor(arch.value));
    arch.onchange=()=>{setDescription(snapshotFor(arch.value));};
    if(t.format!=='case-first-v1'){descriptions.hidden=true;}
    control(form,'label','Etichetta esecuzione','Esecuzione '+(data.runs.filter(r=>r.trialId===t.id).length+1),false,true);control(form,'executedAt','Data / ora esecuzione dichiarata');control(form,'evaluator','Valutatore / provenienza del report','Risposta caricata dall’utente; da valutare',false,true);
    select(form,'outcome','Esito dichiarato',Object.entries(outcomeLabels),'not_evaluated');
    const upload=input('','file');upload.accept='.json,.md,.txt';upload.id='bench-report-file';const uploadLabel=field('Carica il file prodotto dalla chat · JSON oppure messaggio con blocco JSON',upload);form.prepend(uploadLabel);
    const manualTemplate=el('details');manualTemplate.append(el('summary','Opzione manuale · modello JSON vuoto'),action('Scarica modello JSON',()=>download('risultato-benchmark.json',{trialId:t.id,architectureId:arch.value,label:'Esecuzione 1',executedAt:'',evaluator:'',outcome:'not_evaluated',answer:'',notes:'',attachments:[],dimensions:Object.fromEntries(data.reportContract.operational.map(key=>[key,{...blankDimensions()[key],origin:'chat_report'}]))})));form.append(manualTemplate);
    const answerFile=input('','file');answerFile.accept='.txt,.md,.json';answerFile.id='bench-answer-file';form.append(field('Carica risposta e metriche · report completo JSON o Markdown (900 KB)',answerFile));
    const answer=control(form,'answer','Risposta caricata · anteprima e correzione manuale','',true);
    const files=input('','file');files.multiple=true;files.id='bench-attachments';form.append(field('Allegati · log, diff, report o artefatti (massimo 10, 400 KB complessivi)',files));
    const fileList=el('p','Nessun allegato.','muted');form.append(fileList);
    const showFiles=()=>{fileList.textContent=importedFiles.map(f=>f.name).join(', ')||'Nessun allegato.';};
    files.onchange=async()=>{try{const pending=[...files.files];if(pending.length>10||pending.reduce((n,f)=>n+f.size,0)>400000)throw Error('Limite allegati: 10 file, 400 KB totali.');const loaded=[];for(const f of pending){const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);loaded.push({name:f.name,base64:btoa(binary)});}importedFiles=loaded;showFiles();}catch(e){files.value='';notice(e.message,true);}};
    form.append(action('Rimuovi allegati dal form',()=>{importedFiles=[];files.value='';showFiles();}));
    const telemetry=input('','file');telemetry.accept='.json';telemetry.id='bench-telemetry-file';
    form.append(field('Aggiungi metriche esportate dall’harness · JSON normalizzato, senza connessione automatica',telemetry));
    form.append(action('Scarica modello metriche harness',()=>download('metriche-harness.json',{trialId:t.id,architectureId:arch.value,dimensions:{performance:{status:'unavailable',value:null,origin:'harness_export',measure:'Tempo totale dell’esecuzione',unit:'s',method:'',evidence:'',note:'Compilare dal log esportato, indicando copertura e metodo.'},tokens:{status:'unavailable',value:null,origin:'harness_export',measure:'Token totali di tutte le chiamate e tentativi',unit:'token',method:'',evidence:'',note:'Mancante finché il provider/harness non espone il totale completo.'}}})));
    control(form,'notes','Note · fallimenti, differenze dal protocollo, limiti dei dati','',true);
    form.append(el('h2','Scheda completa · 16 dimensioni'),el('p','Token, durata e altre metriche sono disponibili solo se osservati nella chat o in un export consultato. Servono valore, unità, misura, metodo ed evidenza. Specifica la copertura nelle note: i token del solo orchestratore non sono il totale con i subagenti. I dati mancanti restano non disponibili, senza stime.','muted'));
    const metricsPreview=el('details');metricsPreview.id='bench-dimensions-preview';form.append(metricsPreview);
    const inspectSupported=data.cases.some(c=>c.version===t.case.version&&c.inspectSupported);
    const inspectStatus=el('p',inspectSupported?(data.inspectAvailable?'Inspect valuta automaticamente il report al caricamento.':'Inspect non installato: carica il report e installa il runner per la valutazione automatica.'):'Questo caso richiede uno scorer dedicato o revisione umana.','muted');inspectStatus.id='bench-inspect-status';
    const inspectLine=el('div',undefined,'bench-inspect-line');inspectLine.append(inspectStatus,inspectHelp('bench-inspect-help-form'));form.append(inspectLine);
    let evaluationPreviewId=null,importSerial=0,fileSerial=0,inFlight=0,testedReport=null;
    const readDimensions=()=>Object.fromEntries(Object.entries(editors).map(([key,e])=>[key,{status:e.s.value,origin:e.origin.value,value:e.s.value==='measured'&&e.value.value!==''?Number(e.value.value):null,...Object.fromEntries(['measure','unit','method','evidence','note'].map(k=>[k,e[k].value]))}]));
    const refreshPreview=()=>{const ms=readDimensions(),count=Object.values(ms).filter(m=>m.status==='measured').length;metricsPreview.replaceChildren(el('summary',count+' / 16 dimensioni misurate · anteprima'),metricTable(data.dimensions.map(d=>({label:d.label,left:ms[d.id]})),['Dimensione','Risultato e provenienza']));};
    const editors={};
    for(const d of data.dimensions){
      const box=el('details',undefined,'bench-metric'),summary=el('summary',d.label+' · Non disponibile');box.append(summary);form.append(box);
      const s=select(box,d.id+'-status','Stato',Object.entries(statusLabels),'unavailable');
      const origin=select(box,d.id+'-origin','Provenienza dichiarata',Object.entries(originLabels),'user_report');
      const measure=control(box,d.id+'-measure','Misura precisa · es. tempo totale, percentuale requisiti soddisfatti');
      const value=control(box,d.id+'-value','Valore');value.type='number';value.step=d.id==='tokens'?'1':'any';if(data.reportContract.operational.includes(d.id))value.min='0';
      const unit=control(box,d.id+'-unit','Unità · es. secondi, token, %, EUR');
      const method=control(box,d.id+'-method','Metodo / rubrica applicata');
      const evidence=control(box,d.id+'-evidence','Evidenza · file, righe, dati del report');
      const note=control(box,d.id+'-note','Motivazione / limiti','Dati non forniti per questa esecuzione.',true,true);
      const update=()=>{const measured=s.value==='measured';summary.textContent=d.label+' · '+statusLabels[s.value]+(measured?' · '+value.value+' '+unit.value:'');for(const n of [measure,value,unit,method,evidence]){n.disabled=!measured;n.required=measured;}note.required=!measured;};s.onchange=()=>{if(s.value==='measured'&&note.value==='Dati non forniti per questa esecuzione.')note.value='';update();};update();
      editors[d.id]={s,origin,measure,value,unit,method,evidence,note,update};
    }
    form.addEventListener('input',event=>{testedReport=null;if(event.target===answer){fileSerial++;importSerial++;invalidateEvaluation();}for(const e of Object.values(editors))e.update();refreshPreview();});form.addEventListener('change',refreshPreview);refreshPreview();
    const fillDimensions=ms=>{for(const [key,m] of Object.entries(ms)){const e=editors[key];e.s.value=m.status;e.origin.value=m.origin;for(const k of ['measure','value','unit','method','evidence','note'])e[k].value=m[k]??'';e.update();}refreshPreview();if(Object.keys(ms).length)metricsPreview.open=true;};
    const invalidateEvaluation=()=>{
      const missing=blankDimensions(),clear={};
      for(const {id:key} of data.dimensions)if(editors[key].origin.value==='model_judge'||(['task_success','correctness','constraints'].includes(key)&&editors[key].origin.value==='runner'))clear[key]={...missing[key],note:'Risposta o esecuzione modificata: rivalutare la nuova risposta.'};
      if(Object.keys(clear).length){fillDimensions(clear);form.elements.namedItem('outcome').value='not_evaluated';}
      evaluationPreviewId=null;
      inspectStatus.textContent='Risposta o esecuzione modificata: ricarica il report per la valutazione automatica.';
    };
    arch.addEventListener('change',()=>{testedReport=null;fileSerial++;importSerial++;invalidateEvaluation();});
    telemetry.onchange=async()=>{try{
      const f=telemetry.files[0];if(!f)return;if(f.size>100000)throw Error('Metriche troppo grandi: massimo 100 KB.');const r=JSON.parse(await f.text());
      if(r.trialId!==t.id||r.architectureId!==arch.value)throw Error('Le metriche devono riferirsi alla prova e all’architettura selezionate.');
      if(!Object.hasOwn(r,'dimensions'))throw Error('Usa il modello metriche harness.');
      testedReport=null;
      fillDimensions(reportDimensions(r.dimensions,'harness_export'));
      notice('Metriche aggiunte alla scheda. La risposta e le altre dimensioni sono conservate.');
    }catch(e){notice(e.message,true);}finally{telemetry.value='';}};
    const fillReport=r=>{
      // A different answer starts a fresh set of metrics; integrations of the same answer keep the evaluation.
      if(r.answer!=null&&r.answer!==answer.value)fillDimensions(blankDimensions());
      const before=arch.value;
      for(const key of ['architectureId','label','executedAt','evaluator','outcome','answer','notes'])if(r[key]!=null)form.elements.namedItem(key).value=r[key];
      if(r.architecture&&t.format==='case-first-v1')setDescription(r.architecture);else if(before!==arch.value)setDescription(snapshotFor(arch.value));
      if(r.attachments)importedFiles=r.attachments;showFiles();
      fillDimensions(reportDimensions(r.dimensions));
    };
    if(previous){fillReport({...previous,label:(previous.label+' · revisione').slice(0,200)});arch.disabled=true;form.append(info('Il salvataggio crea una nuova scheda collegata all’originale. Le misure conservano la provenienza dichiarata; le modifiche manuali vanno documentate nelle note.'));}
    const importReport=r=>{
      if(r.trialId&&r.trialId!==t.id)throw Error('Il file appartiene a una prova diversa.');
      if(r.caseVersion&&r.caseVersion!==t.case.version)throw Error('Versione del caso diversa.');
      if(r.caseId&&r.caseId!==t.case.id)throw Error('Il file appartiene a un caso diverso.');
      if(r.architectureId&&!t.architectures.some(a=>a.id===r.architectureId))throw Error('Architettura non prevista nella prova.');
      if(previous&&r.architectureId&&r.architectureId!==previous.architectureId)throw Error('La revisione deve conservare l’architettura originale.');
      const dimensions=validateTestReport(r);
      if(r.attachments&&!Array.isArray(r.attachments))throw Error('Allegati non validi.');
      evaluationPreviewId=null;
      fillReport({...r,dimensions});
      testedReport=r;
      notice('Risposta e dimensioni estratte dal report. Controlla l’anteprima e salva la scheda.');
    };
    const buildPayload=()=>{
      const values=Object.fromEntries(new FormData(form));
      return {trialId:t.id,architectureId:arch.value,caseId:t.case.id,caseVersion:t.case.version,label:values.label,executedAt:values.executedAt,evaluator:values.evaluator,outcome:values.outcome,answer:values.answer,notes:values.notes,dimensions:readDimensions(),attachments:importedFiles,...(t.format==='case-first-v1'?{architecture:descriptionGetter()}:{}),...(previous?{sourceRunId:previous.id}:{}),...(evaluationPreviewId?{evaluationPreviewId}:{}),...(testedReport?{testedReport}:{})};
    };
    const loadAnswerFile=async(file)=>{
      if(!file)return;if(file.size>900000)throw Error('Scheda troppo grande: massimo 900 KB.');
      const readSerial=++fileSerial,raw=await file.text();if(readSerial!==fileSerial||!form.isConnected)return;
      importReport(readReport(raw));
      const serial=++importSerial;
      if(!inspectSupported||!data.inspectAvailable)return;
      const payload=buildPayload();inFlight++;
      for(const button of form.querySelectorAll('button[type="submit"]'))button.disabled=true;
      inspectStatus.textContent='Inspect sta valutando il report caricato…';
      try{
        const result=await req('/preview-score',payload);
        if(serial!==importSerial||!form.isConnected||answer.value!==payload.answer||arch.value!==payload.architectureId)return;
        fillDimensions(result.dimensions);evaluationPreviewId=result.previewId;
        form.elements.namedItem('evaluator').value=result.evaluator;form.elements.namedItem('outcome').value=result.outcome;
        inspectStatus.textContent='Valutazione Inspect completata. Controlla l’anteprima e salva la scheda.';
        notice('Report valutato automaticamente con Inspect. La scheda sarà conservata al salvataggio.');
      }catch(error){
        if(serial!==importSerial||!form.isConnected)return;
        inspectStatus.textContent='Valutazione Inspect non riuscita: '+error.message;
        notice('Report caricato; valutazione Inspect non riuscita. '+error.message,true);
      }finally{
        inFlight--;if(form.isConnected)for(const button of form.querySelectorAll('button[type="submit"]'))button.disabled=inFlight>0;
      }
    };
    upload.onchange=async()=>{try{await loadAnswerFile(upload.files[0]);}catch(e){notice(e.message,true);}finally{upload.value='';}};
    answerFile.onchange=async()=>{try{await loadAnswerFile(answerFile.files[0]);}catch(e){notice(e.message,true);}finally{answerFile.value='';}};
    submit(form,'Salva scheda esecuzione',async ()=>{
      if(inFlight)throw Error('Attendi la valutazione Inspect del report caricato.');
      const payload=buildPayload();
      validateReport(payload);
      if(new TextEncoder().encode(JSON.stringify(payload)).length>950000)throw Error('Scheda troppo grande. Riduci la risposta o gli allegati.');
      const run=await req('/run',payload);
      await go('architecture',run.architectureId+'~'+t.case.id);notice('Risultato salvato per la prova e la configurazione selezionate.');
    });
  }
  function metricCell(m) {
    const td=el('td',undefined,'bench-status-'+m.status);
    if(m.status==='measured'){td.append(el('strong',String(m.value)+' '+m.unit),el('small',m.measure),el('small','Metodo: '+m.method),el('small','Evidenza: '+m.evidence));}
    else td.append(el('b',statusLabels[m.status]));td.append(el('small','Provenienza: '+(originLabels[m.origin]||'Compilazione utente')));if(m.note)td.append(el('small',m.note));return td;
  }
  function metricTable(rows,headers) {
    const wrap=el('div',undefined,'bench-table-wrap'),table=el('table',undefined,'bench-table'+(headers.length===2?' bench-single-metrics':'')),thead=el('thead'),tr=el('tr');
    for(const label of headers){const th=el('th',label);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);const body=el('tbody');table.append(body);wrap.append(table);
    for(const r of rows){const line=el('tr'),name=el('th',r.label);name.scope='row';line.append(name,metricCell(r.left));if(r.right){line.append(metricCell(r.right),el('td',r.delta==null?'Non confrontabile':(r.delta>0?'+':'')+Number(r.delta.toPrecision(6))+' '+r.left.unit));}body.append(line);}return wrap;
  }
  async function runDetail() {
    const r=await record('run',selected),t=await record('trial',r.trialId);back('Alla configurazione','architecture',r.architectureId+'~'+t.case.id);heading(r.label,archName(r.architecture)+' · '+t.case.title);
    root.append(pill(outcomeLabels[r.outcome]),info(r.provenance),el('p','Valutatore: '+r.evaluator+' · esecuzione dichiarata: '+(r.executedAt||'Non fornita')+' · caricata '+date(r.savedAt),'muted'));
    const count=Object.values(r.dimensions).filter(m=>m.status==='measured').length;root.append(el('h2',count+' / 16 dimensioni misurate'));
    const progress=el('progress',undefined,'bench-chart');progress.max=16;progress.value=count;progress.setAttribute('aria-label','Copertura delle dimensioni misurate');root.append(progress,el('p','Copertura dei dati, non punteggio di qualità.','muted'));
    root.append(action('Esporta scheda completa JSON',()=>download('esecuzione-'+r.id+'.json',{...r,trial:t})),action('Dettaglio prova',()=>go('case',t.case.id+'~'+r.architectureId)),action('Confronta configurazioni',()=>go('compareTest',t.case.id)));
    root.append(judgeExportControl(data.runs.find(run=>run.id===r.id)));
    for(const j of r.judgeEvaluations||[]){const box=section('Valutazione LLM · '+j.model);box.append(el('p',j.notes||'Giudizio esterno sulle dimensioni mancanti.'),el('p',j.modelNotes||'','muted'),el('p','Risposta verificata tramite SHA-256 '+j.answerSha256,'bench-code'),action('Scarica JSON del valutatore',()=>download('valutazione-'+j.reportSha256.slice(0,12)+'.json',j.report)));root.append(box);}
    if(r.sourceRunId&&!r.evaluation)root.append(action('Apri scheda precedente',()=>go('run',r.sourceRunId)));
    const scoring=section(),scoringHeading=el('div',undefined,'bench-inspect-line');scoringHeading.append(el('h2','Valutazione deterministica'),inspectHelp('bench-inspect-help-detail'));scoring.append(scoringHeading);
    const supported=data.cases.some(c=>c.version===t.case.version&&c.inspectSupported);
    if(supported){
      scoring.append(el('p','Controlli deterministici su successo, correttezza e formato. Nessuna nuova risposta generata e nessuna chiamata a modelli. Le metriche dell’harness caricate restano separate.'));
      scoring.append(el('p','I controlli disponibili vengono applicati automaticamente quando carichi il file JSON con Carica risultati nella configurazione.'));
    }else scoring.append(el('p','Questo caso richiede uno scorer dedicato o revisione umana. L’adattatore iniziale supporta i casi originali di calcolo ed estrazione JSON.'));
    if(r.evaluation){scoring.append(el('p',r.evaluation.note,'muted'),el('p','Scorer: '+r.evaluation.scorer+' · chiamate a modelli: '+r.evaluation.modelCalls));if(r.sourceRunId)scoring.append(action('Apri caricamento originale',()=>go('run',r.sourceRunId)));}
    root.append(scoring);
    root.append(metricTable(data.dimensions.map(d=>({label:d.label,left:r.dimensions[d.id]})),['Dimensione','Risultato e provenienza']));
    const answer=section('Risposta / artefatto testuale');answer.append(el('pre',r.answer||'Nessun testo: consultare allegati e note.','bench-run-answer'));root.append(answer);
    const notes=section('Note e allegati');notes.append(el('p',r.notes||'Nessuna nota.'));
    for(const f of r.attachments){notes.append(action('Scarica '+f.name,()=>{const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));download(f.name,new Blob([bytes],{type:'application/octet-stream'}));}),el('p',f.bytes+' byte · SHA-256 '+f.sha256,'bench-code'));}root.append(notes);
    const snapshot=el('details');snapshot.append(el('summary','Architettura dichiarata al momento della prova'),architectureSummary(r.architecture));root.append(snapshot);
    caseContent(t.case);
  }
  async function judgeForm() {
    const source=await record('run',selected),trial=await record('trial',source.trialId);
    back('Alla prova','case',trial.case.id+'~'+source.architectureId);heading('Completa con un altro LLM.',trial.case.title+' · '+source.label+' · '+archName(source.architecture));
    const summary=data.runs.find(run=>run.id===source.id);
    if(!summary?.judgeExport?.available){root.append(judgeExportControl(summary));return;}
    const packet=await req('/judge-packet?run='+encodeURIComponent(source.id));
    root.append(info('Il valutatore riceve prova, risposta e istruzioni separate. Il suo JSON completa soltanto le dimensioni mancanti; risposta, consumi e controlli deterministici conservano i dati originali.'));
    const material=section('1. Esporta la prova per il valutatore esterno');
    material.append(judgeExportControl(summary),el('p','Il download contiene una cartella ZIP con il test, la risposta e le istruzioni complete del formato JSON. Estrai la cartella, allega i tre file a una nuova chat e invia il comando indicato nelle istruzioni. Il JSON restituito va caricato qui.'));
    root.append(material);
    const missing=packet.dimensions.map(key=>data.dimensions.find(d=>d.id===key)?.label||key);
    root.append(el('p',missing.length?'Dimensioni richieste: '+missing.join(', '):'Non ci sono dimensioni mancanti da affidare al valutatore.'));
    const form=el('form',undefined,'card bench-form');root.append(form,action('Apri scheda sorgente',()=>go('run',source.id)));
    const file=input('','file');file.id='bench-judge-file';file.accept='.json,.md,.txt';file.disabled=!missing.length;form.append(field('2. Carica valutazione LLM · JSON o unico blocco JSON (900 KB)',file));
    const preview=el('div');preview.id='bench-judge-preview';form.append(preview);
    let pending=null,serial=0;
    submit(form,'Salva valutazione nella prova',async()=>{
      if(!pending)throw Error('Carica prima un JSON valido del valutatore.');
      const result=await req('/import-judge',{sourceRunId:source.id,report:pending});
      await go('run',result.id);notice('Valutazione LLM integrata in una nuova scheda della stessa prova. Risposta e misure originali conservate.');
    });
    const save=form.querySelector('button[type="submit"]');save.disabled=true;
    file.onchange=async()=>{
      const current=++serial;pending=null;save.disabled=true;preview.replaceChildren();
      try{
        const chosen=file.files[0];if(!chosen)return;if(chosen.size>900000)throw Error('Valutazione troppo grande: massimo 900 KB.');
        const raw=await chosen.text();if(current!==serial||!form.isConnected)return;
        const report=readReport(raw),result=await req('/preview-judge',{sourceRunId:source.id,report});
        if(current!==serial||!form.isConnected)return;
        const dimensions={...source.dimensions,...result.dimensions};
        preview.append(el('h2','Anteprima · valutatore '+result.model),metricTable(data.dimensions.map(d=>({label:d.label,left:dimensions[d.id]})),['Dimensione','Risultato dopo integrazione']));
        pending=report;save.disabled=false;notice('Valutazione valida e collegata alla risposta sorgente. Controlla l’anteprima e salva.');
      }catch(error){if(current===serial&&form.isConnected)notice(error.message,true);}finally{if(current===serial)file.value='';}
    };
  }
  function comparisonTable(result){
    const wrap=el('div',undefined,'bench-table-wrap'),table=el('table',undefined,'bench-table bench-comparison-matrix');table.style.minWidth=(200+240*result.runs.length)+'px';
    wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Dimensioni delle configurazioni confrontate');wrap.tabIndex=0;
    const head=el('thead'),titles=el('tr'),dimension=el('th','Dimensione');dimension.scope='col';titles.append(dimension);
    for(const r of result.runs){const th=el('th',archName(r.architecture));th.scope='col';th.append(el('small',r.label+' · '+date(r.savedAt)));titles.append(th);}head.append(titles);table.append(head);
    const body=el('tbody');for(const row of result.rows){const tr=el('tr'),name=el('th',row.label);name.scope='row';tr.dataset.dimension=row.id;if(!row.comparable)name.append(el('small','Verifica misure, metodi e dati mancanti.'));tr.append(name,...row.values.map(metricCell));body.append(tr);}table.append(body);wrap.append(table);return wrap;
  }
  async function compareTest(saved=null){
    const c=saved?.case||data.tests.find(c=>c.id===selected);if(!c)throw Error('Prova non trovata.');
    back('Alla prova','case',c.id);heading(saved?'Confronto salvato.':'Confronta configurazioni.',c.title+' · stessa prova e versione per tutte le configurazioni.');
    const output=el('div');
    const show=result=>{output.replaceChildren(el('h2','Dimensioni a confronto'),el('p','Ogni colonna conserva il risultato selezionato. I valori sono confrontabili quando misura, unità e metodo coincidono; i dati mancanti restano espliciti.','muted'),comparisonTable(result),action('Esporta confronto JSON',()=>download('confronto-'+c.key+'.json',result)));
      if(!saved){const save=el('form',undefined,'card bench-form');control(save,'comparisonName','Nome confronto (facoltativo)');submit(save,'Salva confronto',async values=>{const record=await req('/comparison',{caseId:c.id,runIds:result.runs.map(r=>r.id),name:values.comparisonName});await go('savedCompareMany',record.id);});output.append(save);}
    };
    if(saved){root.append(output);show(saved);return;}
    const form=el('form',undefined,'card bench-form');root.append(form);form.append(el('h2','Configurazioni da confrontare'),el('p','Seleziona almeno due configurazioni e, per ognuna, l’esecuzione o revisione da usare.'));
    const choices=[];
    for(const a of data.configurations){const runs=data.runs.filter(r=>r.architectureId===a.id&&r.caseId===c.id&&r.caseVersion===c.version),box=el('div',undefined,'bench-comparison-choice');
      const check=input('','checkbox');check.checked=!!runs.length;check.disabled=!runs.length;check.id='bench-compare-'+a.id;const label=el('label',archName(a));label.prepend(check);box.append(label);
      const run=select(box,'compare-run-'+a.id,'Esecuzione / revisione',runs.map(r=>[r.id,r.label+' · '+date(r.savedAt)]),runs[0]?.id);run.disabled=!runs.length;
      if(!runs.length)box.append(el('p','Nessun risultato disponibile per questa prova.','muted'));form.append(box);choices.push({check,run});
    }
    submit(form,'Confronta selezionate',async()=>{const ids=choices.filter(x=>x.check.checked).map(x=>x.run.value);if(ids.length<2)throw Error('Seleziona almeno due configurazioni con risultati per questa prova.');show(await req('/compare-many',{caseId:c.id,runIds:ids}));});root.append(output);
  }
  async function compare(saved=null) {
    const t=await record('trial',saved?.trialId||selected);back('Alla prova','trial',t.id);heading(saved?'Confronto salvato.':'Due esecuzioni, stessa prova.',(saved?.name||t.name)+' · '+t.case.title);
    const runs=data.runs.filter(r=>r.trialId===t.id);
    if(new Set(runs.map(r=>r.architectureId)).size<2)return empty('Servono risultati di A e B.','Carica almeno una scheda per ciascuna delle due esecuzioni della prova.','Apri prova',()=>go('trial',t.id));
    root.append(info('Confronto descrittivo di dati forniti dall’utente. La stessa prova garantisce caso, criteri e condizioni dichiarate comuni; le condizioni effettive vanno verificate nelle tracce caricate. Nessuna classifica complessiva.'));
    const form=el('form',undefined,'card bench-form');root.append(form);
    const firstId=t.architectures[0].id,secondId=t.architectures[1].id;
    const opts=id=>runs.filter(r=>r.architectureId===id).map(r=>[r.id,archName(r.architecture)+' · '+r.label+' · '+date(r.savedAt)]);
    const a=select(form,'left','Scheda dell’esecuzione A',opts(firstId),saved?.leftId),b=select(form,'right','Scheda dell’esecuzione B',opts(secondId),saved?.rightId);
    if(saved){a.disabled=true;b.disabled=true;form.append(info('Questo confronto conserva le due schede selezionate al salvataggio. Le nuove esecuzioni non lo modificano.'),action('Prepara un nuovo confronto',()=>go('compare',t.id)));}
    const output=el('div');root.append(output);
    const render=async()=>{output.replaceChildren();const result=await req(saved?'/comparison?id='+encodeURIComponent(saved.id):'/compare?a='+encodeURIComponent(a.value)+'&b='+encodeURIComponent(b.value));
      const grid=el('div',undefined,'bench-grid');for(const r of [result.left,result.right]){const card=section(archName(r.architecture));card.append(pill(outcomeLabels[r.outcome]),el('p',r.label),el('p','Valutatore: '+r.evaluator,'muted'),el('p',r.notes||'Nessuna differenza dichiarata nelle note.','muted'),action('Scheda autonoma',()=>go('run',r.id)));grid.append(card);}output.append(grid);
      output.append(el('p','Δ = B − A, solo con stessa misura, unità e metodo dichiarati. Il segno non indica automaticamente un miglioramento. Valori mancanti esclusi dal calcolo.','muted'),metricTable(result.rows,['Dimensione','A · '+archName(result.left.architecture),'B · '+archName(result.right.architecture),'Δ B − A']),action('Esporta confronto JSON',()=>download('confronto-'+t.id+'.json',result)));
      if(!saved){const saveForm=el('form',undefined,'card bench-form');output.append(saveForm);control(saveForm,'name','Nome confronto (facoltativo)');submit(saveForm,'Salva confronto',async values=>{const c=await req('/comparison',{leftId:result.left.id,rightId:result.right.id,name:values.name});await go('savedCompare',c.id);notice('Confronto salvato con queste due schede.');});}
    };if(!saved)submit(form,'Visualizza confronto',render);await render();
  }
  document.querySelector('[data-page="benchmarks"]').addEventListener('click',()=>go().catch(e=>notice(e.message,true)));
  function fromURL(){const q=new URLSearchParams(location.search);if(q.get('page')==='benchmarks')go(q.get('view')||'overview',q.get('id')||'',false).catch(e=>notice(e.message,true));}
  window.addEventListener('popstate',fromURL);fromURL();
})();
