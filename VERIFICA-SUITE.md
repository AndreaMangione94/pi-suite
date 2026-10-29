# Pi Suite 0.6.6 — Distribuzione, verifiche e limiti

Riferimento: pacchetto Windows corrente, documentazione aggiornata il 28 ottobre 2026.

## Contenuto consegnato

| Elemento nella cartella di consegna `pi-suite` | Contenuto e uso |
| --- | --- |
| `Pi-Suite-0.6.6-Windows.zip` | Applicazione installabile; contiene una cartella `pi-suite` con installer, sorgenti, guide, skill, esempi, licenze, test del workspace e manifest. |
| `Pi-Suite-0.6.6-Windows.zip.sha256` | SHA-256 dello ZIP corrente. |
| `LEGGIMI.md` | Installazione, gestione della copia installata e collegamenti alle guide. |
| `Documentazione/` | Copie delle guide operative e dei resoconti inclusi nello ZIP. |
| `Sorgenti/` | Copia modificabile dei file del pacchetto corrente. |
| `Gestisci-PiSuite.ps1` | Aggiornamento o disinstallazione della copia installata, con conservazione dei dati. È esterno allo ZIP applicativo. |
| `Archivio/` | Pacchetti precedenti 0.6.4 e 0.6.5 con i relativi checksum. |

Non sono inclusi `node_modules`, ambienti Python, dati personali, credenziali o pesi dei modelli. Le dipendenze si scaricano durante l’installazione. Gli esempi usano ID e URL dimostrativi da sostituire.

## Requisiti e versioni dichiarate

- Windows; Internet per scaricare le dipendenze; Node >=22.19, Python 3.13 e Git. L’installer usa winget per i prerequisiti mancanti.
- npm: Pi coding agent 1.0.0, pi-subagents 0.79.0, YAML 2.8.3; dipendenze fissate nel lockfile.
- AST: graphifyy 0.1.14, tree-sitter 0.25.2 e parser Python/JavaScript 0.25.0, TypeScript 0.23.2. PDF: pypdf 6.1.3.
- Inspect AI 0.3.284 è opzionale e usa `.venv-inspect`, separato dall’ambiente principale `.venv`.
- Un modello disponibile nella chat con supporto strumenti. La selezione di un progetto e l’apertura della chat non richiedono un profilo Orchestratore già salvato; Pi gestisce la scelta del modello o la sua assenza.

Le chiavi modello e i token delle fonti sono protetti con Windows DPAPI e legati all’account Windows. La distribuzione non contiene un installer firmato, aggiornamenti automatici o inferenza offline pronta.

## Comportamenti della versione distribuita

La gestione di fonti, grafi documentali, indici e grafo del codice è riunita nella modale Grafi di conoscenza. Il motore DocumentGraphBuilder usa il modello Orchestratore dopo l’estrazione strutturale, salva il grafo semantico finale per progetto e riusa dalla cache i documenti invariati. La generazione documentale è indipendente dall’AS-IS; i dossier partono dal grafo documentale e dagli originali prima di confrontare il codice. I riferimenti precedenti restano compatibili.

- Il workspace crea cartelle in `data/projects/<nome>` o collega cartelle esistenti tramite selettore Windows, anche senza Git. La scelta della cartella si conferma con **Crea progetto**.
- **As-is** e **Grafi di conoscenza** si abilitano dopo la selezione del progetto. Le modali mostrano i file salvati con nome, data di creazione e anteprima. **Salva riferimenti** conserva le scelte per progetto.
- Per creare AS-IS dal pannello serve almeno un grafo disponibile e selezionato. La creazione usa le sue fonti; con un grafo locale acquisisce la cartella corrente anche scegliendo **Usa snapshot esistenti**. `/asis` in chat usa invece le fonti del dossier o quelle salvate per il progetto.
- I dossier fissano snapshot e indici in `FONTI.json`; quelli creati dal pannello conservano l’associazione in `PROGETTO.json`. Consultare i file salvati e registrare un dossier per la ricerca sono operazioni distinte.
- Con Subagenti selezionati la delega è obbligatoria; senza modello Subagenti il genitore lavora direttamente. I figli producono proposte per i soli percorsi assegnati; il genitore verifica e integra.
- Il laboratorio benchmark gestisce prove manuali A/B e tutte le 16 dimensioni. Inspect valuta soltanto le versioni originali di `math-001` ed `extract-001`, per successo, correttezza e formato; gli altri casi richiedono scorer dedicati o revisione umana.

Per i passaggi operativi vedi [Primo avvio](RESOCONTO-E-PRIMO-AVVIO.md), [Fonti e AS-IS](GUIDA-FONTI-AS-IS.md) e [Conoscenza e grafi](GUIDA-CONOSCENZA-E-GRAFI.md).

## Integrità e controllo documentale

Il controllo documentale confronta le guide con i sorgenti, l’interfaccia e gli script contenuti nello ZIP 0.6.6. Verifica la corrispondenza delle copie in `Documentazione` e `Sorgenti`, i collegamenti locali, le versioni dichiarate, gli hash del manifest e il checksum dello ZIP. Non equivale a un collaudo funzionale con provider o tenant reali.

Per controllare lo ZIP dalla cartella di consegna:

```powershell
Get-FileHash .\Pi-Suite-0.6.6-Windows.zip -Algorithm SHA256
powershell -NoProfile -ExecutionPolicy Bypass -File .\Gestisci-PiSuite.ps1 -Azione Aggiorna -VerificaSoltanto
```

Confronta il primo risultato con `.zip.sha256`. Nella cartella estratta, `MANIFEST.sha256.json` elenca gli hash dei singoli file, escluso il manifest stesso. Un aggiornamento dei contenuti richiede di rigenerare manifest, ZIP e checksum insieme.

## Copertura e limiti del collaudo

I collaudi funzionali precedenti usano SDK reali, fonti fittizie e API simulate. Nel pacchetto sono presenti `test_workspace.py` e `test_workspace_ui.cjs`, dedicati a selezione dei grafi, separazione fra progetti, persistenza e interfaccia del workspace. La loro presenza non dimostra che siano stati rieseguiti su ogni PC di destinazione.

Il controllo della documentazione non certifica qualità o risparmio con modelli reali, né accesso a tenant aziendali. Usa **Verifica modello** per controllare il ciclo strumenti dell’endpoint scelto; può avere un costo API. Il ramo winget su Windows appena installato e l’interazione con il selettore cartelle nativo richiedono verifica sul PC di destinazione.

La copertura include testo/codice UTF-8, DOCX e PDF con testo, senza OCR. L’AST è per file Python/JS/TS; SQL ha copertura dichiarativa parziale. Limiti, esclusioni e troncamenti sono descritti nelle guide dedicate. Le citazioni validate tecnicamente non certificano la correttezza semantica delle conclusioni.

## Verifiche del grafo documentale semantico

I test locali coprono DOCX/PDF, cartelle locali e acquisizione SharePoint simulata, relazioni inferite senza riferimenti espliciti, sinonimi, cache incrementale, versioni fissate nei dossier e mantenimento del grafo precedente in caso di errore. Il controllo dell’adattatore Pi usa un provider simulato sul PC; non misura la qualità delle inferenze di un modello reale e non collauda un tenant SharePoint reale.

## Verifiche della lettura delegata

Il controllo locale `test_evidence_reading.cjs` verifica il perimetro fissato nel contratto, le scelte full/section/passage, la paginazione Unicode, la copertura senza doppio conteggio, le citazioni rispetto alle righe lette, i documenti iniziali non letti, l’integrità e la compatibilità degli incarichi precedenti. Con `EVIDENCE_RUNTIME_APP` usa il vero caricatore delle estensioni Pi e simula gli eventi della delega per verificare richiamo limitato e restituzione della copertura al genitore; non chiama modelli esterni.

## Verifiche OneDrive della versione 0.6.6

Il 28 ottobre 2026 sono passati i 20 test Python di `test_onedrive`, `test_document_graph` e `test_workspace`, il controllo sintattico JavaScript e il test Chromium `test_workspace_ui.cjs` su desktop e mobile. Le verifiche coprono cartelle OneDrive con TXT e Markdown, sottocartelle, drive personale e drive esplicito, radice, paginazione, metadati, separazione dei token dai download, esclusioni, snapshot precedenti dopo un errore e uso delle evidenze nel grafo semantico e nel dossier AS-IS. Le chiamate Microsoft Graph e il modello sono simulati: nessun account OneDrive reale è stato collegato nel collaudo. Il login Microsoft interattivo, il rinnovo automatico dei token e la sincronizzazione continua non sono inclusi.

## Correzione della selezione cartelle

I campi Cartella progetto, Cartella locale delle fonti e Cartella del dossier
AS-IS aprono il selettore nativo di Esplora file tramite il campo o **Sfoglia…**.
Il selettore usa direttamente Windows IFileDialog, senza processi PowerShell;
consente di esplorare cartelle del PC, unità e percorsi di rete disponibili.
Annulla conserva il percorso precedente. Una sola finestra può essere aperta
alla volta; un risultato arrivato dopo la chiusura della modale viene ignorato.
La Cartella di riferimento del grafo mostra il progetto attivo e resta informativa.

Sono passati i quattro test di `test_folder_picker.py`, i test Chromium di
`test_folder_picker_ui.cjs` e la regressione `test_workspace_ui.cjs` su desktop e
mobile. I test UI simulano la risposta del selettore e coprono tutti i contesti,
percorsi Unicode, annullamento, errore e nuovo tentativo, richieste duplicate,
chiusura della modale e autenticazione. L'interazione visiva con la finestra
Windows richiede ancora verifica manuale sul PC di destinazione.

## Metriche osservabili nelle prove

Il file per la chat richiede token, durata e costo in `dimensions`, solo con dati
osservabili, unità, metodo, evidenza e copertura dichiarata. `answer` mantiene il
formato richiesto dal compito. Le metriche invisibili restano non disponibili;
i token del solo orchestratore non possono essere presentati come totale con
i subagenti. Entrambi i caricamenti della risposta estraggono il report JSON e
mostrano le dimensioni nell’anteprima e nella scheda, insieme ai dati valutati.

Il 28 ottobre 2026 sono passati i cinque test di `test_benchmark_metrics.py`,
il controllo sintattico JavaScript e il test Chromium
`test_benchmark_metrics_ui.cjs` su desktop e mobile. Coprono contratto, report
JSON/Markdown con BOM, risposta invariata, misure parziali e mancanti,
validazione prima dell’importazione, persistenza e integrazione dei punteggi
nelle revisioni. Il collaudo usa contatori fittizi e controlli deterministici:
non misura modelli reali e non riesegue il motore Inspect opzionale.

Vedi [Resoconto metriche delle prove](RESOCONTO-METRICHE-PROVE.md) per modifiche,
verifiche e limiti dell’osservabilità.

## Report obbligatorio delle prove · 29 ottobre 2026

Il report richiede `answer`, `notes`, `outcome` e le metriche esplicite token,
durata e costo, anche quando non disponibili con motivo. Entrambi i caricamenti
e il server rifiutano report incompleti e sole risposte testuali. Il contratto
vale per tutti i 13 casi, per A e B e indipendentemente dal valutatore.

Sono passati gli otto test Python delle metriche, il controllo sintattico
JavaScript e il test Chromium desktop/mobile, inclusi rifiuto tramite API,
importazioni invalide senza mutazioni del form, persistenza, revisione e
conservazione dei punteggi. Il collaudo usa dati simulati e non riesegue il motore
Inspect opzionale. EvalPlus non è integrato come runner.

## Valutazione LLM separata · 29 ottobre 2026

Il modello testato produce risposta e sole metriche operative osservabili. Il percorso **Completa con valutazione LLM** scarica test, risposta e istruzioni separate; importa poi il JSON del giudice con le sole dimensioni mancanti. L’associazione usa gli ID della scheda e l’hash della risposta. Anteprima e salvataggio impediscono sovrascritture di risposta, consumi e controlli esistenti; la scheda integrata conserva la sorgente e la provenienza `model_judge`.

Sono passati i sette test Python del giudice, i test delle metriche e il collaudo Chromium desktop/mobile dei due percorsi. Sono verificati i tre download, il rifiuto di associazioni errate, la persistenza senza modificare l’originale, le evidenze del giudizio e l’invalidazione dopo una modifica della risposta. Il collaudo usa dati simulati, senza chiamare un modello giudice reale.

## Esportazione della prova per il valutatore esterno · 29 ottobre 2026

La CTA **Esporta prova per valutatore esterno** scarica un unico ZIP con una cartella contenente `01-prova.md`, `02-risposta.json` e `03-istruzioni-valutatore.md`. Le istruzioni includono il comando pronto da inviare al giudice, la rubrica e il modello JSON con gli identificativi e l’hash della risposta.

La CTA è disabilitata finché test, risposta salvata e criteri del valutatore non sono completi e coerenti; il motivo è visibile. Il server applica lo stesso controllo al momento del download. I test verificano struttura e contenuti dello ZIP, assenza di modifiche al registro, stati disabilitati e rifiuto delle esportazioni incomplete. Sono passati i nove test Python del giudice, gli undici delle metriche e il collaudo Chromium desktop/mobile. Le prove usano dati simulati.
