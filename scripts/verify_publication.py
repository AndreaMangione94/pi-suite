"""Check the exact Git index or committed bytes without printing matched values."""
import argparse
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'provider credential': r'\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{15,})',
    'private key': r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'JWT': r'\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
    'email address': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b',
    'personal filesystem path': (r'(?i)(?:[A-Z]:[\\/]+Users[\\/]+[^\\/\s"\x27<>]+|/'
                                 + r'Users/[^/\s"\x27<>]+|/' + r'home/[^/\s"\x27<>]+)'),
    'authenticated URL': r'(?i)https?://[^\s/:@]+:[^\s/@]+@[^\s/]+',
    'organization URL': r'(?i)\b(?:[a-z0-9-]+\.sharepoint\.com|dev\.azure\.com/[a-z0-9_-]+|[a-z0-9-]+\.visualstudio\.com)\b',
    'credential literal': r'''(?i)(?:["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization)["']?\s*[:=]\s*["'])([^"'\r\n]{8,})["']''',
    'Italian tax identifier': r'\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b',
    'Italian IBAN': r'\bIT\d{2}[A-Z]\d{10}[A-Z0-9]{12}\b',
}
# Exact demonstrations and protocol header names reviewed in the shipped source.
REVIEWED = {
    ('suite-ui/index.html', 'personal filesystem path', 'c:\\users\\utente'),
    ('suite-ui/index.html', 'organization URL', 'dev.azure.com/organizzazione'),
    ('GUIDA-FONTI-AS-IS.md', 'organization URL', 'dev.azure.com/organizzazione'),
    ('PRIVACY-REVIEW.md', 'organization URL', 'dev.azure.com/organizzazione'),
    ('scripts/verify_publication.py', 'organization URL', 'dev.azure.com/organizzazione'),
    ('scripts/verify_publication.py', 'personal filesystem path', 'c:\\users\\utente'),
    ('suite.py', 'credential literal', 'authorization'),
    ('suite.py', 'credential literal', 'api-key'),
    ('suite.py', 'credential literal', 'x-api-key'),
    ('suite.py', 'credential literal', 'x-goog-api-key'),
    # Literal environment references and synthetic fixtures; no live secrets or tenant.
    ('GUIDA-BYOK.md', 'credential literal', '${pi_suite_key_<id_normalizzato>}'),
    ('test_byok_connections.py', 'credential literal', 'test-env-key'),
    ('test_byok_connections.py', 'credential literal', 'test-key'),
    ('test_document_graph.py', 'organization URL', 'example.sharepoint.com'),
    ('scripts/verify_publication.py', 'organization URL', 'example.sharepoint.com'),
    ('test_reinstall.ps1', 'personal filesystem path', 'c:\\users\\user'),
    ('scripts/verify_publication.py', 'personal filesystem path', 'c:\\users\\user'),
}
PRIVATE_DIRS = {'.work', '.test-suite', '__pycache__', 'node_modules', '.venv',
                'suite-data', 'data', 'sessions', 'snapshots', 'delegations',
                'knowledge', 'graphs', 'backup', 'backups', 'Archivio',
                '.pi', '.codex', '.agents', '.aws', '.ssh'}
PRIVATE_NAMES = {'.npmrc', '.netrc', '.pypirc', 'auth.json', 'settings.json',
                 'models.config.json', 'models.config.yaml', 'models.config.yml',
                 'models.custom.json'}
PRIVATE_SUFFIXES = {'.zip', '.sqlite', '.db', '.log', '.pem', '.key', '.pfx', '.p12'}


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staged', action='store_true', help='scan the complete Git index')
    parser.add_argument('--private-term', action='append', default=[], help='extra private term to detect')
    args = parser.parse_args()
    patterns = {name: re.compile(pattern) for name, pattern in PATTERNS.items()}
    for index, term in enumerate(args.private_term, 1):
        if term:
            patterns[f'private term {index}'] = re.compile(r'(?<!\w)' + re.escape(term) + r'(?!\w)', re.I)
    if args.staged:
        records = git('ls-files', '--stage', '-z').decode('utf-8').split('\0')
    else:
        records = git('ls-tree', '-r', '-z', 'HEAD').decode('utf-8').split('\0')
    findings = []
    files = 0
    total = 0
    for record in filter(None, records):
        metadata, name = record.split('\t', 1)
        mode, second, third = metadata.split()
        if mode not in ('100644', '100755') or (args.staged and third != '0'):
            findings.append((name, 0, 'unsupported Git entry')); continue
        sha = second if args.staged else third
        path = PurePosixPath(name)
        if (set(path.parts) & PRIVATE_DIRS or path.name in PRIVATE_NAMES or
                path.name.startswith(('.env', 'credentials', 'secrets')) or
                path.suffix.lower() in PRIVATE_SUFFIXES or
                any(part.startswith('.venv-') for part in path.parts)):
            findings.append((name, 0, 'private or generated file'))
        raw = git('cat-file', 'blob', sha)
        files += 1; total += len(raw)
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            findings.append((name, 0, 'binary file requires review')); continue
        if '\0' in text:
            findings.append((name, 0, 'binary file requires review')); continue
        for category, pattern in patterns.items():
            for match in pattern.finditer(text):
                value = match.group(1) if category == 'credential literal' else match.group()
                if category == 'personal filesystem path':
                    value = re.sub(r'\\{2,}', lambda _: chr(92), value)
                if (name, category, value.lower()) in REVIEWED:
                    continue
                findings.append((name, text.count('\n', 0, match.start()) + 1, category))
    for name, line, category in findings:
        print(f'{name}:{line}: {category} (value omitted)')
    print(f'Checked {files} Git files, {total} bytes; findings: {len(findings)}.')
    return 1 if findings or not files else 0


if __name__ == '__main__':
    sys.exit(main())
