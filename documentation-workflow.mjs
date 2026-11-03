import fs from 'node:fs';
import path from 'node:path';
import {legacyDocumentation} from './documentation-compat.mjs';

export function isDocumentationDossier(workspace) {
  return fs.existsSync(path.join(workspace,'FONTI.json'))&&
    ['INCARICO-DOCUMENTAZIONE-TECNICO-FUNZIONALE.md',legacyDocumentation.assignment].some(name=>fs.existsSync(path.join(workspace,name)));
}

export function documentationInstructions(workspace) {
  if(!isDocumentationDossier(workspace))return '';
  return fs.readFileSync(new URL('./skills/documentazione-tecnico-funzionale/references/workflow.md',import.meta.url),'utf8');
}

export const documentationChildInstructions='Per questo dossier AS-IS di documentazione tecnico funzionale esegui solo il micro modulo o la funzionalità assegnata. Se l’incarico è di solo censimento iniziale, elenca unità e riferimenti senza stenderne la documentazione. La lettura di fonti adiacenti serve soltanto a chiarire contesto e punti di passaggio: non estendere analisi o stesura ad altre funzionalità. Per esse lascia riferimenti agli ID del piano scritti come [[F-002]], con input/output di collegamento ed evidenze, senza duplicarne i dettagli. Il modulo inizia con «# <ID> <Nome>» e usa «##» per le sezioni. Segnala funzionalità nuove, lacune o necessità di scomposizione come proposte di nuovi task al genitore; non ampliare il tuo incarico e non avviare altri agenti. Documenta nell’ambito assegnato attori, permessi, prerequisiti, azioni e risposte, regole, esiti, varianti, errori e dettagli tecnici pertinenti. Consegna solo la proposta autorizzata, citazioni, riferimenti e punti aperti; l’orchestratore aggiorna il piano, integra i pezzi e assegna le continuazioni.';

// --- Assemblaggio deterministico del documento finale ---
const MODULE_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
function shiftHeadings(markdown){
  let fence=null;
  return markdown.split('\n').map(line=>{
    const marker=line.match(/^\s*(`{3,}|~{3,})/);
    if(marker){if(!fence)fence=marker[1][0].repeat(marker[1].length);else if(marker[1].startsWith(fence))fence=null;return line;}
    if(fence)return line;
    const heading=line.match(/^(#{1,5})(\s.*)$/);
    return heading?'#'+heading[1]+heading[2]:line;
  }).join('\n');
}
export function assembleDocumentation(workspace,{order,intro,closing=[],title='Documentazione tecnico funzionale'}){
  if(!isDocumentationDossier(workspace))throw Error('assemble_documentation funziona solo nella cartella di un dossier');
  if(!Array.isArray(order)||!order.length||order.length>500)throw Error('order: elenco di 1-500 ID del piano');
  const read=rel=>{const file=path.join(workspace,...rel.split('/'));if(!/^[\w./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(file))return null;return fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').trim();};
  const ids=new Set(order),missing=[],unresolved=new Set(),parts=['# '+title];
  if(intro){const text=read(intro);if(text===null)missing.push(intro);else parts.push(shiftHeadings(text));}
  for(const id of order){
    if(!MODULE_ID.test(id))throw Error('ID non valido: '+id);
    const text=read('moduli/'+id+'.md');
    if(text===null){missing.push(id);parts.push('<a id="'+id+'"></a>\n\n> Sezione '+id+' non disponibile: modulo mancante.');continue;}
    parts.push('<a id="'+id+'"></a>\n\n'+shiftHeadings(text));
  }
  for(const rel of closing){const text=read(rel);if(text===null)missing.push(rel);else parts.push(shiftHeadings(text));}
  const body=parts.join('\n\n').replace(/\[\[([A-Za-z0-9._-]{1,40})\]\]/g,(_all,id)=>{if(!ids.has(id)){unresolved.add(id);return id;}return '['+id+'](#'+id+')';})+'\n';
  fs.writeFileSync(path.join(workspace,'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md'),body,'utf8');
  return {path:path.join(workspace,'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md'),modules:order.length-missing.filter(m=>ids.has(m)).length,missing,unresolvedRefs:[...unresolved],chars:body.length};
}
