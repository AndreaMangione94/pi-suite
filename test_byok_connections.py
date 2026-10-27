import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from suite import Suite
from suite_byok import endpoint, env_name, parse


class ConnectionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app=Suite(Path(self.temp.name))
        self.app.byok.protect=lambda value, decrypt=False: value.removeprefix('encrypted:') if decrypt else 'encrypted:'+value
        self.app._commit_byok=self.commit
        self.group={'name':'test','vendor':'customendpoint','apiKey':'${key}',
                    'models':[{'id':'Qwen3.8-27B','name':'Qwen3.8-27B','url':'https://gateway.example/v1/chat/completions'}]}

    def commit(self,config,updates=()):
        self.app.settings.update(self.app.byok.save(config,updates))
        return self.app.public_settings()

    def save(self,group=None,selected='',key=''):
        return self.app.save_connection({'content':json.dumps([group or self.group]),'connectionId':selected,
                                         'revision':self.app.byok.revision(),'apiKey':key})

    def test_single_save_adds_connection_and_protects_key(self):
        result=self.save(key='test-key')
        self.assertEqual(len(result['providers']),1)
        provider=result['providers'][0]
        self.assertTrue(provider['hasKey'])
        self.assertNotIn('test-key',json.dumps(result))
        self.assertNotIn('test-key',self.app.byok.export('json'))
        self.assertEqual(self.app.byok.secret(provider),'test-key')
        self.assertEqual(provider['auth'],{'type':'secret','ref':'byok/'+provider['id']})
        runtime=self.app._runtime_providers(self.app.settings)[provider['id']]
        self.assertEqual(runtime['apiKey'],'${'+env_name(provider['id'])+'}')
        self.assertEqual(self.app.secret_environment()[env_name(provider['id'])],'test-key')

    def test_edit_keeps_identity_and_key_when_name_changes(self):
        provider=self.save(key='test-key')['providers'][0]
        self.group['name']='Nuovo nome'
        result=self.save(selected=provider['id'])
        edited=result['providers'][0]
        self.assertEqual(len(result['providers']),1)
        self.assertEqual(edited['id'],provider['id'])
        self.assertEqual(edited['auth'],provider['auth'])
        self.assertEqual(edited['name'],'Nuovo nome')
        self.assertEqual(self.app.byok.secret(edited),'test-key')

    def test_canonical_env_auth_provides_credential_to_pi_without_storing_it(self):
        config=parse(json.dumps([self.group]),'json')
        config['connections'][0]['auth']={'type':'env','name':'test_API_KEY'}
        with patch.dict('os.environ',{'test_API_KEY':'test-env-key'}):
            result=self.app.save_connection({'content':json.dumps(config),'revision':self.app.byok.revision()})
            provider=result['providers'][0]
            self.assertTrue(provider['hasKey'])
            environment=self.app.secret_environment()
            self.assertEqual(environment[env_name(provider['id'])],'test-env-key')
            self.assertNotIn('test_API_KEY',environment)
            runtime=self.app._runtime_providers(self.app.settings)[provider['id']]
            self.assertEqual(runtime['apiKey'],'${'+env_name(provider['id'])+'}')
            self.assertNotIn('test-env-key',self.app.byok.export('json'))
            self.assertEqual(self.app.byok.vault,{})

    def test_custom_endpoint_preserves_model_settings_and_protects_key(self):
        self.group['apiType']='chat-completions'
        self.group['models'][0].update(url='http://10.0.0.1:4000/v1/chat/completions',
            apiType='chat-completions',reasoningEffortFormat='chat-completions',toolCalling=True,
            vision=True,thinking=True,supportsReasoningEffort=['none','low','medium','xhigh'],
            maxInputTokens=120832,maxOutputTokens=32768)
        self.group['settings']={'Qwen3.8-27B':{'reasoningEffort':'xhigh'}}
        provider=self.save(key='test-key')['providers'][0]
        self.assertEqual(provider['baseUrl'],'http://10.0.0.1:4000/v1')
        self.assertEqual(self.app.byok.secret(provider),'test-key')
        model=self.app.byok.config()['connections'][0]['models'][0]
        self.assertEqual(model['limits'],{'contextWindow':153600,'maxOutputTokens':32768})
        self.assertEqual(model['reasoning'],{'enabled':True,'levels':['off','low','medium','xhigh'],'defaultEffort':'xhigh'})
        runtime_model=self.app._runtime_providers(self.app.settings)[provider['id']]['models'][0]
        self.assertEqual(runtime_model['thinkingLevelMap'],
            {'off':'none','minimal':None,'low':'low','medium':'medium','high':None,'xhigh':'xhigh','max':None})
        self.assertNotIn('thinkingLevelMap',self.app.settings['providers'][0]['models'][0])
        exported=self.app.byok.export('json')
        self.assertNotIn('chat.lm.secret',exported)
        self.assertNotIn('test-key',exported)

    def test_http_is_allowed_only_for_loopback_and_explicit_private_addresses(self):
        for host in ('127.0.0.1','localhost','10.0.0.1','172.16.0.1','192.168.1.1','[fd00::1]'):
            with self.subTest(host=host):
                self.assertEqual(endpoint('http://'+host+':4000/v1','url'),'http://'+host+':4000/v1')
        for host in ('198.51.100.1','172.32.0.1','192.0.2.1','169.254.169.254','0.0.0.0','224.0.0.1','gateway.example','[fe80::1]'):
            with self.subTest(host=host),self.assertRaises(ValueError):
                endpoint('http://'+host+':4000/v1','url')

    def test_key_placeholder_requires_suite_credential_and_rejects_external_references(self):
        provider=self.save()['providers'][0]
        self.assertFalse(provider['hasKey'])
        with self.assertRaisesRegex(ValueError,'Credenziale assente'):
            self.app.byok.secret(provider)
        before=self.app.byok.revision()
        for value in ('${input:chat.lm.secret.test-reference}','${env:API_KEY}','${input:other}','plain-secret',None):
            self.group['apiKey']=value
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError,'usa solo'):
                    self.save()
                self.assertEqual(self.app.byok.revision(),before)

    def test_incompatible_reasoning_format_is_not_silently_discarded(self):
        self.group['models'][0]['reasoningEffortFormat']='responses'
        with self.assertRaisesRegex(ValueError,'reasoningEffortFormat'):
            self.save()

    def test_non_custom_vendors_are_rejected_without_partial_save(self):
        before=self.app.byok.revision()
        for vendor in ('copilot','other'):
            for groups in ([{'name':'Other','vendor':vendor}],
                           [self.group,{'name':'Other','vendor':vendor}]):
                with self.subTest(vendor=vendor,mixed=len(groups)>1):
                    with self.assertRaisesRegex(ValueError,'supportato solo customendpoint'):
                        self.app.save_connection({'content':json.dumps(groups),'revision':before})
                    self.assertEqual(self.app.byok.revision(),before)

    def test_http_and_missing_secret_are_reported_after_save(self):
        self.group['models'][0]['url']='http://10.0.0.1:4000/v1/chat/completions'
        result=self.save()
        notices=' '.join(result['connectionNotices'])
        self.assertIn('in chiaro',notices)
        self.assertIn('Chiave API mancante',notices)
        self.assertFalse(result['providers'][0]['hasKey'])

    def test_changed_destination_requires_key_reassociation(self):
        provider=self.save(key='test-key')['providers'][0]
        self.group['models'][0]['url']='https://new.example/v1/chat/completions'
        with self.assertRaisesRegex(ValueError,'reinserisci la chiave'):
            self.save(selected=provider['id'])
        result=self.save(selected=provider['id'],key='new-test-key')
        self.assertEqual(self.app.byok.secret(result['providers'][0]),'new-test-key')

    def test_invalid_or_multiple_connections_do_not_change_saved_configuration(self):
        before=self.app.byok.revision()
        with self.assertRaises(ValueError):
            self.app.save_connection({'content':json.dumps([self.group,self.group]),'revision':before})
        with self.assertRaisesRegex(ValueError,'chiave duplicata'):
            self.app.save_connection({'content':'{"schemaVersion":1,"schemaVersion":1}','revision':before})
        self.assertEqual(self.app.byok.revision(),before)

    def test_new_connection_cannot_silently_overwrite_existing_one(self):
        self.save()
        with self.assertRaisesRegex(ValueError,'gia presente'):
            self.save()

    def test_duplicate_json_field_on_first_connection_identifies_field_without_exposing_values(self):
        before=self.app.byok.revision()
        self.assertEqual(self.app.byok.config()['connections'],[])
        content=json.dumps([self.group]).replace('"vendor": "customendpoint"',
            '"vendor": "customendpoint", "settings": {"private-value": "not-for-errors"}, "settings": {}')
        with self.assertRaisesRegex(ValueError,'chiave duplicata "settings" nello stesso oggetto') as error:
            self.app.save_connection({'content':content,'revision':before,'apiKey':'test-key'})
        self.assertIn('non riguarda le configurazioni salvate o la chiave API',str(error.exception))
        self.assertNotIn('private-value',str(error.exception))
        self.assertNotIn('not-for-errors',str(error.exception))
        self.assertNotIn('test-key',str(error.exception))
        self.assertEqual(self.app.byok.revision(),before)
        result=self.save(key='test-key')
        self.assertEqual(len(result['providers']),1)
        self.assertTrue(result['providers'][0]['hasKey'])

    def test_same_fields_in_distinct_model_objects_are_not_duplicates(self):
        self.group['models'].append({**self.group['models'][0],'id':'another-model','name':'Another model'})
        result=self.save()
        self.assertEqual(len(result['providers'][0]['models']),2)

    def test_stale_revision_does_not_save(self):
        with self.assertRaisesRegex(ValueError,'Configurazione cambiata'):
            self.app.save_connection({'content':json.dumps([self.group]),'revision':'old'})

    def test_canonical_json_edit_retains_other_connections_and_roles(self):
        provider=self.save()['providers'][0]
        config=self.app.byok.config()
        config['profiles']={'orchestrator':{'connectionId':provider['id'],'modelId':'Qwen3.8-27B','effort':'off'}}
        self.commit(config)
        other={**self.group,'name':'Altro endpoint'}
        self.save(other)
        connection=self.app.byok.config()['connections'][0]
        connection['name']='Endpoint aggiornato'
        result=self.app.save_connection({'content':json.dumps({'schemaVersion':1,'connections':[connection]}),
                                        'connectionId':provider['id'],'revision':self.app.byok.revision()})
        self.assertEqual(len(result['providers']),2)
        self.assertEqual(result['roles']['orchestrator']['provider'],provider['id'])


if __name__=='__main__':unittest.main()