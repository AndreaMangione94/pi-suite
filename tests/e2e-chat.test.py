# Uso: python tests/e2e-chat.test.py .   (dalla radice del repository, dopo npm ci)
# Chat completa senza rete: suite_cli.py avvia Pi con l'estensione della suite verso un provider finto.
import http.server, json, os, subprocess, sys, tempfile, threading
from pathlib import Path

repo = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
sys.path.insert(0, str(repo))
os.chdir(repo)
tempfile.tempdir = str(repo / 'tests' / 'tmp')
import suite_byok as byok
from suite import Suite

if not (repo / 'node_modules' / '@earendil-works' / 'pi-coding-agent').is_dir():
    sys.exit('Dipendenze npm assenti: esegui npm ci')

received = []
STREAM = (
    ''.join(
        'data: ' + json.dumps(chunk) + '\n\n'
        for chunk in (
            {
                'id': 'c',
                'object': 'chat.completion.chunk',
                'created': 1,
                'model': 'm',
                'choices': [{'index': 0, 'delta': {'role': 'assistant', 'content': 'OK-CHAT'}, 'finish_reason': None}],
            },
            {
                'id': 'c',
                'object': 'chat.completion.chunk',
                'created': 1,
                'model': 'm',
                'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}],
                'usage': {'prompt_tokens': 11, 'completion_tokens': 2, 'total_tokens': 13},
            },
        )
    ).encode()
    + b'data: [DONE]\n\n'
)


class Provider(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', '0')))
        received.append({k.lower(): v for k, v in self.headers.items()})
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(STREAM)))
        self.end_headers()
        self.wfile.write(STREAM)


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Provider)
threading.Thread(target=server.serve_forever, daemon=True).start()
home = Path(tempfile.mkdtemp(prefix='chat-')).resolve()
work = home / 'lavoro'
work.mkdir()
SECRET = 'sk-chat-' + os.urandom(10).hex()
app = Suite(home)
connection = {
    'id': 'finto',
    'name': 'Finto',
    'providerType': 'custom',
    'protocol': 'openai-completions',
    'baseUrl': f'http://127.0.0.1:{server.server_port}/v1',
    'auth': {'type': 'secret', 'ref': 'byok/finto'},
    'models': [byok.model_from_legacy({'id': 'm', 'toolCalling': True})],
}
profiles = {'orchestrator': {'connectionId': 'finto', 'modelId': 'm', 'effort': 'off'}}
app.byok.save(
    {'schemaVersion': 1, 'connections': [connection], 'profiles': profiles}, [{'id': 'finto', 'apiKey': SECRET}]
)

env = {k: v for k, v in os.environ.items() if not k.startswith('PI_SUITE_')}
env.update(PI_SUITE_HOME=str(home), PYTHONUTF8='1')
run = subprocess.run(
    [sys.executable, str(repo / 'suite_cli.py'), '-p', 'Rispondi'],
    cwd=work,
    env=env,
    capture_output=True,
    text=True,
    encoding='utf-8',
    errors='replace',
    timeout=240,
)
server.shutdown()
assert run.returncode == 0 and 'OK-CHAT' in run.stdout, run.stdout[-1500:] + run.stderr[-1500:]
assert received and received[0].get('authorization') == 'Bearer ' + SECRET, received
assert SECRET not in run.stdout + run.stderr
# Il turno dell'orchestratore è nel registro dei consumi della sessione (/consumi).
rows = [
    json.loads(line) for f in (home / 'metrics').glob('*.jsonl') for line in f.read_text(encoding='utf-8').splitlines()
]
assert any(r['kind'] == 'parent' and r['input'] == 11 and r['output'] == 2 for r in rows), rows
print('Chat completa: launcher, estensione della suite, chiave sostituita per origine e consumi OK')
