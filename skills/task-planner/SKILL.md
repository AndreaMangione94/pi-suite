---
name: task-planner
description: Pianifica un task e scrivi incarichi Markdown precisi per i subagenti; distingui obiettivo, contesto, limiti e criteri di completamento.
---

In chat Pi l'orchestratore è il punto di ingresso unico. Se non è selezionato alcun modello Subagenti, svolge direttamente il lavoro e non avvia figli: la modalità indicata dal runtime prevale su questa skill. Se il profilo Subagenti è configurato, segui la politica indicata dal runtime: con la delega automatica rispondi tu quando hai già le evidenze o bastano poche letture, e delega letture estese, stesure ampie e unità parallelizzabili; con la politica «Sempre» coinvolgi almeno un subagente per richiesta. Per richieste complesse usa più incarichi solo quando migliorano la copertura o il parallelismo. Non creare ruoli o passaggi fissi: le specializzazioni sono incarichi temporanei e possono riguardare codice, documentazione, analisi o altro.

Il lavoro operativo va ai figli: analisi delle fonti, stesura, codice e proposte. Il genitore legge prima solo il contesto necessario per assegnare bene il compito, poi verifica e integra. Non eseguire tutto con il modello forte per delegare soltanto una conferma. Modello e thinking dei figli sono indipendenti e fissati dalla configurazione. Non cambiarli automaticamente. Se deleghi un compito semplice usa un solo figlio; aggiungi altri incarichi solo per attività utili. Chiedi una consegna breve con evidenze, proposte, verifiche svolte e dubbi. Se la qualità non basta, assegna una correzione mirata con i difetti osservati e i criteri mancanti. Nessuna catena di ruoli obbligatori e nessuna escalation automatica.

Prima di delegate_tasks scrivi per ogni incarico:
- obiettivo concreto e risultato osservabile;
- contesto rilevante, decisioni già prese e fonti da cui iniziare;
- istruzioni operative specifiche, dipendenze e interfacce con gli altri incarichi;
- limiti, attività escluse e decisioni riservate al genitore;
- criteri di completamento verificabili e forma della consegna;
- file che il figlio può proporre di creare/modificare, senza sovrapposizioni tra incarichi simultanei.

Questi campi diventano INCARICO.md prima dell'avvio. Il figlio può esplorare liberamente il progetto: le fonti iniziali non sono una lista chiusa di lettura. Deve segnalare lacune o necessità fuori perimetro. Consulta grafo e sorgenti; un grafo incompleto non prova assenza di dipendenze.

Per incarichi che analizzano evidenze compila anche `evidenceScope` in `delegate_tasks`: `focus`, `questions`, eventuali `sourceIds`, `documents` con source/document ed eventuale snapshot, `graphNodes`, `limits` ed `expectedOutput`. Usa gli ID restituiti dagli strumenti; il runtime risolve e verifica i riferimenti nel corpus fissato e salva le versioni nel contratto. Le fonti iniziali sono un perimetro operativo: il figlio può esplorare il corpus già fissato per verificare il contesto.

Affida al figlio la scelta fra `read_evidence(mode full)`, `section` e `passage` secondo le domande assegnate. Il figlio gestisce `nextOffset`, mantiene gli stessi parametri della selezione durante la paginazione e dichiara contenuti esclusi o non letti. Non caricare preventivamente tutti i documenti nel contesto del genitore.

Chiedi `report_evidence_reading` prima della consegna: sintesi, citazioni, documenti iniziali non letti con motivazione, dubbi e richieste di ampliamento. Il runtime registra letture e copertura in `evidence-reading.json`. Controlla `evidenceReading` nel risultato della delega: `reportMissing` o `declarationStale` richiedono attenzione; una pagina letta non prova una lettura completa e la copertura del testo estratto non attesta copertura integrale dell’originale.

Al rientro verifica il digest, applica le proposte corrette con apply_proposal (poi ritocca con edit, senza riscriverle) e svolgi i test appropriati. Non presentare una proposta come modifica già applicata. Conserva il contesto generale nella chat e riporta i punti aperti.

Per creare documentazione tecnico funzionale pianifica prima l’esplorazione del grafo documentale semantico salvato con document_graph e la lettura dei documenti originali, poi il confronto con il grafo del codice. Trasmetti questa priorità ai figli. Per le altre richieste ricerca, grafi e documenti di documentazione tecnico funzionale registrati sono strumenti opzionali di supporto. Se li usi, trasmetti ai figli il corpus fissato e gli ID iniziali utili, senza caricare indiscriminatamente tutte le fonti. I figli possono esplorare nodi vicini e aprire gli originali, anche integralmente con read_evidence e paginazione esplicita. Ogni richiesta esplicita di creare o aggiornare documentazione tecnico funzionale deve passare prima da prepare_documentation o dal dossier preparato dal pannello/comando /documentazione-tecnico-funzionale, che verifica e aggiorna i grafi. Le normali domande non devono avviare rigenerazioni.
