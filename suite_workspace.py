"""Project-scoped persisted files and graph prerequisites for the workspace UI."""
import json
from pathlib import Path
from suite_evidence import CODE_EXTENSIONS
import suite_document_graph as document_graph


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def project_record(app, pid):
    project = next((p for p in app.settings['projects'] if p['id'] == pid), None)
    if project is None:
        raise ValueError('Progetto sconosciuto')
    return project


def source_references(project):
    """Graph management owns sources; read legacy AS-IS links until first graph save."""
    workspace = project.get('workspace', {})
    return workspace.get('graph', {}).get('sources', workspace.get('asis', {}).get('sources', []))


def inventory(app, pid):
    project = project_record(app, pid)
    refs = project.get('workspace', {}).get('asis', {})
    linked = set(source_references(project))
    root = Path(project['path']).resolve()
    graphs, documents = [], []

    def entry(identifier, path, name, created, **extra):
        return dict(id=identifier, name=name, path=str(path), createdAt=created, **extra)

    path = app.home/'graphs'/pid/'graph.json'
    if path.is_file():
        info = load(path)
        graphs.append(entry('project:'+pid, path, project['name']+' · Grafo del codice', info['createdAt'], kind='project'))
    ref=document_graph.current_ref(app.home,pid)
    if ref:
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
        dependencies = {r['source'] for r in load(dossier)}
        belongs = load(marker).get('project') == pid if marker.exists() else (
            str(folder) == refs.get('dossierWorkspace') or bool(dependencies) and dependencies.issubset(linked))
        if not belongs:
            continue
        for path in sorted(folder.glob('*.md')):
            if path.name == 'INCARICO-AS-IS.md' or path.is_symlink():
                continue
            documents.append(entry('asis:'+folder.name+':'+path.name, path, path.name,
                                   path.stat().st_birthtime, workspace=str(folder)))
    return {'graphs': sorted(graphs, key=lambda graph: (graph['kind']!='document',graph['kind']=='source-index')), 'asis': documents}


def selected_graphs(app, data):
    available = {g['id']: g for g in inventory(app, data.get('project'))['graphs'] if g.get('selectable',True)}
    ids = data.get('graphs')
    if not isinstance(ids, list) or not ids or any(not isinstance(i, str) or i not in available for i in ids):
        raise ValueError('Seleziona almeno un grafo di conoscenza disponibile per questo progetto.')
    return sorted((available[i] for i in dict.fromkeys(ids)), key=lambda graph: graph['kind']!='document')


def prepare_sources(app, data, operation):
    graphs = selected_graphs(app, data)
    project = project_record(app, data['project'])
    ids = []
    for graph in graphs:
        if graph['kind'] == 'document':
            data['documentGraph']=graph['reference']
            stored=document_graph.load_graph(app.home,graph['reference'])
            ids.extend(d['source'] for d in stored['dependencies'])
            continue
        # Reuse the project's local connection when available; the source is read only.
        source = next((s for s in app.sources.connections() if s.get('path') and
                       Path(s['path']).resolve() == Path(project['path']).resolve()), None)
        if source is None:
            rows = app.sources.save({'name': project['name'], 'kind': 'sharepoint-local', 'path': project['path']})
            source = rows[-1]
        ids.append(source['id'])
        if operation == 'prepare-asis':
            app.sources.sync(source['id'])
    return list(dict.fromkeys(ids))


def read_file(app, pid, identifier):
    files = inventory(app, pid)
    item = next((f for f in files['graphs']+files['asis'] if f['id'] == identifier), None)
    if not item:
        raise ValueError('File non disponibile per questo progetto.')
    path = Path(item['path'])
    if path.is_symlink() or path.stat().st_size > 5_000_000:
        raise ValueError('File non consultabile: dimensione massima 5 MB.')
    return {**item, 'text': path.read_text(encoding='utf-8-sig')}
