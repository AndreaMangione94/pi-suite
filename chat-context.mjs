import { upgradeDocumentationContext } from './documentation-compat.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const externalSourcesInstructions = `PI SUITE — FONTI ESTERNE E OUTPUT
Il progetto selezionato è l'ambito delle modifiche richieste al progetto. Le fonti esterne alla sua cartella (documenti, Markdown, grafi, cartelle e repository collegati, originali remoti e snapshot) sono riferimenti in sola lettura. Selezionarle, leggerle o riceverne il percorso non autorizza a modificarle. Non sovrascrivere, cancellare, spostare o rinominare gli originali, né modificarli indirettamente tramite shell, script o altri strumenti.
Usa queste fonti per analisi, risposte, generazione di output richiesti dall'utente e come supporto alle modifiche del progetto. Una richiesta di correggere, adattare o aggiornare un documento esterno va soddisfatta creando una nuova copia rielaborata, mantenendo intatto l'originale. Salva i nuovi output nella cartella del progetto o nel dossier di output attivo; usa una destinazione esterna soltanto se indicata dall'utente e distinta dalle fonti originali. Senza progetto, usa la cartella della chat o il dossier di output attivo. Non trasformare la cartella di una fonte esterna nella cartella di lavoro o di consegna.
Un dossier aperto appositamente per produrre l'output è una destinazione di lavoro; gli altri dossier selezionati come riferimenti restano fonti in sola lettura. Gli aggiornamenti gestiti dalla suite a cache, indici e grafi derivati non autorizzano modifiche agli originali o agli artefatti esterni di riferimento. Trasmetti questa regola e la destinazione dell'output in ogni incarico ai subagenti; verifica le proposte prima di integrarle e distingui sempre fonte originale, nuova copia e file del progetto modificati.`;

// Il contesto indicato dal launcher è affidabile; un CONTESTO.json trovato nella cartella vale solo nei dossier e nelle sessioni dell'area dati.
export function suiteContextFile(file, home = process.env.PI_SUITE_HOME) {
  if (!home) return false;
  try {
    const real = fs.realpathSync(file),
      base = fs.realpathSync(home);
    if (!fs.statSync(real).isFile()) return false;
    return ['documentation', 'sessions'].some(folder => {
      const relative = path.relative(path.join(base, folder), real);
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    });
  } catch {
    return false;
  }
}
export function chatContext(project) {
  const file = process.env.PI_SUITE_CONTEXT || path.join(project, 'CONTESTO.json');
  if (!process.env.PI_SUITE_CONTEXT && !suiteContextFile(file)) return null;
  return fs.existsSync(file) ? upgradeDocumentationContext(JSON.parse(fs.readFileSync(file, 'utf8'))) : null;
}

export function contextTools(context) {
  const response = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], details: {} });
  return [
    {
      name: 'read_documentation',
      label: 'Consulta documentazione tecnico funzionale',
      description:
        'Elenca o leggi i documenti di documentazione tecnico funzionale selezionati nel contesto. Lettura deterministica con righe e paginazione; non genera documenti.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          query: { type: 'string' },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 300 }
        },
        additionalProperties: false
      },
      async execute(_id, args) {
        const documents = context?.documentation || [];
        if (!args.id) return response({ documents: documents.map(({ id, name, path }) => ({ id, name, path })) });
        const doc = documents.find(d => d.id === args.id);
        if (!doc) throw Error('Documento di documentazione tecnico funzionale non selezionato');
        if (fs.lstatSync(doc.path).isSymbolicLink() || fs.statSync(doc.path).size > 5000000)
          throw Error('Documento non consultabile');
        const lines = fs.readFileSync(doc.path, 'utf8').split('\n'),
          offset = Math.max(0, args.offset || 0),
          limit = Math.max(1, Math.min(300, args.limit || 100));
        const rows = lines
          .map((text, i) => ({ line: i + 1, text }))
          .filter(row => !args.query || row.text.toLowerCase().includes(args.query.toLowerCase()));
        return response({
          id: doc.id,
          path: doc.path,
          rows: rows.slice(offset, offset + limit),
          totalLines: lines.length,
          nextOffset: offset + limit < rows.length ? offset + limit : null
        });
      }
    }
  ];
}
