import { isTechnicalFunctionalDocumentation } from './documentation-compat.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const text = { type: 'string', minLength: 1, maxLength: 16000 };
const id = { type: 'string', pattern: '^[a-f0-9]{32}$' },
  documentId = { type: 'string', pattern: '^[a-f0-9]{20}$' };
const initialDocument = {
  type: 'object',
  additionalProperties: false,
  properties: { source: id, document: documentId, snapshot: id },
  required: ['source', 'document']
};
export const evidenceScopeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    focus: text,
    questions: { type: 'array', items: text, minItems: 1, maxItems: 12 },
    sourceIds: { type: 'array', items: id, maxItems: 100 },
    documents: { type: 'array', items: initialDocument, maxItems: 200 },
    graphNodes: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 200 }, maxItems: 40 },
    limits: text,
    expectedOutput: text
  },
  required: ['focus', 'questions', 'limits', 'expectedOutput']
};
// Schema volutamente permissivo: gli errori dei riferimenti diventano avvisi nel resoconto, non tentativi ripetuti.
const loose = { type: 'string' },
  citation = {
    type: 'object',
    properties: {
      source: loose,
      snapshot: loose,
      document: loose,
      startLine: { type: 'integer' },
      endLine: { type: 'integer' }
    },
    required: ['source', 'document', 'startLine', 'endLine']
  };
export const evidenceReportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: text,
    citations: { type: 'array', items: citation, maxItems: 100 },
    unreadDocuments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { source: loose, snapshot: loose, document: loose, reason: loose },
        required: ['source', 'document']
      },
      maxItems: 200
    },
    uncertainties: { type: 'array', items: loose, maxItems: 30 },
    scopeExpansionRequests: { type: 'array', items: loose, maxItems: 30 }
  },
  required: ['summary']
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const chars = value => {
  let count = 0;
  for (const _char of value) count++;
  return count;
};
const key = ref => [ref.source, ref.snapshot, ref.document].join(':');

function field(value, label, max = 16000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw Error('Perimetro evidenze non valido: ' + label);
  return value.trim();
}
function array(value, label, max) {
  if (!Array.isArray(value) || value.length > max) throw Error('Elenco evidenze non valido: ' + label);
  return value;
}
function resolveDocument(bundle, value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !/^[a-f0-9]{32}$/.test(value.source) ||
    !/^[a-f0-9]{20}$/.test(value.document) ||
    (value.snapshot !== undefined && !/^[a-f0-9]{32}$/.test(value.snapshot))
  )
    throw Error('Riferimento documentale non valido');
  const matches = bundle.flatMap(ref =>
    ref.source === value.source && (!value.snapshot || ref.snapshot === value.snapshot)
      ? (ref.manifest?.documents || []).filter(doc => doc.id === value.document).map(doc => ({ ref, doc }))
      : []
  );
  if (matches.length !== 1)
    throw Error(
      matches.length
        ? 'Specifica uno snapshot univoco per il documento.'
        : 'Documento o snapshot fuori dal corpus fissato.'
    );
  return matches[0];
}

export function normalizeEvidenceScope(task, bundle = []) {
  const explicit = task.evidenceScope;
  if (explicit === undefined && !bundle.length) return null;
  if (explicit !== undefined && (!explicit || typeof explicit !== 'object' || Array.isArray(explicit)))
    throw Error('evidenceScope deve essere un oggetto');
  const raw = explicit || {
    focus: task.objective,
    questions: [task.objective],
    limits: task.constraints,
    expectedOutput: task.deliverable
  };
  const permitted = new Set(Object.keys(evidenceScopeSchema.properties));
  if (Object.keys(raw).some(name => !permitted.has(name))) throw Error('Campo evidenceScope sconosciuto');
  const focus = field(raw.focus, 'focus'),
    limits = field(raw.limits, 'limits'),
    expectedOutput = field(raw.expectedOutput, 'expectedOutput');
  const questions = [...new Set(array(raw.questions, 'questions', 12).map(q => field(q, 'questions')))];
  if (!questions.length) throw Error('Specifica almeno una domanda per l’analisi delle evidenze');
  const initialDocuments = array(raw.documents || [], 'documents', 200).map(value => {
    const { ref, doc } = resolveDocument(bundle, value);
    return {
      source: ref.source,
      snapshot: ref.snapshot,
      indexVersion: ref.indexVersion,
      document: doc.id,
      path: doc.path,
      textSha256: doc.textSha256
    };
  });
  const sourceIds = [
    ...new Set(
      raw.sourceIds === undefined
        ? initialDocuments.length
          ? initialDocuments.map(d => d.source)
          : bundle.filter(r => !isTechnicalFunctionalDocumentation(r.manifest)).map(r => r.source)
        : array(raw.sourceIds, 'sourceIds', 100)
    )
  ];
  for (const source of sourceIds)
    if (typeof source !== 'string' || !/^[a-f0-9]{32}$/.test(source) || !bundle.some(ref => ref.source === source))
      throw Error('Fonte iniziale fuori dal corpus fissato');
  if (initialDocuments.some(doc => !sourceIds.includes(doc.source)))
    throw Error('I documenti iniziali devono appartenere alle fonti iniziali indicate');
  const graphNodes = [...new Set(array(raw.graphNodes || [], 'graphNodes', 40).map(n => field(n, 'graphNodes', 200)))];
  return {
    version: 1,
    type: 'operational',
    origin: explicit ? 'explicit' : 'assignment',
    focus,
    questions,
    limits,
    expectedOutput,
    graphNodes,
    sources: bundle
      .filter(ref => sourceIds.includes(ref.source))
      .map(ref => ({
        source: ref.source,
        snapshot: ref.snapshot,
        indexVersion: ref.indexVersion,
        name: ref.name,
        documentGraph: ref.documentGraph,
        documentCount: ref.manifest?.documents?.length || 0
      })),
    initialDocuments: [...new Map(initialDocuments.map(doc => [key(doc), doc])).values()],
    readingModes: ['full', 'section', 'passage'],
    choice: 'subagent',
    exploration: 'pinned_corpus'
  };
}

export function evidenceScopeMarkdown(scope) {
  if (!scope) return '';
  const sources =
    scope.sources
      .map(
        ref =>
          '- ' +
          (ref.name || ref.source) +
          ' — source ' +
          ref.source +
          '; snapshot ' +
          ref.snapshot +
          (ref.indexVersion ? '; indice ' + ref.indexVersion : '')
      )
      .join('\n') || '- Nessuna fonte collegata: dichiara le evidenze mancanti.';
  const documents =
    scope.initialDocuments
      .map(doc => '- ' + doc.path + ' [' + doc.source + ':' + doc.document + '] — snapshot ' + doc.snapshot)
      .join('\n') || '- Individua i documenti pertinenti nel corpus fissato.';
  return (
    '\n\n## Perimetro dell’analisi delle evidenze\n' +
    scope.focus +
    '\n\nDomande da risolvere:\n' +
    scope.questions.map(q => '- ' + q).join('\n') +
    '\n\nFonti e versioni iniziali:\n' +
    sources +
    '\n\nDocumenti iniziali:\n' +
    documents +
    (scope.graphNodes.length ? '\n\nNodi del grafo iniziali: ' + scope.graphNodes.join(', ') : '') +
    '\n\nLimiti dell’analisi:\n' +
    scope.limits +
    '\n\nConsegna sulle evidenze:\n' +
    scope.expectedOutput +
    '\n\nScegli autonomamente read_evidence in mode full, section o passage secondo le domande e il contesto necessario. Se nextOffset non è null e devi completare la lettura, continua con offset=nextOffset mantenendo fonte, snapshot, documento, modalità e intervallo. nextOffset conta caratteri nel testo selezionato, non pagine PDF. Un primo blocco non equivale alla lettura integrale. Per sezioni non riconosciute usa i passaggi o il testo completo. Rispetta le note di copertura e i troncamenti.\nLe fonti e i documenti iniziali orientano il lavoro: puoi esplorare il corpus già fissato per verificare il contesto. Mantieni l’obiettivo assegnato e segnala necessità di ampliarlo.\nPrima della consegna chiama report_evidence_reading con sintesi, citazioni, documenti iniziali non letti e motivi, dubbi e richieste di ampliamento. La copertura effettiva delle letture viene calcolata dagli strumenti. Non presentare il testo estratto completo come copertura integrale di immagini, note o pagine escluse dell’originale.\n'
  );
}

function statePath(directory) {
  return path.join(directory, 'evidence-reading.json');
}
function loadState(directory, contract) {
  const scopeHash = hash(JSON.stringify(contract.evidenceScope || null)),
    file = statePath(directory);
  const state = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { version: 1, scopeHash, reads: [], declaration: null };
  if (state.version !== 1 || state.scopeHash !== scopeHash)
    throw Error('Il registro letture non corrisponde al perimetro dell’incarico');
  return state;
}
function saveState(directory, state) {
  const file = statePath(directory),
    temporary = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
  fs.renameSync(temporary, file);
}
export function recordEvidenceRead(directory, contract, tool, result) {
  const { ref, doc } = resolveDocument(contract.connectedSources || [], result);
  if (result.textSha256 !== doc.textSha256) throw Error('Hash della lettura diverso dallo snapshot fissato');
  const state = loadState(directory, contract);
  if (state.reads.length >= 10000) throw Error('Registro letture oltre il limite per incarico');
  const properties = [
    'source',
    'snapshot',
    'document',
    'path',
    'mode',
    'startLine',
    'endLine',
    'offset',
    'nextOffset',
    'totalRangeChars',
    'rangeStartOffset',
    'returnedChars',
    'documentTotalChars',
    'documentTotalLines',
    'completeRequestedRange',
    'textSha256',
    'extractionTruncated',
    'coverageNotes',
    'citation'
  ];
  const read = {
    tool,
    ...Object.fromEntries(properties.filter(k => result[k] !== undefined).map(k => [k, result[k]]))
  };
  read.source = ref.source;
  read.snapshot = ref.snapshot;
  read.returnedChars ??= chars(result.text || '');
  read.offset ??= 0;
  read.rangeStartOffset ??= 0;
  state.reads.push(read);
  state.updatedAt = new Date().toISOString();
  // A declaration describes the reads available at submission time.
  if (state.declaration) state.declarationStale = true;
  saveState(directory, state);
}

function intervals(values) {
  const merged = [];
  for (const [start, end] of values
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
const covers = (values, start, end) => values.some(([a, b]) => a <= start && b >= end);
function documentsCoverage(state) {
  const grouped = new Map();
  for (const read of state.reads) {
    const id = key(read);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(read);
  }
  return [...grouped.values()].map(reads => {
    const first = reads[0],
      ranges = new Map(),
      absolute = [];
    for (const read of reads) {
      absolute.push([read.rangeStartOffset + read.offset, read.rangeStartOffset + read.offset + read.returnedChars]);
      const id = [read.mode, read.startLine, read.endLine, read.rangeStartOffset, read.totalRangeChars].join(':');
      if (!ranges.has(id))
        ranges.set(id, {
          mode: read.mode,
          startLine: read.startLine,
          endLine: read.endLine,
          totalChars: read.totalRangeChars,
          offsets: []
        });
      ranges.get(id).offsets.push([read.offset, read.offset + read.returnedChars]);
    }
    const selections = [...ranges.values()].map(range => ({
      ...range,
      offsets: intervals(range.offsets),
      complete: typeof range.totalChars === 'number' && covers(intervals(range.offsets), 0, range.totalChars)
    }));
    const lines = intervals(selections.filter(r => r.complete).map(r => [r.startLine, r.endLine + 1]));
    const charIntervals = intervals(absolute),
      totalChars = reads.find(r => typeof r.documentTotalChars === 'number')?.documentTotalChars,
      totalLines = reads.find(r => typeof r.documentTotalLines === 'number')?.documentTotalLines;
    return {
      source: first.source,
      snapshot: first.snapshot,
      document: first.document,
      path: first.path,
      textSha256: first.textSha256,
      reads: reads.length,
      modes: [...new Set(reads.map(r => r.mode))],
      documentTotalChars: totalChars,
      documentTotalLines: totalLines,
      availableTextFullyRead:
        (typeof totalChars === 'number' && covers(charIntervals, 0, totalChars)) ||
        (typeof totalLines === 'number' && covers(lines, 1, totalLines + 1)),
      readCharacters: charIntervals.reduce((sum, [a, b]) => sum + b - a, 0),
      characterIntervals: charIntervals,
      completeLineIntervals: lines,
      selections,
      extractionTruncated: reads.some(r => r.extractionTruncated),
      coverageNotes: [...new Set(reads.flatMap(r => r.coverageNotes || []))]
    };
  });
}
export function evidenceReadingSummary(directory, contract) {
  const state = loadState(directory, contract),
    documents = documentsCoverage(state),
    initial = contract.evidenceScope?.initialDocuments || [];
  const unread = initial.filter(doc => !documents.some(read => key(read) === key(doc)));
  return {
    path: statePath(directory),
    scope: contract.evidenceScope || null,
    readCalls: state.reads.length,
    readDocumentCount: documents.length,
    completeAvailableTextDocuments: documents.filter(d => d.availableTextFullyRead).length,
    partialDocuments: documents.filter(d => !d.availableTextFullyRead).length,
    initialDocumentCount: initial.length,
    unreadInitialDocuments: unread,
    documents,
    declaration: state.declaration,
    declarationStale: !!state.declarationStale,
    reportMissing:
      !!contract.evidenceScope &&
      (contract.evidenceScope.origin === 'explicit' || state.reads.length > 0) &&
      !state.declaration
  };
}

function validateReport(contract, state, report) {
  if (!report || typeof report !== 'object') throw Error('Consegna sulle evidenze non valida');
  const warnings = [],
    summary = field(report.summary, 'summary');
  for (const name of Object.keys(report))
    if (!Object.hasOwn(evidenceReportSchema.properties, name)) warnings.push('Campo ignorato: ' + name);
  const list = (value, label, max) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      warnings.push('Elenco ' + label + ' non valido: ignorato');
      return [];
    }
    return value.slice(0, max);
  };
  const texts = (value, label) =>
    list(value, label, 30)
      .filter(v => typeof v === 'string' && v.trim())
      .map(v => v.trim().slice(0, 16000));
  const uncertainties = texts(report.uncertainties, 'uncertainties'),
    scopeExpansionRequests = texts(report.scopeExpansionRequests, 'scopeExpansionRequests');
  const coverage = documentsCoverage(state),
    bundle = contract.connectedSources || [],
    verified = new Map(),
    citations = [];
  for (const value of list(report.citations, 'citations', 100)) {
    let resolved;
    try {
      resolved = resolveDocument(bundle, value);
    } catch (error) {
      warnings.push('Citazione scartata (' + error.message + '): ' + JSON.stringify(value).slice(0, 200));
      continue;
    }
    const { ref, doc } = resolved,
      start = value.startLine,
      end = value.endLine,
      documentKey = key({ source: ref.source, snapshot: ref.snapshot, document: doc.id });
    const base = {
      source: ref.source,
      snapshot: ref.snapshot,
      document: doc.id,
      path: doc.path,
      startLine: start,
      endLine: end,
      citation: '[' + ref.source + ':' + doc.id + ']#L' + start + '-L' + end
    };
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      warnings.push('Citazione scartata: intervallo non valido ' + base.citation);
      continue;
    }
    const observed = coverage.find(r => key(r) === documentKey);
    if (!observed) {
      citations.push({ ...base, verified: false, issue: 'documento non letto con gli strumenti del figlio' });
      continue;
    }
    if (!verified.has(documentKey)) {
      if (doc.original) {
        if (
          doc.original !== 'originals/' + doc.id + '.bin' ||
          hash(fs.readFileSync(path.join(ref.directory, doc.original))) !== doc.sha256
        )
          throw Error('Originale dello snapshot alterato durante il resoconto');
      }
      let original = fs.readFileSync(path.join(ref.directory, doc.id + '.txt'), 'utf8');
      if (!doc.original && hash(original) !== doc.textSha256) original = original.replace(/\r\n/g, '\n');
      if (hash(original) !== doc.textSha256) throw Error('Testo dello snapshot alterato durante il resoconto');
      const lines = original.split('\n'),
        lengths = lines.map(chars),
        starts = [];
      let offset = 0;
      for (const length of lengths) {
        starts.push(offset);
        offset += length + 1;
      }
      verified.set(documentKey, { lines, lengths, starts });
    }
    const { lines, lengths, starts } = verified.get(documentKey);
    if (end > lines.length) {
      citations.push({ ...base, verified: false, issue: 'intervallo oltre la fine del documento' });
      continue;
    }
    const begin = starts[start - 1],
      finish = starts[end - 1] + lengths[end - 1];
    const read =
      covers(observed.characterIntervals, begin, finish) || covers(observed.completeLineIntervals, start, end + 1);
    citations.push(
      read ? { ...base, verified: true } : { ...base, verified: false, issue: 'righe non lette integralmente' }
    );
  }
  const unreadDocuments = [];
  for (const value of list(report.unreadDocuments, 'unreadDocuments', 200)) {
    let resolved;
    try {
      resolved = resolveDocument(bundle, value);
    } catch (error) {
      warnings.push('Documento non letto ignorato (' + error.message + ')');
      continue;
    }
    const { ref, doc } = resolved;
    if (
      coverage.some(read => read.source === ref.source && read.snapshot === ref.snapshot && read.document === doc.id)
    ) {
      warnings.push('Letto in parte, non "non letto": ' + doc.path);
      continue;
    }
    unreadDocuments.push({
      source: ref.source,
      snapshot: ref.snapshot,
      document: doc.id,
      path: doc.path,
      reason:
        typeof value.reason === 'string' && value.reason.trim()
          ? value.reason.trim().slice(0, 16000)
          : 'motivo non indicato'
    });
  }
  for (const doc of contract.evidenceScope?.initialDocuments || [])
    if (!coverage.some(read => key(read) === key(doc)) && !unreadDocuments.some(unread => key(unread) === key(doc))) {
      unreadDocuments.push({
        source: doc.source,
        snapshot: doc.snapshot,
        document: doc.document,
        path: doc.path,
        reason: 'non letto e non dichiarato dal figlio'
      });
      warnings.push('Documento iniziale non letto e non dichiarato: ' + doc.path);
    }
  return {
    summary,
    citations,
    unreadDocuments,
    uncertainties,
    scopeExpansionRequests,
    warnings,
    submittedAt: new Date().toISOString(),
    readCalls: state.reads.length
  };
}
export function evidenceReadingTool(directory, contract) {
  return {
    name: 'report_evidence_reading',
    label: 'Consegna analisi e copertura delle evidenze',
    description:
      'Prima della consegna riporta sintesi, citazioni, documenti iniziali non letti e motivi, dubbi e richieste di ampliamento. La copertura e calcolata dalle letture effettive; full/section/passage restano una tua scelta nel perimetro operativo.',
    parameters: evidenceReportSchema,
    execute: async (_id, args) => {
      const state = loadState(directory, contract);
      state.declaration = validateReport(contract, state, args);
      state.declarationStale = false;
      saveState(directory, state);
      return {
        content: [{ type: 'text', text: JSON.stringify(evidenceReadingSummary(directory, contract)) }],
        details: {}
      };
    }
  };
}
