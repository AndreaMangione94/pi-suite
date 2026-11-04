import base64
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import suite
import suite_sources
from suite_sources import Sources, graph_share_id

SHARING = 'https://azienda.sharepoint.com/:f:/s/progetto/EabcDEF123?e=xyz'
BROWSER = (
    'https://azienda.sharepoint.com/sites/progetto/Shared%20Documents/Forms/AllItems.aspx'
    '?id=%2Fsites%2Fprogetto%2FShared%20Documents%2FSpecifiche&viewid=abc'
)


def decoded(share_id):
    value = share_id.removeprefix('u!')
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)).decode('utf-8')


class SharePointLinkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=suite.ROOT / 'tests' / 'tmp')
        self.addCleanup(self.temp.cleanup)
        # Cifratura reversibile di prova: la DPAPI è coperta dai test delle credenziali.
        self.sources = Sources(Path(self.temp.name), lambda text, decrypt=False: text)
        self.calls = []

    def graph(self, item=None, error=None):
        def download(url, headers=None, graph=False):
            self.calls.append({'url': url, 'headers': headers, 'graph': graph})
            if error:
                raise urllib.error.HTTPError(url, error, 'errore', {}, io.BytesIO())
            return json.dumps(item).encode()

        return patch.object(suite_sources, 'download', download)

    def test_share_id_matches_graph_encoding(self):
        # Esempio della documentazione Microsoft per /shares.
        example = 'https://onedrive.live.com/redir?resid=1231244193912!12&authKey=1201919!12921!1'
        self.assertEqual(
            graph_share_id(example),
            'u!aHR0cHM6Ly9vbmVkcml2ZS5saXZlLmNvbS9yZWRpcj9yZXNpZD0xMjMxMjQ0MTkzOTEyITEyJmF1dGhLZXk9MTIwMTkxOSExMjkyMSEx',
        )
        self.assertEqual(decoded(graph_share_id(SHARING)), SHARING)
        self.assertEqual(
            decoded(graph_share_id(BROWSER)),
            'https://azienda.sharepoint.com/sites/progetto/Shared%20Documents/Specifiche',
        )

    def test_link_and_token_are_enough(self):
        item = {
            'id': 'FOLDER-1',
            'name': 'Specifiche',
            'folder': {'childCount': 3},
            'parentReference': {'driveId': 'b!DRIVE'},
        }
        with self.graph(item):
            rows = self.sources.save(
                {'name': 'Specifiche', 'kind': 'sharepoint-graph', 'url': BROWSER, 'token': 'TOKEN-1'}
            )
        saved = next(s for s in self.sources.connections() if s['id'] == rows[-1]['id'])
        self.assertEqual((saved['driveId'], saved['folderId'], saved['url']), ('b!DRIVE', 'FOLDER-1', BROWSER))
        self.assertNotIn('TOKEN-1', json.dumps(rows))
        call = self.calls[0]
        self.assertTrue(call['graph'])
        self.assertTrue(
            call['url'].startswith('https://graph.microsoft.com/v1.0/shares/' + graph_share_id(BROWSER) + '/driveItem')
        )
        self.assertEqual(call['headers']['Authorization'], 'Bearer TOKEN-1')
        self.assertEqual(call['headers']['Prefer'], 'redeemSharingLinkIfNecessary')

    def test_clear_errors(self):
        cases = [
            ({'error': 401}, 'token non valido o scaduto'),
            ({'error': 403}, 'non ha accesso'),
            ({'error': 404}, 'controlla il link'),
            ({'item': {'id': 'F', 'file': {}, 'parentReference': {'driveId': 'D'}}}, 'non indica una cartella'),
        ]
        for response, message in cases:
            with self.subTest(message=message), self.graph(**response):
                with self.assertRaisesRegex(ValueError, message):
                    self.sources.save({'name': 'X', 'kind': 'sharepoint-graph', 'url': SHARING, 'token': 'T'})
        with self.assertRaisesRegex(ValueError, 'access token'):
            self.sources.save({'name': 'X', 'kind': 'sharepoint-graph', 'url': SHARING})
        with self.assertRaisesRegex(ValueError, 'link della cartella'):
            self.sources.save({'name': 'X', 'kind': 'sharepoint-graph', 'token': 'T'})
        with self.assertRaisesRegex(ValueError, 'Host della fonte non consentito'):
            self.sources.save(
                {'name': 'X', 'kind': 'sharepoint-graph', 'url': 'https://example.com/cartella', 'token': 'T'}
            )

    def test_explicit_ids_still_work_without_network(self):
        with self.graph(error=500):
            self.sources.save(
                {'name': 'X', 'kind': 'sharepoint-graph', 'driveId': 'b!D', 'folderId': 'root', 'token': 'T'}
            )
            with self.assertRaisesRegex(ValueError, 'sia Drive ID sia Folder Item ID'):
                self.sources.save({'name': 'Y', 'kind': 'sharepoint-graph', 'driveId': 'b!D', 'token': 'T'})
        self.assertEqual(self.calls, [])
        self.assertEqual(self.sources.connections()[0]['folderId'], 'root')


if __name__ == '__main__':
    unittest.main()
