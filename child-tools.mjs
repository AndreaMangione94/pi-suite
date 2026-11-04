// Strumenti dei subagenti in un solo posto: suite-child.ts li registra con queste descrizioni e questi parametri,
// suite-delegation.ts ne ricava il perimetro consentito e delegation-core.mjs (scopedTools) li esegue nella cartella dell'incarico.
import { knowledgeSchemas } from './evidence-tools.mjs';
import { evidenceReportSchema } from './evidence-reading.mjs';

const string = () => ({ type: 'string' });
const boolean = () => ({ type: 'boolean' });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, ...(maximum === undefined ? {} : { maximum }) });
const tool = (description, properties, required = []) => ({
  description,
  parameters: { type: 'object', properties, required, additionalProperties: false }
});
const fromSchema = (description, schema) => tool(description, schema.properties, schema.required || []);

export const CHILD_TOOLS = {
  read_source: tool(
    'Leggi un file del progetto (percorso relativo). File grandi: 300 righe per volta, continua con startLine.',
    { path: string(), startLine: integer(1), startColumn: integer(0), lines: integer(1, 1000) },
    ['path']
  ),
  search_project: tool(
    'Cerca testo o regex nei file del progetto: restituisce percorso:riga: estratto. Usalo prima di aprire file.',
    {
      pattern: string(),
      glob: string(),
      directory: string(),
      literal: boolean(),
      caseSensitive: boolean(),
      maxResults: integer(1, 200),
      perFile: integer(1, 50)
    },
    ['pattern']
  ),
  list_sources: tool('Esplora una directory del progetto, vuota per la radice.', { directory: string() }),
  propose_file: tool(
    'Salva il contenuto completo di un file assegnato (usalo per file nuovi). Non modifica l’originale.',
    { path: string(), content: string() },
    ['path', 'content']
  ),
  propose_edit: tool(
    'Proponi sostituzioni puntuali (old→new) in un file assegnato; old deve comparire una sola volta.',
    {
      path: string(),
      edits: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          properties: { old: string(), new: string() },
          required: ['old', 'new'],
          additionalProperties: false
        }
      }
    },
    ['path', 'edits']
  ),
  graph_query: tool('Consulta il grafo locale dell’intero progetto; verifica i sorgenti correnti.', {
    query: string()
  }),
  read_skill: tool('Leggi una skill abilitata senza ampliare il perimetro.', { name: string() }, ['name']),
  read_documentation: tool(
    'Consulta i documenti di documentazione tecnico funzionale selezionati, con righe, ricerca e paginazione.',
    { id: string(), query: string(), offset: integer(0), limit: integer(1, 300) }
  ),
  connected_sources: tool('Elenca le fonti SharePoint/Azure collegate con date, snapshot ed esclusioni.', {
    query: string(),
    offset: integer(0)
  }),
  read_connected_source: tool(
    'Leggi evidenze collegate con citazioni e righe.',
    { source: string(), document: string(), startLine: integer(1), lines: integer(1, 300) },
    ['source', 'document']
  ),
  connected_graph: tool('Consulta il grafo AST degli snapshot Azure collegati.', { query: string(), source: string() }),
  document_graph: fromSchema(
    'Consulta il grafo documentale semantico finale fissato nel dossier, con concetti e relazioni inferite corredate da evidenze.',
    knowledgeSchemas.document_graph
  ),
  knowledge_search: fromSchema(
    'Cerca nelle fonti fissate: per documentazione tecnico funzionale parti dal grafo documentale; non aggiorna gli indici.',
    knowledgeSchemas.knowledge_search
  ),
  knowledge_trace: fromSchema(
    'Naviga relazioni e nodi vicini con evidenze e limiti; inferenze separate.',
    knowledgeSchemas.knowledge_trace
  ),
  read_evidence: fromSchema(
    'Leggi originali anche integralmente: full/section/passage, segui nextOffset e segnala parti non lette.',
    knowledgeSchemas.read_evidence
  ),
  report_evidence_reading: fromSchema(
    'Consegna sintesi, citazioni, parti non lette e dubbi; la copertura delle letture e calcolata dagli strumenti.',
    evidenceReportSchema
  ),
  propose_relation: fromSchema(
    'Proponi una relazione semantica non revisionata con evidenze, senza approvarla.',
    knowledgeSchemas.propose_relation
  )
};
export const CHILD_TOOL_NAMES = Object.keys(CHILD_TOOLS);
