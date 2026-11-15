// Phase 1B, Phase 0 spike (docs/integration/nexo-collab-plan.md 2.3, 5): two browsers share one board through the real
// sidecar (fake Admin PostgREST), geometry only, Chromium and WebKit (mock build); a flag-off build never reaches it.
// node tests/dual-ui/test_nexo_collab_spike.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const sidecar = path.join(root, 'frontends/nexo-collab');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const project = '0a000000-0000-4000-8000-0000000000f5';
// The mock Admin token (src/mock/adminToken.ts) is lab staff for the fake PostgREST.
const callers = { 'mock-admin-token': [{ caller: '00000000-0000-4000-8000-00000000a001', caller_view: 'staff', client_id: null }] };
// A yjs bundle carries this literal (its double-import warning): a loaded script with it is a loaded yjs chunk.
const yjsMarker = 'Yjs was already imported';
let preview;
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: nexo, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function serve(env) {
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1', VITE_COLLAB_URL: '', ...env });
  const p = await port();
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`, deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) return base; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
}
const stop = () => new Promise(resolve => { if (!preview || preview.exitCode !== null) return resolve(); preview.once('exit', resolve); preview.kill(); });
const nodes = page => page.evaluate(() => window.__nexo.store.get().nodes);
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function undo(page) { await page.locator('#viewport').focus(); await page.keyboard.press('Control+z'); }
async function drag(page, id, dx, dy) {
  const box = await card(page, id).locator('header').boundingBox();
  assert(box, 'missing drag target');
  const x = box.x + 40, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
// A context that records console errors and the scripts it loaded that carry yjs.
async function open(browser, base, extra = "") {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  const errors = [], requests = [], yjs = [];
  context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('weberror', e => errors.push(e.error().message));
  context.on('request', r => requests.push(r.url()));
  context.on('response', async r => { if (r.request().resourceType() === 'script' && /Yjs was already imported|hocuspocus/i.test(await r.text().catch(() => ''))) yjs.push(r.url()); });
  const page = await context.newPage();
  page.on('websocket', ws => requests.push(ws.url()));
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}&project=${project}${extra}`);
  await page.waitForSelector('.card');
  return { context, page, errors, requests, yjs };
}
async function journey(pw, name, base, collabUrl) {
  const browser = await pw[name].launch();
  try {
    const a = await open(browser, base, '&collab=0');
    const before = await nodes(a.page), id = before[0].id;
    await drag(a.page, id, 100, 0);
    assert.equal((await nodes(a.page))[0].x, before[0].x + 100, 'single-user move works');
    await undo(a.page);
    assert.deepEqual(await nodes(a.page), before, 'single-user undo works');
    assert.deepEqual(a.requests.filter(url => url.startsWith(collabUrl) || url.includes('/collab/')), [], 'flag off reached collaboration');
    assert.deepEqual(a.yjs, [], 'flag off loaded yjs or hocuspocus');
    console.log(`PASS ${name} flag off: no collaboration, move and undo work`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F0-5 Playwright: ${e.message}`); return; } throw e; }
  const { fakePostgrest } = await import(path.join(sidecar, 'test/fake-postgrest.mjs'));
  const { openDatabase } = await import(path.join(sidecar, 'src/db.mjs'));
  const { start } = await import(path.join(sidecar, 'src/server.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-collab-spike-')), dbPath = path.join(dir, 'collab.sqlite');
  const { db } = openDatabase(dbPath);
  db.prepare('INSERT INTO projects (id, workspace) VALUES (?, ?)').run(project, 'nexo-lab-synthetic');
  db.close();
  const admin = await fakePostgrest(callers);
  let collab;
  try {
    collab = await start({ port: p, dbPath, restUrl: admin.url, anonKey: 'anon-test' });
    const collabUrl = `${collab.wsUrl}/collab`;
    run('sh', ['scripts/vendor-plotly.sh']);
    const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
    let base = await serve({ VITE_COLLAB_URL: collabUrl });
    for (const name of ['chromium', 'webkit']) await journey(pw, name, base, collab.wsUrl);
    await stop();
    base = await serve({});
    for (const name of ['chromium', 'webkit']) await journey(pw, name, base, collab.wsUrl);
    console.log('Phase 2 journey OK');
  } finally {
    await stop(); await collab?.close(); await admin.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
