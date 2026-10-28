"""Refresh project evidence and semantic document graph before starting AS-IS."""
import argparse
import json
import sys
from pathlib import Path
from suite import Suite
from suite_workspace import source_references

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home',required=True);parser.add_argument('--project',required=True)
    parser.add_argument('--objective',default='')
    args=parser.parse_args();app=Suite(args.home)
    try:
        project=Path(args.project).resolve();index=project/'FONTI.json';objective=args.objective
        if index.exists() and (project/'INCARICO-AS-IS.md').exists():
            refs=json.loads(index.read_text(encoding='utf-8'));ids=[s['source'] for s in refs if s.get('manifest',{}).get('kind')!='asis']
        else:
            matching=sorted((p for p in app.settings['projects'] if project.is_relative_to(Path(p['path']).resolve())),key=lambda p:len(p['path']),reverse=True)
            if matching:
                references=matching[0].get('workspace',{}).get('asis',{})
                ids=source_references(matching[0]);objective=objective or references.get('objective','')
                if not ids: raise ValueError('Seleziona e salva le fonti in Grafi di conoscenza per questo progetto nel workspace.')
            else:ids=[s['id'] for s in app.sources.connections()]
        pid=app.project_for_workspace(project)
        result=app.prepare_documented_asis(ids,objective,True,pid,progress=lambda text:print(text,file=sys.stderr,flush=True))
        print(json.dumps({k:v for k,v in result.items() if k!='sources'},ensure_ascii=False))
    except Exception as error:
        print(app.redact(str(error)),file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
