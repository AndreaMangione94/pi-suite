# Modelli locali e BYOK — Pi Suite 0.6.5

Guida aggiornata alla distribuzione Windows del 27 ottobre 2026.

Pi Suite è software open source eseguito sul PC. Non richiede registrazione, account GitHub o abbonamento. Per l'inferenza locale occorre un server già predisposto, per esempio LM Studio o Ollama, con un modello capace di usare strumenti. Dopo aver installato dipendenze e pesi si può lavorare senza Internet. I servizi cloud sono opzionali e usano le credenziali e la fatturazione del provider scelto.

## Configurazione dal pannello

1. Apri **Connessioni e modelli** e aggiungi un server locale oppure un provider del catalogo.
2. Dai un nome alla connessione. Puoi aggiungerne più di una dello stesso tipo.
3. Per un endpoint personalizzato inserisci la **base URL**, il protocollo e l'autenticazione. Esempi: LM Studio `http://127.0.0.1:1234/v1`, Ollama `http://127.0.0.1:11434/v1`. Il server deve essere attivo; il pannello non scarica o carica i pesi.
4. Aggiungi una scheda per ogni modello e inserisci l'ID esatto del server, il nome leggibile, il contesto e l'output massimo. I limiti non aumentano il contesto realmente allocato sul server.
5. Indica strumenti, immagini, streaming e gli eventuali livelli di ragionamento supportati. Una dichiarazione non è una verifica.
6. Salva, poi premi **Verifica modello**. La prova usa testo sintetico, una chiamata a uno strumento innocuo e la risposta al relativo risultato. Non legge i tuoi progetti; un provider cloud può fatturare i token.
7. In **Orchestratore e subagenti** assegna connessione e modello all’Orchestratore e, per attivare la delega, anche ai Subagenti. Puoi scegliere un orchestratore più capace e figli meno costosi, oppure lo stesso modello con ragionamento inferiore: i due livelli sono indipendenti. Copia modello orchestratore conserva il livello dei figli se supportato, altrimenti lo imposta a off. Se il modello Subagenti è selezionato, ogni richiesta coinvolge sempre almeno un figlio operativo, poi il genitore verifica. Per la modalità singola premi Nessun subagente o lascia il profilo senza modello: serve solo l’Orchestratore. Un errore o il limite esaurito non disattivano la delega. Salva squadra e apri una nuova chat. Il costo complessivo comprende anche orchestrazione, verifica e correzioni: il risparmio non è garantito. Il limite iniziale è di 24 subagenti per apertura della chat, regolabile da 4 a 100; il parallelismo iniziale è 2, regolabile da 1 a 4. Non è un tetto di spesa e non include le richieste del genitore.

I modelli dichiarati privi di strumenti o streaming non sono assegnabili ai ruoli agentici di questa versione. Le verifiche riportano data e consumi disponibili; dopo una modifica della connessione o della credenziale risultano da ripetere. Una prova positiva non certifica qualità delle risposte o correttezza del coding. Un nuovo modello può essere configurato prima della verifica, così da consentire la migrazione e il collaudo progressivo.

**Apri chat Pi** funziona anche senza un profilo Orchestratore salvato: il launcher non passa un modello e lascia a Pi la normale gestione della selezione o dell’assenza di un modello. La configurazione dal pannello serve a fissare i modelli dei ruoli per le nuove chat.

## Importazione ed esportazione

Sono inclusi `models.config.example.json` e `models.config.example.yaml`: descrivono lo stesso collegamento locale, senza credenziali. Sostituisci `modello-locale` con l'ID effettivo del modello caricato sul server.

In **Configura un modello custom**, incolla il JSON/YAML nell'editor oppure carica un file: il contenuto viene aperto nello stesso editor. **Esempio custom endpoint** prepara un JSON modificabile; **Formatta JSON** controlla prima anche le chiavi duplicate. Scegli se importare le assegnazioni ai ruoli e premi **Anteprima importazione**. Controlla nomi, destinazioni e autenticazione; **Applica importazione** aggiunge o aggiorna le connessioni con lo stesso ID. Le altre connessioni vengono conservate. Modificare l'editor invalida l'anteprima. Se la configurazione salvata cambia, occorre ripeterla. Importare o aprire il pannello non avvia una generazione.

L'esportazione riguarda la configurazione **salvata**, comprende i profili e contiene soltanto riferimenti alle credenziali. Non contiene chiavi né blob DPAPI. Un altro PC deve configurare le proprie chiavi. L'export usa Pi Suite `schemaVersion: 1`. L'import accetta anche il sottoinsieme `customendpoint` descritto sotto; non è un importatore generale delle configurazioni VS Code o del `models.json` di Pi.

Il file `models.schema.json` descrive la struttura canonica per gli editor. Il backend verifica anche ID duplicati, riferimenti, coerenza dei limiti, protocolli, livelli reasoning e destinazioni. JSON con chiavi duplicate e YAML con tag, anchor, alias o documenti multipli vengono rifiutati. Non sono ammessi comandi o interpolazioni generiche nei valori. Dimensione massima: 700 KB.

## Editor custom endpoint e chiave protetta

Il file `models.custom.example.json` riprende il formato a gruppi con `name`, `vendor: "customendpoint"`, `apiKey: "${key}"`, `apiType`, `models` e un solo oggetto `settings`. Il campo corretto è `apiKey`; per i file preesistenti sono accettati anche `apikey` e `apykey`, uno solo per gruppo. Le chiavi reali nel file vengono rifiutate: `${key}` è soltanto un riferimento riconosciuto, senza esecuzione di codice.

Inserisci il valore reale nel campo **API key protetta**, separato dall'editor. Il valore viene inviato all'API locale autenticata soltanto quando applichi l'importazione, cifrato con DPAPI e tolto dal campo dopo il salvataggio. Non viene salvato nel browser, nel JSON dell'editor o negli export. Lasciarlo vuoto conserva l'eventuale chiave già associata; senza una chiave salvata il pannello segnala la credenziale mancante. Il campo vale per una sola connessione `secret` nell'import: per più connessioni configura le chiavi nelle singole schede. Senza `apiKey` nel gruppo, l'autenticazione è `none`.

Il sottoinsieme supportato converte:

- `apiType`: `chat-completions`, `responses`, `messages` nei corrispondenti protocolli Pi.
- `models[].id`, `name`, `url`: ID esatto, etichetta e URL base, oppure URL completo terminante nella route standard del protocollo. Tutti i modelli di un gruppo devono condividere base URL e protocollo; per destinazioni differenti usa gruppi distinti. Routing Azure, query, header e opzioni avanzate non sono rappresentabili e vengono rifiutati.
- `toolCalling`, `vision`, `thinking`, `supportsReasoningEffort`: capacità dichiarate, da verificare sul server. `none` viene convertito in `off`; lo streaming è richiesto da questo trasporto.
- `settings[ID].reasoningEffort`: ragionamento predefinito proposto quando selezioni quel modello per una nuova assegnazione. I profili già salvati mantengono il proprio valore. Il formato a gruppi non assegna automaticamente i ruoli.
- `contextWindow` e `maxOutputTokens`: limiti espliciti. Con `maxInputTokens`, se manca il contesto totale viene calcolato input + output. Senza limiti si usano i valori iniziali 32000/4096 della scheda manuale: non attestano la capacità del modello e vanno verificati prima dell'uso.

L'ID della connessione deriva dal nome del gruppo e resta stabile se riordini i modelli. Cambiare nome crea una nuova connessione; cambiare destinazione con una chiave già associata richiede un nuovo riferimento o la riassociazione dalla scheda. Campi sconosciuti, livelli incompatibili e `settings` duplicati danno errore senza applicare modifiche parziali. La sintassi JSON errata riporta riga e colonna.

## Autenticazione

- **none:** nessun segreto. Per il server locale non serve alcun account della suite.
- **secret:** riferimento come `byok/gateway-azienda`; il valore si inserisce nel pannello e viene cifrato con Windows DPAPI.
- **env:** nome esplicito di una variabile presente nel processo che avvia la suite, per esempio `MY_MODEL_API_KEY`. Il suo valore non viene esportato.

La configurazione JSON di una chiave protetta può usare `"auth": {"type":"secret","ref":"byok/gateway-azienda"}`. Per un header specifico sono supportati `header` (`Authorization`, `api-key`, `x-api-key`, `x-goog-api-key`) e `prefix` (vuoto oppure `Bearer `). Il valore della chiave si inserisce separatamente, mai nel file importabile.

Quando cambi destinazione o tipo di una connessione con una chiave già associata, rimuovi o reinserisci la chiave per riassociarla. Per importare un nuovo endpoint usa un nuovo riferimento segreto. Una credenziale mancante genera un errore; non viene scelto automaticamente un altro provider.

I protocolli disponibili sono `openai-completions`, `openai-responses`, `anthropic-messages` e `google-generative-ai`. Gli endpoint remoti richiedono HTTPS; HTTP è consentito sul loopback. Le richieste di inferenza rifiutano i redirect: configura la destinazione finale del servizio. OAuth/Entra ID, discovery, URL completi con routing Azure specifico, header multipli e opzioni avanzate non fanno parte di questo formato iniziale. Ulteriori connessioni dei provider nativi sono compilate tramite i metadati del catalogo Pi soltanto per i quattro protocolli supportati.

Le variabili necessarie vengono fornite al processo della sessione. Non costituiscono isolamento dai programmi avviati con gli stessi privilegi: codice fidato nel processo può leggerle. Non eseguire estensioni non fidate con credenziali attive.

## Dati, migrazione e sessioni

La cartella effettiva dei dati è mostrata nel pannello ed è configurabile con `PI_SUITE_HOME`. Nell’installazione standard è `%LOCALAPPDATA%/PiSuite/data`; nell’avvio diretto dai sorgenti è normalmente `suite-data` accanto all’applicazione. Le due posizioni non condividono automaticamente configurazione e chiavi.

| File | Contenuto |
|---|---|
| `models.config.json` | Fonte canonica versionata con connessioni, modelli e profili |
| `credentials.dpapi.json` | Segreti cifrati sul PC |
| `settings.json` | Impostazioni della suite e vista compatibile senza segreti |
| `settings.pre-byok.json` | Backup locale della vecchia configurazione durante la migrazione, con gli eventuali blob già cifrati |
| `model-checks.json` | Report per modello e impronta della configurazione verificata |
| `sessions/<id>/` | Configurazione Pi generata e fissata per una nuova chat |

Al primo avvio i provider e i profili precedenti vengono migrati automaticamente. Le chiavi già protette sono spostate come blob cifrati, senza essere scritte in chiaro. Non distribuire la cartella dati o il backup: usa sempre l'esportazione del pannello.

Aggiornamento e disinstallazione tramite `Gestisci-PiSuite.ps1` conservano la cartella dati, comprese le credenziali cifrate. Per i comandi vedi il [README](README-SUITE.md#aggiornare-o-disinstallare).

Le chat aperte e i loro subagenti conservano lo snapshot iniziale. Per usare una modifica apri una nuova chat. I file `models.json` generati non sono il punto da modificare manualmente. Non viene effettuato alcun fallback automatico tra provider.

## Collaudo

Le verifiche precedenti coprono import/export, migrazione, credenziali, snapshot, API del pannello e il ciclo strumenti dei quattro protocolli con SDK Pi e server simulati locali. Usa **Verifica modello** per controllare la compatibilità e le capacità reali del tuo endpoint.

Dopo aver aggiornato i sorgenti o l’installazione, riavvia il processo del pannello Pi Suite per caricare il nuovo backend; il solo ricaricamento del browser aggiorna soltanto l’interfaccia. Le chat già aperte conservano lo snapshot iniziale.
