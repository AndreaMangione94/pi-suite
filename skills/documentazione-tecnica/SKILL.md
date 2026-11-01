---
name: documentazione-tecnica
description: Crea e aggiorna la documentazione tecnica di un sistema confrontando il progetto e le fonti collegate, con citazioni, revisioni e lacune esplicite.
---

Per creare o aggiornare una documentazione tecnica su richiesta esplicita, usa prepare_documentation oppure il dossier gia preparato da /documentazione-tecnica o dal pannello: prima della generazione la suite deve verificare e aggiornare grafi e indici e fissare il corpus. Non chiamare questa preparazione per normali domande o consultazioni.

Consulta INCARICO-DOCUMENTAZIONE-TECNICA.md se presente. Documenti e codice originali sono le fonti principali: puoi leggerli integralmente con read_evidence(mode full), oppure per sezioni/passaggi. Segui nextOffset se la risposta e paginata e dichiara parti non lette, escluse o troncate. Per creare la documentazione tecnica, se sono selezionati grafi documentali semantici consulta document_graph, poi usa knowledge_search e knowledge_trace per ricostruire sezioni, requisiti, processi e riferimenti, quindi leggi le evidenze originali con read_evidence. Solo dopo consulta il grafo del codice con connected_graph o graph_query per confrontare l’implementazione e rilevare differenze o lacune. Trasmetti questa priorità anche negli incarichi dei subagenti. Se il corpus contiene solo codice, dichiarane l’assenza di documentazione e procedi con le evidenze disponibili. La vicinanza nel grafo non prova il significato delle relazioni e non sostituisce le citazioni degli originali. Per normali domande, diagnosi e sviluppo la consultazione dei grafi resta facoltativa. Non provano da soli significato o completezza e non sostituiscono gli originali. Puoi anche leggere direttamente fonti note. Usa connected_sources per conoscere versioni e copertura e read_connected_source per letture con righe numerate. Conserva riferimenti [sourceId:documentId], percorso e righe pertinenti; per intervalli verificabili usa [sourceId:documentId]#L3-L12.

Un documento descrive ciò che dichiara la sua versione; non prova da solo il comportamento in produzione. Il codice prova un’implementazione nel commit analizzato, non il deployment effettivo. Distingui comportamento verificato, dichiarazioni documentali, ipotesi, lacune e proposte TO-BE. Se codice e documenti differiscono, registra entrambe le evidenze e la domanda aperta.

Delega quando utile senza imporre una sequenza di ruoli. Ogni incarico deve specificare componenti/processi da analizzare, fonti iniziali, limiti, criteri di completezza, citazioni richieste e file della consegna. I figli possono consultare tutte le fonti incluse nel dossier. Il genitore confronta e integra le consegne.

Per la lettura documentale usa il perimetro `evidenceScope` della delega, lasciando al figlio la scelta full/section/passage e la paginazione. Il figlio chiama `report_evidence_reading` con risultati sintetici, citazioni e lacune; il runtime calcola la copertura dalle letture effettive. Il genitore controlla fonti/snapshot, letture complete o parziali, documenti iniziali non letti e richieste di ampliamento prima di integrare le conclusioni. Non equiparare testo estratto integralmente letto a originale interamente rappresentato.

Consegne predefinite, adattabili all’obiettivo:
- DOCUMENTAZIONE-TECNICA.md: documento finale dettagliato e autosufficiente con scopo, confini, attori, funzionalità, architettura, processi, dati, interfacce, operatività, stato osservato, lacune e livello delle evidenze. Gli allegati approfondiscono il documento principale.
- ARCHITETTURA.md: componenti, responsabilità, dati e dipendenze provate; diagrammi solo se supportati.
- FLUSSI-E-INTERFACCE.md: flussi, ingressi/uscite, contratti, autenticazione e gestione errori documentabili.
- OPERATIVITA.md: build, rilascio, configurazioni, monitoraggio e procedure disponibili; nessun segreto in chiaro.
- LACUNE-E-DOMANDE.md: contraddizioni, assenze di prove, esclusioni, verifiche da fare con i responsabili.
- MATRICE-FONTI.md: affermazioni/sezioni, riferimenti, revisioni/hash, data e limiti delle estrazioni.

Non presentare il brief generato dalla suite come documento di documentazione tecnica già completato. Non inventare test eseguiti, collegamenti o ambiente di produzione. Riesamina le affermazioni sostanziali contro le citazioni prima di consegnare. Mantieni gli snapshot fissati dal dossier anche se una fonte viene successivamente sincronizzata.

Al termine usa register_documentation, nella cartella del dossier attivo, per salvare una versione consultabile dopo la validazione delle citazioni primarie. La registrazione non attesta verifica semantica o approvazione umana. I documenti di documentazione tecnica marcati needs_revalidation sono storici: risali alle fonti e non usarli come prova dello stato corrente. Non contare documentazione tecnica e documento da esso riassunto come due conferme indipendenti. La consultazione non deve rigenerare grafi o documenti. propose_relation salva eventuali interpretazioni con evidenze come proposte non revisionate, senza promuoverle a fatti deterministici.
