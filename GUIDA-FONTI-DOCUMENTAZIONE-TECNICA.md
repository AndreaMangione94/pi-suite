# Fonti del progetto, SharePoint e Azure — Pi Suite 0.6.5

Guida aggiornata alla distribuzione Windows del 1 novembre 2026.

Vedi anche [Conoscenza e grafi](GUIDA-CONOSCENZA-E-GRAFI.md) per ricerca opzionale, lettura completa, registrazione documentazione tecnica e relazioni semantiche revisionabili.

## Progetto, grafi e documentazione tecnica

L’icona **Progetto** apre un menu per scegliere un progetto salvato, crearne uno nuovo o tornare al contesto pulito. Le icone **Grafi** e **Documentazione tecnica** si trovano nella stessa sezione. Il menu Grafi mostra gli artefatti con icona e label: fai clic per includerli o escluderli dal contesto e usa la × per rimuoverli dalla raccolta. Se non sono presenti grafi, l’unica azione è **Genera grafo**: analizza la cartella del progetto, anche senza Git, per codice Python, JavaScript o TypeScript supportato da Graphify.

Nel menu Documentazione tecnica seleziona i documenti già prodotti da rendere consultabili. **Aggiungi** collega una cartella locale o di rete, SharePoint tramite Microsoft Graph, Azure DevOps o un repository Git HTTPS. Le fonti aggiunte vengono acquisite alla prima generazione; non occorre costruire prima un grafo.

**Genera documentazione tecnica** è abilitato solo dopo aver selezionato almeno una fonte tramite **documentazione tecnica → Aggiungi**; il progetto e i grafi da soli non lo abilitano. Apre il form per nome, obiettivo e aggiornamento delle fonti. Il progetto è sempre incluso e viene acquisito dal filesystem corrente. Gli eventuali grafi selezionati e i documenti di documentazione tecnica selezionati accompagnano il contesto della richiesta. Le scelte si salvano automaticamente.

L’orchestratore produce un **DOCUMENTAZIONE-TECNICA.md tecnico-funzionale dettagliato e autosufficiente**, centrato sull'utilizzo dell'applicazione e sui flussi delle sue funzionalità, con gli approfondimenti tecnici e architetturali pertinenti. La preparazione di INCARICO-DOCUMENTAZIONE-TECNICA.md e FONTI.json è solo l’avvio della generazione.

Solo per questo flusso AS-IS, prima della stesura salva **PIANO-DOCUMENTAZIONE.md** con ID, confini, dipendenze e stato di ogni micro modulo o funzionalità. Assegna un task separato per ciascuna unità terminale, in batch successivi entro i limiti configurati. Ogni figlio descrive soltanto l'unità assegnata e lascia riferimenti alle altre; segnala nuove funzionalità e lacune al genitore. L'orchestratore controlla e integra le consegne, risolve i riferimenti e aggiorna il piano, creando altri task mirati quando servono. Se manca il profilo Subagenti, prepara il piano e segnala la configurazione necessaria; se termina il budget di chiamate, conserva i task pendenti e indica che il dossier è parziale. Le altre attività della chat mantengono la normale modalità di delega.

Dopo la revisione, `register_documentation` verifica le citazioni e genera con il modello il **grafo semantico del Markdown finale**. Il grafo viene aggiunto alla raccolta Grafi e preselezionato; il documento diventa consultabile nel menu Documentazione tecnica. Un errore nella generazione semantica viene segnalato e non pubblica un grafo incompleto. La registrazione non attesta approvazione umana.

## Consultazione e aggiornamento

**Apri chat Pi** conserva le selezioni in un contesto della sessione, disponibile anche ai subagenti. `graph-explorer` viene caricata soltanto quando almeno un grafo è selezionato; `lettura-documentazione-tecnica` soltanto quando ci sono documenti di documentazione tecnica selezionati. `read_documentation` permette ricerca deterministica, righe numerate e paginazione; i grafi semantici si consultano con `document_graph`, quelli del codice con `graph_query` e `connected_graph`.

Alla fine di una richiesta, dopo l’integrazione delle modifiche da parte dell’orchestratore o del modello singolo, la suite confronta i contenuti con l’inizio della richiesta e rigenera i grafi già presenti quando necessario. Aggiorna anche i riferimenti della chat mantenendo gli stessi identificativi e le selezioni esplicite. Una semplice consultazione senza modifiche non rigenera i grafi.

## Comando nella chat

```text
/documentazione-tecnica
/documentazione-tecnica Ricostruisci il ciclo ordine confrontando documenti, backend, frontend e database
```

Il comando avvia un nuovo dossier nella chat corrente. Riusa le fonti del dossier attivo oppure il progetto e le fonti scelte nel pannello. Non richiede un grafo preesistente. Anche `prepare_documentation` usa il progetto selezionato. La generazione richiede un modello disponibile e può comportare costi API; le fonti lette vengono inviate ai provider configurati.

I dossier conservano progetto e nome in `PROGETTO.json`, corpus in `FONTI.json` e artefatti selezionati in `CONTESTO.json`. `FINALIZZATO.json` identifica il Markdown che ha completato anche la generazione del grafo. I documenti rimangono in `data/documentation/<id>/`; la consultazione è limitata a file di 5 MB.

## Compatibilità dei dati salvati

La rinomina aggiorna automaticamente preferenze, selezioni, nomi dei file del dossier e skill abilitate. Il documento principale è `DOCUMENTAZIONE-TECNICA.md`; i comandi sono `/documentazione-tecnica` e `/documentazione-tecnica-register`, con le skill `documentazione-tecnica` e `lettura-documentazione-tecnica`.

Gli snapshot delle evidenze e i grafi versionati conservano contenuti e hash originali, così le citazioni storiche restano verificabili. `documentation-compat.json` contiene soltanto le corrispondenze usate per leggere e migrare i dati delle versioni precedenti.

## SharePoint: cartella sincronizzata

Scegli **SharePoint · cartella sincronizzata sul PC** e indica il percorso locale della cartella collegata tramite OneDrive. Facoltativamente inserisci il link SharePoint come riferimento di provenienza. La suite usa i file accessibili al tuo account Windows; OneDrive può scaricare i file disponibili solo online mentre vengono letti. Se la cartella non è già sincronizzata, preparala tramite OneDrive/SharePoint prima di collegarla.

Questo percorso non richiede una nuova applicazione Entra. La data registrata è quella del file locale; non è un numero di versione SharePoint né prova che OneDrive abbia già ricevuto tutte le modifiche remote.

## SharePoint: Microsoft Graph

Scegli **SharePoint · Microsoft Graph** e compila:

- Drive ID della raccolta documenti.
- Folder Item ID della cartella, anche `root` per la radice del drive.
- Access token Microsoft Graph valido per leggere quella cartella.

Il token viene cifrato con Windows DPAPI e non viene passato agli agenti. La suite legge ricorsivamente la cartella e gestisce le pagine di risultati. Registra webUrl, eTag e lastModifiedDateTime quando restituiti da Graph. Scarica i contenuti tramite gli URL temporanei restituiti da Microsoft senza inoltrare loro il bearer token Graph.

Il token deve avere le autorizzazioni necessarie sulla risorsa; la documentazione Microsoft indica Files.Read come permesso delegato minimo per le API di lettura, con possibili requisiti ulteriori secondo il tenant e il tipo di accesso. Non incollare password Microsoft o client secret nel campo access token. Questa versione non esegue login OAuth interattivo, consenso amministratore o refresh automatico: quando il token scade, usa Modifica collegamento e salvalo nuovamente. Sono supportati gli endpoint del cloud Microsoft pubblico, non i cloud nazionali.

Riferimenti: [elenco cartella](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0), [download dei contenuti](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0).

## Repository Azure DevOps locale

Scegli **Azure · repository Git locale**, indica la cartella di un clone esistente e il branch locale da acquisire. La suite legge gli oggetti del commit di quel branch. Non importa modifiche non registrate nel checkout e non esegue automaticamente pull sul clone locale: aggiornalo se serve prima di sincronizzare.

La provenienza include il commit esatto. Il contenuto di quel commit descrive l’implementazione analizzata, non prova cosa sia stato effettivamente rilasciato in produzione.

## Repository Azure DevOps remoto

Scegli **Azure DevOps · URL repository**, indica il normale URL HTTPS senza utente/password, per esempio:

```text
https://dev.azure.com/organizzazione/progetto/_git/repository
```

Indica il branch (per esempio main). Puoi fornire un PAT con **Code: Read**, salvato con DPAPI, oppure lasciare vuoto per usare credenziali Git già disponibili. La sincronizzazione non avvia un login interattivo: in assenza di credenziali valide restituisce un errore. Il PAT viene passato a Git tramite ambiente, non inserito nell’URL o negli argomenti del processo e non fornito ai modelli.

La suite conserva un mirror locale, esegue fetch del branch e legge il commit ricevuto. Non fa push, non modifica branch remoti e non esegue build o script del repository. I limiti di file si applicano ai contenuti estratti; il trasferimento Git può essere più grande e ha un timeout. Repository enormi possono richiedere un clone locale già preparato. I puntatori Git LFS non vengono espansi e i submodule non vengono scaricati.

## Formati e copertura

- Testo/codice UTF-8: Markdown, TXT, RST, JSON, YAML, XML, HTML, CSV e i linguaggi elencati nel modulo suite_sources.py.
- DOCX: testo del documento principale, incluse le celle nel corpo. Non analizza immagini, macro, revisioni Word, allegati, intestazioni o note esterne al documento principale.
- PDF: testo estraibile fino a 200 pagine; niente OCR. Un PDF senza testo è registrato fra gli esclusi.
- Massimo 1000 file esaminati, 5 MB per file, 100 MB acquisiti per fonte. Testo estratto limitato a 5.000.000 caratteri per documento, con segnalazione di troncamento. Directory di dipendenze/build e link simbolici sono esclusi. File non supportati risultano nel manifest.

Il codice Python, JavaScript e TypeScript acquisito genera anche un grafo Graphify nello snapshot. Il modello consulta prima il grafo documentale finale con **document_graph**, poi il grafo del codice con **connected_graph**; gli ID dei documenti permettono di tornare alla fonte. È un grafo AST per file e non risolve tutte le dipendenze semantiche o tutte le chiamate fra repository.

Il genitore può delegare la lettura con `evidenceScope`: assegna domande, fonti/documenti iniziali e limiti, mentre il figlio sceglie full/section/passage e gestisce nextOffset. `report_evidence_reading` restituisce citazioni e lacune; la copertura viene registrata dagli strumenti e torna al genitore in `evidenceReading`. Le versioni restano quelle fissate nel dossier.

## Consegne del dossier

L’incarico iniziale chiede DOCUMENTAZIONE-TECNICA.md, ARCHITETTURA.md, FLUSSI-E-INTERFACCE.md, OPERATIVITA.md, LACUNE-E-DOMANDE.md e MATRICE-FONTI.md. Puoi adattarle in chat. La skill documentazione-tecnica è inclusa e abilitata.

Le affermazioni sostanziali devono riportare citazioni `[sourceId:documentId]`, percorso e righe/simboli pertinenti. La matrice collega sezioni, evidenze, hash, data e commit. Contraddizioni fra specifiche e codice restano esplicite. Informazioni non provate, ambiente di produzione e proposte future non devono essere presentati come stato attuale verificato.

Le fonti collegate restano in lettura; eventuali pubblicazioni su SharePoint, commit/push o modifiche ai repository non fanno parte di questo flusso. I file finali sono nella cartella locale del dossier.

## Dati e aggiornamenti

I collegamenti sono in `data/sources/connections.json`, i segreti sono cifrati. Ogni sincronizzazione crea un nuovo snapshot con manifest, testi estratti e, quando presente, grafo. Il puntatore corrente cambia solo dopo un’acquisizione completata. Un fallimento lascia disponibile l’ultimo snapshot riuscito.

Il dossier conserva in `GRAFO-DOCUMENTALE.json` la versione del grafo semantico e in FONTI.json gli snapshot e gli indici selezionati: sincronizzare nuovamente una fonte non cambia le evidenze di un dossier già creato. Per analizzare lo stato aggiornato crea un nuovo dossier. Gli snapshot precedenti restano su disco; non c’è ancora una politica di pulizia automatica.

Nella copia sorgente, `data` corrisponde a `suite-data`; nell’installazione standard è `%LOCALAPPDATA%/PiSuite/data`. Le chiavi DPAPI vanno reinserite se cambi PC/account.

## Esempio

Collega “Specifiche ERP” da SharePoint e “Backend ERP” da Azure. Seleziona e sincronizza entrambe le fonti, salva i riferimenti e seleziona i loro grafi in **Grafi di riferimento**. Inserisci:

> Ricostruisci lo stato attuale del ciclo ordine, da creazione a fatturazione. Confronta specifiche e implementazione; documenta componenti, dati, API, errori e procedure operative. Cita le evidenze e prepara un elenco delle divergenze da chiarire con i responsabili.

La suite prepara il dossier; l’orchestratore può assegnare a un figlio l’analisi documentale, a un altro il codice del ciclo ordine e successivamente confrontare le evidenze. La suddivisione resta una scelta dell’orchestratore, senza ruoli obbligatori; se è selezionato un modello Subagenti, almeno un figlio svolge sempre il lavoro operativo. Con il solo Orchestratore, questo svolge direttamente il lavoro.

## Stato del collaudo

Sono verificati localmente estrazione DOCX/PDF, snapshot fissati, commit Git, credenziali non restituite alla UI, paginazione Graph simulata, download senza inoltro del bearer token e lettura delle evidenze dai figli. Per la connessione effettiva servono i tuoi percorsi/URL e credenziali: nessun tenant SharePoint o Azure reale è stato usato nel collaudo.
