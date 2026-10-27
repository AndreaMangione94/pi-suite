import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {scopedTools,assignmentSystemPrompt} from './delegation-core.mjs';
import {knowledgeSchemas} from './evidence-tools.mjs';

export default function(pi: ExtensionAPI) {
  // Every operation resolves from this child's own cwd, never a process-global scope.
  for(const name of ['read_source','list_sources','propose_file','graph_query','read_skill','connected_sources','read_connected_source','connected_graph','knowledge_search','knowledge_trace','read_evidence','propose_relation']) {
    const schemas:any={
      read_source:{path:{type:'string'}},list_sources:{directory:{type:'string'}},
      propose_file:{path:{type:'string'},content:{type:'string'}},graph_query:{query:{type:'string'}},read_skill:{name:{type:'string'}},connected_graph:{query:{type:'string'},source:{type:'string'}},connected_sources:{query:{type:'string'},offset:{type:'integer',minimum:0}},read_connected_source:{source:{type:'string'},document:{type:'string'},startLine:{type:'integer',minimum:1},lines:{type:'integer',minimum:1,maximum:300}}
    };
    for(const [key,schema] of Object.entries(knowledgeSchemas) as any){schemas[key]=schema.properties;}
    const required:any={...Object.fromEntries(Object.entries(knowledgeSchemas).map(([key,s]:any)=>[key,s.required])),read_source:['path'],propose_file:['path','content'],read_skill:['name'],read_connected_source:['source','document']};
    pi.registerTool({name,label:name,description:({knowledge_search:'Ricerca opzionale nelle fonti fissate; non aggiorna gli indici.',knowledge_trace:'Naviga relazioni e nodi vicini con evidenze e limiti; inferenze separate.',read_evidence:'Leggi originali anche integralmente: full/section/passage, segui nextOffset e segnala parti non lette.',propose_relation:'Proponi una relazione semantica non revisionata con evidenze, senza approvarla.',connected_graph:'Consulta il grafo AST degli snapshot Azure collegati.',connected_sources:'Elenca le fonti SharePoint/Azure collegate con date, snapshot ed esclusioni.',read_connected_source:'Leggi evidenze collegate con citazioni e righe.',read_source:'Leggi qualsiasi file testuale del progetto originale (percorso relativo).',list_sources:'Esplora una directory del progetto, vuota per la radice.',propose_file:'Salva una proposta per uno dei soli file assegnati nell’incarico. Non modifica l’originale.',graph_query:'Consulta il grafo locale dell’intero progetto; verifica i sorgenti correnti.',read_skill:'Leggi una skill abilitata senza ampliare il perimetro.'} as any)[name],
      parameters:{type:'object',properties:schemas[name],required:required[name]||[],additionalProperties:false} as any,
      async execute(id,args,signal,_update,ctx){return scopedTools(ctx.cwd).find((t:any)=>t.name===name).execute(id,args,signal);}});
  }
  pi.on('session_start',async(_event,ctx)=>{scopedTools(ctx.cwd);});
  pi.on('before_agent_start',async(event,ctx)=>({systemPrompt:assignmentSystemPrompt(event.systemPrompt,ctx.cwd)}));
}
