// Testi dei prompt in prompts/*.md, modificabili senza toccare il codice; {{nome}} si sostituisce con i valori passati.
import fs from 'node:fs';

const cache = new Map();
export function prompt(name, values = {}) {
  if (!cache.has(name))
    cache.set(
      name,
      fs
        .readFileSync(new URL('./prompts/' + name + '.md', import.meta.url), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\n$/, '')
    );
  return cache.get(name).replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (!(key in values)) throw Error('Valore mancante nel prompt ' + name + ': ' + key);
    return String(values[key]);
  });
}
