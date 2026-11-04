# Prompt della suite

Testi inviati ai modelli, separati dal codice: `prompts.mjs` (JavaScript e TypeScript) e `suite_prompts.py` (Python)
li leggono da qui. `{{nome}}` viene sostituito con il valore passato dal codice; un valore mancante è un errore.

Modificare un file cambia il testo che il modello riceve dal successivo avvio della chat o del pannello. Le sezioni del
prompt di sistema sono confrontate fra un turno e l'altro: cambiare spesso un testo riduce il riuso della cache del
provider. Il file finale va a capo una sola volta; il caricatore lo toglie.
