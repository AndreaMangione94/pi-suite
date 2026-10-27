import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=path.dirname(fileURLToPath(import.meta.url));
const string={type:'string'},integer={type:'integer',minimum:1};
export const knowledgeSchemas={
  knowledge_search:{properties:{query:string,source:string,limit:{...integer,maximum:40}},required:['query']},
  knowledge_trace:{properties:{nodes:{type:'array',items:string,maxItems:20,minItems:1},depth:{...integer,maximum:3},limit:{...integer,maximum:40},includeInferred:{type:'boolean'}},required:['nodes']},
  read_evidence:{properties:{source:string,snapshot:string,document:string,mode:{type:'string',enum:['passage','section','full']},startLine:integer,lines:{...integer,maximum:1000},offset:{type:'integer',minimum:0},maxChars:{type:'integer',minimum:100,maximum:200000}},required:['source','document']},
  propose_relation:{properties:{sourceNode:string,targetNode:string,relation:{type:'string',enum:['implements','supports','contradicts','depends_on','same_concept','describes']},reason:string,evidence:{type:'array',minItems:1,maxItems:10,items:{type:'object',properties:{source:string,document:string,startLine:integer,endLine:integer},required:['source','document','startLine','endLine'],additionalProperties:false}}},required:['sourceNode','targetNode','relation','reason','evidence']},
  prepare_asis:{properties:{objective:string,sources:{type:'array',items:string},refresh:{type:'boolean'}},required:['objective']},
  register_asis:{properties:{},required:[]}
};
const descriptions={
  knowledge_search:'Opzionale: cerca testo, requisiti e simboli negli snapshot fissati. I risultati brevi orientano; puoi leggere gli originali completi. Non crea o aggiorna indici.',
  knowledge_trace:'Opzionale: esplora nodi vicini e relazioni con evidenze. Vicinanza non prova significato o completezza. includeInferred mostra separatamente proposte semantiche con stato di revisione.',
  read_evidence:'Legge una fonte congelata verificandone integrita. mode full legge il contenuto completo disponibile, paginato se necessario: segui nextOffset. Dichiara sempre troncamenti e parti non lette.',
  propose_relation:'Salva una deduzione semantica con evidenze valide come proposta NON revisionata. Non modifica fonti, non certifica verita e non approva la propria proposta.',
  prepare_asis:'SOLO per una richiesta esplicita di creare/aggiornare AS-IS: sincronizza se refresh=true, verifica/aggiorna prima grafi e indici e prepara il dossier. Poi leggi i suoi originali e scrivi i documenti. Non chiamare per semplici domande.',
  register_asis:'Registra i documenti del dossier attivo gia prodotti: verifica citazioni primarie e integrita e crea una versione persistente consultabile. Non equivale a revisione semantica o approvazione umana.'
};

export async function invokeEvidence(action,args,bundle,options={}) {
  const home=options.home||process.env.PI_SUITE_HOME||path.join(root,'suite-data');
  const python=process.env.PI_SUITE_PYTHON||path.join(root,'.venv','Scripts','python.exe');
  if(!fs.existsSync(python))throw Error('Runtime Python assente. Esegui Install.cmd.');
  return await new Promise((resolve,reject)=>{
    const child=spawn(python,[path.join(root,'suite_evidence_cli.py')],{cwd:root,windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
    let out='',err='',settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    const abort=()=>{child.kill();finish(Error('Consultazione interrotta'));};
    const timer=setTimeout(()=>{child.kill();finish(Error('Operazione evidenze scaduta'));},action==='prepare_asis'?1800000:180000);
    if(options.signal?.aborted){abort();return;}
    options.signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',chunk=>{out+=chunk.toString('utf8');if(out.length>16000000){child.kill();finish(Error('Risultato troppo grande: restringi la richiesta'));}});
    child.stderr.on('data',chunk=>err=(err+chunk.toString('utf8')).slice(-4000));
    child.on('error',error=>finish(error));child.stdin.on('error',()=>{});
    child.on('close',code=>{try{const value=JSON.parse(out);if(code||value.error)finish(Error(value.error||err||'Operazione fallita'));else finish(null,value);}catch{finish(Error(err||'Risposta evidenze non valida'));}});
    child.stdin.end(JSON.stringify({action,args,bundle,home,workspace:options.workspace}));
  });
}

export function knowledgeTools(bundle,options={}) {
  return Object.entries(knowledgeSchemas).filter(([name])=>options.parent||!['prepare_asis','register_asis'].includes(name)).map(([name,schema])=>({
    name,label:name,description:descriptions[name],parameters:{type:'object',...schema,additionalProperties:false},
    async execute(_id,args,signal){const value=await invokeEvidence(name,args,bundle,{...options,signal});return {content:[{type:'text',text:JSON.stringify(value)}],details:{}};}
  }));
}
