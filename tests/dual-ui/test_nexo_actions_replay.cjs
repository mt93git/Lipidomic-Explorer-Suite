// Chart audit b07 F3: module action presses survive Duplicate and Save->reopen. The mock models an action-gated card
// (structural_tab-summaryPlot draws Team's placeholder until "Initiate Structural Analysis" is pressed on that
// session's card, src/api.ts mockPressed) and the replay route (POST .../replay, cards.R api_card_replay).
// NEXO-P2: the card presses that button itself once the comparison is ready (Team card_status.js autoRun) and records
// the press like a manual one; the Structure figures are Plotly charts.
// Mock build, Chromium and WebKit, 1440x900. node tests/dual-ui/test_nexo_actions_replay.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/module-actions-replay');
const SOURCE = 'structural_tab-summaryPlot', LABEL = 'Structural remodeling shifts', BUTTON = 'Initiate Structural Analysis';
const PLACEHOLDER = "Click 'Initiate Structural Analysis' in the left sidebar";
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
const nodes = page => page.evaluate(() => window.__nexo.store.get().nodes);
const plots = async page => (await nodes(page)).filter(n => n.instance?.source === SOURCE);
const instanceOf = n => n.instance.instanceId ?? n.instance.id;
const member = (page, id) => page.evaluate(id => window.__nexo.store.get().nexo.nodes[id]?.actions ?? null, id);
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
// The last figure the mock drew for this instance: Team's placeholder or the plot.
async function drawn(page, n, want, what) {
  const instance = instanceOf(n);
  await page.waitForFunction(([instance, id]) => { const label = window.__nexoMock.labels[instance];
    const img = document.querySelector(`.card[data-id="${id}"] img`); // at 40 % a Plotly card shows its picture
    return typeof label === 'string' && (!!document.querySelector(`.card[data-id="${id}"] .js-plotly-plot`) || (!!img && img.complete && img.naturalWidth > 0)); }, [instance, n.id], { timeout: 15000 })
    .catch(async () => { throw new Error(`${what}: no image (${await page.evaluate(i => window.__nexoMock.labels[i], instance)})`); });
  await page.waitForFunction(([instance, placeholder, want]) => (window.__nexoMock.labels[instance] === placeholder) === (want === 'placeholder'), [instance, PLACEHOLDER, want], { timeout: 15000 })
    .catch(async () => { throw new Error(`${what}: want ${want}, drew ${await page.evaluate(i => window.__nexoMock.labels[i], instance)}`); });
}
async function confirmDesign(dialog) {
  await dialog.waitFor();
  await dialog.getByLabel('Experimental unit').selectOption('Animal');
  await dialog.getByLabel('Sample relationship').selectOption('independent');
  await dialog.getByRole('button', { name: 'Confirm study design', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
async function designOnCards(page) {
  // Steph review rows 2/12: a checkpoint saved with a confirmed design asks for it at once on reopen (prefilled).
  const asked = page.getByRole('dialog', { name: 'Confirm study design', exact: true });
  if (await asked.waitFor({ timeout: 3000 }).then(() => true, () => false)) { await confirmDesign(asked); return; }
  for (const n of await plots(page)) {
    const b = card(page, n.id).getByRole('button', { name: 'Study design', exact: true });
    if (await b.count() && await b.first().isVisible()) { await b.first().click(); await confirmDesign(page.getByRole('dialog', { name: 'Confirm study design', exact: true })); return; }
  }
}
async function dataTab(page, id) {
  await page.evaluate(id => window.__nexo.handle.focusNode(id), id);
  await card(page, id).locator('header').click();
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.4));
    // 1. Add the action-gated card (after the study design, as a user): Team's placeholder until Initiate.
    await page.getByRole('button', { name: 'Plots', exact: true }).click();
    await page.getByLabel('Search plots').fill(LABEL);
    await page.getByRole('button', { name: `Confirm study design… (${LABEL})`, exact: true }).click();
    await confirmDesign(page.getByRole('dialog', { name: 'Confirm study design', exact: true }));
    if (!(await plots(page)).length) await page.evaluate(source => window.__nexo.handle.addCard(source), SOURCE);
    await page.waitForFunction(source => window.__nexo.store.get().nodes.some(n => n.instance?.source === source), SOURCE, { timeout: 10000 });
    const original = (await plots(page))[0];
    await drawn(page, original, 'plot', 'pressed by itself');
    assert.deepEqual(await page.evaluate(i => window.__nexoMock.cardPatches.filter(p => p.instance === i).map(p => p.body.actions), instanceOf(original)), [['runAnalysis']], 'one press, by the card');
    assert.deepEqual(await member(page, original.id), ['runAnalysis'], "the press is recorded in Nexo's member");
    assert.equal(original.instance.inputs.runAnalysis, undefined, 'never an instance input');
    console.log(`PASS F3 ${name} card-presses-itself-and-records-in-nexo-member`);
    // 2. Duplicate: the copy is replayed before it is drawn, and records the press too.
    await page.evaluate(id => window.__nexo.handle.duplicate(id), original.id);
    await page.waitForFunction(source => window.__nexo.store.get().nodes.filter(n => n.instance?.source === source).length === 2, SOURCE, { timeout: 10000 });
    const copy = (await plots(page)).find(n => n.id !== original.id);
    await drawn(page, copy, 'plot', 'copy');
    assert.deepEqual(await page.evaluate(i => window.__nexoMock.replays.filter(r => r.instance === i).map(r => r.actions), instanceOf(copy)), [['runAnalysis']]);
    assert.deepEqual(await member(page, copy.id), ['runAnalysis']);
    fs.mkdirSync(evidence, { recursive: true });
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-duplicate-drawn.png') });
    console.log(`PASS F3 ${name} duplicate-copy-drawn`);
    // 3. Save -> reopen (reload): each restored card is replayed once and drawn, not Team's placeholder.
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).click();
    await page.getByRole('button', { name: 'Save checkpoint…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await dialog.getByRole('textbox', { name: 'New checkpoint name' }).fill('replay');
    await dialog.getByRole('button', { name: 'Save current analysis', exact: true }).click();
    await page.locator('.toast', { hasText: 'Saved checkpoint replay' }).waitFor({ timeout: 5000 });
    await dialog.waitFor({ state: 'hidden' });
    await page.reload(); await page.waitForSelector('.card');
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.4));
    await designOnCards(page);
    for (const n of await plots(page)) {
      assert.deepEqual(await member(page, n.id), ['runAnalysis'], 'the member survives save/reopen');
      await drawn(page, n, 'plot', `reopened ${n.id}`);
    }
    const replays = await page.evaluate(() => window.__nexoMock.replays.map(r => r.instance));
    assert.deepEqual([...replays].sort(), [instanceOf(original), instanceOf(copy)].sort(), 'one replay per restored card');
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-reopen-drawn.png') });
    console.log(`PASS F3 ${name} save-reopen-drawn`);
    // 4. A replay that fails: the copy keeps Team's placeholder and the Inspector says the button must be pressed again.
    await page.evaluate(() => { window.__nexoMock.replayFault = true; });
    const reopened = (await plots(page))[0];
    await page.evaluate(id => window.__nexo.handle.duplicate(id), reopened.id);
    await page.waitForFunction(source => window.__nexo.store.get().nodes.filter(n => n.instance?.source === source).length === 3, SOURCE, { timeout: 10000 });
    const ids = (await plots(page)).map(n => n.id), failedCopy = (await plots(page)).find(n => n.id === ids[ids.length - 1]);
    await drawn(page, failedCopy, 'placeholder', 'failed replay');
    await dataTab(page, failedCopy.id);
    const alert = page.getByRole('alert').filter({ hasText: `Nexo could not press "${BUTTON}" again` });
    await alert.waitFor({ timeout: 5000 });
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-replay-failed.png') });
    await page.evaluate(() => { window.__nexoMock.replayFault = false; });
    await page.getByRole('button', { name: BUTTON, exact: true }).click();
    await drawn(page, failedCopy, 'plot', 'pressed again');
    await alert.waitFor({ state: 'hidden', timeout: 5000 });
    console.log(`PASS F3 ${name} replay-failure-placeholder-and-inspector-message`);
    assert.deepEqual(errors.filter(e => !/Failed to load resource/.test(e)), []); console.log(`PASS F3 ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F3 Playwright: ${e.message}`); return; } throw e; }
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
  for (const name of ['chromium', 'webkit']) await browserTests(pw, name, base);
  console.log('F3 actions replay OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
