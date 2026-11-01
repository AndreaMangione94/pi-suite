import {upgradeDocumentationContext} from './documentation-compat.mjs';
import fs from 'node:fs';
import path from 'node:path';

export function chatContext(project) {
  const file=process.env.PI_SUITE_CONTEXT||path.join(project,'CONTESTO.json');
  return fs.existsSync(file)?upgradeDocumentationContext(JSON.parse(fs.readFileSync(file,'utf8'))):null;
}

export function contextTools(context) {
  const response=value=>({content:[{type:'text',text:JSON.stringify(value)}],details:{}});
  return [{name:'read_documentation',label:'Consulta documentazione tecnica',description:'Elenca o leggi i documenti di documentazione tecnica selezionati nel contesto. Lettura deterministica con righe e paginazione; non genera documenti.',
    parameters:{type:'object',properties:{id:{type:'string'},query:{type:'string'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:300}},additionalProperties:false},
    async execute(_id,args){
      const documents=context?.documentation||[];
      if(!args.id)return response({documents:documents.map(({id,name,path})=>({id,name,path}))});
      const doc=documents.find(d=>d.id===args.id);if(!doc)throw Error('Documento di documentazione tecnica non selezionato');
      if(fs.lstatSync(doc.path).isSymbolicLink()||fs.statSync(doc.path).size>5000000)throw Error('Documento non consultabile');
      const lines=fs.readFileSync(doc.path,'utf8').split('\n'),offset=Math.max(0,args.offset||0),limit=Math.max(1,Math.min(300,args.limit||100));
      const rows=lines.map((text,i)=>({line:i+1,text})).filter(row=>!args.query||row.text.toLowerCase().includes(args.query.toLowerCase()));
      return response({id:doc.id,path:doc.path,rows:rows.slice(offset,offset+limit),totalLines:lines.length,nextOffset:offset+limit<rows.length?offset+limit:null});
    }}];
}
