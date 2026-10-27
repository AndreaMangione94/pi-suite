"""JSON stdin bridge for local evidence tools; no model-supplied paths or SQL."""
import json
import sys
from pathlib import Path
from suite_evidence import query, propose_relation, semantic_proposals, corpus_version


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
        expected=(home/'sources'/ref['source']/ref['snapshot']).resolve()
        if Path(ref['directory']).resolve()!=expected:raise ValueError('Directory evidenza fuori archivio della suite')
    if action in ('knowledge_search','knowledge_trace','read_evidence'):
        result=query(bundle,action,args)
        if action=='knowledge_trace' and args.get('includeInferred'):
            ids={n['id'] for n in result['nodes']}|set(args.get('nodes',[]))
            relations=[p for p in semantic_proposals(home,bundle) if p['verification']!='rejected' and (p['source'] in ids or p['target'] in ids)]
            result['inferredRelations']=relations[:40];result['inferredTruncated']=len(relations)>40
    elif action=='propose_relation':result=propose_relation(home,bundle,args)
    elif action in ('prepare_asis','register_asis'):
        from suite import Suite
        app=Suite(home)
        if action=='register_asis':result=app.sources.register_asis(request['workspace'])
        else:
            ids=args.get('sources') or [r['source'] for r in bundle if r.get('manifest',{}).get('kind')!='asis']
            if not ids:ids=[s['id'] for s in app.sources.connections()]
            prepared=app.sources.automatic_asis(ids,args.get('objective','')) if args.get('refresh',True) else app.sources.prepare_asis(ids,args.get('objective',''))
            result={k:v for k,v in prepared.items() if k!='sources'}
    else:raise ValueError('Operazione non supportata')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'error':str(error)},ensure_ascii=True));sys.exit(1)
