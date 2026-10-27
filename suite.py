"""Pi Suite: authenticated loopback control panel and Pi chat launcher."""
from __future__ import annotations
import argparse
import base64
import ctypes
import hmac
import http.server
import json
import os
import re
import secrets
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import uuid
import webbrowser
from pathlib import Path
from suite_sources import Sources
from suite_benchmarks import Benchmarks
from suite_graph import build_graph, project_files, scan, fingerprint, query_graph
import suite_byok as byok
import suite_workspace as workspace

ROOT = Path(__file__).resolve().parent
APIS = ('openai-completions','openai-responses','anthropic-messages','google-generative-ai')
OPERATIONS = ('graph','probe','sync-source','prepare-asis','auto-asis','index-sources','register-asis')

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def save_json(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name('.' + uuid.uuid4().hex[:8] + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    for attempt in range(5):
        try:
            temporary.replace(path)
            break
        except PermissionError:
            if attempt == 4: raise
            time.sleep(.05 * (attempt + 1))

def checked_relative(value):
    path = Path(value)
    if not value or path.anchor or ':' in value or '\\' in value or any(part in ('.', '..') or part.startswith('.') for part in path.parts):
        raise ValueError('Percorso fuori perimetro: ' + value)
    return path

def protect(text, decrypt=False):
    """Windows DPAPI, current user; credentials are never serialized as plaintext."""
    if os.name != 'nt':
        raise ValueError('Il salvataggio chiavi richiede Windows; usare variabili ambiente su altri sistemi.')
    from ctypes import wintypes
    class Blob(ctypes.Structure):
        _fields_=[('cbData',wintypes.DWORD),('pbData',ctypes.POINTER(ctypes.c_ubyte))]
    raw=base64.b64decode(text) if decrypt else text.encode('utf-8')
    buf=(ctypes.c_ubyte*len(raw)).from_buffer_copy(raw)
    source=Blob(len(raw),buf); output=Blob()
    library=ctypes.WinDLL('crypt32',use_last_error=True)
    fn=library.CryptUnprotectData if decrypt else library.CryptProtectData
    fn.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
    fn.restype=wintypes.BOOL
    if not fn(ctypes.byref(source),None,None,None,None,1,ctypes.byref(output)):
        raise ctypes.WinError(ctypes.get_last_error())
    try: result=ctypes.string_at(output.pbData,output.cbData)
    finally:
        free=ctypes.WinDLL('kernel32').LocalFree
        free.argtypes=[ctypes.c_void_p]; free.restype=ctypes.c_void_p
        free(output.pbData)
    return result.decode('utf-8') if decrypt else base64.b64encode(result).decode('ascii')

def key_env(provider):
    return 'PI_SUITE_KEY_'+re.sub('[^A-Z0-9]','_',provider.upper())

def checked_id(value):
    if not isinstance(value,str) or not re.fullmatch('[a-zA-Z0-9_-]{1,100}',value):
        raise ValueError('Identificatore non valido')
    return value

def project_name(value):
    if not isinstance(value,str): raise ValueError('Inserisci un nome progetto valido.')
    name=value.strip()
    if not name or len(name)>150 or name in ('.','..') or name.endswith('.') or re.search(r'[<>:"/\\|?*\x00-\x1f]',name):
        raise ValueError('Inserisci un nome progetto senza caratteri riservati ai percorsi.')
    if re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\..*)?',name,re.I):
        raise ValueError('Questo nome è riservato da Windows.')
    return name

def choose_project_folder():
    if os.name!='nt': raise ValueError('La selezione della cartella richiede Windows.')
    # Fixed script: no user-provided values are evaluated as PowerShell.
    script=r'''$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner=New-Object System.Windows.Forms.Form
$owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Opacity=0
$picker=New-Object System.Windows.Forms.FolderBrowserDialog
$picker.Description='Scegli la cartella del progetto'
$picker.ShowNewFolderButton=$true
if ($picker.PSObject.Properties['UseDescriptionForTitle']) {$picker.UseDescriptionForTitle=$true}
try {
    $owner.Show(); $owner.Activate()
    if ($picker.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
        [Console]::Write($picker.SelectedPath)
    }
} finally {$picker.Dispose(); $owner.Dispose()}
'''
    result=subprocess.run(['powershell.exe','-NoProfile','-STA','-WindowStyle','Hidden','-Command',script],
                          capture_output=True,timeout=300,creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode: raise ValueError('Impossibile aprire il selettore cartelle di Windows.')
    return result.stdout.decode('utf-8-sig').strip()

def skills(extra=None):
    result=[]
    paths=list((ROOT/'skills').glob('*/SKILL.md'))
    if extra: paths+=list(Path(extra).glob('*/SKILL.md'))
    for p in sorted(paths):
        content=p.read_text(encoding='utf-8')
        description=re.search(r'^description: (.+)$',content,re.M)
        result.append({'name':p.parent.name,'description':description.group(1) if description else p.parent.name,'content':content})
    upstream=ROOT/'node_modules'/'pi-subagents'/'skills'/'pi-subagents'/'SKILL.md'
    if upstream.exists():
        result.append({'name':'pi-subagents','description':'Guida ufficiale alla delega dalla chat Pi; la suite applica gli incarichi Markdown tramite delegate_tasks.',
                       'content':upstream.read_text(encoding='utf-8'),'parentOnly':True})
    return result

class Suite:
    def __init__(self,home):
        self.home=Path(home).resolve(); self.home.mkdir(parents=True,exist_ok=True)
        self.cache=self.home/'graphs'/'cache.sqlite'
        self.settings_path=self.home/'settings.json'
        self.sources=Sources(self.home,protect)
        self.benchmarks=Benchmarks(self.home)
        self.guard=threading.RLock(); self.picker_guard=threading.Lock(); self.busy=False; self.catalog=None
        self.job={'state':'idle'}
        self.settings=read_json(self.settings_path) if self.settings_path.exists() else {
            'providers':[],'roles':{},'enabledSkills':[s['name'] for s in skills()],
            'maxCalls':24,'maxParallelWorkers':2,'projects':[]}
        # Add the new bundled parent skill once, preserving later user opt-outs.
        if self.settings.get('suiteSchema',0)<2:
            if 'pi-subagents' not in self.settings['enabledSkills']:
                self.settings['enabledSkills'].append('pi-subagents')
            self.settings['suiteSchema']=2
        previous=self.home/'last-job.json'
        if self.settings.get('suiteSchema',0)<3:
            if 'as-is-documentation' not in self.settings['enabledSkills']:self.settings['enabledSkills'].append('as-is-documentation')
            self.settings['suiteSchema']=3
        self.byok=byok.Store(self.home,protect)
        self.settings.update(self.byok.load_or_migrate(self.settings))
        save_json(self.settings_path,self.settings)
        self.builtin_catalog=None
        if previous.exists():
            previous_job=read_json(previous)
            if previous_job.get('operation') in OPERATIONS: self.job=previous_job
            if self.job.get('state')=='running':
                self.job.update(state='interrupted',error='Il pannello è stato riavviato. Controlla il risultato prima di ripetere l’operazione.')

    def public_settings(self):
        result=json.loads(json.dumps(self.settings))
        for p in result['providers']:
            p.pop('encryptedKey',None)
            p['hasKey']=self.byok.has_key(p)
        result['byokRevision']=self.byok.revision()
        result['dataDirectory']=str(self.home)
        result['modelChecks']=read_json(self.home/'model-checks.json') if (self.home/'model-checks.json').exists() else {}
        for check in result['modelChecks'].values():
            try:check['current']=check['fingerprint']==self.check_fingerprint(check['provider'],check['model'])
            except (StopIteration,KeyError):check['current']=False
        result['skills']=[{k:v for k,v in s.items() if k!='content'} for s in skills(self.home/'skills')]
        return result

    def import_skill(self,content):
        with self.guard:
            if self.busy: raise ValueError('Attendi la fine del task prima di importare una skill.')
            if not isinstance(content,str) or len(content)>50000 or not content.startswith('---'):
                raise ValueError('Carica un SKILL.md con frontmatter name e description, massimo 50.000 caratteri.')
            name=re.search(r'^name:\s*([a-z][a-z0-9-]{0,63})\s*$',content,re.M)
            description=re.search(r'^description:\s*(.+)$',content,re.M)
            if not name or not description: raise ValueError('La skill richiede name (minuscolo e trattini) e description su una riga.')
            name=name.group(1)
            if any(s['name']==name for s in skills(self.home/'skills')): raise ValueError('Una skill con questo nome è già presente.')
            target=self.home/'skills'/name/'SKILL.md'; target.parent.mkdir(parents=True)
            target.write_text(content,encoding='utf-8')
            self.settings['enabledSkills'].append(name);save_json(self.settings_path,self.settings)
            return self.public_settings()

    def secret_environment(self,settings=None):
        env=os.environ.copy()
        current=settings or self.settings
        used={p['provider'] for p in current.get('roles',{}).values()}
        # Remove known provider variables before passing a minimal session credential set.
        for name in list(env):
            if name.startswith('PI_SUITE_KEY_') or name.endswith(('_API_KEY','_API_TOKEN')):
                env.pop(name,None)
        for p in current['providers']:
            if used and p['id'] not in used:continue
            if self.byok.has_key(p) or p['auth']['type']=='none':env[key_env(p['id'])]=self.byok.secret(p)
            elif used:raise ValueError('Credenziale assente per la connessione '+p['id'])
        env.update(PI_OFFLINE='1',PI_TELEMETRY='0')
        env['NODE_OPTIONS']=(env.get('NODE_OPTIONS','')+' --import='+(ROOT/'byok-network.mjs').as_uri()).strip()
        return env

    def redact(self,text):
        for source in self.sources.connections():
            if source.get('secret'):
                value=protect(source['secret'],True)
                if value:text=text.replace(value,'[REDACTED]')
        for p in self.settings['providers']:
            try:value=self.byok.secret(p) if self.byok.has_key(p) else None
            except (OSError,ValueError):value=None
            if value: text=text.replace(value,'[REDACTED]')
        return text

    def _builtin_models(self):
        if self.builtin_catalog is None:
            directory=self.home/'catalog';directory.mkdir(exist_ok=True)
            save_json(directory/'builtin.json',{'list':True,'builtin':True,'agentDir':str(directory)})
            r=subprocess.run(['node',str(ROOT/'adapter.mjs'),str(directory/'builtin.json')],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=60)
            if r.returncode:raise ValueError('Catalogo Pi non disponibile')
            self.builtin_catalog=json.loads(r.stdout)
        return self.builtin_catalog

    def _runtime_providers(self,settings):
        result={}
        for p in settings['providers']:
            item={'apiKey':'${'+key_env(p['id'])+'}'}
            models=p.get('models',[])
            if p.get('custom'):
                item.update(baseUrl=p['baseUrl'],api=p['api'])
                if p['api']=='openai-completions':
                    models=[dict(model) for model in models]
                    for model in models:
                        levels=model.get('reasoningLevels',[])
                        if model.get('reasoning') and levels:
                            model['thinkingLevelMap']={level:level if level in levels else None for level in byok.EFFORTS if level!='off'}
                            model['thinkingLevelMap']['max']=None
                            if 'off' in levels:model['thinkingLevelMap']['off']='none'
            elif p.get('providerType',p['id'])!=p['id'] or models:
                base=[m for m in self._builtin_models() if m['provider']==p['providerType'] and m['api'] in APIS]
                if not base:raise ValueError('Connessione aggiuntiva non supportata per questo provider nativo')
                if models:
                    ids={m['id'] for m in models};base=[m for m in base if m['model'] in ids]
                    if ids!={m['model'] for m in base}:raise ValueError('Modello nativo non presente nel catalogo: usa un endpoint personalizzato')
                models=[{**m['definition'],**next((x for x in models if x['id']==m['model']),{})} for m in base]
            if models:
                item['models']=[{k:v for k,v in m.items() if k in ('id','name','api','baseUrl','reasoning','input','contextWindow','maxTokens','cost','compat','thinkingLevelMap')} for m in models]
            a=p['auth']
            if a.get('header') or a['type']=='none':
                item['authHeader']=False
                names={'authorization':'Authorization','api-key':'api-key','x-api-key':'x-api-key','x-goog-api-key':'x-goog-api-key'}
                header=names.get(a.get('header','').lower())
                item['headers']={v:'__PI_SUITE_OMIT_HEADER__' for v in names.values() if v!=header}
                if header:item['headers'][header]=a.get('prefix','')+'${'+key_env(p['id'])+'}'
            result[p['id']]=item
        return result

    def _commit_byok(self,config,updates=()):
        config=byok.validate(config);converted=byok.to_legacy(config)
        directory=self.home/'catalog'/'validation';directory.mkdir(parents=True,exist_ok=True)
        save_json(directory/'models.json',{'providers':self._runtime_providers(converted)})
        save_json(directory/'job.json',{'validate':True,'agentDir':str(directory)})
        r=subprocess.run(['node',str(ROOT/'adapter.mjs'),str(directory/'job.json')],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=60)
        if r.returncode:raise ValueError('Configurazione non accettata dal runtime Pi; nessuna modifica applicata')
        self.settings.update(self.byok.save(config,updates))
        save_json(self.settings_path,self.settings);self.catalog=None
        return self.public_settings()

    def import_byok(self,data,apply=False):
        with self.guard:
            if self.busy:raise ValueError('Attendi il completamento del lavoro in corso')
            preview=self.byok.preview(data['content'],data.get('format','json'),data.get('includeProfiles',False))
            if not apply:return preview
            if data.get('revision')!=self.byok.revision():raise ValueError('Configurazione cambiata: ripeti l’anteprima')
            updates=[]
            if data.get('apiKey'):
                targets=[c for c in preview['changes'] if c['auth']['type']=='secret']
                if len(targets)!=1:raise ValueError('Il campo chiave richiede una sola connessione con autenticazione secret; per più connessioni usa le singole schede')
                updates=[{'id':targets[0]['id'],'apiKey':data['apiKey']}]
            return self._commit_byok(preview['config'],updates)

    def save_secret(self,data):
        with self.guard:
            if self.busy:raise ValueError('Attendi il completamento del lavoro in corso')
            config=self.byok.config();c=next((c for c in config['connections'] if c['id']==data['connectionId']),None)
            if c is None:raise ValueError('Salva prima la connessione')
            c['auth']={'type':'secret','ref':'byok/'+c['id'],**{k:v for k,v in c['auth'].items() if k in ('ref','header','prefix')}}
            return self._commit_byok(config,[{'id':c['id'],'apiKey':data.get('value',''),'clearKey':data.get('remove',False)}])

    def save_connection(self,data):
        with self.guard:
            if self.busy:raise ValueError('Attendi il completamento del lavoro in corso')
            current=self.byok.config()
            if data.get('revision')!=self.byok.revision():raise ValueError('Configurazione cambiata: selezionala di nuovo prima di salvare')
            notices=[]
            incoming=byok.parse(data.get('content',''),'json')
            if len(incoming['connections'])!=1:raise ValueError('Inserisci una sola connessione per configurazione')
            connection=incoming['connections'][0]
            selected=data.get('connectionId','')
            previous=next((c for c in current['connections'] if c['id']==selected),None)
            if selected and previous is None:raise ValueError('Configurazione non disponibile')
            if previous:
                connection['id']=previous['id']
                if connection['auth']['type']=='secret' and previous['auth']['type']=='secret':
                    connection['auth']['ref']=previous['auth']['ref']
            elif any(c['id']==connection['id'] for c in current['connections']):
                raise ValueError('Configurazione gia presente: selezionala dalla lista per modificarla')
            key=data.get('apiKey','')
            if key and connection['auth']['type']=='none':connection['auth']={'type':'secret','ref':'byok/'+connection['id']}
            if key and connection['auth']['type']!='secret':raise ValueError('Per inserire una chiave usa autenticazione secret nel JSON')
            config={**current,'connections':[connection if c['id']==selected else c for c in current['connections']]}
            if not previous:config['connections'].append(connection)
            result=self._commit_byok(config,[{'id':connection['id'],'apiKey':key}])
            if connection.get('baseUrl','').startswith('http://'):
                notices.append('Endpoint HTTP: richieste e chiave API viaggiano in chiaro; usa solo una rete fidata o un tunnel cifrato.')
            if connection['auth']['type']=='secret' and not self.byok.has_key(connection):
                notices.append('Chiave API mancante: inseriscila nel campo protetto della Suite.')
            return {**result,'connectionNotices':notices}

    def save_settings(self,data):
        with self.guard:
            if self.busy:raise ValueError('Attendi il completamento dell’operazione in corso.')
            old={p['id']:p for p in self.settings['providers']}
            providers=[]
            for raw in data.get('providers',[]):
                p=dict(raw);previous=old.get(p['id'],{})
                p.setdefault('auth',previous.get('auth',{'type':'secret','ref':'byok/'+p['id']}))
                if p.get('apiKey'):p['auth']={'type':'secret','ref':'byok/'+p['id'],**{k:v for k,v in p['auth'].items() if k in ('ref','header','prefix')}}
                if p.get('custom') and not previous and not p.get('apiKey') and 'auth' not in raw:
                    p['auth']={'type':'none'}
                providers.append(p)
            config=byok.from_legacy({'providers':providers,'roles':data.get('roles',{})})
            # Older clients adapted unsupported reasoning automatically; retain that migration behavior.
            for profile in config['profiles'].values():
                connection=next((c for c in config['connections'] if c['id']==profile['connectionId']),None)
                model=next((m for m in connection['models'] if m['id']==profile['modelId']),None) if connection else None
                if model and not model['reasoning']['enabled']:profile['effort']='off'
            previous=dict(self.settings)
            available={s['name'] for s in skills(self.home/'skills')}
            self.settings={**self.settings,'enabledSkills':[s for s in data.get('enabledSkills',[]) if s in available],
                'maxCalls':max(4,min(int(data.get('maxCalls',24)),100)),
                'maxParallelWorkers':max(1,min(int(data.get('maxParallelWorkers',2)),4))}
            try:return self._commit_byok(config,providers)
            except Exception:
                self.settings=previous;raise

    def model_dir(self,directory,settings=None):
        directory.mkdir(parents=True,exist_ok=True)
        save_json(directory/'models.json',{'providers':self._runtime_providers(settings or self.settings)})
        return directory

    def models(self):
        with self.guard:
            if self.catalog is not None: return self.catalog
            directory=self.model_dir(self.home/'catalog')
            save_json(directory/'job.json',{'list':True,'agentDir':str(directory)})
            result=subprocess.run(['node',str(ROOT/'adapter.mjs'),str(directory/'job.json')],cwd=ROOT,
                capture_output=True,text=True,encoding='utf-8',timeout=60)
            if result.returncode: raise ValueError(self.redact(result.stderr[-2000:]))
            self.catalog=json.loads(result.stdout)
            for m in self.catalog:
                p=next((p for p in self.settings['providers'] if p['id']==m['provider']),None)
                definition=next((x for x in (p or {}).get('models',[]) if x['id']==m['model']),{})
                m.update(toolCalling=definition.get('toolCalling'),streaming=definition.get('streaming',True),
                    reasoningLevels=definition.get('reasoningLevels',list(byok.EFFORTS) if m['reasoning'] else []),
                    defaultEffort=definition.get('defaultEffort','off'))
            return self.catalog

    def check_fingerprint(self,provider,model):
        p=next(p for p in self.settings['providers'] if p['id']==provider)
        return byok.digest({'connection':p,'model':model,'credential':self.byok.vault.get(p['auth'].get('ref')) if p['auth']['type']=='secret' else byok.digest(os.environ.get(p['auth'].get('name',''),''))})

    def record_check(self,provider,model,report):
        if not any(p['id']==provider for p in self.settings['providers']):return
        path=self.home/'model-checks.json';checks=read_json(path) if path.exists() else {}
        checks[byok.digest([provider,model])]={'provider':provider,'model':model,'checkedAt':time.time(),
            'fingerprint':self.check_fingerprint(provider,model),**report}
        save_json(path,checks)

    def validate_profiles(self):
        if not self.settings['roles']:return
        catalog={(m['provider'],m['model']) for m in self.models()}
        for profile in self.settings['roles'].values():
            if (profile['provider'],profile['model']) not in catalog: raise ValueError('Modello non presente nel catalogo: '+profile['model'])

    def prepare_shell(self,snapshot=False):
        directory=self.model_dir(self.home/'sessions'/uuid.uuid4().hex if snapshot else self.home/'pi-shell')
        profile=self.settings['roles'].get('worker')
        config={'worker':profile,'byokRevision':self.byok.revision(),'projects':self.settings['projects'],'maxCalls':self.settings['maxCalls'],
                'maxParallelWorkers':self.settings['maxParallelWorkers'],
                'skills':[s for s in skills(self.home/'skills') if s['name'] in self.settings['enabledSkills'] and not s.get('parentOnly')]}
        save_json(directory/'suite-launch.json',config)
        settings_path=directory/'settings.json'
        settings=read_json(settings_path) if settings_path.exists() else {}
        if profile:
            settings['subagents']={**settings.get('subagents',{}),'defaultModel':profile['provider']+'/'+profile['model'],
                                   'defaultThinking':profile['effort']}
        else:
            settings.pop('subagents',None)
        save_json(settings_path,settings)
        return directory

    def open_chat(self,path='',prompt='',project_id=None):
        selected=None
        if project_id:
            checked_id(project_id)
            selected=next((p for p in self.settings['projects'] if p['id']==project_id),None)
            if not selected: raise ValueError('Progetto sconosciuto')
        if selected: path=selected['path']
        folder=Path(path).expanduser().resolve() if path else self.home/'workspace'
        if not path: folder.mkdir(exist_ok=True)
        if not folder.is_dir(): raise ValueError('Scegli una cartella esistente per la chat.')
        env=os.environ.copy();env['PI_SUITE_HOME']=str(self.home)
        if selected: env['PI_SUITE_PROJECT']=selected['id']
        else: env.pop('PI_SUITE_PROJECT',None)
        python=Path(sys.executable).with_name('python.exe') if os.name=='nt' else Path(sys.executable)
        subprocess.Popen([str(python),str(ROOT/'suite_cli.py'),*([prompt] if prompt else [])],cwd=folder,env=env,
                         creationflags=subprocess.CREATE_NEW_CONSOLE if os.name=='nt' else 0)
        return {'opened':True,'folder':str(folder),'project':selected['id'] if selected else None}

    def delegations(self):
        batches=[]
        for p in sorted((self.home/'delegations').glob('*/batch.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:30]:
            try:
                item=read_json(p)
                for task in item['tasks']:
                    assignment=p.parent/Path(task['directory']).name/'INCARICO.md'
                    task['assignment']=assignment.read_text(encoding='utf-8') if assignment.exists() else ''
                batches.append(item)
            except (OSError,ValueError,KeyError): continue
        return batches

    def pick_project_folder(self):
        if not self.picker_guard.acquire(blocking=False): raise ValueError('Il selettore cartelle è già aperto.')
        try: return {'path':choose_project_folder()}
        finally: self.picker_guard.release()

    def add_project(self,path='',name=''):
        with self.guard:
            if self.busy: raise ValueError('Attendi l’operazione in corso.')
            if not isinstance(path,str): raise ValueError('Cartella progetto non valida.')
            name=project_name(name) if name else ''
            if path.strip():
                repo=Path(path).expanduser().resolve()
                if not repo.is_dir(): raise ValueError('Scegli una cartella esistente.')
            else:
                name=project_name(name)
                parent=self.home/'projects';parent.mkdir(exist_ok=True)
                repo=(parent/name).resolve()
                if repo.parent!=parent.resolve(): raise ValueError('Nome progetto non valido.')
                if repo.exists(): raise ValueError('Esiste già una cartella con questo nome. Scegli un altro nome o collega la cartella esistente.')
                repo.mkdir()
            pid=__import__('hashlib').sha256(str(repo).encode()).hexdigest()[:16]
            if not any(p['id']==pid for p in self.settings['projects']):
                self.settings['projects'].append({'id':pid,'path':str(repo),'name':name or repo.name})
                save_json(self.settings_path,self.settings)
            return self.project(pid)

    def project(self,pid):
        checked_id(pid)
        project=next((p for p in self.settings['projects'] if p['id']==pid),None)
        if not project: raise ValueError('Progetto sconosciuto')
        repo=Path(project['path'])
        if not repo.is_dir(): raise ValueError('La cartella del progetto non è disponibile.')
        top=subprocess.run(['git','-C',str(repo),'rev-parse','--show-toplevel'],capture_output=True)
        is_git=top.returncode==0 and Path(os.fsdecode(top.stdout).strip()).resolve()==repo.resolve()
        names=project_files(repo) if is_git else None
        entries=scan(repo,names)
        head=subprocess.run(['git','-C',str(repo),'rev-parse','--verify','HEAD'],capture_output=True) if is_git else None
        graph_path=self.home/'graphs'/pid/'graph.json'
        info=read_json(graph_path) if graph_path.exists() else None
        return {**project,'files':[n for n,d,s in entries if d], 'isGit':is_git,
                'head':head.stdout.decode().strip() if head and head.returncode==0 else None,
                'graph':None if not info else {'stats':info['stats'],'base':info['base'],'createdAt':info['createdAt'],
                    'stale':info['fingerprint']!=fingerprint(entries)}}

    def save_project_references(self,pid,section,data):
        with self.guard:
            if self.busy: raise ValueError('Attendi l’operazione in corso.')
            checked_id(pid)
            project=next((p for p in self.settings['projects'] if p['id']==pid),None)
            if not project: raise ValueError('Progetto sconosciuto')
            if not isinstance(data,dict): raise ValueError('Riferimenti non validi')
            if section=='asis':
                ids=data.get('sources',[])
                available={s['id'] for s in self.sources.connections()}
                if not isinstance(ids,list) or any(not isinstance(s,str) or s not in available for s in ids):
                    raise ValueError('Seleziona fonti esistenti')
                references={'sources':list(dict.fromkeys(ids))}
                graph_ids=data.get('graphs',[])
                if not isinstance(graph_ids,list) or any(not isinstance(g,str) for g in graph_ids):
                    raise ValueError('Grafi selezionati non validi')
                references['graphs']=list(dict.fromkeys(graph_ids))
                fields={'objective':20000,'dossierWorkspace':4000}
            elif section=='graph':
                references={};fields={'query':1000}
            else: raise ValueError('Sezione riferimenti sconosciuta')
            for key,limit in fields.items():
                value=data.get(key,'')
                if not isinstance(value,str) or len(value)>limit: raise ValueError('Riferimento non valido: '+key)
                references[key]=value.strip()
            previous=project.get('workspace',{})
            project['workspace']={**previous,section:references}
            save_json(self.settings_path,self.settings)
            return project['workspace']

    def graph(self,pid,query='',node_id=None):
        self.project(pid)
        path=self.home/'graphs'/pid/'graph.json'
        if not path.exists(): raise ValueError('Crea prima il grafo del progetto.')
        return query_graph(read_json(path),query,node_id)

    def start(self,operation,data):
        with self.guard:
            if self.busy: raise ValueError('È già in corso un’operazione.')
            if operation not in OPERATIONS:
                raise ValueError('Operazione non supportata')
            if operation in ('prepare-asis','auto-asis'):
                workspace.selected_graphs(self,data)
            self.busy=True; self.job={'id':uuid.uuid4().hex,'operation':operation,'state':'running','startedAt':time.time(),'log':''}
            save_json(self.home/'last-job.json',self.job)
            threading.Thread(target=self._work,args=(operation,data),daemon=True).start()
            return dict(self.job)

    def _work(self,operation,data):
        try:
            directory=self.home/'jobs'/self.job['id']; directory.mkdir(parents=True)
            env=os.environ.copy()
            env.update(PI_SUITE_GRAPH_CACHE=str(self.cache),PYTHONUTF8='1')
            if operation=='sync-source':
                manifest=self.sources.sync(data['source'])
                self.job['result']={'source':data['source'],'documents':len(manifest['documents']),'excluded':len(manifest['excluded'])}
            elif operation=='index-sources':self.job['result']=self.sources.index_sources(data['sources'])
            elif operation=='register-asis':self.job['result']=self.sources.register_asis(data['workspace'])
            elif operation in ('prepare-asis','auto-asis'):
                def progress(message):self.job['log']=(self.job.get('log','')+'\n'+message)[-30000:]
                data['sources']=workspace.prepare_sources(self,data,operation)
                result=self.sources.automatic_asis(data['sources'],data.get('objective',''),progress) if operation=='auto-asis' else self.sources.prepare_asis(data['sources'],data.get('objective',''))
                save_json(Path(result['workspace'])/'PROGETTO.json',{'project':data['project'],'graphs':data['graphs']})
                self.job['result']={k:v for k,v in result.items() if k not in ('sources','prompt')}
                if data.get('openChat',True):self.open_chat(result['workspace'],result['prompt'])
            elif operation=='graph':
                p=self.project(data['project']); repo=Path(p['path'])
                graph=build_graph(repo,self.cache,project_files(repo) if p['isGit'] else None,prefix='repo/',base=p['head'])
                save_json(self.home/'graphs'/p['id']/'graph.json',graph)
                self.job['log']=json.dumps(graph['stats'],ensure_ascii=False)
            elif operation=='probe':
                profile=({'provider':data['provider'],'model':data['model'],'effort':data.get('effort','off'),'transport':'auto','keyEnv':key_env(data['provider'])}
                    if data.get('provider') and data.get('model') else self.settings['roles'].get(data.get('role')))
                if not profile: raise ValueError('Salva prima il modello per questo ruolo.')
                if not any(m['provider']==profile['provider'] and m['model']==profile['model'] for m in self.models()):raise ValueError('Modello non disponibile')
                env=self.secret_environment({**self.settings,'roles':{'probe':profile}})
                c={**profile,'agentDir':str(self.model_dir(directory/'pi')),'timeoutSeconds':90,'maxTurns':4,'probe':True}
                nonce=secrets.token_hex(12) if data.get('provider') else 'OK'
                job={**c,'probeNonce':nonce,'prompt':'Call capability_check with value '+nonce+', then read its result and reply CHECK_COMPLETE.','cwd':str(directory)}
                save_json(directory/'probe.json',job)
                output=self._process(['node',str(ROOT/'adapter.mjs'),str(directory/'probe.json')],env)
                report=json.loads(output)
                if not report.get('probeToolCalled'): raise ValueError('Il modello ha risposto ma non ha eseguito il tool di prova. Verifica il supporto tool calling.')
                self.job['result']={'model':profile['model'],'provider':profile['provider'],'requested':report['requested'],'effective':report['piLevel'],'toolCalling':True,
                    'status':'verified','usage':report['usage'],'payloads':report['payloads']}
                self.record_check(profile['provider'],profile['model'],self.job['result'])
            self.job.update(state='done',finishedAt=time.time())
        except Exception as e:
            if operation=='probe' and 'profile' in locals() and profile:
                self.record_check(profile['provider'],profile['model'],{'status':'failed','error':self.redact(str(e))})
            self.job.update(state='failed',error=self.redact(str(e)),finishedAt=time.time())
        finally:
            with self.guard:
                save_json(self.home/'last-job.json',self.job); self.busy=False

    def _process(self,args,env):
        process=subprocess.run(args,cwd=ROOT,env=env,capture_output=True,encoding='utf-8',errors='replace',timeout=7200)
        output=self.redact(process.stdout); error=self.redact(process.stderr)
        self.job['log']=(self.job.get('log','')+output+'\n'+error)[-30000:]
        if process.returncode: raise ValueError(error[-3000:] or output[-3000:] or 'Processo terminato con errore')
        return output

class Server(http.server.ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,addr,suite,token):
        self.suite=suite; self.token=token
        super().__init__(addr,Handler)

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self,status,body,kind='application/json'):
        raw=json.dumps(body,ensure_ascii=False).encode() if kind=='application/json' else body
        self.send_response(status); self.send_header('Content-Type',kind+'; charset=utf-8')
        self.send_header('Content-Length',str(len(raw))); self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers(); self.wfile.write(raw)
    def dispatch(self,post=False):
        try:
            origin=f'http://127.0.0.1:{self.server.server_port}'
            if self.headers.get('Host')!=f'127.0.0.1:{self.server.server_port}':
                return self.send(403,{'error':'Host non consentito'})
            if self.headers.get('Origin') not in (None,origin):
                return self.send(403,{'error':'Origine non consentita'})
            path=urllib.parse.urlsplit(self.path); route=path.path; params=urllib.parse.parse_qs(path.query)
            static={'/':('index.html','text/html'),'/app.js':('app.js','text/javascript'),'/evidence-panel.js':('evidence-panel.js','text/javascript'),'/style.css':('style.css','text/css')}
            static['/benchmark-panel.js']=('benchmark-panel.js','text/javascript')
            static['/benchmark.css']=('benchmark.css','text/css')
            if not post and route in static:
                file,kind=static[route]; return self.send(200,(ROOT/'suite-ui'/file).read_bytes(),kind)
            token=self.headers.get('X-Suite-Token','')
            if not hmac.compare_digest(token,self.server.token): return self.send(401,{'error':'Apri il pannello dal collegamento Pi Suite per autenticarti.'})
            data={}
            if post:
                if self.headers.get('Content-Type','').split(';')[0]!='application/json': raise ValueError('Richiesto JSON')
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=1000000: raise ValueError('Richiesta troppo grande o vuota')
                data=json.loads(self.rfile.read(length))
            app=self.server.suite
            if route=='/api/state' and not post: result={'settings':app.public_settings(),'job':dict(app.job),'busy':app.busy,'version':'0.6.5'}
            elif route=='/api/settings' and post: result=app.save_settings(data)
            elif route=='/api/benchmarks' or route.startswith('/api/benchmarks/'):
                result=app.benchmarks.request(route,data,params,post)
            elif route=='/api/byok/config' and not post:result={'config':app.byok.config(),'revision':app.byok.revision()}
            elif route=='/api/byok/import/preview' and post:result=app.import_byok(data)
            elif route=='/api/byok/import/apply' and post:result=app.import_byok(data,apply=True)
            elif route=='/api/byok/secrets' and post:result=app.save_secret(data)
            elif route=='/api/byok/connections' and post:result=app.save_connection(data)
            elif route=='/api/byok/export' and not post:
                format=params.get('format',['json'])[0]
                result={'format':format,'content':app.byok.export(format)}
            elif route=='/api/byok/probe' and post:result=app.start('probe',data)
            elif route=='/api/skills' and post: result=app.import_skill(data['content'])
            elif route=='/api/models' and not post: result=app.models()
            elif route=='/api/projects' and post: result=app.add_project(data.get('path',''),data.get('name',''))
            elif route=='/api/project-folder' and post: result=app.pick_project_folder()
            elif route=='/api/project-references' and post:
                result=app.save_project_references(data['project'],data['section'],data['references'])
            elif route=='/api/chat' and post: result=app.open_chat(data.get('path',''),project_id=data.get('project'))
            elif route=='/api/delegations' and not post: result=app.delegations()
            elif route=='/api/sources' and not post: result=app.sources.public()
            elif route=='/api/sources' and post:
                with app.guard:
                    if app.busy:raise ValueError('Attendi il completamento dell’operazione in corso.')
                    result=app.sources.save(data)
            elif route=='/api/asis-registry' and not post:result=app.sources.asis_registry()
            elif route=='/api/evidence' and post:
                from suite_evidence import query
                if data['action'] not in ('knowledge_search','knowledge_trace','read_evidence'):raise ValueError('Consultazione non supportata')
                result=query(app.sources.knowledge_bundle(data['sources']),data['action'],data.get('args',{}))
            elif route=='/api/relation-proposals' and not post:
                from suite_evidence import local_path,load
                result=[load(p) for p in sorted((local_path(app.home)/'knowledge'/'proposals').glob('*/*.json')) if re.fullmatch('[a-f0-9]{32}',p.stem)]
            elif route=='/api/relation-review' and post:
                from suite_evidence import local_path,load,review_relation,corpus_version
                version=data['corpusVersion']
                if not re.fullmatch('[a-f0-9]{64}',version):raise ValueError('Corpus non valido')
                bundle=load(local_path(app.home)/'knowledge'/'proposals'/version/'corpus.json')['bundle']
                if corpus_version(bundle)!=version:raise ValueError('Corpus alterato')
                result=review_relation(app.home,bundle,data['id'],data['verdict'],data['reason'])
            elif route=='/api/project' and not post: result=app.project(params['id'][0])
            elif route=='/api/project-files' and not post: result=workspace.inventory(app,params['id'][0])
            elif route=='/api/project-file' and not post: result=workspace.read_file(app,params['id'][0],params['file'][0])
            elif route=='/api/graph' and not post: result=app.graph(params['id'][0],params.get('q',[''])[0],params.get('node',[None])[0])
            elif route=='/api/source' and not post:
                project=app.project(params['id'][0]); name=params['path'][0]
                if name not in project['files']: raise ValueError('Sorgente non disponibile nel progetto')
                root=Path(project['path']); target=root/checked_relative(name)
                if not target.resolve().is_relative_to(root.resolve()) or target.is_symlink() or target.stat().st_size>200000:
                    raise ValueError('Sorgente fuori perimetro')
                result={'text':target.read_text(encoding='utf-8')}
            elif route=='/api/action' and post: result=app.start(data['operation'],data)
            else: return self.send(404,{'error':'Risorsa non trovata'})
            self.send(200,result)
        except (ValueError,KeyError,TypeError,subprocess.SubprocessError,sqlite3.Error,OSError) as e:
            self.send(400,{'error':self.server.suite.redact(str(e))})
    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch(True)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--home',default=os.environ.get('PI_SUITE_HOME',str(ROOT/'suite-data')))
    p.add_argument('--port',type=int,default=0); p.add_argument('--no-browser',action='store_true')
    args=p.parse_args(); home=Path(args.home).resolve(); marker=home/'server.json'
    if marker.exists():
        try:
            running=read_json(marker)
            req=urllib.request.Request(running['url']+'/api/state',headers={'X-Suite-Token':running['token']})
            with urllib.request.urlopen(req,timeout=2) as response: response.read()
            if not args.no_browser: webbrowser.open(running['url']+'/#'+running['token'])
            print('Pi Suite è già in esecuzione.'); return
        except (OSError,ValueError,KeyError): pass
    app=Suite(home); token=secrets.token_urlsafe(32); server=Server(('127.0.0.1',args.port),app,token)
    url=f'http://127.0.0.1:{server.server_port}'
    save_json(marker,{'url':url,'token':token,'pid':os.getpid()})
    print('Pi Suite pronta: '+url,flush=True)
    if not args.no_browser: webbrowser.open(url+'/#'+token)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        server.server_close()
        if marker.exists() and read_json(marker).get('pid')==os.getpid(): marker.unlink()

if __name__=='__main__': main()
