# Uso: python tests/wp5-wp7-python.test.py .   (dalla radice del repository)
import json, os, sys, tempfile, time
from pathlib import Path

repo = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
sys.path.insert(0, str(repo))
os.chdir(repo)
tempfile.tempdir = str(repo / 'tests' / 'tmp')
from suite import Suite
import suite_refresh_graphs as refresh

# WP5 / WP10: la politica e il formato di consegna arrivano a suite-launch.json
home = Path(tempfile.mkdtemp())
app = Suite(home)
assert app.settings.get('delegationPolicy', 'auto') == 'auto'
launch = json.loads((app.prepare_shell() / 'suite-launch.json').read_text(encoding='utf-8'))
assert launch['delegationPolicy'] == 'auto', launch
app.settings['delegationPolicy'] = 'always'
app.settings['resultMode'] = 'text'
launch = json.loads((app.prepare_shell() / 'suite-launch.json').read_text(encoding='utf-8'))
assert launch['delegationPolicy'] == 'always' and launch.get('resultMode', 'text') == 'text', launch
print('WP5 OK')

# WP7: impronta leggera, ignora le cartelle escluse, cambia se cambia un file
project = Path(tempfile.mkdtemp())
(project / 'a.txt').write_text('x', encoding='utf-8')
(project / 'node_modules').mkdir()
(project / 'node_modules' / 'z.js').write_text('1', encoding='utf-8')
first = refresh.light_signature(project)
(project / 'node_modules' / 'z.js').write_text('22', encoding='utf-8')
assert refresh.light_signature(project) == first
time.sleep(0.05)
(project / 'a.txt').write_text('yy', encoding='utf-8')
assert refresh.light_signature(project) != first
print('WP7 OK')
from unittest.mock import patch
from types import SimpleNamespace

project_id = 'p'
state = home / 'graphs' / project_id / 'refresh-state-default.json'
records = [
    {'id': 'external', 'kind': 'project', 'source': 'remote', 'name': 'Remote'},
    {'id': 'external-doc', 'kind': 'document', 'reference': {'project': 'p', 'version': 'v'}},
]


class Sources:
    def connections(self):
        return [{'id': 'local', 'kind': 'sharepoint-local', 'path': str(project)}]

    def sync(self, sid):
        raise AssertionError('Unexpected sync: ' + sid)


app = SimpleNamespace(home=home, cache=home / 'cache', sources=Sources(), project_for_workspace=lambda f: project_id)
with (
    patch.object(refresh.workspace, 'project_record', return_value={'path': str(project)}),
    patch.object(refresh.workspace, 'inventory', return_value={'graphs': records}),
    patch('suite_document_graph.load_graph', return_value={'dependencies': [{'source': 'remote'}]}),
):
    assert refresh.refresh(app, project, baseline=True) == []
    saved = json.loads(state.read_text())
    (project / 'a.txt').write_text('external-change')
    refresh.refresh(app, project, baseline=True)
    assert json.loads(state.read_text()) == saved, 'Baseline must not hide changes between turns'
    with patch.object(refresh, 'light_signature', side_effect=AssertionError('Baseline scan')):
        refresh.refresh(app, project, baseline=True)
    assert refresh.refresh(app, project) == [], 'Remote sources must not sync on local edits'
with (
    patch.object(refresh.workspace, 'project_record', return_value={'path': str(project)}),
    patch.object(refresh.workspace, 'inventory', return_value={'graphs': []}),
    patch.object(refresh, 'light_signature', side_effect=AssertionError('Unneeded scan')),
):
    assert refresh.refresh(app, project) == []
print('WP7 selective refresh OK')
