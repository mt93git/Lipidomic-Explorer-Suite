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
async function open(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  const errors = [], requests = [], yjs = [];
  context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('weberror', e => errors.push(e.error().message));
  context.on('request', r => requests.push(r.url()));
  context.on('response', async r => { if (r.request().resourceType() === 'script' && (await r.text().catch(() => '')).includes(yjsMarker)) yjs.push(r.url()); });
  const page = await context.newPage();
  page.on('websocket', ws => requests.push(ws.url()));
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}&project=${project}`);
  await page.waitForSelector('.card');
  return { context, page, errors, requests, yjs };
}
async function shared(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const a = await open(browser, base);
    await a.page.waitForFunction(() => window.__nexo.collab);
    const b = await open(browser, base);
    await b.page.waitForFunction(() => window.__nexo.collab);
    assert(a.yjs.length && b.yjs.length, 'flag on loads the yjs chunk');
    // Both boards drawn first: B still drawing its plots after load measured the load, not the message (WebKit ~200 ms).
    for (const page of [a.page, b.page]) await page.waitForFunction(() => window.__nexo.handle.drawProbes().every(p => !p.busy() && p.signature() !== undefined));
    const original = await nodes(a.page), id = original[0].id;
    assert.deepEqual(await nodes(b.page), original, 'B hydrates the same board');
    // B notes when its card's left changes; A when its pointer is released (both Date.now on one machine).
    await b.page.evaluate(id => { const el = document.querySelector(`.card[data-id="${id}"]`), left = el.style.left;
      new MutationObserver((_, o) => { if (el.style.left !== left) { window.__landed = Date.now(); o.disconnect(); } }).observe(el, { attributes: true, attributeFilter: ['style'] }); }, id);
    await a.page.evaluate(() => window.addEventListener('pointerup', () => { window.__up = Date.now(); }, { capture: true, once: true }));
    await drag(a.page, id, 200, 0);
    const moved = (await nodes(a.page)).find(n => n.id === id);
    assert.equal(moved.x, original[0].x + 200);
    await b.page.waitForFunction(() => window.__landed);
    const latency = await b.page.evaluate(() => window.__landed) - await a.page.evaluate(() => window.__up);
    assert.equal(await card(b.page, id).evaluate(el => el.style.left), `${moved.x}px`);
    assert.deepEqual(await nodes(b.page), await nodes(a.page), 'B shows A\'s board');
    assert(latency < 200, `A→B ${latency} ms`);
    console.log(`PASS F0-5 ${name} a-drags-b-lands (${latency} ms)`);
    // B has no change of its own: its undo moves nothing, here or in A.
    const after = await nodes(a.page);
    await undo(b.page);
    assert.deepEqual(await nodes(b.page), after, 'B undo changed B');
    assert.deepEqual(await nodes(a.page), after, 'B undo changed A');
    console.log(`PASS F0-5 ${name} b-undo-leaves-a`);
    await undo(a.page);
    assert.deepEqual(await nodes(a.page), original, 'A undo restores A');
    await b.page.waitForFunction(([id, x]) => window.__nexo.store.get().nodes.find(n => n.id === id).x === x, [id, original[0].x]);
    assert.deepEqual(await nodes(b.page), original, 'A undo restores B');
    console.log(`PASS F0-5 ${name} a-undo-restores-both`);
    assert.deepEqual([...a.errors, ...b.errors], []); console.log(`PASS F0-5 ${name} no-console-errors`);
    await a.context.close(); await b.context.close();
  } finally { await browser.close(); }
}
async function flagOff(pw, name, base, collabUrl) {
  const browser = await pw[name].launch();
  try {
    const a = await open(browser, base);
    await drag(a.page, (await nodes(a.page))[0].id, 200, 0);
    await a.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.deepEqual(a.requests.filter(url => url.startsWith(collabUrl) || url.includes('/collab')), [], 'flag off reached the collab URL');
    assert.deepEqual(a.yjs, [], 'flag off loaded yjs');
    assert.equal(await a.page.evaluate(() => 'collab' in window.__nexo), false);
    console.log(`PASS F0-5 ${name} flag-off-no-collab-request-no-yjs`);
    assert.deepEqual(a.errors, []); console.log(`PASS F0-5 ${name} flag-off-no-console-errors`);
    await a.context.close();
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
    for (const name of ['chromium', 'webkit']) await shared(pw, name, base);
    await stop();
    base = await serve({});
    for (const name of ['chromium', 'webkit']) await flagOff(pw, name, base, collab.wsUrl);
    console.log('F0-5 collab spike OK');
  } finally {
    await stop(); await collab?.close(); await admin.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
