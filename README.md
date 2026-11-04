# Pi Suite

Suite Windows per una chat con orchestratore, subagenti con incarichi Markdown,
fonti documentali e grafi di conoscenza locali. La versione è quella di `package.json`,
mostrata anche in fondo al pannello.

**Autore:** [AndreaMangione94](https://github.com/AndreaMangione94).
Copyright (c) 2026 AndreaMangione94 and Pi Suite contributors.
Licenza [MIT](LICENSE).

## Clona e installa

Con Git gia disponibile, apri PowerShell:

```powershell
git clone https://github.com/AndreaMangione94/pi-suite.git
cd pi-suite
.\Install.cmd
```

Se Git non e disponibile, scarica il repository con **Code > Download ZIP**,
estrai completamente la cartella ed esegui `Install.cmd`.

L'installer prepara Node >=22.19, Python 3.13 e Git tramite winget quando
mancano, scarica le dipendenze npm e Python, verifica il supporto FTS5,
installa l'app in `%LOCALAPPDATA%\PiSuite` e crea il comando `pisuite` e il
collegamento **Pi Suite** sul desktop. Sono necessari Windows e Internet;
le installazioni dei prerequisiti possono richiedere interventi del sistema.

Dopo l'installazione apri **Pi Suite** dal desktop oppure `pisuite pannello` in un
nuovo terminale. L'applicazione installata usa la propria copia del codice e
la propria area dati, quindi puo funzionare senza la cartella clonata.

## Aggiornare dopo una pull

Nella cartella del repository esegui:

```powershell
git pull --ff-only
.\Install.cmd
```

`Install.cmd` riconosce la copia gia installata e la aggiorna con i sorgenti appena
scaricati, arresta Pi Suite e riapre il pannello. Conserva configurazioni,
progetti e chiavi, aggiorna le dipendenze quando cambiano e mantiene una copia
dell'applicazione precedente per il ripristino in caso di errore. Le chat
vanno riaperte dopo l'aggiornamento. Se le dipendenze cambiano serve Internet.

L'unico file `.cmd` del repository e `Install.cmd`, per la prima installazione
e gli aggiornamenti successivi. Il comando `pisuite` (con `pi` per compatibilità) viene generato nella
cartella `bin` dell'installazione; il pannello si apre dal collegamento desktop.
Il comando accetta `-Destination` per una destinazione personalizzata
e `-NoLaunch` per evitare l'apertura del pannello. `Install.cmd -ValidateOnly`
controlla i prerequisiti senza modificare l'installazione.

## Primo utilizzo

1. In **Connessioni e modelli** configura un endpoint locale o un provider cloud.
   Gli esempi JSON/YAML inclusi sono dimostrativi; le chiavi vanno inserite
   separatamente nell'applicazione.
2. In **Orchestratore e subagenti** seleziona e salva i modelli. Il modello
   Subagenti attiva la delega; lasciandolo vuoto il genitore lavora da solo.
3. In **Il tuo workspace** crea o collega una cartella di progetto, poi premi
   **Apri chat Pi** e descrivi il lavoro da svolgere.

L'installer prepara l'ambiente; per usare la chat occorre un modello con
strumenti disponibile localmente o presso il provider scelto. Le chiamate
cloud possono avere un costo. Credenziali e pesi dei modelli non sono inclusi.

## Grafi ed evidenze documentali

La modale **Grafi di conoscenza** gestisce le fonti da cartelle locali,
remote e SharePoint, il grafo documentale semantico e quello della codebase.
Il grafo documentale conserva versioni e prove sulle relazioni esplicite
e inferite dal modello; la stesura della documentazione tecnico funzionale usa questo grafo insieme a quello del codice.

I subagenti ricevono un perimetro di lettura delle evidenze e possono leggere
gli snapshot per intero, per sezione o per passaggio con paginazione.
La copertura effettiva e le citazioni verificate sono restituite
all'orchestratore e visibili nelle attivita.

## Documentazione

- [Panoramica e comandi](docs/README-SUITE.md)
- [Primo avvio](docs/RESOCONTO-E-PRIMO-AVVIO.md)
- [Connessioni e chiavi](docs/GUIDA-BYOK.md)
- [Fonti e documentazione tecnico funzionale](docs/GUIDA-FONTI-DOCUMENTAZIONE-TECNICO-FUNZIONALE.md)
- [Conoscenza e grafi](docs/GUIDA-CONOSCENZA-E-GRAFI.md)
- [Benchmark](docs/GUIDA-BENCHMARK.md)
- [Contesto e consegne](docs/CONTESTO-E-CONSEGNE.md)
- [Verifiche e limiti della distribuzione](docs/VERIFICA-SUITE.md)
- [Consolidamento delle evolutive](docs/CONSOLIDAMENTO-2026-11-04.md)
- [Collaudo SharePoint su tenant reale](docs/COLLAUDO-SHAREPOINT.md)
- [Controllo privacy del repository](docs/PRIVACY-REVIEW.md)
- [Prompt inviati ai modelli](prompts/LEGGIMI.md)

I report di analisi interni sono in `docs/interni/`.

Questo repository contiene i sorgenti necessari all'installer. I riferimenti
nelle guide a ZIP, checksum, Archivio, Documentazione e Gestisci-PiSuite.ps1
riguardano la distribuzione Windows separata: per installare dal clone basta
`Install.cmd` nella cartella principale.

## Sviluppo e pubblicazione

Pi Suite viene fornita **senza la tab benchmark**. Il modulo opzionale si chiama
`pi-suite-benchmarks`. La cartella [`modules/pi-suite-benchmarks`](modules/pi-suite-benchmarks/README.md)
è autonoma: il suo contenuto è pronto da copiare nella radice di un nuovo
repository. Include backend Python, frontend, catalogo, test, CI e licenza.
La cartella è solo una copia pronta da pubblicare: non viene installata né
caricata dall’applicazione. Può essere spostata nel nuovo repository.

Dopo aver pubblicato il modulo e creato il tag `v1.0.0`, dalla radice di Pi Suite
installa il modulo da Git (inserendo URL e tag reali):

```powershell
npm install --save-exact "git+https://github.com/OWNER/REPOSITORY.git#v1.0.0"
```

Versiona `package.json` e `package-lock.json`. A quel punto la copia in
`modules/pi-suite-benchmarks` può essere rimossa da Pi Suite; installer e updater
supportano anche l'installazione senza questa cartella. Non occorrono modifiche
al codice: dopo il riavvio, il server rileva il modulo in `node_modules` e
aggiunge la tab. Senza il pacchetto, la suite funziona e la tab non compare.
Database e risultati esistenti restano nella cartella dati.

Le dipendenze sono fissate in `package-lock.json` e nei file
`requirements-*.txt`. I test sono in `tests/` e non fanno parte dell'app
installata. Per eseguirli dalla cartella del clone:

```powershell
npm ci
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install --no-deps -r requirements-ast.txt
npm test
```

`npm test` esegue il controllo sintattico TypeScript, i test Python e Node e i
test dell'interfaccia con Microsoft Edge; `node tests/run.mjs <filtro>` ne
esegue solo una parte. Il codice è formattato con Prettier (JS, TS, CSS, HTML)
e Ruff (Python, da `requirements-dev.txt`): `npm run format` lo applica,
`npm run format:check` lo verifica. La stessa sequenza gira in GitHub Actions a ogni push
(`.github/workflows/test.yml`). I controlli della pubblicazione restano negli
strumenti locali di sviluppo.

Prima di aggiornare `@earendil-works/pi-coding-agent` o `pi-subagents` esegui `npm test`:
`tests/pi-contract.test.mjs` verifica gli export, gli eventi e i percorsi interni usati dalla suite
(raccolti per pi-subagents in `pi-bridge.mjs`) e `tests/e2e-chat.test.py` avvia una chat completa
con un provider simulato.

Prima di ogni push, controlla i file selezionati con `git diff --cached`.
Configurazioni reali,
dati dell'app, cache, sessioni, backup e pacchetti sono esclusi da `.gitignore`.

Licenza [MIT](LICENSE); [avvisi sulle dipendenze](THIRD-PARTY-NOTICES.md).
