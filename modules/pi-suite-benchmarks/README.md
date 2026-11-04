# pi-suite-benchmarks

Modulo indipendente del laboratorio benchmark di Pi Suite. Contiene la tab web,
gli stili, il registro SQLite, il catalogo delle prove e l'adattatore Inspect
opzionale. Non importa codice di Pi Suite e non chiama provider o modelli.
Il backend richiede Python >= 3.10 e usa solo la libreria standard;
il pacchetto si distribuisce tramite npm, senza build o script di installazione.

## Questo è il repository da pubblicare

Copia **il contenuto di questa cartella** nella radice del nuovo repository:
`package.json`, `python/`, `ui/`, `scripts/`, `tests/`, `.github/`,
`Install-Inspect.ps1`, `requirements-inspect.txt`, `README.md`, `LICENSE`,
`.gitignore` e `.npmignore`. Non occorre copiare altri file da Pi Suite.
Non includere ambienti virtuali, cache, database o `tests/tmp/`.

Da questa cartella, prima della pubblicazione:

```powershell
npm test
node --check ui/benchmark-panel.js
npm pack --dry-run
```

Il workflow GitHub incluso ripete questi controlli su Linux. Dopo il primo push
crea un tag `v1.0.0` sul commit da consumare. Per aggiornamenti successivi,
incrementa `version` e pubblica un nuovo tag.

## Installazione come dipendenza

Nel progetto che utilizza il modulo scegli una delle modalità seguenti:

```powershell
# Da repository Git, dopo aver sostituito OWNER e REPOSITORY con quelli reali.
npm install --save-exact "git+https://github.com/OWNER/REPOSITORY.git#v1.0.0"

# Da un archivio prodotto con npm pack nella cartella del modulo.
npm install --save-exact C:/pacchetti/pi-suite-benchmarks-1.0.0.tgz

# Durante lo sviluppo, da un checkout locale del solo modulo.
npm install --save-exact ../pi-suite-benchmarks
```

Il nome della dipendenza rimane `pi-suite-benchmarks` anche se il repository ha
un nome diverso. Versionare sempre `package.json` e `package-lock.json` del
progetto ospite. Git deve essere disponibile per l'installazione da repository.
Il campo `files` include nell'archivio solo runtime, risorse e documentazione.

Pi Suite al momento viene fornita senza questo pacchetto. Dopo l'installazione,
riavviare Pi Suite: la tab viene aggiunta automaticamente. La sola presenza della
cartella sorgente `modules/pi-suite-benchmarks` non abilita il modulo.

## Integrazione backend — API 1

L'host aggiunge `node_modules/pi-suite-benchmarks/python` al percorso di import
Python e importa:

```python
from pi_suite_benchmarks import API_VERSION, Benchmarks, asset

assert API_VERSION == 1
ledger = Benchmarks("./data", runtime="./runtime")
result = ledger.request("/api/benchmarks", {}, {}, False)
```

`Benchmarks(home, *, runtime=None)` conserva `benchmarks.sqlite` e
`benchmark-evaluations/` in `home`. `runtime` contiene l'eventuale `.venv-inspect`;
se omesso, vale `home/benchmark-runtime`. Il codice installato e il catalogo
rimangono in sola lettura. Gli ID, le versioni delle prove e il formato del
database preesistente sono conservati.

L'host inoltra `request(route, data, params, post)` per `/api/benchmarks` e i
relativi sottopercorsi. `params` è un dizionario di liste, come quello restituito
da `urllib.parse.parse_qs`; `data` è l'oggetto JSON delle richieste POST.
Autenticazione, controllo di Host/Origin, limiti dei body e risposta HTTP sono
responsabilità dell'host. Pi Suite mantiene questi controlli nel proprio server.

`asset(name)` restituisce il `Path` di `benchmark-panel.js` o `benchmark.css`.
Qualsiasi altro nome è rifiutato. Esporre soltanto questi due file con MIME
`text/javascript` e `text/css`: il catalogo contiene anche rubriche riservate e
non deve essere servito come directory statica.

## Integrazione frontend — API 1

Caricare il CSS e lo script restituiti da `asset`, poi invocare
`window.PiSuiteBenchmarks.mount` una sola volta per pagina:

```javascript
window.PiSuiteBenchmarks.mount({
  root, api, el, btn, input, field, options, notice, page, token,
  navigation, breadcrumb
});
```

`apiVersion` vale `1`. La tab riceve tutte le dipendenze dall'host:

| Parametro | Contratto |
| --- | --- |
| `root` | Elemento DOM in cui rendere la tab. |
| `api(path, body?)` | Promise del JSON; la tab passa `benchmarks` e relativi sottopercorsi senza `/api/`. L'host applica autenticazione e gestione degli errori HTTP. |
| `el(tag, text?, className?)` | Crea un elemento DOM con testo facoltativo. |
| `btn(label, callback, className)` | Crea un pulsante e collega il callback, gestendo anche errori asincroni. |
| `input(value?, type?)` | Crea un input. |
| `field(label, control)` | Restituisce un contenitore etichettato per il controllo. |
| `options(select, items, value)` | Popola la select; gli item sono coppie `[value, label]`. |
| `notice(message, isError?)` | Mostra una notifica. |
| `page(name)` | Attiva la pagina ospite `benchmarks`. |
| `token` | Token di sessione per i collegamenti di dettaglio; default stringa vuota. |
| `navigation` | Pulsante della navigazione che apre il laboratorio. |
| `breadcrumb` | Elemento di testo del percorso di navigazione. |

La tab usa il DOM browser e la navigazione `?page=benchmarks&view=...&id=...`.
Gli stili condivisi dell'host forniscono le classi di base `card`, `row`,
`primary`, `secondary`, `muted`, `lead`, `eyebrow`, `grow`, `text-button`
e le variabili tema già usate da Pi Suite; `ui/benchmark.css` fornisce il layout
specifico del laboratorio. L'adattatore Pi Suite è `suite-ui/benchmark-panel.js`.

## Inspect opzionale

Lo scoring deterministico dei file caricati funziona senza Inspect. Per
generare anche i log Inspect su Windows:

```powershell
.\Install-Inspect.ps1 -RuntimeDirectory C:/app/runtime -Python python
```

Usare lo stesso `runtime` passato a `Benchmarks`. In Pi Suite lo script omonimo
nella radice dell'app delega a quello di questo pacchetto e conserva il vecchio
percorso `.venv-inspect`. I log temporanei del runner usano la directory temporanea
del sistema; i risultati persistenti rimangono nella cartella dati.

## Test

`npm test` esegue i test Python senza dipendenze esterne: configurazioni,
prove originali e personalizzate, importazione risultati, valutazioni,
compatibilità dei dati, confronti, API pubblica e avvio del runner.
`PI_SUITE_TEST_PYTHON` può selezionare un
interprete diverso. I test HTTP/browser dell'integrazione restano nell'host.

Licenza MIT: vedi `LICENSE`.
