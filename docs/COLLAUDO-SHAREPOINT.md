# Collaudo SharePoint su tenant reale

Stato al 4 novembre 2026: **preparato, non eseguito**. I test automatici usano Graph simulato. Per eseguire questa prova servono un link e un access token del tenant dell'utente; la suite non può generarli autonomamente.

## Preparazione

1. Predisponi una piccola cartella di prova, con contenuti non riservati: `prova.txt` e `sottocartella/prova.txt`, entrambi con testo riconoscibile. La preparazione dei file remoti è manuale.
2. Procurati un token Microsoft Graph valido con accesso alla cartella. Per la risoluzione del link con `/shares`, i permessi minimi documentati sono `Files.ReadWrite` delegato o `Files.ReadWrite.All` applicativo. Verifica con chi amministra il tenant i consensi applicabili. Vedi [permessi e limiti](GUIDA-FONTI-DOCUMENTAZIONE-TECNICO-FUNZIONALE.md).
3. Prepara sia il link di condivisione sia quello copiato dal browser. Usa l'ambiente Python del repository, con `requirements-ast.txt` già installato.

## Prova manuale ripetibile

Dalla radice del repository:

```powershell
.venv\Scripts\python.exe scripts\check_sharepoint.py --expect-file prova.txt --expect-file sottocartella/prova.txt
```

Lo script chiede link e token nel terminale; il token usa input nascosto, non viene passato come argomento della shell. Esegue le funzioni reali della suite: risoluzione del link, salvataggio temporaneo con DPAPI, acquisizione ricorsiva e verifica dei percorsi attesi. Non chiama modelli e non modifica i documenti remoti. L'area temporanea è sotto `tests/tmp`, distinta dai dati dell'app e rimossa all'uscita normale o in caso di errore gestito. Un arresto forzato del processo può lasciarla sul disco.

Ripeti la prova con il link di condivisione e con il link del browser. Verificare la sola risoluzione non basta: l'header `redeemSharingLinkIfNecessary` garantisce l'accesso solo per la richiesta `/shares`, mentre l'acquisizione successiva usa gli ID.

## Prova nel pannello

1. Aggiungi la stessa fonte da **Documentazione tecnico funzionale → Aggiungi**, senza ID manuali, e verifica che venga selezionata la fonte corretta.
2. Verifica gli errori di salvataggio con un token scaduto/non valido, un link a un file anziché a una cartella e, se disponibile, un account privo di accesso. Non cambiare i permessi del tenant solo per provocare l'errore.
3. Per la variante con ID manuali, verifica l'acquisizione: il salvataggio da solo non effettua una richiesta Graph.

Lo script copre acquisizione e presenza dei file, non qualità semantica, fedeltà di tutti i formati o generazione con un modello. Per la paginazione serve un'ulteriore cartella di prova abbastanza grande da produrre `@odata.nextLink`; il caso resta coperto automaticamente solo con Graph simulato finché non viene eseguita questa verifica reale.

## Registro dell'esito

Annota data, tipo di link, tipo di token (delegato/applicativo), permessi, esito della risoluzione, presenza dei due file e eventuale codice HTTP. Non includere token, link di condivisione, URL temporanei o contenuti dei documenti nel registro.

| Prova | Esito |
| --- | --- |
| Link di condivisione: risoluzione e acquisizione | Da eseguire |
| Link browser: risoluzione e acquisizione | Da eseguire |
| Aggiunta e selezione nel pannello | Da eseguire |
| Token non valido/scaduto e link a file | Da eseguire |
| Account senza accesso | Da eseguire, se disponibile |
| Pagina successiva Graph | Da eseguire su cartella adatta |
