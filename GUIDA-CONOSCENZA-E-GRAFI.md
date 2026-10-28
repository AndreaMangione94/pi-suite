# Pi Suite 0.6.5 — Fonti, grafi e AS-IS riutilizzabili

Guida aggiornata alla distribuzione Windows del 28 ottobre 2026.

## Modale Grafi di conoscenza

In **Il tuo workspace** seleziona un progetto e apri **Grafi di conoscenza**. Senza un progetto il pulsante è disabilitato e l’indicazione **Scegli un progetto per continuare.** spiega come abilitarlo. Funziona anche con cartelle senza Git. La prima riga della modale elenca i file persistenti del progetto, ciascuno con icona, nome e data di creazione; il clic apre il contenuto. La spiegazione descrive nodi e relazioni e il vantaggio della navigazione deterministica: a parità di versione, nodo di partenza e regole si seguono gli stessi collegamenti. Questo aiuta a ripetere le esplorazioni e risalire alle fonti, senza trasformare le interpretazioni semantiche in fatti verificati.

La modale **As-is** mostra i documenti già salvati e usa i grafi preparati in **Grafi di conoscenza**. Alla prima apertura propone i grafi documentali disponibili; le selezioni già salvate restano rispettate. Per creare un AS-IS dal pannello occorre selezionare almeno un grafo disponibile per il progetto; selezione e associazione del nuovo dossier al progetto sono persistenti.

### Grafi documentali e grafo del codice nella stessa modale

**Crea / aggiorna grafo del codice** costruisce il grafo AST della cartella selezionata e lo salva in `data/graphs/<progetto>/graph.json`. La ricerca visualizza al massimo 40 nodi; puoi restringere il termine e aprire un nodo per esplorarne i collegamenti. **Salva riferimenti** conserva le fonti collegate e i testi delle ricerche per il progetto. Il clic sui file salvati apre il JSON del grafo o il descrittore `evidence.json` della fonte, entro il limite di anteprima di 5 MB.

Il **grafo documentale semantico** è il grafo finale del progetto: comprende elementi e riferimenti espliciti più concetti, relazioni fra documenti ed equivalenze ricostruiti dal modello, anche quando i documenti non contengono ID o collegamenti. In **As-is → Grafi di riferimento** sono selezionabili questo grafo finale e il grafo del codice. Gli indici strutturali delle singole fonti restano consultabili nella modale, ma non sostituiscono il grafo semantico come input documentale dell’AS-IS.

Le fonti si collegano in **Grafi di conoscenza → Grafo documentale del progetto**: cartelle locali o di rete (anche percorsi UNC e cartelle OneDrive/SharePoint sincronizzate), SharePoint remoto tramite Microsoft Graph o repository già supportati. **Salva collegamento** associa la fonte al progetto. Seleziona una o più cartelle e premi **Crea / aggiorna grafo documentale del progetto**. Questa operazione usa il modello Orchestratore configurato e può avere costi API; non crea un dossier AS-IS.

Il motore `DocumentGraphBuilder` gestisce la costruzione in due fasi:

1. La suite acquisisce snapshot, originali, testo, mappe e indici delle relazioni esplicite.
2. Il modello analizza tutti i passaggi documentali e poi sintetizza i collegamenti fra documenti. Concetti equivalenti possono essere uniti conservando alias ed evidenze. Citazioni, intervalli, riferimenti e assenza di relazioni verso nodi inesistenti vengono controllati prima del salvataggio.

Le estrazioni semantiche dei documenti invariati vengono riutilizzate dalla cache, con controllo del modello e del contenuto. La sintesi fra documenti viene rivalutata se cambia il corpus. Il salvataggio pubblica una nuova versione solo dopo il completamento: un errore lascia disponibile il grafo precedente. Il controllo delle evidenze verifica provenienza e integrità, non certifica automaticamente l’interpretazione semantica.

I file Markdown nella riga **Documenti AS-IS salvati** sono consultabili prima della registrazione; **AS-IS consultabili** gestisce invece le copie registrate, indicizzate e riutilizzabili dagli agenti.

## Preparare le fonti una volta

In **Il tuo workspace → Grafi di conoscenza**, collega cartelle SharePoint, cartelle locali o repository Azure e crea i grafi documentali. Nella stessa modale gestisci anche il grafo del codice, gli indici, la ricerca delle evidenze e le interpretazioni proposte. Le operazioni sui grafi restano nella modale, con stato e risultato. Ogni sincronizzazione salva uno snapshot con gli originali supportati, il testo estratto, gli hash e i localizzatori. **Acquisisci / aggiorna file** esegue solo estrazione e indicizzazione strutturale senza modelli; il pulsante di creazione del grafo documentale completa poi l’analisi semantica con il modello configurato.

Nelle schede trovi numero di documenti, esclusioni, nodi e relazioni. Per aggiornare gli indici di snapshot gia acquisiti, seleziona le fonti e premi **Aggiorna indici espliciti delle fonti selezionate**. Questo aggiornamento riusa le estrazioni valide e non chiama provider. La creazione semantica invia invece i testi necessari al modello selezionato.

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

Nella normale chat il corpus viene fissato alla prima consultazione e condiviso con i figli. `/sources-refresh` ricarica i riferimenti salvati per la chat; quando è disponibile il grafo documentale, ne conserva gli snapshot coerenti. Per usare nuove versioni dei documenti rigenera prima il grafo nella modale. Il comando non sincronizza né genera documenti. Nei dossier, `FONTI.json` mantiene invece le versioni esplicitamente fissate. Una consultazione non ricostruisce indici, non arricchisce automaticamente i grafi e non rigenera l'AS-IS.

Dal pannello puoi provare la ricerca, esplorare i collegamenti e aprire il testo completo nella sezione **Ricerca e indici delle fonti** della modale Grafi di conoscenza.

## Lettura delegata con perimetro operativo

L’orchestratore può affidare l’analisi delle evidenze a un subagente mediante `evidenceScope` in `delegate_tasks`. Specifica `focus`, `questions`, fonti (`sourceIds`), documenti iniziali (`documents` con `source` e `document`, eventualmente `snapshot`), nodi del grafo (`graphNodes`), `limits` ed `expectedOutput`. Il runtime verifica fonti, documenti e snapshot nel corpus fissato e conserva le versioni degli indici nel `contract.json` e nell’`INCARICO.md` del figlio. Con i vecchi incarichi deriva il perimetro dai campi generali e dal corpus disponibile.

Il figlio sceglie autonomamente `read_evidence` in modalità `full`, `section` o `passage`. Per completare una selezione paginata usa `offset=nextOffset`, conservando fonte, snapshot, documento, modalità e intervallo. Gli offset contano caratteri nel testo selezionato; le pagine PDF sono localizzatori distinti. Il perimetro è operativo: le fonti iniziali orientano il lavoro e il figlio può esplorare il corpus già fissato per verificare il contesto. Un ampliamento dell’obiettivo va segnalato al genitore.

Le letture riuscite con `read_evidence` e `read_connected_source` vengono registrate in `evidence-reading.json`, con intervalli, pagine restituite, hash e copertura. Prima di concludere il figlio chiama `report_evidence_reading` con sintesi, citazioni, documenti iniziali non letti e motivi, dubbi e richieste di ampliamento. Le citazioni vengono controllate rispetto allo snapshot e alle letture effettive. Una sola pagina o la sola ultima pagina non vengono considerate una lettura integrale; rileggere lo stesso intervallo non aumenta la copertura.

Il risultato della delega contiene `evidenceReading`: copertura automatica, resoconto del figlio e segnalazioni `reportMissing` e `declarationStale`. Un resoconto diventa da aggiornare se seguono nuove letture. È previsto al massimo un richiamo al figlio per consegnarlo. Il genitore verifica risultati e lacune senza dover caricare prima tutti i documenti. La pagina **Attività subagenti** mostra perimetro, testi letti integralmente o in parte, citazioni, versioni e richieste di ampliamento. La copertura del testo estratto non attesta copertura integrale di immagini o altre parti escluse dall’originale.

## Creare o aggiornare un AS-IS

Sono disponibili tre ingressi alla preparazione dei dossier, con selezioni diverse:

1. Nel pannello seleziona almeno un **Grafo di riferimento**. **Aggiorna fonti e crea AS-IS** sincronizza le sue fonti e aggiorna il grafo semantico riusando la cache; **Usa snapshot esistenti** fissa la versione già salvata del grafo semantico e i suoi snapshot e acquisisce comunque la cartella corrente per il grafo locale.
2. `/asis [obiettivo]` nella chat aggiorna le fonti del dossier attivo o quelle salvate per il progetto corrente; fuori dai progetti registrati richiede di associare le fonti documentali a un progetto prima di costruire il grafo semantico. Non usa la selezione dei grafi del pannello.
3. Su richiesta esplicita l’orchestratore può usare `prepare_asis` sul corpus della chat; il parametro `refresh` controlla la sincronizzazione delle fonti. Questo strumento non richiede la selezione dei grafi nella modale.

Prima di dichiarare pronto il dossier la suite verifica e aggiorna grafi e indici per gli snapshot selezionati, ricostruisce il grafo codice se manca e fissa insieme le versioni delle fonti e degli indici. Se un aggiornamento necessario fallisce, la generazione non parte. I formati non supportati sono dichiarati nella copertura, senza fingere un grafo completo.

L'orchestratore e i subagenti leggono soprattutto documenti e codice originali, anche integralmente quando utile e compatibile con il contesto disponibile. Per produrre un AS-IS partono dal grafo documentale semantico salvato con `document_graph`, approfondiscono con `knowledge_search` e `knowledge_trace`, leggono gli originali e solo dopo confrontano l’implementazione con il grafo del codice. Questa priorità è inclusa nell’incarico del dossier e negli incarichi dei figli. Se sono disponibili solo evidenze di codice, dichiarano l’assenza di documentazione. Per le normali consultazioni i grafi restano facoltativi. Le attese delle deleghe restano a gruppi: non viene introdotto uno scambio continuo fra fratelli in esecuzione.

Lo strumento `prepare_asis` restituisce una cartella nuova. Le proposte dei figli sono relative a quella cartella; il genitore le verifica e integra li. La preparazione non e gia un AS-IS completato.

## Registrare il dossier prodotto

Dopo aver scritto e controllato i documenti, l'orchestratore puo chiamare `register_asis`. In alternativa usa `/asis-register` nella chat del dossier, oppure inserisci la cartella in **AS-IS consultabili** e premi **Verifica citazioni e registra AS-IS**.

La registrazione richiede AS-IS.md e citazioni valide delle fonti primarie fissate; raccoglie anche gli altri cinque documenti standard se presenti. Salva una copia versionata e indicizzata, conservando dipendenze e verifiche. Ripetere la registrazione degli stessi contenuti riutilizza la stessa versione. Lo stato semantico resta **non revisionato**: la registrazione non equivale ad approvazione umana.

Gli AS-IS registrati diventano consultabili insieme alle fonti pertinenti, con rimandi agli originali. Non vengono importati indiscriminatamente tutti i Markdown del progetto. Non considerare AS-IS e fonte da esso riassunta due conferme indipendenti.

Se cambiano i contenuti o la revisione delle fonti, il pannello indica **da rivalutare**. Una sincronizzazione senza variazioni dei contenuti indicizzati non basta a invalidare l'AS-IS. Le copie precedenti restano consultabili come storico, con la segnalazione esplicita. L'aggiornamento dei documenti parte soltanto su richiesta o tramite un'automazione configurata esternamente; questa versione non installa scheduler o rigenerazioni periodiche.

## Interpretazioni semantiche opzionali

Il grafo documentale finale include già le relazioni semantiche prodotte durante la costruzione. Durante le chat puoi inoltre chiedere al modello di proporre altri collegamenti fra requisiti, sezioni, simboli o dati. `propose_relation` salva nodi, relazione, motivazione e intervalli di evidenza validati, separatamente dal grafo strutturale. I tipi disponibili sono implements, supports, contradicts, depends_on, same_concept e describes.

Le proposte sono **unreviewed**. `knowledge_trace` le mostra separatamente soltanto con `includeInferred: true`. Nel pannello **Interpretazioni proposte** puoi accettare o rifiutare ogni interpretazione con una motivazione. Anche dopo la revisione resta classificata come inferenza del modello. I figli non dispongono di uno strumento di approvazione.

Non partono chiamate modello aggiuntive durante la sincronizzazione: l'arricchimento avviene solo come lavoro richiesto alla chat e usa i provider configurati.

## Persistenza e costi

La preparazione di una versione si sostiene una volta; gli artefatti rimangono su disco. Estrattori, ricerca e grafi strutturali consumano risorse locali. La creazione del grafo documentale semantico usa il modello configurato e può comportare costi API. La generazione dell'AS-IS e le interpretazioni semantiche usano i modelli scelti e possono avere costi API. Durante la consultazione restano i normali costi del modello che legge le evidenze e risponde; non si ripaga la creazione degli artefatti.

Il grafo documentale finale è in `data/graphs/<progetto>/documental/versions/<versione>/graph.json`; `current.json` indica l’ultima versione riuscita. La cache semantica è `data/graphs/document-semantic-cache.sqlite`. Ogni dossier conserva il riferimento in `GRAFO-DOCUMENTALE.json` e in `FONTI.json`; aggiornare il progetto non modifica le versioni già fissate.

In `data/sources/<fonte>/<snapshot>/` sono conservati manifest, originali, testo, mappe e indici. `indexes/<versione>/` mantiene le versioni fissate dai dossier. I dossier prodotti sono in `data/documentation/<id>/`. Il registro degli AS-IS è in `data/sources/asis-registry.json`; le interpretazioni sono separate in `data/knowledge/proposals/`. Nella copia sorgente `data` corrisponde a `suite-data`; nell'installazione a `%LOCALAPPDATA%/PiSuite/data`.

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

> Crea l'AS-IS del ciclo ordine usando le fonti configurate. Prepara prima grafi e indici aggiornati, leggi codice e documenti pertinenti e registra il dossier al termine.

> Partendo dalle evidenze correnti e dall'AS-IS, prepara una specifica per aggiungere una nuova modalita di pagamento. Distingui stato attuale e TO-BE, segnala gli impatti verificati e quelli soltanto ipotizzati.
