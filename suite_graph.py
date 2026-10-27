"""Persistent, content-addressed Graphify AST cache. No LLM/network calls."""
import hashlib
import contextlib
import importlib.metadata
import json
import os
import sqlite3
import subprocess
import time
from pathlib import Path

SKIP = {'.git', '.venv', 'node_modules', '__pycache__', 'runtime', 'suite-data', 'dist', 'build'}
LIMITS = ['AST per file Python/JavaScript/TypeScript; nessuna risoluzione globale dei simboli.',
          'Relazioni strutturali estratte, non dipendenze semantiche verificate.',
          'Solo file UTF-8 non nascosti, fino a 200 KB; nessuna chiamata a modelli.']

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def project_files(root):
    root = Path(root).resolve()
    result = subprocess.run(['git', '-C', str(root), 'ls-files', '-z'], capture_output=True, check=True)
    return sorted(n for n in result.stdout.decode('utf-8').split('\0') if n and
                  not any(part.startswith('.') or part in SKIP for part in Path(n).parts))

def scan(root, names=None):
    root = Path(root).resolve()
    if names is None:
        names = []
        for directory, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in SKIP and not (Path(directory)/d).is_symlink()]
            names.extend((Path(directory)/f).relative_to(root).as_posix() for f in files if not f.startswith('.'))
    if len(names) > 10000:
        raise ValueError('Progetto oltre 10.000 file: selezionare un repository più piccolo.')
    entries = []
    total = 0
    for name in sorted(names):
        p = root/name
        if p.is_symlink() or not p.resolve().is_relative_to(root) or not p.is_file():
            continue
        if p.stat().st_size > 200000:
            entries.append((name, None, 'large_file')); continue
        raw = p.read_bytes(); total += len(raw)
        if total > 100_000_000:
            raise ValueError('Progetto oltre 100 MB testuali: ridurre il perimetro.')
        try: raw.decode('utf-8')
        except UnicodeDecodeError:
            entries.append((name, None, 'non_utf8')); continue
        entries.append((name, None if b'\0' in raw else digest(raw), 'binary' if b'\0' in raw else 'text'))
    return entries

def fingerprint(entries):
    return digest(json.dumps(entries, ensure_ascii=False).encode())

def build_graph(root, cache, names=None, prefix='', base=None):
    from graphify.extract import extract_python, extract_js
    root, cache = Path(root).resolve(), Path(cache)
    cache.parent.mkdir(parents=True, exist_ok=True)
    version = importlib.metadata.version('graphifyy')
    entries = scan(root, names)
    nodes, edges, coverage = [], [], []
    reused = extracted = 0
    with contextlib.closing(sqlite3.connect(cache, timeout=60)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS extracts(key TEXT PRIMARY KEY, data TEXT NOT NULL)')
        for name, hash_value, status in entries:
            rel = prefix+name
            ext = Path(name).suffix.lower()
            extractor = extract_python if ext == '.py' else extract_js if ext in ('.js','.jsx','.ts','.tsx','.mjs','.cjs') else None
            if hash_value is None or not extractor:
                coverage.append({'file':rel, 'status':status if hash_value is None else 'no_ast_parser'}); continue
            # Same bytes and basename reuse extraction across checkout, snapshot, and sessions.
            # Git can normalize CRLF in a checkout to LF in a committed snapshot.
            ast_hash = digest((root/name).read_bytes().replace(b'\r\n',b'\n'))
            key = digest((version+'|'+Path(name).name+'|'+ast_hash).encode())
            row = db.execute('SELECT data FROM extracts WHERE key=?', (key,)).fetchone()
            if row:
                result = json.loads(row[0]); reused += 1
            else:
                result = extractor(root/name)
                if digest((root/name).read_bytes()) != hash_value:
                    raise ValueError('Il file è cambiato durante l’indicizzazione: '+name)
                if result.get('error'):
                    coverage.append({'file':rel,'status':'parse_error','error':str(result['error'])}); continue
                db.execute('INSERT OR REPLACE INTO extracts VALUES(?,?)', (key,json.dumps(result)))
                extracted += 1
            identifier = digest(rel.encode())[:12]+':'
            for n in result.get('nodes',[]):
                nodes.append({**n,'id':identifier+n['id'],'source_file':rel})
            for e in result.get('edges',[]):
                edges.append({**e,'source':identifier+e['source'],'target':identifier+e['target'],'source_file':rel})
            coverage.append({'file':rel,'status':'ast_extracted','sha256':hash_value})
    return {'version':version,'nodes':nodes,'edges':edges,'coverage':coverage,'limits':LIMITS,
            'fingerprint':fingerprint(entries),'base':base,'createdAt':time.time(),
            'stats':{'files':len(entries),'extracted':extracted,'reused':reused,'nodes':len(nodes),'edges':len(edges)}}

def query_graph(graph, query='', node_id=None, limit=40):
    limit=max(1,min(int(limit),100))
    matches=[n for n in graph['nodes'] if (n['id']==node_id if node_id else query.lower() in json.dumps(n).lower())]
    nodes=matches[:limit]; ids={n['id'] for n in nodes}
    edges=[e for e in graph['edges'] if e['source'] in ids or e['target'] in ids]
    return {'nodes':nodes,'edges':edges[:200],'totalMatches':len(matches),
            'truncated':len(matches)>limit or len(edges)>200,'stats':graph['stats'],'limits':graph['limits']}
