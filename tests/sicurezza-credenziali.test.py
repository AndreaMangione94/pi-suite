# Uso: python tests/sicurezza-credenziali.test.py .   (dalla radice del repository)
import http.server, json, os, subprocess, sys, tempfile, threading
from pathlib import Path
from unittest.mock import patch

repo = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
sys.path.insert(0, str(repo))
os.chdir(repo)
tempfile.tempdir = str(repo / 'tests' / 'tmp')
import suite_byok as byok
import suite_workspace as workspace
from suite import Suite
from suite_sources import sensitive_path


def node(code, env=None):
    result = subprocess.run(
        ['node', '--input-type=module', '-e', code],
        cwd=repo,
        capture_output=True,
        text=True,
        encoding='utf-8',
        env=env,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


# La regola sui file sensibili è la stessa in Python e in delegation-core.mjs.
names = [
    '.env',
    '.env.local',
    '.env.example',
    'config/secrets.prod.yml',
    'secrets.example.json',
    'client_secret.json',
    'server.key',
    'id_rsa',
    'id_rsa.pub',
    '.ssh/config',
    'home/.aws/credentials',
    'auth.json',
    'credentials.dpapi.json',
    'src/secrets.py',
    'package.json',
    'Terraform.TFSTATE',
]
python_rule = {n: sensitive_path(n) for n in names}
js_rule = json.loads(
    node(
        "import {isSensitivePath} from './delegation-core.mjs';console.log(JSON.stringify(Object.fromEntries("
        + json.dumps(names)
        + '.map(n=>[n,isSensitivePath(n)]))))'
    )
)
assert python_rule == js_rule, (python_rule, js_rule)
assert python_rule['.env'] and not python_rule['.env.example'] and not python_rule['src/secrets.py']

# Le origini calcolate in Python coincidono con URL.origin di Node.
urls = [
    'https://API.openai.com/v1',
    'http://127.0.0.1:11434/v1',
    'https://example.com:443/a',
    'http://[::1]:8080/v1',
    'https://generativelanguage.googleapis.com/v1beta',
]
assert [byok.url_origin(u) for u in urls] == json.loads(
    node('console.log(JSON.stringify(' + json.dumps(urls) + '.map(u=>new URL(u).origin)))')
)

# CONTESTO.json: valido solo nei dossier e nelle sessioni dell'area dati.
home = Path(tempfile.mkdtemp()).resolve()
for folder in ('documentation/d1', 'sessions', 'projects/p'):
    (home / folder).mkdir(parents=True)
for file in ('documentation/d1/CONTESTO.json', 'sessions/context-1.json', 'projects/p/CONTESTO.json', 'CONTESTO.json'):
    (home / file).write_text('{}', encoding='utf-8')
assert workspace.suite_context_file(home, home / 'documentation/d1/CONTESTO.json') and workspace.suite_context_file(
    home, home / 'sessions/context-1.json'
)
assert not workspace.suite_context_file(home, home / 'projects/p/CONTESTO.json') and not workspace.suite_context_file(
    home, home / 'CONTESTO.json'
)
assert not workspace.suite_context_file(home, home / 'documentation/assente/CONTESTO.json')
print('Regole file sensibili, origini e CONTESTO.json OK')

# Server finti: il provider della connessione e un'altra origine che non deve mai ricevere la chiave.
received = []


class Recorder(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        received.append(
            {
                'port': self.server.server_port,
                'path': self.path,
                'headers': {k.lower(): v for k, v in self.headers.items()},
                'body': body.decode(),
            }
        )
        raw = b'{"ok":true}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    do_GET = do_POST


servers = [http.server.ThreadingHTTPServer(('127.0.0.1', 0), Recorder) for _ in range(2)]
for server in servers:
    threading.Thread(target=server.serve_forever, daemon=True).start()
provider, other = (f'http://127.0.0.1:{s.server_port}' for s in servers)

# Una connessione con chiave protetta: nell'ambiente di Pi resta solo il segnaposto.
SECRET = 'sk-test-' + os.urandom(12).hex()
app = Suite(home)
config = {
    'schemaVersion': 1,
    'connections': [
        {
            'id': 'test',
            'name': 'Test',
            'providerType': 'custom',
            'protocol': 'openai-completions',
            'baseUrl': provider + '/v1',
            'auth': {'type': 'secret', 'ref': 'byok/test'},
            'models': [byok.model_from_legacy({'id': 'm'})],
        }
    ],
    'profiles': {},
}
app.settings.update(app.byok.save(config, [{'id': 'test', 'apiKey': SECRET}]))
with (
    patch.object(Suite, 'models', lambda self: [{'provider': 'test', 'model': 'm', 'baseUrl': provider + '/v1'}]),
    patch.dict(os.environ, {'OPENAI_API_KEY': 'da-rimuovere'}),
):
    env = app.secret_environment()
assert env['PI_SUITE_KEY_TEST'] == 'pi-suite-credential:PI_SUITE_KEY_TEST'
assert not any(SECRET in value for value in env.values()), "chiave in chiaro nell'ambiente"
assert 'OPENAI_API_KEY' not in env and json.loads(env['PI_SUITE_CREDENTIAL_ORIGINS']) == {
    'PI_SUITE_KEY_TEST': [provider]
}
assert env['PI_SUITE_HOME'] == str(home) and 'byok-network.mjs' in env['NODE_OPTIONS'] and app.credential_notices == []
# Endpoint non determinabile (per esempio Azure nativo senza baseUrl): resta il comportamento precedente, con avviso.
with patch.object(Suite, 'models', lambda self: [{'provider': 'test', 'model': 'm', 'baseUrl': ''}]):
    legacy = app.secret_environment()
assert (
    legacy['PI_SUITE_KEY_TEST'] == SECRET
    and json.loads(legacy['PI_SUITE_CREDENTIAL_ORIGINS']) == {}
    and 'baseUrl' in app.credential_notices[0]
)

# L'helper restituisce la chiave solo per una connessione con chiave protetta.
helper = [env['PI_SUITE_PYTHON'], '-E', '-s', str(repo / 'suite_credentials.py')]
answer = subprocess.run(
    helper + ['PI_SUITE_KEY_TEST'], env=env, capture_output=True, text=True, encoding='utf-8', timeout=30
)
assert answer.returncode == 0 and answer.stdout == SECRET, answer.stderr
missing = subprocess.run(
    helper + ['PI_SUITE_KEY_ALTRA'], env=env, capture_output=True, text=True, encoding='utf-8', timeout=30
)
assert missing.returncode == 1 and 'non trovata' in missing.stderr and SECRET not in missing.stderr

# byok-network.mjs inserisce la chiave solo verso l'origine della connessione, anche con Request e corpo.
# Pi 1.0 sostituisce globalThis.fetch con il proprio undici dopo l'avvio: la politica deve restare attiva.
script = f"""
const nodeFetch=globalThis.fetch;await import({json.dumps((repo / 'byok-network.mjs').as_uri())});const policy=globalThis.fetch;
let replaced=0;globalThis.fetch=(input,init)=>{{replaced++;return nodeFetch(input,init);}};
const key=process.env.PI_SUITE_KEY_TEST,out={{samePolicy:globalThis.fetch===policy}};
out.envLeak=Object.values(process.env).some(v=>v.includes({json.dumps(SECRET)}));
await fetch('{provider}/v1/chat/completions',{{method:'POST',headers:{{authorization:'Bearer '+key,'content-type':'application/json'}},body:'{{"a":1}}'}});
await fetch(new Request('{provider}/v1/messages',{{method:'POST',headers:{{'x-api-key':key}},body:'{{"b":2}}'}}));
await fetch('{provider}/altro',{{headers:{{'x-custom':'senza segnaposto'}}}});
try{{await fetch('{other}/v1/chat/completions',{{method:'POST',headers:{{authorization:'Bearer '+key}},body:'{{}}'}});out.other='inviata';}}catch(e){{out.other=e.message;}}
out.replaced=replaced;globalThis.fetch=policy;out.restored=globalThis.fetch===policy;
console.log(JSON.stringify(out));
"""
out = json.loads(node(script, {**env, 'NODE_OPTIONS': ''}))
assert out['envLeak'] is False and out['samePolicy'] and out['restored'] and out['replaced'] == 3, out
assert 'non può essere inviata a ' + other in out['other'], out
assert [r['port'] for r in received] == [servers[0].server_port] * 3, received
chat, messages, plain = received
assert chat['headers']['authorization'] == 'Bearer ' + SECRET and chat['body'] == '{"a":1}'
assert messages['headers']['x-api-key'] == SECRET and messages['body'] == '{"b":2}'
assert plain['headers']['x-custom'] == 'senza segnaposto'
for server in servers:
    server.shutdown()
print("Chiavi fuori dall'ambiente, helper DPAPI e sostituzione per origine OK")
