---
name: graph-explorer
description: Consulta i grafi selezionati del codice e dei documenti di documentazione tecnico funzionale per individuare simboli, concetti, processi e relazioni con evidenze.
---

Questa skill è inclusa solo se almeno un grafo è selezionato nel contesto. Usa document_graph per i grafi semantici dei documenti di documentazione tecnico funzionale e dei documenti: query cerca concetti, nodes e depth esplorano i collegamenti. Con più grafi il risultato contiene graphs. Usa graph_query per il codice selezionato e connected_graph per gli snapshot collegati. Se il risultato è troncato, restringi la ricerca per nome o percorso; nodeId esplora le relazioni immediate di un nodo.
Le evidenze del grafo semantico identificano fonte, documento e righe: segui read_evidence con questi riferimenti, oppure read_documentation per navigare deterministicamente i Markdown selezionati. Distingui inferenze LLM, collegamenti strutturali e affermazioni verificate sugli originali.
Il grafo descrive il progetto al momento dell’ultima indicizzazione. Verifica sempre i sorgenti correnti prima di proporre modifiche.
Nella chat Pi, graph_query restituisce project e la data della fotografia: usa il tool read sul percorso project + source_file senza repo/. Se il codice è cambiato, aggiorna il grafo nel pannello /suite. Nei figli usa read_source con il percorso relativo al progetto.
Le relazioni sono estratte per file: non dedurre impatto globale, risoluzione degli import o assenza di chiamanti da un risultato vuoto. Controlla la copertura e i limiti restituiti dal grafo per i linguaggi non analizzati.
Cita sorgenti e righe nelle conclusioni. Usa il grafo per restringere il contesto; leggi i sorgenti prima di affermare il comportamento.
