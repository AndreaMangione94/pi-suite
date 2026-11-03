"""Project-scoped persisted files and graph prerequisites for the workspace UI."""
import json
from pathlib import Path
from suite_evidence import CODE_EXTENSIONS
from suite_documentation_migration import LEGACY, ASSIGNMENT, PRIMARY_DOCUMENT, previous_name, is_primary_document
import suite_document_graph as document_graph


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def suite_context_file(home, path):
    """Un CONTESTO.json trovato su disco vale solo se la suite lo ha scritto nei dossier o nelle sessioni dell'area dati."""
    try:
        real = Path(path).resolve(strict=True)
        base = Path(home).resolve()
    except OSError:
        return False
    return real.is_file() and any(real.is_relative_to(base/folder) for folder in ('documentation', 'sessions'))


def project_record(app, pid):
    project = next((p for p in app.settings['projects'] if p['id'] == pid), None)
    if project is None:
        raise ValueError('Progetto sconosciuto')
    return project


def source_references(project):
    """Graph management owns sources; read legacy documentazione tecnico funzionale links until first graph save."""
    workspace = project.get('workspace', {})
    return workspace.get('graph', {}).get('sources', workspace.get('documentation', {}).get('sources', []))


def saved_graphs(app, pid):
    project_record(app, pid)
    path = app.home/'graphs'/pid/'saved.json'
    return load(path) if path.exists() else []


def graph_entry(app, pid, identifier):
    item = next((g for g in inventory(app, pid)['graphs'] if g['id'] == identifier and g.get('selectable', True)), None)
    if item is None:
        raise ValueError('Grafo non disponibile per questo progetto.')
    return item


def inventory(app, pid):
    project = project_record(app, pid)
    refs = project.get('workspace', {}).get('documentation', {})
    linked = set(source_references(project))
    root = Path(project['path']).resolve()
    graphs, documents = saved_graphs(app, pid), []
    saved_paths = {g['path'] for g in graphs}

    def entry(identifier, path, name, created, **extra):
        return dict(id=identifier, name=name, path=str(path), createdAt=created, **extra)

    path = app.home/'graphs'/pid/'graph.json'
    if path.is_file() and str(path) not in saved_paths:
        info = load(path)
        graphs.append(entry('project:'+pid, path, project['name']+' · Grafo del codice', info['createdAt'], kind='project'))
    ref=document_graph.current_ref(app.home,pid)
    if ref and str(document_graph.graph_path(app.home,ref)) not in saved_paths:
        graph=document_graph.load_graph(app.home,ref)
        current={s['id']:(s.get('snapshot') or {}).get('id') for s in app.sources.public()}
        stale=any(current.get(d['source'])!=d['snapshot'] or d['source'] not in linked for d in graph['dependencies'])
        graphs.append(entry('document:'+pid,document_graph.graph_path(app.home,ref),project['name']+' · Grafo documentale semantico',
                            graph['createdAt'],kind='document',documentCount=graph['stats']['documents'],reference=ref,stats=graph['stats'],stale=stale))
    for source in app.sources.public():
        local = source.get('path')
        if source['id'] not in linked and not (local and Path(local).resolve().is_relative_to(root)):
            continue
        snapshot = source.get('snapshot') or {}
        folder = app.sources.root/source['id']/snapshot.get('id', '_missing')
        descriptor = folder/'evidence.json'
        if snapshot.get('index') and descriptor.is_file() and (folder/'evidence.sqlite').is_file():
            document_count=sum(Path(doc['path']).suffix.lower() not in CODE_EXTENSIONS for doc in snapshot.get('documents', []))
            label='Indice delle relazioni esplicite'
            graphs.append(entry('source:'+source['id'], descriptor, source['name']+' · '+label,
                                descriptor.stat().st_birthtime, kind='source-index', source=source['id'], documentCount=document_count,selectable=False))
    for dossier in (app.home/'documentation').glob('*/FONTI.json'):
        folder = dossier.parent
        marker = folder/'PROGETTO.json'
        metadata = load(marker) if marker.exists() else {}
        dependencies = {r['source'] for r in load(dossier)}
        belongs = metadata.get('project') == pid if marker.exists() else (
            str(folder) == refs.get('dossierWorkspace') or bool(dependencies) and dependencies.issubset(linked))
        if not belongs:
            continue
        for path in sorted(folder.glob('*.md')):
            if path.name in (ASSIGNMENT,previous_name(ASSIGNMENT),LEGACY['assignment'],'PIANO-DOCUMENTAZIONE.md') or path.is_symlink():
                continue
            if path.name!=PRIMARY_DOCUMENT and is_primary_document(path.name) and (folder/PRIMARY_DOCUMENT).is_file():
                continue
            title = metadata.get('name')
            name = (title if path.name == 'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md' else title+' · '+path.stem) if title else path.name
            documents.append(entry('documentation:'+folder.name+':'+path.name, path, name,
                                   path.stat().st_birthtime, workspace=str(folder), modifiedAt=path.stat().st_mtime_ns))
    hidden=set(project.get('workspace',{}).get('removedGraphs',[]))
    paths=set(project.get('workspace',{}).get('removedGraphPaths',[]))
    return {'graphs': sorted([g for g in graphs if g['id'] not in hidden and g['path'] not in paths], key=lambda graph: (graph['kind']!='document',graph['kind']=='source-index')), 'documentation': documents}


def selected_graphs(app, data):
    available = {g['id']: g for g in inventory(app, data.get('project'))['graphs'] if g.get('selectable',True)}
    ids = data.get('graphs')
    if not isinstance(ids, list) or any(not isinstance(i, str) or i not in available for i in ids):
        raise ValueError('Seleziona grafi di conoscenza disponibili per questo progetto.')
    return sorted((available[i] for i in dict.fromkeys(ids)), key=lambda graph: graph['kind']!='document')


def prepare_sources(app, data, operation):
    graphs = selected_graphs(app, data)
    project = project_record(app, data['project'])
    supplied=data.get('sources',[]);known={s['id'] for s in app.sources.connections()}
    if not isinstance(supplied,list) or any(not isinstance(s,str) or s not in known for s in supplied):raise ValueError('Seleziona fonti esistenti')
    ids = list(supplied)
    for graph in graphs:
        if graph['kind'] == 'document':
            if not data.get('documentGraph'):data['documentGraph']=graph['reference']
            stored=document_graph.load_graph(app.home,graph['reference'])
            ids.extend(d['source'] for d in stored['dependencies'])
            continue
        if graph.get('source'):
            ids.append(graph['source'])
            continue
        # Reuse the project's local connection when available; the source is read only.
        source = next((s for s in app.sources.connections() if s.get('kind')=='sharepoint-local' and s.get('path') and
                       Path(s['path']).resolve() == Path(project['path']).resolve()), None)
        if source is None:
            rows = app.sources.save({'name': project['name'], 'kind': 'sharepoint-local', 'path': project['path']})
            source = rows[-1]
        ids.append(source['id'])
    # The selected project is always an input, even without an existing graph.
    source=next((s for s in app.sources.connections() if s.get('kind')=='sharepoint-local' and s.get('path') and Path(s['path']).resolve()==Path(project['path']).resolve()),None)
    if source is None:source=app.sources.save({'name':project['name'],'kind':'sharepoint-local','path':project['path']})[-1]
    if source['id'] not in ids:ids.append(source['id'])
    app.sources.sync(source['id'])
    known={s['id'] for s in app.sources.connections()}
    for sid in dict.fromkeys(ids):
        if sid in known and not (app.sources.root/sid/'current.json').is_file():app.sources.sync(sid)
    return list(dict.fromkeys(ids))


def chat_context(app, pid):
    project=project_record(app,pid);files=inventory(app,pid);refs=project.get('workspace',{}).get('documentation',{})
    graphs=[g for g in files['graphs'] if g.get('selectable',True) and g['id'] in refs.get('graphs',[])]
    documents=[d for d in files['documentation'] if d['id'] in refs.get('documents',[])]
    ids=[];bundle=[]
    for graph in graphs:
        if graph.get('reference'):
            stored=document_graph.load_graph(app.home,graph['reference'])
            for dep in stored['dependencies']:
                ref=app.sources.bundle([dep['source']],{dep['source']:dep['snapshot']})[0]
                bundle.append({**ref,'directory':str(ref['directory']),'indexVersion':dep['indexVersion'],'documentGraph':graph['reference'],'allowCodeGraph':False})
        elif graph.get('source'):ids.append(graph['source'])
    if ids:
        bundle.extend({**r,'directory':str(r['directory']),'allowCodeGraph':True} for r in app.sources.bundle(list(dict.fromkeys(ids))))
    return {'project':project,'graphs':graphs,'documentation':documents,'bundle':bundle}


def read_file(app, pid, identifier):
    files = inventory(app, pid)
    item = next((f for f in files['graphs']+files['documentation'] if f['id'] == identifier), None)
    if not item:
        raise ValueError('File non disponibile per questo progetto.')
    path = Path(item['path'])
    if path.is_symlink() or path.stat().st_size > 5_000_000:
        raise ValueError('File non consultabile: dimensione massima 5 MB.')
    return {**item, 'text': path.read_text(encoding='utf-8-sig')}
