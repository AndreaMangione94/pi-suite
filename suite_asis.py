"""Prepare refreshed AS-IS evidence for the /asis Pi chat command; no model call here."""
import argparse
import json
import sys
from pathlib import Path
from suite import Suite

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home',required=True);parser.add_argument('--project',required=True)
    parser.add_argument('--objective',default='')
    args=parser.parse_args();app=Suite(args.home)
    try:
        project=Path(args.project).resolve();index=project/'FONTI.json';objective=args.objective
        if index.exists() and (project/'INCARICO-AS-IS.md').exists():
            ids=[s['source'] for s in json.loads(index.read_text(encoding='utf-8'))]
        else:
            matching=sorted((p for p in app.settings['projects'] if project.is_relative_to(Path(p['path']).resolve())),key=lambda p:len(p['path']),reverse=True)
            if matching:
                references=matching[0].get('workspace',{}).get('asis',{})
                ids=references.get('sources',[]);objective=objective or references.get('objective','')
                if not ids: raise ValueError('Seleziona e salva le fonti As-is per questo progetto nel workspace.')
            else:ids=[s['id'] for s in app.sources.connections()]
        result=app.sources.automatic_asis(ids,objective,lambda text:print(text,file=sys.stderr,flush=True))
        print(json.dumps({k:v for k,v in result.items() if k!='sources'},ensure_ascii=False))
    except Exception as error:
        print(app.redact(str(error)),file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
