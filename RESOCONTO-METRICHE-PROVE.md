# Pi Suite 0.6.6 — Metriche osservabili nelle prove

Resoconto degli interventi del 28 e 29 ottobre 2026.

## Contratto del file di prova

Il Markdown consegnato alla chat impone un report JSON con `answer`, `notes`, `outcome` e `dimensions`. Le tre voci `tokens`, `performance` e `cost` e tutti i loro campi sono obbligatori per ogni caso e per A e B, indipendentemente dal valutatore. Non è ammesso ometterle né inviare `dimensions: {}`. Il campo `answer` conserva il contenuto e il formato richiesti dal compito, anche quando la risposta è solo un numero o un JSON come stringa.

Una misura richiede un valore numerico osservato, definizione, unità, metodo ed evidenza consultabile. Le note precisano ruoli e chiamate inclusi, tentativi, cache e reasoning, intervallo temporale e inclusione del confezionamento del report. I dati invisibili restano `unavailable` con `value: null` e un motivo; non si stimano. Il modello scaricato parte da token, durata e costo non disponibili.

Se sono visibili solo i token dell’orchestratore, la misura deve chiamarsi «Token del solo orchestratore» e dichiarare nelle note l’esclusione dei subagenti e l’indisponibilità del totale completo. Una misura parziale non dimostra il totale della prova. Il registro conserva una misura rappresentativa per dimensione; copertura ed esclusioni sono documentate nelle note.

## Importazione e scheda

Entrambi i campi di caricamento della risposta accettano soltanto report completi ed estraggono `answer` e `dimensions`, anche con BOM UTF-8 o con un unico blocco JSON in Markdown. Il JSON che rappresenta soltanto la risposta al compito e i file di testo sono rifiutati: il contenuto va inserito in `answer` nel modello. La validazione del server impedisce il salvataggio di report incompleti anche tramite API. I risultati storici restano leggibili e le revisioni usano il contratto completo.

L’anteprima delle 16 dimensioni mostra valori e provenienza insieme a metodo, evidenza e note. Le metriche valide sono salvate nel registro, riaperte nella scheda autonoma ed esportate insieme alle altre dimensioni. I dati mancanti non diventano zero. La provenienza predefinita del report è `chat_report`; l’importazione separata di telemetria normalizzata usa `harness_export`.

L’importazione rifiuta misure incomplete, valori non numerici e riferimenti a prove o casi incompatibili prima di applicarli al form. Integrare la stessa risposta conserva i punteggi già presenti. Importare una risposta diversa azzera nell’anteprima le dimensioni del precedente report, poi applica quelle nuove. Le revisioni salvano una scheda distinta; la scheda originale resta consultabile.

Inspect continua a valutare successo, correttezza e formato per i soli casi originali supportati, conservando le metriche operative caricate nelle altre dimensioni. Il tempo e l’uso del runner di valutazione non vengono attribuiti all’architettura testata.

## Verifica e limiti

Gli otto test `test_benchmark_metrics.py` coprono contratto esportato su tutti i 13 casi, rifiuto di campi obbligatori mancanti, stati espliciti per consumi non osservabili, zero misurato, misure parziali, unità e valori operativi, persistenza insieme ai punteggi deterministici e revisioni. `test_benchmark_metrics_ui.cjs` verifica nel browser entrambi i caricamenti, rifiuto dei report incompleti senza modificare l’anteprima, rifiuto via API, Markdown/BOM, conservazione esatta di `answer`, salvataggio, riapertura, integrazione delle dimensioni e layout mobile. I dati del collaudo sono simulati; non sono misure di un modello reale.

L’intervento implementa il contratto di richiesta e l’importazione/visualizzazione. Non aggiunge raccolta automatica della telemetria dei diversi harness. Per misure affidabili, l’harness deve esporle alla chat durante la prova o includerle in un export consultabile. Le evidenze caricate e la loro copertura restano da verificare: la validazione del formato non certifica la veridicità dei contatori dichiarati.

EvalPlus resta un riferimento metodologico. Il contratto è comune alle valutazioni attuali e a un eventuale adattatore futuro, che dovrà normalizzare gli esiti e tenere distinti i consumi della generazione da quelli del valutatore.

Per l’uso operativo vedi [Guida benchmark](GUIDA-BENCHMARK.md).

## Risposta testata e valutazione LLM separate · 29 ottobre 2026

Il report della chat testata ammette soltanto `tokens`, `performance` e `cost`, osservati oppure esplicitamente non disponibili. Il valutatore esterno riceve tre file scaricabili dalla scheda: test, risposta originale con le misure disponibili e istruzioni riservate con rubrica e modello `pi-judge-v1`.

Il secondo JSON contiene tutte e sole le dimensioni mancanti non riservate ai controlli deterministici del caso. ID di prova, esecuzione, versione, scheda sorgente e SHA-256 della risposta vincolano l’importazione. La validazione rifiuta sovrascritture di risposta o misure e richiede metodo, scala, evidenze e motivazione; le dimensioni senza evidenze restano non disponibili. La provenienza è `model_judge`.

L’anteprima non scrive nel registro. Il salvataggio crea una nuova scheda collegata alla sorgente, conserva risposta, consumi e controlli esistenti e registra il JSON del giudice nei metadati esportabili. Cambiare la risposta invalida le valutazioni precedenti.

I sette test `test_benchmark_judge.py` coprono i due contratti, i tre file, l’associazione alla risposta, il completamento senza sovrascritture, input errati, casi con e senza scorer e invalidazione delle revisioni. `test_benchmark_judge_ui.cjs` verifica download, caricamento JSON/Markdown, anteprima, salvataggio, conservazione delle misure, provenienza e riapertura su desktop e mobile. Il collaudo usa giudizi e contatori simulati, senza chiamare modelli esterni.

## Esportazione della prova per il valutatore esterno · 29 ottobre 2026

La CTA **Esporta prova per valutatore esterno** scarica un unico ZIP con una cartella contenente `01-prova.md`, `02-risposta.json` e `03-istruzioni-valutatore.md`. Le istruzioni includono il comando pronto da inviare al giudice, la rubrica e il modello JSON con gli identificativi e l’hash della risposta.

La CTA è disabilitata finché test, risposta salvata e criteri del valutatore non sono completi e coerenti; il motivo è visibile. Il server applica lo stesso controllo al momento del download. I test verificano struttura e contenuti dello ZIP, assenza di modifiche al registro, stati disabilitati e rifiuto delle esportazioni incomplete. Sono passati i nove test Python del giudice, gli undici delle metriche e il collaudo Chromium desktop/mobile. Le prove usano dati simulati.
