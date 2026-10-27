import uuid
import time
import unittest
from pathlib import Path
from suite import Suite
from suite_sources import write as save_json
from suite_graph import build_graph
from suite_workspace import inventory, read_file


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).resolve().parent/'.test-suite'/uuid.uuid4().hex
        self.root.mkdir(parents=True)
        self.repo=self.root/'repo';self.repo.mkdir()
        (self.repo/'main.py').write_text('def saluta():\n    return "ciao"\n',encoding='utf-8')
        self.app=Suite(self.root/'data')
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
        self.app.start('auto-asis',{'operation':'auto-asis','project':self.pid,'graphs':['source:'+sid],'openChat':False})
        self.wait()
        save_json(self.app.home/'sources'/sid/'current.json',{'snapshot':'missing'})
        with self.assertRaises((ValueError,OSError)):
            self.app.start('prepare-asis',{'project':self.pid,'graphs':['source:'+sid],'openChat':False})


if __name__=='__main__':unittest.main()
