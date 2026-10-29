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
    env.update(PI_SUITE_HOME=str(home),PI_SUITE_PYTHON=sys.executable,PI_CODING_AGENT_DIR=str(app.prepare_shell(snapshot=True)))
    env.setdefault('PI_TELEMETRY','0')
    extra=[]
    if not args or args[0] not in ('install','remove','uninstall','update','list','config','auth','mcp'):
        profile=app.settings['roles'].get('orchestrator')
        # With no suite profile, let Pi handle model selection and missing-model UI.
        if profile and '--model' not in args and '--provider' not in args:
            extra=['--provider',profile['provider'],'--model',profile['model'],'--thinking',profile['effort']]
        extra+=['--extension',str(ROOT/'node_modules/pi-subagents/index.js'),'--extension',str(ROOT/'suite-extension.ts')]
        clean_workspace=env.get('PI_SUITE_CLEAN_WORKSPACE')
        if clean_workspace and Path.cwd().resolve()==Path(clean_workspace).resolve():
            extra+=['--no-context-files']
        for name in app.settings['enabledSkills']:
            folder=ROOT/'skills'/name
            if name=='pi-subagents': folder=ROOT/'node_modules/pi-subagents/skills/pi-subagents'
            if not folder.exists(): folder=home/'skills'/name
            extra+=['--skill',str(folder)]
    sys.exit(subprocess.call(['node','--import',(ROOT/'byok-network.mjs').as_uri(),str(ROOT/'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'),*extra,*args],env=env))

if __name__=='__main__': main()
