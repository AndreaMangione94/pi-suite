import uuid
import json
import subprocess
import sys
import time
import unittest
import zipfile
from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from suite import Suite
from suite_sources import write as save_json
from suite_graph import build_graph
from suite_workspace import inventory, read_file, selected_graphs, source_references
from suite_evidence import query
from test_document_graph import ModelFixtureSuite


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).resolve().parent/'.test-suite'/uuid.uuid4().hex
        self.root.mkdir(parents=True)
        self.repo=self.root/'repo';self.repo.mkdir()
        (self.repo/'main.py').write_text('def saluta():\n    return "ciao"\n',encoding='utf-8')
        self.app=ModelFixtureSuite(self.root/'data')
        self.project=self.app.add_project(str(self.repo),'Progetto A')
        self.pid=self.project['id']

    def graph(self):
        graph=build_graph(self.repo,self.app.cache,prefix='repo/')
        save_json(self.app.home/'graphs'/self.pid/'graph.json',graph)
        return 'project:'+self.pid

    def wait(self):
        deadline=time.monotonic()+15
        while self.app.busy and time.monotonic()<deadline:time.sleep(.02)
        self.assertFalse(self.app.busy)
        self.assertEqual(self.app.job['state'],'done',self.app.job)

    def test_no_graph_and_foreign_graph_cannot_create_dossier(self):
        for operation in ('prepare-asis','auto-asis'):
            with self.assertRaisesRegex(ValueError,'grafo di conoscenza'):
                self.app.start(operation,{'project':self.pid,'graphs':[],'openChat':False})
        gid=self.graph()
        other=self.app.add_project(name='Progetto B')
        with self.assertRaises(ValueError):
            self.app.start('auto-asis',{'project':other['id'],'graphs':[gid],'openChat':False})
        self.assertFalse(self.app.busy)
        self.assertFalse((self.app.home/'documentation').exists())

    def test_project_graph_produces_scoped_dossier_and_files_survive_reload(self):
        gid=self.graph()
        self.app.start('prepare-asis',{'operation':'prepare-asis','project':self.pid,'graphs':[gid],'openChat':False})
        self.wait()
        folder=Path(self.app.job['result']['workspace'])
        (folder/'AS-IS.md').write_text('# Stato attuale\n',encoding='utf-8')
        (folder/'ARCHITETTURA.md').write_text('# Architettura\n',encoding='utf-8')
        files=inventory(self.app,self.pid)
        self.assertEqual({f['name'] for f in files['asis']},{'AS-IS.md','ARCHITETTURA.md'})
        self.assertTrue(all(f['createdAt'] for f in files['asis']+files['graphs']))
        self.assertEqual(read_file(self.app,self.pid,files['asis'][0]['id'])['text'],'# Architettura\n')
        other=self.app.add_project(name='Progetto B')
        self.assertEqual(inventory(self.app,other['id']),{'asis':[],'graphs':[]})
        with self.assertRaises(ValueError):read_file(self.app,other['id'],files['asis'][0]['id'])
        restored=Suite(self.app.home)
        self.assertEqual(inventory(restored,self.pid),files)

    def test_only_linked_or_local_source_graphs_are_selectable(self):
        external=self.root/'external';external.mkdir()
        (external/'spec.md').write_text('# Requisiti\nREQ-1: approvazione ordine.',encoding='utf-8')
        sid=self.app.sources.save({'name':'Specifica','kind':'sharepoint-local','path':str(external)})[-1]['id']
        self.app.sources.sync(sid)
        self.assertEqual(inventory(self.app,self.pid)['graphs'],[])
        self.app.save_project_references(self.pid,'asis',{'sources':[sid]})
        files=inventory(self.app,self.pid)
        self.assertEqual([f['id'] for f in files['graphs']],['source:'+sid])
        self.assertFalse(files['graphs'][0]['selectable'])
        self.app.build_document_graph(self.pid,[sid])
        self.app.start('auto-asis',{'operation':'auto-asis','project':self.pid,'graphs':['document:'+self.pid],'openChat':False})
        self.wait()
        save_json(self.app.home/'sources'/sid/'current.json',{'snapshot':'missing'})
        with self.assertRaises((ValueError,OSError)):
            self.app.start('prepare-asis',{'project':self.pid,'graphs':['document:'+self.pid],'openChat':False})

    def document_source(self):
        folder=self.root/'sharepoint';folder.mkdir()
        with zipfile.ZipFile(folder/'specifica.docx','w') as archive:
            archive.writestr('word/document.xml','''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Requisiti ordini</w:t></w:r></w:p><w:p><w:r><w:t>REQ-17: approvazione ordine.</w:t></w:r></w:p></w:body></w:document>''')
        writer=PdfWriter();page=writer.add_blank_page(width=400,height=400)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
        content=DecodedStreamObject();content.set_data(b'BT /F1 12 Tf 30 350 Td (PROC-3: approvazione ordine.) Tj ET')
        page[NameObject('/Contents')]=writer._add_object(content)
        with (folder/'procedura.pdf').open('wb') as stream:writer.write(stream)
        return self.app.sources.save({'name':'Documentazione SharePoint','kind':'sharepoint-local','path':str(folder)})[-1]['id']

    def test_document_graphs_are_generated_without_dossier_then_reused_by_asis(self):
        sid=self.document_source()
        self.app.save_project_references(self.pid,'graph',{'sources':[sid],'evidenceQuery':'ordine'})
        self.app.start('document-graphs',{'project':self.pid,'sources':[sid,sid]})
        self.wait()
        self.assertEqual(self.app.job['result']['stats']['documents'],2)
        self.assertFalse((self.app.home/'documentation').exists())
        graph=inventory(self.app,self.pid)['graphs'][0]
        self.assertEqual(graph['id'],'document:'+self.pid)
        self.assertEqual(graph['kind'],'document')
        bundle=self.app.sources.knowledge_bundle([sid]);snapshot=bundle[0]['snapshot']
        self.assertEqual(len(bundle[0]['manifest']['documents']),2)
        result=query(bundle,'knowledge_search',{'query':'REQ-17'})
        self.assertTrue(result['hits'])
        self.assertTrue(any(n['kind']=='section' for n in result['nodes']))
        folder=Path(bundle[0]['directory'])
        self.assertTrue((folder/'evidence.sqlite').is_file())
        self.assertFalse((folder/'graph.json').exists())
        self.app.save_project_references(self.pid,'asis',{'graphs':[graph['id']],'objective':'Ordini'})
        self.assertEqual(source_references(self.app.project(self.pid)),[sid])
        self.app.start('prepare-asis',{'project':self.pid,'graphs':[graph['id']],'openChat':False})
        self.wait()
        dossier=Path(self.app.job['result']['workspace'])
        self.assertEqual(json.loads((dossier/'FONTI.json').read_text(encoding='utf-8'))[0]['snapshot'],snapshot)
        brief=(dossier/'INCARICO-AS-IS.md').read_text(encoding='utf-8')
        self.assertLess(brief.index('grafo documentale'),brief.index('grafo del codice'))

    def test_graph_links_migrate_and_remain_authoritative_after_asis_save(self):
        sid=self.document_source()
        self.app.sources.sync(sid)
        self.app.save_project_references(self.pid,'asis',{'sources':[sid]})
        self.app.save_project_references(self.pid,'asis',{'objective':'Mantieni i riferimenti'})
        self.assertEqual(source_references(self.app.project(self.pid)),[sid])
        self.app.save_project_references(self.pid,'graph',{'query':'legacy'})
        restored=Suite(self.app.home)
        self.assertEqual(source_references(restored.project(self.pid)),[sid])
        self.app.build_document_graph(self.pid,[sid])
        code=self.graph()
        ordered=selected_graphs(self.app,{'project':self.pid,'graphs':[code,'document:'+self.pid]})
        self.assertEqual([g['kind'] for g in ordered],['document','project'])
        self.app.start('prepare-asis',{'project':self.pid,'graphs':[code,'document:'+self.pid],'openChat':False})
        self.wait()
        dossier=Path(self.app.job['result']['workspace'])
        self.assertEqual(json.loads((dossier/'FONTI.json').read_text(encoding='utf-8'))[0]['source'],sid)
        self.app.save_project_references(self.pid,'graph',{'sources':[]})
        self.app.save_project_references(self.pid,'asis',{'sources':[sid]})
        self.assertEqual(source_references(self.app.project(self.pid)),[])
        remaining=[g['id'] for g in inventory(self.app,self.pid)['graphs']]
        self.assertIn(code,remaining)
        self.assertNotIn('source:'+sid,remaining)
        other=self.app.add_project(name='Altro progetto')
        with self.assertRaises(ValueError):self.app.start('document-graphs',{'project':other['id'],'sources':[sid]})
        self.assertFalse(self.app.busy)
        with self.assertRaises(ValueError):self.app.save_project_references(self.pid,'graph',{'sources':['inesistente']})

    def test_asis_command_uses_sources_saved_in_graph_management(self):
        folder=self.root/'code';folder.mkdir();(folder/'api.py').write_text('def api(): return 1\n',encoding='utf-8')
        sid=self.app.sources.save({'name':'Codice','kind':'sharepoint-local','path':str(folder)})[-1]['id']
        self.app.save_project_references(self.pid,'graph',{'sources':[sid]})
        script=Path(__file__).resolve().parent/'suite_asis.py'
        result=subprocess.run([sys.executable,str(script),'--home',str(self.app.home),'--project',str(self.repo),'--objective','Ordini'],capture_output=True,text=True,encoding='utf-8',timeout=30)
        self.assertEqual(result.returncode,0,result.stderr)
        dossier=Path(json.loads(result.stdout)['workspace'])
        self.assertEqual(json.loads((dossier/'FONTI.json').read_text(encoding='utf-8'))[0]['source'],sid)


if __name__=='__main__':unittest.main()
