"""Refresh project evidence and semantic document graph before starting documentazione tecnica."""
from suite_documentation_migration import is_documentation
import argparse
import json
import sys
from pathlib import Path
from suite import Suite
from suite_workspace import prepare_sources

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home',required=True);parser.add_argument('--project',required=True)
    parser.add_argument('--objective',default='')
    args=parser.parse_args();app=Suite(args.home)
    try:
        project=Path(args.project).resolve();index=project/'FONTI.json';objective=args.objective
        if index.exists() and (project/'INCARICO-DOCUMENTAZIONE-TECNICA.md').exists():
            refs=json.loads(index.read_text(encoding='utf-8'));ids=[s['source'] for s in refs if not is_documentation(s.get('manifest',{}))]
        else:
            matching=sorted((p for p in app.settings['projects'] if project.is_relative_to(Path(p['path']).resolve())),key=lambda p:len(p['path']),reverse=True)
            if matching:
                references=matching[0].get('workspace',{}).get('documentation',{})
                ids=prepare_sources(app,{'project':matching[0]['id'],'graphs':references.get('graphs',[]),'sources':references.get('sources',[])},'prepare-documentation');objective=objective or references.get('objective','')
            else:raise ValueError('Seleziona un progetto per generare documentazione tecnica.')
        pid=app.project_for_workspace(project)
        result=app.prepare_technical_documentation(ids,objective,True,pid,progress=lambda text:print(text,file=sys.stderr,flush=True))
        print(json.dumps({k:v for k,v in result.items() if k!='sources'},ensure_ascii=False))
    except Exception as error:
        print(app.redact(str(error)),file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
