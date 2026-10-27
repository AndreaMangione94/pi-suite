# Componenti di terze parti

La licenza MIT in LICENSE riguarda il codice della suite. Le dipendenze mantengono le rispettive licenze e i relativi avvisi, inclusi nei pacchetti installati tramite npm e pip. Il distributable contiene sorgenti e lockfile, senza includere node_modules o l'ambiente Python.

- Pi coding agent e relativi componenti: vedere i file LICENSE dei pacchetti `@earendil-works/*` installati.
- pi-subagents: vedere il pacchetto installato e i relativi avvisi.
- YAML: pacchetto `yaml` 2.8.3, licenza ISC; il relativo copyright e la licenza sono inclusi nel pacchetto npm.
- Graphify, tree-sitter e le altre dipendenze Python: vedere i pacchetti e i metadati delle versioni fissate in requirements-ast.txt.
- Inspect AI opzionale: versione fissata in requirements-inspect.txt, licenza MIT; installato separatamente con le relative dipendenze e avvisi, senza includere l'ambiente nel distributable. Il catalogo benchmark riporta riferimenti metodologici; non redistribuisce i dataset di terzi.

I pesi dei modelli non sono distribuiti con Pi Suite. Chi sceglie un modello o un servizio deve predisporlo separatamente secondo le sue condizioni. L'uso locale della suite non richiede un account Pi Suite.
