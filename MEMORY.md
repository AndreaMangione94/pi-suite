# Pi Suite 0.6.5 — Contesto della chat e consegne dei subagenti

Documentazione della distribuzione Windows del 27 ottobre 2026.

L’orchestratore mantiene il contesto della conversazione nella sessione Pi.
Ogni figlio parte da un contesto fresco: il genitore deve includere nell’incarico
obiettivo, decisioni, fonti, limiti e criteri di completamento necessari.

Connessioni, modelli, profili e skill della nuova chat sono fissati in `data/sessions/<id>/`. Per usare modifiche salvate dal pannello apri una nuova chat. Se il profilo Subagenti è vuoto, il genitore lavora direttamente; se è selezionato, deve ricevere almeno una consegna da un figlio per richiesta.

**Apri chat Pi** funziona anche senza progetto. Ogni apertura crea una cartella vuota distinta in `data/chats/<id>/` e una nuova sessione con le configurazioni salvate. `PI_SUITE_CLEAN_WORKSPACE` identifica questa cartella: non vengono caricati automaticamente istruzioni ereditate, fonti o grafi dei progetti, nemmeno nelle deleghe. La selezione di un progetto o l’apertura di un dossier mantiene il suo contesto e rimuove questo indicatore dall’ambiente di avvio.

## Artefatti delle deleghe

```text
data/delegations/<batch>/batch.json         piano e stato delle deleghe
data/delegations/<batch>/<n>/INCARICO.md    istruzioni assegnate al figlio
data/delegations/<batch>/<n>/result.json    consegna ed esito del figlio
data/delegations/<batch>/<n>/proposals/     file proposti
```

In **Attività e risultati** puoi consultare incarichi e consegne. I figli leggono
il progetto e le fonti collegate, ma propongono file soltanto nei percorsi
assegnati. Il genitore controlla le evidenze, integra le proposte pertinenti ed
esegue le verifiche. Una consegna non prova che i file siano già stati applicati
o che i test siano passati.

## Regole e continuità

La suite include nell’incarico le regole AGENTS.md del progetto e quelle delle
sottocartelle pertinenti ai file assegnati, con il loro ambito. La copia riflette
il momento della delega. Le regole non ampliano i permessi degli strumenti.

Lo storico su disco resta consultabile, ma non viene caricato automaticamente
nelle richieste successive. Per proseguire un’attività il genitore trasmette
decisioni, risultati verificati e punti aperti nell’incarico successivo.

## Fonti e documentazione

I riferimenti **As-is** del progetto conservano separatamente fonti, grafi, obiettivo e cartella del dossier in `data/settings.json`. La chat usa le fonti salvate, mentre i pulsanti AS-IS del pannello usano i grafi selezionati. Nella chat il corpus si fissa alla prima consultazione; `/sources-refresh` seleziona gli snapshot correnti senza sincronizzare.

I dossier AS-IS in `data/documentation/<id>/` fissano le versioni delle fonti in FONTI.json. I dossier creati dal pannello includono anche PROGETTO.json per l’associazione al progetto e ai grafi. I Markdown salvati sono visibili nella modale del progetto anche prima della registrazione; per renderli ricercabili dagli agenti usa `register_asis` o `/asis-register` dopo la verifica. I grafi e la
ricerca testuale aiutano a trovare le evidenze; le affermazioni vanno verificate
sugli originali e accompagnate da citazioni. Un dossier registrato resta
consultabile senza rigenerarlo: controlla la freschezza delle sue fonti prima
di riutilizzarlo come descrizione dello stato corrente.
