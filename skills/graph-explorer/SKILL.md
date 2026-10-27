---
name: graph-explorer
description: Consulta il grafo Graphify per individuare simboli e relazioni strutturali prima di pianificare o modificare codice.
---

Usa graph_query con un termine legato al task. Se il risultato è troncato, restringi la ricerca per nome o percorso; nodeId esplora le relazioni immediate di un nodo.
Il grafo descrive il progetto al momento dell’ultima indicizzazione. Verifica sempre i sorgenti correnti prima di proporre modifiche.
Nella chat Pi, graph_query restituisce project e la data della fotografia: usa il tool read sul percorso project + source_file senza repo/. Se il codice è cambiato, aggiorna il grafo nel pannello /suite. Nei figli usa read_source con il percorso relativo al progetto.
Le relazioni sono estratte per file: non dedurre impatto globale, risoluzione degli import o assenza di chiamanti da un risultato vuoto. Controlla la copertura e i limiti restituiti dal grafo per i linguaggi non analizzati.
Cita sorgenti e righe nelle conclusioni. Usa il grafo per restringere il contesto; leggi i sorgenti prima di affermare il comportamento.
