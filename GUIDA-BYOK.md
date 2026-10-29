# Modelli locali e BYOK — Pi Suite 0.6.5

Guida aggiornata alla distribuzione Windows del 27 ottobre 2026.

Pi Suite è software open source eseguito sul PC. Non richiede registrazione, account GitHub o abbonamento. Per l'inferenza locale occorre un server già predisposto, per esempio LM Studio o Ollama, con un modello capace di usare strumenti. Dopo aver installato dipendenze e pesi si può lavorare senza Internet. I servizi cloud sono opzionali e usano le credenziali e la fatturazione del provider scelto.

## Configurazione dal pannello

1. Apri **Connessioni e modelli**. In alto scegli **Nuova configurazione** oppure una configurazione salvata: la selezione carica il relativo JSON o i campi del provider, senza mostrare la chiave.
2. Scegli **Provider con API key** oppure **Endpoint custom**. Viene mostrato un solo modulo alla volta. Cambiare tipo prepara una nuova configurazione, senza modificare quella salvata.
3. Per un provider scegli il fornitore dal catalogo, il nome della configurazione e la chiave. Per un endpoint custom incolla il JSON di una sola connessione e inserisci la chiave nel campo separato, se richiesta. Esempi di base URL locale: LM Studio `http://127.0.0.1:1234/v1`, Ollama `http://127.0.0.1:11434/v1`. Il server deve essere attivo; il pannello non scarica o carica i pesi.
4. Premi **Aggiungi configurazione** oppure **Salva configurazione**. Controllo del JSON, validazione del runtime e salvataggio avvengono con un solo comando; non serve un'anteprima. Gli errori compaiono accanto al modulo, senza modifiche parziali. Lascia vuota la chiave per conservare quella gia salvata.
5. In **Orchestratore e subagenti** scegli la connessione e il modello, quindi **Verifica** per provare gli strumenti. La prova usa testo sintetico e puo consumare token. Salva squadra e apri una nuova chat per usare le modifiche.

Orchestratore e Subagenti hanno modelli e livelli di ragionamento indipendenti. Se il modello Subagenti e selezionato, ogni richiesta coinvolge sempre almeno un figlio operativo, poi il genitore verifica. Per la modalita singola lascia i Subagenti senza modello. Il limite iniziale e di 24 subagenti per chat, regolabile da 4 a 100, con parallelismo iniziale 2, regolabile da 1 a 4. Non e un tetto di spesa: il costo complessivo comprende anche orchestrazione, verifica e correzioni.

I modelli dichiarati privi di strumenti o streaming non sono assegnabili ai ruoli agentici di questa versione. Le verifiche riportano data e consumi disponibili; dopo una modifica della connessione o della credenziale risultano da ripetere. Una prova positiva non certifica qualità delle risposte o correttezza del coding. Un nuovo modello può essere configurato prima della verifica, così da consentire la migrazione e il collaudo progressivo.

**Apri chat Pi** funziona anche senza un profilo Orchestratore salvato: il launcher non passa un modello e lascia a Pi la normale gestione della selezione o dell’assenza di un modello. La configurazione dal pannello serve a fissare i modelli dei ruoli per le nuove chat.

## Configurazione JSON

Sono inclusi `models.config.example.json` e `models.config.example.yaml`: descrivono lo stesso collegamento locale, senza credenziali. Sostituisci `modello-locale` con l'ID effettivo del modello caricato sul server.

L'editor **Endpoint custom** accetta JSON Pi Suite `schemaVersion: 1` oppure un array con un solo gruppo `customendpoint`. Non importa il file completo delle configurazioni di VS Code: gruppi con altri vendor vengono rifiutati, senza importazioni parziali. Ogni configurazione corrisponde a una connessione, che puo contenere piu modelli. Le altre connessioni e le assegnazioni ai ruoli vengono conservate; i profili dei ruoli si impostano nella pagina della squadra. Il salvataggio non avvia una generazione.

Selezionare una connessione custom salvata popola l'editor con il suo JSON canonico, copiabile e modificabile. Il JSON contiene soltanto riferimenti alle credenziali, mai chiavi o blob DPAPI. Su un altro PC occorre inserire le proprie chiavi. Il formato non e un importatore generale delle configurazioni VS Code o del `models.json` di Pi.

Il file `models.schema.json` descrive la struttura canonica per gli editor. Il backend verifica anche ID duplicati, riferimenti, coerenza dei limiti, protocolli, livelli reasoning e destinazioni. JSON con chiavi duplicate viene rifiutato, senza formattazioni automatiche che possano scartarle. Non sono ammessi comandi o interpolazioni generiche nei valori. Dimensione massima: 700 KB. Le API preesistenti di importazione ed esportazione restano disponibili per gli strumenti esterni, ma non hanno pulsanti nella pagina.

## Editor custom endpoint e chiave protetta

Il file `models.custom.example.json` riprende il formato a gruppi con `name`, `vendor: "customendpoint"`, `apiKey: "${key}"`, `apiType`, `models` e un solo oggetto `settings`. Il campo corretto è `apiKey`; per i file preesistenti sono accettati anche `apikey` e `apykey`, uno solo per gruppo. Le chiavi reali nel file vengono rifiutate: `${key}` è soltanto un riferimento riconosciuto, senza esecuzione di codice.

Il convertitore genera `auth.type: "secret"` e un `auth.ref` nella forma `byok/<id-connessione>`. Il valore effettivo viene salvato cifrato in `credentials.dpapi.json` nella cartella dati della suite, normalmente `%LOCALAPPDATA%/PiSuite/data` nell'installazione standard. Il riferimento non contiene la chiave e non indica un file da leggere. Per il runtime Pi la Suite genera `apiKey: "${PI_SUITE_KEY_<ID_NORMALIZZATO>}"` e fornisce la relativa variabile d'ambiente al processo della sessione: Pi risolve la credenziale senza averla in chiaro nel JSON. I riferimenti segreti di VS Code e le altre interpolazioni nel formato a gruppi sono rifiutati. Dopo il salvataggio, una credenziale assente viene segnalata nel modulo.

Inserisci il valore reale nel campo **API key**, separato dall'editor. Il valore viene inviato all'API locale autenticata soltanto quando salvi, cifrato con DPAPI e tolto dal campo dopo il salvataggio o al cambio della selezione. Non viene salvato nel browser, nel JSON dell'editor o negli export. Lasciarlo vuoto conserva l'eventuale chiave gia associata. Senza `apiKey` nel gruppo e senza una chiave nel campo, l'autenticazione e `none`; inserire una chiave nel campo protetto attiva l'autenticazione `secret` anche per quel caso.

Il sottoinsieme supportato converte:

- `apiType`: `chat-completions`, `responses`, `messages` nei corrispondenti protocolli Pi.
- `reasoningEffortFormat`: accettato se coincide con l'`apiType` effettivo del modello. Il formato della richiesta e determinato dal protocollo Pi corrispondente; valori incompatibili danno errore.
- `models[].id`, `name`, `url`: ID esatto, etichetta e URL base, oppure URL completo terminante nella route standard del protocollo. Tutti i modelli di un gruppo devono condividere base URL e protocollo; per destinazioni differenti usa gruppi distinti. Routing Azure, query, header e opzioni avanzate non sono rappresentabili e vengono rifiutati.
- `toolCalling`, `vision`, `thinking`, `supportsReasoningEffort`: capacità dichiarate, da verificare sul server. `none` viene convertito in `off`; per gli endpoint chat-completions i livelli sono mappati esplicitamente nel runtime, cosi `xhigh` non viene ridotto a `high` e `off` viene inviato come `none` quando dichiarato. Questo conserva il valore richiesto, non certifica il supporto effettivo o una maggiore qualita: un server puo rifiutarlo o ignorarlo; se lo applica puo cambiare tempi e consumo di token. Lo streaming è richiesto da questo trasporto.
- `settings[ID].reasoningEffort`: ragionamento predefinito proposto quando selezioni quel modello per una nuova assegnazione. I profili già salvati mantengono il proprio valore. Il formato a gruppi non assegna automaticamente i ruoli.
- `contextWindow` e `maxOutputTokens`: limiti espliciti. Con `maxInputTokens`, se manca il contesto totale viene calcolato input + output. Senza limiti si usano i valori iniziali 32000/4096 della scheda manuale: non attestano la capacità del modello e vanno verificati prima dell'uso.

Per una nuova connessione l'ID deriva dal nome del gruppo. Quando selezioni una configurazione salvata, l'ID e il riferimento alla chiave sono conservati anche se cambi il nome: non viene creata una copia. Cambiare destinazione con una chiave gia associata richiede di reinserirla per autorizzare la riassociazione. Campi sconosciuti, livelli incompatibili e `settings` duplicati danno errore senza applicare modifiche parziali. La sintassi JSON errata riporta riga e colonna.

### Errori di configurazione

Il comando di salvataggio si abilita quando il modulo e compilato e rimane disabilitato durante il salvataggio per evitare richieste doppie. Non ci sono anteprime o conferme intermedie. Se il JSON non e valido, il messaggio locale ne indica il motivo e il contenuto resta modificabile. Il modello compare nei selettori dei ruoli dopo il salvataggio riuscito, selezionando prima la sua connessione.

Per adattare un gruppo customendpoint proveniente da VS Code:

- Conserva un solo oggetto `settings` per gruppo e scegli esplicitamente il livello di ragionamento desiderato.
- Sostituisci il riferimento segreto con `${key}` e inserisci la chiave nel campo protetto separato della Suite; in alternativa usa `auth.type: "env"` nel formato canonico.
- Puoi mantenere `reasoningEffortFormat` se coincide con `apiType`.
- Includi solo il gruppo `customendpoint`, senza altri vendor. I provider nativi si configurano separatamente dal catalogo disponibile, con proprie credenziali.
- HTTP e consentito sul loopback e su IP privati espliciti RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) o IPv6 ULA (`fc00::/7`). Il salvataggio segnala che richieste e chiave API viaggiano in chiaro: usa soltanto una rete fidata, preferibilmente un gateway HTTPS o un tunnel cifrato autorizzato. Gli host non loopback indicati per nome e gli IP pubblici richiedono HTTPS. Gli indirizzi link-local, non specificati e multicast restano vietati. Non basta cambiare `http` in `https`: il servizio deve esporre realmente TLS con un certificato attendibile.

## Autenticazione

- **none:** nessun segreto. Per il server locale non serve alcun account della suite.
- **secret:** riferimento come `byok/gateway-azienda`; il valore si inserisce nel pannello e viene cifrato con Windows DPAPI.
- **env:** nome esplicito di una variabile presente nel processo che avvia la suite, per esempio `MY_MODEL_API_KEY`. Il suo valore non viene esportato.

La configurazione JSON di una chiave protetta può usare `"auth": {"type":"secret","ref":"byok/gateway-azienda"}`. Per un header specifico sono supportati `header` (`Authorization`, `api-key`, `x-api-key`, `x-goog-api-key`) e `prefix` (vuoto oppure `Bearer `). Il valore della chiave si inserisce separatamente, mai nel file importabile.

Quando cambi destinazione o tipo di una connessione con una chiave già associata, rimuovi o reinserisci la chiave per riassociarla. Per importare un nuovo endpoint usa un nuovo riferimento segreto. Una credenziale mancante genera un errore; non viene scelto automaticamente un altro provider.

I protocolli disponibili sono `openai-completions`, `openai-responses`, `anthropic-messages` e `google-generative-ai`. HTTPS e obbligatorio per gli endpoint pubblici; HTTP e consentito soltanto sul loopback e sugli IP privati espliciti descritti sopra. Le richieste di inferenza rifiutano i redirect: configura la destinazione finale del servizio. OAuth/Entra ID, discovery, URL completi con routing Azure specifico, header multipli e opzioni avanzate non fanno parte di questo formato iniziale. Ulteriori connessioni dei provider nativi sono compilate tramite i metadati del catalogo Pi soltanto per i quattro protocolli supportati.

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

Al primo avvio i provider e i profili precedenti vengono migrati automaticamente. Le chiavi gia protette sono spostate come blob cifrati, senza essere scritte in chiaro. Non distribuire la cartella dati o il backup: copia soltanto il JSON senza segreti dall'editor o usa l'API di esportazione.

L'aggiornamento dal repository tramite `Install.cmd`, dopo `git pull`, riconosce la copia installata e conserva la cartella dati, comprese le credenziali cifrate. Per la distribuzione ZIP separata, aggiornamento e disinstallazione usano `Gestisci-PiSuite.ps1`. Per i comandi vedi il [README](README-SUITE.md#aggiornare-o-disinstallare).

Le chat aperte e i loro subagenti conservano lo snapshot iniziale. Per usare una modifica apri una nuova chat. I file `models.json` generati non sono il punto da modificare manualmente. Non viene effettuato alcun fallback automatico tra provider.

## Collaudo

Le verifiche coprono il salvataggio unico, la modifica senza duplicati, la conservazione delle credenziali, le modalita esclusive del modulo, import/export API, migrazione e snapshot. Usa **Verifica** nella pagina dei ruoli per controllare la compatibilita e le capacita reali del tuo endpoint.

Dopo aver aggiornato i sorgenti o l’installazione, riavvia il processo del pannello Pi Suite per caricare il nuovo backend; il solo ricaricamento del browser aggiorna soltanto l’interfaccia. Le chat già aperte conservano lo snapshot iniziale.
