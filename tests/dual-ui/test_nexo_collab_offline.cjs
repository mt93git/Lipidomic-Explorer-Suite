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
const initialNodes = require(path.join(nexo, 'src/mock/session.json')).canvas.nodes;
// A fresh document per engine: Chromium's final phone move must not change WebKit's starting layout.
const projects = { chromium: '0a000000-0000-4000-8000-0000000000f5', webkit: '0a000000-0000-4000-8000-0000000000f6' };
// The mock Admin token (src/mock/adminToken.ts) is lab staff for the fake PostgREST.
// The phone is another lab staff member (the mock token 'staff2'): one person's own tabs share one avatar.
const callers = { 'mock-admin-token': [{ caller: '00000000-0000-4000-8000-00000000a001', caller_view: 'staff', client_id: null }],
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMGEwMDQiLCJkaXNwbGF5TmFtZSI6IkJsYWlyIFN5bnRoZXRpYyJ9.mock-staff':
    [{ caller: '00000000-0000-4000-8000-00000000a004', caller_view: 'staff', client_id: null }] };
// A yjs bundle carries this literal (its double-import warning): a loaded script with it is a loaded yjs chunk.
const yjsMarker = 'Yjs was already imported';
// NEXO_COLLAB_SHOTS=<dir>: screenshots of the reopened offline tab and of A once it synced (for review, never committed).
const shots = process.env.NEXO_COLLAB_SHOTS;
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
// Waits until the board kept on this device (IndexedDB) has committed every edit so far: a read queues behind the writes
// (Chromium can take a few hundred ms to commit; a person confirming the leave prompt takes longer).
const keptOnDevice = page => page.evaluate(async () => {
  const { name } = (await indexedDB.databases()).find(d => d.name.startsWith('nexo-collab:'));
  await new Promise((resolve, reject) => {
    const open = indexedDB.open(name); open.onerror = reject;
    open.onsuccess = () => { const t = open.result.transaction('updates', 'readonly'); t.objectStore('updates').count(); t.oncomplete = () => { open.result.close(); resolve(); }; };
  });
});
// Screenshots only: 1440 px, inspector closed, the whole board in view.
async function shot(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Close inspector' }).click().catch(() => {});
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
}
async function drag(page, id, dx, dy) {
  const box = await card(page, id).locator('header').boundingBox();
  assert(box, 'missing drag target');
  const x = box.x + 40, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
// A context that records console errors and the scripts it loaded that carry yjs.
// prepare(context) runs before the page loads (a WebSocket route only reaches pages created after it).
async function open(browser, base, project, extra = "", prepare) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await prepare?.(context);
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  const errors = [], requests = [], yjs = [];
  context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('weberror', e => errors.push(e.error().message));
  context.on('request', r => requests.push(r.url()));
  context.on('response', async r => { if (r.request().resourceType() === 'script' && (await r.text().catch(() => '')).includes(yjsMarker)) yjs.push(r.url()); });
  // What the page loaded, to reopen it offline (the browser's cache stands in for this).
  const cache = new Map();
  context.on('response', async r => { if (r.url().startsWith(base) && r.ok()) cache.set(r.url(), { body: await r.body().catch(() => ''), contentType: r.headers()['content-type'] }); });
  const page = await context.newPage();
  page.on('websocket', ws => requests.push(ws.url()));
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}&project=${project}${extra}`);
  await page.waitForSelector('.card');
  return { context, page, errors, requests, yjs, cache };
}
async function rename(page, id, label) {
  await card(page, id).locator('.card-title').dblclick();
  const input = card(page, id).getByRole('textbox', { name: 'Card title' });
  await input.fill(label); await input.press('Enter');
}
async function journey(pw, name, base) {
  const project = projects[name];
  const browser = await pw[name].launch();
  try {
    // B's sockets pass through a route that can hold the browser's report that a socket closed.
    const socket = { hold: false, pending: null, release() { const close = this.pending; Object.assign(this, { hold: false, pending: null }); close?.(); } };
    const a = await open(browser, base, project), b = await open(browser, base, project, '', context => context.routeWebSocket(/\/collab$/, ws => {
      const server = ws.connectToServer();
      ws.onClose(() => { const close = () => { server.close(); ws.close(); }; if (socket.hold) socket.pending = close; else close(); });
    }));
    for (const peer of [a, b]) await peer.page.getByText('Live', { exact: true }).waitFor();
    const [first, second] = await nodes(a.page);
    // This journey assumes independent moves, without a collision moving the other peer's card.
    // A previous engine's phone move can leave these cards touching if its project is reused.
    assert.deepEqual([first, second].map(n => n.x), initialNodes.slice(0, 2).map(n => n.x),
      'each browser starts at the mock checkpoint positions');
    console.log(`PASS ${name} starts at the mock checkpoint positions`);
    // FIX-G11: offline, B opens an inspector for the first time: its lazy chunk fails to load and the panel says so.
    // Back online, the inspector shows the card's tabs by itself, with no reload and no Try again.
    assert(!b.requests.some(u => /EditingBanner/.test(u)), 'the inspector chunk is not loaded before B opens the inspector');
    await b.context.setOffline(true);
    await b.page.getByText('Offline · edits kept locally', { exact: true }).waitFor();
    await card(b.page, first.id).locator('header').click();
    await b.page.getByText('This panel could not be shown.', { exact: false }).waitFor();
    if (shots) await b.page.screenshot({ path: path.join(shots, `${name}-b-inspector-failed-offline.png`) });
    await b.context.setOffline(false);
    await b.page.getByRole('tablist', { name: 'Inspector tabs' }).getByRole('tab', { name: 'Data', exact: true }).waitFor({ timeout: 15000 })
      .catch(async () => { throw new Error(`the inspector stays broken online: ${(await b.page.locator('.panel-failed').textContent().catch(() => '')) || 'no tabs'}`); });
    await b.page.getByText('Live', { exact: true }).waitFor();
    console.log(`PASS ${name} a panel whose chunk failed offline shows the card's tabs once back online, without a reload`);
    if (shots) { await b.page.setViewportSize({ width: 1440, height: 900 }); await b.page.screenshot({ path: path.join(shots, `${name}-b-inspector-back-online-1440.png`) }); await b.page.setViewportSize({ width: 1920, height: 1080 }); }
    for (let cycle = 1; cycle <= 5; cycle++) {
      await b.context.setOffline(true);
      await b.page.getByText(/^(Offline · edits kept locally|Reconnecting)$/).waitFor();
      await drag(a.page, first.id, 10, 0);
      await rename(a.page, first.id, `A cycle ${cycle}`);
      await drag(b.page, second.id, 10, 0);
      await rename(b.page, second.id, `B cycle ${cycle}`);
      await b.context.setOffline(false);
      for (const peer of [a, b]) {
        await peer.page.getByText('Live', { exact: true }).waitFor();
        await peer.page.waitForFunction(([one, two, cycle]) => {
          const ns = window.__nexo.store.get().nodes;
          return ns.find(n => n.id === one.id).label === `A cycle ${cycle}` &&
            ns.find(n => n.id === two.id).label === `B cycle ${cycle}` &&
            ns.find(n => n.id === one.id).x === one.x + 10 * cycle &&
            ns.find(n => n.id === two.id).x === two.x + 10 * cycle;
        }, [first, second, cycle]).catch(async error => {
          for (const [label, observed] of [['A', a], ['B', b]]) {
            console.error(`DIAGNOSTIC ${name} cycle ${cycle} peer ${label}: ${JSON.stringify(await observed.page.evaluate(() => ({
              online: navigator.onLine, status: document.querySelector('.save-pill')?.textContent,
              nodes: window.__nexo.store.get().nodes.map(({ id, label, x, y }) => ({ id, label, x, y })),
            })))}`);
          }
          console.error(`EXPECTED ${JSON.stringify({ first, second, cycle })}`);
          throw error;
        });
      }
      assert.deepEqual(await nodes(a.page), await nodes(b.page));
      console.log(`PASS ${name} offline cycle ${cycle} no lost move or rename; Reconnecting → Live`);
    }
    // UX review 2, scene 7 (group 3): offline, B moves a card, selects one and opens the inspector, and comes back after
    // about 6 s. While offline the closing handshake of B's socket cannot finish, so the browser reports it closed only
    // after B is back online (held here); the pill returns to Live by itself and A gets the move, with no reload.
    const dot = () => b.page.locator('.save-pill').getAttribute('data-state');
    socket.hold = true;
    await b.context.setOffline(true);
    await b.page.getByText('Offline · edits kept locally', { exact: true }).waitFor();
    assert.equal(await dot(), 'paused', 'the Offline pill has the paused dot');
    await drag(b.page, second.id, 20, 0);
    const offlineX = (await nodes(b.page)).find(n => n.id === second.id).x;
    await card(b.page, first.id).locator('header').click();
    await b.page.getByRole('button', { name: 'Inspector', exact: true, pressed: true }).waitFor();
    // The time offline is the scenario (the review's stuck case came back after about 6 s), not a wait for an event.
    await b.page.waitForTimeout(6000);
    await b.context.setOffline(false);
    await b.page.getByText('Reconnecting', { exact: true }).waitFor();
    assert.equal(await dot(), 'saving', 'the Reconnecting pill has the saving dot');
    socket.release();
    await b.page.getByText('Live', { exact: true }).waitFor({ timeout: 15000 });
    await a.page.waitForFunction(([id, x]) => window.__nexo.store.get().nodes.find(n => n.id === id).x === x, [second.id, offlineX], { timeout: 15000 });
    console.log(`PASS ${name} back online after a move, a selection and the inspector offline, socket closed late: Live, and A sees the move`);
    if (shots) { await shot(b.page); await b.page.screenshot({ path: path.join(shots, `${name}-b-back-online-1440.png`) }); }
    // UX-A6: B moves a card offline, closes the tab and reopens it offline: the move is kept on this device; online, A sees it.
    const url = `${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}&project=${project}`;
    await b.context.setOffline(true);
    await b.page.getByText('Offline · edits kept locally', { exact: true }).waitFor();
    await drag(b.page, second.id, 30, 0);
    const kept = (await nodes(b.page)).find(n => n.id === second.id).x;
    await keptOnDevice(b.page);
    await b.page.close();
    await b.context.route(`${base}/**`, route => { const hit = b.cache.get(route.request().url()); return hit ? route.fulfill(hit) : route.abort('internetdisconnected'); });
    // A page fulfilled by a route has no address space, so Chromium's Local Network Access checks would block the local
    // sidecar; one from the browser's own cache would not.
    if (name === 'chromium') await b.context.grantPermissions(['local-network-access']);
    const reopened = await b.context.newPage();
    await reopened.goto(url); await reopened.waitForSelector('.card');
    await reopened.getByText('Offline · edits kept locally', { exact: true }).waitFor();
    assert.equal((await nodes(reopened)).find(n => n.id === second.id).x, kept, 'the offline move is there after reopening offline');
    assert.notEqual((await nodes(a.page)).find(n => n.id === second.id).x, kept, 'A has not seen it yet');
    console.log(`PASS ${name} offline move survives a closed tab reopened offline`);
    if (shots) { await shot(reopened); await reopened.screenshot({ path: path.join(shots, `${name}-b-reopened-offline-1440.png`) }); }
    await b.context.unroute(`${base}/**`); await b.context.setOffline(false);
    await reopened.getByText('Live', { exact: true }).waitFor();
    await a.page.waitForFunction(([id, x]) => window.__nexo.store.get().nodes.find(n => n.id === id).x === x, [second.id, kept]);
    console.log(`PASS ${name} back online, A sees the move made offline`);
    if (shots) { await shot(a.page); await a.page.screenshot({ path: path.join(shots, `${name}-a-sees-move-1440.png`) }); }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await context.addInitScript(() => { try { sessionStorage.setItem('nexo-mock-admin', 'staff2'); } catch { /* an opaque frame */ } });
    const phone = await context.newPage();
    await phone.goto(url); await phone.waitForSelector('.card');
    await phone.getByRole('button', { name: /^Follow / }).first().waitFor();
    // UX-B1: the phone says so in awareness; A's stack marks it.
    const onPhone = a.page.getByRole('button', { name: /, on a phone$/ });
    await onPhone.waitFor({ timeout: 5000 });
    assert.equal(await onPhone.locator('.presence-device').count(), 1, 'A sees the phone mark');
    console.log(`PASS ${name} A's stack marks the person on a phone`);
    const before = await nodes(phone);
    await drag(phone, first.id, 20, 0);
    assert.deepEqual(await nodes(phone), before, 'phone defaults to read-only');
    console.log(`PASS ${name} phone read-only with avatars`);
    await phone.goto(url + '&mode=edit'); await phone.getByText('Live', { exact: true }).waitFor();
    const old = (await nodes(phone)).find(n => n.id === first.id);
    await drag(phone, first.id, 20, 0);
    // 20 screen pixels are more than 20 canvas units at the phone's fitted zoom: assert the move, then that A converges.
    const moved = (await nodes(phone)).find(n => n.id === first.id).x;
    assert.ok(moved > old.x, `phone mode=edit moves the card (${old.x} -> ${moved})`);
    await a.page.waitForFunction(([id, x]) => window.__nexo.store.get().nodes.find(n => n.id === id).x === x, [first.id, moved]);
    console.log(`PASS ${name} phone mode=edit move reaches peer`);
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
  for (const project of Object.values(projects)) db.prepare('INSERT INTO projects (id, workspace) VALUES (?, ?)').run(project, 'nexo-lab-synthetic');
  db.close();
  const admin = await fakePostgrest(callers);
  let collab;
  try {
    collab = await start({ port: p, dbPath, restUrl: admin.url, anonKey: 'anon-test' });
    const collabUrl = `${collab.wsUrl}/collab`;
    run('sh', ['scripts/vendor-plotly.sh']);
    const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
    let base = await serve({ VITE_COLLAB_URL: collabUrl });
    const failures = [];
    for (const name of ['chromium', 'webkit']) {
      try { await journey(pw, name, base, collab.wsUrl); }
      catch (error) { console.error(`FAIL ${name}: ${error.message}`); failures.push(name); }
    }
    if (failures.length) throw new Error(`Journey failed: ${failures.join(', ')}`);
    console.log('F7 offline and phones OK');
  } finally {
    await stop(); await collab?.close(); await admin.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
