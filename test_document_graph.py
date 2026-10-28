"""Semantic graph integration tests with explicitly simulated model completions."""
import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from suite import Suite
from suite_document_graph import current_ref, graph_path, load_graph, query_graph
from suite_workspace import inventory, selected_graphs


class ModelFixtureSuite(Suite):
    def document_graph_profile(self):
        return {'provider':'fixture','model':'simulated-model','effort':'off','transport':'auto','contextWindow':32768,'maxOutputTokens':4096}

    def _document_graph_completion(self,request,profile,directory):
        if not hasattr(self,'model_calls'):self.model_calls=[]
        self.model_calls.append(request['phase'])
        context=request['context']
        if request['phase']=='documents':
            lines=context['text'].split('\n');position=next((i for i,line in enumerate(lines) if line.strip()),0)
            quote=lines[position].strip()[:1000]
            ev={'source':context['source'],'document':context['document'],'startLine':context['startLine']+position,'endLine':context['startLine']+position,'quote':quote}
            result={'nodes':[{'key':'concept','label':'Processo '+Path(context['path']).stem,'kind':'process','summary':'Concetto simulato per verificare il salvataggio.','evidence':[ev]}],'edges':[],'notes':'Risposta simulata del modello, solo per test.'}
        else:
            nodes=context['concepts'];edges=[]
            if len(nodes)>1:
                evidence=[{k:ev[k] for k in ('source','document','startLine','endLine','quote')} for n in nodes[:2] for ev in n['evidence'][:1]]
                edges=[{'source':nodes[0]['id'],'target':nodes[1]['id'],'relation':'precedes','reason':'Relazione simulata fra i due documenti.','evidence':evidence}]
            result={'nodes':[],'edges':edges,'notes':'Sintesi simulata del modello, solo per test.'}
        return {'graph':result,'usage':[{'input':100,'output':50}],'seconds':0}


class DocumentGraphTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).resolve().parent/'.test-suite'/('semantic-'+uuid.uuid4().hex);self.root.mkdir(parents=True)
        self.repo=self.root/'project';self.repo.mkdir();(self.repo/'main.py').write_text('def run(): return 1\n',encoding='utf-8')
        self.docs=self.root/'documents';self.docs.mkdir()
        (self.docs/'portale.txt').write_text('Il portale raccoglie le richieste di acquisto.',encoding='utf-8')
        (self.docs/'ordini.txt').write_text('Il servizio ordini elabora le richieste ricevute.',encoding='utf-8')
        self.app=ModelFixtureSuite(self.root/'data');self.pid=self.app.add_project(str(self.repo),'Ordini')['id']
        self.sid=self.app.sources.save({'name':'Documenti','kind':'sharepoint-local','path':str(self.docs)})[-1]['id']
        self.app.save_project_references(self.pid,'graph',{'sources':[self.sid]})

    def build(self):return self.app.build_document_graph(self.pid,[self.sid])

    def test_inferred_graph_without_explicit_relations_and_incremental_cache(self):
        first=self.build();ref=current_ref(self.app.home,self.pid)
        self.assertEqual(first['stats']['explicitEdges'],0)
        self.assertEqual(first['stats']['semanticNodes'],2)
        self.assertEqual(first['stats']['semanticEdges'],1)
        self.assertEqual(first['stats']['evidenceEdges'],2)
        self.assertEqual(len(self.app.model_calls),3)
        second=self.build()
        self.assertEqual(len(self.app.model_calls),3)
        self.assertEqual(second['stats']['cachedPasses'],3)
        self.assertEqual(first['semanticFingerprint'],second['semanticFingerprint'])
        self.assertNotEqual(ref['version'],second['fingerprint'])
        self.assertNotEqual(first['dependencies'][0]['snapshot'],second['dependencies'][0]['snapshot'])
        for edge in second['edges']:
            for ev in edge['evidence']:self.assertEqual(ev['snapshot'],second['dependencies'][0]['snapshot'])
        (self.docs/'ordini.txt').write_text('Il servizio ordini elabora e approva le richieste ricevute.',encoding='utf-8')
        third=self.build()
        self.assertEqual(len(self.app.model_calls),5)
        self.assertEqual(third['stats']['cachedPasses'],1)
        self.assertEqual(load_graph(self.app.home,ref)['fingerprint'],first['fingerprint'])

    def test_asis_pins_semantic_graph_and_both_document_and_code_snapshots(self):
        first=self.build();ref=current_ref(self.app.home,self.pid)
        code=self.app.sources.save({'name':'Codebase','kind':'sharepoint-local','path':str(self.repo)})[-1]['id'];self.app.sources.sync(code)
        result=self.app.prepare_documented_asis([self.sid,code],'Ordini',False,self.pid,ref)
        dossier=Path(result['workspace']);bundle=json.loads((dossier/'FONTI.json').read_text(encoding='utf-8'))
        self.assertEqual(bundle[0]['documentGraph']['version'],first['fingerprint'])
        self.assertTrue(next(r for r in bundle if r['source']==code)['manifest']['graph']['nodes'])
        self.assertEqual(json.loads((dossier/'GRAFO-DOCUMENTALE.json').read_text(encoding='utf-8'))['version'],first['fingerprint'])
        calls=len(self.app.model_calls)
        (self.docs/'ordini.txt').write_text('La procedura degli ordini è stata modificata.',encoding='utf-8');self.build()
        pinned=query_graph(self.app.home,ref,{'query':'Processo','depth':1},bundle)
        self.assertEqual(pinned['version'],first['fingerprint'])
        self.assertEqual(pinned['stats']['semanticEdges'],1)
        restored=Suite(self.app.home)
        again=restored.prepare_documented_asis([self.sid],'Riusa',False,self.pid,ref)
        self.assertEqual(again['documentGraph']['version'],first['fingerprint'])
        self.assertEqual(len(self.app.model_calls),calls+2)
        self.assertIn('document_graph',(dossier/'INCARICO-AS-IS.md').read_text(encoding='utf-8'))

    def test_invalid_model_evidence_does_not_replace_previous_graph(self):
        self.build();ref=current_ref(self.app.home,self.pid)
        (self.docs/'ordini.txt').write_text('Testo modificato per invalidare la cache.',encoding='utf-8')
        original=self.app._document_graph_completion
        def invalid(request,profile,directory):
            result=original(request,profile,directory)
            if request['phase']=='documents':result['graph']['nodes'][0]['evidence'][0]['quote']='Citazione che non compare nella fonte'
            return result
        with patch.object(self.app,'_document_graph_completion',invalid):
            with self.assertRaisesRegex(ValueError,'citazione'):self.build()
        self.assertEqual(current_ref(self.app.home,self.pid),ref)
        self.assertTrue(next(g for g in inventory(self.app,self.pid)['graphs'] if g['kind']=='document')['stale'])
        self.assertFalse((self.app.home/'documentation').exists())

    def test_equivalent_concepts_are_merged_with_aliases_and_provenance(self):
        original=self.app._document_graph_completion
        def equivalent(request,profile,directory):
            result=original(request,profile,directory)
            if request['phase']=='cross-document':
                nodes=request['context']['concepts']
                result['graph']={'nodes':[],'edges':[],'equivalences':[{'source':nodes[1]['id'],'target':nodes[0]['id'],'reason':'Sinonimi simulati per verificare la fusione.','evidence':result['graph']['edges'][0]['evidence']}],'notes':'Equivalenza simulata'}
            return result
        with patch.object(self.app,'_document_graph_completion',equivalent):graph=self.build()
        self.assertEqual(graph['stats']['semanticNodes'],1)
        node=next(n for n in graph['nodes'] if n.get('method')=='llm_inference')
        self.assertEqual(len(node['evidence']),2)
        self.assertEqual(len(node['aliases']),1)
        self.assertTrue(node['equivalenceReasons'])
        old=next(iter(graph['aliases']))
        result=query_graph(self.app.home,current_ref(self.app.home,self.pid),{'nodes':[old]})
        self.assertIn(node['id'],[n['id'] for n in result['nodes']])

    def test_indexes_cannot_substitute_for_final_graph_and_projects_stay_scoped(self):
        self.app.sources.sync(self.sid)
        with self.assertRaises(ValueError):selected_graphs(self.app,{'project':self.pid,'graphs':['source:'+self.sid]})
        graph=self.build();other=self.app.add_project(name='Altro')['id']
        with self.assertRaises(ValueError):selected_graphs(self.app,{'project':other,'graphs':['document:'+self.pid]})
        ref=current_ref(self.app.home,self.pid);path=graph_path(self.app.home,ref)
        altered={**graph,'fingerprint':'0'*64};path.write_text(json.dumps(altered),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'alterato'):load_graph(self.app.home,ref)
        graph['nodes'][0]['label']='Alterato';path.write_text(json.dumps(graph),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'alterato'):load_graph(self.app.home,ref)

    def test_model_is_required_before_acquisition(self):
        restored=Suite(self.app.home)
        with self.assertRaisesRegex(ValueError,'Orchestratore'):
            restored.start('document-graphs',{'project':self.pid,'sources':[self.sid]})
        self.assertFalse(restored.busy)
        self.assertFalse((restored.sources.root/self.sid/'current.json').exists())

    def test_sharepoint_remote_acquisition_feeds_the_same_semantic_builder(self):
        self.app.sources.protect=lambda value,decrypt=False:value
        sid=self.app.sources.save({'name':'SharePoint remoto','kind':'sharepoint-graph','driveId':'drive','folderId':'folder','token':'fixture-only'})[-1]['id']
        self.app.save_project_references(self.pid,'graph',{'sources':[sid]});calls=[]
        def download(url,headers=None,graph=False):
            calls.append((url,graph))
            if graph:
                self.assertEqual(headers['Authorization'],'Bearer fixture-only')
                items=[{'id':name,'name':name+'.txt','file':{},'size':100,'webUrl':'https://example.sharepoint.com/'+name,'eTag':'fixture','@microsoft.graph.downloadUrl':'https://example.sharepoint.com/download/'+name} for name in ('portale','ordini')]
                return json.dumps({'value':items}).encode()
            return ('Il documento '+url.rsplit('/',1)[-1]+' descrive il ciclo degli ordini.').encode()
        with patch('suite_sources.download',download):graph=self.app.build_document_graph(self.pid,[sid])
        self.assertEqual(graph['stats']['documents'],2)
        self.assertEqual(graph['stats']['semanticEdges'],1)
        self.assertEqual(sum(remote for _url,remote in calls),1)
        self.assertEqual(len(calls),3)
        self.assertEqual(graph['dependencies'][0]['source'],sid)

    def test_registered_asis_records_semantic_version_and_detects_semantic_changes(self):
        graph=self.build();ref=current_ref(self.app.home,self.pid)
        prepared=self.app.prepare_documented_asis([self.sid],'Ordini',False,self.pid,ref)
        folder=Path(prepared['workspace']);doc=prepared['sources'][0]['manifest']['documents'][0]
        (folder/'AS-IS.md').write_text('# Ordini\nFonte ['+self.sid+':'+doc['id']+']',encoding='utf-8')
        self.app.sources.register_asis(folder)
        recorded=self.app.sources.asis_registry()[0]
        self.assertEqual(recorded['documentGraphs'][0]['version'],graph['fingerprint'])
        self.build();self.assertEqual(self.app.sources.asis_registry()[0]['freshness'],'current')
        profile=self.app.document_graph_profile()
        with patch.object(self.app,'document_graph_profile',return_value={**profile,'model':'different-simulated-model'}):self.build()
        self.assertEqual(self.app.sources.asis_registry()[0]['freshness'],'needs_revalidation')


if __name__=='__main__':unittest.main()
