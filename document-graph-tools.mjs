import fs from 'node:fs';
import {knowledgeTools} from './evidence-tools.mjs';

const text={type:'string'},line={type:'integer',minimum:1};
const evidence={type:'array',minItems:1,maxItems:12,items:{type:'object',additionalProperties:false,
  properties:{source:text,document:text,startLine:line,endLine:line,quote:{type:'string',minLength:1,maxLength:1500}},required:['source','document','startLine','endLine','quote']}};
const node={type:'object',additionalProperties:false,properties:{key:text,label:text,kind:text,summary:text,existing:text,evidence},required:['key','label','kind','summary','evidence']};
const edge={type:'object',additionalProperties:false,properties:{source:text,target:text,relation:text,reason:text,evidence},required:['source','target','relation','reason','evidence']};
const equivalence={type:'object',additionalProperties:false,properties:{source:text,target:text,reason:text,evidence},required:['source','target','reason','evidence']};
const response=value=>({content:[{type:'text',text:JSON.stringify(value)}],details:{}});

export function documentGraphTools(job){
  let submitted;
  const budget=Math.max(3000,Math.min(12000,Math.floor((job.contextWindow||32000)/3)));
  const local=job.documentGraph.phase==='documents',context=job.documentGraph.context;
  const tools=knowledgeTools(job.documentGraph.bundle,{home:job.evidenceHome}).filter(t=>(local?['read_evidence']:['knowledge_search','knowledge_trace','read_evidence']).includes(t.name)).map(tool=>({...tool,
    execute:async(id,args,signal)=>{
      if(local&&(args.source!==context.source||args.document!==context.document))throw Error('In questa fase analizza soltanto il documento indicato. I collegamenti fra documenti vengono ricostruiti nella sintesi.');
      return tool.execute(id,tool.name==='read_evidence'?{...args,maxChars:Math.min(args.maxChars||budget,budget)}:{...args,limit:Math.min(args.limit||4,4)},signal);
    }}));
  if(!local)tools.push({name:'read_draft_document_graph',label:'Consulta il grafo in costruzione',description:'Cerca concetti gia estratti e segui collegamenti nel grafo documentale in costruzione. Riusa gli ID trovati per collegare documenti diversi.',
    parameters:{type:'object',additionalProperties:false,properties:{query:text,nodes:{type:'array',items:text,maxItems:20},limit:{type:'integer',minimum:1,maximum:40}}},
    execute:async(_id,args)=>{
      const graph=JSON.parse(fs.readFileSync(job.documentGraph.draftPath,'utf8')),limit=Math.max(1,Math.min(40,args.limit||20)),q=(args.query||'').toLowerCase();
      const matches=graph.nodes.filter(n=>args.nodes?.length?args.nodes.includes(n.id):JSON.stringify(n).toLowerCase().includes(q));
      matches.sort((a,b)=>Number(b.method==='llm_inference')-Number(a.method==='llm_inference'));
      const nodes=[];let size=0;
      for(const n of matches.slice(0,limit)){
        const value={id:n.id,kind:n.kind,label:n.label.slice(0,300),summary:n.summary?.slice(0,800),aliases:n.aliases?.slice(0,4).map(a=>a.slice(0,100)),source:n.source,document:n.document,path:n.path,startLine:n.startLine,endLine:n.endLine,
          ...(n.evidence?{evidence:n.evidence.slice(0,1).map(e=>({...e,quote:e.quote?.slice(0,200)})),evidenceCount:n.evidence.length}:{})};
        const length=JSON.stringify(value).length;if(size+length>budget/2)break;nodes.push(value);size+=length;
      }
      const ids=new Set(nodes.map(n=>n.id)),edges=[];
      for(const e of graph.edges.filter(e=>ids.has(e.source)||ids.has(e.target)).slice(0,limit*3)){
        const value={...e,reason:e.reason?.slice(0,500),evidence:e.evidence?.slice(0,2).map(ev=>({...ev,quote:ev.quote?.slice(0,300)}))};
        const length=JSON.stringify(value).length;if(size+length>budget)break;edges.push(value);size+=length;
      }
      return response({nodes,edges,truncated:matches.length>nodes.length||size>=budget});
    }});
  tools.push({name:'submit_document_graph',label:'Consegna concetti e relazioni',description:'Consegna le aggiunte al grafo documentale con evidenze e brevi citazioni esatte. Nodi e relazioni possono essere inferiti anche senza riferimenti espliciti. Dopo la consegna termina.',
    parameters:{type:'object',additionalProperties:false,properties:{nodes:{type:'array',items:node,maxItems:150},edges:{type:'array',items:edge,maxItems:400},equivalences:{type:'array',items:equivalence,maxItems:100},notes:text},required:['nodes','edges','notes']},
    execute:async(_id,args)=>{if(submitted)throw Error('Consegna gia ricevuta per questo passaggio');submitted=structuredClone(args);return response({received:true,validation:'Le evidenze saranno controllate prima del salvataggio definitivo.'});}});
  return {tools,result:()=>submitted};
}
