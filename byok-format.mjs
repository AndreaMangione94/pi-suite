// Data-only YAML bridge. No interpolation, tags, aliases, custom constructors or I/O from documents.
import fs from 'node:fs';
import YAML, {visit, isAlias} from 'yaml';
try {
  const raw=fs.readFileSync(0,'utf8');
  if(Buffer.byteLength(raw)>2200000)throw Error('Documento troppo grande');
  const request=JSON.parse(raw);
  if(request.action==='export')process.stdout.write(YAML.stringify(request.config));
  else {
    const documents=YAML.parseAllDocuments(request.content,{uniqueKeys:true,schema:'core',version:'1.2'});
    if(documents.length!==1)throw Error('Serve un solo documento YAML');
    const doc=documents[0];
    if(doc.errors.length||doc.warnings.length)throw Error('YAML non valido: controlla chiavi duplicate e tipi');
    let count=0;
    visit(doc,(_key,node,path)=>{
      if(++count>30000||path.length>32)throw Error('Documento troppo complesso');
      if(isAlias(node)||node?.anchor||node?.tag)throw Error('Tag, anchor e alias YAML non sono ammessi');
    });
    process.stdout.write(JSON.stringify(doc.toJS({maxAliasCount:0})));
  }
} catch {process.stderr.write('Configurazione YAML non valida: un solo documento, senza chiavi duplicate, tag, anchor o alias.');process.exitCode=1;}
