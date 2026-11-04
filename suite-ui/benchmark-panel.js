'use strict';
// Optional host adapter: install pi-suite-benchmarks and restart to enable its tab.
(async () => {
  if (!(await api('state')).modules?.benchmarks) return;
  const loadAsset = (tag, attributes) =>
    new Promise((resolve, reject) => {
      const node = Object.assign(document.createElement(tag), attributes);
      node.onload = resolve;
      node.onerror = () => reject(Error('Caricamento del modulo benchmark non riuscito.'));
      document.head.append(node);
    });
  await Promise.all([
    loadAsset('link', { rel: 'stylesheet', href: '/modules/benchmarks/benchmark.css' }),
    loadAsset('script', { src: '/modules/benchmarks/benchmark-panel.js' })
  ]);
  if (window.PiSuiteBenchmarks?.apiVersion !== 1)
    throw Error('Modulo benchmark incompatibile: aggiorna le dipendenze.');
  const navigation = el('button');
  navigation.dataset.page = 'benchmarks';
  navigation.append(el('span', '◫'), document.createTextNode(' Benchmark e confronti'));
  document.querySelector('[data-page="runs"]').after(navigation);
  const section = el('section', undefined, 'page');
  section.id = 'page-benchmarks';
  section.hidden = true;
  section.setAttribute('aria-label', 'Benchmark e confronti');
  const root = el('div');
  root.id = 'benchmark-root';
  section.append(root);
  $('page-runs').after(section);
  window.PiSuiteBenchmarks.mount({
    root,
    api,
    el,
    btn,
    input,
    field,
    options,
    notice,
    page,
    token,
    navigation,
    breadcrumb: $('breadcrumb')
  });
})().catch(error => notice(error.message, true));
