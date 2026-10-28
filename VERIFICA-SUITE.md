# Pi Suite 0.6.5 — Distribuzione, verifiche e limiti

Riferimento: pacchetto Windows corrente, documentazione aggiornata il 27 ottobre 2026.

## Contenuto consegnato

| Elemento nella cartella di consegna `pi-suite` | Contenuto e uso |
| --- | --- |
| `Pi-Suite-0.6.5-Windows.zip` | Applicazione installabile; contiene una cartella `pi-suite` con installer, sorgenti, guide, skill, esempi, licenze, test del workspace e manifest. |
| `Pi-Suite-0.6.5-Windows.zip.sha256` | SHA-256 dello ZIP corrente. |
| `LEGGIMI.md` | Installazione, gestione della copia installata e collegamenti alle guide. |
| `Documentazione/` | Copie delle otto guide operative incluse nello ZIP. |
| `Sorgenti/` | Copia modificabile dei file del pacchetto corrente. |
| `Gestisci-PiSuite.ps1` | Aggiornamento o disinstallazione della copia installata, con conservazione dei dati. È esterno allo ZIP applicativo. |
| `Archivio/` | Pacchetto precedente 0.6.4 e relativo checksum. |

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

Il controllo documentale confronta le guide con i sorgenti, l’interfaccia e gli script contenuti nello ZIP 0.6.5. Verifica la corrispondenza delle copie in `Documentazione` e `Sorgenti`, i collegamenti locali, le versioni dichiarate, gli hash del manifest e il checksum dello ZIP. Non equivale a un collaudo funzionale con provider o tenant reali.

Per controllare lo ZIP dalla cartella di consegna:

```powershell
Get-FileHash .\Pi-Suite-0.6.5-Windows.zip -Algorithm SHA256
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
