"""Installed `pi` entry point. Credentials reach Pi only through its environment."""
import os
import subprocess
import sys
from pathlib import Path
from suite import Suite, ROOT

def main():
    home=Path(os.environ.get('PI_SUITE_HOME',str(ROOT/'suite-data')))
    args=sys.argv[1:]
    if args and args[0] in ('suite','--suite'):
        python=Path(sys.executable).with_name('pythonw.exe')
        subprocess.Popen([str(python if python.exists() else sys.executable),str(ROOT/'suite.py'),'--home',str(home)],
            creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        return
    app=Suite(home)
    management=bool(args and args[0] in ('install','remove','uninstall','update','list','config','auth','mcp'))
    if not management:app.validate_profiles()
    env=app.secret_environment()
    for notice in app.credential_notices:print('Pi Suite: '+notice,file=sys.stderr)
    import json
    context_path=env.get('PI_SUITE_CONTEXT')
    local_context=Path.cwd()/'CONTESTO.json'
    if not context_path and local_context.is_file():
        import suite_workspace
        # Un CONTESTO.json fuori dall'area dati (per esempio in un repository clonato) potrebbe indicare percorsi arbitrari.
        if suite_workspace.suite_context_file(home,local_context):context_path=str(local_context);env['PI_SUITE_CONTEXT']=context_path
        else:print('Pi Suite: CONTESTO.json ignorato perché non è stato creato dalla suite in questa area dati.',file=sys.stderr)
    context=json.loads(Path(context_path).read_text(encoding='utf-8')) if context_path else {'graphs':[],'documentation':[]}
    if not context_path and not env.get('PI_SUITE_CLEAN_WORKSPACE'):
        import suite_workspace
        pid=app.project_for_workspace(Path.cwd())
        if pid:
            context=suite_workspace.chat_context(app,pid)
            import uuid
            from suite import save_json
            context_path=str(home/'sessions'/('context-'+uuid.uuid4().hex+'.json'));save_json(context_path,context);env['PI_SUITE_CONTEXT']=context_path
    env.update(PI_SUITE_HOME=str(home),PI_SUITE_PYTHON=sys.executable,PI_CODING_AGENT_DIR=str(app.prepare_shell(snapshot=True,context=context)))
    env.setdefault('PI_TELEMETRY','0')
    extra=[]
    if not args or args[0] not in ('install','remove','uninstall','update','list','config','auth','mcp'):
        profile=app.settings['roles'].get('orchestrator')
        # With no suite profile, let Pi handle model selection and missing-model UI.
        if profile and '--model' not in args and '--provider' not in args:
            extra=['--provider',profile['provider'],'--model',profile['model'],'--thinking',profile['effort']]
        extra+=['--extension',str(ROOT/'node_modules/pi-subagents/index.js'),'--extension',str(ROOT/'suite-extension.ts'),'--no-skills']
        clean_workspace=env.get('PI_SUITE_CLEAN_WORKSPACE')
        if clean_workspace and Path.cwd().resolve()==Path(clean_workspace).resolve():
            extra+=['--no-context-files']
        names=[n for n in app.settings['enabledSkills'] if n not in ('graph-explorer','lettura-documentazione-tecnico-funzionale')]
        if context.get('graphs'):names.append('graph-explorer')
        if context.get('documentation'):names.append('lettura-documentazione-tecnico-funzionale')
        for name in names:
            folder=ROOT/'skills'/name
            if name=='pi-subagents': folder=ROOT/'node_modules/pi-subagents/skills/pi-subagents'
            if not folder.exists(): folder=home/'skills'/name
            extra+=['--skill',str(folder)]
    sys.exit(subprocess.call(['node','--import',(ROOT/'byok-network.mjs').as_uri(),str(ROOT/'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'),*extra,*args],env=env))

if __name__=='__main__': main()
