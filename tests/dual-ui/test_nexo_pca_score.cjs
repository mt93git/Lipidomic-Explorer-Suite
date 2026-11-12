// NEXO-P5/P8: Team's PCA score analysis under Statistics of a dashboard PCA card, in Chromium and WebKit (mock build).
// Since Team 8e2f5c07/eac6bb75: open a PCA card, Statistics, choose the tests (the report follows, no Run), press
// "Plot on canvas": a PCA score card (620x700, the PCA card's settings) appears with Team's figure and group table;
// save and reopen keep it. node tests/dual-ui/test_nexo_pca_score.cjs  (NEXO_BROWSERS=chromium limits the run)
// Screenshots: docs/integration/nexo-team-parity/p8-{before,after}-pca-score-<engine>.png
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const shots = path.join(root, 'docs/integration/nexo-team-parity');
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
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const report = inspector => inspector.locator('.pca-score .pca-score-line');
async function openStatistics(page, id) {
  await page.locator(`.card[data-id="${id}"] header`).click();
  const inspector = page.locator('#inspector');
  await inspector.getByRole('tab', { name: 'Statistics', exact: true }).click();
  await inspector.getByRole('region', { name: 'PCA score analysis', exact: true }).waitFor();
  return inspector;
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    // A PCA card from the Library (a Team instance: its settings are Team's instance inputs).
    if (!(await page.locator('.library-panel:not([hidden])').count())) await page.getByRole('button', { name: /^Plots/ }).first().click();
    await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
    const before = await page.evaluate(() => window.__nexo.store.get().nodes.length);
    await page.locator('button.library-add[aria-label="Add Principal components"]').first().click();
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length > n, before);
    const added = await page.evaluate(() => window.__nexo.store.get().nodes.at(-1));
    assert.equal(added.instance?.source, 'results_dashboard-plot_pca');
    let inspector = await openStatistics(page, added.id);
    // Team's controls and defaults; the report follows them at once (no Run, no inline figure or table).
    assert.equal(await inspector.locator('#pcs_pc').inputValue(), 'PC1');
    assert.equal(await inspector.locator('#pcs_test').inputValue(), 'rank');
    assert.equal(await inspector.locator('#pcs_corr').inputValue(), 'BH');
    assert.equal(await inspector.locator('.field-checkboxgroup input[type=checkbox]:checked').count(), 3);
    await report(inspector).filter({ hasText: 'Kruskal-Wallis across all 3 groups' }).waitFor({ timeout: 10000 });
    assert.equal(await button(inspector, 'Run PCA score analysis').count(), 0);
    assert.equal(await inspector.locator('.pca-score .js-plotly-plot, .pca-score table').count(), 0);
    console.log(`PASS P8 ${name} statistics-tab-shows-team-controls-and-report-without-run`);
    // Run the analysis with the parametric tests: the card's input is sent and the report follows.
    await inspector.locator('#pcs_test').selectOption('param');
    await report(inspector).filter({ hasText: 'One-way ANOVA across all 3 groups' }).waitFor({ timeout: 10000 });
    const patches = await page.evaluate(i => window.__nexoMock.cardPatches.filter(p => p.instance === i).map(p => p.body), added.instance.instanceId);
    assert.deepEqual(patches.at(-1), { inputs: { pcs_test: 'param' }, actions: [] });
    const nodesBefore = await page.evaluate(() => window.__nexo.store.get().nodes.length);
    await page.screenshot({ path: path.join(shots, `p8-before-pca-score-${name}.png`) });
    console.log(`PASS P8 ${name} change-test-family-report-follows`);
    // Plot on canvas: a PCA score card with the PCA card's settings, at Team's 620x700, drawing Team's figure.
    await button(inspector, 'Plot on canvas').click();
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length > n, nodesBefore);
    const score = await page.evaluate(() => window.__nexo.store.get().nodes.at(-1));
    assert.equal(score.instance?.source, 'results_dashboard-plot_pcascore');
    assert.equal(score.label, 'PCA score analysis · PC1');
    assert.deepEqual([score.width, score.height], [620, 700]);
    assert.equal(score.instance.inputs.pcs_test, 'param');
    const card = page.locator(`.card[data-id="${score.id}"]`);
    await card.locator('.js-plotly-plot .boxlayer .trace.boxes').first().waitFor({ timeout: 15000 });
    assert.equal(await card.locator('.boxlayer .trace.boxes').count(), 3);
    await card.locator('.annotation-text', { hasText: 'Median PC1' }).waitFor();
    assert.equal(await card.locator('.shapelayer path').count(), 3);
    // The new card is brought into view beside the inspector (revealAddedAfterLayout); the shot waits for it.
    await page.waitForFunction(id => { const c = document.querySelector(`.card[data-id="${id}"]`)?.getBoundingClientRect(), i = document.querySelector('#inspector')?.getBoundingClientRect();
      return c && i && c.right <= i.left + 1 && c.left >= 0 && c.top >= 0; }, score.id, { timeout: 10000 });
    await page.screenshot({ path: path.join(shots, `p8-after-pca-score-${name}.png`) });
    console.log(`PASS P8 ${name} plot-on-canvas-adds-the-pca-score-card-with-its-figure`);
    // The PCA score card's Statistics tab keeps the controls and the report, without the button.
    inspector = await openStatistics(page, score.id);
    await report(inspector).filter({ hasText: 'One-way ANOVA across all 3 groups' }).waitFor({ timeout: 10000 });
    assert.equal(await button(inspector, 'Plot on canvas').count(), 0);
    console.log(`PASS P8 ${name} score-card-statistics-has-controls-without-button`);
    // Save and reopen: the PCA score card and its settings come back.
    await button(page, 'Export figure ▾').click(); await button(page, 'Save checkpoint…').click();
    const dialog = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await dialog.getByRole('textbox', { name: 'New checkpoint name' }).fill('PCA score');
    await button(dialog, 'Save current analysis').click(); await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => /^[a-f0-9]{64}$/.test(new URL(location.href).searchParams.get('checkpoint') ?? ''));
    await page.reload(); await page.waitForSelector(`.card[data-id="${score.id}"]`);
    const back = await page.evaluate(id => window.__nexo.store.get().nodes.find(n => n.id === id), score.id);
    assert.equal(back.instance.source, 'results_dashboard-plot_pcascore'); assert.equal(back.instance.inputs.pcs_test, 'param');
    await page.locator(`.card[data-id="${score.id}"] .boxlayer .trace.boxes`).first().waitFor({ timeout: 15000 });
    console.log(`PASS P8 ${name} save-and-reopen-keeps-the-pca-score-card`);
    assert.deepEqual(errors, []); console.log(`PASS P8 ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP P8 Playwright: ${e.message}`); return; } throw e; }
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
  require('node:fs').mkdirSync(shots, { recursive: true });
  for (const name of (process.env.NEXO_BROWSERS || 'chromium,webkit').split(',')) await browserTests(pw, name, base);
  console.log('P8 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
