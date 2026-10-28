"""Read-only connected sources and immutable, cited text snapshots for AS-IS."""
import base64
import hashlib
import io
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree
from suite_evidence import cached_extract, extract_document, ensure_index, checked_text, validate_citations, CODE_EXTENSIONS, VERSION as EVIDENCE_VERSION

MAX_FILE=5_000_000
MAX_TOTAL=100_000_000
MAX_FILES=1000
TEXT={'.md','.txt','.rst','.csv','.json','.yaml','.yml','.xml','.html','.htm','.py','.js','.jsx','.ts','.tsx','.mjs','.cjs','.cs','.java','.sql','.ps1','.sh','.toml','.ini','.cfg','.properties','.tf','.bicep','.css','.vue','.go','.rs'}
SKIP={'.git','.venv','node_modules','__pycache__','bin','obj','dist','build'}
PRIVATE_CONFIG={'credentials.dpapi.json','settings.pre-byok.json','auth.json'}

def stamp(): return datetime.now(timezone.utc).isoformat()
def long_path(path):
    path=Path(path).resolve()
    if os.name=='nt' and not str(path).startswith('\\\\?\\'):
        value=str(path);return Path('\\\\?\\UNC\\'+value[2:] if value.startswith('\\\\') else '\\\\?\\'+value)
    return path
def sha(raw): return hashlib.sha256(raw).hexdigest()
def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.'+uuid.uuid4().hex+'.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)
def relative(name):
    if not isinstance(name,str) or not name or '\\' in name or ':' in name or name.startswith('/') or any(p in ('','..','.') for p in name.split('/')):
        raise ValueError('Percorso fonte non valido')
    return name
def https_url(url,hosts=None):
    parsed=urllib.parse.urlsplit(url)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError('Serve un URL HTTPS senza credenziali o frammenti')
    if hosts and not any(parsed.hostname==h or parsed.hostname.endswith('.'+h) for h in hosts):
        raise ValueError('Host della fonte non consentito')
    return url

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise ValueError('Redirect della fonte rifiutato')

def download(url,headers=None,graph=False):
    https_url(url,('graph.microsoft.com',) if graph else ('sharepoint.com','1drv.com','onedrive.com'))
    request=urllib.request.Request(url,headers=headers or {})
    with urllib.request.build_opener(NoRedirect).open(request,timeout=45) as response:
        raw=response.read(MAX_FILE+1)
    if len(raw)>MAX_FILE: raise ValueError('Risposta oltre il limite di 5 MB')
    return raw

def extract(name,raw):
    if Path(name).suffix.lower() not in TEXT|{'.pdf','.docx'} and Path(name).name.lower() not in ('dockerfile','makefile'):
        raise ValueError('Formato non supportato')
    result=extract_document(name,raw)
    return result['text'],result['truncated']

class Sources:
    def __init__(self,home,protect):
        self.root=long_path(Path(home)/'sources');self.root.mkdir(parents=True,exist_ok=True)
        self.path=self.root/'connections.json';self.protect=protect
    def connections(self): return json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else []
    def public(self):
        result=[]
        for source in self.connections():
            p={k:v for k,v in source.items() if k!='secret'};p['hasSecret']=bool(source.get('secret'))
            pointer=self.root/source['id']/'current.json'
            if pointer.exists():
                current=json.loads(pointer.read_text(encoding='utf-8'));manifest=json.loads((self.root/source['id']/current['snapshot']/'manifest.json').read_text(encoding='utf-8'))
                p['snapshot']={k:manifest[k] for k in ('id','createdAt','revision','documents','excluded')}
                index=self.root/source['id']/current['snapshot']/'evidence.json'
                p['snapshot']['index']={k:v for k,v in json.loads(index.read_text(encoding='utf-8')).items() if k in ('version','fingerprint','nodes','edges','fragments')} if index.exists() else None
            result.append(p)
        return result
    def save(self,data):
        sources=self.connections();sid=data.get('id') or uuid.uuid4().hex
        if not re.fullmatch('[a-f0-9]{32}',sid): raise ValueError('ID fonte non valido')
        old=next((s for s in sources if s['id']==sid),{})
        kind=data['kind']
        if kind not in ('sharepoint-local','sharepoint-graph','azure-local','azure-remote'): raise ValueError('Tipo fonte non supportato')
        s={'id':sid,'name':str(data.get('name','')).strip()[:150],'kind':kind}
        if not s['name']: raise ValueError('Inserisci un nome per la fonte')
        if kind.endswith('local'):
            local=Path(data['path']).expanduser().resolve()
            if not local.is_dir(): raise ValueError('Cartella locale non trovata')
            s['path']=str(local)
        if kind=='sharepoint-local':
            if data.get('url'):s['url']=https_url(data['url'],('sharepoint.com',))
        if kind=='sharepoint-graph':
            for key in ('driveId','folderId'):
                value=str(data.get(key,'')).strip()
                if not value or len(value)>300 or '/' in value: raise ValueError('Drive ID e Folder Item ID sono richiesti')
                s[key]=value
        if kind.startswith('azure'):
            branch=str(data.get('branch','main'))
            if not re.fullmatch('[A-Za-z0-9_][A-Za-z0-9_./-]{0,199}',branch) or '..' in branch: raise ValueError('Branch non valido')
            s['branch']=branch
            if kind=='azure-remote':
                s['url']=https_url(data['url'],('dev.azure.com','visualstudio.com'))
                if urllib.parse.urlsplit(s['url']).query:raise ValueError('URL Azure senza query')
        if data.get('token'): s['secret']=self.protect(data['token'].strip())
        elif not data.get('clearSecret') and old.get('secret') and old.get('kind')==kind:s['secret']=old['secret']
        sources=[x for x in sources if x['id']!=sid]+[s];write(self.path,sources)
        return self.public()
    def _git(self,args,env=None):
        result=subprocess.run(['git','-c','core.longpaths=true',*args],env=env,capture_output=True,timeout=180)
        if result.returncode: raise ValueError('Lettura Git non riuscita: verifica URL, branch e credenziali (Code Read).')
        return result.stdout
    def _local(self,s):
        root=long_path(s['path'])
        for directory,dirs,files in os.walk(root,followlinks=False):
            dirs[:]=sorted(d for d in dirs if d not in SKIP and not (Path(directory)/d).is_symlink() and not (Path(directory)/d).resolve().is_relative_to(self.root.resolve()))
            for name in sorted(files):
                if name.lower() in PRIVATE_CONFIG:continue
                file=Path(directory)/name
                if file.is_symlink() or not file.resolve().is_relative_to(root):continue
                rel=file.relative_to(root).as_posix()
                if file.stat().st_size>MAX_FILE:yield rel,None,{'reason':'file oltre 5 MB'};continue
                # Reading OneDrive placeholders may hydrate them using the user's existing login.
                yield rel,file.read_bytes(),{'url':s.get('url',''),'modifiedAt':datetime.fromtimestamp(file.stat().st_mtime,timezone.utc).isoformat()}
    def _azure(self,s):
        env=os.environ.copy();env.update(GIT_TERMINAL_PROMPT='0',GCM_INTERACTIVE='never')
        if s.get('secret'):
            value=base64.b64encode((':'+self.protect(s['secret'],True)).encode()).decode()
            env.update(GIT_CONFIG_COUNT='2',GIT_CONFIG_KEY_0='http.extraHeader',GIT_CONFIG_VALUE_0='Authorization: Basic '+value,
                       GIT_CONFIG_KEY_1='http.followRedirects',GIT_CONFIG_VALUE_1='false')
        if s['kind']=='azure-remote':
            repo=self.root/s['id']/'mirror.git'
            if not repo.exists():self._git(['clone','--bare','--',s['url'],str(repo)],env)
            self._git(['-C',str(repo),'fetch','--no-tags','origin',s['branch']],env)
            revision=self._git(['-C',str(repo),'rev-parse','FETCH_HEAD'],env).decode().strip()
        else:
            repo=Path(s['path']);revision=self._git(['-C',str(repo),'rev-parse','--verify',s['branch']+'^{commit}'],env).decode().strip()
        if not re.fullmatch('[a-f0-9]{40,64}',revision):raise ValueError('Commit Git non valido')
        self._revision=revision
        entries=self._git(['-C',str(repo),'ls-tree','-rlz',revision],env).split(b'\0')
        for entry in entries:
            if not entry:continue
            meta,name=entry.split(b'\t',1);mode,kind,oid,size=meta.decode().split();name=relative(name.decode('utf-8'))
            if mode not in ('100644','100755') or any(p in SKIP for p in PurePosixPath(name).parts):continue
            origin={'commit':revision,'url':s.get('url','')}
            if int(size)>MAX_FILE:yield name,None,{**origin,'reason':'file oltre 5 MB'};continue
            yield name,self._git(['-C',str(repo),'cat-file','blob',oid],env),origin
    def _graph(self,s):
        if not s.get('secret'):raise ValueError('Inserisci un access token Microsoft Graph con accesso in lettura alla cartella')
        token=self.protect(s['secret'],True);headers={'Authorization':'Bearer '+token}
        drive=urllib.parse.quote(s['driveId'],safe='');seen=set();queue=[(s['folderId'],'')]
        while queue:
            folder,prefix=queue.pop(0)
            url=f'https://graph.microsoft.com/v1.0/drives/{drive}/items/{urllib.parse.quote(folder,safe="")}/children?$top=100'
            while url:
                if url in seen:raise ValueError('Paginazione Graph ciclica')
                seen.add(url)
                if len(seen)>2000:raise ValueError('Cartella oltre il limite di paginazione')
                body=json.loads(download(url,headers,graph=True))
                for item in body.get('value',[]):
                    name=relative(prefix+item['name'])
                    if 'folder' in item:queue.append((item['id'],name+'/'));continue
                    meta={'url':item.get('webUrl',''),'etag':item.get('eTag',''),'modifiedAt':item.get('lastModifiedDateTime','')}
                    if 'file' not in item or 'remoteItem' in item:continue
                    if item.get('size',0)>MAX_FILE:yield name,None,{**meta,'reason':'file oltre 5 MB'};continue
                    if Path(name).suffix.lower() not in TEXT|{'.pdf','.docx'}:yield name,None,{**meta,'reason':'formato non supportato'};continue
                    link=item.get('@microsoft.graph.downloadUrl')
                    if not link:
                        detail=json.loads(download(f'https://graph.microsoft.com/v1.0/drives/{drive}/items/{urllib.parse.quote(item["id"],safe="")}',headers,graph=True));link=detail.get('@microsoft.graph.downloadUrl')
                    if not link:raise ValueError('Download URL Graph non disponibile')
                    yield name,download(link),meta
                url=body.get('@odata.nextLink')
    def sync(self,sid):
        s=next((s for s in self.connections() if s['id']==sid),None)
        if not s:raise ValueError('Fonte non trovata')
        snapshot=uuid.uuid4().hex;folder=self.root/sid/snapshot;folder.mkdir(parents=True)
        documents=[];excluded=[];total=0;extracted_total=0;self._revision='';code={}
        iterator=self._azure(s) if s['kind'].startswith('azure') else self._graph(s) if s['kind']=='sharepoint-graph' else self._local(s)
        for index,(name,raw,origin) in enumerate(iterator):
            if Path(name).name.lower() in PRIVATE_CONFIG:
                excluded.append({'path':name,'reason':'archivio credenziali escluso'});continue
            if index>=MAX_FILES:raise ValueError('Fonte oltre 1000 file; restringi la cartella o il repository')
            if raw is None:excluded.append({'path':name,'reason':origin['reason']});continue
            total+=len(raw)
            if total>MAX_TOTAL:raise ValueError('Fonte oltre 100 MB; restringi il perimetro')
            try:
                if Path(name).suffix.lower() not in TEXT|{'.pdf','.docx'} and Path(name).name.lower() not in ('dockerfile','makefile'):raise ValueError('Formato non supportato')
                extraction=cached_extract(name,raw,self.root.parent/'graphs'/'document-cache.sqlite')
                text,truncated=extraction['text'],extraction['truncated']
            except (ValueError,KeyError,UnicodeError,zipfile.BadZipFile,ElementTree.ParseError) as e:
                excluded.append({'path':name,'reason':str(e)[:200],'sha256':sha(raw)});continue
            extracted_total+=len(text.encode('utf-8'))
            if extracted_total>MAX_TOTAL:raise ValueError('Testo estratto oltre 100 MB per fonte; restringi il perimetro')
            docid=sha(name.encode())[:20];(folder/(docid+'.txt')).write_text(text,encoding='utf-8')
            # Write exact text bytes: Windows newline conversion would break content hashes.
            (folder/(docid+'.txt')).write_bytes(text.encode('utf-8'))
            (folder/'originals').mkdir(exist_ok=True);(folder/'originals'/(docid+'.bin')).write_bytes(raw)
            mapping={k:v for k,v in extraction.items() if k not in ('text','cacheReused')}
            write(folder/(docid+'.map.json'),mapping)
            documents.append({'id':docid,'path':name,'sha256':sha(raw),'textSha256':sha(text.encode()),'truncated':truncated,
                              'original':'originals/'+docid+'.bin','mapSha256':sha((folder/(docid+'.map.json')).read_bytes()),
                              'extractionCacheReused':extraction['cacheReused'],**origin})
            if Path(name).suffix.lower() in ('.py','.js','.jsx','.ts','.tsx','.mjs','.cjs'):
                code_name=docid+Path(name).suffix.lower();code[code_name]={'path':name,'document':docid}
                (folder/'code').mkdir(exist_ok=True);(folder/'code'/code_name).write_text(text,encoding='utf-8')
        manifest={'id':snapshot,'source':sid,'name':s['name'],'kind':s['kind'],'createdAt':stamp(),'revision':self._revision,
                  'documents':documents,'excluded':excluded,'limits':{'maxFiles':MAX_FILES,'maxBytes':MAX_TOTAL,'maxExtractedBytes':MAX_TOTAL,'maxTextCharacters':5_000_000}}
        manifest['contentFingerprint']=sha(json.dumps({'revision':self._revision,'documents':[(d['path'],d['sha256'],d['textSha256'],d['truncated']) for d in documents],'excluded':excluded},sort_keys=True).encode())
        if code:
            from suite_graph import build_graph
            graph=build_graph(folder/'code',self.root.parent/'graphs'/'cache.sqlite',list(code),base=self._revision)
            for node in graph['nodes']:
                origin=code[node['source_file']];node.update(source_file=origin['path'],document=origin['document'],citation=f'[{sid}:{origin["document"]}]')
            for edge in graph['edges']:
                if edge.get('source_file') in code:edge['source_file']=code[edge['source_file']]['path']
            write(folder/'graph.json',graph);manifest['graph']=graph['stats']
        write(folder/'manifest.json',manifest)
        ensure_index(folder,manifest)
        write(self.root/sid/'current.json',{'snapshot':snapshot})
        return manifest
    def bundle(self,ids,snapshots=None):
        connections={s['id']:s for s in self.connections()};result=[]
        for sid in ids:
            if sid not in connections:raise ValueError('Seleziona fonti esistenti')
            pointer=self.root/sid/'current.json'
            if not pointer.exists():raise ValueError('Sincronizza prima tutte le fonti selezionate')
            snapshot=(snapshots or {}).get(sid) or json.loads(pointer.read_text())['snapshot'];folder=self.root/sid/snapshot
            manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
            result.append({'source':sid,'snapshot':snapshot,'name':manifest['name'],'directory':str(folder),'manifest':manifest})
        if not result:raise ValueError('Seleziona almeno una fonte sincronizzata')
        if not any(s['manifest']['documents'] for s in result):raise ValueError('Le fonti selezionate non contengono testo utilizzabile: controlla le esclusioni')
        return result
    def automatic_asis(self,ids,objective='',progress=None):
        ids=list(dict.fromkeys(ids))
        known={s['id'] for s in self.connections()}
        if not ids or any(sid not in known for sid in ids):raise ValueError('Seleziona almeno una fonte configurata valida')
        snapshots={}
        for sid in ids:
            if progress:progress('Sincronizzazione fonte '+sid)
            snapshots[sid]=self.sync(sid)['id']
        if progress:progress('Preparazione incarico e dossier')
        return self.prepare_asis(ids,objective,snapshots)
    def prepare_asis(self,ids,objective,snapshots=None,document_graph=None):
        bundle=self.bundle(ids,snapshots)
        bundle.sort(key=lambda item:not any(Path(doc['path']).suffix.lower() not in CODE_EXTENSIONS for doc in item['manifest']['documents']))
        # Every entry point must finish graph/index validation BEFORE creating a ready dossier.
        for item in bundle:
            info=ensure_index(item['directory'],item['manifest']);item['indexVersion']=info['fingerprint']
            if document_graph:item['documentGraph']=document_graph
        rid=uuid.uuid4().hex;workspace=self.root.parent/'documentation'/rid;workspace.mkdir(parents=True)
        write(workspace/'FONTI.json',bundle)
        if document_graph:write(workspace/'GRAFO-DOCUMENTALE.json',document_graph)
        brief='# Incarico AS-IS e documentazione\n\n## Obiettivo\n'+str(objective or 'Ricostruisci lo stato attuale del sistema dalle fonti collegate.')+'\n\n## Fonti congelate\n'
        for s in bundle:
            m=s['manifest'];brief+=f'- {s["name"]}: snapshot {s["snapshot"]}, data {m["createdAt"]}, commit {m["revision"] or "non disponibile"}, {len(m["documents"])} documenti, {len(m["excluded"])} esclusi.\n'
        brief+='\n## Consegne\nCrea AS-IS.md, ARCHITETTURA.md, FLUSSI-E-INTERFACCE.md, OPERATIVITA.md, LACUNE-E-DOMANDE.md e MATRICE-FONTI.md. I grafi e gli indici sono stati verificati per questi snapshot. Per creare l’AS-IS parti dal grafo documentale semantico salvato: consulta document_graph, poi usa knowledge_search e knowledge_trace per ricostruire sezioni, requisiti, processi e riferimenti, quindi leggi le evidenze originali con read_evidence. Solo dopo consulta il grafo del codice con connected_graph o graph_query per confrontare l’implementazione e rilevare differenze o lacune. Trasmetti questa priorità anche negli incarichi dei subagenti. Se il corpus contiene solo codice, dichiarane l’assenza di documentazione e procedi con le evidenze disponibili. La vicinanza nel grafo non prova il significato delle relazioni e non sostituisce le citazioni degli originali. Leggi soprattutto documenti e codice ORIGINALI con read_evidence (mode full, section o passage), anche integralmente quando utile; rispetta nextOffset e segnala parti non lette o escluse. Puoi anche usare connected_sources e read_connected_source. Cita ogni affermazione sostanziale con [sourceId:documentId] e, per il codice, percorsi e simboli/righe. Distingui stato attuale, ipotesi e TO-BE; segnala contraddizioni fra documenti e codice senza risolverle per supposizione. Documenta esclusioni e testi troncati. Se è selezionato un modello Subagenti, delega sempre il lavoro operativo con incarichi Markdown precisi; altrimenti svolgilo direttamente; confronta le consegne prima di comporre il dossier. Non presentare questo brief come AS-IS gia completato. Alla fine usa register_asis per validare le citazioni e salvare una versione consultabile, senza attribuirle approvazione umana o verifica semantica automatica.\n'
        (workspace/'INCARICO-AS-IS.md').write_text(brief,encoding='utf-8')
        return {'id':rid,'workspace':str(workspace),'sources':bundle,'documentGraph':document_graph,'prompt':'Leggi INCARICO-AS-IS.md e FONTI.json. Consulta prima il grafo documentale semantico salvato con document_graph e leggi i documenti originali, poi confronta il grafo del codice. Usa la skill as-is-documentation e le fonti collegate per produrre il dossier richiesto, delegando quando utile con incarichi Markdown precisi.','state':'ready_for_orchestrator'}

    def index_sources(self,ids):
        return [{'source':r['source'],'snapshot':r['snapshot'],**ensure_index(r['directory'],r['manifest'])} for r in self.bundle(ids)]

    def knowledge_bundle(self,ids):
        refs=self.bundle(ids)
        for item in refs:
            index=Path(item['directory'])/'evidence.json'
            if index.exists():item['indexVersion']=json.loads(index.read_text(encoding='utf-8'))['fingerprint']
            item['freshness']='pinned'
        for registered in self.asis_registry():
            if not registered['dependencies'] or not all(any(r['source']==d['source'] for r in refs) for d in registered['dependencies']):continue
            folder=self.root/registered['source']/registered['snapshot'];manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
            index=folder/'evidence.json'
            refs.append({'source':registered['source'],'snapshot':registered['snapshot'],'name':manifest['name'],'directory':str(folder),'manifest':manifest,
                         'indexVersion':json.loads(index.read_text(encoding='utf-8'))['fingerprint'] if index.exists() else None,
                         'freshness':'current_for_selection' if all(any(r['source']==d['source'] and (r['snapshot']==d['snapshot'] or d.get('contentFingerprint') and r['manifest'].get('contentFingerprint')==d['contentFingerprint']) for r in refs) for d in registered['dependencies']) else 'needs_revalidation'})
        return refs

    def register_asis(self,workspace):
        workspace=Path(workspace).resolve();allowed=(self.root.parent/'documentation').resolve()
        if not workspace.is_relative_to(allowed) or workspace==allowed:raise ValueError('Registra soltanto un dossier preparato dalla suite')
        refs=json.loads((workspace/'FONTI.json').read_text(encoding='utf-8'))
        graph_refs={json.dumps(r['documentGraph'],sort_keys=True) for r in refs if r.get('documentGraph')}
        document_graphs=[]
        if graph_refs:
            from suite_document_graph import load_graph
            for value in sorted(graph_refs):
                ref=json.loads(value);graph=load_graph(self.root.parent,ref,refs)
                document_graphs.append({'project':ref['project'],'version':ref['version'],'semanticFingerprint':graph['semanticFingerprint']})
        names=('AS-IS.md','ARCHITETTURA.md','FLUSSI-E-INTERFACCE.md','OPERATIVITA.md','LACUNE-E-DOMANDE.md','MATRICE-FONTI.md')
        files=[workspace/name for name in names if (workspace/name).is_file()]
        if not files or not (workspace/'AS-IS.md').is_file():raise ValueError('AS-IS.md non ancora prodotto')
        texts=[];checks=[]
        for file in files:
            if file.is_symlink() or file.stat().st_size>MAX_FILE:raise ValueError('Documento derivato non valido')
            text=file.read_bytes().decode('utf-8');checks.append(validate_citations(refs,text));texts.append((file.name,text))
        if not sum(c['citations'] for c in checks):raise ValueError('Nessuna citazione verificabile nel dossier')
        fingerprint=sha(json.dumps({'files':texts,'refs':[(r['source'],r['snapshot'],r.get('indexVersion')) for r in refs],'documentGraphs':document_graphs},sort_keys=True).encode())
        sid=sha(str(workspace).encode())[:32];snapshot=fingerprint[:32];folder=self.root/sid/snapshot
        if not (folder/'manifest.json').exists():
            folder.mkdir(parents=True,exist_ok=True);(folder/'originals').mkdir(exist_ok=True);documents=[]
            for name,text in texts:
                docid=sha(name.encode())[:20];raw=text.encode();extraction=extract_document(name,raw)
                (folder/(docid+'.txt')).write_bytes(raw);(folder/'originals'/(docid+'.bin')).write_bytes(raw)
                write(folder/(docid+'.map.json'),{k:v for k,v in extraction.items() if k!='text'})
                documents.append({'id':docid,'path':name,'sha256':sha(raw),'textSha256':sha(raw),'truncated':False,
                                  'original':'originals/'+docid+'.bin','mapSha256':sha((folder/(docid+'.map.json')).read_bytes())})
            manifest={'id':snapshot,'source':sid,'name':'AS-IS '+workspace.name,'kind':'asis','createdAt':stamp(),'revision':fingerprint,
                      'documents':documents,'excluded':[],'limits':{'semanticValidation':False},
                      'dependencies':[{'source':r['source'],'snapshot':r['snapshot'],'contentFingerprint':r['manifest'].get('contentFingerprint')} for r in refs if r['manifest'].get('kind')!='asis'],
                      'citationValidation':checks,'reviewStatus':'unreviewed','documentGraphs':document_graphs}
            write(folder/'manifest.json',manifest)
        info=ensure_index(folder)
        write(self.root/sid/'current.json',{'snapshot':snapshot})
        registry_path=self.root/'asis-registry.json';registry=json.loads(registry_path.read_text(encoding='utf-8')) if registry_path.exists() else []
        registry=[r for r in registry if r['source']!=sid]+[{'source':sid,'snapshot':snapshot,'workspace':str(workspace),'dependencies':load_dependencies(folder),'documentGraphs':document_graphs,'registeredAt':stamp()}]
        write(registry_path,registry)
        return {'source':sid,'snapshot':snapshot,'indexVersion':info['fingerprint'],'documents':len(files),'reviewStatus':'unreviewed','validation':'Citazioni e integrita, non approvazione semantica'}

    def asis_registry(self):
        file=self.root/'asis-registry.json';registry=json.loads(file.read_text(encoding='utf-8')) if file.exists() else []
        for item in registry:
            item['freshness']='current'
            if item.get('documentGraphs'):
                from suite_document_graph import current_ref
                for ref in item['documentGraphs']:
                    current=current_ref(self.root.parent,ref['project'])
                    if not current or current.get('semanticFingerprint')!=ref.get('semanticFingerprint'):item['freshness']='needs_revalidation'
            for dep in item['dependencies']:
                pointer=self.root/dep['source']/'current.json'
                if not pointer.exists():item['freshness']='needs_revalidation';continue
                current=json.loads(pointer.read_text(encoding='utf-8'))['snapshot']
                manifest=json.loads((self.root/dep['source']/current/'manifest.json').read_text(encoding='utf-8'))
                if current!=dep['snapshot'] and not (dep.get('contentFingerprint') and manifest.get('contentFingerprint')==dep['contentFingerprint']):item['freshness']='needs_revalidation'
        return registry


def load_dependencies(folder):
    return json.loads((folder/'manifest.json').read_text(encoding='utf-8')).get('dependencies',[])
