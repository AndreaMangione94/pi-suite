'use strict';
function selectedEvidenceSources(){if(!chosenSources.size)throw Error('Seleziona le fonti da consultare.');return [...chosenSources];}
async function evidenceRequest(actionName,args){return api('evidence',{sources:selectedEvidenceSources(),action:actionName,args});}
async function showEvidence(source,document,offset=0){
  const result=await evidenceRequest('read_evidence',{source,document,mode:'full',offset,maxChars:100000});
  const host=$('evidence-reader');host.replaceChildren();host.append(el('h3',result.path),el('p',result.citation+' · snapshot '+result.snapshot,'muted'));
  host.append(el('p',result.nextOffset!==null?'Contenuto paginato: sono disponibili altre parti.':offset?'Ultima parte del contenuto.':'Contenuto testuale disponibile letto integralmente.'));
  if(result.extractionTruncated)host.append(el('p','L’estrazione non copre tutto l’originale.','error'));
  if(result.coverageNotes?.length)host.append(el('p',result.coverageNotes.join(' · '),'muted'));
  if(result.freshness==='needs_revalidation')host.append(el('p','AS-IS storico: le sue fonti sono cambiate. Da rivalutare.','error'));
  host.append(el('pre',result.text));
  if(result.nextOffset!==null)host.append(btn('Leggi parte successiva',()=>showEvidence(source,document,result.nextOffset)));
}
async function showEvidenceTrace(id){
  const result=await evidenceRequest('knowledge_trace',{nodes:[id],depth:2,limit:20});
  const host=$('evidence-results');host.replaceChildren();host.append(el('h3','Collegamenti e fonti vicine'),el('p','La vicinanza orienta la lettura; non dimostra da sola il significato.','muted'));
  for(const n of result.nodes){const card=el('div',undefined,'card');card.append(el('strong',n.label),el('p',n.kind+' · '+n.path+' · righe '+n.startLine+'–'+n.endLine,'muted'),btn('Leggi fonte completa',()=>showEvidence(n.source,n.document)),btn('Esplora collegamenti',()=>showEvidenceTrace(n.id),'text-button'));host.append(card);}
  const detail=el('details');detail.append(el('summary',result.edges.length+' relazioni con evidenze'),el('pre',JSON.stringify(result.edges,null,2)));host.append(detail);
  if(result.truncated)host.append(el('p','Risultati limitati: restringi la ricerca.','muted'));
}
bind('evidence-search',async()=>{
  const result=await evidenceRequest('knowledge_search',{query:$('evidence-query').value,limit:12});const host=$('evidence-results');host.replaceChildren();
  for(const hit of result.hits){const card=el('div',undefined,'card');card.append(el('h3',hit.path),el('p',hit.text),el('small',hit.citation+' · righe '+hit.startLine+'–'+hit.endLine),btn('Leggi fonte completa',()=>showEvidence(hit.source,hit.document)));if(hit.freshness==='needs_revalidation')card.append(el('p','AS-IS da rivalutare: fonti cambiate.','error'));host.append(card);}
  if(!result.hits.length)host.append(el('p','Nessuna evidenza trovata in questa ricerca. Non prova che il comportamento non esista.'));
  for(const n of result.nodes.slice(0,12))host.append(btn('Esplora: '+n.label,()=>showEvidenceTrace(n.id),'text-button'));
  if(result.unavailableIndexes.length)host.append(el('p','Alcuni indici non sono disponibili. Usa Aggiorna grafi e indici.','muted'));
  if(result.truncated)host.append(el('p','Risultati limitati: restringi la ricerca o aumenta il dettaglio.','muted'));
});
bind('index-sources',async()=>{const sources=selectedEvidenceSources();await saveReferences('asis');return action('index-sources',{sources});});
bind('register-dossier',async()=>{const workspace=$('dossier-workspace').value.trim();if(!workspace)throw Error('Inserisci la cartella del dossier prodotto.');await saveReferences('asis');return action('register-asis',{workspace});});
async function refreshEvidenceRegistry(){
  const [registry,proposals]=await Promise.all([api('asis-registry'),api('relation-proposals')]);
  await refreshWorkspaceFiles();
  const host=$('asis-registry');host.replaceChildren();
  if(!registry.length)host.append(el('p','Nessun AS-IS registrato. Registra il dossier dopo averlo prodotto e verificato.','muted'));
  for(const item of registry.filter(item=>item.workspace===$('dossier-workspace').value.trim()||item.dependencies.some(d=>chosenSources.has(d.source)))){const card=el('div',undefined,'card');card.append(el('strong',item.freshness==='current'?'AS-IS: fonti allineate':'AS-IS: da rivalutare'),el('p',item.workspace,'muted'),el('small','Versione '+item.snapshot+' · le citazioni sono verificate tecnicamente, non semanticamente.'));
    card.append(btn('Prepara aggiornamento',()=>startAsis('auto-asis','Aggiorna l’AS-IS confrontando le fonti attuali e segnala le differenze.')));card.querySelector('button').dataset.asisUpdate='';host.append(card);}
  asisAvailability();
  const relations=$('relation-proposals');relations.replaceChildren();
  if(!proposals.length)relations.append(el('p','Nessuna relazione semantica proposta. I grafi strutturali non richiedono queste inferenze.','muted'));
  for(const item of proposals){const card=el('div',undefined,'card');card.append(el('strong',item.relation+' · '+item.verification),el('p',item.reason),el('small','Inferenza del modello: una revisione non la trasforma in estrazione deterministica.'));
    const detail=el('details');detail.append(el('summary','Evidenze e nodi'),el('pre',JSON.stringify({sourceNode:item.source,targetNode:item.target,evidence:item.evidence,corpusVersion:item.corpusVersion},null,2)));card.append(detail);
    const reason=input(item.reviewReason||'');reason.placeholder='Motivazione della revisione';card.append(field('Esito motivato',reason));
    const review=async verdict=>{if(!reason.value.trim())throw Error('Inserisci la motivazione della revisione.');await api('relation-review',{corpusVersion:item.corpusVersion,id:item.id,verdict,reason:reason.value});await refreshEvidenceRegistry();};
    card.append(btn('Accetta interpretazione',()=>review('accepted')),btn('Rifiuta interpretazione',()=>review('rejected')));relations.append(card);}
}
bind('refresh-evidence-registry',refreshEvidenceRegistry);

