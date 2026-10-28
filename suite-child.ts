import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {scopedTools,assignmentSystemPrompt} from './delegation-core.mjs';
import {knowledgeSchemas} from './evidence-tools.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {evidenceReportSchema,evidenceReadingSummary} from './evidence-reading.mjs';

export default function(pi: ExtensionAPI) {
  // Every operation resolves from this child's own cwd, never a process-global scope.
  for(const name of ['read_source','list_sources','propose_file','graph_query','read_skill','connected_sources','read_connected_source','connected_graph','document_graph','knowledge_search','knowledge_trace','read_evidence','report_evidence_reading','propose_relation']) {
    const schemas:any={
      read_source:{path:{type:'string'}},list_sources:{directory:{type:'string'}},
      propose_file:{path:{type:'string'},content:{type:'string'}},graph_query:{query:{type:'string'}},read_skill:{name:{type:'string'}},connected_graph:{query:{type:'string'},source:{type:'string'}},connected_sources:{query:{type:'string'},offset:{type:'integer',minimum:0}},read_connected_source:{source:{type:'string'},document:{type:'string'},startLine:{type:'integer',minimum:1},lines:{type:'integer',minimum:1,maximum:300}}
    };
    for(const [key,schema] of Object.entries(knowledgeSchemas) as any){schemas[key]=schema.properties;}
    schemas.report_evidence_reading=evidenceReportSchema.properties;
    const required:any={...Object.fromEntries(Object.entries(knowledgeSchemas).map(([key,s]:any)=>[key,s.required])),report_evidence_reading:evidenceReportSchema.required,read_source:['path'],propose_file:['path','content'],read_skill:['name'],read_connected_source:['source','document']};
    pi.registerTool({name,label:name,description:({report_evidence_reading:'Consegna sintesi, citazioni, parti non lette e dubbi; la copertura delle letture e calcolata dagli strumenti.',document_graph:'Consulta il grafo documentale semantico finale fissato nel dossier, con concetti e relazioni inferite corredate da evidenze.',knowledge_search:'Cerca nelle fonti fissate: per AS-IS parti dal grafo documentale; non aggiorna gli indici.',knowledge_trace:'Naviga relazioni e nodi vicini con evidenze e limiti; inferenze separate.',read_evidence:'Leggi originali anche integralmente: full/section/passage, segui nextOffset e segnala parti non lette.',propose_relation:'Proponi una relazione semantica non revisionata con evidenze, senza approvarla.',connected_graph:'Consulta il grafo AST degli snapshot Azure collegati.',connected_sources:'Elenca le fonti SharePoint/Azure collegate con date, snapshot ed esclusioni.',read_connected_source:'Leggi evidenze collegate con citazioni e righe.',read_source:'Leggi qualsiasi file testuale del progetto originale (percorso relativo).',list_sources:'Esplora una directory del progetto, vuota per la radice.',propose_file:'Salva una proposta per uno dei soli file assegnati nell’incarico. Non modifica l’originale.',graph_query:'Consulta il grafo locale dell’intero progetto; verifica i sorgenti correnti.',read_skill:'Leggi una skill abilitata senza ampliare il perimetro.'} as any)[name],
      parameters:{type:'object',properties:schemas[name],required:required[name]||[],additionalProperties:false} as any,
      async execute(id,args,signal,_update,ctx){return scopedTools(ctx.cwd).find((t:any)=>t.name===name).execute(id,args,signal);}});
  }
  pi.on('session_start',async(_event,ctx)=>{scopedTools(ctx.cwd);});
  pi.on('before_agent_start',async(event,ctx)=>({systemPrompt:assignmentSystemPrompt(event.systemPrompt,ctx.cwd)}));
  const readingReminders=new Set<string>();
  pi.on('agent_before_settle',async(event,ctx)=>{
    if(event.outcome!=='completed'||readingReminders.has(ctx.cwd))return;
    const contract=JSON.parse(fs.readFileSync(path.join(ctx.cwd,'contract.json'),'utf8'));
    const reading=evidenceReadingSummary(ctx.cwd,contract);
    if(!contract.evidenceScope||!reading.readCalls&&contract.evidenceScope.origin!=='explicit'||!reading.reportMissing&&!reading.declarationStale)return;
    readingReminders.add(ctx.cwd);
    return {entries:[{type:'custom_message',customType:'suite-evidence-reading-required',display:true,content:'Prima di concludere chiama report_evidence_reading. Riporta sintesi, citazioni, documenti iniziali non letti con motivi, dubbi e richieste di ampliamento. La copertura sarà calcolata sulle letture effettive; non dichiarare completo un documento letto solo in parte.'}],continue:true};
  });
}
