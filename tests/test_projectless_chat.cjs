const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const http = require('node:http');
const { chromium } = require('playwright-core');

(async () => {
  const work = path.resolve('tests/tmp/projectless-check');
  fs.mkdirSync(work, { recursive: true });
  process.env.TEMP = work;
  process.env.TMP = work;
  const home = fs.mkdtempSync(path.join(work, 'data-'));
  const clean = path.join(home, 'chats', 'clean');
  fs.mkdirSync(clean, { recursive: true });
  const source = 'a'.repeat(32),
    snapshot = 'b'.repeat(32);
  const directory = path.join(home, 'sources', source, snapshot);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ name: 'Project source', documents: [] }));
  fs.writeFileSync(path.join(home, 'sources', source, 'current.json'), JSON.stringify({ snapshot }));
  const registered = { id: 'demo', name: 'Demo', path: home, workspace: { graph: { sources: [source] } } };
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ projects: [registered] }));
  const graph = path.join(home, 'graphs', 'demo', 'graph.json');
  fs.mkdirSync(path.dirname(graph), { recursive: true });
  fs.writeFileSync(graph, '{}');
  process.env.PI_SUITE_CLEAN_WORKSPACE = clean;
  const { sourceBundle } = await import(pathToFileURL(path.resolve('connected-sources.mjs')));
  const { prepareBatch } = await import(pathToFileURL(path.resolve('delegation-core.mjs')));
  assert.deepEqual(sourceBundle(home, clean), []);
  assert.equal(sourceBundle(home, home)[0].source, source);
  const task = {
    title: 'Answer',
    objective: 'Answer user',
    context: 'Fresh request',
    instructions: 'Write answer',
    constraints: 'No files',
    acceptance: 'Complete answer',
    deliverable: 'Text',
    writeFiles: []
  };
  const { batch } = await prepareBatch(
    home,
    clean,
    [task],
    { projects: [registered], skills: [{ name: 'example', description: 'Available' }] },
    'Answer'
  );
  const contract = JSON.parse(fs.readFileSync(path.join(batch.tasks[0].directory, 'contract.json')));
  assert.deepEqual(contract.connectedSources, []);
  assert.equal(contract.graph, null);
  assert.equal(contract.skills[0].name, 'example');
  delete process.env.PI_SUITE_CLEAN_WORKSPACE;
  assert.equal(sourceBundle(home, clean)[0].source, source);
  console.log('Source isolation, child graph isolation, and explicit project context: OK');

  const calls = [],
    errors = [];
  let failProject = false,
    delayProject = false;
  const settings = {
    providers: [],
    roles: {},
    projects: [],
    skills: [],
    enabledSkills: [],
    maxCalls: 24,
    maxParallelWorkers: 2,
    modelChecks: {}
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let result;
    if (url.pathname === '/api/state') result = { settings, busy: false, job: { state: 'idle' } };
    else if (url.pathname === '/api/models') result = [];
    else if (url.pathname === '/api/project-files') result = { graphs: [], documentation: [] };
    else if (url.pathname === '/api/projects') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      result = { id: 'new', name: data.name, path: path.join(home, 'Nuovo'), workspace: {} };
      settings.projects.push(result);
    } else if (url.pathname === '/api/chat') {
      let body = '';
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      result = { opened: true, folder: clean };
    } else if (url.pathname === '/api/project') {
      if (delayProject) await new Promise(resolve => setTimeout(resolve, 200));
      if (failProject) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing project' }));
        return;
      }
      result = { ...settings.projects.find(p => p.id === url.searchParams.get('id')), graph: null };
    } else {
      const file = require('./static-assets.cjs')(url.pathname);
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader(
        'Content-Type',
        file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'
      );
      res.end(fs.readFileSync(file));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 }
    ]) {
      settings.projects = [];
      const page = await browser.newPage({ viewport });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/#test-token`);
      await page.waitForFunction(() => document.querySelector('#setup').children.length === 3);
      assert.equal(await page.locator('#open-chat').isEnabled(), true);
      assert.equal(await page.locator('#open-documentation').isDisabled(), true);
      assert.equal(await page.locator('#open-graph').isDisabled(), true);
      const launch = async expected => {
        const response = page.waitForResponse(r => r.url().endsWith('/api/chat'));
        await page.locator('#open-chat').click();
        await response;
        assert.deepEqual(calls.at(-1), expected);
      };
      await launch({});
      await launch({});
      settings.projects = [registered];
      await page.evaluate(() => refresh(true));
      await page.locator('#open-project').click();
      await page.locator('[data-project-id=demo]').click();
      await page.waitForFunction(() => !document.querySelector('#open-documentation').disabled);
      await launch({ project: 'demo' });
      await page.locator('#open-project').click();
      await page.locator('#clear-project').click();
      assert.equal(await page.locator('#open-chat').isEnabled(), true);
      assert.equal(await page.locator('#open-graph').isDisabled(), true);
      await launch({});
      delayProject = true;
      await page.locator('#open-project').click();
      await page.locator('[data-project-id=demo]').click();
      assert.equal(await page.locator('#open-chat').isDisabled(), true);
      await page.locator('#open-project').click();
      await page.locator('#clear-project').click();
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#project-selection-count').textContent(), '0');
      await launch({});
      delayProject = false;
      failProject = true;
      await page.locator('#open-project').click();
      await page.locator('[data-project-id=demo]').click();
      await page.waitForFunction(() =>
        document.querySelector('#project-info').textContent.startsWith('Progetto non disponibile')
      );
      await launch({});
      failProject = false;
      assert.equal(await page.locator('#new-project').isVisible(), false);
      await page.locator('#open-project').click();
      await page.locator('#new-project').click();
      assert.equal(await page.locator('#project-dialog').isVisible(), true);
      assert.equal(await page.locator('#project-menu').isVisible(), false);
      await page.locator('#project-name').fill('Nuovo');
      await page.locator('#create-project').click();
      await page.waitForFunction(() => document.querySelector('#project-active-name').textContent === 'Nuovo');
      assert.equal(await page.locator('#project-selection-count').textContent(), '1');
      await page.waitForFunction(() => !document.querySelector('#open-graph').disabled);
      await launch({ project: 'new' });
      await page.locator('#open-project').click();
      assert.equal(await page.locator('#project-context-list .context-choice').count(), 2);
      assert.equal(await page.locator('#project-context-list [aria-pressed=true]').count(), 1);
      await page.locator('[data-project-id=demo]').click();
      await page.waitForFunction(
        () =>
          document.querySelector('#project-active-name').textContent === 'Demo' &&
          !document.querySelector('#open-graph').disabled
      );
      await launch({ project: 'demo' });
      await page.locator('#open-project').click();
      assert.equal(await page.locator('#project-context-list [aria-pressed=true]').count(), 1);
      assert.equal(await page.locator('[data-project-id=new]').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('#project-selection-count').textContent(), '1');
      await page.locator('[data-project-id=new]').click();
      await page.waitForFunction(
        () =>
          document.querySelector('#project-active-name').textContent === 'Nuovo' &&
          !document.querySelector('#open-graph').disabled
      );
      await page.locator('#open-project').click();
      assert.equal(await page.locator('#project-context-list [aria-pressed=true]').count(), 1);
      await page.screenshot({ path: path.join(work, `project-menu-${viewport.width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#project-menu').isVisible(), false);
      await page.screenshot({ path: path.join(work, `ui-${viewport.width}.png`), fullPage: true });
      await page.close();
      console.log(
        `Browser ${viewport.width}px: initial chat, repeated launches, project, deselection, race, failed project: OK`
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
