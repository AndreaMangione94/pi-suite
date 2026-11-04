// Match the host's public module assets when a UI test replaces the Python HTTP server.
const path = require('node:path');

module.exports = pathname => {
  const moduleAssets = {
    '/modules/benchmarks/benchmark-panel.js': 'benchmark-panel.js',
    '/modules/benchmarks/benchmark.css': 'benchmark.css'
  };
  return moduleAssets[pathname]
    ? path.join('node_modules', 'pi-suite-benchmarks', 'ui', moduleAssets[pathname])
    : path.join('suite-ui', pathname === '/' ? 'index.html' : pathname.slice(1));
};
