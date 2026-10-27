---
name: as-is-documentation
description: Ricostruisci lo stato AS-IS e la documentazione di un sistema confrontando documenti SharePoint e codice Azure con citazioni, revisioni e lacune esplicite.
---

Per creare o aggiornare un AS-IS su richiesta esplicita, usa prepare_asis oppure il dossier gia preparato da /asis o dal pannello: prima della generazione la suite deve verificare e aggiornare grafi e indici e fissare il corpus. Non chiamare questa preparazione per normali domande o consultazioni.

Consulta INCARICO-AS-IS.md se presente. Documenti e codice originali sono le fonti principali: puoi leggerli integralmente con read_evidence(mode full), oppure per sezioni/passaggi. Segui nextOffset se la risposta e paginata e dichiara parti non lette, escluse o troncate. Ricerca testuale e grafi sono OPZIONALI: knowledge_search, knowledge_trace e connected_graph possono aiutarti a individuare file e nodi vicini da aprire, anche durante domande, diagnosi e sviluppo. Non provano da soli significato o completezza e non sostituiscono gli originali. Puoi anche leggere direttamente fonti note. Usa connected_sources per conoscere versioni e copertura e read_connected_source per letture con righe numerate. Conserva riferimenti [sourceId:documentId], percorso e righe pertinenti; per intervalli verificabili usa [sourceId:documentId]#L3-L12.

Un documento descrive ciò che dichiara la sua versione; non prova da solo il comportamento in produzione. Il codice prova un’implementazione nel commit analizzato, non il deployment effettivo. Distingui comportamento verificato, dichiarazioni documentali, ipotesi, lacune e proposte TO-BE. Se codice e documenti differiscono, registra entrambe le evidenze e la domanda aperta.

Delega quando utile senza imporre una sequenza di ruoli. Ogni incarico deve specificare componenti/processi da analizzare, fonti iniziali, limiti, criteri di completezza, citazioni richieste e file della consegna. I figli possono consultare tutte le fonti incluse nel dossier. Il genitore confronta e integra le consegne.

Consegne predefinite, adattabili all’obiettivo:
- AS-IS.md: scopo, confini, attori, funzionalità, stato osservato e livello delle evidenze.
- ARCHITETTURA.md: componenti, responsabilità, dati e dipendenze provate; diagrammi solo se supportati.
- FLUSSI-E-INTERFACCE.md: flussi, ingressi/uscite, contratti, autenticazione e gestione errori documentabili.
- OPERATIVITA.md: build, rilascio, configurazioni, monitoraggio e procedure disponibili; nessun segreto in chiaro.
- LACUNE-E-DOMANDE.md: contraddizioni, assenze di prove, esclusioni, verifiche da fare con i responsabili.
- MATRICE-FONTI.md: affermazioni/sezioni, riferimenti, revisioni/hash, data e limiti delle estrazioni.

Non presentare il brief generato dalla suite come documento AS-IS già completato. Non inventare test eseguiti, collegamenti o ambiente di produzione. Riesamina le affermazioni sostanziali contro le citazioni prima di consegnare. Mantieni gli snapshot fissati dal dossier anche se una fonte viene successivamente sincronizzata.

Al termine usa register_asis, nella cartella del dossier attivo, per salvare una versione consultabile dopo la validazione delle citazioni primarie. La registrazione non attesta verifica semantica o approvazione umana. AS-IS marcati needs_revalidation sono storici: risali alle fonti e non usarli come prova dello stato corrente. Non contare AS-IS e documento da esso riassunto come due conferme indipendenti. La consultazione non deve rigenerare grafi o documenti. propose_relation salva eventuali interpretazioni con evidenze come proposte non revisionate, senza promuoverle a fatti deterministici.
