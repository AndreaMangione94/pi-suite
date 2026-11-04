import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import suite
import suite_workspace as workspace
from suite_refresh_graphs import refresh


class ContextArtifactsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=suite.ROOT/'tests'/'tmp');self.addCleanup(self.temp.cleanup)
        self.app=suite.Suite(Path(self.temp.name)/'data');self.pid='a'*16
        self.root=Path(self.temp.name)/'project';self.root.mkdir()
        (self.root/'requirements.md').write_text('# Ordini\nIl sistema registra gli ordini.\n',encoding='utf-8')
        self.app.settings['projects']=[{'id':self.pid,'name':'Demo','path':str(self.root)}]
        self.app.settings['enabledSkills']+=['lettura-documentazione-tecnico-funzionale']
        self.profile={'provider':'test','model':'test','effort':'off','contextWindow':32000,'maxOutputTokens':4000}

    def dossier(self):
        ids=workspace.prepare_sources(self.app,{'project':self.pid,'graphs':[]},'prepare-documentation')
        prepared=self.app.prepare_technical_functional_documentation(ids,'Analizza ordini',False,self.pid,use_document_graph=False)
        folder=Path(prepared['workspace']);ref=prepared['sources'][0];doc=ref['manifest']['documents'][0]
        (folder/'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md').write_text('# documentazione tecnico funzionale\n## Processo ordini\nIl sistema registra gli ordini. ['+ref['source']+':'+doc['id']+']\n',encoding='utf-8')
        (folder/'ARCHITETTURA.md').write_text('# Allegato\nDettaglio aggiuntivo.\n',encoding='utf-8')
        return folder

    def test_without_graphs_generation_uses_project_and_no_graph_skill(self):
        ids=workspace.prepare_sources(self.app,{'project':self.pid,'graphs':[]},'prepare-documentation')
        self.assertEqual(len(ids),1)
        self.assertEqual(self.app.sources.connections()[0]['path'],str(self.root))
        context=workspace.chat_context(self.app,self.pid)
        self.assertEqual(context['graphs'],[]);self.assertEqual(context['bundle'],[])
        shell=self.app.prepare_shell(context=context)
        self.assertNotIn('graph-explorer',[s['name'] for s in suite.read_json(shell/'suite-launch.json')['skills']])
        self.assertNotIn('lettura-documentazione-tecnico-funzionale',[s['name'] for s in suite.read_json(shell/'suite-launch.json')['skills']])

    def test_new_sources_are_acquired_without_refresh_and_project_uses_working_folder(self):
        extra=Path(self.temp.name)/'extra';extra.mkdir();(extra/'process.md').write_text('# Processo\nOrdini.\n',encoding='utf-8')
        sid=self.app.sources.save({'kind':'sharepoint-local','path':str(extra),'name':'Processi'})[-1]['id']
        # A Git connection to the same directory must not replace the current working folder.
        self.app.sources.save({'kind':'azure-local','path':str(self.root),'branch':'main','name':'Commit storico'})
        ids=workspace.prepare_sources(self.app,{'project':self.pid,'graphs':[],'sources':[sid]},'prepare-documentation')
        result=self.app.prepare_technical_functional_documentation(ids,refresh=False,project=self.pid)
        self.assertEqual(len(result['sources']),2)
        self.assertEqual({r['manifest']['kind'] for r in result['sources']},{'sharepoint-local'})

    def test_final_markdown_graph_is_published_selected_and_removable(self):
        folder=self.dossier();calls=[]
        def complete(request,*args):
            calls.append(request)
            return {'graph':{'nodes':[],'edges':[]}}
        with patch.object(self.app,'document_graph_profile',return_value=self.profile),patch.object(self.app,'_document_graph_completion',side_effect=complete):
            result=self.app.finalize_documentation(folder)
        self.assertTrue(calls)
        analyzed={r['context'].get('path') for r in calls if r['phase']=='documents'}
        self.assertEqual(analyzed,{'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md'})
        item=workspace.graph_entry(self.app,self.pid,result['graph'])
        graph=suite.document_graph.load_graph(self.app.home,item['reference'])
        self.assertEqual(graph['stats']['documents'],1)
        self.assertIsNone(suite.document_graph.current_ref(self.app.home,self.pid))
        context=workspace.chat_context(self.app,self.pid)
        self.assertEqual([g['id'] for g in context['graphs']],[result['graph']]);self.assertEqual(len(context['documentation']),1)
        self.assertEqual(context['bundle'][0]['manifest']['kind'],'documentation')
        shell=self.app.prepare_shell(context=context)
        names=[s['name'] for s in suite.read_json(shell/'suite-launch.json')['skills']]
        self.assertIn('graph-explorer',names);self.assertIn('lettura-documentazione-tecnico-funzionale',names)
        self.app.remove_graph(self.pid,result['graph'])
        self.assertEqual([g for g in workspace.inventory(suite.Suite(self.app.home),self.pid)['graphs'] if g.get('selectable',True)],[])
        self.assertEqual(workspace.chat_context(self.app,self.pid)['graphs'],[])
        self.assertTrue((folder/'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md').is_file())

    def test_refresh_only_after_integrated_changes_and_updates_same_id(self):
        folder=self.dossier()
        with patch.object(self.app,'document_graph_profile',return_value=self.profile),patch.object(self.app,'_document_graph_completion',return_value={'graph':{'nodes':[],'edges':[]}}):
            result=self.app.finalize_documentation(folder)
        refresh(self.app,self.root,baseline=True)
        with patch.object(self.app,'finalize_documentation') as finalize:
            self.assertEqual(refresh(self.app,self.root),[]);finalize.assert_not_called()
            # Una modifica al progetto non ri-registra il dossier: conta solo il suo documento.
            (self.root/'requirements.md').write_text('# Ordini aggiornati\n',encoding='utf-8')
            self.assertEqual(refresh(self.app,self.root),[]);finalize.assert_not_called()
            (folder/'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md').write_text('# documentazione tecnico funzionale\n## Processo ordini\nAggiornato.\n',encoding='utf-8')
            self.assertEqual(refresh(self.app,self.root),[result['graph']]);finalize.assert_called_once_with(str(folder),auto_select=False)

    def test_failed_semantic_generation_does_not_publish_graph(self):
        folder=self.dossier()
        with patch.object(self.app,'document_graph_profile',side_effect=ValueError('Modello assente')):
            with self.assertRaisesRegex(ValueError,'Modello assente'):self.app.finalize_documentation(folder)
        self.assertEqual(workspace.chat_context(self.app,self.pid)['graphs'],[])

    def test_code_graph_refresh_updates_context_snapshot_with_stable_id(self):
        try:import graphify.extract
        except ImportError:self.skipTest('Graphify non installato in questo interprete')
        code=self.root/'main.py';code.write_text('def before():\n    return 1\n',encoding='utf-8')
        result=self.app.generate_graph({'project':self.pid});identifier=result['graph']
        self.app.save_project_references(self.pid,'documentation',{'graphs':[identifier]})
        context_path=self.app.home/'context.json';suite.save_json(context_path,workspace.chat_context(self.app,self.pid))
        old=suite.read_json(context_path)['graphs'][0]['snapshot'];refresh(self.app,self.root,context_path,baseline=True)
        self.assertEqual(refresh(self.app,self.root,context_path),[])
        code.write_text('def after():\n    return 2\n',encoding='utf-8')
        self.assertEqual(refresh(self.app,self.root,context_path),[identifier])
        context=suite.read_json(context_path)
        self.assertEqual(context['graphs'][0]['id'],identifier);self.assertNotEqual(context['graphs'][0]['snapshot'],old)
        self.assertTrue(self.app.graph(self.pid,query='after',identifier=identifier)['nodes'])
        self.assertEqual(context['bundle'][0]['snapshot'],context['graphs'][0]['snapshot'])

    def test_refreshing_unselected_documentation_graph_preserves_selection(self):
        folder=self.dossier()
        with patch.object(self.app,'document_graph_profile',return_value=self.profile),patch.object(self.app,'_document_graph_completion',return_value={'graph':{'nodes':[],'edges':[]}}):
            result=self.app.finalize_documentation(folder)
            self.app.save_project_references(self.pid,'documentation',{'graphs':[],'documents':[]})
            context_path=self.app.home/'context.json';suite.save_json(context_path,workspace.chat_context(self.app,self.pid))
            refresh(self.app,self.root,context_path,baseline=True)
            doc=folder/'DOCUMENTAZIONE-TECNICO-FUNZIONALE.md';doc.write_text(doc.read_text(encoding='utf-8')+'\n## Operatività\nNon documentata.\n',encoding='utf-8')
            self.assertEqual(refresh(self.app,self.root,context_path),[result['graph']])
        self.assertEqual(suite.read_json(context_path)['graphs'],[])
        self.assertEqual(suite.read_json(context_path)['documentation'],[])
        self.assertEqual(workspace.chat_context(self.app,self.pid)['graphs'],[])


if __name__=='__main__':unittest.main()
