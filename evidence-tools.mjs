import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPython } from './python-process.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const string = { type: 'string' },
  integer = { type: 'integer', minimum: 1 };
export const knowledgeSchemas = {
  document_graph: {
    properties: {
      query: string,
      nodes: { type: 'array', items: string, maxItems: 20 },
      depth: { type: 'integer', minimum: 0, maximum: 3 },
      limit: { ...integer, maximum: 60 }
    },
    required: []
  },
  knowledge_search: {
    properties: { query: string, source: string, limit: { ...integer, maximum: 40 } },
    required: ['query']
  },
  knowledge_trace: {
    properties: {
      nodes: { type: 'array', items: string, maxItems: 20, minItems: 1 },
      depth: { ...integer, maximum: 3 },
      limit: { ...integer, maximum: 40 },
      includeInferred: { type: 'boolean' }
    },
    required: ['nodes']
  },
  read_evidence: {
    properties: {
      source: string,
      snapshot: string,
      document: string,
      mode: { type: 'string', enum: ['passage', 'section', 'full'] },
      startLine: integer,
      lines: { ...integer, maximum: 1000 },
      offset: { type: 'integer', minimum: 0 },
      maxChars: { type: 'integer', minimum: 100, maximum: 200000 }
    },
    required: ['source', 'document']
  },
  propose_relation: {
    properties: {
      sourceNode: string,
      targetNode: string,
      relation: {
        type: 'string',
        enum: ['implements', 'supports', 'contradicts', 'depends_on', 'same_concept', 'describes']
      },
      reason: string,
      evidence: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: {
          type: 'object',
          properties: { source: string, document: string, startLine: integer, endLine: integer },
          required: ['source', 'document', 'startLine', 'endLine'],
          additionalProperties: false
        }
      }
    },
    required: ['sourceNode', 'targetNode', 'relation', 'reason', 'evidence']
  },
  prepare_documentation: {
    properties: { objective: string, sources: { type: 'array', items: string }, refresh: { type: 'boolean' } },
    required: ['objective']
  },
  register_documentation: { properties: {}, required: [] }
};
const descriptions = {
  document_graph:
    'Consulta il grafo documentale SEMANTICO finale salvato per il progetto e fissato nel dossier: concetti e relazioni esplicite o inferite dal modello con evidenze. Per scrivere documentazione tecnico funzionale parti da questo grafo, poi apri gli originali e confronta il grafo del codice. Non genera nuovi grafi.',
  knowledge_search:
    'Cerca testo, requisiti e simboli negli snapshot fissati. Per creare documentazione tecnico funzionale parti dal grafo documentale e apri gli originali; nelle normali consultazioni la ricerca e facoltativa. Non crea o aggiorna indici.',
  knowledge_trace:
    'Esplora nodi vicini e relazioni con evidenze; per documentazione tecnico funzionale esplora prima i collegamenti documentali. Vicinanza non prova significato o completezza. includeInferred mostra separatamente proposte semantiche con stato di revisione.',
  read_evidence:
    'Legge una fonte congelata verificandone integrita. mode full legge il contenuto completo disponibile, paginato se necessario: segui nextOffset. Dichiara sempre troncamenti e parti non lette.',
  propose_relation:
    'Salva una deduzione semantica con evidenze valide come proposta NON revisionata. Non modifica fonti, non certifica verita e non approva la propria proposta.',
  prepare_documentation:
    'SOLO per una richiesta esplicita di creare/aggiornare documentazione tecnico funzionale: sincronizza se refresh=true, verifica/aggiorna prima grafi e indici e prepara il dossier. Poi leggi i suoi originali e scrivi i documenti. Non chiamare per semplici domande.',
  register_documentation:
    'Completa il dossier prodotto: valida citazioni e integrità, registra il Markdown e genera tramite LLM il grafo semantico di DOCUMENTAZIONE-TECNICO-FUNZIONALE.md. Salva e seleziona automaticamente il grafo nel contesto. Non equivale ad approvazione umana.'
};

export async function invokeEvidence(action, args, bundle, options = {}) {
  const home = options.home || process.env.PI_SUITE_HOME || path.join(root, 'suite-data');
  const result = await runPython('suite_evidence_cli.py', [], {
    input: JSON.stringify({ action, args, bundle, home, workspace: options.workspace }),
    timeoutMs: ['prepare_documentation', 'register_documentation'].includes(action) ? 1800000 : 180000,
    timeoutMessage: 'Operazione evidenze scaduta',
    abortMessage: 'Consultazione interrotta',
    signal: options.signal,
    stderrTail: 4000
  });
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw Error(result.stderr || 'Risposta evidenze non valida');
  }
  if (result.code || value.error) throw Error(value.error || result.stderr || 'Operazione fallita');
  return value;
}

export function knowledgeTools(bundle, options = {}) {
  return Object.entries(knowledgeSchemas)
    .filter(([name]) => options.parent || !['prepare_documentation', 'register_documentation'].includes(name))
    .map(([name, schema]) => ({
      name,
      label: name,
      description: descriptions[name],
      parameters: { type: 'object', ...schema, additionalProperties: false },
      async execute(_id, args, signal) {
        const value = await invokeEvidence(name, args, bundle, { ...options, signal });
        return { content: [{ type: 'text', text: JSON.stringify(value) }], details: {} };
      }
    }));
}
