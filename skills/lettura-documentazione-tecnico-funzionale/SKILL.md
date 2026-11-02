---
name: lettura-documentazione-tecnico-funzionale
description: Consulta i documenti di documentazione tecnico funzionale selezionati nella chat, con ricerca deterministica e navigazione tramite i grafi selezionati.
---

Chiama read_documentation senza id per elencare i documenti effettivamente selezionati. Usa id per leggere pagine con numero di riga, query per trovare titoli o termini, offset e nextOffset per continuare. Per leggere il contesto di una corrispondenza torna alla lettura senza query usando offset uguale alla prima riga desiderata meno uno. Non caricare tutti i documenti nella chat.

Se è disponibile la skill graph-explorer, usa document_graph per individuare concetti e relazioni del documento; gli id delle evidenze permettono anche read_evidence e knowledge_trace. Se nessun grafo è selezionato usa direttamente read_documentation: la consultazione non richiede LLM aggiuntivi né rigenerazione.

Cita documento e righe; distingui la documentazione tecnico funzionale dalle evidenze originali e verifica il codice corrente prima di modificarlo. Un documento derivato e la fonte che riassume non sono conferme indipendenti. Dichiara le parti non lette e le eventuali versioni storiche.
