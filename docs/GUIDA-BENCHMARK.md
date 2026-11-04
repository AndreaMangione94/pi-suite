# Prove, risultati e valutazioni esterne

Guida aggiornata al 30 ottobre 2026.

Il laboratorio registra configurazioni, prove e risultati. Una prova è un compito indipendente, esportato come file scaricabile e utilizzabile con tutte le configurazioni desiderate. I dati della configurazione descrivono ciò che viene testato; non modificano l’harness. Il confronto fra configurazioni è un’azione separata.

## Flusso sui file

1. **Crea la prova** con nome e compito. Inserisci nelle istruzioni tutti i dati necessari. **Genera file della prova** scarica un Markdown completo di protocollo, compito e modello del risultato. Il salvataggio nel catalogo è facoltativo.
2. **Passa quel solo file alla chat** della configurazione da testare. Il documento contiene l’intera richiesta. Chiede al modello di eseguire il compito e restituire esclusivamente un file JSON scaricabile con risposta, note e metriche operative, senza testo aggiuntivo o blocchi JSON in chat.
3. Nel **dettaglio della configurazione**, seleziona la prova e premi **Carica risultati**. Si apre soltanto il selettore di un file `.json`: carica il file della chat così com’è. Non si apre una form e non occorre compilare o salvare manualmente campi del risultato.
4. Il laboratorio valida struttura e associazione alla prova, conserva integralmente il file originale e applica i controlli deterministici disponibili. I risultati delle 16 dimensioni si aggiornano automaticamente.
5. Premi **Scarica richiesta valutazione**. Scarichi un unico Markdown contenente materiale della prova, file originale della risposta integrale, controlli e istruzioni per il secondo LLM, con il modello JSON delle sole dimensioni ancora da valutare. La CTA è disabilitata prima del caricamento del file della risposta.
6. **Passa quel solo documento al LLM valutatore**. Deve produrre esclusivamente un file JSON scaricabile con i giudizi mancanti e i riferimenti al risultato originale. Il JSON del valutatore non contiene la risposta, token, durata, costo o voti deterministici da riscrivere.
7. Nella stessa configurazione premi **Carica valutazione esterna** e seleziona quel JSON senza modificarlo. Il laboratorio verifica gli identificativi e l’hash della risposta e integra i giudizi in una nuova scheda. Risposta e metriche precedenti restano conservate.

Le due CTA di caricamento hanno ruoli distinti: il file della prima chat va in **Carica risultati**, il file dei giudizi va in **Carica valutazione esterna**. Non sono richieste form di valutazione, copie manuali o conversioni di formato.

## Pagine di configurazione e prova

Nel dettaglio della **configurazione** sono presenti il selettore della prova e le CTA **Carica risultati**, **Scarica richiesta valutazione** e **Carica valutazione esterna**. Cambiando prova, o cambiando esecuzione/revisione nel selettore dei risultati, cambiano i valori visualizzati e il risultato usato per la richiesta di valutazione. Il risultato più recente è inizialmente selezionato. **Vai al dettaglio della prova** è un link alla prova corrente.

Nel dettaglio della **prova** è presente **Scarica prova**, che scarica il file iniziale senza risposta. Non sono presenti CTA di caricamento. Il selettore delle configurazioni contiene soltanto quelle con almeno un risultato caricato per quella stessa prova e versione. Senza risultati il selettore resta vuoto e il download della prova è comunque disponibile. **Vai al dettaglio della configurazione** porta alla configurazione selezionata.

Entrambe le pagine hanno **Indietro**, che ritorna alla URL di provenienza conservando la selezione, anche dopo un ricaricamento o l’apertura del link in una nuova scheda. Le CTA sono allineate al selettore su desktop; sugli schermi piccoli si dispongono sotto di esso.

## Creare e conservare una prova

Sono obbligatori solo **Nome della prova** e **Compito e istruzioni per la chat**. Il compito contiene istruzioni, vincoli, formato atteso della risposta e dati necessari. I casi originali del catalogo possono conservare un contesto separato, che viene comunque incluso nel file. Le operazioni esterne, come aprire una chat o abilitarle strumenti, restano a carico dell’operatore.

**Categoria** è facoltativa: puoi scegliere una voce esistente o aggiungerne una nuova. Serve a classificare il caso e non seleziona un valutatore. Senza scelta viene usata Generale.

**Salva anche nel catalogo** è facoltativo e inizialmente deselezionato. Generare nuovamente con gli stessi campi nella stessa pagina riscarica lo stesso file senza duplicati. **Usa questa prova su una configurazione** porta alla configurazione scelta, dove puoi caricare il risultato senza creare un confronto. Al caricamento viene conservato il materiale della prova anche se non era stato aggiunto al catalogo.

Codice e ID sono generati dal nome. Nel catalogo viene aggiunto un suffisso numerico se il codice è già utilizzato; i file generati senza catalogo hanno un suffisso univoco. La versione è calcolata dal contenuto. Un caso salvato o un risultato esistente non vengono sovrascritti dalle nuove prove.

## File della prima chat

Il modello richiesto è un JSON UTF-8 di tipo `pi-result-v1`, con `caseId`, `caseVersion`, `answer`, `notes`, `outcome`, `dimensions` e gli altri metadati previsti dal modello. `answer` contiene la risposta effettiva al compito come stringa, anche quando è a sua volta un numero, JSON o codice. Se il compito fallisce, il modello deve comunque generare il file completo e descrivere il fallimento nelle note.

`dimensions` contiene obbligatoriamente `tokens`, `performance` e `cost`, ciascuna con `status`, `value`, `origin`, `measure`, `unit`, `method`, `evidence` e `note`. Queste misure vanno riportate solo se osservate nella chat o nell’harness. In caso contrario si usa `unavailable`, `value: null` e un motivo, senza stimarle. I token sono interi non negativi con unità token, la durata è in secondi con unità s e il costo richiede valuta. Va specificata la copertura dei contatori, incluse eventuali esclusioni di subagenti, cache o ragionamento.

Il modello testato non assegna voti alla propria qualità. Il suo esito resta `not_evaluated`, oppure `failed` per un fallimento operativo documentato. Il laboratorio rifiuta testi liberi, blocchi Markdown, JSON incompleti, chiavi duplicate e file riferiti a un’altra prova o versione. Il file originale viene conservato con bytes e SHA-256, senza riscriverlo.

## Controlli deterministici e LLM esterno

I controlli dell’adattatore in `suite_inspect.py` sono disponibili per le versioni originali di **Calcolo (`math-001`)** ed **Estrazione JSON (`extract-001`)**. Il caricamento del file applica direttamente gli stessi controlli locali a successo, correttezza e formato, senza dipendere dall’installazione di Inspect e senza chiamate a modelli. Se il formato impedisce di interpretare la risposta, la correttezza resta non disponibile e il fallimento di formato rimane esplicito.

Per le altre prove non viene inventata una verifica deterministica: le dimensioni di qualità non ancora misurate passano al valutatore esterno. Le tre metriche operative restano sempre escluse dal giudice perché richiedono dati osservati nell’esecuzione testata.

La richiesta al secondo LLM contiene il file originale integrale, i riferimenti al risultato e il modello `pi-judge-v1`. Il file di uscita contiene `sourceRunId`, `trialId`, `architectureId`, `caseVersion`, `answerSha256`, `evaluator`, `notes` e soltanto le `dimensions` richieste. Il modello del giudice fissa misura, unità e metodo; il LLM compila valori, evidenze e motivazioni, senza aggiungere o sostituire altre dimensioni.

Le quote usano scala 0–1 (1 migliore), il successo usa 0/1 e le allucinazioni un conteggio intero non negativo (0 migliore). Se una dimensione non è verificabile si usa unavailable con un motivo; se non è pertinente si usa not_applicable con motivo. Il giudice valuta liberamente rispetto al compito e al contesto, senza una soluzione attesa compilata dall’utente. Non viene prodotto un punteggio complessivo.

Robustezza, strumenti, deleghe, riproducibilità e fedeltà dei token richiedono tracce o evidenze adeguate. Una sola risposta non dimostra tali proprietà e il giudice non deve inventarle. Il laboratorio valida il formato e i riferimenti del giudizio; la fondatezza della valutazione resta da verificare.

Inspect AI completo resta opzionale per la consultazione dei percorsi e dei log storici. I relativi artefatti preesistenti rimangono consultabili; i tempi e i consumi del valutatore non vengono attribuiti alla configurazione testata.

## Confronto fra N configurazioni

Dal dettaglio della prova premi **Confronta configurazioni**. Seleziona almeno due configurazioni con risultati e una precisa esecuzione per ciascuna. La matrice mostra le 16 dimensioni con una colonna per configurazione. Una riga è confrontabile quando misura, unità e metodo coincidono e i valori sono disponibili. La tabella si scorre orizzontalmente quando necessario.

**Salva confronto** conserva le esecuzioni selezionate, anche se successivamente carichi altri risultati. I confronti salvati si riaprono dal dettaglio della prova. Le modifiche alle configurazioni non cambiano gli snapshot dei risultati precedenti e i dati storici del vecchio flusso A/B rimangono consultabili.

## Dati e limiti

I record e i file originali sono conservati in `benchmarks.sqlite` nella cartella dati di Pi Suite. I file del valutatore sono conservati separatamente con il loro hash. I log Inspect storici sono in `benchmark-evaluations/`; per un backup conserva database e cartella delle valutazioni.

Il file della prima chat può occupare al massimo 900 KB; il file del valutatore è soggetto al limite tecnico di 1,5 MB. `answer` ha un limite di 150.000 caratteri. Sono ammessi al massimo 10 allegati, per 400 KB complessivi. I file caricati sono dati JSON e non vengono eseguiti.

Il catalogo include 13 esempi originali e 8 fonti metodologiche primarie. La pagina Fonti ne mostra uso e limiti. I dataset di terzi non sono redistribuiti e i risultati locali non sono punteggi ufficiali dei benchmark pubblici.
