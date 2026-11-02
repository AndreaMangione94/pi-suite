"""Refresh existing graphs after the orchestrator has integrated and reviewed changes."""
from suite_documentation_migration import is_primary_document
import argparse
import os
import sys
from pathlib import Path
from suite import Suite, read_json, save_json
from suite_graph import scan, fingerprint, build_graph, digest
import suite_workspace as workspace


def refresh(app, folder, context_path=None, baseline=False):
    pid=app.project_for_workspace(folder)
    if not pid:return []
    project=workspace.project_record(app,pid);root=Path(project['path'])
    graphs=[g for g in workspace.inventory(app,pid)['graphs'] if g.get('selectable',True)]
    state_path=app.home/'graphs'/pid/('refresh-state-'+(digest(str(context_path).encode())[:16] if context_path else 'default')+'.json')
    previous=read_json(state_path) if state_path.exists() else {}
    signature=fingerprint(scan(root));changed=previous.get('project')!=signature;updated=[]
    if baseline:
        previous={'project':signature,**{g['id']:digest((Path(g['workspace'])/'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md').read_bytes()) for g in graphs if g.get('workspace') and (Path(g['workspace'])/'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md').is_file()}}
        save_json(state_path,previous);return []
    if not graphs:return []
    for item in graphs:
        if item.get('workspace'):
            doc=Path(item['workspace'])/'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md'
            if doc.is_file():
                value=digest(doc.read_bytes())
                manifest=read_json(app.sources.root/item['source']/item['snapshot']/'manifest.json')
                stored=next((d.get('sha256') for d in manifest['documents'] if is_primary_document(d['path'])),None)
                if changed or stored!=value:
                    app.finalize_documentation(item['workspace'],auto_select=False);updated.append(item['id'])
                previous[item['id']]=value
        elif changed and item['kind']=='project':
            sid=item.get('source')
            if sid:
                manifest=app.sources.sync(sid);path=app.sources.root/sid/manifest['id']/'graph.json'
                if not path.exists():raise ValueError('Codice supportato non disponibile per '+item['name'])
                item.update(path=str(path),snapshot=manifest['id'],stats=read_json(path)['stats'])
                saved=workspace.saved_graphs(app,pid)
                save_json(app.home/'graphs'/pid/'saved.json',[item if g['id']==item['id'] else g for g in saved])
            else:save_json(Path(item['path']),build_graph(root,app.cache,prefix='repo/'))
            updated.append(item['id'])
        elif changed and item['kind']=='document':
            import suite_document_graph
            ids=[d['source'] for d in suite_document_graph.load_graph(app.home,item['reference'])['dependencies']]
            graph=app.build_document_graph(pid,ids);ref={'project':pid,'version':graph['fingerprint']}
            item.update(reference=ref,path=str(suite_document_graph.graph_path(app.home,ref)),createdAt=graph['createdAt'],stats=graph['stats'])
            save_json(app.home/'graphs'/pid/'saved.json',[item if g['id']==item['id'] else g for g in workspace.saved_graphs(app,pid)])
            updated.append(item['id'])
    previous['project']=signature;save_json(state_path,previous)
    if context_path and Path(context_path).exists():
        old=read_json(context_path);fresh=workspace.chat_context(app,pid)
        # Keep the chat's explicit selection; newly generated documentazione tecnico funzionale graphs are added automatically.
        ids={g['id'] for g in old.get('graphs',[])}|{g['id'] for g in fresh['graphs'] if g.get('workspace') and Path(g['workspace']).resolve()==Path(folder).resolve()}
        fresh['graphs']=[g for g in workspace.inventory(app,pid)['graphs'] if g['id'] in ids]
        old_ids={d['id'] for d in old.get('documentation',[])}|{d['id'] for d in fresh['documentation'] if Path(d['workspace']).resolve()==Path(folder).resolve()}
        fresh['documentation']=[d for d in workspace.inventory(app,pid)['documentation'] if d['id'] in old_ids]
        # Resolve snapshots using this chat's selection, independently of the UI preferences.
        prefs=project.setdefault('workspace',{}).setdefault('documentation',{});original=dict(prefs)
        prefs.update(graphs=[g['id'] for g in fresh['graphs']],documents=[d['id'] for d in fresh['documentation']])
        try:fresh=workspace.chat_context(app,pid)
        finally:prefs.clear();prefs.update(original)
        save_json(context_path,fresh)
    return updated


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--home',required=True);parser.add_argument('--workspace',required=True);parser.add_argument('--baseline',action='store_true')
    args=parser.parse_args()
    try:refresh(Suite(args.home),args.workspace,os.environ.get('PI_SUITE_CONTEXT') or str(Path(args.workspace)/'CONTESTO.json'),args.baseline)
    except Exception as error:print(str(error),file=sys.stderr);sys.exit(1)
