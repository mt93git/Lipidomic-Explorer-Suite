// H9: a lost API session (mock eviction) is reopened once and the plots are put back without a reload.
// node tests/dual-ui/test_nexo_session_reopen.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
let server;
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
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
const toastLog = page => page.evaluate(() => { window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('.toast'); const text = t && t.firstChild && t.firstChild.textContent; if (text && window.__toasts.at(-1) !== text) window.__toasts.push(text); })
  .observe(document.body, {subtree:true, childList:true, characterData:true}); });
async function journey(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const inspector = page.locator('#inspector');
    const id = await page.evaluate(async () => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard('cellular_org_tab-polarPlot'); return window.__nexo.store.get().nodes.find(n => !before.has(n.id)).id; });
    const instance = await page.evaluate(id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); return n.instance.instanceId ?? n.instance.id; }, id);
    await page.evaluate(id => window.__nexo.handle.focusNode(id), id); await card(page, id).locator('header').click();
    await inspector.getByRole('tab', {name:'Data',exact:true}).click();
    const colour = inspector.getByLabel('Colour for Control', {exact:true}), shape = inspector.getByRole('combobox', {name:'Shape for Control',exact:true});
    await shape.waitFor();
    // First edit, on the original session.
    await colour.fill('#aa3300');
    await page.waitForFunction(i => (window.__nexoMock.labels[i] || '').includes('#aa3300'), instance);
    const before = await page.evaluate(i => window.__nexoMock.labels[i], instance);
    assert.match(before, /Circle/);
    await page.evaluate(() => window.__nexo.autosave.flush());
    await toastLog(page);
    // The API evicts the session: every session route now answers 409 session_lost.
    const mark = await page.evaluate(() => { window.__nexoPrefetchMock.evict(409); return window.__nexoPrefetchMock.sessionCalls.length; });
    const lost = await page.evaluate(() => window.__nexo.handle.getSession().sessionId);
    // Second edit: its PATCH meets the lost session, the client reopens, puts the card back and sends it again.
    await shape.selectOption('17');
    await page.waitForFunction(() => (window.__toasts || []).includes('Analysis reconnected. Your plots were restored.'), null, {timeout:20000});
    await page.waitForFunction(i => { const l = window.__nexoMock.labels[i] || ''; return l.includes('#aa3300') && l.includes('Triangle'); }, instance, {timeout:20000});
    const toasts = await page.evaluate(() => window.__toasts);
    assert(toasts.includes('Reconnecting to the analysis…'), `toasts: ${JSON.stringify(toasts)}`);
    console.log(`PASS H9 ${name} evicted-session-reopened-card-redrawn-with-both-inputs (${await page.evaluate(i => window.__nexoMock.labels[i], instance)})`);
    // Autosave resumes and succeeds on the reopened session.
    await page.evaluate(() => { window.__nexo.autosave.markDirty(); return window.__nexo.autosave.flush(); });
    await page.waitForFunction(() => /Saved ·/.test(document.querySelector('.save-pill').textContent), null, {timeout:10000});
    console.log(`PASS H9 ${name} autosave-succeeds-after-reopen`);
    const calls = await page.evaluate(m => window.__nexoPrefetchMock.sessionCalls.slice(m), mark);
    assert(calls.every(c => c.attempt <= 1), 'a request was retried more than once');
    const onLost = calls.filter(c => c.id === lost), retried = calls.filter(c => c.attempt === 1);
    // Each request lost on the evicted id is sent once more (on the reopened id), never again on the lost one.
    assert(onLost.length >= 1 && onLost.every(c => c.attempt === 0), JSON.stringify(onLost));
    assert.equal(retried.length, onLost.length, `retries ${retried.length} vs lost ${onLost.length}`);
    assert(retried.every(c => c.id !== lost));
    assert.equal(await page.evaluate(() => window.__nexoPrefetchMock.session.opens), 2, 'one reopen');
    assert.equal(await page.locator('.session-lost').count(), 0);
    console.log(`PASS H9 ${name} one-reopen-each-lost-request-retried-once (${onLost.length} lost, ${retried.length} retried, ${calls.length} calls)`);
    await context.close();
    // Recovery forced to fail (404 Unknown session., as after an API restart, and the checkpoint cannot be reopened).
    const failing = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const fp = await failing.newPage();
    await fp.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await fp.waitForSelector('.card');
    const first = await fp.evaluate(() => window.__nexo.store.get().nodes[0].id);
    const start = await fp.evaluate(() => { const m = window.__nexoPrefetchMock; m.failReopen(true); m.evict(404); return m.sessionCalls.length; });
    await fp.evaluate(id => window.__nexo.handle.refreshCard(id), first);
    const alert = fp.locator('.session-lost[role=alert]');
    await alert.waitFor({timeout:20000});
    assert.match(await alert.textContent(), /could not be reopened/);
    assert.equal(await alert.getByRole('button', {name:'Reload', exact:true}).count(), 1);
    await fp.evaluate(() => { window.__nexo.autosave.markDirty(); return window.__nexo.autosave.flush(); });
    await fp.waitForFunction(() => document.querySelector('.save-pill').textContent.includes('Session lost'));
    const settled = await fp.evaluate(() => window.__nexoPrefetchMock.sessionCalls.length);
    // No retry storm: edits, redraws and autosave meet the lost session without new requests for 12 s.
    for (let i = 0; i < 3; i++) { await fp.evaluate(id => { window.__nexo.handle.refreshCard(id); window.__nexo.autosave.markDirty(); }, first); await fp.waitForTimeout(4000); }
    const after = await fp.evaluate(() => window.__nexoPrefetchMock.sessionCalls.length);
    assert.equal(after, settled, `requests kept going after the failed recovery: ${after - settled}`);
    assert.equal(await fp.evaluate(() => window.__nexoPrefetchMock.session.opens), 2, 'one failed reopen, no loop');
    assert(settled - start <= 40, `too many requests before the failure settled: ${settled - start}`);
    assert.equal(await alert.count(), 1);
    console.log(`PASS H9 ${name} failed-reopen-persistent-reload-message-no-retry-storm (${settled - start} requests, 0 after)`);
    await failing.close();
  } finally { await browser.close(); }
}
// Steph review rows 2/12: the author's confirmed design is kept in Nexo's member; a reopen does not confirm it by itself
// (Team's restore clears the confirmation) but opens "Confirm study design" prefilled with it, one click; opening or
// reopening leaves the save pill clean.
async function designReopen(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const pill = () => page.locator('.save-pill').textContent();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card'); await page.waitForTimeout(1500);
    const dialog = page.getByRole('dialog', { name: 'Confirm study design', exact: true });
    assert.equal(await dialog.count(), 0, 'no saved design: nothing is asked on open');
    assert.doesNotMatch(await pill(), /Unsaved/, 'opening marks nothing unsaved');
    // Paula confirms Human / independent (not the dialog's default unit).
    await page.evaluate(() => document.querySelector('#canvas-host').dispatchEvent(new CustomEvent('nexo-card-action', { detail: { action: 'design', nodeId: 'results_dashboard-plot_pca' } })));
    await dialog.waitFor();
    await dialog.getByLabel('Experimental unit').selectOption('Human');
    await dialog.getByRole('button', { name: 'Confirm study design', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.__nexo.store.get().nexo.design), { unit: 'Human', type: 'independent' });
    await page.waitForFunction(() => /Unsaved/.test(document.querySelector('.save-pill').textContent));
    await page.evaluate(() => window.__nexo.autosave.flush());
    await page.waitForFunction(() => /Saved ·/.test(document.querySelector('.save-pill').textContent));
    console.log(`PASS steph ${name} confirmed-design-kept-in-nexo-member-and-saved`);
    // Steph reopens it: asked again (Team restores no confirmation), prefilled, with where it comes from.
    await page.goto(page.url()); await page.waitForSelector('.card');
    await dialog.waitFor({ timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__nexo.handle.getSession().design?.confirmed ?? false), false, 'not confirmed by itself');
    assert.equal(await dialog.getByLabel('Experimental unit').inputValue(), 'Human');
    assert.equal(await dialog.getByLabel('Sample relationship').inputValue(), 'independent');
    assert.match(await dialog.textContent(), /Saved with this design by the author; confirm to enable differential plots\./);
    await page.waitForTimeout(1500);
    assert.doesNotMatch(await pill(), /Unsaved/, `reopen pill: ${await pill()}`);
    console.log(`PASS steph ${name} reopen-asks-design-prefilled-pill-clean (${await pill()})`);
    await dialog.getByRole('button', { name: 'Confirm study design', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__nexo.handle.getSession().design.confirmed), true);
    await page.waitForTimeout(1500);
    assert.doesNotMatch(await pill(), /Unsaved/, `after confirming the same design: ${await pill()}`);
    assert.deepEqual(errors, []);
    console.log(`PASS steph ${name} one-click-confirm-same-design-stays-clean`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H9 Playwright: ${e.message}`); return; } throw e; }
  run('sh', ['scripts/vendor-plotly.sh']);
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1' });
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  for (const name of ['chromium', 'webkit']) { await designReopen(pw, name, base); await journey(pw, name, base); }
  console.log('H9 session reopen OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
