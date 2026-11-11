// The real-path E2E harness for collaboration (docs/integration/nexo-collab-plan.md 5, "Phases 3–7 as cut", Proof): a
// helper module, not a test. start() runs on free loopback ports
//   (a) the fake Admin PostgREST (frontends/nexo-collab/test/fake-postgrest.mjs) with two synthetic staff callers and one
//       synthetic client member,
//   (b) the R API (frontends/nexo-api/run.R) on a temp checkpoint directory, its Admin settings pointing at the fake
//       PostgREST (start({ requireUser: true }) adds LIPIDOMIC_ADMIN_REQUIRE_USER=1, so the store is scoped per client;
//       by default it is off, as every journey expects), behind a recorder that keeps every call R receives (`calls`).
//       The synthetic fixture checkpoint is put in that directory through R's own upload (POST /checkpoints, as staff
//       A): R lets a project's service identity open stored checkpoints only, never the legacy folder (storage.R
//       api_checkpoint_resolve). Its canvas is empty and,
//       collaborating, a person may not add a card before Phase 3 (an R mutation), so eachBrowser() first has A open it
//       single-user (?collab=0), add two cards and save a named checkpoint: the one every journey opens (`cards()`).
//   (c) the sidecar (src/server.mjs start()) with the R API and the same random service secret,
//   (d) a non-mock client build served by vite preview: /api and /collab (WebSocket included) proxied, and a stub
//       /admin/api/session-token that answers the token of the person named by the context's `nexo-who` cookie.
// The R interpreter is NEXO_RSCRIPT (default Rscript), with R's library environment taken from the caller's environment.
// Plotly for the build: NEXO_PLOTLY_JS / NEXO_VISNETWORK_DIR, or the R plotly / visNetwork packages (scripts/vendor-*.sh).
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const sidecar = path.join(root, 'frontends/nexo-collab');
const fixture = path.join(__dirname, 'fixtures', 'nexo-complete-synthetic.zip');
const workbook = fs.readFileSync(path.join(__dirname, 'fixtures', 'admin-dataset-v1-synthetic.xlsx'));

// Synthetic people. A token is JWT-shaped so the sidecar reads its displayName claim (admission.mjs identity).
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const person = (name, userId, displayName, row) => ({ name, userId, displayName, view: row.caller_view,
  token: `${b64({ alg: 'none' })}.${b64({ sub: userId, displayName })}.synthetic-${name}`, rows: [{ caller: userId, ...row }] });
const people = {
  a: person('a', '00000000-0000-4000-8000-00000000a001', 'Alex Synthetic', { caller_view: 'staff', client_id: null }),
  b: person('b', '00000000-0000-4000-8000-00000000b002', 'Blair Synthetic', { caller_view: 'staff', client_id: null }),
  client: person('client', '00000000-0000-4000-8000-00000000c003', 'Casey Member',
    { caller_view: 'client', client_id: '0c000000-0000-4000-8000-0000000000c1' }),
};
// The client's released dataset in the fake Admin (a client's dataset that lab staff may open, listed to staff and the
// client by nexo_datasets_for_caller, C2), and the client's people for Share (admin.nexo_people: lab staff and the
// client's members).
const client = people.client.rows[0].client_id;
const dataset = { row: { dataset_id: '0d000000-0000-4000-8000-0000000000d1', order_code: 'ORD900', version: 1,
  storage_path: 'released/ord900/v1.xlsx', sha256: createHash('sha256').update(workbook).digest('hex'), client_id: client,
  client_name: 'Synthetic client group', released_at: '2026-11-01T09:00:00Z', members_prepare: false },
  bytes: workbook };
const directory = { [client]: Object.values(people).map(p => ({ user_id: p.userId, display_name: p.displayName,
  kind: p.view === 'staff' ? 'staff' : 'client' })) };

function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: nexo, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}
async function until(check, ms, what) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await check().catch(() => undefined);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`${what} within ${ms / 1000} s`);
    await new Promise(r => setTimeout(r, 200));
  }
}

// Every call R receives, browser and sidecar alike: { method, path, service (sent with the service identity), intent }.
function recorder(target, calls) {
  const server = http.createServer((req, res) => {
    calls.push({ method: req.method, path: req.url, service: 'x-nexo-service-token' in req.headers,
      intent: req.headers['x-nexo-intent'] ?? null });
    const upstream = http.request({ host: '127.0.0.1', port: target, method: req.method, path: req.url, headers: req.headers },
      answer => { res.writeHead(answer.statusCode, answer.headers); answer.pipe(res); });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let state = null;

/** Starts (a)–(d); resolves to { base, apiUrl, calls, people, checkpoint (the uploaded fixture's id) }. */
async function start({ requireUser = false } = {}) {
  assert(!state, 'collab-real is already started');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-collab-real-'));
  state = { dir, calls: [] };
  try {
    const { fakePostgrest } = await import(path.join(sidecar, 'test/fake-postgrest.mjs'));
    state.admin = await fakePostgrest(Object.fromEntries(Object.values(people).map(p => [p.token, p.rows])),
      { people: directory, dataset });
    const secret = randomBytes(32).toString('hex');
    // (b) R, then the fixture uploaded into its store.
    const checkpoints = path.join(dir, 'checkpoints'); fs.mkdirSync(checkpoints);
    const rPort = await port(), log = fs.openSync(path.join(dir, 'r.log'), 'w');
    state.r = spawn(process.env.NEXO_RSCRIPT || 'Rscript', ['--vanilla', 'frontends/nexo-api/run.R'], {
      cwd: root, stdio: ['ignore', log, log], env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', R_ENABLE_JIT: '0', ...process.env,
        LIPIDOMIC_API_PORT: String(rPort), LIPIDOMIC_API_CHECKPOINT_DIR: checkpoints,
        LIPIDOMIC_ADMIN_SUPABASE_URL: state.admin.url, LIPIDOMIC_ADMIN_ANON_KEY: 'synthetic-anon',
        LIPIDOMIC_ADMIN_NEXO_TOKEN: 'synthetic-reader', NEXO_SERVICE_SECRET: secret,
        LIPIDOMIC_ADMIN_REQUIRE_USER: requireUser ? '1' : '' } });
    const exited = new Promise(resolve => state.r.once('exit', code => resolve(code)));
    state.recorder = await recorder(rPort, state.calls);
    const apiUrl = `http://127.0.0.1:${state.recorder.address().port}`;
    await Promise.race([
      until(async () => (await fetch(`http://127.0.0.1:${rPort}/api/v1/health`)).ok, 180_000, 'R API did not start'),
      exited.then(code => { throw new Error(`R API exited (${code}):\n${fs.readFileSync(path.join(dir, 'r.log'), 'utf8').slice(-2000)}`); }),
    ]);
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(fixture)], { type: 'application/zip' }), path.basename(fixture));
    form.append('label', 'Synthetic collab fixture');
    const uploaded = await fetch(`${apiUrl}/api/v1/checkpoints`, { method: 'POST', body: form,
      headers: { 'X-Nexo-Admin-Token': people.a.token } });
    assert.equal(uploaded.status, 200, `fixture upload: ${await uploaded.clone().text()}`);
    state.checkpoint = (await uploaded.json()).id;
    // (c) the sidecar.
    const { start: startSidecar } = await import(path.join(sidecar, 'src/server.mjs'));
    state.dbPath = path.join(dir, 'collab.sqlite');
    state.collab = await startSidecar({ port: await port(), dbPath: state.dbPath, restUrl: state.admin.url,
      anonKey: 'synthetic-anon', apiUrl, serviceSecret: secret });
    // (d) the client, built for this preview port (VITE_COLLAB_URL is absolute), served with the proxies and token stub.
    const previewPort = await port(), base = `http://127.0.0.1:${previewPort}`;
    run('sh', ['scripts/vendor-plotly.sh']); run('sh', ['scripts/vendor-visnetwork.sh']);
    run('npm', ['run', 'build'], { VITE_API_MOCK: '', VITE_COLLAB_URL: `ws://127.0.0.1:${previewPort}/collab` });
    const { preview } = await import(path.join(nexo, 'node_modules/vite/dist/node/index.js'));
    const tokenStub = { name: 'collab-real-admin-token', configurePreviewServer(server) {
      server.middlewares.use('/admin/api/session-token', (req, res) => {
        const who = /(?:^|;\s*)nexo-who=([a-z]+)/.exec(req.headers.cookie ?? '')?.[1], p = people[who];
        if (!p) { res.statusCode = 401; res.end(); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ accessToken: p.token, expiresAt: Math.floor(Date.now() / 1000) + 3600, view: p.view, userId: p.userId }));
      });
    } };
    state.preview = await preview({ root: nexo, logLevel: 'silent', plugins: [tokenStub], preview: {
      host: '127.0.0.1', port: previewPort, strictPort: true,
      proxy: { '/api': apiUrl, '/collab': { target: state.collab.httpUrl, ws: true } } } });
    state.base = base;
    return { base, apiUrl, calls: state.calls, people, checkpoint: state.checkpoint };
  } catch (e) { await stop(); throw e; }
}

async function stop() {
  if (!state) return;
  const s = state; state = null;
  await s.preview?.close().catch(() => {});
  await s.collab?.close().catch(() => {});
  if (s.r && s.r.exitCode === null && s.r.signalCode === null) {
    await new Promise(resolve => { s.r.once('exit', resolve); s.r.kill(); });
  }
  await new Promise(resolve => s.recorder ? s.recorder.close(resolve) : resolve());
  await s.admin?.close();
  fs.rmSync(s.dir, { recursive: true, force: true });
}

/** A browser context signed in to Admin as `who` ('a', 'b' or 'client') with its page at `url` (default: the fixture
 *  checkpoint, so a first open creates the project), once the canvas is up; `joins`: a bare dataset link whose dataset
 *  already has a project, opened without preparing it; `design` ({unit, type}): the study design chosen on Prepare;
 *  `viewport` ({width, height}, default 1920 × 1080): the page's size from the first paint (a phone opens as a phone).
 *  Records every request with its answer status, and console errors. */
async function open(browser, who, url = `${state.base}/nexo/?checkpoint=${encodeURIComponent(state.checkpoint)}`, { joins = false, design, viewport = { width: 1920, height: 1080 } } = {}) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'nexo-who', value: who, url: state.base }]);
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  const errors = [], requests = [];
  context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('weberror', e => errors.push(e.error().message));
  // A request that finishes as its context closes has no answer to read (the closing must not kill the run).
  context.on('requestfinished', async r => requests.push({ method: r.method(), url: r.url(), status: (await r.response().catch(() => null))?.status() }));
  const page = await context.newPage();
  await page.goto(url);
  // Only a first open prepares a dataset; a link that names the project joins with the project's settings (FIX-G10),
  // and so does a bare dataset link once the dataset has a project (`joins`, FIX-G12).
  if (!joins && new URL(url).searchParams.has('dataset') && !new URL(url).searchParams.has('project')) await prepare(page, design);
  await page.waitForSelector('#viewport', { timeout: 60_000 });
  return { context, page, errors, requests, who: people[who] };
}

/** "Prepare and check" on the Prepare page with Team's defaults (a ?dataset= link without a project asks), and the study
 *  design when given; then "Open the Canvas" on the quality check, which creates the project. */
async function prepare(page, design) {
  if (design) {
    // The label holds its select, whose options are part of the label's text: find each by its first words.
    await page.locator('label', { hasText: /^Experimental unit/ }).locator('select').selectOption(design.unit, { timeout: 60_000 });
    await page.locator('label', { hasText: /^Sample relationship/ }).locator('select').selectOption(design.type);
  }
  await page.getByRole('button', { name: 'Prepare and check', exact: true }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: /^Open the Canvas/ }).click({ timeout: 120_000 });
}
/** The client's dataset link (no project yet: a first open creates it) and the client's workspace. */
const datasetUrl = () => `${state.base}/nexo/?dataset=${dataset.row.dataset_id}`;
const clientWorkspace = `nexo-client-${client}`;

/** The project's shared document's meta (map 'meta'), from the sidecar's SQLite as last stored. */
async function meta(project) {
  const { DatabaseSync } = await import('node:sqlite');
  const Y = await import(path.join(sidecar, 'node_modules/yjs/dist/yjs.mjs'));
  const db = new DatabaseSync(state.dbPath, { readOnly: true });
  try {
    const row = db.prepare('SELECT data FROM documents WHERE name = ?').get(project);
    if (!row) return null;
    const doc = new Y.Doc(); Y.applyUpdate(doc, row.data);
    return doc.getMap('meta').toJSON();
  } finally { db.close(); }
}
/** A opens the seeded checkpoint (creating the project) and B the project link; resolves to { a, b, project, session }
 *  once both pages render on the sidecar's session (meta.session.id). */
async function pair(browser) {
  const a = await open(browser, 'a');
  const project = await until(async () => projectOf(a.page), 30_000, 'the first open did not add &project= to the URL');
  const b = await open(browser, 'b', a.page.url());
  const session = await until(async () => (await meta(project))?.session?.id, 60_000, 'the sidecar did not write meta.session');
  const rendered = side => side.requests.some(r => r.status === 200 && r.method === 'POST' &&
    r.url.includes(`/api/v1/sessions/${encodeURIComponent(session)}/`) && r.url.endsWith('/render'));
  await until(async () => rendered(a) && rendered(b), 60_000, "both pages did not render on the sidecar's session");
  return { a, b, project, session };
}
/** R's /api/v1/health answer. */
async function health() { return (await fetch(`${state.base}/api/v1/health`)).json(); }
/** An R API call as `who` (its Admin token), a JSON body making it a POST: { status, value }. */
async function api(who, path, body) {
  const response = await fetch(`${state.base}/api/v1${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': people[who].token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, value: await response.json() };
}
/** The project id in the page's URL (set by the first open). */
const projectOf = page => new URL(page.url()).searchParams.get('project');

const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
const cardIds = page => page.locator('.card').evaluateAll(cards => cards.map(c => c.dataset.id));
const titleOf = (page, id) => card(page, id).locator('.card-title').textContent();
async function rename(page, id, title) {
  await card(page, id).locator('.card-title').dblclick();
  const box = card(page, id).getByRole('textbox', { name: 'Card title' });
  await box.fill(title); await box.press('Enter');
}
async function drag(page, id, dx, dy) {
  const box = await card(page, id).locator('header').boundingBox();
  assert(box, `no card ${id} to drag`);
  const x = box.x + 40, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
/** Adds the plot `label` from the library ('+ Add plot'); resolves to the new card's id once the page shows it. */
async function addCard(page, label) {
  const before = await cardIds(page);
  await page.getByRole('button', { name: '+ Add plot', exact: true }).click();
  await page.getByRole('button', { name: `Add ${label}`, exact: true }).click();
  return until(async () => (await cardIds(page)).find(id => !before.includes(id)), 30_000, `${label} was not added`);
}
/** A, single-user, adds a PCA and a violin card (its Data tab has the Lipid input) to the fixture and saves it as a named
 *  checkpoint, which open() opens next. The cards are Team instances: their ids are in `cards()`. */
async function seed(browser) {
  const a = await open(browser, 'a', `${state.base}/nexo/?checkpoint=${encodeURIComponent(state.checkpoint)}&collab=0`);
  try {
    state.cards = { pca: await addCard(a.page, 'Principal components'), violin: await addCard(a.page, 'Feature distributions') };
    await a.page.getByTitle('Open or save a checkpoint').click();
    const dialog = a.page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await dialog.getByLabel('New checkpoint name', { exact: true }).fill('Synthetic collab board');
    const saved = a.page.waitForResponse(r => r.request().method() === 'POST' && /\/sessions\/[^/]+\/checkpoints$/.test(r.url()));
    await dialog.getByRole('button', { name: 'Save current analysis', exact: true }).click();
    const answer = await saved;
    assert.equal(answer.status(), 200, `seed save: ${await answer.text()}`);
    state.checkpoint = (await answer.json()).id;
  } finally { await a.context.close(); }
}
/** The card's offset in the board's world layer (equal on two pages showing the same board). */
const position = (page, id) => card(page, id).evaluate(el => ({ x: el.offsetLeft, y: el.offsetTop }));

/** Runs `journey(browser, name)` on Chromium and WebKit, each with its own harness (one project, one lease each) and the
 *  seeded checkpoint. */
async function eachBrowser(title, journey) {
  try { await port(); } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP ${title}: ${e.message}`); return; }
    throw e;
  }
  const pw = require(require.resolve('@playwright/test', { paths: [path.join(root, 'tests/browser/ci')] }));
  const failures = [];
  for (const name of process.env.ENGINES?.split(',') ?? ['chromium', 'webkit']) {
    let browser;
    try {
      await start();
      browser = await pw[name].launch();
      await seed(browser);
      await journey(browser, name);
    } catch (error) { console.error(`FAIL ${name}: ${error.stack ?? error.message}`); failures.push(name); }
    finally { await browser?.close(); await stop(); }
  }
  if (failures.length) { console.error(`${title} failed: ${failures.join(', ')}`); process.exitCode = 1; }
  else console.log(`${title} OK`);
}

module.exports = { start, stop, open, prepare, datasetUrl, clientWorkspace, pair, meta, health, api, projectOf, card, cardIds, titleOf, rename, drag, position,
  addCard, until, eachBrowser, people, cards: () => state.cards, calls: () => state.calls };
