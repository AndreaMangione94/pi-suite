# Pi Suite 0.6.5 — Resoconto e primo avvio

Aggiornamento del 27 ottobre 2026. Ricerca testuale, grafi documentali/SQL e AS-IS persistenti: vedi la [Guida conoscenza e grafi](GUIDA-CONOSCENZA-E-GRAFI.md). Con il modello Subagenti selezionato, il flusso principale segue la richiesta: chat → orchestratore → almeno un subagente con incarico Markdown → integrazione e verifica → risposta.

Per collegare SharePoint e Azure e generare il dossier documentale, segui la [Guida fonti e AS-IS](GUIDA-FONTI-AS-IS.md).

## Cosa abbiamo

| Componente | Disponibile |
| --- | --- |
| Chat | Terminale Pi, aperto dal pannello o con pi dalla cartella di lavoro. |
| Modelli | Due selezioni principali: orchestratore e subagenti, anche con provider differenti. |
| Delega dinamica | pi-subagents 0.79.0 con Pi 1.0.0; fino a 4 incarichi per chiamata. |
| Incarichi | INCARICO.md scritto dall’orchestratore e salvato prima dell’avvio di ogni figlio. |
| Lettura | Il figlio esplora liberamente il progetto e legge i file testuali; le fonti iniziali non limitano l’esplorazione. |
| Modifiche | Il figlio propone solo file assegnati. Il genitore controlla e integra con gli strumenti Pi. |
| Grafo | Graphify strutturale locale, persistente e interrogabile da genitore e figli. |
| Skill | graph-explorer, task-planner, candidate-review, as-is-documentation e guida upstream pi-subagents per il genitore. |
| Tracciabilità | Incarichi, risultati e proposte su disco e consultabili dal pannello. |
| Workspace | Progetti anche senza Git; riferimenti As-is e Grafi di conoscenza salvati per progetto. |
| AS-IS | Creazione dal pannello con almeno un grafo selezionato; file salvati consultabili e dossier registrabili con citazioni. |
| Benchmark | Prove manuali A/B, 16 dimensioni e scoring Inspect opzionale per i due casi supportati. |

Ricercatore, esecutore, revisore e documentazione non sono più selezioni obbligatorie della chat. Con un modello Subagenti selezionato, l’orchestratore definisce il compito, lo assegna sempre a uno o più figli e verifica le consegne. Se è configurato solo l’orchestratore, lavora direttamente senza figli. Questa scelta si cambia nel pannello, salvando e aprendo una nuova chat. Il lavoro operativo usa il modello e il ragionamento configurati per i subagenti, indipendenti da quelli del genitore.

## Installazione e prima configurazione

1. Estrai Pi-Suite-0.6.5-Windows.zip, apri la cartella pi-suite ed esegui Install.cmd. Serve Internet per le dipendenze. Apri quindi Pi Suite dal collegamento desktop.
2. In Connessioni e modelli configura un server locale senza account o un provider cloud con la sua chiave. Puoi importare JSON/YAML e nominare più connessioni allo stesso provider: vedi GUIDA-BYOK.md.
3. In Orchestratore e subagenti scegli il modello principale; seleziona anche quello dei figli per attivare la delega obbligatoria oppure lascia Subagenti senza modello per la modalità singola. Per contenere il costo scegli per i figli un modello meno costoso o un ragionamento inferiore. Copia modello orchestratore copia la selezione del modello e conserva il ragionamento dei figli se supportato; altrimenti lo disattiva. Salva squadra.
4. Usa Verifica per provare il profilo con tool calling: è una chiamata reale potenzialmente a pagamento. Non abbiamo usato chiavi cloud nel collaudo.
5. Controlla le skill abilitate. La skill pi-subagents è riservata al genitore; i figli possono caricare le altre tramite read_skill.
6. In Il tuo workspace scegli un progetto dalla lista oppure premi Nuovo progetto. Inserisci il nome per creare una nuova cartella, o usa il campo Cartella progetto per sceglierne una esistente dal selettore Windows; conferma con Crea progetto. Premi Apri chat Pi per lavorare sulla cartella e con i riferimenti del progetto corrente. Non serve Git.

La chat si apre in una finestra terminale Pi. Il browser serve per configurazione, grafo e consultazione delle attività; non contiene ancora un editor di chat incorporato. Se cambi provider, modelli o skill, riapri la chat per caricare la nuova configurazione e le credenziali.

## Riferimenti del progetto e primo AS-IS

Dopo aver selezionato un progetto, apri **Grafi di conoscenza** e premi **Crea / aggiorna grafo**. Non occorre Git e l’indicizzazione non chiama modelli. Torna nel workspace, apri **As-is**, seleziona il grafo in **Grafi di riferimento**, descrivi l’obiettivo e premi **Aggiorna fonti e crea AS-IS**. La suite acquisisce la cartella in lettura, prepara un dossier separato e apre la chat che scriverà i documenti. **Usa snapshot esistenti** acquisisce comunque la cartella corrente quando è selezionato il grafo locale.

Per aggiungere SharePoint o Azure espandi **Collega e gestisci le fonti del progetto**. Salva il collegamento, seleziona la fonte, premi **Sincronizza** e **Salva riferimenti**; poi seleziona il suo grafo. La selezione delle fonti serve alla consultazione nella chat e a `/asis`; quella dei grafi determina gli input dei pulsanti di creazione nel pannello.

Senza un progetto i pulsanti As-is e Grafi di conoscenza sono disabilitati; senza un grafo selezionato restano disabilitati soltanto i pulsanti di creazione AS-IS. La prima riga delle due modali mostra i file salvati per il progetto: un clic ne apre l’anteprima. Questa consultazione non richiede rigenerazione o registrazione del dossier. **Verifica citazioni e registra AS-IS** serve invece a renderlo ricercabile e riutilizzabile dagli agenti.

## Esempio: documentazione alla prima accensione

Prepara una cartella con una specifica o un README e apri la chat da quella cartella. Scrivi:

> Leggi la documentazione di questo progetto e prepara una guida per un nuovo utente e una lista delle informazioni mancanti. Organizza il lavoro e assegnalo ai subagenti. Ogni subagente deve ricevere istruzioni precise; puoi leggere tutti i file necessari. Non cambiare il codice.

Un piano possibile è affidare a un figlio la guida e a un altro il controllo delle lacune. Il modello decide la suddivisione: il numero di figli non è fissato dal tipo di task.

Prima di avviarli, l’orchestratore compila per ciascuno un incarico come questo:

```markdown
# Guida per il primo utilizzo

## Obiettivo
Preparare una guida che permetta a un nuovo utente di avviare il prodotto.

## Contesto e fonti iniziali
Parti da README.md e dalla cartella docs. Verifica liberamente altri file utili.

## Istruzioni operative
Ricostruisci prerequisiti, configurazione e primo utilizzo. Distingui i passaggi
verificabili dai punti non documentati. Scrivi in italiano per un utente nuovo.

## Limiti e attività escluse
Non cambiare codice o configurazioni. Non inventare comandi o credenziali.
Segnala al genitore le informazioni mancanti che impediscono una guida corretta.

## Criteri di completamento
Ogni comando deve avere una fonte nel progetto. Il percorso deve includere
prerequisiti, avvio e verifica del risultato.

## Consegna attesa
Proponi docs/PRIMO-UTILIZZO.md e restituisci un riepilogo con fonti e lacune.

## File che puoi proporre di creare o modificare
- docs/PRIMO-UTILIZZO.md
```

La suite salva realmente INCARICO.md prima della chiamata al modello figlio. Il figlio può leggere anche file che non può modificare. Un incarico di sola analisi può avere una lista modificabile vuota e consegnare soltanto testo.

Non devi mantenere tre documenti: questo è l’unico Markdown operativo del figlio. Il profilo generale è interno alla suite. Un eventuale AGENTS.md nella cartella di progetto aperta in chat contiene soltanto regole permanenti comuni; viene incluso automaticamente nell’incarico, insieme alle regole delle sottocartelle dei file modificabili. Ogni fonte viene citata con il proprio ambito. La copia resta quella del momento della delega e il contenuto dell’incarico viene caricato una sola volta nel contesto del modello. Ogni figlio ha un incarico separato, anche quando parte in parallelo ad altri.

I figli restituiscono risultati e proposte. L’orchestratore confronta le consegne, risolve contraddizioni, integra i file pertinenti e riferisce cosa ha verificato. In Attività e risultati puoi aprire gli incarichi e i risultati; il percorso delle proposte è indicato nei dettagli.

## Grafo locale

Per una cartella locale, anche senza Git, collegala in Il tuo workspace, selezionala e apri la modale Grafi di conoscenza; qui premi Crea / aggiorna grafo. Questo passaggio non usa modelli. Il modello principale usa graph_query; i figli ricevono il riferimento allo stesso grafo quando il progetto è registrato.

Il grafo persiste al riavvio e la cache riusa i file invariati. Nella chat legge l’indice salvato e può essere precedente alle ultime modifiche: aggiorna l’indice quando serve. Un grafo incompleto non impedisce di leggere i file.

Supporta strutture AST Python, JavaScript e TypeScript, non tutta la semantica del progetto. Vedi copertura e limiti nel README. Per documenti e altri linguaggi resta disponibile l’esplorazione dei file. Gli snapshot delle fonti hanno inoltre indici testuali e grafi documentali/SQL, con la copertura descritta nella guida Conoscenza e grafi.

## Dove resta il lavoro

Con avvio dalla cartella estratta, dopo l’installazione delle dipendenze, i dati sono in suite-data accanto al launcher. Nell’installazione standard sono in %LOCALAPPDATA%/PiSuite/data. Le due modalità non condividono automaticamente impostazioni e chiavi.

```text
data/settings.json                         progetti, riferimenti e preferenze
data/models.config.json                    connessioni, modelli e profili
data/credentials.dpapi.json                 chiavi modello cifrate con DPAPI
data/graphs/                               cache e grafi del workspace
data/sessions/<id>/                        configurazione fissata per chat Pi
data/pi-shell/                             configurazione di supporto Pi
data/sources/                              collegamenti, snapshot e AS-IS registrati
data/documentation/<id>/                    dossier AS-IS e fonti fissate
data/benchmarks.sqlite                     registro benchmark
data/benchmark-evaluations/                log delle valutazioni Inspect
data/delegations/<batch>/batch.json         piano e stato delle deleghe
data/delegations/<batch>/<n>/INCARICO.md    istruzioni assegnate
data/delegations/<batch>/<n>/result.json    risultato del figlio
data/delegations/<batch>/<n>/proposals/     file proposti
```

I figli partono da un contesto fresco. Il genitore deve includere nell’incarico decisioni e informazioni necessarie dalla conversazione. Lo storico su disco non equivale a memoria globale automaticamente caricata in tutte le chat. Le chiavi cifrate sono legate all’account Windows e vanno reinserite su un altro PC/account.

## Limiti e controlli

- I subagenti integrati non hanno shell o rete, né modificano direttamente l’originale. Producono testo e file UTF-8 fino a 200 KB ciascuno; l’orchestratore esegue le verifiche e l’integrazione.
- L’orchestratore ha gli strumenti standard Pi: può leggere, scrivere e usare shell secondo la richiesta. Le restrizioni dei figli non sono una sandbox Windows dell’intera applicazione.
- La lista di file modificabili è assegnata dal genitore, senza sovrapposizioni tra incarichi simultanei. Per cambiare il perimetro il figlio deve riferirlo al genitore.
- Le istruzioni dell’incarico guidano un modello: le proprietà testate dal runtime sono strumenti disponibili, percorsi di proposta, limiti e separazione dei risultati. La correttezza semantica richiede verifica.
- Il limite di subagenti conta i figli nell’apertura corrente della chat. Non è un tetto economico, non conta le richieste del genitore.
- Workflow e dati sono locali. Con modelli cloud, il contenuto letto e inviato ai modelli va ai provider selezionati.

Per aggiornare o disinstallare usa `Gestisci-PiSuite.ps1` dalla cartella di consegna: entrambe le azioni conservano i dati. Vedi i comandi nel [README](README-SUITE.md#aggiornare-o-disinstallare).

Per riaprire la suite usa sempre il collegamento o pi suite: una vecchia porta del browser può non essere più valida. Per errori di provider usa Verifica e controlla chiave, modello, protocollo e tool calling prima di ripetere task costosi.
