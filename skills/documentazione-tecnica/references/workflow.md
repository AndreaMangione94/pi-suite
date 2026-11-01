# Flusso AS-IS di documentazione tecnico-funzionale

Queste istruzioni valgono esclusivamente per la creazione o l'aggiornamento di questo dossier AS-IS. Descrivi l'utilizzo dell'applicazione, ogni funzionalità e i relativi flussi, con gli approfondimenti tecnici e architetturali necessari a comprenderli. Per domande, consultazioni, sviluppo e altre attività resta valida la normale modalità della suite. In questo flusso le regole specifiche seguenti precisano le indicazioni generali sulla delega.

## Piano iniziale dell'orchestratore

Prima della stesura salva PIANO-DOCUMENTAZIONE.md nella cartella del dossier. Leggi solo il contesto necessario a identificare i micro moduli e le funzionalità: menu, schermate, ruoli, operazioni, processi, documenti e punti di ingresso del codice disponibili. Se la ricognizione richiede un'analisi estesa, delegala con un incarico di solo censimento, senza stesura delle funzionalità, poi completa il piano.

Assegna a ogni unità un ID stabile, per esempio F-001. Per ciascuna registra scopo, ambito incluso ed escluso, ruoli, fonti iniziali, dipendenze e riferimenti ad altre unità, file di consegna esclusivo e stato del lavoro. Scomponi i macro moduli in unità documentabili separatamente; se una funzionalità richiede più incarichi, identifica anche i suoi sottoflussi. Ogni unità terminale del piano deve avere un proprio task. Il piano è aggiornabile quando emergono nuove funzionalità.

## Incarichi separati

Con delegate_tasks crea un incarico operativo distinto per ogni micro modulo o funzionalità terminale. Non assegnare a un unico figlio la documentazione dell'intera applicazione o di più funzionalità indipendenti. Usa batch successivi, da 1 a 4 incarichi ciascuno, rispettando parallelismo e limite di chiamate configurati. Il piano complessivo può contenere più unità di un singolo batch.

Ogni incarico deve riportare ID, obiettivo, confini inclusi ed esclusi, fonti e decisioni già verificate, ID delle unità correlate, criteri di completamento e un file esclusivo, per esempio moduli/F-001.md. Compila evidenceScope con domande riferite soltanto all'unità assegnata e gli stessi limiti dell'incarico. I figli propongono i propri file; piano, documento finale e allegati condivisi sono integrati dall'orchestratore.

Per questa generazione serve il profilo Subagenti configurato. Se manca, prepara il piano e segnala che occorre configurarlo prima della stesura delegata; non scegliere automaticamente un modello e non sostituire i task con una stesura monolitica. Se il limite di chiamate impedisce di proseguire, conserva piano, consegne e task pendenti e dichiara il lavoro parziale.

## Confini e consegna del sottoagente

Analizza e documenta esclusivamente l'unità assegnata. Se l'incarico è di solo censimento iniziale, elenca le unità e i riferimenti senza stenderne la documentazione. Puoi leggere le fonti adiacenti solo per chiarire il suo contesto e i punti di collegamento; non ricostruire o descrivere nel dettaglio altre funzionalità. Per una dipendenza esterna lascia un riferimento all'ID dell'altra unità, con punto di passaggio, input/output pertinenti ed evidenza disponibile. Non duplicare la descrizione dell'altra funzionalità e non inventare un collegamento non verificato.

Se scopri una funzionalità non censita, annota nome, motivo del collegamento, fonte e proposta di nuovo task. Se l'unità assegnata è troppo ampia, segnala la scomposizione necessaria. Non ampliare autonomamente l'incarico e non avviare altri agenti: le nuove assegnazioni spettano all'orchestratore.

Per l'unità assegnata documenta scopo, attori e permessi, prerequisiti e accesso alla funzione, dati e validazioni, sequenza delle azioni dell'utente e risposte del sistema, esiti e cambi di stato, regole, varianti, errori e recupero. Aggiungi dettagli tecnici e architetturali pertinenti all'unità. Distingui ciò che è verificato, dichiarato dalle fonti o non ricostruibile. Accompagna le affermazioni con citazioni e indica sezioni non applicabili con motivazione, senza inventare comportamenti.

Consegna il file proposto, i riferimenti ad altre unità, le lacune, i conflitti e le proposte di task successivi. Chiama report_evidence_reading con citazioni, letture incomplete e dubbi. Il testo letto non misura da solo la copertura funzionale.

## Integrazione e iterazioni dell'orchestratore

Controlla ogni consegna contro ambito, fonti, copertura dei flussi e confini assegnati. Integra le proposte verificate nel documento principale, risolvi i rimandi fra ID e sezioni, uniforma i termini e ricostruisci i percorsi trasversali collegando i pezzi. Mantieni nel piano la corrispondenza fra unità, incarico/batch, file proposto, sezione integrata, evidenze e stato: da assegnare, assegnata, da integrare, parziale, integrata o bloccata.

Per nuove funzionalità, riferimenti irrisolti, contraddizioni, flussi mancanti o consegne fuori ambito, aggiorna il piano e crea nuovi task mirati con nuovi sottoagenti. Trasmetti loro risultati già verificati, decisioni e lacuna da risolvere; non chiedere di rifare l'intero dossier. La continuazione può richiedere più batch e più iterazioni.

Prima di register_documentation confronta il piano con il documento finale: ogni unità deve essere integrata oppure esplicitamente indicata come parziale, esclusa con motivazione o bloccata. Se restano task necessari pendenti, presenta il dossier come parziale e indica come continuare. La registrazione delle citazioni e il grafo finale non attestano da soli la completezza funzionale. Il documento principale deve contenere le descrizioni integrate; piano e file dei singoli moduli non lo sostituiscono.
