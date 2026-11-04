"""Collaudo manuale SharePoint: risoluzione del link, acquisizione e verifica dei file attesi, senza modelli."""

import argparse
import getpass
import sys
import tempfile
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from suite import protect
from suite_sources import Sources, relative


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='Link della cartella; se omesso viene richiesto interattivamente.')
    parser.add_argument(
        '--expect-file', action='append', required=True, help='Percorso relativo di un file di prova, ripetibile.'
    )
    args = parser.parse_args()
    expected = {relative(name) for name in args.expect_file}
    url = args.url or input('Link della cartella SharePoint di prova: ').strip()
    token = getpass.getpass('Access token Microsoft Graph (input nascosto): ').strip()
    if not token:
        raise ValueError('Token assente: nessuna richiesta inviata')
    temporary_root = ROOT / 'tests' / 'tmp'
    temporary_root.mkdir(parents=True, exist_ok=True)
    # Area temporanea distinta dai dati della suite; anche qui il token su disco usa DPAPI.
    with tempfile.TemporaryDirectory(prefix='sharepoint-live-', dir=temporary_root) as directory:
        sources = Sources(directory, protect)
        saved = sources.save({'name': 'Collaudo SharePoint', 'kind': 'sharepoint-graph', 'url': url, 'token': token})
        print('OK: link risolto in Drive ID e Folder Item ID.')
        manifest = sources.sync(saved['id'])
        acquired = {item['path'] for item in manifest['documents']}
        if not expected.issubset(acquired):
            raise ValueError('File attesi mancanti o esclusi: controlla cartella, formati e permessi')
        print(
            f'OK: acquisiti {len(acquired)} documenti, {len(manifest["excluded"])} esclusi; tutti i file attesi presenti.'
        )
    print('Collaudo completato; credenziali e snapshot temporanei rimossi.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Collaudo annullato.', file=sys.stderr)
        sys.exit(130)
    except urllib.error.HTTPError as error:
        # Non stampare URL temporanei, header o corpi delle risposte remote.
        print(
            f'Acquisizione non riuscita: HTTP {error.code}. Verifica token, permessi e accesso per ID.', file=sys.stderr
        )
        sys.exit(1)
    except (ValueError, OSError) as error:
        # I ValueError della suite sono messaggi locali; per gli errori di rete/filesystem basta il tipo.
        message = str(error) if isinstance(error, ValueError) else type(error).__name__
        print('Collaudo non riuscito: ' + message, file=sys.stderr)
        sys.exit(1)
