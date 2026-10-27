---
name: task-planner
description: Pianifica un task e scrivi incarichi Markdown precisi per i subagenti; distingui obiettivo, contesto, limiti e criteri di completamento.
---

In chat Pi l'orchestratore è il punto di ingresso unico. Se non è selezionato alcun modello Subagenti, svolge direttamente il lavoro e non avvia figli: la modalità indicata dal runtime prevale su questa skill. Se il profilo Subagenti è configurato, ogni richiesta deve coinvolgere almeno un subagente tramite `delegate_tasks`, anche se è semplice o indivisibile. Per questi casi assegna un unico incarico generale per preparare la risposta o il risultato. Per richieste complesse usa più incarichi solo quando migliorano la copertura o il parallelismo. Non creare ruoli o passaggi fissi: le specializzazioni sono incarichi temporanei e possono riguardare codice, documentazione, analisi o altro.

Il lavoro operativo va ai figli: analisi delle fonti, stesura, codice e proposte. Il genitore legge prima solo il contesto necessario per assegnare bene il compito, poi verifica e integra. Non eseguire tutto con il modello forte per delegare soltanto una conferma. Modello e thinking dei figli sono indipendenti e fissati dalla configurazione. Non cambiarli automaticamente. Per un compito semplice usa un solo figlio; aggiungi altri incarichi solo per attività utili. Chiedi una consegna breve con evidenze, proposte, verifiche svolte e dubbi. Se la qualità non basta, assegna una correzione mirata con i difetti osservati e i criteri mancanti. Nessuna catena di ruoli obbligatori e nessuna escalation automatica.

Prima di delegate_tasks scrivi per ogni incarico:
- obiettivo concreto e risultato osservabile;
- contesto rilevante, decisioni già prese e fonti da cui iniziare;
- istruzioni operative specifiche, dipendenze e interfacce con gli altri incarichi;
- limiti, attività escluse e decisioni riservate al genitore;
- criteri di completamento verificabili e forma della consegna;
- file che il figlio può proporre di creare/modificare, senza sovrapposizioni tra incarichi simultanei.

Questi campi diventano INCARICO.md prima dell'avvio. Il figlio può esplorare liberamente il progetto: le fonti iniziali non sono una lista chiusa di lettura. Deve segnalare lacune o necessità fuori perimetro. Consulta grafo e sorgenti; un grafo incompleto non prova assenza di dipendenze.

Al rientro verifica evidenze e proposte, integra quanto corretto e svolgi i test appropriati. Non presentare una proposta come modifica già applicata. Conserva il contesto generale nella chat e riporta i punti aperti.

Ricerca, grafi e AS-IS registrati sono strumenti opzionali di supporto. Se li usi, trasmetti ai figli il corpus fissato e gli ID iniziali utili, senza caricare indiscriminatamente tutte le fonti. I figli possono esplorare nodi vicini e aprire gli originali, anche integralmente con read_evidence e paginazione esplicita. Ogni richiesta esplicita di creare o aggiornare AS-IS deve passare prima da prepare_asis o dal dossier preparato dal pannello/comando /asis, che verifica e aggiorna i grafi. Le normali domande non devono avviare rigenerazioni.
