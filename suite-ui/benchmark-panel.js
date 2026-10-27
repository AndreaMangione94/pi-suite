'use strict';
// The ledger only calls /api/benchmarks. No harness settings, logs or provider calls.
(() => {
  let data, view = 'overview', selected = '', importedFiles = [];
  const root = $('benchmark-root');
  const statusLabels = {measured:'Misurata', not_applicable:'Non pertinente', unavailable:'Non disponibile'};
  const originLabels = {user_report:'Compilazione utente',chat_report:'Report della chat',harness_export:'Export dell’harness',runner:'Valutazione del runner',human_review:'Revisione umana'};
  const outcomeLabels = {passed:'Riuscito', failed:'Fallito', partial:'Parziale', not_evaluated:'Da valutare'};
  const tabs = [['overview','Prove e confronti'],['cases','Casi di test'],['sources','Fonti']];
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
  const action = (label, fn, primary=false) => btn(label, fn, primary?'primary':'secondary');
  const download = (name,content,type='application/json') => {
    const blob=content instanceof Blob?content:new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)],{type});
    const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  async function downloadCase(caseId){const packet=await req('/case-packet?case='+encodeURIComponent(caseId));download(packet.filename,packet.content,'text/markdown');notice('Allega il file a una nuova chat e invia: Esegui la prova allegata. Lo stesso file si usa per A e B.');}
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
  function back(label='Torna alle prove',target='overview',id='') {root.append(btn('← '+label,()=>go(target,id),'text-button bench-back'));}
  function empty(title,description,label,fn) {
    const box=el('div',undefined,'bench-empty');box.append(el('h2',title),el('p',description));if(label)box.append(action(label,fn,true));root.append(box);
  }
  async function go(next='overview',id='',push=true) {
    data=await req();view=next;selected=id;page('benchmarks');$('breadcrumb').textContent='Workspace / Benchmark e confronti';
    if(push){const url=new URL(location.href);url.search='';url.searchParams.set('page','benchmarks');url.searchParams.set('view',next);if(id)url.searchParams.set('id',id);history.pushState(null,'',url);}
    root.replaceChildren();
    const nav=el('div',undefined,'bench-tabs');
    for(const [key,label] of tabs){const b=action(label,()=>go(key));if(key===view)b.classList.add('active');nav.append(b);}root.append(nav);
    const renderers={overview,architectures,architecture:architectureDetail,architectureForm,cases,case:caseDetail,caseForm,sources,trialForm,editTrial:async()=>trialForm(await record('trial',selected)),trial:trialDetail,runForm,revise:async()=>runForm(await record('run',selected)),run:runDetail,compare,savedCompare:async()=>compare(await record('comparison',selected))};
    try{await (renderers[view]||overview)();}catch(e){root.append(info(e.message));}
  }
  function overview() {
    heading('Stessa prova. Due prospettive.','Scegli un caso e scarica subito il file per la chat. Descrivi liberamente le esecuzioni A e B e carica i risultati quando sono disponibili.');
    root.append(info('Compilazione e caricamento manuali. Nessun dato viene acquisito dall’harness e nessuna configurazione operativa viene modificata.'));
    const stats=el('div',undefined,'bench-stats');
    for(const [number,label] of [[data.cases.length,'casi disponibili'],[data.trials.length,'prove e bozze'],[data.runs.length,'schede caricate']]){const n=el('div',undefined,'bench-stat');n.append(el('strong',String(number)),el('span',label));stats.append(n);}root.append(stats);
    const steps=el('div',undefined,'bench-steps');for(const [i,t] of ['Scegli il caso','Scarica ed esegui','Descrivi A e B e carica','Confronta le schede'].entries()){const n=el('span');n.append(el('b',String(i+1)+'. '),document.createTextNode(t));steps.append(n);}root.append(steps);
    root.append(action('Nuova prova',()=>go('trialForm'),true));
    if(!data.trials.length)return empty('Il primo confronto parte dal caso.','Scarica il file anche con tutti i dettagli dell’esecuzione vuoti. Puoi compilare le descrizioni e salvare una bozza in seguito.');
    const search=input();search.placeholder='Cerca una prova…';search.setAttribute('aria-label','Cerca una prova');search.className='bench-filter';root.append(search);
    const list=el('div');root.append(list);
    function render(){list.replaceChildren();for(const t of data.trials.filter(t=>(t.name+' '+t.case.title).toLowerCase().includes(search.value.toLowerCase()))){
      const card=section();const runs=data.runs.filter(r=>r.trialId===t.id);const arches=new Set(runs.map(r=>r.architectureId));
      card.append(pill(t.status==='draft'?'Bozza':arches.size===2?'Confronto disponibile':runs.length?'Risultati parziali':'In attesa dei risultati'),el('h2',t.name),el('p',t.case.title),el('p',t.architectures.map(archName).join('  /  ')+' · '+runs.length+' schede','muted'),action('Apri prova',()=>go('trial',t.id)));list.append(card);
    }}search.oninput=render;render();
  }
  function architectures() {
    heading('Architetture da confrontare.','Un registro descrittivo compilato da te. Modelli, harness e parametri servono a documentare la prova.');
    root.append(action('Registra architettura',()=>go('architectureForm'),true));
    if(!data.architectures.length)return empty('Nessuna architettura registrata.','Inserisci nome, harness, modello e condizioni di utilizzo.');
    const grid=el('div',undefined,'bench-grid');root.append(grid);
    for(const a of data.architectures){const card=section(a.name);card.append(pill(a.harness),el('p',a.model),el('p',a.workers||'Subagenti non dichiarati','muted'),action('Dettaglio architettura',()=>go('architecture',a.id)));grid.append(card);}
  }
  function architectureForm() {
    back('Alle architetture','architectures');const old=data.architectures.find(a=>a.id===selected)||{};
    heading(old.id?'Modifica il record.':'Descrivi l’architettura.','Inserisci soltanto dati descrittivi. Non inserire chiavi API o credenziali.');
    const form=el('form',undefined,'card bench-form');root.append(form);
    for(const [key,label,multi,required] of [['name','Nome architettura',false,true],['harness','Harness e versione',false,true],['model','Modello orchestratore · revisione / checkpoint',false,true],['hosting','Hosting · locale, privato o API',false,false],['workers','Subagenti · modelli, revisioni e ruoli',true,false],['parameters','Parametri · temperatura, seed, ragionamento, quantizzazione',true,false],['tools','Strumenti, memoria, contesto e fonti disponibili',true,false],['notes','Note e informazioni non verificabili',true,false]])control(form,key,label,old[key]||'',multi,required);
    form.append(info('Le prove già create conservano la descrizione originale. Le modifiche valgono solo per le nuove prove.'));
    submit(form,'Salva record',async values=>{const a=await req('/architecture',{...values,...(old.id?{id:old.id}:{})});await go('architecture',a.id);notice('Architettura registrata.');});
  }
  function architectureSummary(a) {
    const box=section(archName(a));for(const [k,label] of [['harness','Harness'],['model','Modello'],['hosting','Hosting'],['workers','Subagenti'],['parameters','Parametri'],['tools','Strumenti e memoria'],['notes','Note']]){const p=el('p');p.append(el('b',label+': '),document.createTextNode(a[k]||'Non dichiarato'));box.append(p);}return box;
  }
  function architectureDetail() {
    back('Alle architetture','architectures');const a=data.architectures.find(a=>a.id===selected);if(!a)throw Error('Architettura non trovata.');
    heading(a.name,'Scheda descrittiva dell’architettura.');root.append(architectureSummary(a),action('Modifica record',()=>go('architectureForm',a.id)),el('h2','Esecuzioni registrate'));
    runList(data.runs.filter(r=>r.architectureId===a.id));
  }
  function sources() {
    heading('Fonti per progettare le prove.','Riferimenti primari verificati il 25 ottobre 2026. I casi locali sono originali; le fonti ne orientano il metodo.');
    root.append(info('Nessun dataset di terzi è redistribuito. Per importare casi ufficiali fissa revisione, split, ID e licenze; segnala traduzioni e adattamenti.'));
    const grid=el('div',undefined,'bench-grid bench-sources');root.append(grid);
    for(const source of data.sources){const card=section(source.title),link=el('a','Apri fonte primaria ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';card.append(el('p',source.use),el('p',source.limits,'muted'),link);grid.append(card);}
  }
  function cases() {
    heading('Casi di test.','Prompt e contesto sono pronti da copiare. I criteri di valutazione restano separati e si consultano dopo l’esecuzione.');
    root.append(action('Aggiungi caso personalizzato',()=>go('caseForm')));
    const grid=el('div',undefined,'bench-grid');root.append(grid);
    for(const c of data.cases){const card=section(c.title);card.append(pill(c.inspectSupported?'Scoring Inspect disponibile':c.family),el('p',c.key+' · versione '+c.version.slice(0,10),'bench-code'),el('p',c.setup.slice(0,160)+(c.setup.length>160?'…':''),'muted'),action('Apri caso',()=>go('case',c.id)));grid.append(card);}
  }
  function chatPacket(c) {return c.prompt+(c.context?'\n\nCONTESTO E RISORSE\n'+c.context:'');}
  function caseContent(c) {
    const box=section('Materiale per la chat');box.append(el('pre',chatPacket(c),'bench-copy'));
    box.append(action('Copia solo prompt e contesto',async()=>{await navigator.clipboard.writeText(chatPacket(c));notice('Copiati prompt e contesto, senza criteri di valutazione.');}),action('Scarica prompt .txt',()=>download(c.key+'-prompt.txt',chatPacket(c),'text/plain')));root.append(box);
    const setup=section('Preparazione manuale');setup.append(el('p',c.setup),el('p',c.sourceNotes,'muted'));root.append(setup);
    const criteria=el('details',undefined,'bench-restricted');criteria.append(el('summary','Riservato al valutatore · mostra criteri e risposte attese'),el('p','Da consultare dopo la prova. Non consegnare questi criteri alla chat valutata.'),el('pre',c.criteria));root.append(criteria);
    const sourceBox=section('Fonti metodologiche');for(const id of c.sourceIds){const source=data.sources.find(s=>s.id===id);if(source){const a=el('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';sourceBox.append(a,el('p',source.limits,'muted'));}}if(!c.sourceIds.length)sourceBox.append(el('p','Controllo originale Pi Suite: protocollo descritto nella proposta.'));root.append(sourceBox);
  }
  function caseDetail() {
    back('Ai casi','cases');const c=data.cases.find(c=>c.id===selected);if(!c)throw Error('Caso non trovato.');
    heading(c.title,c.key+' · versione '+c.version.slice(0,12));root.append(action('Scarica file per la chat',()=>downloadCase(c.id),true),action('Prepara prova con questo caso',()=>go('trialForm',c.id)));caseContent(c);
  }
  function caseForm() {
    back('Ai casi','cases');heading('Un nuovo caso, criteri separati.','Ogni caso è versionato. Per cambiare una fixture crea un nuovo caso: le prove precedenti rimangono consultabili.');
    const form=el('form',undefined,'card bench-form');root.append(form);
    for(const [k,label,multi] of [['key','Codice caso',false],['title','Titolo',false],['family','Famiglia',false],['prompt','Prompt destinato alla chat',true],['context','Contesto e risorse destinati alla chat',true],['setup','Preparazione manuale · non copiata nella chat',true],['criteria','Criteri e risposte attese · riservati al valutatore',true],['sourceNotes','Provenienza · URL, revisione, split, ID e licenze',true]])control(form,k,label,'',multi,['key','title','family','prompt','criteria'].includes(k));
    submit(form,'Salva caso',async values=>{const c=await req('/case',values);await go('case',c.id);});
  }
  function trialForm(previous=null) {
    back();heading(previous?'Riprendi la bozza.':'Nuova prova.','Scegli un caso: il file per la chat è subito disponibile. Tutti i dettagli descrittivi di A e B sono facoltativi.');
    const form=el('form',undefined,'card bench-form');root.append(form);
    const caseSelect=select(form,'caseId','Caso e versione',[['','Scegli un caso…'],...data.cases.map(c=>[c.id,c.title+(c.inspectSupported?' · scoring Inspect':'')+' · '+c.version.slice(0,8)])],previous?.case.id||selected||'');
    caseSelect.required=true;
    const downloadButton=action('Scarica file per la chat',()=>downloadCase(caseSelect.value),true);form.append(downloadButton);
    const preview=el('p','Il download dipende soltanto dal caso selezionato.','muted');form.append(preview);
    const updateCase=()=>{downloadButton.disabled=!caseSelect.value;};caseSelect.onchange=updateCase;updateCase();
    if(previous&&data.runs.some(r=>r.trialId===previous.id)){caseSelect.disabled=true;form.append(info('Sono già presenti risultati: caso e versione sono fissati. Puoi completare i dettagli della bozza.'));}
    control(form,'name','Nome prova (facoltativo)',previous?.name||'');
    control(form,'conditions','Condizioni comuni e note di protocollo (facoltative)',previous?.conditions||'',true);
    form.append(info('I campi descrivono ciò che hai usato. Puoi lasciarli vuoti o scrivere “non noto”; non configurano l’harness e non entrano nel file per la chat.'));
    const editors={};
    const payload=status=>({caseId:caseSelect.value,name:form.elements.namedItem('name').value,conditions:form.elements.namedItem('conditions').value,status,
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
    for(const r of runs){const n=el('div',undefined,'bench-result'),title=el('div');title.append(el('h3',r.label),el('p',outcomeLabels[r.outcome]+' · caricato '+date(r.savedAt),'muted'));n.append(title,action('Apri scheda',()=>go('run',r.id)));root.append(n);}
  }
  async function trialDetail() {
    back();const t=await record('trial',selected);heading(t.name,t.case.title+' · versione '+t.case.version.slice(0,12));
    root.append(pill(t.status==='draft'?'Bozza':t.status==='saved'?'Prova salvata':'Prova precedente'),action('Scarica file per la chat',()=>downloadCase(t.case.id),true));
    if(t.status==='draft')root.append(action('Completa bozza',()=>go('editTrial',t.id)));
    root.append(info(t.conditions||'Condizioni aggiuntive non dichiarate. Usa lo stesso caso in una nuova chat per ogni esecuzione.'));
    const grid=el('div',undefined,'bench-grid');root.append(grid);
    for(const [index,a] of t.architectures.entries()){const slot=a.slot||String.fromCharCode(65+index);const runs=data.runs.filter(r=>r.trialId===t.id&&r.architectureId===a.id);const snapshot=runs[0]?.architecture||a;const card=section('Esecuzione '+slot);card.append(pill(runs.length?runs.length+' schede caricate':'Risultati da caricare'),el('p',archName(snapshot)),el('p',(snapshot.model||'Modello non dichiarato')+' · '+(snapshot.harness||'Harness non dichiarato'),'muted'),el('p',detailCount(snapshot)+' / 8 dettagli compilati','muted'),action('Carica risposta e metriche '+slot,()=>go('runForm',t.id+'~'+slot),true));grid.append(card);}
    root.append(info('Scarica una volta il file del caso, allegalo alle chat scelte per A e B e invia «Esegui la prova allegata». Carica poi i risultati nelle rispettive schede; puoi descrivere le esecuzioni in quel momento.'));
    root.append(row(action('Carica risultati di un’esecuzione',()=>go('runForm',t.id),true),action('Confronta due esecuzioni',()=>go('compare',t.id))),el('h2','Schede delle esecuzioni'));
    runList(data.runs.filter(r=>r.trialId===t.id));
    const comparisons=data.comparisons.filter(c=>c.trialId===t.id);
    if(comparisons.length){root.append(el('h2','Confronti salvati'));for(const c of comparisons)root.append(action('Apri confronto · '+c.name,()=>go('savedCompare',c.id)));}
    const snapshots=el('details');snapshots.append(el('summary','Descrizioni delle architetture fissate per questa prova'));t.architectures.forEach(a=>snapshots.append(architectureSummary(a)));root.append(snapshots);
    caseContent(t.case);
  }
  function blankDimensions() {return Object.fromEntries(data.dimensions.map(d=>[d.id,{status:'unavailable',value:null,origin:'user_report',measure:'',unit:'',method:'',evidence:'',note:'Dati non forniti per questa esecuzione.'}]));}
  async function runForm(previous=null) {
    const [trialId,requestedSlot]=selected.split('~');
    const t=await record('trial',previous?.trialId||trialId);back('Alla prova','trial',t.id);heading(previous?'Integra la scheda.':'Carica un’esecuzione.',t.name+' · '+t.case.title);
    root.append(info('I dati provengono esclusivamente dai tuoi file e dalla compilazione del form. Nessuna lettura automatica dell’harness. La valutazione è dichiarata dall’utente.'));
    const form=el('form',undefined,'card bench-form');root.append(form);importedFiles=[];
    const arch=select(form,'architectureId','Esecuzione',t.architectures.map((a,i)=>[a.id,'Esecuzione '+(a.slot||String.fromCharCode(65+i))]),previous?.architectureId||t.architectures.find(a=>a.slot===requestedSlot)?.id);
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
    const manualTemplate=el('details');manualTemplate.append(el('summary','Opzione manuale · modello JSON vuoto'),action('Scarica modello JSON',()=>download('risultato-benchmark.json',{trialId:t.id,architectureId:arch.value,label:'Esecuzione 1',executedAt:'',evaluator:'',outcome:'not_evaluated',answer:'',notes:'',attachments:[],dimensions:blankDimensions()})));form.append(manualTemplate);
    const answerFile=input('','file');answerFile.accept='.txt,.md,.json,.csv,.log';answerFile.id='bench-answer-file';form.append(field('Carica risposta da file · TXT, Markdown, JSON, CSV o log (150 KB)',answerFile));
    const answer=control(form,'answer','Risposta caricata · anteprima e correzione manuale','',true);
    answerFile.onchange=async()=>{try{const f=answerFile.files[0];if(!f)return;if(f.size>150000)throw Error('Risposta troppo grande: massimo 150 KB.');answer.value=await f.text();notice('Risposta caricata da '+f.name+'. Salva la scheda per conservarla.');}catch(e){notice(e.message,true);}};
    const files=input('','file');files.multiple=true;files.id='bench-attachments';form.append(field('Allegati · log, diff, report o artefatti (massimo 10, 400 KB complessivi)',files));
    const fileList=el('p','Nessun allegato.','muted');form.append(fileList);
    const showFiles=()=>{fileList.textContent=importedFiles.map(f=>f.name).join(', ')||'Nessun allegato.';};
    files.onchange=async()=>{try{const pending=[...files.files];if(pending.length>10||pending.reduce((n,f)=>n+f.size,0)>400000)throw Error('Limite allegati: 10 file, 400 KB totali.');const loaded=[];for(const f of pending){const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);loaded.push({name:f.name,base64:btoa(binary)});}importedFiles=loaded;showFiles();}catch(e){files.value='';notice(e.message,true);}};
    form.append(action('Rimuovi allegati dal form',()=>{importedFiles=[];files.value='';showFiles();}));
    const telemetry=input('','file');telemetry.accept='.json';telemetry.id='bench-telemetry-file';
    form.append(field('Aggiungi metriche esportate dall’harness · JSON normalizzato, senza connessione automatica',telemetry));
    form.append(action('Scarica modello metriche harness',()=>download('metriche-harness.json',{trialId:t.id,architectureId:arch.value,dimensions:{performance:{status:'unavailable',value:null,origin:'harness_export',measure:'Tempo totale dell’esecuzione',unit:'s',method:'',evidence:'',note:'Compilare dal log esportato, indicando copertura e metodo.'},tokens:{status:'unavailable',value:null,origin:'harness_export',measure:'Token totali di tutte le chiamate e tentativi',unit:'token',method:'',evidence:'',note:'Mancante finché il provider/harness non espone il totale completo.'}}})));
    control(form,'notes','Note · fallimenti, differenze dal protocollo, limiti dei dati','',true);
    form.append(el('h2','Scheda completa · 16 dimensioni'),el('p','Ogni dimensione resta visibile. Misurata richiede valore, unità, misura, metodo ed evidenza. Non pertinente e non disponibile richiedono una motivazione e non valgono zero.','muted'));
    const editors={};
    for(const d of data.dimensions){
      const box=el('details',undefined,'bench-metric'),summary=el('summary',d.label+' · Non disponibile');box.append(summary);form.append(box);
      const s=select(box,d.id+'-status','Stato',Object.entries(statusLabels),'unavailable');
      const origin=select(box,d.id+'-origin','Provenienza dichiarata',Object.entries(originLabels),'user_report');
      const measure=control(box,d.id+'-measure','Misura precisa · es. tempo totale, percentuale requisiti soddisfatti');
      const value=control(box,d.id+'-value','Valore');value.type='number';value.step='any';
      const unit=control(box,d.id+'-unit','Unità · es. secondi, token, %, EUR');
      const method=control(box,d.id+'-method','Metodo / rubrica applicata');
      const evidence=control(box,d.id+'-evidence','Evidenza · file, righe, dati del report');
      const note=control(box,d.id+'-note','Motivazione / limiti','Dati non forniti per questa esecuzione.',true,true);
      const update=()=>{const measured=s.value==='measured';summary.textContent=d.label+' · '+statusLabels[s.value];for(const n of [measure,value,unit,method,evidence]){n.disabled=!measured;n.required=measured;}note.required=!measured;};s.onchange=()=>{if(s.value==='measured'&&note.value==='Dati non forniti per questa esecuzione.')note.value='';update();};update();
      editors[d.id]={s,origin,measure,value,unit,method,evidence,note,update};
    }
    telemetry.onchange=async()=>{try{
      const f=telemetry.files[0];if(!f)return;if(f.size>100000)throw Error('Metriche troppo grandi: massimo 100 KB.');const r=JSON.parse(await f.text());
      if(r.trialId!==t.id||r.architectureId!==arch.value)throw Error('Le metriche devono riferirsi alla prova e all’architettura selezionate.');
      if(!r.dimensions||typeof r.dimensions!=='object'||Array.isArray(r.dimensions))throw Error('Usa il modello metriche harness.');
      for(const [key,m] of Object.entries(r.dimensions)){if(!editors[key]||!m||!statusLabels[m.status])throw Error('Dimensione non valida: '+key);if(m.status!=='measured'&&m.value!=null)throw Error('Misura mancante: value deve essere null.');}
      for(const [key,m] of Object.entries(r.dimensions)){const e=editors[key];e.s.value=m.status;e.origin.value='harness_export';for(const k of ['measure','value','unit','method','evidence','note'])e[k].value=m[k]??'';e.update();}
      notice('Metriche aggiunte alla scheda. La risposta e le altre dimensioni sono conservate.');
    }catch(e){notice(e.message,true);}finally{telemetry.value='';}};
    const fillReport=r=>{
      const before=arch.value;
      for(const key of ['architectureId','label','executedAt','evaluator','outcome','answer','notes'])if(r[key]!=null)form.elements.namedItem(key).value=r[key];
      if(r.architecture&&t.format==='case-first-v1')setDescription(r.architecture);else if(before!==arch.value)setDescription(snapshotFor(arch.value));
      importedFiles=r.attachments||[];showFiles();
      const ms={...blankDimensions(),...(r.dimensions||{})};
      for(const [key,m] of Object.entries(ms)){const e=editors[key];e.s.value=m.status;e.origin.value=m.origin||'user_report';for(const k of ['measure','value','unit','method','evidence','note'])e[k].value=m[k]??'';e.update();}
    };
    if(previous){fillReport({...previous,label:(previous.label+' · revisione').slice(0,200)});arch.disabled=true;form.append(info('Il salvataggio crea una nuova scheda collegata all’originale. Le misure conservano la provenienza dichiarata; le modifiche manuali vanno documentate nelle note.'));}
    upload.onchange=async()=>{try{
      const file=upload.files[0];if(!file)return;if(file.size>900000)throw Error('Scheda troppo grande: massimo 900 KB.');
      const raw=(await file.text()).replace(/^\uFEFF/,'');let r;
      try{r=JSON.parse(raw);}catch{const blocks=[...raw.matchAll(/```json\s*\n([\s\S]*?)\n```/gi)];if(blocks.length!==1)throw Error('Serve un file JSON o un messaggio con un unico blocco ```json. Per solo testo usa Carica risposta da file.');r=JSON.parse(blocks[0][1]);}
      if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Serve un oggetto JSON.');
      if(r.trialId&&r.trialId!==t.id)throw Error('Il file appartiene a una prova diversa.');
      if(r.caseVersion&&r.caseVersion!==t.case.version)throw Error('Versione del caso diversa.');
      if(r.caseId&&r.caseId!==t.case.id)throw Error('Il file appartiene a un caso diverso.');
      if(r.architectureId&&!t.architectures.some(a=>a.id===r.architectureId))throw Error('Architettura non prevista nella prova.');
      if(previous&&r.architectureId&&r.architectureId!==previous.architectureId)throw Error('La revisione deve conservare l’architettura originale.');
      if(r.dimensions&&(typeof r.dimensions!=='object'||Array.isArray(r.dimensions)))throw Error('Dimensioni non valide.');
      for(const [key,m] of Object.entries(r.dimensions||{})){if(!editors[key]||!m||!statusLabels[m.status])throw Error('Dimensione o stato non valido: '+key);if(m.status!=='measured'&&m.value!=null)throw Error('Le misure mancanti devono avere value null.');}
      if(r.outcome&&!outcomeLabels[r.outcome])throw Error('Esito non valido.');
      if(r.attachments&&!Array.isArray(r.attachments))throw Error('Allegati non validi.');
      fillReport(r);
      notice('Scheda importata nel form. Controlla e salva per registrarla.');
    }catch(e){notice(e.message,true);}finally{upload.value='';}};
    submit(form,'Salva scheda esecuzione',async (values,event)=>{
      const dimensions={};for(const [key,e] of Object.entries(editors)){dimensions[key]={status:e.s.value,origin:e.origin.value,value:e.s.value==='measured'&&e.value.value!==''?Number(e.value.value):null};for(const k of ['measure','unit','method','evidence','note'])dimensions[key][k]=e[k].value;}
      const payload={trialId:t.id,architectureId:arch.value,caseId:t.case.id,caseVersion:t.case.version,label:values.label,executedAt:values.executedAt,evaluator:values.evaluator,outcome:values.outcome,answer:values.answer,notes:values.notes,dimensions,attachments:importedFiles,...(t.format==='case-first-v1'?{architecture:descriptionGetter()}:{}),...(previous?{sourceRunId:previous.id}:{})};
      if(new TextEncoder().encode(JSON.stringify(payload)).length>950000)throw Error('Scheda troppo grande. Riduci la risposta o gli allegati.');
      const run=await req('/run',payload);
      if(event.submitter?.dataset.inspect==='true'){
        try{notice('Risposta salvata. Inspect sta applicando i criteri…');const evaluated=await req('/score',{id:run.id});await go('run',evaluated.id);notice('Valutazione Inspect completata.');}
        catch(error){await go('run',run.id);throw Error('Risposta salvata. '+error.message);}
      }else{await go('run',run.id);notice('Scheda salvata sul disco locale.');}
    });
    if(data.inspectAvailable&&data.cases.some(c=>c.version===t.case.version&&c.inspectSupported)){const score=el('button','Salva e valuta con Inspect','primary');score.type='submit';score.dataset.inspect='true';form.append(score);}
  }
  function metricCell(m) {
    const td=el('td',undefined,'bench-status-'+m.status);
    if(m.status==='measured'){td.append(el('strong',String(m.value)+' '+m.unit),el('small',m.measure),el('small','Metodo: '+m.method),el('small','Evidenza: '+m.evidence));}
    else td.append(el('b',statusLabels[m.status]));td.append(el('small','Provenienza: '+(originLabels[m.origin]||'Compilazione utente')));if(m.note)td.append(el('small',m.note));return td;
  }
  function metricTable(rows,headers) {
    const wrap=el('div',undefined,'bench-table-wrap'),table=el('table',undefined,'bench-table'),thead=el('thead'),tr=el('tr');
    for(const label of headers){const th=el('th',label);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);const body=el('tbody');table.append(body);wrap.append(table);
    for(const r of rows){const line=el('tr'),name=el('th',r.label);name.scope='row';line.append(name,metricCell(r.left));if(r.right){line.append(metricCell(r.right),el('td',r.delta==null?'Non confrontabile':(r.delta>0?'+':'')+Number(r.delta.toPrecision(6))+' '+r.left.unit));}body.append(line);}return wrap;
  }
  async function runDetail() {
    const r=await record('run',selected),t=await record('trial',r.trialId);back('Alla prova','trial',t.id);heading(r.label,archName(r.architecture)+' · '+t.name);
    root.append(pill(outcomeLabels[r.outcome]),info(r.provenance),el('p','Valutatore: '+r.evaluator+' · esecuzione dichiarata: '+(r.executedAt||'Non fornita')+' · caricata '+date(r.savedAt),'muted'));
    const count=Object.values(r.dimensions).filter(m=>m.status==='measured').length;root.append(el('h2',count+' / 16 dimensioni misurate'));
    const progress=el('progress',undefined,'bench-chart');progress.max=16;progress.value=count;progress.setAttribute('aria-label','Copertura delle dimensioni misurate');root.append(progress,el('p','Copertura dei dati, non punteggio di qualità.','muted'));
    root.append(action('Esporta scheda completa JSON',()=>download('esecuzione-'+r.id+'.json',{...r,trial:t})),action('Aggiungi metriche o revisione',()=>go('revise',r.id)),action('Apri confronto della prova',()=>go('compare',t.id)));
    if(r.sourceRunId&&!r.evaluation)root.append(action('Apri scheda precedente',()=>go('run',r.sourceRunId)));
    const scoring=section('Valuta la risposta con Inspect AI');
    const supported=data.cases.some(c=>c.version===t.case.version&&c.inspectSupported);
    if(supported){
      scoring.append(el('p','Controlli deterministici su successo, correttezza e formato. Nessuna nuova risposta generata e nessuna chiamata a modelli. Le metriche dell’harness caricate restano separate.'));
      const scoreButton=action('Valuta con Inspect AI',async()=>{scoreButton.disabled=true;try{notice('Inspect sta valutando la risposta caricata…');const result=await req('/score',{id:r.id});await go('run',result.id);notice('Valutazione salvata in una nuova scheda; il caricamento originale è conservato.');}finally{scoreButton.disabled=false;}},true);
      scoreButton.disabled=!data.inspectAvailable;scoring.append(scoreButton);if(!data.inspectAvailable)scoring.append(el('p','Runner opzionale non installato. Esegui Install-Inspect.ps1 nella cartella della suite, poi riapri questa pagina.','muted'));
    }else scoring.append(el('p','Questo caso richiede uno scorer dedicato o revisione umana. L’adattatore iniziale supporta i casi originali di calcolo ed estrazione JSON.'));
    if(r.evaluation)scoring.append(el('p',r.evaluation.note,'muted'),el('p','Scorer: '+r.evaluation.scorer+' · chiamate a modelli: '+r.evaluation.modelCalls),action('Apri caricamento originale',()=>go('run',r.sourceRunId)));
    root.append(scoring);
    root.append(metricTable(data.dimensions.map(d=>({label:d.label,left:r.dimensions[d.id]})),['Dimensione','Risultato e provenienza']));
    const answer=section('Risposta / artefatto testuale');answer.append(el('pre',r.answer||'Nessun testo: consultare allegati e note.','bench-run-answer'));root.append(answer);
    const notes=section('Note e allegati');notes.append(el('p',r.notes||'Nessuna nota.'));
    for(const f of r.attachments){notes.append(action('Scarica '+f.name,()=>{const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));download(f.name,new Blob([bytes],{type:'application/octet-stream'}));}),el('p',f.bytes+' byte · SHA-256 '+f.sha256,'bench-code'));}root.append(notes);
    const snapshot=el('details');snapshot.append(el('summary','Architettura dichiarata al momento della prova'),architectureSummary(r.architecture));root.append(snapshot);
    caseContent(t.case);
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
