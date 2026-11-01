"""Migrate mutable documentation metadata; preserve content-addressed evidence snapshots."""
import json
import re
from pathlib import Path

LEGACY=json.loads((Path(__file__).parent/'documentation-compat.json').read_text(encoding='utf-8'))
PRIMARY_DOCUMENT='DOCUMENTAZIONE-TECNICA.md'
ASSIGNMENT='INCARICO-DOCUMENTAZIONE-TECNICA.md'


def is_documentation(manifest):
    return manifest.get('kind') in ('documentation',LEGACY['kind'])


def is_primary_document(name):
    return name in (PRIMARY_DOCUMENT,LEGACY['primaryDocument'])


def renamed_text(value):
    value=value.replace(LEGACY['assignment'],ASSIGNMENT).replace(LEGACY['primaryDocument'],PRIMARY_DOCUMENT)
    for old,new in LEGACY['skills'].items():value=value.replace(old,new)
    for old,new in {**LEGACY['commands'],**LEGACY['tools']}.items():value=value.replace(old,new)
    for old,new in LEGACY['identifiers'].items():
        if value.startswith(old):value=new+value[len(old):]
    return re.sub(re.escape(LEGACY['primaryDocument'][:-3]),'documentazione tecnica',value,flags=re.IGNORECASE)


def upgrade_metadata(value):
    if isinstance(value,list):return [upgrade_metadata(item) for item in value]
    if isinstance(value,dict):
        result={key:(item if key in ('manifest','bundle','connectedSources','contract') else upgrade_metadata(item)) for key,item in value.items() if key!=LEGACY['workspaceKey']}
        if LEGACY['workspaceKey'] in value and 'documentation' not in result:result['documentation']=upgrade_metadata(value[LEGACY['workspaceKey']])
        return result
    return renamed_text(value) if isinstance(value,str) else value


def upgrade_settings(settings):
    settings['enabledSkills']=list(dict.fromkeys(LEGACY['skills'].get(name,name) for name in settings.get('enabledSkills',[])))
    for project in settings.get('projects',[]):
        if 'workspace' in project:project['workspace']=upgrade_metadata(project['workspace'])
    return settings


def migrate_home(home,settings,save):
    home=Path(home).resolve()
    upgrade_settings(settings)
    if settings.get('documentationSchema',0)>=1:return

    def local_file(path):
        return path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(home)

    old_registry=home/'sources'/LEGACY['registry'];registry=home/'sources'/'documentation-registry.json'
    if local_file(old_registry):
        if not registry.exists():old_registry.rename(registry)
        elif local_file(registry):
            old=json.loads(old_registry.read_text(encoding='utf-8'));new=json.loads(registry.read_text(encoding='utf-8'))
            save(registry,list({item['source']:item for item in [*old,*new]}.values()));old_registry.unlink()
    mutable=[home/'last-job.json',*home.glob('graphs/*/saved.json'),*home.glob('sessions/context-*.json'),*home.glob('sessions/*/suite-launch.json')]
    for folder in (home/'documentation').glob('*'):
        if not folder.is_dir() or folder.is_symlink() or not folder.resolve().is_relative_to(home):continue
        for old_name,new_name in ((LEGACY['primaryDocument'],PRIMARY_DOCUMENT),(LEGACY['assignment'],ASSIGNMENT)):
            old=folder/old_name;new=folder/new_name
            if local_file(old) and not new.exists():old.rename(new)
        brief=folder/ASSIGNMENT
        if local_file(brief):
            original=brief.read_text(encoding='utf-8');updated=renamed_text(original)
            if original!=updated:brief.write_text(updated,encoding='utf-8')
        mutable.extend(folder/name for name in ('PROGETTO.json','CONTESTO.json','FINALIZZATO.json'))
    for path in mutable:
        if not local_file(path):continue
        previous=json.loads(path.read_text(encoding='utf-8-sig'));updated=upgrade_metadata(previous)
        if previous!=updated:save(path,updated)
    settings['documentationSchema']=1
