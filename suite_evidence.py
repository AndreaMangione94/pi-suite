"""Local, versioned evidence indexes. No inference, network or source execution."""
import contextlib
import hashlib
import html
import io
import json
import os
import re
import sqlite3
import shutil
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

VERSION = 'evidence-1'
MAX_TEXT = 5_000_000
MAX_NODES = 100_000
MAX_EDGES = 200_000
CODE_EXTENSIONS={'.py','.js','.jsx','.ts','.tsx','.mjs','.cjs','.cs','.java','.sql','.go','.rs','.ps1','.sh','.css','.vue','.tf','.bicep'}
LIMITS = ['Struttura e riferimenti espliciti, non verita semantica o prova di deployment.',
          'AST Python/JS/TS per file; nessuna risoluzione globale delle chiamate.',
          'SQL CREATE TABLE/FK dichiarativi; nessuna esecuzione o ricostruzione automatica delle migration.',
          'PDF fino a 200 pagine, senza OCR; DOCX senza immagini, note o paginazione renderizzata.']


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode('utf-8')).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def local_path(value):
    value=Path(value).resolve()
    if os.name=='nt' and not str(value).startswith('\\\\?\\'):
        return Path('\\\\?\\UNC\\'+str(value)[2:] if str(value).startswith('\\\\') else '\\\\?\\'+str(value))
    return value


def save(file, value):
    file = local_path(file)
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_name(file.name + '.' + uuid.uuid4().hex + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(file)


def load(file):
    return json.loads(local_path(file).read_text(encoding='utf-8'))


def now():
    return datetime.now(timezone.utc).isoformat()


def line_at(text, offset):
    return text.count('\n', 0, offset) + 1


def extract_document(name, raw):
    """Keep full usable text and a map back to pages/paragraphs; disclose omissions."""
    ext = Path(name).suffix.lower()
    blocks, notes, parts, references = [], [], [], []
    if ext == '.pdf':
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        if len(reader.pages) > 200:
            notes.append('PDF oltre 200 pagine: pagine successive escluse')
        count = 0;next_line=1
        for page_no, page in enumerate(reader.pages[:200], 1):
            value = page.extract_text() or ''
            if count + len(value) > MAX_TEXT:
                notes.append('Testo oltre limite di estrazione'); break
            start = next_line;next_line+=value.count('\n')+1
            parts.append(value); count += len(value)
            blocks.append({'startLine': start, 'endLine': start + value.count('\n'), 'page': page_no})
        text = '\n'.join(parts)
        if not text.strip():
            raise ValueError('PDF senza testo estraibile; OCR non disponibile')
        notes.append('Immagini e ordine di lettura PDF non verificati')
    elif ext == '.docx':
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            entry = z.getinfo('word/document.xml')
            if entry.file_size > 20_000_000:
                raise ValueError('DOCX espanso troppo grande')
            root = ET.fromstring(z.read(entry))
            relationships={}
            if 'word/_rels/document.xml.rels' in z.namelist():
                info=z.getinfo('word/_rels/document.xml.rels')
                if info.file_size>2_000_000:raise ValueError('Relazioni DOCX troppo grandi')
                relationships={n.get('Id'):n.get('Target') for n in ET.fromstring(z.read(info))}
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        w = '{' + ns['w'] + '}'
        paragraph_ranges={};next_line=1;characters=0
        for number, paragraph in enumerate(root.findall('.//w:p', ns), 1):
            value = ''.join(n.text or '' for n in paragraph.findall('.//w:t', ns))
            if characters+len(value)>MAX_TEXT:
                notes.append('Testo oltre limite di estrazione');break
            characters+=len(value)+1
            start = next_line;next_line+=value.count('\n')+1
            style = paragraph.find('w:pPr/w:pStyle', ns)
            style = style.get(w + 'val', '') if style is not None else ''
            parts.append(value)
            item = {'startLine': start, 'endLine': start + value.count('\n'), 'paragraph': number}
            if re.search(r'heading|titolo', style, re.I):
                item.update(title=value, level=int(re.search(r'\d+', style)[0]) if re.search(r'\d+', style) else 1)
            blocks.append(item)
            paragraph_ranges[id(paragraph)]=(start,start+value.count('\n'))
            for link in paragraph.findall('.//w:hyperlink',ns):
                target=relationships.get(link.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'))
                if target:references.append({'target':target,'startLine':start,'endLine':start+value.count('\n')})
        for number, table in enumerate(root.findall('.//w:tbl',ns),1):
            spans=[paragraph_ranges[id(p)] for p in table.findall('.//w:p',ns) if id(p) in paragraph_ranges]
            if spans:blocks.append({'type':'table','label':'Tabella '+str(number),'startLine':min(p[0] for p in spans),'endLine':max(p[1] for p in spans)})
        text = '\n'.join(parts)
        notes.append('Solo corpo DOCX: paragrafi/celle; immagini, intestazioni, note, revisioni e pagine non rappresentati integralmente')
    else:
        if b'\0' in raw:
            raise ValueError('File binario')
        text = raw.decode('utf-8-sig')
    truncated = len(text) > MAX_TEXT or any('escluse' in n or 'limite' in n for n in notes)
    text = text[:MAX_TEXT]
    lines = text.split('\n')
    blocks=[{**b,'endLine':min(len(lines),b['endLine'])} for b in blocks if b['startLine']<=len(lines)]
    references=[{**r,'endLine':min(len(lines),r['endLine'])} for r in references if r['startLine']<=len(lines)]
    if not blocks:
        blocks = [{'startLine': 1, 'endLine': len(lines)}]
    if ext in ('.md', '.rst', '.txt'):
        for i, line in enumerate(lines, 1):
            match = re.match(r'^(#{1,6})\s+(.+)', line)
            if match:
                blocks.append({'startLine': i, 'endLine': i, 'title': match[2].strip(), 'level': len(match[1])})
        for i,line in enumerate(lines):
            if i and '|' in line and re.fullmatch(r'[\s|:\-]+',line) and '-' in line:
                end=i+1
                while end<len(lines) and '|' in lines[end] and lines[end].strip():end+=1
                blocks.append({'type':'table','label':'Tabella riga '+str(i),'startLine':i,'endLine':end})
    elif ext in ('.html', '.htm'):
        for match in re.finditer(r'<h([1-6])\b[^>]*>(.*?)</h\1>', text, re.I | re.S):
            blocks.append({'startLine': line_at(text, match.start()), 'endLine': line_at(text, match.end()),
                           'title': html.unescape(re.sub('<[^>]+>', '', match[2])), 'level': int(match[1])})
        for i,match in enumerate(re.finditer(r'<table\b[^>]*>.*?</table>',text,re.I|re.S),1):
            blocks.append({'type':'table','label':'Tabella '+str(i),'startLine':line_at(text,match.start()),'endLine':line_at(text,match.end())})
    headings = sorted([b for b in blocks if b.get('title')], key=lambda b: b['startLine'])
    for i, heading in enumerate(headings):
        end = next((h['startLine'] - 1 for h in headings[i+1:] if h.get('level', 1) <= heading.get('level', 1)), len(lines))
        heading['endLine'] = max(heading['startLine'], end)
    return {'version': VERSION, 'text': text, 'textSha256': sha(text), 'blocks': blocks,
            'truncated': truncated, 'notes': notes, 'format': ext, 'references':references}


def cached_extract(name, raw, cache):
    key = sha(VERSION + '|' + Path(name).suffix.lower() + '|' + sha(raw))
    cache = Path(cache); cache.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.closing(sqlite3.connect(cache, timeout=60)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS documents(key TEXT PRIMARY KEY, data TEXT NOT NULL)')
        row = db.execute('SELECT data FROM documents WHERE key=?', (key,)).fetchone()
        if row:
            result = json.loads(row[0]); result['cacheReused'] = True; return result
        result = extract_document(name, raw)
        db.execute('INSERT OR REPLACE INTO documents VALUES(?,?)', (key, canonical(result)))
        return {**result, 'cacheReused': False}


def checked_text(folder, doc):
    if not re.fullmatch('[a-f0-9]{20}', doc['id']):
        raise ValueError('ID documento non valido')
    text = (Path(folder) / (doc['id'] + '.txt')).read_bytes().decode('utf-8')
    if not doc.get('original') and sha(text)!=doc['textSha256']:
        # Older Windows releases used write_text's newline conversion.
        legacy=text.replace('\r\n','\n')
        if sha(legacy)==doc['textSha256']:text=legacy
    if sha(text) != doc['textSha256']:
        raise ValueError('Snapshot alterato: ' + doc['path'])
    original = doc.get('original')
    if original:
        expected = 'originals/' + doc['id'] + '.bin'
        if original != expected or sha((Path(folder) / expected).read_bytes()) != doc['sha256']:
            raise ValueError('Originale alterato: ' + doc['path'])
    return text


def sql_declarations(text):
    """Small quote/comment-aware scanner. Reports DDL declarations, never executes SQL."""
    # Mask comments and string literals without shifting source positions.
    clean = list(text); i = 0
    while i < len(text):
        if text.startswith('--', i):
            end = text.find('\n', i); end = len(text) if end < 0 else end
        elif text.startswith('/*', i):
            end = text.find('*/', i + 2); end = len(text) if end < 0 else end + 2
        elif text[i] == "'":
            end = i + 1
            while end < len(text):
                if text[end] == "'":
                    if end + 1 < len(text) and text[end + 1] == "'": end += 2; continue
                    end += 1; break
                end += 1
        else:
            i += 1; continue
        for p in range(i, end):
            if clean[p] != '\n': clean[p] = ' '
        i = end
    clean = ''.join(clean)
    ident = r'(?:"[^"\n]+"|\[[^\]\n]+\]|`[^`\n]+`|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"\n]+"|\[[^\]\n]+\]|`[^`\n]+`|[A-Za-z_][\w$]*))*'
    for match in re.finditer(r'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(' + ident + r')\s*\(', clean, re.I):
        start = match.end(); depth = 1; end = start
        while end < len(clean) and depth:
            depth += (clean[end] == '(') - (clean[end] == ')'); end += 1
        if depth: continue
        table = re.sub(r'[\[\]"`\s]', '', match[1])
        yield {'kind': 'table', 'label': table, 'start': match.start(), 'end': end}
        body = clean[start:end-1]; pieces = []; begin = 0; nesting = 0
        for p, char in enumerate(body):
            nesting += (char == '(') - (char == ')')
            if char == ',' and nesting == 0: pieces.append((begin, body[begin:p])); begin = p + 1
        pieces.append((begin, body[begin:]))
        for offset, piece in pieces:
            column = re.match(r'\s*(' + ident + r')\s+', piece)
            pos = start + offset
            if column and column[1].upper() not in ('CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'EXCLUDE'):
                yield {'kind': 'column', 'label': table + '.' + re.sub(r'[\[\]"`\s]', '', column[1]), 'table': table, 'start': pos, 'end': pos + len(piece)}
            for ref in re.finditer(r'\bREFERENCES\s+(' + ident + r')', piece, re.I):
                yield {'kind': 'foreign_key', 'label': re.sub(r'[\[\]"`\s]', '', ref[1]), 'table': table, 'start': pos + ref.start(), 'end': pos + ref.end()}


def build_index(folder, manifest):
    folder = Path(folder); nodes = []; edges = []; fragments = []; coverage = []; node_ids={}; edge_ids=set()
    source, snapshot = manifest['source'], manifest['id']
    def node(doc, kind, label, start=1, end=1, key=None, **extra):
        identity = key or kind + ':' + str(start) + ':' + label
        value = {'id': 'n_' + sha(source + snapshot + doc['id'] + identity)[:28],
                 'logicalId': sha(source + doc['id'] + identity), 'kind': kind, 'label': str(label)[:1000],
                 'source': source, 'snapshot': snapshot, 'document': doc['id'], 'path': doc['path'],
                 'startLine': max(1, int(start)), 'endLine': max(1, int(end)), 'textSha256': doc['textSha256'],
                 'citation': '[' + source + ':' + doc['id'] + ']', 'method': 'structural',
                 'verification': 'extraction_validated', 'nature': 'derived_asis' if manifest.get('kind') == 'asis' else ('implementation' if Path(doc['path']).suffix.lower() in CODE_EXTENSIONS else 'document_statement'), **extra}
        if value['id'] not in node_ids:
            if len(nodes)>=MAX_NODES:raise ValueError('Grafo oltre il limite di nodi: restringi le fonti')
            nodes.append(value);node_ids[value['id']]=value
        return node_ids[value['id']]
    def edge(a, b, relation, method='structural', **extra):
        identifier='e_' + sha(a['id'] + b['id'] + relation)[:28]
        if identifier in edge_ids:return
        if len(edges)>=MAX_EDGES:raise ValueError('Grafo oltre il limite di relazioni: restringi le fonti')
        edge_ids.add(identifier)
        edges.append({'id': identifier, 'source': a['id'], 'target': b['id'],
                      'relation': relation, 'method': method, 'verification': 'extraction_validated',
                      'evidence': [{k: b[k] for k in ('source','snapshot','document','startLine','endLine','textSha256','citation')}], **extra})
    lookup = {}
    for doc in manifest['documents']:
        text = checked_text(folder, doc); lines = text.split('\n')
        mapfile = folder / (doc['id'] + '.map.json')
        mapping = load(mapfile) if mapfile.exists() else {'blocks': [], 'notes': ['Snapshot precedente: originale e mappa strutturale non disponibili']}
        if doc.get('mapSha256') and sha(mapfile.read_bytes()) != doc['mapSha256']:
            raise ValueError('Mappa originale alterata: ' + doc['path'])
        root = node(doc, 'document', doc['path'], 1, len(lines)); lookup[doc['id']] = root
        headings = [b for b in mapping.get('blocks', []) if b.get('title')]
        stack = []
        for h in sorted(headings, key=lambda h: h['startLine']):
            section = node(doc, 'section', h['title'], h['startLine'], h['endLine'], level=h.get('level', 1))
            while stack and stack[-1].get('level', 1) >= section['level']: stack.pop()
            edge(stack[-1] if stack else root, section, 'contains'); stack.append(section)
        for b in mapping.get('blocks',[]):
            if b.get('type')=='table':
                item=node(doc,'document_table',b['label'],b['startLine'],b['endLine']);edge(root,item,'contains_table')
        for ref in mapping.get('references',[]):
            item=node(doc,'reference',ref['target'],ref['startLine'],ref['endLine'],method='explicit_reference');edge(root,item,'references','explicit_reference')
        for start in range(0, len(lines), 50):
            value = '\n'.join(lines[start:start+50])
            # Bound fragments, but preserve the full source for read_evidence.
            for offset in range(0, max(1, len(value)), 6000):
                fragments.append((doc['id'], start+1, min(len(lines), start+50), doc['path'], value[offset:offset+6000]))
        for match in re.finditer(r'\b(?:REQ|API|PROC|COMP|DATA)-[A-Za-z0-9][A-Za-z0-9_-]*\b', text):
            tag = match[0]; kind = {'REQ':'requirement','API':'api_reference','PROC':'process','COMP':'component','DATA':'data_reference'}[tag.split('-')[0]]
            item = node(doc, kind, tag, line_at(text, match.start()), line_at(text, match.end()), identifier=tag, method='explicit_reference')
            edge(root, item, 'mentions_identifier', 'explicit_reference')
        for match in re.finditer(r'\[([a-f0-9]{32}):([a-f0-9]{20})\]', text):
            item=node(doc,'evidence_citation',match[0],line_at(text,match.start()),line_at(text,match.end()),
                      referencedSource=match[1],referencedDocument=match[2],method='explicit_reference')
            edge(root,item,'cites','explicit_reference')
        for match in re.finditer(r'\[[^\]\n]+\]\(([^)\n]+)\)|href\s*=\s*["\']([^"\']+)["\']', text, re.I):
            link = match[1] or match[2]
            item = node(doc, 'reference', link, line_at(text, match.start()), line_at(text, match.end()), method='explicit_reference')
            edge(root, item, 'references', 'explicit_reference')
        ext = Path(doc['path']).suffix.lower()
        if ext == '.sql':
            tables = {}
            for record in sql_declarations(text):
                item = node(doc, record['kind'], record['label'], line_at(text, record['start']), line_at(text, record['end']))
                if record['kind'] == 'table': tables[record['label']] = item; edge(root, item, 'declares_table')
                elif record['kind'] == 'column': edge(tables.get(record['table'], root), item, 'declares_column')
                else: edge(tables.get(record['table'], root), item, 'declares_foreign_key', 'explicit_reference')
        if ext == '.json':
            try: api = json.loads(text)
            except ValueError: api = {}
            if isinstance(api, dict) and ('openapi' in api or 'swagger' in api):
                for route, methods in api.get('paths', {}).items():
                    if not isinstance(methods, dict): continue
                    for method in methods:
                        if method.lower() in ('get','post','put','patch','delete','head','options','trace'):
                            # The JSON parser proves the declaration; without token spans
                            # cite the complete contract instead of inventing precise lines.
                            item = node(doc, 'api_operation', method.upper()+' '+route, 1, len(lines), key=method+route, identifier=method.upper()+' '+route, locatorScope='document')
                            edge(root, item, 'declares_api')
        coverage.append({'document': doc['id'], 'path': doc['path'], 'originalAvailable': bool(doc.get('original')),
                         'truncated': doc.get('truncated', False), 'notes': mapping.get('notes', []),
                         'sqlScope': 'CREATE TABLE declarativo; ALTER/procedure/migration non risolti' if ext == '.sql' else None})
    graphfile = folder / 'graph.json'
    if graphfile.exists():
        graph = load(graphfile); ids = {}
        for n in graph.get('nodes', []):
            doc = next((d for d in manifest['documents'] if d['id'] == n.get('document')), None)
            if not doc: continue
            location = n.get('source_location', '')
            match = re.search(r'(\d+)', str(location)); start = int(match[1]) if match else 1
            item = node(doc, 'code_symbol', n.get('label', n['id']), start, start, key='ast:'+n['id'], ast=n)
            ids[n['id']] = item; edge(lookup[doc['id']], item, 'contains_symbol')
        for e in graph.get('edges', []):
            if e.get('source') in ids and e.get('target') in ids:
                edge(ids[e['source']], ids[e['target']], str(e.get('type', e.get('relation', 'ast_relation'))), ast=True)
        coverage.append({'codeGraphCoverage': graph.get('coverage', []), 'limits': graph.get('limits', [])})
    if len(nodes) > MAX_NODES or len(edges) > MAX_EDGES:
        raise ValueError('Grafo oltre limite: restringi le fonti')
    payload = {'version': VERSION, 'source': source, 'snapshot': snapshot, 'nodes': nodes, 'edges': edges, 'coverage': coverage, 'limits': LIMITS}
    version = sha(canonical(payload)); payload['fingerprint'] = version
    dbpath = folder / ('evidence.' + uuid.uuid4().hex + '.tmp')
    try:
        with contextlib.closing(sqlite3.connect(dbpath)) as db, db:
            db.executescript('CREATE TABLE nodes(id TEXT PRIMARY KEY,kind TEXT,label TEXT,document TEXT,data TEXT); CREATE TABLE edges(id TEXT PRIMARY KEY,src TEXT,dst TEXT,data TEXT); CREATE INDEX edge_src ON edges(src); CREATE INDEX edge_dst ON edges(dst); CREATE VIRTUAL TABLE fragments USING fts5(document UNINDEXED,start UNINDEXED,end UNINDEXED,path,text);')
            db.executemany('INSERT INTO nodes VALUES(?,?,?,?,?)', [(n['id'],n['kind'],n['label'],n['document'],canonical(n)) for n in nodes])
            db.executemany('INSERT OR IGNORE INTO edges VALUES(?,?,?,?)', [(e['id'],e['source'],e['target'],canonical(e)) for e in edges])
            db.executemany('INSERT INTO fragments VALUES(?,?,?,?,?)', fragments)
        dbpath.replace(folder/'evidence.sqlite')
    finally:
        if dbpath.exists(): dbpath.unlink()
    descriptor = {'version': VERSION, 'fingerprint': version, 'databaseSha256': sha((folder/'evidence.sqlite').read_bytes()),
                  'manifestSha256': sha((folder/'manifest.json').read_bytes()), 'astSha256': sha(graphfile.read_bytes()) if graphfile.exists() else None,
                  'nodes': len(nodes), 'edges': len(edges), 'fragments': len(fragments), 'coverage': coverage, 'limits': LIMITS}
    save(folder/'evidence.json', descriptor)
    archived=folder/'indexes'/version;archived.mkdir(parents=True,exist_ok=True)
    existing=load(archived/'evidence.json') if (archived/'evidence.json').exists() else {}
    if not (archived/'evidence.sqlite').exists() or existing.get('databaseSha256')!=sha((archived/'evidence.sqlite').read_bytes()):
        shutil.copyfile(folder/'evidence.sqlite',archived/'evidence.sqlite')
        save(archived/'evidence.json',descriptor)
        if graphfile.exists():shutil.copyfile(graphfile,archived/'graph.json')
    return descriptor


def ensure_index(folder, manifest=None):
    folder = Path(folder); manifest = manifest or load(folder/'manifest.json')
    for doc in manifest['documents']:
        checked_text(folder, doc)
        if doc.get('mapSha256') and sha((folder/(doc['id']+'.map.json')).read_bytes()) != doc['mapSha256']:
            raise ValueError('Mappa alterata')
    descriptor_file = folder/'evidence.json'
    code=[d for d in manifest['documents'] if Path(d['path']).suffix.lower() in ('.py','.js','.jsx','.ts','.tsx','.mjs','.cjs')]
    graphfile=folder/'graph.json'
    previous=load(descriptor_file) if descriptor_file.exists() else {}
    if code and (not graphfile.exists() or previous.get('astSha256')!=sha(graphfile.read_bytes()) or previous.get('version')!=VERSION):
        from suite_graph import build_graph
        mapping={}
        (folder/'code').mkdir(exist_ok=True)
        for doc in code:
            name=doc['id']+Path(doc['path']).suffix.lower();mapping[name]=doc
            (folder/'code'/name).write_bytes(checked_text(folder,doc).encode('utf-8'))
        graph=build_graph(folder/'code',folder.parent.parent.parent/'graphs'/'cache.sqlite',list(mapping),base=manifest.get('revision'))
        for n in graph['nodes']:
            doc=mapping[n['source_file']];n.update(source_file=doc['path'],document=doc['id'],citation='['+manifest['source']+':'+doc['id']+']')
        for e in graph['edges']:
            if e.get('source_file') in mapping:e['source_file']=mapping[e['source_file']]['path']
        save(graphfile,graph)
    if descriptor_file.exists() and (folder/'evidence.sqlite').exists():
        info = load(descriptor_file); ast = folder/'graph.json'
        if (info.get('version') == VERSION and info.get('manifestSha256') == sha((folder/'manifest.json').read_bytes())
                and info.get('astSha256') == (sha(ast.read_bytes()) if ast.exists() else None)
                and info.get('databaseSha256') == sha((folder/'evidence.sqlite').read_bytes())
                and (folder/'indexes'/info['fingerprint']/'evidence.sqlite').exists()):
            return {**info, 'reused': True}
    return {**build_index(folder, manifest), 'reused': False}


def validate_bundle(bundle):
    result = []
    for ref in bundle:
        if not re.fullmatch('[a-f0-9]{32}', ref['source']) or not re.fullmatch('[a-f0-9]{32}', ref['snapshot']):
            raise ValueError('Riferimento fonte non valido')
        folder = local_path(ref['directory']); manifest = load(folder/'manifest.json')
        if manifest['source'] != ref['source'] or manifest['id'] != ref['snapshot']:
            raise ValueError('Manifest fuori corpus')
        result.append({**ref, 'directory': folder, 'manifest': manifest})
    return result


def open_index(ref):
    folder = ref['directory']; indexfolder=folder
    if ref.get('indexVersion'):
        if not re.fullmatch('[a-f0-9]{64}',ref['indexVersion']):raise ValueError('Versione indice non valida')
        indexfolder=folder/'indexes'/ref['indexVersion']
    descriptor = indexfolder/'evidence.json'
    if not descriptor.exists(): return None
    info = load(descriptor)
    if ref.get('indexVersion') and info['fingerprint'] != ref['indexVersion']:
        raise ValueError('Versione indice diversa dal corpus fissato')
    if info.get('version') != VERSION or info['manifestSha256'] != sha((folder/'manifest.json').read_bytes()) or info['databaseSha256'] != sha((indexfolder/'evidence.sqlite').read_bytes()):
        raise ValueError('Indice alterato o non aggiornato: aggiorna i grafi dal pannello')
    ast = indexfolder/'graph.json'
    if info.get('astSha256') != (sha(ast.read_bytes()) if ast.exists() else None):
        raise ValueError('Grafo codice cambiato: aggiorna gli indici')
    # Check immutable texts as well, so snippets never bypass source integrity checks.
    for doc in ref['manifest']['documents']: checked_text(folder, doc)
    # Native long Windows paths work with sqlite3; URI parsing drops the long-path
    # prefix. Every statement below is fixed SELECT SQL and query_only rejects writes.
    db=sqlite3.connect(str((indexfolder/'evidence.sqlite').resolve()))
    db.execute('PRAGMA query_only=ON')
    return db


def corpus_version(bundle):
    return sha(canonical(sorted((r['source'],r['snapshot'],r.get('indexVersion')) for r in bundle)))


def read_evidence(bundle, args):
    refs = validate_bundle(bundle)
    ref = next((r for r in refs if r['source'] == args.get('source') and (not args.get('snapshot') or r['snapshot'] == args['snapshot'])), None)
    doc = next((d for d in ref['manifest']['documents'] if d['id'] == args.get('document')), None) if ref else None
    if not doc: raise ValueError('Evidenza fuori corpus')
    text = checked_text(ref['directory'], doc); mode = args.get('mode','passage')
    offset = max(0, int(args.get('offset',0))); maximum = max(100, min(200000, int(args.get('maxChars',100000))))
    mapping = load(ref['directory']/(doc['id']+'.map.json')) if (ref['directory']/(doc['id']+'.map.json')).exists() else {'blocks':[],'notes':['Mappa originale non disponibile']}
    if doc.get('mapSha256') and sha((ref['directory']/(doc['id']+'.map.json')).read_bytes()) != doc['mapSha256']:
        raise ValueError('Mappa originale alterata')
    all_lines = text.split('\n'); start = 1; end = len(all_lines)
    if mode == 'section':
        section = next((b for b in mapping['blocks'] if b.get('title') and b['startLine'] == int(args.get('startLine',1))), None)
        if not section: raise ValueError('Sezione non trovata')
        start, end = section['startLine'], section['endLine']
    elif mode == 'passage':
        start = max(1,int(args.get('startLine',1))); end = min(len(all_lines), start+min(1000,max(1,int(args.get('lines',150))))-1)
    elif mode != 'full': raise ValueError('Modalita di lettura non valida')
    if start > len(all_lines): raise ValueError('Intervallo oltre il documento')
    selected = '\n'.join(all_lines[start-1:end]); value = selected[offset:offset+maximum]
    range_start=sum(len(line)+1 for line in all_lines[:start-1])
    if offset>len(selected):raise ValueError('Offset oltre il contenuto richiesto')
    next_offset = offset+len(value) if offset+len(value) < len(selected) else None
    return {'source':ref['source'],'snapshot':ref['snapshot'],'document':doc['id'],'path':doc['path'],
            'citation':'['+ref['source']+':'+doc['id']+']','citationRange':'['+ref['source']+':'+doc['id']+']#L'+str(start)+'-L'+str(end),'textSha256':doc['textSha256'], 'originalSha256':doc.get('sha256'),
            'mode':mode,'startLine':start,'endLine':end,'offset':offset,'nextOffset':next_offset,'text':value,
            'rangeStartOffset':range_start,'totalRangeChars':len(selected),'returnedChars':len(value),'documentTotalChars':len(text),'documentTotalLines':len(all_lines),
            'completeRequestedRange':next_offset is None and offset == 0, 'extractionTruncated':doc.get('truncated',False),
            'originalAvailable':bool(doc.get('original')),'locators':[b for b in mapping['blocks'] if b['startLine']<=end and b['endLine']>=start][:200],
            'coverageNotes':mapping.get('notes',[]),'freshness':ref.get('freshness','pinned')}


def query(bundle, action, args):
    refs = validate_bundle(bundle); limit = max(1,min(40,int(args.get('limit',8))))
    nodes, hits, edges, unavailable = [], [], [], []
    if action == 'read_evidence': return read_evidence(bundle,args)
    for ref in refs:
        if args.get('source') and ref['source']!=args['source']:continue
        db = open_index(ref)
        if db is None: unavailable.append(ref['source']); continue
        with contextlib.closing(db):
            if action == 'knowledge_search':
                terms = re.findall(r'[\w/-]+',str(args.get('query',''))[:2000],re.UNICODE)[:20]
                if not terms: continue
                expression = ' OR '.join('"'+t.replace('"','""')+'"' for t in terms)
                rows = db.execute('SELECT document,start,end,path,snippet(fragments,4,\'\',\'\',\' … \',48),bm25(fragments) FROM fragments WHERE fragments MATCH ? ORDER BY bm25(fragments),rowid LIMIT ?', (expression,limit)).fetchall()
                for doc,start,end,p,text,rank in rows:
                    hits.append({'source':ref['source'],'snapshot':ref['snapshot'],'document':doc,'path':p,'startLine':int(start),'endLine':int(end),'text':text,'rank':rank,'citation':'['+ref['source']+':'+doc+']','freshness':ref.get('freshness','pinned')})
                pattern = '%'+str(args.get('query',''))[:200].replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
                for row in db.execute("SELECT data FROM nodes WHERE label LIKE ? ESCAPE '\\' ORDER BY id LIMIT ?",(pattern,limit)):
                    nodes.append(json.loads(row[0]))
                # Include source/section nodes of lexical hits to support graph navigation.
                for hit in [h for h in hits if h['source']==ref['source']][:limit]:
                    for row in db.execute('SELECT data FROM nodes WHERE document=? AND kind IN (\'document\',\'section\') ORDER BY id LIMIT 8',(hit['document'],)):
                        n=json.loads(row[0])
                        if n['startLine']<=hit['endLine'] and n['endLine']>=hit['startLine']: nodes.append(n)
            elif action == 'knowledge_trace':
                frontier = set(args.get('nodes',[])[:20]); visited = set()
                for _ in range(max(1,min(3,int(args.get('depth',1))))):
                    following = set()
                    for identifier in sorted(frontier):
                        for row in db.execute('SELECT data FROM nodes WHERE id=?',(identifier,)): nodes.append(json.loads(row[0]))
                        for row in db.execute('SELECT data FROM edges WHERE src=? OR dst=? ORDER BY id LIMIT ?', (identifier,identifier,limit*3)):
                            e=json.loads(row[0]);edges.append(e);following.update((e['source'],e['target']))
                    visited.update(frontier);frontier=following-visited
                    if len(visited)>120: break
                for identifier in sorted(frontier)[:120]:
                    for row in db.execute('SELECT data FROM nodes WHERE id=?',(identifier,)): nodes.append(json.loads(row[0]))
            else: raise ValueError('Operazione sconosciuta')
    unique_nodes={n['id']:n for n in nodes}; unique_edges={e['id']:e for e in edges}
    # Exact identifiers across selected domains remain matches, never "implements".
    identifiers = {n.get('identifier') for n in unique_nodes.values() if n.get('identifier')}
    if action == 'knowledge_trace' and identifiers:
        for ref in refs:
            db=open_index(ref)
            if db is None:continue
            with contextlib.closing(db):
                for identifier in sorted(identifiers):
                    for row in db.execute('SELECT data FROM nodes WHERE label=? ORDER BY id LIMIT 20',(identifier,)):
                        other=json.loads(row[0])
                        for n in list(unique_nodes.values()):
                            if n['id']!=other['id'] and n.get('identifier')==identifier:
                                eid='e_'+sha(n['id']+other['id']+'exact')[:28]
                                unique_edges[eid]={'id':eid,'source':n['id'],'target':other['id'],'relation':'matches_identifier','method':'exact_match','verification':'extraction_validated','evidence':[n,other]}
                        unique_nodes[other['id']]=other
    if action=='knowledge_trace':
        for citation in list(unique_nodes.values()):
            if not citation.get('referencedSource'):continue
            for ref in refs:
                if ref['source']!=citation['referencedSource']:continue
                db=open_index(ref)
                if db is None:continue
                with contextlib.closing(db):
                    for row in db.execute("SELECT data FROM nodes WHERE document=? AND kind='document'",(citation['referencedDocument'],)):
                        target=json.loads(row[0]);unique_nodes[target['id']]=target
                        eid='e_'+sha(citation['id']+target['id']+'citation')[:28]
                        unique_edges[eid]={'id':eid,'source':citation['id'],'target':target['id'],'relation':'cites_original','method':'explicit_reference','verification':'reference_validated','evidence':[citation,target]}
    # Interleave sources to avoid letting the first source consume the whole budget.
    ranked=[];groups={r['source']:[h for h in hits if h['source']==r['source']] for r in refs}
    for index in range(limit):
        for group in groups.values():
            if index<len(group):ranked.append(group[index])
    return {'corpusVersion':corpus_version(bundle),'hits':ranked[:limit], 'nodes':list(unique_nodes.values())[:limit*5], 'edges':list(unique_edges.values())[:limit*8],
            'truncated':len(hits)>limit or len(unique_nodes)>limit*5 or len(unique_edges)>limit*8,
            'unavailableIndexes':unavailable,'limits':LIMITS,'reading':'Usa read_evidence anche in modalita full per leggere gli originali; vicinanza e citazioni non provano da sole il significato.'}


def validate_citations(bundle, text):
    refs = validate_bundle(bundle); allowed={(r['source'],d['id']):(r,d) for r in refs for d in r['manifest']['documents']}
    matches = re.findall(r'\[([a-f0-9]{32}):([a-f0-9]{20})\](?:#L(\d+)(?:-L?(\d+))?)?',text)
    citations=[]
    for source,document,start,end in matches:
        citation=(source,document);citations.append(citation)
        if citation not in allowed: raise ValueError('Citazione fuori corpus: '+':'.join(citation))
        ref,doc=allowed[citation];original=checked_text(ref['directory'],doc)
        if start and not 1<=int(start)<=int(end or start)<=len(original.split('\n')):raise ValueError('Righe citate fuori intervallo')
    return {'citations':len(citations),'unique':len(set(citations)),'validation':'Identita e integrita, non sostegno semantico della conclusione'}


def semantic_proposals(home, bundle):
    folder=local_path(home)/'knowledge'/'proposals'/corpus_version(bundle)
    return [load(p) for p in sorted(folder.glob('*.json')) if re.fullmatch('[a-f0-9]{32}',p.stem)] if folder.exists() else []


def propose_relation(home, bundle, args):
    refs=validate_bundle(bundle)
    identifiers=[args.get('sourceNode'),args.get('targetNode')];found={}
    for ref in refs:
        db=open_index(ref)
        if db is None:continue
        with contextlib.closing(db):
            for identifier in identifiers:
                row=db.execute('SELECT data FROM nodes WHERE id=?',(identifier,)).fetchone()
                if row:found[identifier]=json.loads(row[0])
    if len(found)!=2:raise ValueError('La relazione richiede due nodi distinti del corpus')
    if args.get('relation') not in ('implements','supports','contradicts','depends_on','same_concept','describes'):
        raise ValueError('Tipo di relazione non supportato')
    reason=str(args.get('reason','')).strip()
    if not reason or len(reason)>4000:raise ValueError('Specifica una motivazione fino a 4000 caratteri')
    evidence=args.get('evidence',[])
    if not 1<=len(evidence)<=10:raise ValueError('Specifica da 1 a 10 evidenze')
    checked=[]
    for ev in evidence:
        ref=next((r for r in refs if r['source']==ev.get('source')),None)
        doc=next((d for d in ref['manifest']['documents'] if d['id']==ev.get('document')),None) if ref else None
        if not doc:raise ValueError('Evidenza fuori corpus')
        text=checked_text(ref['directory'],doc);start=ev.get('startLine');end=ev.get('endLine')
        if type(start) is not int or type(end) is not int or not 1<=start<=end<=len(text.split('\n')):
            raise ValueError('Intervallo evidenza non valido')
        checked.append({'source':ref['source'],'snapshot':ref['snapshot'],'document':doc['id'],'startLine':start,'endLine':end,'textSha256':doc['textSha256']})
    body={'source':identifiers[0],'target':identifiers[1],'relation':args['relation'],'reason':reason,'evidence':checked}
    identifier=sha(canonical(body))[:32];folder=local_path(home)/'knowledge'/'proposals'/corpus_version(bundle);file=folder/(identifier+'.json')
    if file.exists():return load(file)
    result={'id':identifier,**body,'method':'model_inference','verification':'unreviewed','createdAt':now(),'corpusVersion':corpus_version(bundle)}
    save(folder/'corpus.json',{'bundle':bundle});save(file,result);return result


def review_relation(home, bundle, identifier, verdict, reason):
    if not re.fullmatch('[a-f0-9]{32}',identifier) or verdict not in ('accepted','rejected') or not str(reason).strip():
        raise ValueError('Revisione non valida: servono esito e motivazione')
    file=local_path(home)/'knowledge'/'proposals'/corpus_version(bundle)/(identifier+'.json')
    item=load(file)
    if verdict=='accepted':
        for evidence in item['evidence']:
            result=read_evidence(bundle,{**evidence,'mode':'passage','lines':evidence['endLine']-evidence['startLine']+1})
            if result['textSha256']!=evidence['textSha256']:raise ValueError('Evidenza della proposta alterata')
    item.update(verification=verdict,reviewedAt=now(),reviewReason=str(reason)[:4000],reviewedBy='panel_user')
    save(file,item);return item
