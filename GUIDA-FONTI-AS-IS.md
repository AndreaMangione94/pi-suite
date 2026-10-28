# Fonti del progetto, SharePoint e Azure — Pi Suite 0.6.5

Guida aggiornata alla distribuzione Windows del 28 ottobre 2026.

Vedi anche [Conoscenza e grafi](GUIDA-CONOSCENZA-E-GRAFI.md) per ricerca opzionale, lettura completa, registrazione AS-IS e relazioni semantiche revisionabili.

Prima di ogni preparazione AS-IS la suite verifica e aggiorna i grafi e gli indici degli snapshot scelti, riusando le estrazioni valide. Un errore impedisce l’avvio dei modelli; una consultazione normale non aggiorna nulla.

## Avvio con un comando o un pulsante

Dopo aver configurato una volta le connessioni e i modelli, puoi automatizzare i preparativi e avviare il lavoro in chat:

```text
/asis
/asis Ricostruisci il ciclo ordine confrontando SharePoint, backend, frontend e database
```

Il comando aggiorna le fonti, crea un nuovo dossier e invia l’incarico all’orchestratore nella chat Pi corrente, senza aprire una seconda finestra. Se la chat ha già un dossier attivo, ne conserva la selezione delle fonti. In un progetto registrato, anche da una sua sottocartella, usa invece le fonti salvate in **Grafi di conoscenza** e, se non scrivi un nuovo obiettivo, riusa quello salvato. Se non ci sono fonti salvate, chiede di selezionarle nel pannello. Per produrre un grafo documentale semantico occorre un progetto registrato a cui associare le fonti. Il contesto del dossier viene salvato nella sessione Pi e usato anche dai successivi subagenti. `/asis --help` mostra queste regole senza avviare nulla. Per scegliere un sottoinsieme diverso usa il pannello.

Dal browser apri **As-is** e seleziona almeno un grafo nella sezione **Grafi di riferimento**. Sono disponibili il grafo documentale semantico finale del progetto e il grafo del codice. Gli indici espliciti delle fonti non sostituiscono il grafo semantico. Senza grafi selezionabili i pulsanti di creazione restano disabilitati: usa **Grafi di conoscenza** per creare quello del progetto, oppure, nella stessa modale, collega una fonte e premi **Crea / aggiorna grafo documentale del progetto**. **Aggiorna fonti e crea AS-IS** sincronizza le fonti dei grafi selezionati, prepara il dossier e apre la chat. **Usa snapshot esistenti** riusa gli snapshot delle fonti; per il grafo locale acquisisce la cartella corrente. Il vincolo viene verificato anche dal backend e i grafi di altri progetti non sono accettati. La riga iniziale mostra i Markdown già prodotti e salvati nei dossier associati al progetto, con icona, nome, data di creazione e anteprima testuale al clic; non include `INCARICO-AS-IS.md`. La consultazione dal pannello è limitata a file di 5 MB. La presenza in questa riga non richiede la registrazione del dossier e non attesta che sia completo o verificato.

La sincronizzazione è eseguita prima dell’avvio del modello. Se una fonte fallisce, non viene avviato un dossier parziale; le fonti già aggiornate mantengono il loro nuovo snapshot. L’esecuzione richiede credenziali valide e può consumare API modello quando parte la scrittura. Non comprende login Microsoft automatico, pubblicazione su SharePoint o esecuzioni programmate. L’analisi e la verifica restano lavoro del modello: il comando automatizza l’avvio, non garantisce la correttezza dell’AS-IS.

## Usare soltanto la cartella del progetto

Non servono connessioni SharePoint o Azure. Seleziona il progetto in **Il tuo workspace**, apri **Grafi di conoscenza** e premi **Crea / aggiorna grafo del codice**. Se la cartella contiene documentazione, puoi collegarla nella sezione **Grafi documentali** e creare il suo grafo documentale senza generare un AS-IS. Poi apri **As-is**, seleziona il grafo locale e avvia la creazione. La suite crea o riusa un collegamento locale in lettura alla cartella e ne acquisisce uno snapshot, anche con **Usa snapshot esistenti**. Questo collegamento usa internamente il tipo `sharepoint-local`, ma non richiede SharePoint o OneDrive.

Il grafo locale del workspace indicizza i file Git tracciati oppure la cartella senza Git. Lo snapshot locale per il dossier acquisisce invece i file correnti della cartella secondo i limiti delle fonti, compresi eventuali file non registrati in Git. Per un’acquisizione del solo commit scegli esplicitamente il tipo **Azure · repository Git locale**.

## Flusso completo con fonti collegate

1. Configura un modello disponibile per la chat; il profilo Subagenti è facoltativo e, se selezionato, rende obbligatoria la delega.
2. Apri **Il tuo workspace → Grafi di conoscenza → Grafi documentali**. Dai un nome a ogni collegamento e scegli il tipo.
3. Salva i collegamenti, seleziona le cartelle e premi **Crea / aggiorna grafo documentale del progetto**. La suite acquisisce i file, estrae i riferimenti espliciti e usa il modello Orchestratore per ricostruire concetti e relazioni fra documenti, con eventuali costi API. Controlla numero di documenti, esclusioni e data/commit.
4. Premi **Salva riferimenti** per associare le fonti al progetto e rendere disponibili i loro grafi. Apri **As-is**, seleziona i grafi da usare in **Grafi di riferimento per l’AS-IS** e descrivi il perimetro del dossier.
5. Premi **Aggiorna fonti e crea AS-IS**. La suite crea una cartella di lavoro con INCARICO-AS-IS.md e FONTI.json e apre Pi su quella cartella con la richiesta di scrivere il dossier.
6. L’orchestratore esplora prima il grafo documentale e legge i documenti originali, poi confronta il codice. Legge il contesto necessario, pianifica e, se è selezionato un modello Subagenti, delega sempre il lavoro operativo con gli incarichi Markdown già usati dalla suite. Ogni figlio ha accesso alle evidenze selezionate, alle citazioni e al grafo del codice.
7. L’orchestratore verifica e integra le consegne. I risultati finali sono i Markdown nella cartella del dossier; incarichi e proposte dei figli restano consultabili in Attività e risultati.

La preparazione del dossier non produce da sola un AS-IS finito: prepara input e incarico. La generazione richiede un modello disponibile nella chat con tool calling e può comportare costi API. Il codice e i testi letti vengono inviati ai provider selezionati, come per gli altri task della suite.

Le caselle delle **fonti** in Grafi di conoscenza e dei **grafi** in As-is hanno scopi distinti: le prime fissano i riferimenti della chat, di `/asis`, della ricerca e dell’aggiornamento degli indici; le seconde scelgono gli input dei pulsanti AS-IS del pannello. Avviare la creazione dal pannello salva le scelte, ma non rende automaticamente coincidenti i due elenchi. Per riusare nella chat una fonte locale creata dal percorso del grafo, selezionala nell’elenco della modale Grafi di conoscenza e salva i riferimenti. I dossier preparati dal pannello conservano anche `PROGETTO.json` con l’associazione al progetto e ai grafi; `FONTI.json` fissa gli snapshot e gli indici effettivamente usati.

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

L’incarico iniziale chiede AS-IS.md, ARCHITETTURA.md, FLUSSI-E-INTERFACCE.md, OPERATIVITA.md, LACUNE-E-DOMANDE.md e MATRICE-FONTI.md. Puoi adattarle in chat. La skill as-is-documentation è inclusa e abilitata.

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
