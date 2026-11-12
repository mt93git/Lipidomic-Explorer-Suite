// NEXO-P5: Team's PCA score analysis under Statistics of a dashboard PCA card, in Chromium and WebKit (mock build).
// Open a PCA card, Statistics, run the analysis, change the test family (it runs again), save and reopen.
// node tests/dual-ui/test_nexo_pca_score.cjs      (NEXO_BROWSERS=chromium limits the run; screenshots in <tmp>/nexo-p5)
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const shots = path.join(require('node:os').tmpdir(), 'nexo-p5');
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
    // Team's controls and defaults; Team's status sentence before Run.
    assert.equal(await inspector.locator('#pcs_pc').inputValue(), 'PC1');
    assert.equal(await inspector.locator('#pcs_test').inputValue(), 'rank');
    assert.equal(await inspector.locator('#pcs_corr').inputValue(), 'BH');
    assert.equal(await inspector.locator('.field-checkboxgroup input[type=checkbox]:checked').count(), 3);
    await inspector.locator('[data-pca-score="waiting"]', { hasText: 'Choose the component, groups and tests, then run the analysis.' }).waitFor();
    console.log(`PASS P5 ${name} statistics-tab-shows-team-controls-and-defaults`);
    // Run: Team's boxplot with brackets and stars, the group table and the report.
    await button(inspector, 'Run PCA score analysis').click();
    await inspector.locator('.pca-score-plot.js-plotly-plot').waitFor({ timeout: 15000 });
    await report(inspector).filter({ hasText: 'Kruskal-Wallis across all 3 groups' }).waitFor();
    assert.equal(await inspector.locator('table.pca-score-table tbody tr').count(), 3);
    assert.equal(await inspector.locator('.pca-score-plot .shapelayer path').count(), 3);
    await inspector.locator('.pca-score').screenshot({ path: path.join(shots, `${name}-1-run.png`) });
    console.log(`PASS P5 ${name} run-shows-boxplot-table-report`);
    // Change the test family: the card's input is sent, then Run again; the result follows.
    await inspector.locator('#pcs_test').selectOption('param');
    await report(inspector).filter({ hasText: 'One-way ANOVA across all 3 groups' }).waitFor({ timeout: 10000 });
    await report(inspector).filter({ hasText: 'Welch t-test on each pair' }).waitFor();
    const patches = await page.evaluate(i => window.__nexoMock.cardPatches.filter(p => p.instance === i).map(p => p.body), added.instance.instanceId);
    assert.deepEqual(patches.slice(-2), [{ inputs: { pcs_test: 'param' }, actions: [] }, { inputs: {}, actions: ['pcs_run'] }]);
    await inspector.locator('.pca-score-plot .annotation-text', { hasText: 'One-way ANOVA p =' }).waitFor();
    await inspector.locator('.pca-score').screenshot({ path: path.join(shots, `${name}-2-param.png`) });
    console.log(`PASS P5 ${name} change-test-family-runs-again`);
    // The Data tab keeps Team's PCA settings only; the Run button is not there.
    await inspector.getByRole('tab', { name: 'Data', exact: true }).click();
    assert.equal(await button(inspector, 'Run PCA score analysis').count(), 0);
    // Save and reopen: the choice is Team's instance input, the Run press Nexo's member; the analysis reopens the same.
    const saved = await page.evaluate(id => { const s = window.__nexo.store.get(); return { inputs: s.nodes.find(n => n.id === id).instance.inputs, actions: s.nexo.nodes[id]?.actions }; }, added.id);
    assert.equal(saved.inputs.pcs_test, 'param'); assert.ok(JSON.stringify(saved.actions).includes('pcs_run'));
    await button(page, 'Export figure ▾').click(); await button(page, 'Save checkpoint…').click();
    const dialog = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await dialog.getByRole('textbox', { name: 'New checkpoint name' }).fill('PCA score');
    await button(dialog, 'Save current analysis').click(); await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => /^[a-f0-9]{64}$/.test(new URL(location.href).searchParams.get('checkpoint') ?? ''));
    await page.reload(); await page.waitForSelector(`.card[data-id="${added.id}"]`);
    inspector = await openStatistics(page, added.id);
    await report(inspector).filter({ hasText: 'One-way ANOVA across all 3 groups' }).waitFor({ timeout: 15000 });
    assert.equal(await inspector.locator('#pcs_test').inputValue(), 'param');
    await inspector.locator('.pca-score-plot.js-plotly-plot').waitFor();
    await inspector.locator('.pca-score').screenshot({ path: path.join(shots, `${name}-3-reopened.png`) });
    console.log(`PASS P5 ${name} save-and-reopen-keeps-settings-and-analysis`);
    assert.deepEqual(errors, []); console.log(`PASS P5 ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP P5 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('P5 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
