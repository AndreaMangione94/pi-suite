# Consolidamento delle evolutive del 4 novembre 2026

Il pannello resta configurabile durante i job (`f960975`). I job lunghi continuano a essere eseguiti uno alla volta.

## Correzioni

- Il salvataggio di una fonte restituisce la fonte interessata, con il suo ID e senza segreti. Generazione del grafo, aggiunta dal pannello e preparazione documentale usano quell'ID, senza ricavarlo dall'ultimo elemento di un elenco condiviso. `GET /api/sources` continua a restituire l'elenco; `POST /api/sources` restituisce la singola fonte salvata.
- I processi dedicati a `prepare_documentation` e `register_documentation` conservano sessione e contesto ereditati dalla chat, necessari per registrare i consumi dei grafi. I worker persistenti sostituiscono invece questi valori a ogni richiesta e cancellano quelli assenti, evitando contaminazioni fra sessioni.
- Guida, aiuto nel pannello e messaggio di errore SharePoint distinguono i permessi della risoluzione tramite `/shares` da quelli delle API di lettura per ID.

## Precisazioni al riepilogo precedente

- **Scritture concorrenti:** lock e fusione a tre vie proteggono le scritture e conservano modifiche compatibili. Non garantiscono di conservare ogni aggiornamento: nei conflitti sullo stesso valore e sulle liste semplici prevale la modifica del processo che salva. L'identità degli oggetti usati da un job va gestita separatamente, come nella correzione delle fonti.
- **Prestazioni:** la riduzione da circa 155 ms a circa 1 ms riguarda l'overhead locale delle consultazioni brevi con worker già avviato. Il test usa un corpus vuoto; non è una misura della latenza totale di ricerca su archivi reali.
- **Risultati progressivi dei subagenti:** Pi supporta aggiornamenti intermedi tramite `onUpdate`, già usato dalla suite. Consentire all'orchestratore di riprendere il ragionamento prima della conclusione dello strumento è un requisito distinto, che richiede una revisione dell'orchestrazione.
- **Benchmark separati:** possono essere organizzati anche in un pacchetto interno allo stesso repository. Un repository distinto o una distribuzione pubblica sono scelte possibili, non requisiti tecnici.

## Verifiche

I test di regressione riproducono l'aggiunta concorrente di una fonte durante la creazione del grafo, verificano l'ID usato dal pannello e attraversano il bridge Python reale per entrambe le operazioni documentali. Un ulteriore test verifica sostituzione e cancellazione dell'ambiente fra richieste dello stesso worker.

Verifiche eseguite sul workspace il 4 novembre 2026: `npm test` supera 26 gruppi su 26, inclusi chat con provider simulato e interfaccia desktop/mobile; `npm run format:check` supera i controlli Prettier e Ruff. Lo script di collaudo SharePoint è verificato anche offline con risoluzione e download simulati, controllando presenza dei file attesi e pulizia dei dati temporanei in caso di successo o errore.

Il [collaudo SharePoint reale](COLLAUDO-SHAREPOINT.md) è preparato con uno script manuale e un registro degli esiti. Resta da eseguire con link e token del tenant dell'utente; i test con Graph simulato non lo sostituiscono.
