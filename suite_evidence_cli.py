"""JSON stdin bridge for local evidence tools; no model-supplied paths or SQL."""
from suite_documentation_migration import is_documentation
import json
import sys
from pathlib import Path
from suite_evidence import query, propose_relation, semantic_proposals, corpus_version, local_path


def main():
    sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
    if sys.argv[1:]==['--self-check']:
        import sqlite3
        with sqlite3.connect(':memory:') as db:db.execute('CREATE VIRTUAL TABLE check_fts USING fts5(text)')
        print(json.dumps({'fts5':True,'evidenceTools':True}));return
    request=json.load(sys.stdin);action=request['action'];bundle=request.get('bundle',[]);args=request.get('args',{})
    home=Path(request['home']).resolve()
    # Bundle paths come from the suite contract, never from tool parameters.
    for ref in bundle:
        expected=local_path(home/'sources'/ref['source']/ref['snapshot'])
        if local_path(ref['directory'])!=expected:raise ValueError('Directory evidenza fuori archivio della suite')
    if action in ('knowledge_search','knowledge_trace','read_evidence'):
        result=query(bundle,action,args)
        if action=='knowledge_trace' and args.get('includeInferred'):
            ids={n['id'] for n in result['nodes']}|set(args.get('nodes',[]))
            relations=[p for p in semantic_proposals(home,bundle) if p['verification']!='rejected' and (p['source'] in ids or p['target'] in ids)]
            result['inferredRelations']=relations[:40];result['inferredTruncated']=len(relations)>40
    elif action=='document_graph':
        from suite_document_graph import query_graph
        refs={json.dumps(r['documentGraph'],sort_keys=True) for r in bundle if r.get('documentGraph')}
        results=[query_graph(home,json.loads(ref),args,bundle) for ref in sorted(refs)]
        result=results[0] if len(results)==1 else {'graphs':results,'available':bool(results)}
    elif action=='propose_relation':result=propose_relation(home,bundle,args)
    elif action in ('prepare_documentation','register_documentation'):
        from suite import Suite
        app=Suite(home)
        if action=='register_documentation':result=app.finalize_documentation(request['workspace'])
        else:
            import suite_workspace
            project=app.project_for_workspace(request['workspace']) if request.get('workspace') else None
            ids=args.get('sources') or [r['source'] for r in bundle if not is_documentation(r.get('manifest',{}))]
            if project:
                prefs=suite_workspace.project_record(app,project).get('workspace',{}).get('documentation',{})
                ids=suite_workspace.prepare_sources(app,{'project':project,'graphs':prefs.get('graphs',[]),'sources':ids or prefs.get('sources',[])},'prepare-documentation')
            if not ids:raise ValueError('Seleziona un progetto o delle fonti per generare documentazione tecnico funzionale.')
            graph_ref=None if args.get('sources') else next((r['documentGraph'] for r in bundle if r.get('documentGraph')),None)
            prepared=app.prepare_technical_functional_documentation(ids,args.get('objective',''),args.get('refresh',True),project or (graph_ref or {}).get('project'),graph_ref)
            result={k:v for k,v in prepared.items() if k!='sources'}
    else:raise ValueError('Operazione non supportata')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'error':str(error)},ensure_ascii=True));sys.exit(1)
