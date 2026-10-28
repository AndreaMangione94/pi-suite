# Pi Suite

Suite Windows per una chat con orchestratore, subagenti con incarichi Markdown,
fonti documentali e grafi di conoscenza locali. Versione applicativa: **0.6.5**.

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
installa l'app in `%LOCALAPPDATA%\PiSuite` e crea il comando `pi` e il
collegamento **Pi Suite** sul desktop. Sono necessari Windows e Internet;
le installazioni dei prerequisiti possono richiedere interventi del sistema.

Dopo l'installazione apri **Pi Suite** dal desktop oppure `pi suite` in un
nuovo terminale. L'applicazione installata usa la propria copia del codice e
la propria area dati, quindi puo funzionare senza la cartella clonata.

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
e inferite dal modello; la stesura AS-IS usa questo grafo insieme a quello del codice.

I subagenti ricevono un perimetro di lettura delle evidenze e possono leggere
gli snapshot per intero, per sezione o per passaggio con paginazione.
La copertura effettiva e le citazioni verificate sono restituite
all'orchestratore e visibili nelle attivita.

## Documentazione

- [Panoramica e comandi](README-SUITE.md)
- [Primo avvio](RESOCONTO-E-PRIMO-AVVIO.md)
- [Connessioni e chiavi](GUIDA-BYOK.md)
- [Fonti e AS-IS](GUIDA-FONTI-AS-IS.md)
- [Conoscenza e grafi](GUIDA-CONOSCENZA-E-GRAFI.md)
- [Benchmark](GUIDA-BENCHMARK.md)
- [Contesto e consegne](MEMORY.md)
- [Verifiche e limiti della distribuzione](VERIFICA-SUITE.md)
- [Controllo privacy del repository](PRIVACY-REVIEW.md)

Questo repository contiene i sorgenti necessari all'installer. I riferimenti
nelle guide a ZIP, checksum, Archivio, Documentazione e Gestisci-PiSuite.ps1
riguardano la distribuzione Windows separata: per installare dal clone basta
`Install.cmd` nella cartella principale.

## Sviluppo e pubblicazione

Le dipendenze sono fissate in `package-lock.json` e nei file
`requirements-*.txt`. Per verificare i sorgenti JavaScript usa
`npm run test:syntax`. Il test Python `python -m unittest test_workspace.py`
richiede le dipendenze AST installate.

Prima di ogni push, controlla i file selezionati con `git diff --cached` e
avvia `python scripts/verify_publication.py --staged`. Configurazioni reali,
dati dell'app, cache, sessioni, backup e pacchetti sono esclusi da `.gitignore`.

Licenza [MIT](LICENSE); [avvisi sulle dipendenze](THIRD-PARTY-NOTICES.md).
