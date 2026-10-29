import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function isCleanWorkspace(project) {
  const clean=process.env.PI_SUITE_CLEAN_WORKSPACE;
  const normalize=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
  return !!clean&&normalize(project)===normalize(clean);
}

export function sourceBundle(home,project) {
  if(isCleanWorkspace(project))return [];
  const dossier=path.join(project,'FONTI.json');let refs,documentGraph;
  if(fs.existsSync(dossier)&&fs.existsSync(path.join(project,'INCARICO-AS-IS.md')))refs=JSON.parse(fs.readFileSync(dossier,'utf8'));
  else {
    const root=path.join(home,'sources');refs=[];
    const settingsPath=path.join(home,'settings.json'),normalize=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
    const cwd=normalize(project);
    const registered=fs.existsSync(settingsPath)?JSON.parse(fs.readFileSync(settingsPath,'utf8')).projects||[]:[];
    const selected=registered.filter(p=>cwd===normalize(p.path)||cwd.startsWith(normalize(p.path)+path.sep)).sort((a,b)=>b.path.length-a.path.length)[0];
    const allowed=selected?new Set(selected.workspace?.graph?.sources??selected.workspace?.asis?.sources??[]):null;
    const graphPointer=selected?path.join(home,'graphs',selected.id,'documental','current.json'):null;
    let dependencies=[];
    if(graphPointer&&fs.existsSync(graphPointer)){
      const ref=JSON.parse(fs.readFileSync(graphPointer,'utf8'));
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(ref.project)||ref.project!==selected.id||!/^[a-f0-9]{64}$/.test(ref.version))throw Error('Riferimento al grafo documentale non valido');
      const graph=JSON.parse(fs.readFileSync(path.join(home,'graphs',ref.project,'documental','versions',ref.version,'graph.json'),'utf8'));
      if(graph.dependencies.every(d=>allowed.has(d.source))){documentGraph={project:ref.project,version:ref.version};dependencies=graph.dependencies;}
    }
    if(fs.existsSync(root))for(const id of fs.readdirSync(root)){
      if(!/^[a-f0-9]{32}$/.test(id))continue;
      if(allowed&&!allowed.has(id))continue;
      const pointer=path.join(root,id,'current.json');if(!fs.existsSync(pointer))continue;
      const dependency=dependencies.find(d=>d.source===id);
      refs.push({source:id,snapshot:dependency?.snapshot||JSON.parse(fs.readFileSync(pointer,'utf8')).snapshot,...(dependency?{indexVersion:dependency.indexVersion}:{}),...(documentGraph?{documentGraph}:{})});
    }
  }
  refs=[...refs];
  const registry=path.join(home,'sources','asis-registry.json');
  const sameEvidence=d=>refs.some(r=>{
    if(r.source!==d.source)return false;if(r.snapshot===d.snapshot)return true;
    if(!d.contentFingerprint)return false;
    const manifest=JSON.parse(fs.readFileSync(path.join(home,'sources',r.source,r.snapshot,'manifest.json'),'utf8'));
    return manifest.contentFingerprint===d.contentFingerprint;
  });
  const sameDocumentGraph=ref=>{
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(ref.project))return false;
    const pointer=path.join(home,'graphs',ref.project,'documental','current.json');
    return fs.existsSync(pointer)&&JSON.parse(fs.readFileSync(pointer,'utf8')).semanticFingerprint===ref.semanticFingerprint;
  };
  if(fs.existsSync(registry))for(const item of JSON.parse(fs.readFileSync(registry,'utf8'))){
    if(item.dependencies?.length&&item.dependencies.every(d=>refs.some(r=>r.source===d.source))&&!refs.some(r=>r.source===item.source))
      refs.push({source:item.source,snapshot:item.snapshot,freshness:item.dependencies.every(sameEvidence)&&(item.documentGraphs||[]).every(sameDocumentGraph)?'current_for_selection':'needs_revalidation'});
  }
  return refs.map(ref=>{
    if(!/^[a-f0-9]{32}$/.test(ref.source)||!/^[a-f0-9]{32}$/.test(ref.snapshot))throw Error('Riferimento alla fonte non valido');
    const directory=path.join(home,'sources',ref.source,ref.snapshot);
    const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
    const index=path.join(directory,'evidence.json');
    const indexVersion=ref.indexVersion||(fs.existsSync(index)?JSON.parse(fs.readFileSync(index,'utf8')).fingerprint:undefined);
    return {source:ref.source,snapshot:ref.snapshot,name:manifest.name,directory,manifest,indexVersion,freshness:ref.freshness||'pinned',...(ref.documentGraph?{documentGraph:ref.documentGraph}:{})};
  });
}
export function connectedTools(bundle) {
  const response=value=>({content:[{type:'text',text:JSON.stringify(value)}],details:{}});
  return [
    {name:'connected_graph',label:'Grafo delle fonti Azure',description:'Cerca simboli nel grafo Graphify degli snapshot collegati, con riferimenti ai documenti e al commit. Analisi AST strutturale, non prova di deployment.',parameters:{type:'object',properties:{query:{type:'string'},source:{type:'string'}},additionalProperties:false},execute:async(_id,args)=>{
      const graphs=[];for(const s of bundle){if(args.source&&args.source!==s.source)continue;const file=path.join(s.directory,'graph.json');if(!fs.existsSync(file))continue;const g=JSON.parse(fs.readFileSync(file,'utf8'));const matches=g.nodes.filter(n=>JSON.stringify(n).toLowerCase().includes((args.query||'').toLowerCase())),nodes=matches.slice(0,40),ids=new Set(nodes.map(n=>n.id));graphs.push({source:s.source,snapshot:s.snapshot,revision:s.manifest.revision,nodes,edges:g.edges.filter(e=>ids.has(e.source)||ids.has(e.target)).slice(0,100),truncated:matches.length>40,limits:g.limits});}return response({graphs});}},
    {name:'connected_sources',label:'Fonti SharePoint e Azure',description:'Elenca evidenze e snapshot locali collegati. Controlla date, commit ed esclusioni prima di scrivere un AS-IS.',parameters:{type:'object',properties:{query:{type:'string'},offset:{type:'integer',minimum:0}},additionalProperties:false},execute:async(_id,args)=>{
      const matches=bundle.flatMap(s=>s.manifest.documents.map(d=>({source:s.source,snapshot:s.snapshot,name:s.name,...d}))).filter(d=>JSON.stringify(d).toLowerCase().includes((args.query||'').toLowerCase()));const offset=Math.max(0,args.offset||0);
      return response({sources:bundle.map(s=>({id:s.source,name:s.name,snapshot:s.snapshot,createdAt:s.manifest.createdAt,revision:s.manifest.revision,documents:s.manifest.documents.length,excluded:s.manifest.excluded,limits:s.manifest.limits})),documents:matches.slice(offset,offset+60),totalMatches:matches.length,nextOffset:offset+60<matches.length?offset+60:null});}},
    {name:'read_connected_source',label:'Leggi evidenza collegata',description:'Legge il testo estratto di una fonte SharePoint/Azure dallo snapshot fissato, con citazione, hash, revisione e righe. Nessuna richiesta di rete.',parameters:{type:'object',properties:{source:{type:'string'},document:{type:'string'},startLine:{type:'integer',minimum:1},lines:{type:'integer',minimum:1,maximum:300}},required:['source','document'],additionalProperties:false},execute:async(_id,args)=>{
      const s=bundle.find(s=>s.source===args.source),doc=s?.manifest.documents.find(d=>d.id===args.document);
      if(!s||!doc||!/^[a-f0-9]{20}$/.test(doc.id))throw Error('Evidenza non presente nel perimetro collegato');
      let text=fs.readFileSync(path.join(s.directory,doc.id+'.txt'),'utf8');
      if(!doc.original&&crypto.createHash('sha256').update(text).digest('hex')!==doc.textSha256){const legacy=text.replace(/\r\n/g,'\n');if(crypto.createHash('sha256').update(legacy).digest('hex')===doc.textSha256)text=legacy;}
      if(crypto.createHash('sha256').update(text).digest('hex')!==doc.textSha256)throw Error('Snapshot alterato; sincronizza nuovamente');
      const all=text.split('\n'),start=Math.max(0,(args.startLine||1)-1),count=Math.min(300,Math.max(1,args.lines||150));
      if(start>=all.length)throw Error('Intervallo oltre il documento');
      const selected=all.slice(start,start+count).join('\n'),characters=value=>{let total=0;for(const _char of value)total++;return total;};
      return response({citation:`[${s.source}:${doc.id}]`,source:s.name,sourceId:s.source,document:doc.id,snapshot:s.snapshot,createdAt:s.manifest.createdAt,revision:s.manifest.revision,...doc,totalLines:all.length,
        mode:'passage',startLine:start+1,endLine:Math.min(all.length,start+count),offset:0,nextOffset:null,rangeStartOffset:characters(all.slice(0,start).join('\n'))+(start?1:0),
        totalRangeChars:characters(selected),returnedChars:characters(selected),documentTotalChars:characters(text),documentTotalLines:all.length,extractionTruncated:doc.truncated,
        text:all.slice(start,start+count).map((line,i)=>`${start+i+1}: ${line}`).join('\n'),nextLine:start+count<all.length?start+count+1:null});}}
  ];
}
