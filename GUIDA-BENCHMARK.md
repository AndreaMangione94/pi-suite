# Benchmark e confronti · Pi Suite 0.6.6

Guida aggiornata alla distribuzione Windows del 29 ottobre 2026.

Il laboratorio è un registro locale per confrontare architetture scelte ed eseguite manualmente. Si apre dalla voce **Benchmark e confronti** del client. Le descrizioni delle architetture sono compilate dall’utente e servono solo a documentare le prove.

## Percorso più semplice

1. Apri **Nuova prova** e scegli un caso. **Scarica file per la chat** diventa subito disponibile: nome della prova, dettagli di A/B e salvataggio non sono prerequisiti. Per iniziare usa Estrazione JSON o Calcolo, contrassegnati come compatibili con Inspect.
2. Scarica il Markdown, allegalo a una nuova chat scelta da te e invia «Esegui la prova allegata». Lo stesso identico file serve per A e B: contiene compito, contesto e il contratto del report, senza risposte attese o criteri riservati. Il download dipende solo da caso e versione, anche prima di salvare una bozza.
3. Compila quando vuoi i dettagli liberi dell’**esecuzione A**: modello orchestratore, subagenti e ruoli, harness/versione, hosting, strumenti e memoria, parametri e note. Ogni campo è facoltativo: può restare vuoto o indicare “non noto”. **Salva bozza** conserva il lavoro; puoi anche premere **Carica risultati A**: il modulo salva la bozza e apre il caricamento.
4. Finito il lavoro in chat, carica il report JSON completo in **Carica risposta e metriche A**. Se la chat non crea file scaricabili, salva il messaggio con l’unico blocco `json` in un file `.md` o `.txt`. La sola risposta testuale o un JSON privo del report sono rifiutati: inserisci il contenuto nel campo `answer` del modello. I dettagli liberi restano compilabili nel form del risultato. Il report è associato alla prova e ad A al caricamento; il file scaricato prima del salvataggio rimane valido.
5. Per i due casi supportati, se Inspect è installato, il caricamento del report avvia automaticamente la valutazione e aggiorna l’anteprima. Attendi l’esito e premi **Salva scheda esecuzione** per conservarlo. Ripeti con **B**, usando lo stesso file del caso e caricando risposta e metriche nella sua scheda. Apri infine **Confronta due esecuzioni**: le schede di A e B restano consultabili autonomamente.

**Salva prova** fissa caso, versione e descrizioni inserite in quel momento. Una bozza può cambiare caso finché non contiene risultati; dal primo risultato il caso resta fissato anche se la prova è ancora in bozza. Le integrazioni successive creano schede con copie proprie dei dettagli: non riscrivono quelle già salvate. Le prove delle versioni precedenti continuano a essere consultabili con i loro snapshot originali.

Il modulo indica quanti dettagli sono stati compilati per A e B. Non occorre registrare un’architettura o sceglierla da un elenco. Il selettore nel caricamento serve solo a scegliere lo spazio **A oppure B** della prova; i dati descrittivi non configurano l’harness e non sono ricavati automaticamente da esso.

Il file allegato alla chat non può obbligare un prodotto a eseguire strumenti che non possiede. I casi di codice, strumenti, recupero e diagnostica richiedono la preparazione esterna descritta nella scheda del caso. I casi testuali semplici hanno già il contesto incluso. Le note comuni di protocollo inserite nel registro non modificano il file del caso: eventuali condizioni dell’ambiente vanno preparate manualmente.

Il report strutturato è obbligatorio per tutti i casi, per A e B e indipendentemente dal valutatore. Deve contenere `answer` come stringa, `notes` come stringa (anche vuota), `outcome` e `dimensions`. Quest’ultimo deve includere esplicitamente `tokens`, `performance` (durata) e `cost`, ciascuno con tutti i campi `status`, `value`, `origin`, `measure`, `unit`, `method`, `evidence` e `note`. La validazione avviene in entrambi i caricamenti e sul server al salvataggio; `dimensions: {}` non è accettato. Puoi anche compilare il modello nel form. I risultati storici restano consultabili.

Il modello testato deve includere **soltanto** `tokens`, `performance` e `cost` in `dimensions`, osservati o esplicitamente non disponibili: non compila giudizi di qualità e non autovaluta il successo. I controlli deterministici spettano al laboratorio; le altre dimensioni si completano nel percorso del valutatore separato.

`answer` mantiene esattamente il formato richiesto dal compito; il contenitore esterno resta sempre un report JSON. Il modello propone token, durata e costo come non disponibili: i campi sono obbligatori anche quando i valori non sono osservabili, usando `status: unavailable`, `value: null` e un motivo. Le misure effettive richiedono valore numerico, unità, metodo ed evidenza; token interi con unità `token`, durata in secondi con unità `s`, costo con valuta. Consumi e durata non possono essere negativi. Le altre dimensioni omesse restano non disponibili. Nei consumi va dichiarato se si include anche il confezionamento del report.

## Valutazione separata con un altro LLM

1. Salva il report del modello testato nella sua esecuzione A o B. Dove disponibile e installato, Inspect valuta automaticamente successo, correttezza e formato al caricamento.
2. Nella scheda premi **Completa con valutazione LLM**, oppure **Valutazione LLM** nell’elenco delle schede della prova.
3. Premi **Esporta prova per valutatore esterno**: scarichi un unico ZIP con una cartella contenente `01-prova.md`, `02-risposta.json` e `03-istruzioni-valutatore.md`. Estrai la cartella, allega i tre file a una nuova chat del modello giudice e invia il comando pronto contenuto nelle istruzioni. La risposta esportata conserva `answer` esattamente e include le misure disponibili e gli eventuali allegati. Le istruzioni separate contengono i criteri riservati e il modello JSON delle sole dimensioni ancora da completare. Non consegnarle al modello testato.
4. Il valutatore restituisce un JSON di tipo `pi-judge-v1`, con modello dichiarato, note, riferimenti alla scheda e hash SHA-256 della risposta. Compila tutte e sole le dimensioni richieste: valori motivati con evidenze oppure `unavailable` o `not_applicable`, con `value: null` e motivo specifico.
5. Carica il file in **Carica valutazione LLM**. L’anteprima verifica associazione, struttura, rubriche e assenza di sovrascritture; non salva ancora dati. Premi **Salva valutazione nella prova** per creare una nuova scheda collegata all’originale, con tutte le 16 dimensioni integrate e il JSON del giudice conservato ed esportabile.

La CTA di esportazione è presente nelle esecuzioni A/B, nella scheda e nel percorso del valutatore. Resta disabilitata se manca il test completo, la risposta salvata o i criteri necessari per le istruzioni, oppure se prova e risposta non corrispondono. Il motivo compare accanto al pulsante. Il server ricontrolla le risorse prima di generare lo ZIP e non esporta cartelle incomplete. I valori non osservabili delle metriche possono restare esplicitamente non disponibili.

Per i casi originali di calcolo ed estrazione le tre dimensioni deterministiche restano riservate al runner anche quando Inspect non è installato: il giudice riceve fino a dieci dimensioni. Negli altri casi può riceverne fino a tredici. Sono escluse anche le dimensioni già misurate o dichiarate non pertinenti. Token, durata e costo non vengono mai affidati al giudice, nemmeno se non disponibili: richiedono telemetria dell’esecuzione testata.

I nuovi giudizi hanno provenienza **Giudizio LLM esterno** (`model_judge`). Le istruzioni fissano misura, unità e metodo; il metodo salvato include il modello valutatore, così il confronto distingue valutatori diversi. Le quote usano scala 0–1 (1 migliore), il successo usa 0/1 e le allucinazioni un conteggio (0 migliore). Non si produce un punteggio complessivo.

Robustezza, affidabilità, strumenti, deleghe, riproducibilità e fedeltà dei token richiedono le rispettive evidenze: una risposta da sola non basta a misurarli. Il giudice non inventa tracce o consumi. Cambiare la risposta invalida i giudizi precedenti e i controlli del runner. L’importazione controlla il formato e l’associazione, mentre la fondatezza del giudizio resta da verificare.

## Risposta e misure dell’harness

La valutazione combina due tipi di evidenze:

| Evidenza caricata | Misure possibili |
|---|---|
| Risposta o artefatto | Correttezza, successo rispetto ai criteri, formato; con scorer o revisione adeguati anche attinenza, citazioni e allucinazioni |
| Export e tracce dell’harness | Tempi, token, costo, errori, tentativi, strumenti e deleghe effettivamente osservati |

Il client riceve entrambe tramite file forniti dall’utente. Non legge automaticamente configurazione, risposte o log dell’harness. La sola risposta non permette di ricostruire token, tempi o costo.

Entrambi i campi **Carica il file prodotto dalla chat** e **Carica risposta e metriche** accettano soltanto il report JSON completo, anche contenuto nell’unico blocco `json` di un messaggio Markdown e con BOM UTF-8. Estraggono il testo di `answer` senza riscriverlo e le misure di `dimensions`; l’anteprima mostra valori, unità, metodo, evidenza, provenienza e motivi dei dati non disponibili insieme alle altre dimensioni. I report incompleti sono rifiutati prima di modificare il form. Prima di salvare puoi controllare le dimensioni estratte; dopo il salvataggio compaiono nella scheda e nel confronto.

La chat deve riportare una misura solo se osservabile tramite un contatore, una traccia o un export dell’harness effettivamente consultato, indicando unità, metodo, evidenza e copertura nelle note. Altrimenti usa `status: unavailable`, `value: null` e ne spiega il motivo: nessuna stima. Se vede i soli token dell’orchestratore, può registrare **Token del solo orchestratore**, specificando che i subagenti sono esclusi e che il totale completo non è disponibile. Non può chiamarli token totali della prova. Per la durata servono inizio, fine e fonte del tempo osservato; per il costo servono valuta e importo osservato. Richiedere questi dati nel file non li rende accessibili: per ottenerli l’harness deve esporli alla chat o produrre un export consultabile.

Nel form puoi scaricare il **modello metriche harness** e caricare un JSON con `trialId`, `architectureId` e `dimensions`. Ogni dimensione specifica `status`, `value`, `measure`, `unit`, `method`, `evidence`, `note` e `origin`. Si tratta di un formato normalizzato: gli export nativi dei diversi harness vanno convertiti o compilati secondo il modello. Allegare un log grezzo lo conserva come evidenza, senza trasformarlo automaticamente in metriche.

L’importazione delle metriche integra le dimensioni fornite e conserva risposta e altre dimensioni. Usa **Aggiungi metriche o revisione** per integrare una scheda già salvata: nasce una nuova scheda collegata alla precedente. Per i token indica se il totale copre tutte le chiamate, ruoli, correzioni e tentativi; non sommare due volte cache o reasoning già inclusi nei contatori del provider. Il costo richiede valuta e metodo; una durata stimata dalla chat non equivale a una misurazione dell’harness.

Anche un report della chat completo che integra la stessa risposta conserva le dimensioni già valutate e non ripete il contenitore JSON dentro `answer`. Le tre metriche operative richiedono provenienza esplicita `chat_report` o `harness_export`; le altre dimensioni non sono ammesse nel report della chat testata e appartengono al percorso del valutatore. Il caricamento separato delle metriche dell’harness usa `harness_export` e può integrare solo alcune misure di una scheda completa. Valori non numerici, stati non validi o misure senza definizione, unità, metodo ed evidenza vengono rifiutati prima di modificare il form. Se un nuovo report sostituisce la risposta con un testo diverso, l’anteprima riparte dalle dimensioni del nuovo report, evitando di riutilizzare misure del precedente.

Se nella revisione cambi il testo della risposta, i punteggi di successo, correttezza e formato provenienti dal runner vengono resi non disponibili: occorre rivalutare il nuovo testo. L’integrazione di sole metriche mantiene i punteggi della risposta invariata.

Le provenienze visibili sono compilazione utente, report della chat, export dell’harness, runner, revisione umana e giudizio LLM esterno. La provenienza importata è una dichiarazione accompagnata da evidenze, non una certificazione indipendente del file.

L’icona **i** accanto allo stato di Inspect nel caricamento e nella scheda apre una spiegazione della copertura: passa il mouse, porta il focus con la tastiera oppure toccala. Il riquadro ricorda i due casi supportati e la valutazione esterna per gli altri undici.

## Installazione opzionale di Inspect AI

Il registro, i file per la chat e i confronti funzionano senza Inspect. Per attivare lo scoring locale, dalla cartella dell’app esegui:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Inspect.ps1
```

Su un’installazione standard la cartella è `%LOCALAPPDATA%\PiSuite\app`. Lo script è incluso anche nella cartella `pi-suite` estratta dallo ZIP. Lo script installa `inspect-ai==0.3.284` nell’ambiente separato `.venv-inspect`; riapri poi la pagina del laboratorio.

L’adattatore iniziale valuta **solo le versioni originali di `math-001` ed `extract-001`**, su tre dimensioni: successo, correttezza e formato. Se il formato impedisce di interpretare la risposta, la correttezza resta non disponibile e il fallimento di formato rimane esplicito. Gli altri undici casi sono disponibili per esecuzione manuale e caricamento dei risultati, ma richiedono scorer dedicati o revisione umana.

Inspect parte automaticamente quando carichi un report valido in uno dei due campi di caricamento, per i casi supportati e con il runner installato. Applica i controlli alla risposta importata e mostra successo, correttezza e formato nell’anteprima. Il caricamento non salva una scheda: **Salva scheda esecuzione** conserva risposta, metriche ed esito Inspect insieme. Durante la valutazione il salvataggio è sospeso; in caso di errore il report resta nel form e il motivo è visibile. Un nuovo file o una modifica alla risposta o all’esecuzione impediscono il riuso di una valutazione precedente. Per rivalutare una scheda, apri **Aggiungi metriche o revisione** e ricarica il file.

Il solver non invoca la generazione e non chiama il modello testato o un modello giudice. `mockllm/model` nei log Inspect è un segnaposto tecnico, mentre l’architettura dichiarata è nei metadati. I tempi e l’usage del runner non sono attribuiti all’architettura testata. Per i task aperti è disponibile la revisione umana.

La scheda valutata esportabile contiene anche i metadati del motore e il percorso del log `.eval`. Nel database la risposta originale è conservata. L’export completo della scheda serve per consultazione e backup. Per rivalutare nel form si ricarica il report originale della chat testata, con le sole metriche operative; il JSON del giudice usa il caricamento separato. Il successivo salvataggio di una revisione crea una nuova scheda collegata all’originale.

## Schede e confrontabilità

Ogni scheda contiene tutte le **16 dimensioni** disponibili nel registro. Per una misura servono numero, unità, definizione precisa, metodo ed evidenza. `not_applicable` significa non pertinente; `unavailable` significa non misurabile con i dati disponibili. Entrambi richiedono una motivazione, usano `value: null` e sono esclusi dalle differenze numeriche. Uno zero è ammesso solo come misura reale.

Il registro distribuito consente una misura rappresentativa per ciascuna dimensione, con dettagli aggiuntivi nelle note e negli allegati. La copertura «N / 16» conta i dati disponibili, non la qualità complessiva. Non viene prodotta una classifica unica.

La prova salvata conserva caso, contesto, criteri, condizioni dichiarate e descrizioni di A/B. Ogni scheda di risultato conserva una propria copia della descrizione effettivamente inserita. Per cambiare un caso dopo che è stato fissato si crea una nuova prova. Il confronto accetta una scheda di A e una di B appartenenti alla stessa prova; mostra una differenza B − A solo se misura, unità e metodo coincidono. Resta necessario controllare nelle evidenze le condizioni effettive.

Premi **Salva confronto** per registrare le due schede selezionate e le condizioni della prova in quel momento. Il confronto si riapre da **Confronti salvati** nella prova; resta collegato a quelle due schede anche se carichi nuove esecuzioni o completi successivamente una bozza. Le selezioni di un confronto salvato sono bloccate: per cambiare coppia prepara un nuovo confronto.

## Dati e limiti

I record sono salvati in `benchmarks.sqlite` nella cartella dati di Pi Suite. Le valutazioni Inspect sono in `benchmark-evaluations/`; il loro staging temporaneo usa `.inspect-work/` nella cartella dell’app per evitare percorsi dei log troppo lunghi su Windows. Per un backup conserva insieme database e cartella delle valutazioni. L’aggiornamento e la disinstallazione tramite `Gestisci-PiSuite.ps1` mantengono questi dati. Inspect resta opzionale: la normale installazione della suite non lo installa.

È possibile caricare al massimo 10 allegati per scheda, per 400 KB complessivi; il testo in `answer` ha un limite di 150.000 caratteri e il report JSON di 900 KB. Per ogni allegato sono conservati contenuto, dimensione e SHA-256. I file caricati non vengono eseguiti dal laboratorio.

Il catalogo comprende **13 esempi originali** e **8 fonti primarie metodologiche**: IFEval, GSM8K, SQuAD 2.0, EvalPlus, RULER, BFCL, AgentDojo e SWE-bench. La pagina **Fonti** espone link, uso e limiti; non sono redistribuiti dataset di terzi e i risultati locali non sono punteggi ufficiali dei benchmark pubblici.

EvalPlus è un riferimento metodologico, non un runner integrato. Una futura integrazione dovrà produrre lo stesso report obbligatorio, con `answer`, metriche operative esplicite ed evidenze, senza attribuire al modello testato i consumi o i tempi del valutatore.

## Perché Inspect

[Inspect permette solver personalizzati che caricano un output senza chiamare `generate`](https://inspect.aisi.org.uk/solvers.html) e [scorer separati con spiegazioni ed evidenze](https://inspect.aisi.org.uk/scoring.html). Il comando [`inspect score` rivaluta log Inspect esistenti](https://inspect.aisi.org.uk/scoring-workflow.html): il caricamento di risposte di chat esterne richiede l’adattatore implementato in `suite_inspect.py`.

Il flusso è quindi: **file di prova → chat scelta dall’utente → risposta e possibili export dell’harness → importazione → scoring Inspect o revisione → scheda autonoma → confronto**.
