// NEXO-P6: Team parity on a restored board (mock build, Chromium and WebKit).
//   2. A Batch card without 2 BQC samples shows Team's sentence as a small grey centred note; the card is up to date.
//   4. A board's fixed violin view (no instance) shows no "n = N samples" labels; an instance copy does (Team attaches
//      violin statistics only to an instance).
//   5. Selected-feature distributions in a card shorter than Team's plot height: the image is drawn at the plot height
//      (violin_zoom_pct) and contained in the card; reopening keeps violin_zoom_pct.
// Screenshots: docs/integration/nexo-team-parity/<NEXO_PARITY_SHOT or "after">-<item>-<engine>.png, taken before the
// assertions so the same file records the state of any build.
// node tests/dual-ui/test_nexo_team_parity.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const evidence = process.env.NEXO_PARITY_EVIDENCE || path.join(root, 'docs/integration/nexo-team-parity');
const shot = process.env.NEXO_PARITY_SHOT || 'after';
const session = require(path.join(nexo, 'src/mock/session.json'));
const BATCH = 'tcinstance_0123456789ab-bqcPlot', VIOLIN = 'tcinstance_0123456789ac-plot_violin', FIXED = 'results_dashboard-plot_violin';
const TALL = 'tcinstance_0123456789ad-violin_plot_render', PLOT_HEIGHT = 2340;
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
const fixedViolin = session.canvas.nodes.find(n => n.id === FIXED);
const board = {
  ...session.canvas,
  nodes: [
    { kind: 'plot', id: BATCH, label: 'Batch quality check', x: 40, y: 40, width: 440, height: 330, finished: null, visual: {},
      instance: { id: 'tcinstance_0123456789ab', source: 'qc_pca_tab-bqcPlot', inputs: {} } },
    { ...fixedViolin, x: 520, y: 40, width: 440, height: 330 },
    { kind: 'plot', id: VIOLIN, label: 'Feature distributions', x: 1000, y: 40, width: 440, height: 330, finished: null, visual: {},
      instance: { id: 'tcinstance_0123456789ac', source: 'results_dashboard-plot_violin', inputs: {} } },
    { kind: 'plot', id: TALL, label: 'Selected-feature distributions', x: 40, y: 420, width: 440, height: 720, finished: null, visual: {},
      instance: { id: 'tcinstance_0123456789ad', source: 'heatmap_barchart_tab-violin_plot_render', inputs: { violin_zoom_pct: PLOT_HEIGHT } } },
  ],
};
const id = 'c'.repeat(64);
const saved = [{ record: { id, name: 'Synthetic parity board', sizeBytes: 1, sha256: id, createdAt: '2026-11-11T00:00:00Z', source: 'store' }, state: board }];
const card = (page, nodeId) => page.locator(`.card[data-id="${nodeId}"]`);
const nLabels = (page, nodeId) => card(page, nodeId).evaluate(el => {
  const gd = el.querySelector('.js-plotly-plot'); return gd ? (gd.layout.annotations || []).filter(a => String(a.name || '').startsWith('tcstat-n-')).length : -1;
});

async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await context.addInitScript(value => { if (location.protocol === 'http:') sessionStorage.setItem('nexo-mock-checkpoints-v1', value); }, JSON.stringify(saved));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error' && !/status of 422/.test(m.text())) errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${id}`);
    await page.waitForSelector(`.card[data-id="${TALL}"]`);
    fs.mkdirSync(evidence, { recursive: true });
    const file = item => path.join(evidence, `${shot}-${item}-${name}.png`);

    // 2. Team's validation sentence: a grey centred note, the card up to date.
    await page.evaluate(nodeId => window.__nexo.handle.focusNode(nodeId), BATCH);
    const batch = card(page, BATCH);
    await batch.locator('.body p').waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    await batch.screenshot({ path: file('2-batch-note') });
    const note = await batch.evaluate(el => { const p = el.querySelector('.body p'), b = p.getBoundingClientRect(), body = el.querySelector('.body').getBoundingClientRect();
      return { state: el.dataset.state, cls: p.className, color: getComputedStyle(p).color, centre: Math.abs((b.left + b.right) / 2 - (body.left + body.right) / 2) < 2 && Math.abs((b.top + b.bottom) / 2 - (body.top + body.bottom) / 2) < 2 }; });
    assert.deepEqual(note, { state: 'current', cls: 'validation-note', color: 'rgb(136, 136, 136)', centre: true });
    console.log(`PASS P6 ${name} batch-sentence-is-a-grey-centred-note-card-up-to-date`);

    // 4. n labels: the instance copy draws them (mock describe answers after 300 ms), the fixed view never asks.
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.6));
    await page.evaluate(nodeId => window.__nexo.handle.focusNode(nodeId), VIOLIN);
    await page.waitForFunction(nodeId => { const gd = document.querySelector(`.card[data-id="${nodeId}"] .js-plotly-plot`);
      return !!gd && (gd.layout.annotations || []).some(a => String(a.name || '').startsWith('tcstat-n-')); }, VIOLIN, { timeout: 15000 });
    await page.evaluate(nodeId => window.__nexo.handle.focusNode(nodeId), FIXED);
    await card(page, FIXED).locator('.js-plotly-plot').waitFor({ timeout: 15000 });
    await page.waitForTimeout(1200);
    await card(page, FIXED).screenshot({ path: file('4-fixed-violin') });
    assert.equal(await nLabels(page, FIXED), 0, 'the fixed violin view has no n labels');
    console.log(`PASS P6 ${name} fixed-violin-view-has-no-n-labels-instance-copy-has`);

    // 5. The tall plot: drawn at violin_zoom_pct, contained (whole, centred) in the shorter card; the input is kept.
    await page.evaluate(nodeId => window.__nexo.handle.focusNode(nodeId), TALL);
    const tall = card(page, TALL);
    await tall.locator('.body img').waitFor({ timeout: 15000 });
    await page.waitForFunction(nodeId => { const img = document.querySelector(`.card[data-id="${nodeId}"] .body img`); return !!img && img.complete && img.naturalHeight > 0; }, TALL, { timeout: 15000 });
    await page.waitForTimeout(800);
    await tall.screenshot({ path: file('5-tall-image') });
    const fit = await tall.evaluate(el => { const img = el.querySelector('.body img'), body = el.querySelector('.body');
      return { natural: [img.naturalWidth, img.naturalHeight], fit: getComputedStyle(img).objectFit, box: [img.offsetWidth, img.offsetHeight], body: [body.clientWidth, body.clientHeight], scroll: body.scrollHeight - body.clientHeight }; });
    const dpr = fit.natural[0] / 440;
    assert.equal(fit.natural[1] / dpr, PLOT_HEIGHT, `image drawn at Team's plot height (${JSON.stringify(fit)})`);
    assert.ok(fit.fit === 'contain' && fit.box[1] <= fit.body[1] && fit.scroll <= 0, `the whole image is contained in the card (${JSON.stringify(fit)})`);
    const kept = await page.evaluate(nodeId => window.__nexo.store.get().nodes.find(n => n.id === nodeId).instance.inputs.violin_zoom_pct, TALL);
    assert.equal(kept, PLOT_HEIGHT, 'reopen keeps violin_zoom_pct');
    console.log(`PASS P6 ${name} tall-image-drawn-at-plot-height-contained-input-kept`);

    assert.deepEqual(errors, []); console.log(`PASS P6 ${name} no-page-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP P6 Playwright: ${e.message}`); return; } throw e; }
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
  for (const name of (process.env.NEXO_BROWSERS || 'chromium,webkit').split(',')) await browserTests(pw, name, base);
  console.log('P6 team parity OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
