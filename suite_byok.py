"""Versioned, data-only BYOK configuration. Credentials never belong to exports."""
from __future__ import annotations
import copy
import hashlib
import ipaddress
import json
import os
import re
import subprocess
import urllib.parse
from pathlib import Path

APIS=('openai-completions','openai-responses','anthropic-messages','google-generative-ai')
EFFORTS=('off','minimal','low','medium','high','xhigh')
ROOT=Path(__file__).resolve().parent

def atomic(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def obj(value,allowed,path,required=()):
    if not isinstance(value,dict):raise ValueError(path+': richiesto oggetto')
    if set(value)-set(allowed):raise ValueError(path+': proprietà non supportata')
    for key in required:
        if key not in value:raise ValueError(path+'.'+key+': campo richiesto')
    return value

def string(value,path,limit=200):
    if not isinstance(value,str) or not value.strip() or len(value)>limit or any(ord(c)<32 for c in value):
        raise ValueError(path+': testo non valido')
    if value.startswith('!') or '${' in value or value.startswith('$'):
        raise ValueError(path+': comandi e interpolazioni non sono ammessi')
    return value.strip()

def identifier(value,path):
    value=string(value,path,100)
    if not re.fullmatch('[a-zA-Z0-9_-]+',value):raise ValueError(path+': usare lettere, numeri, trattino o underscore')
    return value

def env_name(pid):return 'PI_SUITE_KEY_'+re.sub('[^A-Z0-9]','_',pid.upper())

def endpoint(value,path):
    value=string(value,path,2000);u=urllib.parse.urlsplit(value)
    try:port=u.port
    except ValueError:raise ValueError(path+': porta non valida') from None
    if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.query or u.fragment:
        raise ValueError(path+': URL HTTP(S) senza credenziali, query o frammenti richiesto')
    host=u.hostname.lower()
    try:
        address=ipaddress.ip_address(host)
        if address.is_link_local or address.is_unspecified or address.is_multicast:
            raise ValueError(path+': indirizzo speciale non consentito')
        local=address.is_loopback
    except ValueError as e:
        if 'speciale' in str(e):raise
        local=host=='localhost'
    if u.scheme=='http' and not local:raise ValueError(path+': HTTPS richiesto per endpoint remoti')
    if re.search(r'/(chat/completions|responses|messages)/?$',u.path):
        raise ValueError(path+': inserisci la base URL, senza la route finale API')
    return value.rstrip('/')

def integer(value,path,minimum=1):
    if type(value) is not int or not minimum<=value<=100000000:raise ValueError(path+': intero fuori intervallo')
    return value

def boolean(value,path):
    if type(value) is not bool:raise ValueError(path+': richiesto true o false')
    return value

def validate(config):
    config=copy.deepcopy(config)
    obj(config,('schemaVersion','connections','profiles'),'config',('schemaVersion','connections'))
    if type(config['schemaVersion']) is not int or config['schemaVersion']!=1:raise ValueError('schemaVersion: versione non supportata')
    if not isinstance(config['connections'],list) or len(config['connections'])>100:raise ValueError('connections: massimo 100 connessioni')
    ids=set(); envs=set()
    for i,c in enumerate(config['connections']):
        p=f'connections[{i}]'
        obj(c,('id','name','providerType','protocol','baseUrl','auth','models'),p,('id','name','providerType','auth','models'))
        c['id']=identifier(c['id'],p+'.id');c['name']=string(c['name'],p+'.name')
        if c['id'] in ids or env_name(c['id']) in envs:raise ValueError(p+'.id: connessione duplicata o collisione di variabile ambiente')
        ids.add(c['id']);envs.add(env_name(c['id']))
        c['providerType']=identifier(c['providerType'],p+'.providerType')
        custom=c['providerType'] in ('custom','lmstudio','ollama')
        if custom or c.get('baseUrl'):
            c['baseUrl']=endpoint(c.get('baseUrl'),p+'.baseUrl')
            if c.get('protocol') not in APIS:raise ValueError(p+'.protocol: protocollo non supportato')
        elif 'protocol' in c and c['protocol'] not in APIS:raise ValueError(p+'.protocol: protocollo non supportato')
        a=c['auth'];obj(a,('type','ref','name','header','prefix'),p+'.auth',('type',))
        if a['type']=='secret':
            a['ref']=string(a.get('ref'),p+'.auth.ref')
            if not re.fullmatch('[a-zA-Z0-9_/-]{1,200}',a['ref']):raise ValueError(p+'.auth.ref: riferimento non valido')
            if 'name' in a:raise ValueError(p+'.auth: name vale solo per env')
        elif a['type']=='env':
            a['name']=string(a.get('name'),p+'.auth.name')
            if not re.fullmatch('[A-Za-z_][A-Za-z0-9_]*',a['name']):raise ValueError(p+'.auth.name: variabile non valida')
            if 'ref' in a:raise ValueError(p+'.auth: ref vale solo per secret')
        elif a['type']=='none':
            if set(a)!={'type'}:raise ValueError(p+'.auth: none non ammette altri campi')
        else:raise ValueError(p+'.auth.type: usare secret, env o none')
        if 'header' in a:
            if a['header'].lower() not in ('authorization','api-key','x-api-key','x-goog-api-key'):
                raise ValueError(p+'.auth.header: header non supportato')
            if not isinstance(a.get('prefix',''),str) or a.get('prefix','') not in ('','Bearer '):raise ValueError(p+'.auth.prefix: prefisso non supportato')
        elif 'prefix' in a:raise ValueError(p+'.auth.prefix: specificare header')
        if not isinstance(c['models'],list) or len(c['models'])>1000:raise ValueError(p+'.models: massimo 1000 modelli')
        mids=set()
        for j,m in enumerate(c['models']):
            q=p+f'.models[{j}]'
            obj(m,('id','name','limits','capabilities','reasoning'),q,('id','name','limits','capabilities','reasoning'))
            m['id']=string(m['id'],q+'.id');m['name']=string(m['name'],q+'.name')
            if m['id'] in mids:raise ValueError(q+'.id: modello duplicato')
            mids.add(m['id'])
            limits=obj(m['limits'],('contextWindow','maxOutputTokens'),q+'.limits',('contextWindow','maxOutputTokens'))
            integer(limits['contextWindow'],q+'.limits.contextWindow',1024);integer(limits['maxOutputTokens'],q+'.limits.maxOutputTokens',1)
            if limits['maxOutputTokens']>=limits['contextWindow']:raise ValueError(q+'.limits: output deve essere inferiore al contesto')
            caps=obj(m['capabilities'],('toolCalling','vision','streaming'),q+'.capabilities')
            for k,v in caps.items():
                if v is not None:boolean(v,q+'.capabilities.'+k)
            r=obj(m['reasoning'],('enabled','levels','defaultEffort'),q+'.reasoning',('enabled','levels'));boolean(r['enabled'],q+'.reasoning.enabled')
            if not isinstance(r['levels'],list) or any(x not in EFFORTS for x in r['levels']) or len(set(r['levels']))!=len(r['levels']):raise ValueError(q+'.reasoning.levels: livelli non validi')
            if not r['enabled'] and r['levels']:raise ValueError(q+'.reasoning: livelli senza supporto reasoning')
            if 'defaultEffort' in r and (r['defaultEffort'] not in EFFORTS or r['defaultEffort']!='off' and r['defaultEffort'] not in r['levels']):
                raise ValueError(q+'.reasoning.defaultEffort: livello predefinito non supportato')
    refs={}
    for c in config['connections']:
        if c['auth']['type']=='secret':
            ref=c['auth']['ref'];destination=(c['providerType'],c.get('baseUrl'),c.get('protocol'))
            if ref in refs and refs[ref]!=destination:raise ValueError('auth.ref: lo stesso segreto non può essere associato a destinazioni diverse')
            refs[ref]=destination
    profiles=config.get('profiles',{});obj(profiles,('orchestrator','worker','research','review','documentation'),'profiles')
    for role,p in profiles.items():
        obj(p,('connectionId','modelId','effort'),'profiles.'+role,('connectionId','modelId','effort'))
        c=next((c for c in config['connections'] if c['id']==p['connectionId']),None)
        if not c:raise ValueError('profiles.'+role+': connessione non disponibile')
        string(p['modelId'],'profiles.'+role+'.modelId')
        m=next((m for m in c['models'] if m['id']==p['modelId']),None)
        if not m and c['providerType'] in ('custom','lmstudio','ollama'):raise ValueError('profiles.'+role+': modello non disponibile')
        if m and m['capabilities'].get('toolCalling') is False:raise ValueError('profiles.'+role+': il modello non supporta strumenti')
        if m and m['capabilities'].get('streaming') is False:raise ValueError('profiles.'+role+': questa versione richiede un endpoint con streaming')
        if p['effort'] not in EFFORTS:raise ValueError('profiles.'+role+': effort non valido')
        if m and p['effort']!='off' and (not m['reasoning']['enabled'] or p['effort'] not in m['reasoning']['levels']):raise ValueError('profiles.'+role+': livello reasoning non supportato')
    return config

def from_custom_endpoints(groups):
    """Import the supported customendpoint subset; secret values are never data."""
    if not groups or len(groups)>100:raise ValueError('customendpoint: richiesti da 1 a 100 gruppi')
    protocols={'chat-completions':('openai-completions','/chat/completions'),
               'responses':('openai-responses','/responses'),'messages':('anthropic-messages','/messages')}
    connections=[]
    for i,g in enumerate(groups):
        p=f'customendpoint[{i}]'
        obj(g,('name','vendor','apiKey','apikey','apykey','apiType','models','settings'),p,('name','vendor','models'))
        name=string(g['name'],p+'.name')
        if g['vendor']!='customendpoint':raise ValueError(p+'.vendor: supportato solo customendpoint')
        keys=[k for k in ('apiKey','apikey','apykey') if k in g]
        if len(keys)>1:raise ValueError(p+': specificare un solo campo apiKey')
        if keys and g[keys[0]]!='${key}':
            raise ValueError(p+'.apiKey: usa solo ${key}; inserisci la chiave nel campo protetto separato')
        if not isinstance(g['models'],list) or not 1<=len(g['models'])<=1000:raise ValueError(p+'.models: richiesti da 1 a 1000 modelli')
        settings=g.get('settings',{})
        if not isinstance(settings,dict):raise ValueError(p+'.settings: richiesto oggetto')
        models=[];destination=None
        for j,m in enumerate(g['models']):
            q=p+f'.models[{j}]'
            obj(m,('id','name','url','apiType','toolCalling','vision','thinking','supportsReasoningEffort','contextWindow','maxInputTokens','maxOutputTokens'),q,('id','name','url'))
            mid=string(m['id'],q+'.id');label=string(m['name'],q+'.name')
            api=m.get('apiType',g.get('apiType','chat-completions'))
            if not isinstance(api,str) or api not in protocols:raise ValueError(q+'.apiType: usare chat-completions, responses o messages')
            protocol,route=protocols[api]
            url=string(m['url'],q+'.url',2000)
            # Only known protocol routes can be represented by the Pi transport.
            base=url.rstrip('/')
            if base.endswith(route):base=base[:-len(route)]
            base=endpoint(base,q+'.url')
            target=(base,protocol)
            if destination is not None and target!=destination:
                raise ValueError(q+'.url: usa gruppi separati per URL base o protocolli diversi')
            destination=target
            thinking=boolean(m.get('thinking',False),q+'.thinking')
            levels=m.get('supportsReasoningEffort',[])
            if not isinstance(levels,list) or any(not isinstance(x,str) or x not in ('none',*EFFORTS) for x in levels):
                raise ValueError(q+'.supportsReasoningEffort: livelli non validi')
            levels=['off' if x=='none' else x for x in levels]
            if len(levels)!=len(set(levels)):raise ValueError(q+'.supportsReasoningEffort: livelli duplicati')
            reasoning={'enabled':thinking,'levels':levels}
            if mid in settings:
                s=obj(settings[mid],('reasoningEffort',),p+'.settings',('reasoningEffort',))
                reasoning['defaultEffort']='off' if s['reasoningEffort']=='none' else s['reasoningEffort']
            output=m.get('maxOutputTokens',4096)
            context=m.get('contextWindow',32000)
            if 'maxInputTokens' in m:
                minimum=integer(m['maxInputTokens'],q+'.maxInputTokens')+integer(output,q+'.maxOutputTokens')
                if 'contextWindow' not in m:context=minimum
                elif integer(context,q+'.contextWindow')<minimum:raise ValueError(q+': contesto inferiore a input + output')
            models.append({'id':mid,'name':label,'limits':{'contextWindow':context,'maxOutputTokens':output},
                'capabilities':{'toolCalling':boolean(m['toolCalling'],q+'.toolCalling') if 'toolCalling' in m else None,
                                'vision':boolean(m.get('vision',False),q+'.vision'),'streaming':True},'reasoning':reasoning})
        if set(settings)-{m['id'] for m in models}:raise ValueError(p+'.settings: modello non presente nel gruppo')
        # Stable across model reordering; a changed destination still requires key reassociation.
        slug=re.sub('[^a-z0-9]+','-',name.lower()).strip('-')[:50] or 'endpoint'
        cid='custom-'+slug+'-'+hashlib.sha256(name.encode()).hexdigest()[:8]
        connections.append({'id':cid,'name':name,'providerType':'custom','protocol':destination[1],'baseUrl':destination[0],
            'auth':{'type':'secret','ref':'byok/'+cid} if keys else {'type':'none'},'models':models})
    return {'schemaVersion':1,'connections':connections}


def parse(content,format):
    if not isinstance(content,str) or len(content.encode('utf-8'))>700000:raise ValueError('Configurazione troppo grande: massimo 700 KB')
    def unique(pairs):
        result={}
        for k,v in pairs:
            if k in result:raise ValueError('JSON: chiave duplicata')
            result[k]=v
        return result
    try:
        if format=='json':value=json.loads(content.lstrip('\ufeff'),object_pairs_hook=unique)
        elif format in ('yaml','yml'):
            value=bridge({'content':content})
        else:raise ValueError('Formato non supportato: usare JSON o YAML')
        def depth(v,n=0):
            if n>24:raise ValueError('Configurazione troppo annidata')
            if isinstance(v,dict):
                for x in v.values():depth(x,n+1)
            elif isinstance(v,list):
                for x in v:depth(x,n+1)
        depth(value)
        if isinstance(value,list):value=from_custom_endpoints(value)
        return validate(value)
    except json.JSONDecodeError as e:raise ValueError(f'JSON non valido: riga {e.lineno}, colonna {e.colno}') from None
    except RecursionError:raise ValueError('JSON troppo annidato') from None

def bridge(request):
    r=subprocess.run(['node',str(ROOT/'byok-format.mjs')],input=json.dumps(request),capture_output=True,text=True,encoding='utf-8',timeout=15,cwd=ROOT)
    if r.returncode:raise ValueError('YAML non valido: controlla duplicati, tag, alias e numero di documenti')
    return r.stdout if request.get('action')=='export' else json.loads(r.stdout)

def model_from_legacy(m):
    reasoning=bool(m.get('reasoning'))
    return {'id':m['id'],'name':m.get('name',m['id']),
        'limits':{'contextWindow':m.get('contextWindow',32000),'maxOutputTokens':m.get('maxTokens',4096)},
        'capabilities':{'toolCalling':m.get('toolCalling'),'vision':'image' in m.get('input',['text']),'streaming':m.get('streaming',True)},
        'reasoning':{'enabled':reasoning,'levels':m.get('reasoningLevels',list(EFFORTS) if reasoning else []),
                     **({'defaultEffort':m['defaultEffort']} if 'defaultEffort' in m else {})}}

def from_legacy(settings):
    connections=[]
    for p in settings.get('providers',[]):
        auth=copy.deepcopy(p.get('auth',{'type':'secret','ref':'byok/'+p['id']}))
        c={'id':p['id'],'name':p.get('name',p['id']),'providerType':p.get('providerType','custom' if p.get('custom') else p['id']),
            'auth':auth,'models':[model_from_legacy(m) for m in p.get('models',[])]}
        if p.get('custom') or p.get('baseUrl'):c.update(protocol=p.get('api','openai-completions'),baseUrl=p['baseUrl'])
        connections.append(c)
    return {'schemaVersion':1,'connections':connections,'profiles':{r:{'connectionId':p['provider'],'modelId':p['model'],'effort':p.get('effort','off')} for r,p in settings.get('roles',{}).items()}}

def to_legacy(config):
    providers=[]
    for c in config['connections']:
        p={'id':c['id'],'name':c['name'],'providerType':c['providerType'],'custom':bool(c.get('baseUrl')),'auth':copy.deepcopy(c['auth']),'models':[]}
        if c.get('baseUrl'):p.update(baseUrl=c['baseUrl'],api=c['protocol'])
        for m in c['models']:
            p['models'].append({'id':m['id'],'name':m['name'],'contextWindow':m['limits']['contextWindow'],'maxTokens':m['limits']['maxOutputTokens'],
                'input':['text','image'] if m['capabilities'].get('vision') else ['text'],
                'reasoning':m['reasoning']['enabled'],'reasoningLevels':m['reasoning']['levels'],
                'toolCalling':m['capabilities'].get('toolCalling'),'streaming':m['capabilities'].get('streaming'),
                **({'defaultEffort':m['reasoning']['defaultEffort']} if 'defaultEffort' in m['reasoning'] else {})})
        providers.append(p)
    roles={r:{'provider':p['connectionId'],'model':p['modelId'],'effort':p['effort'],'transport':'auto','keyEnv':env_name(p['connectionId'])} for r,p in config.get('profiles',{}).items()}
    return {'providers':providers,'roles':roles}

class Store:
    def __init__(self,home,protect):
        self.home=Path(home);self.path=self.home/'models.config.json';self.vault_path=self.home/'credentials.dpapi.json';self.protect=protect
        self.vault=json.loads(self.vault_path.read_text(encoding='utf-8')) if self.vault_path.exists() else {}

    def load_or_migrate(self,settings):
        if self.path.exists():return to_legacy(validate(json.loads(self.path.read_text(encoding='utf-8'))))
        # Preserve ciphertext as-is: migration never decrypts keys onto disk.
        if (self.home/'settings.json').exists() and settings.get('providers'):
            backup=self.home/'settings.pre-byok.json'
            if not backup.exists():atomic(backup,settings)
        config=from_legacy(settings)
        for p,c in zip(settings.get('providers',[]),config['connections']):
            if p.get('encryptedKey'):self.vault[c['auth']['ref']]=p['encryptedKey']
            elif c['auth']['type']=='secret':
                c['auth']={'type':'env','name':env_name(p['id'])} if not p.get('custom') or os.environ.get(env_name(p['id'])) else {'type':'none'}
        # Legacy auto transport disabled unsupported reasoning at request time.
        for profile in config.get('profiles',{}).values():
            c=next((c for c in config['connections'] if c['id']==profile['connectionId']),None)
            m=next((m for m in c['models'] if m['id']==profile['modelId']),None) if c else None
            if m and not m['reasoning']['enabled']:profile['effort']='off'
        atomic(self.vault_path,self.vault);atomic(self.path,validate(config))
        return to_legacy(config)

    def config(self):return validate(json.loads(self.path.read_text(encoding='utf-8')))
    def revision(self):return digest({'config':self.config(),'vault':self.vault})
    def has_key(self,p):
        a=p.get('auth',{})
        return bool(self.vault.get(a.get('ref'))) if a.get('type')=='secret' else bool(os.environ.get(a.get('name',''))) if a.get('type')=='env' else False

    def secret(self,p):
        a=p['auth']
        if a['type']=='none':return 'local-no-key'
        value=self.protect(self.vault[a['ref']],True) if a['type']=='secret' and self.vault.get(a['ref']) else os.environ.get(a.get('name','')) if a['type']=='env' else None
        if not value:raise ValueError('Credenziale assente per la connessione '+p['id'])
        return value

    def save(self,config,updates=()):
        config=validate(config);vault=copy.deepcopy(self.vault);old={c['id']:c for c in self.config()['connections']}
        updates={p['id']:p for p in updates}
        for c in config['connections']:
            item=updates.get(c['id'],{});a=c['auth'];previous=old.get(c['id'])
            if item.get('clearKey') and a['type']=='secret':vault.pop(a['ref'],None)
            if item.get('apiKey'):
                if not isinstance(item['apiKey'],str) or not item['apiKey'].strip() or len(item['apiKey'])>16000 or any(c in item['apiKey'] for c in '\r\n'):
                    raise ValueError('Chiave non valida: inserisci un valore non vuoto su una sola riga')
                if a['type']!='secret':raise ValueError('Seleziona chiave protetta per salvare una chiave')
                vault[a['ref']]=self.protect(item['apiKey'].strip())
            bound=[x for x in old.values() if x['auth'].get('ref')==a.get('ref') and x['auth']['type']=='secret'] if a['type']=='secret' else []
            if any((x.get('baseUrl'),x['providerType'],x.get('protocol'))!=(c.get('baseUrl'),c['providerType'],c.get('protocol')) for x in bound) and vault.get(a.get('ref')) and not item.get('apiKey'):
                raise ValueError('Endpoint cambiato: rimuovi o reinserisci la chiave per riassociarla esplicitamente')
        used_refs={c['auth']['ref'] for c in config['connections'] if c['auth']['type']=='secret'}
        vault={ref:value for ref,value in vault.items() if ref in used_refs}
        # Credentials first; roll back that write if the authoritative config cannot be committed.
        atomic(self.vault_path,vault)
        try:atomic(self.path,config)
        except Exception:
            atomic(self.vault_path,self.vault);raise
        self.vault=vault
        return to_legacy(config)

    def preview(self,content,format,include_profiles=False):
        incoming=parse(content,format);current=self.config();old={c['id']:c for c in current['connections']}
        for c in incoming['connections']:
            previous=old.get(c['id'])
            a=c['auth'];bound=[x for x in old.values() if x['auth'].get('ref')==a.get('ref') and x['auth']['type']=='secret'] if a['type']=='secret' else []
            if any((x.get('baseUrl'),x['providerType'],x.get('protocol'))!=(c.get('baseUrl'),c['providerType'],c.get('protocol')) for x in bound) and self.vault.get(a.get('ref')):
                raise ValueError('Import cambia endpoint con chiave associata: usa un nuovo riferimento segreto')
        merged={**old,**{c['id']:c for c in incoming['connections']}}
        candidate=validate({'schemaVersion':1,'connections':list(merged.values()),'profiles':incoming['profiles'] if include_profiles and 'profiles' in incoming else current.get('profiles',{})})
        return {'revision':self.revision(),'config':candidate,'changes':[{'id':c['id'],'name':c['name'],'endpoint':c.get('baseUrl',c['providerType']),'auth':c['auth'],'action':'aggiorna' if c['id'] in old else 'aggiungi','missingSecret':c['auth']['type']!='none' and not self.has_key({'auth':c['auth']})} for c in incoming['connections']],
            'profilesImported':include_profiles,'notice':'Nessuna chiamata modello. Il file contiene solo riferimenti ai segreti. Per customendpoint: none diventa off; senza limiti espliciti si usano 32000 token di contesto e 4096 di output, da verificare sul server. Le sessioni aperte conservano la configurazione iniziale.'}

    def export(self,format):
        config=self.config()
        if format=='json':return json.dumps(config,ensure_ascii=False,indent=2)+'\n'
        if format in ('yaml','yml'):return bridge({'action':'export','config':config})
        raise ValueError('Formato non supportato')
