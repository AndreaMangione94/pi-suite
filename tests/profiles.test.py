import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from suite import Suite
app=object.__new__(Suite)
app.models=lambda:[{'provider':'test','model':m,'contextWindow':32000,'maxTokens':4096,'toolCalling':True} for m in ['strong','cheap','extract']]
parent={'provider':'test','model':'strong','effort':'high'}
worker={'provider':'test','model':'cheap','effort':'low'}
extract={'provider':'test','model':'extract','effort':'medium'}
for roles,expected in [({'orchestrator':parent},parent),({'orchestrator':parent,'worker':worker},worker),({'orchestrator':parent,'worker':worker,'documentation':extract},extract)]:
 app.settings={'roles':roles};result=app.document_graph_profile()
 assert result['model']==expected['model'] and result['effort']==expected['effort']
app.settings={'roles':{}}
try:app.document_graph_profile();raise AssertionError('missing profile accepted')
except ValueError:pass
print('WP6: priorita profili e thinking indipendente OK')
