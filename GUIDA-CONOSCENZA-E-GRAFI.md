# Pi Suite 0.6.5 — Fonti, grafi e AS-IS riutilizzabili

Guida aggiornata alla distribuzione Windows del 27 ottobre 2026.

## Modale Grafi di conoscenza

In **Il tuo workspace** seleziona un progetto e apri **Grafi di conoscenza**. Senza un progetto il pulsante è disabilitato e l’indicazione **Scegli un progetto per continuare.** spiega come abilitarlo. Funziona anche con cartelle senza Git. La prima riga della modale elenca i file persistenti del progetto, ciascuno con icona, nome e data di creazione; il clic apre il contenuto. La spiegazione descrive nodi e relazioni e il vantaggio della navigazione deterministica: a parità di versione, nodo di partenza e regole si seguono gli stessi collegamenti. Questo aiuta a ripetere le esplorazioni e risalire alle fonti, senza trasformare le interpretazioni semantiche in fatti verificati.

La modale **As-is** mostra allo stesso modo i documenti già salvati. Per creare un AS-IS dal pannello occorre selezionare almeno un grafo disponibile per il progetto; selezione e associazione del nuovo dossier al progetto sono persistenti.

### Grafo locale e grafi delle fonti

**Crea / aggiorna grafo** costruisce il grafo AST della cartella selezionata e lo salva in `data/graphs/<progetto>/graph.json`. La ricerca visualizza al massimo 40 nodi; puoi restringere il termine e aprire un nodo per esplorarne i collegamenti. **Salva riferimenti** conserva il testo della ricerca per il progetto. Il clic sui file salvati apre il JSON del grafo o il descrittore `evidence.json` della fonte, entro il limite di anteprima di 5 MB.

In **As-is → Grafi di riferimento** sono selezionabili il grafo locale già creato e i grafi degli snapshot indicizzati delle fonti associate al progetto; sono disponibili anche le fonti locali situate nella sua cartella. Per associare una fonte esterna selezionala e premi **Salva riferimenti**. Il solo salvataggio del collegamento non crea un grafo: occorre sincronizzarlo. Il backend ricontrolla che i grafi richiesti siano disponibili per il progetto.

I file Markdown nella riga **Documenti AS-IS salvati** sono consultabili prima della registrazione; **AS-IS consultabili** gestisce invece le copie registrate, indicizzate e riutilizzabili dagli agenti.

## Preparare le fonti una volta

In **Il tuo workspace → As-is**, configura e sincronizza le cartelle SharePoint o i repository Azure. Ogni sincronizzazione salva uno snapshot con gli originali supportati, il testo estratto, gli hash e i localizzatori. Costruisce gli indici testuali e i grafi locali senza chiamare modelli.

Nelle schede trovi numero di documenti, esclusioni, nodi e relazioni. Per aggiornare gli indici di snapshot gia acquisiti, seleziona le fonti e premi **Aggiorna grafi e indici delle fonti selezionate**. Le estrazioni valide sono riutilizzate dalla cache; non vengono inviate ai provider.

Le parti indicizzate comprendono documenti, sezioni, tabelle documentali, riferimenti espliciti e identificatori come REQ-17, API-2, PROC-3, COMP-4 e DATA-5. I contratti OpenAPI/Swagger JSON espongono le operazioni dichiarate. Il codice Python, JavaScript e TypeScript usa il grafo AST gia integrato. Il parser SQL estrae dichiarazioni CREATE TABLE, colonne e REFERENCES, senza eseguire SQL.

## Consultazione opzionale nella chat

Orchestratore e subagenti possono scegliere questi strumenti per domande, analisi, diagnosi, sviluppo e documentazione:

| Strumento | Uso |
| --- | --- |
| `knowledge_search` | Ricerca testuale locale con brevi estratti, citazioni e nodi navigabili; `source` limita la ricerca a una fonte selezionata |
| `knowledge_trace` | Esplora nodi vicini, relazioni strutturali, corrispondenze esatte e rimandi alle evidenze |
| `read_evidence` | Legge gli originali disponibili come testo: `mode` puo essere `passage`, `section` o `full` |
| `propose_relation` | Salva un'interpretazione semantica separata, con motivazione ed evidenze; non la approva |

Il modello puo usarli quando rileva dubbi o necessita di informazioni e verifiche; puo anche leggere direttamente una fonte nota. Non e imposto un percorso fisso. La vicinanza nel grafo aiuta a trovare documenti e codice da aprire, non prova da sola il significato o la completezza.

Gli estratti iniziali non sostituiscono gli originali. `read_evidence` permette di acquisire nel contesto anche un file intero: per le risposte lunghe segue una paginazione esplicita tramite `nextOffset` e `offset`. Ogni risposta restituisce al massimo 200.000 caratteri. Un file non diventa "letto integralmente" solo perche e stata aperta la prima parte. La mappa indica pagine PDF, paragrafi DOCX e sezioni quando disponibili.

Una citazione ha forma `[sourceId:documentId]`; il riferimento puntuale puo usare `[sourceId:documentId]#L3-L12`. Sono indicati snapshot, hash, percorso, copertura e parti escluse. La validazione controlla identita, integrita e intervalli; non certifica il sostegno semantico della conclusione.

Nella normale chat il corpus viene fissato alla prima consultazione e condiviso con i figli. `/sources-refresh` seleziona gli snapshot correnti per le consultazioni successive, senza sincronizzare o generare documenti. Nei dossier, `FONTI.json` mantiene invece le versioni esplicitamente fissate. Una consultazione non ricostruisce indici, non arricchisce automaticamente i grafi e non rigenera l'AS-IS.

Dal pannello puoi provare la ricerca, esplorare i collegamenti e aprire il testo completo nella sezione **Ricerca e indici delle fonti** della modale As-is.

## Creare o aggiornare un AS-IS

Sono disponibili tre ingressi alla preparazione dei dossier, con selezioni diverse:

1. Nel pannello seleziona almeno un **Grafo di riferimento**. **Aggiorna fonti e crea AS-IS** sincronizza le sue fonti; **Usa snapshot esistenti** riusa gli snapshot delle fonti collegate e acquisisce comunque la cartella corrente per il grafo locale.
2. `/asis [obiettivo]` nella chat aggiorna le fonti del dossier attivo o quelle salvate per il progetto corrente; fuori dai progetti registrati usa tutte le fonti configurate. Non usa la selezione dei grafi del pannello.
3. Su richiesta esplicita l’orchestratore può usare `prepare_asis` sul corpus della chat; il parametro `refresh` controlla la sincronizzazione delle fonti. Questo strumento non richiede la selezione dei grafi nella modale.

Prima di dichiarare pronto il dossier la suite verifica e aggiorna grafi e indici per gli snapshot selezionati, ricostruisce il grafo codice se manca e fissa insieme le versioni delle fonti e degli indici. Se un aggiornamento necessario fallisce, la generazione non parte. I formati non supportati sono dichiarati nella copertura, senza fingere un grafo completo.

L'orchestratore e i subagenti leggono soprattutto documenti e codice originali, anche integralmente quando utile e compatibile con il contesto disponibile. I grafi preparati restano ausili opzionali. Le attese delle deleghe restano a gruppi: non viene introdotto uno scambio continuo fra fratelli in esecuzione.

Lo strumento `prepare_asis` restituisce una cartella nuova. Le proposte dei figli sono relative a quella cartella; il genitore le verifica e integra li. La preparazione non e gia un AS-IS completato.

## Registrare il dossier prodotto

Dopo aver scritto e controllato i documenti, l'orchestratore puo chiamare `register_asis`. In alternativa usa `/asis-register` nella chat del dossier, oppure inserisci la cartella in **AS-IS consultabili** e premi **Verifica citazioni e registra AS-IS**.

La registrazione richiede AS-IS.md e citazioni valide delle fonti primarie fissate; raccoglie anche gli altri cinque documenti standard se presenti. Salva una copia versionata e indicizzata, conservando dipendenze e verifiche. Ripetere la registrazione degli stessi contenuti riutilizza la stessa versione. Lo stato semantico resta **non revisionato**: la registrazione non equivale ad approvazione umana.

Gli AS-IS registrati diventano consultabili insieme alle fonti pertinenti, con rimandi agli originali. Non vengono importati indiscriminatamente tutti i Markdown del progetto. Non considerare AS-IS e fonte da esso riassunta due conferme indipendenti.

Se cambiano i contenuti o la revisione delle fonti, il pannello indica **da rivalutare**. Una sincronizzazione senza variazioni dei contenuti indicizzati non basta a invalidare l'AS-IS. Le copie precedenti restano consultabili come storico, con la segnalazione esplicita. L'aggiornamento dei documenti parte soltanto su richiesta o tramite un'automazione configurata esternamente; questa versione non installa scheduler o rigenerazioni periodiche.

## Interpretazioni semantiche opzionali

Puoi chiedere al modello di proporre collegamenti fra requisiti, sezioni, simboli o dati. `propose_relation` salva nodi, relazione, motivazione e intervalli di evidenza validati, separatamente dal grafo strutturale. I tipi disponibili sono implements, supports, contradicts, depends_on, same_concept e describes.

Le proposte sono **unreviewed**. `knowledge_trace` le mostra separatamente soltanto con `includeInferred: true`. Nel pannello **Interpretazioni proposte** puoi accettare o rifiutare ogni interpretazione con una motivazione. Anche dopo la revisione resta classificata come inferenza del modello. I figli non dispongono di uno strumento di approvazione.

Non partono chiamate modello aggiuntive durante la sincronizzazione: l'arricchimento avviene solo come lavoro richiesto alla chat e usa i provider configurati.

## Persistenza e costi

La preparazione di una versione si sostiene una volta; gli artefatti rimangono su disco. Estrattori, ricerca e grafi strutturali consumano risorse locali. La generazione dell'AS-IS e le interpretazioni semantiche usano i modelli scelti e possono avere costi API. Durante la consultazione restano i normali costi del modello che legge le evidenze e risponde; non si ripaga la creazione degli artefatti.

In `data/sources/<fonte>/<snapshot>/` sono conservati manifest, originali, testo, mappe e indici. `indexes/<versione>/` mantiene le versioni fissate dai dossier. I dossier prodotti sono in `data/documentation/<id>/`. Il registro degli AS-IS è in `data/sources/asis-registry.json`; le interpretazioni sono separate in `data/knowledge/proposals/`. Nella copia sorgente `data` corrisponde a `suite-data`; nell'installazione a `%LOCALAPPDATA%/PiSuite/data`.

## Copertura e limiti

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
