// Nexo Phase 1 small fixes (mock build, Chromium and WebKit, 1440x900):
// 1. a card in render error: the Inspector status says so (not "Up to date"); a run need: the Inspector names it;
// 2. icon close buttons are named in words (Analysis settings: "Close Analysis settings"), none is named "×";
// 3. a fresh longitudinal card shows Team's "Generate analysis" need with no refused render and 0 console errors;
// 4. an API outage (500/502/503/no answer) on autosave: one pill message, no toasts, backoff, recovers by itself;
//    a lost session that cannot be reopened: no retry, "Reopen" offered; Reopen saves the kept edits.
// node tests/dual-ui/test_nexo_small_fixes.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/small-fixes');
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
const shot = (page, file) => page.screenshot({ path: path.join(evidence, file) });
const toastLog = page => page.evaluate(() => { window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('.toast'); const text = t && t.firstChild && t.firstChild.textContent; if (text && window.__toasts.at(-1) !== text) window.__toasts.push(text); })
  .observe(document.body, {subtree:true, childList:true, characterData:true}); });
const pillLog = page => page.evaluate(() => { window.__pills = []; const read = () => { const p = document.querySelector('.save-pill'); const text = p && p.textContent; if (text && window.__pills.at(-1) !== text) window.__pills.push(text); };
  read(); new MutationObserver(read).observe(document.querySelector('.topbar'), {subtree:true, childList:true, characterData:true}); });
async function addCard(page, source) {
  return page.evaluate(async source => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
    await window.__nexo.handle.addCard(source); return window.__nexo.store.get().nodes.find(n => !before.has(n.id) && n.instance?.source === source).id; }, source);
}
async function select(page, id) { await page.evaluate(id => window.__nexo.handle.focusNode(id), id); await card(page, id).locator('header').click(); }
async function confirmDesign(page) {
  const panel = page.locator('.library-panel');
  if (await panel.isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
  await page.evaluate(() => document.querySelectorAll('#library-panel-plots details').forEach(d => { d.open = true; }));
  const row = page.locator('#library-panel-plots .library-row', { has: page.locator('strong', { hasText: /^Differential volcano$/ }) });
  await row.getByRole('button', { name: 'Confirm study design… (Differential volcano)', exact: true }).first().click();
  const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
  await design.getByLabel('Experimental unit').selectOption('Animal');
  await design.getByLabel('Sample relationship').selectOption('independent');
  await design.getByRole('button', { name: 'Confirm study design', exact: true }).click();
  await design.waitFor({ state: 'hidden' });
}
async function open(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await context.addInitScript(() => { const t = setInterval(() => { if (window.__nexoPrefetchMock) { window.__nexoPrefetchMock.timePoints = true; clearInterval(t); } }, 5); });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
  await page.waitForSelector('.card');
  return { context, page, errors };
}
async function journey(pw, name, base) {
  const browser = await pw[name].launch();
  const status = page => page.locator('#inspector > p[role=status]');
  try {
    // 1 + 3. Inspector status follows the card; a fresh longitudinal card asks for nothing the API would refuse.
    {
      const { context, page, errors } = await open({ newContext: o => browser.newContext({ ...o, baseURL: base }) });
      const failing = await addCard(page, 'qc_pca_tab-pca2dVectorPlot');
      await card(page, failing).locator('.body.message').waitFor({ timeout: 15000 });
      await select(page, failing);
      await page.waitForFunction(() => /^Could not draw this plot\. Editable vector view unavailable/.test(document.querySelector('#inspector > p[role=status]')?.textContent || ''), null, { timeout: 10000 });
      assert.equal(await card(page, failing).getAttribute('data-state'), 'error');
      await shot(page, `inspector-error-${name}.png`);
      console.log(`PASS small-fixes ${name} inspector-follows-card-error ("${(await status(page).textContent()).slice(0, 60)}…")`);

      await confirmDesign(page);
      const before = errors.length, refusals = await page.evaluate(() => window.__nexoMock.refusals ?? 0);
      const fresh = await addCard(page, 'longitudinal_tab-macroclass_plot');
      await card(page, fresh).locator('.run-need').waitFor({ timeout: 15000 });
      assert.equal(await card(page, fresh).locator('.run-need').textContent(), 'Generate analysis');
      await select(page, fresh);
      await page.waitForFunction(() => document.querySelector('#inspector > p[role=status]')?.textContent === 'Needs Generate Analysis', null, { timeout: 10000 });
      await page.waitForTimeout(1500);
      const refused = await page.evaluate(() => window.__nexoMock.refusals ?? 0) - refusals;
      assert.equal(refused, 0, 'a render of the fresh longitudinal card was asked and refused');
      assert.deepEqual(errors.slice(before), [], 'console errors for the fresh longitudinal card');
      await shot(page, `longitudinal-fresh-${name}.png`);
      console.log(`PASS small-fixes ${name} fresh-longitudinal-card-gated (0 refused renders, 0 console errors, Inspector "Needs Generate Analysis")`);
      // Generate analysis still works: the gate opens and the card draws.
      await card(page, fresh).locator('.run-need').click();
      await card(page, fresh).locator('.body img').waitFor({ timeout: 15000 });
      await page.waitForFunction(() => document.querySelector('#inspector > p[role=status]')?.textContent === 'Up to date', null, { timeout: 10000 });
      console.log(`PASS small-fixes ${name} generate-analysis-draws-and-inspector-up-to-date`);

      // 2. Close buttons are named in words.
      await page.locator('[data-analysis-trigger]').first().click();
      const sheet = page.getByRole('dialog', { name: 'Analysis settings' });
      await sheet.waitFor();
      const close = sheet.locator('header').getByRole('button', { name: 'Close Analysis settings', exact: true });
      assert.equal(await close.count(), 1);
      assert.equal(await close.textContent(), '×');
      assert.equal(await page.getByRole('button', { name: '×', exact: true }).count(), 0, 'a button is named "×"');
      await shot(page, `analysis-close-${name}.png`);
      await close.click(); await sheet.waitFor({ state: 'hidden' });
      console.log(`PASS small-fixes ${name} close-buttons-named-in-words`);
      await context.close();
    }
    // 4a. API outage on autosave.
    {
      const { context, page } = await open({ newContext: o => browser.newContext({ ...o, baseURL: base }) });
      await toastLog(page); await pillLog(page);
      await page.evaluate(() => { window.__nexoPrefetchMock.saveOutage.status = 500; window.__nexo.autosave.markDirty(); return window.__nexo.autosave.flush(); });
      await page.waitForFunction(() => document.querySelector('.save-pill')?.textContent === "Can't reach the server · retrying");
      const t0 = Date.now();
      await page.evaluate(() => { window.__nexoPrefetchMock.saveOutage.status = 502; });
      await page.waitForFunction(() => window.__nexoPrefetchMock.saveOutage.hits >= 2, null, { timeout: 12000 });
      await page.evaluate(() => { window.__nexoPrefetchMock.saveOutage.status = 0; window.__nexo.autosave.markDirty(); });
      await page.waitForFunction(() => window.__nexoPrefetchMock.saveOutage.hits >= 3, null, { timeout: 20000 });
      const t1 = Date.now();
      assert(t1 - t0 >= 13000, `retries were not backed off (${t1 - t0} ms for two retries)`);
      await shot(page, `outage-pill-${name}.png`);
      await page.evaluate(() => { window.__nexoPrefetchMock.saveOutage.status = null; });
      await page.waitForFunction(() => /^Saved ·/.test(document.querySelector('.save-pill')?.textContent || ''), null, { timeout: 30000 });
      const pills = await page.evaluate(() => window.__pills), toasts = await page.evaluate(() => window.__toasts);
      const during = pills.slice(pills.indexOf("Can't reach the server · retrying"), pills.findIndex(p => /^Saved ·/.test(p)));
      assert.deepEqual(during, ["Can't reach the server · retrying"], `pill flickered: ${JSON.stringify(pills)}`);
      assert.deepEqual(toasts, [], `toasts during the outage: ${JSON.stringify(toasts)}`);
      const state = await page.evaluate(() => window.__nexo.autosave.state());
      assert.equal(state.savedRevision, state.revision, 'an edit made during the outage was not saved');
      await shot(page, `outage-recovered-${name}.png`);
      console.log(`PASS small-fixes ${name} outage-one-pill-message-no-toasts-backoff-recovers (pills ${JSON.stringify(pills)}, ${await page.evaluate(() => window.__nexoPrefetchMock.saveOutage.hits)} refused saves)`);
      await context.close();
    }
    // 4b. Lost session (409) whose reopen fails: no retry, Reopen offered; Reopen saves the kept edits.
    {
      const { context, page } = await open({ newContext: o => browser.newContext({ ...o, baseURL: base }) });
      await toastLog(page);
      await page.evaluate(() => { const m = window.__nexoPrefetchMock; m.failReopen(true); m.evict(409); window.__nexo.autosave.markDirty(); return window.__nexo.autosave.flush(); });
      const reopen = page.locator('.topbar').getByRole('button', { name: /^Reopen the analysis session/ });
      await reopen.waitFor({ timeout: 20000 });
      assert.equal(await reopen.textContent(), 'Reopen');
      assert.match(await page.locator('.save-pill').textContent(), /Session lost/);
      const calls = await page.evaluate(() => window.__nexoPrefetchMock.sessionCalls.length);
      await page.evaluate(() => window.__nexo.autosave.markDirty()); await page.waitForTimeout(6000);
      assert.equal(await page.evaluate(() => window.__nexoPrefetchMock.sessionCalls.length), calls, 'autosave kept retrying a lost session');
      const toasts = await page.evaluate(() => window.__toasts);
      assert(!toasts.some(t => /Request failed/.test(t)), `raw failure toasts: ${JSON.stringify(toasts)}`);
      await shot(page, `lost-reopen-offered-${name}.png`);
      console.log(`PASS small-fixes ${name} lost-session-no-retry-reopen-offered`);
      const revision = await page.evaluate(() => window.__nexo.autosave.state().revision);
      await page.evaluate(() => window.__nexoPrefetchMock.failReopen(false));
      await reopen.click();
      await page.waitForFunction(() => /^Saved ·/.test(document.querySelector('.save-pill')?.textContent || ''), null, { timeout: 20000 });
      assert.equal(await reopen.count(), 0); assert.equal(await page.locator('.session-lost').count(), 0);
      assert.equal(await page.evaluate(() => window.__nexo.autosave.state().savedRevision), revision, 'the kept edits were not saved after Reopen');
      await shot(page, `lost-reopened-saved-${name}.png`);
      console.log(`PASS small-fixes ${name} reopen-saves-kept-edits`);
      await context.close();
    }
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP small-fixes Playwright: ${e.message}`); return; } throw e; }
  fs.mkdirSync(evidence, { recursive: true });
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
  for (const name of ['chromium', 'webkit']) await journey(pw, name, base);
  console.log('small-fixes OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
