# Pi Suite 0.6.6 — Windows

Documentazione della distribuzione Windows 0.6.6, aggiornata il 28 ottobre 2026.

Il punto di ingresso è la chat Pi: scrivi al modello orchestratore, che, quando è selezionato un modello Subagenti, affida sempre almeno un incarico a un figlio, controlla il risultato e risponde. Se è selezionato soltanto il modello Orchestratore, svolge direttamente il lavoro senza figli. Anche per una richiesta semplice basta un solo figlio. Ogni subagente riceve un INCARICO.md preciso. La suite integra Pi 1.0.0, pi-subagents 0.79.0, skill e grafo Graphify locale persistente.

## Benchmark e confronti

Apri Nuova prova e scegli il caso: puoi scaricare subito il file per la chat, senza salvare né compilare altri campi. Descrivi liberamente A e B quando vuoi, salva una bozza o la prova e carica i risultati nelle due schede. Non serve un registro di architetture. Puoi aggiungere metriche esportate dall’harness. Il runner opzionale Inspect AI valuta inizialmente i casi di calcolo ed estrazione JSON; schede e confronti mantengono tutte le 16 dimensioni e la provenienza dei dati. [Guida benchmark](GUIDA-BENCHMARK.md).

Il report JSON è obbligatorio per ogni caso e per A e B: include `answer`, `notes`, `outcome` e `dimensions` con token, durata e costo espliciti. Entrambi i caricamenti e il server rifiutano report incompleti o sole risposte testuali. `answer` conserva il formato del compito; le metriche osservate richiedono unità, metodo, evidenza e copertura. I contatori mancanti restano dichiarati non disponibili con un motivo e quelli del solo orchestratore non diventano un totale con i subagenti. [Resoconto dell’intervento](RESOCONTO-METRICHE-PROVE.md).

Il modello testato restituisce risposta e sole metriche operative osservabili; i controlli deterministici spettano al laboratorio. Per completare le altre dimensioni apri **Completa con valutazione LLM**: premi **Esporta prova per valutatore esterno**, estrai la cartella ZIP con test, risposta e istruzioni del formato JSON e passa i tre file a un altro modello e carica il suo JSON nella stessa prova. La CTA resta disabilitata finché le risorse richieste non sono disponibili, mostrando il motivo. L’integrazione conserva risposta e misure precedenti e registra i nuovi valori come **Giudizio LLM esterno**. [Procedura completa](GUIDA-BENCHMARK.md#valutazione-separata-con-un-altro-llm).

## Modelli locali e BYOK

Puoi configurare un endpoint custom incollando il JSON nell'editor o caricando un file, con una API key in un campo password separato e cifrata con Windows DPAPI. È incluso `models.custom.example.json`, con URL, capacità e ragionamento predefinito per modello. Prima di salvare viene mostrata un'anteprima; editor ed export contengono soltanto riferimenti alla chiave.

La suite è open source (MIT) e funziona senza account. In **Connessioni e modelli** puoi importare/esportare JSON o YAML, nominare più connessioni allo stesso provider, configurare i metadati per singolo modello e verificarne il ciclo strumenti. Le credenziali sono separate e protette; chat e figli usano uno snapshot per sessione. Vedi la [Guida BYOK](GUIDA-BYOK.md) e gli esempi locali inclusi. I servizi cloud sono opzionali.

## Il tuo workspace

Il selettore del progetto e **Nuovo progetto** si trovano sulla stessa riga. Nella modale basta inserire il nome e premere **Crea progetto**: la suite crea la cartella `data/projects/<nome>`. Il campo **Cartella progetto**, oppure **Sfoglia**, apre il selettore nativo di Windows e permette di collegare una cartella esistente. La scelta della cartella non salva il progetto: conferma con **Crea progetto**. Sono supportate anche cartelle senza Git.

La card **Riferimenti del progetto** contiene i pulsanti **As-is** e **Grafi di conoscenza**. Senza progetto sono disabilitati e mostrano l’indicazione **Scegli un progetto per continuare.** Dopo la selezione si aprono anche se non ci sono ancora fonti o grafi. Le due modali mostrano in alto i file già salvati, con icona, nome, data di creazione e anteprima testuale al clic. **Salva riferimenti** conserva le scelte per quel progetto; chiudere la modale non equivale a salvarle. L’azione **Apri chat Pi** è separata: apre il terminale nella cartella del progetto selezionato anche senza un modello Orchestratore salvato. In quel caso la suite non imposta un modello e Pi gestisce normalmente la selezione e l’eventuale assenza di un modello disponibile. La chat e i figli consultano le fonti salvate per quel progetto; `/asis` ne riusa anche l’obiettivo predefinito. Nei dossier restano prioritari gli snapshot fissati in FONTI.json.

Modelli e squadra sono configurati nelle pagine dedicate e restano comuni alla suite. La selezione di un progetto non richiede modelli già configurati. Grafi e chat supportano anche cartelle senza Git.

## Ricerca, grafi documentali e AS-IS riutilizzabile

La sincronizzazione conserva originali, localizzatori e indici persistenti. Orchestratore e subagenti possono usare facoltativamente knowledge_search, knowledge_trace e read_evidence, anche per leggere fonti complete con paginazione esplicita. Prima di ogni AS-IS vengono verificati e aggiornati i grafi delle fonti selezionate. I dossier prodotti si possono registrare e consultare senza rigenerarli. [Guida conoscenza e grafi](GUIDA-CONOSCENZA-E-GRAFI.md).

La delega delle letture usa `evidenceScope`: obiettivo documentale, domande, fonti e snapshot iniziali, limiti e consegna. Il figlio sceglie autonomamente full/section/passage e la paginazione; il resoconto `report_evidence_reading` e la copertura registrata tornano al genitore e sono consultabili nelle attività.

## Fonti OneDrive, SharePoint, Azure e dossier AS-IS

La documentazione tecnica in cartelle OneDrive si collega con i nuovi tipi **OneDrive · cartella sincronizzata sul PC** e **OneDrive · Microsoft Graph**. TXT, Markdown e gli altri formati supportati vengono acquisiti anche nelle sottocartelle e usati per ricerca, grafi documentali e AS-IS. Il tipo Graph richiede un access token; Drive ID vuoto usa il drive personale dell’utente autenticato.

In **Il tuo workspace → Grafi di conoscenza** puoi collegare cartelle OneDrive e SharePoint sincronizzate o tramite Microsoft Graph e repository Azure locali o remoti. La stessa modale gestisce generazione dei grafi documentali, ricerca, indici e grafo del codice. **Crea / aggiorna grafo documentale del progetto** acquisisce i documenti, estrae i riferimenti espliciti e usa il modello Orchestratore per salvare il grafo semantico finale, anche senza collegamenti espliciti fra i file. Può avere costi API e non crea un AS-IS. La cache riusa le analisi valide dei documenti invariati. Poi apri **As-is**, scegli i grafi di riferimento e premi **Aggiorna fonti e crea AS-IS**. Puoi usare anche soltanto la cartella del progetto: crea prima il suo grafo da **Grafi di conoscenza**. Senza un grafo disponibile e selezionato i pulsanti di creazione restano disabilitati. Il genitore e i figli leggono gli snapshot con citazioni e possono interrogare il grafo AST del codice acquisito. Il dossier fissa le versioni e prepara un incarico: la documentazione viene poi scritta dai modelli configurati. [Guida fonti e AS-IS](GUIDA-FONTI-AS-IS.md).

## Comando AS-IS

Nella chat Pi usa `/asis [obiettivo]`: aggiorna le fonti del dossier attivo (oppure quelle salvate per il progetto corrente), prepara una nuova versione e avvia l’orchestratore nella stessa chat. Nel browser, **Aggiorna fonti e crea AS-IS** sincronizza le fonti corrispondenti ai grafi selezionati e apre la chat del dossier. **Usa snapshot esistenti** riusa le acquisizioni delle fonti collegate; se selezioni il grafo locale, acquisisce comunque una nuova copia della cartella corrente. Il requisito di selezionare un grafo riguarda il pannello: `/asis` usa invece le fonti salvate per il progetto o fissate nel dossier. Le fonti si gestiscono nella modale Grafi di conoscenza; la selezione degli input del dossier resta nella modale As-is. La produzione AS-IS interroga il grafo semantico salvato con `document_graph`, legge gli originali e poi confronta il grafo del codice. Il dossier fissa la versione semantica e gli snapshot, così gli aggiornamenti successivi non cambiano le evidenze già usate. Questa priorità vale anche per i subagenti. Per generare il dossier occorre un modello disponibile nella chat, configurato dal pannello o selezionato direttamente in Pi.

## Avvio rapido

1. Estrai lo ZIP ed esegui Install.cmd. Servono Internet, Node >=22.19, Python 3.13 e Git. L’installer prepara le dipendenze e il collegamento desktop.
2. Apri Pi Suite dal collegamento desktop creato dall’installer.
3. In Connessioni e modelli configura un server locale senza autenticazione oppure un provider cloud con la sua chiave, quindi salva. Puoi anche importare gli esempi JSON/YAML inclusi, sostituendo gli ID dimostrativi.
4. In Orchestratore e subagenti scegli il modello Orchestratore e, per attivare la delega obbligatoria, anche il modello Subagenti (anche di provider diverso). Puoi usare lo stesso modello. Salva squadra e prova Verifica: la prova usa il provider reale e può avere un costo.
5. In Il tuo workspace premi Apri chat Pi. Il progetto è facoltativo: senza selezionarlo si apre una nuova chat con contesto pulito e le configurazioni salvate; selezionandolo si usano la sua cartella e i suoi riferimenti. Si apre il terminale Pi con il modello principale, se salvato; altrimenti Pi gestisce la scelta del modello. Sono supportate anche cartelle senza Git.
6. Scrivi il risultato desiderato. Con Subagenti configurati, l’orchestratore delega sempre almeno un incarico tramite delegate_tasks e integra la consegna del figlio. Senza modello Subagenti lavora direttamente.

Leggi [Resoconto e primo avvio](RESOCONTO-E-PRIMO-AVVIO.md) per un esempio completo e [Verifiche](VERIFICA-SUITE.md) per il collaudo.

## Orchestrazione e costo

La selezione del modello Subagenti attiva la delega obbligatoria; lasciare quel profilo senza modello è l’unico modo per usare la chat senza figli. Puoi premere Nessun subagente, poi Salva squadra e aprire una nuova chat. Un errore del provider o il budget esaurito non attivano automaticamente la modalità singola.

Con la delega attiva, il modello principale prepara gli incarichi e verifica i risultati; i figli eseguono il lavoro operativo. Scegli un orchestratore più capace e un modello dei subagenti meno costoso, oppure lo stesso modello con ragionamento inferiore, nei livelli supportati. La suite mantiene separate le due impostazioni. Il pulsante Copia modello orchestratore conserva il ragionamento dei figli se compatibile e altrimenti usa off. Non sceglie prezzi, modelli o escalation al posto tuo.

Un compito semplice usa un figlio; più figli servono per attività distinte. L’orchestratore trasmette contesto pertinente, istruzioni, vincoli e criteri verificabili, controlla evidenze e proposte, poi richiede correzioni mirate se necessario. L’obiettivo è ridurre il lavoro del modello forte, evitando che rifaccia integralmente quello dei figli. Qualità e risparmio vanno misurati: contano anche assegnazione, verifica e tentativi aggiuntivi.

Con il profilo Subagenti configurato, se il modello tenta di concludere senza delegare, il runtime chiede una sola correzione automatica per richiesta. Se manca ancora una consegna valida, o la configurazione/il budget non consentono la delega, mostra un avviso di flusso incompleto. Errori e cancellazioni non avviano tentativi automatici. Il controllo non certifica la qualità semantica della consegna.

## Comandi

```text
pi suite       apre il pannello
pi             apre la chat nella cartella corrente
/suite         dentro Pi: apre il pannello
```

Se un altro pi prevale nel PATH, usa il collegamento desktop o, in PowerShell:

```powershell
& "$env:LOCALAPPDATA/PiSuite/bin/pi.cmd" suite
```

## Incarichi Markdown e libertà di esplorazione

L’orchestratore specifica titolo, obiettivo, contesto/fonti iniziali, istruzioni, limiti, criteri di completamento, consegna e file modificabili. La suite salva questi dati in INCARICO.md prima di avviare il figlio con pi-subagents.

È l’unico Markdown necessario per quel figlio: non devi creare un profilo `.pi/agents/nome.md`. Modello e strumenti sono configurati internamente. Se esiste `AGENTS.md` nella cartella del progetto aperta in chat, la suite ne include una copia nell’incarico; aggiunge anche quelli nelle sottocartelle dei file assegnati, indicando l’ambito di ciascuno. Le regole comuni sono opzionali. L’incarico viene caricato una sola volta nel contesto di sistema, senza duplicarne il testo nel messaggio iniziale. Le regole non ampliano il perimetro tecnico; conflitti e necessità ulteriori vanno riferiti al genitore. I file di regole inclusi non possono superare complessivamente 100 KB.

I subagenti possono esplorare e leggere l’intero progetto, anche file fuori dalla lista modificabile. Dispongono di list_sources, read_source, graph_query, read_skill e propose_file. Le scritture producono proposte separate, solo per i percorsi assegnati. Non hanno shell, accesso diretto di scrittura al progetto, delega ricorsiva o rete propria. L’orchestratore usa gli strumenti standard di Pi per integrare le proposte e fare le verifiche. Questi controlli limitano gli strumenti dei figli; non sono una sandbox del sistema operativo e non restringono gli strumenti del genitore.

Sono disponibili anche knowledge_search, knowledge_trace, read_evidence e propose_relation. Gli strumenti di conoscenza sono opzionali e le interpretazioni restano separate dalle evidenze strutturali. La lettura estesa riguarda gli snapshot; read_source mantiene il limite di 200 KB.

Sono ammessi fino a 4 incarichi per chiamata, con parallelismo configurabile e percorsi di scrittura non sovrapposti. Con il modello Subagenti selezionato, il flusso chat avvia almeno un figlio per richiesta; questo aumenta i tempi e le chiamate modello anche per richieste semplici. Il limite impostato nel pannello conta i subagenti avviati nell’apertura corrente della chat. Ogni figlio ha scadenza di 600 secondi e budget di 64 chiamate a strumenti. Non è un tetto monetario e non comprende le richieste del modello principale.

In Attività e risultati sono consultabili gli incarichi e i risultati. Su disco: data/delegations/<batch>/<numero>/INCARICO.md, result.json e proposals/. Il modello principale mantiene il contesto della conversazione; i figli ricevono contesto fresco con l’incarico. Lo storico dei file resta sul disco, ma non viene iniettato integralmente nei task futuri.

## Grafo e skill

Graphify 0.1.14 indicizza le strutture AST Python, JavaScript e TypeScript senza LLM. Aggiungi un repository nel pannello, aprilo e crea/aggiorna il grafo. Orchestratore e figli possono interrogare il grafo salvato. Il grafo della chat può precedere le modifiche correnti: aggiornalo quando serve e verifica i sorgenti.

La cache SQLite riutilizza i file invariati. Il grafo strutturale per file non risolve globalmente ogni import/chiamata o dipendenza semantica. Indica la copertura e gli errori: file Git tracciati non nascosti nei repository, oppure file non nascosti della cartella nei progetti senza Git, UTF-8 fino a 200 KB; massimo 10.000 file e 100 MB testuali. Le letture dei figli sono UTF-8 fino a 200 KB per file; list_sources permette esplorazione progressiva delle directory.

Incluse: graph-explorer, task-planner, candidate-review, as-is-documentation e la skill upstream pi-subagents per il genitore. La copia integrale upstream e i suoi riferimenti sono nella dipendenza npm. La skill guida l’orchestrazione; il runtime avvia i figli e la suite applica i contratti. Le skill non ampliano i permessi. L’importazione dal pannello accetta SKILL.md autonomi; non importa risorse/script di supporto né connettori di altri prodotti.

## Dati e credenziali

Installazione standard: `%LOCALAPPDATA%/PiSuite/app` (codice), `%LOCALAPPDATA%/PiSuite/data` (dati), `%LOCALAPPDATA%/PiSuite/bin` (comando). Le connessioni e i profili modello sono in `data/models.config.json`; le chiavi modello cifrate sono in `data/credentials.dpapi.json`. `data/settings.json` conserva anche progetti, riferimenti e preferenze della suite.
Avvio dalla cartella estratta, dopo aver installato le dipendenze: suite-data nella stessa cartella. I dati restano separati da quelli dell’installazione standard.

Le chiavi sono cifrate Windows DPAPI per l’account corrente e passate ai processi tramite ambiente. Il browser non le riceve in chiaro; non sono incluse nello ZIP. Cambiando PC/account occorre reinserirle. Non condividere server.json: contiene il token della sessione locale.

Il server ascolta su 127.0.0.1 con token, verifica Host e Origin e non usa CDN. Porta e token possono cambiare: riapri con il launcher. I dati e il grafo sono locali; prompt e sorgenti letti vengono inviati ai provider selezionati se usi inferenza cloud. Per inferenza locale serve un endpoint compatibile con tool calling.

Non sono inclusi un installer firmato, aggiornamenti automatici o inferenza offline pronta. Alcuni provider richiedono OAuth o configurazioni ulteriori oltre alla chiave. L’installer scarica dipendenze, con versioni npm fissate nel lockfile.

## Aggiornare o disinstallare

Se hai installato dal repository, esegui dalla cartella del clone:

```powershell
git pull --ff-only
.\Install.cmd
```

`Install.cmd` installa Pi Suite se assente; se trova una copia installata applica
i sorgenti locali, aggiorna le dipendenze quando cambiano e riapre
il pannello. Configurazioni, progetti e chiavi sono conservati. L'applicazione
precedente viene salvata e ripristinata in caso di errore. Le chat vanno riaperte.
Il comando accetta `-Destination` e `-NoLaunch`.

Per la distribuzione ZIP separata, nella cartella di consegna `pi-suite`,
accanto allo ZIP, trovi `Gestisci-PiSuite.ps1`. Per aggiornare esegui:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Gestisci-PiSuite.ps1 -Azione Aggiorna
```

Lo script verifica il file `.zip.sha256`, chiude i processi Python/Node della destinazione, esegue l’installer e riavvia il pannello. `-Azione Disinstalla` rimuove applicazione, comando dal PATH e collegamento desktop, conservando la cartella dati. `-Destinazione` indica una copia installata in un percorso personalizzato; `-Pacchetto` sceglie uno ZIP diverso per l’aggiornamento. `-VerificaSoltanto` controlla senza eseguire l’azione. Le chat vanno riaperte per usare le modifiche. Lo script di gestione è esterno allo ZIP applicativo: conserva anche la cartella di consegna.

## Integrità del pacchetto

Il file `.zip.sha256` permette di verificare lo ZIP con `Get-FileHash -Algorithm SHA256`.
All’interno dello ZIP, `MANIFEST.sha256.json` elenca l’hash di ogni file distribuito.
Lo ZIP applicativo contiene la cartella `pi-suite` con sorgenti, installer, configurazioni di esempio, skill,
licenze, guide e test del workspace. La cartella di consegna esterna contiene inoltre
`LEGGIMI.md`, `Documentazione`, `Sorgenti`, lo script di gestione e `Archivio` con la versione precedente. Le dipendenze vengono scaricate durante l’installazione.
