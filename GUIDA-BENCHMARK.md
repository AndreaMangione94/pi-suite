# Benchmark e confronti · Pi Suite 0.6.5

Guida aggiornata alla distribuzione Windows del 27 ottobre 2026.

Il laboratorio è un registro locale per confrontare architetture scelte ed eseguite manualmente. Si apre dalla voce **Benchmark e confronti** del client. Le descrizioni delle architetture sono compilate dall’utente e servono solo a documentare le prove.

## Percorso più semplice

1. Apri **Nuova prova** e scegli un caso. **Scarica file per la chat** diventa subito disponibile: nome della prova, dettagli di A/B e salvataggio non sono prerequisiti. Per iniziare usa Estrazione JSON o Calcolo, contrassegnati come compatibili con Inspect.
2. Scarica il Markdown, allegalo a una nuova chat scelta da te e invia «Esegui la prova allegata». Lo stesso identico file serve per A e B: contiene compito, contesto e il contratto del report, senza risposte attese o criteri riservati. Il download dipende solo da caso e versione, anche prima di salvare una bozza.
3. Compila quando vuoi i dettagli liberi dell’**esecuzione A**: modello orchestratore, subagenti e ruoli, harness/versione, hosting, strumenti e memoria, parametri e note. Ogni campo è facoltativo: può restare vuoto o indicare “non noto”. **Salva bozza** conserva il lavoro; puoi anche premere **Carica risultati A**: il modulo salva la bozza e apre il caricamento.
4. Finito il lavoro in chat, carica il JSON prodotto in **Carica risposta e metriche A**. Se la chat non crea file scaricabili, salva il messaggio con l’unico blocco `json` in un file `.md` o `.txt`. Puoi anche caricare una risposta testuale semplice. I dettagli liberi restano compilabili nel form del risultato. Il report è associato alla prova e ad A al caricamento; il file scaricato prima del salvataggio rimane valido.
5. Ripeti con **B**, usando lo stesso file del caso e caricando risposta e metriche nella sua scheda. Per i due casi supportati premi **Salva e valuta con Inspect**. Apri infine **Confronta due esecuzioni**: le schede di A e B restano consultabili autonomamente.

**Salva prova** fissa caso, versione e descrizioni inserite in quel momento. Una bozza può cambiare caso finché non contiene risultati; dal primo risultato il caso resta fissato anche se la prova è ancora in bozza. Le integrazioni successive creano schede con copie proprie dei dettagli: non riscrivono quelle già salvate. Le prove delle versioni precedenti continuano a essere consultabili con i loro snapshot originali.

Il modulo indica quanti dettagli sono stati compilati per A e B. Non occorre registrare un’architettura o sceglierla da un elenco. Il selettore nel caricamento serve solo a scegliere lo spazio **A oppure B** della prova; i dati descrittivi non configurano l’harness e non sono ricavati automaticamente da esso.

Il file allegato alla chat non può obbligare un prodotto a eseguire strumenti che non possiede. I casi di codice, strumenti, recupero e diagnostica richiedono la preparazione esterna descritta nella scheda del caso. I casi testuali semplici hanno già il contesto incluso. Le note comuni di protocollo inserite nel registro non modificano il file del caso: eventuali condizioni dell’ambiente vanno preparate manualmente.

Alla chat basta restituire risposta e metadati del piccolo modello JSON allegato. Può lasciare `dimensions: {}`: il laboratorio completa tutte le dimensioni come non disponibili, poi Inspect o il valutatore misurano quelle pertinenti. Il protocollo di richiesta del file è comune alle architetture; nei consumi va dichiarato se si include anche il lavoro di confezionamento del report.

## Risposta e misure dell’harness

La valutazione combina due tipi di evidenze:

| Evidenza caricata | Misure possibili |
|---|---|
| Risposta o artefatto | Correttezza, successo rispetto ai criteri, formato; con scorer o revisione adeguati anche attinenza, citazioni e allucinazioni |
| Export e tracce dell’harness | Tempi, token, costo, errori, tentativi, strumenti e deleghe effettivamente osservati |

Il client riceve entrambe tramite file forniti dall’utente. Non legge automaticamente configurazione, risposte o log dell’harness. La sola risposta non permette di ricostruire token, tempi o costo.

Nel form puoi scaricare il **modello metriche harness** e caricare un JSON con `trialId`, `architectureId` e `dimensions`. Ogni dimensione specifica `status`, `value`, `measure`, `unit`, `method`, `evidence`, `note` e `origin`. Si tratta di un formato normalizzato: gli export nativi dei diversi harness vanno convertiti o compilati secondo il modello. Allegare un log grezzo lo conserva come evidenza, senza trasformarlo automaticamente in metriche.

L’importazione delle metriche integra le dimensioni fornite e conserva risposta e altre dimensioni. Usa **Aggiungi metriche o revisione** per integrare una scheda già salvata: nasce una nuova scheda collegata alla precedente. Per i token indica se il totale copre tutte le chiamate, ruoli, correzioni e tentativi; non sommare due volte cache o reasoning già inclusi nei contatori del provider. Il costo richiede valuta e metodo; una durata stimata dalla chat non equivale a una misurazione dell’harness.

Se nella revisione cambi il testo della risposta, i punteggi di successo, correttezza e formato provenienti dal runner vengono resi non disponibili: occorre rivalutare il nuovo testo. L’integrazione di sole metriche mantiene i punteggi della risposta invariata.

Le provenienze visibili sono compilazione utente, report della chat, export dell’harness, runner e revisione umana. La provenienza importata è una dichiarazione accompagnata da evidenze, non una certificazione indipendente del file.

## Installazione opzionale di Inspect AI

Il registro, i file per la chat e i confronti funzionano senza Inspect. Per attivare lo scoring locale, dalla cartella dell’app esegui:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Inspect.ps1
```

Su un’installazione standard la cartella è `%LOCALAPPDATA%\PiSuite\app`. Lo script è incluso anche nella cartella `pi-suite` estratta dallo ZIP. Lo script installa `inspect-ai==0.3.284` nell’ambiente separato `.venv-inspect`; riapri poi la pagina del laboratorio.

L’adattatore iniziale valuta **solo le versioni originali di `math-001` ed `extract-001`**, su tre dimensioni: successo, correttezza e formato. Se il formato impedisce di interpretare la risposta, la correttezza resta non disponibile e il fallimento di formato rimane esplicito. Gli altri undici casi sono disponibili per esecuzione manuale e caricamento dei risultati, ma richiedono scorer dedicati o revisione umana.

Inspect carica la risposta già salvata e applica controlli deterministici. Il solver non invoca la generazione e non chiama il modello testato o un modello giudice. `mockllm/model` nei log Inspect è un segnaposto tecnico, mentre l’architettura dichiarata è nei metadati. I tempi e l’usage del runner non sono attribuiti all’architettura testata. Per i task aperti è disponibile la revisione umana.

La scheda valutata esportabile contiene anche i metadati del motore e il percorso del log `.eval`. Nel database la risposta originale è conservata. Un JSON esportato dal laboratorio può essere ricaricato nel form della stessa prova; il ricaricamento resta un’importazione dell’utente, mentre una nuova verifica Inspect produce una nuova scheda del runner.

## Schede e confrontabilità

Ogni scheda contiene tutte le **16 dimensioni** disponibili nel registro. Per una misura servono numero, unità, definizione precisa, metodo ed evidenza. `not_applicable` significa non pertinente; `unavailable` significa non misurabile con i dati disponibili. Entrambi richiedono una motivazione, usano `value: null` e sono esclusi dalle differenze numeriche. Uno zero è ammesso solo come misura reale.

Il registro distribuito consente una misura rappresentativa per ciascuna dimensione, con dettagli aggiuntivi nelle note e negli allegati. La copertura «N / 16» conta i dati disponibili, non la qualità complessiva. Non viene prodotta una classifica unica.

La prova salvata conserva caso, contesto, criteri, condizioni dichiarate e descrizioni di A/B. Ogni scheda di risultato conserva una propria copia della descrizione effettivamente inserita. Per cambiare un caso dopo che è stato fissato si crea una nuova prova. Il confronto accetta una scheda di A e una di B appartenenti alla stessa prova; mostra una differenza B − A solo se misura, unità e metodo coincidono. Resta necessario controllare nelle evidenze le condizioni effettive.

Premi **Salva confronto** per registrare le due schede selezionate e le condizioni della prova in quel momento. Il confronto si riapre da **Confronti salvati** nella prova; resta collegato a quelle due schede anche se carichi nuove esecuzioni o completi successivamente una bozza. Le selezioni di un confronto salvato sono bloccate: per cambiare coppia prepara un nuovo confronto.

## Dati e limiti

I record sono salvati in `benchmarks.sqlite` nella cartella dati di Pi Suite. Le valutazioni Inspect sono in `benchmark-evaluations/`; il loro staging temporaneo usa `.inspect-work/` nella cartella dell’app per evitare percorsi dei log troppo lunghi su Windows. Per un backup conserva insieme database e cartella delle valutazioni. L’aggiornamento e la disinstallazione tramite `Gestisci-PiSuite.ps1` mantengono questi dati. Inspect resta opzionale: la normale installazione della suite non lo installa.

È possibile caricare al massimo 10 allegati per scheda, per 400 KB complessivi; il testo della risposta ha un limite di 150.000 caratteri e il caricamento del file di risposta semplice di 150 KB. Per ogni allegato sono conservati contenuto, dimensione e SHA-256. I file caricati non vengono eseguiti dal laboratorio.

Il catalogo comprende **13 esempi originali** e **8 fonti primarie metodologiche**: IFEval, GSM8K, SQuAD 2.0, EvalPlus, RULER, BFCL, AgentDojo e SWE-bench. La pagina **Fonti** espone link, uso e limiti; non sono redistribuiti dataset di terzi e i risultati locali non sono punteggi ufficiali dei benchmark pubblici.

## Perché Inspect

[Inspect permette solver personalizzati che caricano un output senza chiamare `generate`](https://inspect.aisi.org.uk/solvers.html) e [scorer separati con spiegazioni ed evidenze](https://inspect.aisi.org.uk/scoring.html). Il comando [`inspect score` rivaluta log Inspect esistenti](https://inspect.aisi.org.uk/scoring-workflow.html): il caricamento di risposte di chat esterne richiede l’adattatore implementato in `suite_inspect.py`.

Il flusso è quindi: **file di prova → chat scelta dall’utente → risposta e possibili export dell’harness → importazione → scoring Inspect o revisione → scheda autonoma → confronto**.
