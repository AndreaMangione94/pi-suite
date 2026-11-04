# Pi Suite — Fonti, grafi e documentazione tecnico funzionale riutilizzabile

Guida aggiornata alla distribuzione Windows del 1 novembre 2026.

## Grafi e documentazione tecnico funzionale nel contesto

L’icona **Progetto** permette di scegliere o creare un progetto e di tornare al contesto pulito; il suo badge indica 0 o 1. Accanto, l’icona **Grafi** apre l’elenco dei grafi disponibili, ciascuno con icona, label, selezione per la chat e × di rimozione. **Genera grafo** costruisce il grafo AST della cartella del progetto per Python, JavaScript e TypeScript. Se non esistono grafi è l’unica opzione disponibile.

L’icona **Documentazione tecnico funzionale** permette di includere o escludere i documenti già creati. **Aggiungi** collega altre cartelle locali, SharePoint o repository Git HTTPS/Azure. **genera .md e grafo** si abilita solo con almeno una fonte scelta tramite **documentazione tecnico funzionale → Aggiungi** e usa sempre anche il progetto e gli eventuali grafi selezionati. Non richiede un grafo di partenza.

Il risultato comprende un **DOCUMENTAZIONE-TECNICO-FUNZIONALE.md dettagliato**, scritto con i modelli e con delega ai subagenti configurati, e il **grafo semantico del documento finale**, generato tramite LLM dopo la revisione e la validazione delle citazioni. Il grafo viene salvato e selezionato automaticamente. I precedenti grafi documentali delle fonti rimangono consultabili separatamente.

`DocumentGraphBuilder` analizza i passaggi del Markdown, ricostruisce concetti e relazioni con evidenze e valida citazioni e riferimenti prima di pubblicare il grafo. La cache riusa le analisi semantiche valide dei contenuti invariati. Il grafo della documentazione tecnico funzionale usa soltanto DOCUMENTAZIONE-TECNICO-FUNZIONALE.md; gli allegati non sostituiscono il documento principale.

Le scelte sono salvate automaticamente. La chat e i suoi figli ricevono soltanto gli artefatti selezionati: la skill `graph-explorer` è inclusa se almeno un grafo è selezionato, `lettura-documentazione-tecnico-funzionale` se almeno un documento di documentazione tecnico funzionale è selezionato. `read_documentation` offre una navigazione deterministica del testo con ricerca, righe e paginazione, anche senza grafi.

Dopo le modifiche integrate dall’orchestratore o dal modello singolo, la suite aggiorna in background i grafi del codice interessati dal cambiamento, senza modelli. Il turno successivo non attende l’aggiornamento: fino al termine valgono i grafi precedenti (`graph_query` lo segnala) e i nuovi riferimenti si applicano all’inizio del turno dopo. I grafi semantici, che richiedono il modello a pagamento, non vengono ricostruiti automaticamente: nel menu Grafi compaiono **da aggiornare** e il pulsante ↻ li rigenera su richiesta. Senza modifiche non parte alcun aggiornamento. Le selezioni restano rispettate.

## Preparare le fonti una volta

In **Il tuo workspace → Grafi di conoscenza**, scegli il tipo di grafo e la cartella, poi premi **Genera grafo**. Lo stato dell’operazione resta nella sezione di creazione. Ogni acquisizione salva gli originali supportati, il testo estratto, gli hash, i localizzatori e gli indici strutturali. Per un grafo documentale segue l’analisi semantica con il modello configurato. Per aggiornare i contenuti, avvia una nuova generazione: i grafi precedenti restano in **I miei grafi**.

Le parti indicizzate comprendono documenti, sezioni, tabelle documentali, riferimenti espliciti e identificatori come REQ-17, API-2, PROC-3, COMP-4 e DATA-5. I contratti OpenAPI/Swagger JSON espongono le operazioni dichiarate. Il codice Python, JavaScript e TypeScript usa il grafo AST gia integrato. Il parser SQL estrae dichiarazioni CREATE TABLE, colonne e REFERENCES, senza eseguire SQL.

## Consultazione opzionale nella chat

Orchestratore e subagenti possono scegliere questi strumenti per domande, analisi, diagnosi, sviluppo e documentazione:

| Strumento | Uso |
| --- | --- |
| `document_graph` | Consulta il grafo semantico finale del progetto o la versione fissata nel dossier, con evidenze e collegamenti fra documenti |
| `knowledge_search` | Ricerca testuale locale con brevi estratti, citazioni e nodi navigabili; `source` limita la ricerca a una fonte selezionata |
| `knowledge_trace` | Esplora nodi vicini, relazioni strutturali, corrispondenze esatte e rimandi alle evidenze |
| `read_evidence` | Legge gli originali disponibili come testo: `mode` puo essere `passage`, `section` o `full` |
| `propose_relation` | Salva un'interpretazione semantica separata, con motivazione ed evidenze; non la approva |

Il modello puo usarli quando rileva dubbi o necessita di informazioni e verifiche; puo anche leggere direttamente una fonte nota. Non e imposto un percorso fisso. La vicinanza nel grafo aiuta a trovare documenti e codice da aprire, non prova da sola il significato o la completezza.

Gli estratti iniziali non sostituiscono gli originali. `read_evidence` permette di acquisire nel contesto anche un file intero: per le risposte lunghe segue una paginazione esplicita tramite `nextOffset` e `offset`. Ogni risposta restituisce al massimo 200.000 caratteri. Un file non diventa "letto integralmente" solo perche e stata aperta la prima parte. La mappa indica pagine PDF, paragrafi DOCX e sezioni quando disponibili.

Una citazione ha forma `[sourceId:documentId]`; il riferimento puntuale puo usare `[sourceId:documentId]#L3-L12`. Sono indicati snapshot, hash, percorso, copertura e parti escluse. La validazione controlla identita, integrita e intervalli; non certifica il sostegno semantico della conclusione.

Nella normale chat il corpus viene fissato alla prima consultazione e condiviso con i figli. `/sources-refresh` ricarica i riferimenti salvati per la chat; quando è disponibile il grafo documentale, ne conserva gli snapshot coerenti. Per usare nuove versioni dei documenti rigenera prima il grafo nella modale. Il comando non sincronizza né genera documenti. Nei dossier, `FONTI.json` mantiene invece le versioni esplicitamente fissate. Una consultazione non ricostruisce indici, non arricchisce automaticamente i grafi e non rigenera la documentazione tecnico funzionale.

Dal pannello puoi cercare nel grafo, esplorare i collegamenti e aprire le fonti nella sezione **Esplora il grafo** della modale Grafi di conoscenza.

## Lettura delegata con perimetro operativo

L’orchestratore può affidare l’analisi delle evidenze a un subagente mediante `evidenceScope` in `delegate_tasks`. Specifica `focus`, `questions`, fonti (`sourceIds`), documenti iniziali (`documents` con `source` e `document`, eventualmente `snapshot`), nodi del grafo (`graphNodes`), `limits` ed `expectedOutput`. Il runtime verifica fonti, documenti e snapshot nel corpus fissato e conserva le versioni degli indici nel `contract.json` e nell’`INCARICO.md` del figlio. Con i vecchi incarichi deriva il perimetro dai campi generali e dal corpus disponibile.

Il figlio sceglie autonomamente `read_evidence` in modalità `full`, `section` o `passage`. Per completare una selezione paginata usa `offset=nextOffset`, conservando fonte, snapshot, documento, modalità e intervallo. Gli offset contano caratteri nel testo selezionato; le pagine PDF sono localizzatori distinti. Il perimetro è operativo: le fonti iniziali orientano il lavoro e il figlio può esplorare il corpus già fissato per verificare il contesto. Un ampliamento dell’obiettivo va segnalato al genitore.

Le letture riuscite con `read_evidence` e `read_connected_source` vengono registrate in `evidence-reading.json`, con intervalli, pagine restituite, hash e copertura. Prima di concludere il figlio chiama `report_evidence_reading` con sintesi, citazioni, documenti iniziali non letti e motivi, dubbi e richieste di ampliamento. Le citazioni vengono controllate rispetto allo snapshot e alle letture effettive. Una sola pagina o la sola ultima pagina non vengono considerate una lettura integrale; rileggere lo stesso intervallo non aumenta la copertura.

Il risultato della delega contiene `evidenceReading`: copertura automatica, resoconto del figlio e segnalazioni `reportMissing` e `declarationStale`. Un resoconto diventa da aggiornare se seguono nuove letture. È previsto al massimo un richiamo al figlio per consegnarlo. Il genitore verifica risultati e lacune senza dover caricare prima tutti i documenti. La pagina **Attività subagenti** mostra perimetro, testi letti integralmente o in parte, citazioni, versioni e richieste di ampliamento. La copertura del testo estratto non attesta copertura integrale di immagini o altre parti escluse dall’originale.

## Creare o aggiornare una documentazione tecnico funzionale

Nel menu Documentazione tecnico funzionale scegli **genera .md e grafo**, inserisci nome e obiettivo, poi avvia la richiesta. La suite acquisisce il progetto corrente e le fonti aggiunte; le nuove fonti vengono sincronizzate anche quando non si richiede di aggiornare quelle già acquisite. Il contesto conserva i grafi esplicitamente selezionati, senza costruire obbligatoriamente un grafo delle fonti prima della stesura.

`/documentazione-tecnico-funzionale [obiettivo]` avvia la stessa preparazione nella chat corrente; `prepare_documentation` è disponibile all’orchestratore per richieste esplicite di generazione. Tutti gli ingressi producono un dossier con fonti fissate e contesto del progetto. Gli originali rimangono le evidenze principali e le consegne dei figli vengono controllate prima dell’integrazione.

Per questo flusso AS-IS l'orchestratore salva prima PIANO-DOCUMENTAZIONE.md e assegna un task distinto per ogni micro modulo o funzionalità terminale. I figli rimangono nel proprio ambito, lasciando riferimenti alle altre unità. Il genitore integra le consegne e aggiorna piano e incarichi per nuove unità, lacune e contraddizioni. Questa modalità è specifica del dossier tecnico-funzionale e richiede il profilo Subagenti; non cambia la delega delle altre richieste.

Il documento principale deve descrivere l'utilizzo di ciascuna funzionalità: attori, permessi, prerequisiti, azioni, risposte del sistema, regole, varianti ed errori, con dettagli architetturali, dati, interfacce, operatività e lacune supportati da citazioni. Piano e proposte dei singoli moduli sono artefatti di lavoro e non sostituiscono il documento finale integrato. `register_documentation` crea il grafo semantico di quel Markdown; non verifica automaticamente la completezza funzionale. I task necessari ancora pendenti vanno segnalati come lavoro parziale.

## Registrare il dossier prodotto

Dopo aver scritto e controllato i documenti, l'orchestratore puo chiamare `register_documentation`. L’incarico richiede questo passaggio alla fine della generazione. Puoi ripeterlo con `/documentazione-tecnico-funzionale-register` nella chat del dossier; il salvataggio e la consultazione in **Documentazione tecnico funzionale salvata** avvengono automaticamente e non richiedono una CTA di registrazione nel pannello.

La registrazione richiede DOCUMENTAZIONE-TECNICO-FUNZIONALE.md e citazioni valide delle fonti primarie fissate; raccoglie anche gli altri cinque documenti standard se presenti. Salva una copia versionata e indicizzata, conservando dipendenze e verifiche. Ripetere la registrazione degli stessi contenuti riutilizza la stessa versione. Lo stato semantico resta **non revisionato**: la registrazione non equivale ad approvazione umana.

I documenti di documentazione tecnico funzionale selezionati diventano consultabili nella chat con rimandi agli originali. Non vengono importati indiscriminatamente tutti i Markdown del progetto. Non considerare documentazione tecnico funzionale e fonte da esso riassunta due conferme indipendenti.

Se cambiano i contenuti o la revisione delle fonti, il pannello indica **da rivalutare**. Una sincronizzazione senza variazioni dei contenuti indicizzati non basta a invalidare la documentazione tecnico funzionale. Le copie precedenti restano consultabili come storico, con la segnalazione esplicita. L'aggiornamento dei documenti parte su richiesta; i grafi presenti vengono aggiornati dopo le modifiche integrate nella chat; questa versione non installa scheduler o rigenerazioni periodiche.

## Interpretazioni semantiche opzionali

Il grafo documentale finale include già le relazioni semantiche prodotte durante la costruzione. Durante le chat puoi inoltre chiedere al modello di proporre altri collegamenti fra requisiti, sezioni, simboli o dati. `propose_relation` salva nodi, relazione, motivazione e intervalli di evidenza validati, separatamente dal grafo strutturale. I tipi disponibili sono implements, supports, contradicts, depends_on, same_concept e describes.

Le proposte sono **unreviewed**. `knowledge_trace` le mostra separatamente soltanto con `includeInferred: true`. Nel pannello **Interpretazioni proposte** puoi accettare o rifiutare ogni interpretazione con una motivazione. Anche dopo la revisione resta classificata come inferenza del modello. I figli non dispongono di uno strumento di approvazione.

Non partono chiamate modello aggiuntive durante la sincronizzazione: l'arricchimento avviene solo come lavoro richiesto alla chat e usa i provider configurati.

## Persistenza e costi

La preparazione di una versione si sostiene una volta; gli artefatti rimangono su disco. Estrattori, ricerca e grafi strutturali consumano risorse locali. La creazione del grafo documentale semantico usa il modello configurato e può comportare costi API. La generazione della documentazione tecnico funzionale e le interpretazioni semantiche usano i modelli scelti e possono avere costi API. Durante la consultazione restano i normali costi del modello che legge le evidenze e risponde; non si ripaga la creazione degli artefatti.

Il grafo documentale finale è in `data/graphs/<progetto>/documental/versions/<versione>/graph.json`; `current.json` indica l’ultima versione riuscita. La cache semantica è `data/graphs/document-semantic-cache.sqlite`. Ogni dossier conserva il riferimento in `GRAFO-DOCUMENTALE.json` e in `FONTI.json`; aggiornare il progetto non modifica le versioni già fissate.

In `data/sources/<fonte>/<snapshot>/` sono conservati manifest, originali, testo, mappe e indici. `indexes/<versione>/` mantiene le versioni fissate dai dossier. I dossier prodotti sono in `data/documentation/<id>/`. Il registro dei documenti di documentazione tecnico funzionale è in `data/sources/documentation-registry.json`; le interpretazioni sono separate in `data/knowledge/proposals/`. Nella copia sorgente `data` corrisponde a `suite-data`; nell'installazione a `%LOCALAPPDATA%/PiSuite/data`.

## Copertura e limiti

- Grafo semantico per progetto: fino a 5.000 documenti e 100 MB di testo; struttura fino a 100.000 nodi e 200.000 relazioni, più fino a 10.000 concetti e 30.000 relazioni semantiche. La generazione richiede un modello con strumenti e almeno 16.000 token di contesto.
- Fonti: massimo 1000 file, 5 MB per file e 100 MB acquisiti e 100 MB di testo estratto per fonte; fino a 5.000.000 caratteri estratti per documento, con esclusioni/troncamenti visibili.
- PDF: fino a 200 pagine, testo estraibile; niente OCR, immagini o garanzia sull'ordine di lettura delle tabelle.
- DOCX: corpo, paragrafi, testo delle celle, titoli e hyperlink; non include integralmente immagini, note, intestazioni o revisioni. Non attribuisce pagine renderizzate.
- Codice AST: Python/JS/TS per file UTF-8 fino a 200 KB. Altri linguaggi restano ricercabili e leggibili come testo; le chiamate dinamiche e le dipendenze globali non sono risolte automaticamente.
- SQL: sottoinsieme dichiarativo CREATE TABLE/REFERENCES con identificatori comuni. Nessuna attestazione dello schema effettivo di produzione, nessuna ricostruzione completa da ALTER/migration/procedure.
- OpenAPI: operazioni dichiarate in JSON. YAML rimane testo ricercabile; non e ancora un contratto strutturalmente risolto dal parser.
- Identificatori uguali creano corrispondenze testuali, non provano automaticamente implementazione, identita di concetti o flussi tra repository.
- Le letture dei file locali dei figli con `read_source` conservano il limite storico di 200 KB. La lettura estesa e disponibile per gli snapshot tramite `read_evidence`.
- Nessun sistema di ricerca garantisce assenza di allucinazioni. La riduzione di token, errori e latenza va misurata sul modello e sulle domande reali.

## Esempi di prompt

> Quali controlli impediscono di fatturare un ordine non confermato? Usa le fonti se servono, apri gli originali pertinenti e distingui specifica, implementazione e lacune.

> Crea la documentazione tecnico funzionale del ciclo ordine usando le fonti configurate. Prepara prima grafi e indici aggiornati, leggi codice e documenti pertinenti e registra il dossier al termine.

> Partendo dalle evidenze correnti e dalla documentazione tecnico funzionale, prepara una specifica per aggiungere una nuova modalita di pagamento. Distingui stato attuale e TO-BE, segnala gli impatti verificati e quelli soltanto ipotizzati.
