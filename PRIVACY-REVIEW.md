# Controllo dei file destinati al repository

Data del controllo: 27 ottobre 2026. Versione applicativa: 0.6.5.

La selezione comprende sorgenti applicativi, interfaccia, installer e launcher,
skill distribuite, documentazione operativa, test senza risultati salvati,
esempi dimostrativi, licenza e dipendenze con lockfile.

Aggiornamento del 29 ottobre 2026: gli script di test e di controllo della
pubblicazione sono stati rimossi dal repository e conservati localmente.
Le esclusioni in `.gitignore` ne impediscono l'aggiunta accidentale.

La ricerca di credenziali, token noti, chiavi private, JWT, email, identificativi
italiani, URL con credenziali, percorsi utente e riferimenti a servizi interni
non ha individuato segreti reali o dati personali nei file selezionati.
Sono stati esaminati anche gli host degli URL e le stringhe opache nei sorgenti.

I riferimenti a localhost, `api.example.com`, a un utente generico e a
`dev.azure.com/organizzazione/progetto` sono esempi. Le intestazioni
`Authorization` e `api-key` sono nomi di protocollo. URL dei registri pubblici,
fonti bibliografiche e metadati dei manutentori delle dipendenze sono pubblici.

Sono esclusi backup e file di lavorazione, risultati e screenshot dei test,
cache Python, ambienti e dipendenze installate, configurazioni reali,
credenziali anche cifrate, dati dei progetti, sessioni, snapshot e dossier.
I file locali esclusi possono contenere percorsi personali e restano sul PC.
Gli ZIP e le copie duplicate delle guide non servono all'installazione dal
clone e non sono inclusi. Lo storico Git viene creato solo dopo la selezione.

I controlli euristici della pubblicazione restano negli strumenti locali di
sviluppo e non sostituiscono la revisione di nuovi documenti o dati futuri.
