// FIX-PROD-H: a restored board draws its cards as Team production does. A synthetic checkpoint with a Batch card (no BQC
// samples chosen) and the dashboard violin (saved n labels, no statistics applied, a saved editor trace) is restored on
// the mock build; the Batch card shows Team's sentence, the violin's soft span reaches 4 bandwidths past its groups,
// "n = … samples" labels are drawn and the edited series' inner box follows its fill. Chromium and WebKit.
// node tests/dual-ui/test_nexo_restored_cards.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/fix-prod-h');
const session = require(path.join(nexo, 'src/mock/session.json'));
const violin = require(path.join(nexo, 'src/mock/violin.json'));
const BQC = 'Please configure at least 2 BQC replicate samples to view plot.';
const BATCH = 'tcinstance_0123456789ab-bqcPlot', VIOLIN = 'tcinstance_0123456789ac-plot_violin';
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
// applyEditor.ts sourceKey (legacy form: type, name, legendgroup and their FNV-1a hash).
function sourceKey(t) {
  const parts = [t.type || 'scatter', t.name || '', t.legendgroup || ''], signature = JSON.stringify(parts);
  let hash = 2166136261; for (let c = 0; c < signature.length; c++) { hash ^= signature.charCodeAt(c); hash = Math.imul(hash, 16777619); }
  return JSON.stringify([parts[0], String(parts[1]).slice(0, 100), String(parts[2]).slice(0, 100), hash >>> 0, 0]);
}
const edited = violin.data[1];
const board = {
  ...session.canvas,
  nodes: [
    { kind: 'plot', id: BATCH, label: 'Batch quality check', x: 40, y: 40, width: 440, height: 330, finished: null, visual: {},
      instance: { id: 'tcinstance_0123456789ab', source: 'qc_pca_tab-bqcPlot', inputs: {} } },
    { kind: 'plot', id: VIOLIN, label: 'Feature distributions', x: 510, y: 40, width: 440, height: 330, finished: null,
      instance: { id: 'tcinstance_0123456789ac', source: 'results_dashboard-plot_violin', inputs: {} },
      statistics: { version: '1', presentation: { show: true, pValue: 'adjusted', label: 'both', fontSize: 12, spacing: 0.08, tip: 0.02, nDisplay: 'samples', hidden: [] }, applied: null, result: null },
      visual: { editor: { traces: [{ index: 1, sourceKey: sourceKey(edited), fillColor: '#e5bdd0', fillOpacity: 1, lineColor: '#b691a3', lineWidth: 2 }] } } },
  ],
};
const id = 'f'.repeat(64);
const saved = [{ record: { id, name: 'Synthetic restored board', sizeBytes: 1, sha256: id, createdAt: '2026-11-11T00:00:00Z', source: 'store' }, state: board }];

async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await context.addInitScript(value => { if (location.protocol === 'http:') sessionStorage.setItem('nexo-mock-checkpoints-v1', value); }, JSON.stringify(saved));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${id}`);
    await page.waitForSelector(`.card[data-id="${VIOLIN}"]`);
    await page.evaluate(() => window.__nexo.handle.zoomTo(1));
    fs.mkdirSync(evidence, { recursive: true });

    // 1. The restored Batch card shows Team's sentence, not "Couldn't bring back …".
    const batch = page.locator(`.card[data-id="${BATCH}"] .body`);
    await batch.getByText(BQC).waitFor({ timeout: 15000 });
    assert.equal(await batch.getByText(/Couldn.t bring back/).count(), 0);
    if (name === 'chromium') await page.locator(`.card[data-id="${BATCH}"]`).screenshot({ path: path.join(evidence, '1-batch-sentence.png') });
    console.log(`PASS FIX-PROD-H ${name} restored-batch-card-shows-team-sentence`);

    // The violin is live; its labels come with the describe answer.
    const violinCard = page.locator(`.card[data-id="${VIOLIN}"]`);
    await page.waitForFunction(id => { const gd = document.querySelector(`.card[data-id="${id}"] .js-plotly-plot`);
      return !!gd && gd._fullData?.every(t => t.spanmode === 'manual') && (gd.layout.annotations || []).some(a => String(a.name).startsWith('tcstat-n-')); }, VIOLIN, { timeout: 15000 });
    const drawn = await violinCard.evaluate(card => { const gd = card.querySelector('.js-plotly-plot');
      return { traces: gd._fullData.map((t, i) => ({ spanmode: t.spanmode, span: t.span, groups: gd.calcdata[i].map(g => ({ min: g.min, max: g.max, bandwidth: g.bandwidth })), box: t.box, fillcolor: t.fillcolor, line: t.line })),
        labels: (gd.layout.annotations || []).filter(a => String(a.name).startsWith('tcstat-n-')).map(a => a.text),
        labelY: (gd.layout.annotations || []).filter(a => String(a.name).startsWith('tcstat-n-')).map(a => a.y), axis: gd._fullLayout.yaxis.range,
        shown: Array.from(gd.querySelectorAll('.annotation-text')).map(e => e.textContent) }; });

    // 2. Span: min - 4 bw … max + 4 bw, past Plotly's soft span (2 bw).
    for (const t of drawn.traces) {
      const lo = Math.min(...t.groups.map(g => g.min - 4 * g.bandwidth)), hi = Math.max(...t.groups.map(g => g.max + 4 * g.bandwidth));
      const softLo = Math.min(...t.groups.map(g => g.min - 2 * g.bandwidth)), softHi = Math.max(...t.groups.map(g => g.max + 2 * g.bandwidth));
      assert.equal(t.spanmode, 'manual'); assert.ok(Math.abs(t.span[0] - lo) < 1e-9 && Math.abs(t.span[1] - hi) < 1e-9, JSON.stringify(t));
      assert.ok(t.span[0] < softLo && t.span[1] > softHi, `past the soft span: ${JSON.stringify(t)}`);
    }
    if (name === 'chromium') await violinCard.screenshot({ path: path.join(evidence, '2-violin-tails.png') });
    console.log(`PASS FIX-PROD-H ${name} violin-span-reaches-4-bandwidths`);

    // 3. n labels under each group, with no statistics applied.
    assert.deepEqual(drawn.labels, ['n = 5 samples', 'n = 5 samples']);
    assert.deepEqual(drawn.shown.filter(t => t.startsWith('n = ')), ['n = 5 samples', 'n = 5 samples']);
    // Placed as Team's draw(): at the bottom of the axis laid out on the data (below the tails), the axis 9 % lower.
    const tails = Math.min(...drawn.traces.map(t => t.span[0]));
    assert.ok(drawn.labelY.every(y => y === drawn.labelY[0] && y < tails && y > drawn.axis[0]), JSON.stringify({ y: drawn.labelY, tails, axis: drawn.axis }));
    if (name === 'chromium') await violinCard.screenshot({ path: path.join(evidence, '3-violin-n-labels.png') });
    console.log(`PASS FIX-PROD-H ${name} n-sample-labels-drawn`);

    // 4. The edited series: pale fill and mauve outline; the inner box follows the fill, two shades darker.
    const t = drawn.traces[1];
    assert.equal(t.fillcolor, 'rgba(229,189,208,1)'); assert.equal(t.line.color, '#b691a3');
    assert.equal(t.box.fillcolor, '#a08492'); assert.equal(t.box.line.color, '#5c4c53');
    const fills = await violinCard.evaluate(card => { const trace = card.querySelectorAll('.js-plotly-plot .violinlayer .trace')[1];
      return { violin: getComputedStyle(trace.querySelector('path.violin')).fill, box: getComputedStyle(trace.querySelector('path.box')).fill }; });
    assert.deepEqual(fills, { violin: 'rgb(229, 189, 208)', box: 'rgb(160, 132, 146)' }); // box = #e5bdd0 30% darker
    if (name === 'chromium') await violinCard.screenshot({ path: path.join(evidence, '4-violin-box-colour.png') });
    console.log(`PASS FIX-PROD-H ${name} inner-box-follows-fill`);

    assert.deepEqual(errors, []); console.log(`PASS FIX-PROD-H ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP FIX-PROD-H Playwright: ${e.message}`); return; } throw e; }
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
  console.log('FIX-PROD-H restored cards OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
