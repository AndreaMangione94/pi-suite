'use strict';
async function readDocumentGraphEvidence(evidence, version, offset = 0) {
  const result = await api('evidence', {
    project: project.id,
    documentGraph: true,
    documentGraphVersion: version,
    action: 'read_evidence',
    args: { source: evidence.source, document: evidence.document, mode: 'full', offset, maxChars: 100000 }
  });
  const host = $('document-graph-reader');
  host.replaceChildren(
    el('h3', result.path),
    el('p', result.citation + ' · snapshot ' + result.snapshot, 'muted'),
    el('pre', result.text)
  );
  if (result.extractionTruncated || result.coverageNotes?.length)
    host.append(
      el(
        'p',
        (result.coverageNotes || []).join(' · ') + (result.extractionTruncated ? ' · Estrazione parziale' : ''),
        'muted'
      )
    );
  if (result.nextOffset !== null)
    host.append(btn('Leggi parte successiva', () => readDocumentGraphEvidence(evidence, version, result.nextOffset)));
  host.scrollIntoView({ block: 'nearest' });
}
async function loadDocumentGraph(node) {
  if (!project) return;
  const pid = project.id,
    selected = graphExplorerId,
    data = await api(
      'document-graph?id=' +
        encodeURIComponent(pid) +
        '&file=' +
        encodeURIComponent(selected) +
        '&q=' +
        encodeURIComponent($('document-graph-search').value) +
        (node ? '&node=' + encodeURIComponent(node) : '')
    );
  if (project?.id !== pid || graphExplorerId !== selected) return;
  const host = $('document-graph-results');
  host.replaceChildren();
  $('document-graph-stats').replaceChildren();
  $('document-graph-reader').replaceChildren();
  if (data.available === false) {
    $('document-graph-state').textContent =
      'Il grafo documentale semantico non è ancora stato creato. Seleziona le cartelle e avvia la creazione con il modello.';
    $('document-graph-canvas').replaceChildren();
    return;
  }
  const stale = workspaceFiles.graphs.find(g => g.id === selected)?.stale;
  $('document-graph-state').textContent =
    (stale ? 'Le acquisizioni sono cambiate: puoi rigenerare il grafo. ' : 'Grafo semantico salvato · ') +
    data.model.provider +
    ' / ' +
    data.model.model;
  for (const [label, value] of [
    ['Documenti', data.stats.documents],
    ['Concetti inferiti', data.stats.semanticNodes],
    ['Relazioni inferite', data.stats.semanticEdges],
    ['Relazioni esplicite', data.stats.explicitEdges],
    ['Rimandi alle fonti', data.stats.evidenceEdges]
  ]) {
    const item = el('div');
    item.append(el('strong', String(value)), el('small', label));
    $('document-graph-stats').append(item);
  }
  drawGraph(data, 'document-graph-canvas', loadDocumentGraph);
  if (!data.nodes.length) host.append(el('p', 'Nessun concetto corrispondente. Prova un altro termine.', 'muted'));
  for (const n of data.nodes.slice(0, 40)) {
    const card = el('div', undefined, 'card');
    card.append(
      btn(n.label, () => loadDocumentGraph(n.id), 'text-button'),
      el('p', n.summary || n.kind),
      el('small', n.method === 'llm_inference' ? 'Concetto ricostruito dal modello' : 'Elemento estratto dal documento')
    );
    const evidence = n.evidence || [
      { source: n.source, document: n.document, path: n.path, startLine: n.startLine, endLine: n.endLine }
    ];
    for (const ev of evidence.slice(0, 3))
      if (ev.source && ev.document)
        card.append(
          el('p', ev.path + ' · righe ' + ev.startLine + '–' + ev.endLine, 'muted'),
          btn('Leggi documento originale', () => readDocumentGraphEvidence(ev, data.version))
        );
    card.append(btn('Esplora relazioni', () => loadDocumentGraph(n.id), 'text-button'));
    host.append(card);
  }
  const relations = el('details');
  relations.append(
    el('summary', data.edges.length + ' relazioni esplicite e semantiche'),
    el('pre', JSON.stringify(data.edges, null, 2))
  );
  host.append(relations);
  if (data.truncated) host.append(el('p', 'Vista limitata: restringi la ricerca o esplora un nodo.', 'muted'));
}
bind('search-document-graph', () => loadDocumentGraph());
$('document-graph-search').onkeydown = e => {
  if (e.key === 'Enter') loadDocumentGraph().catch(error => notice(error.message, true));
};
