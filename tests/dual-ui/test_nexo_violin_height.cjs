// Chart audit b05 F5: the Selected-feature distributions card (heatmap_barchart_tab-violin_plot_render) is as tall
// as Team's plot height (violin_zoom_pct, reported as plotHeight) plus the card chrome. Mock build, Chromium and WebKit.
// node tests/dual-ui/test_nexo_violin_height.cjs
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
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/violin-height');
const SOURCE = 'heatmap_barchart_tab-violin_plot_render', NEIGHBOUR = 'heatmap_barchart_tab-heatmapSDPlot';
const CHROME = 38; // cards.ts CARD_CHROME: 36 px header + 1 px top and bottom borders
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
const bySource = (list, source) => list.find(n => n.instance?.source === source);
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function undo(page) { await page.locator('#viewport').focus(); await page.keyboard.press('Control+z'); }
async function waitNode(page, source, test, label) {
  await page.waitForFunction(([source, test]) => { const n = window.__nexo.store.get().nodes.find(n => n.instance?.source === source); return !!n && new Function('n', `return ${test}`)(n); }, [source, test], { timeout: 10000 })
    .catch(async () => { throw new Error(`${label}: ${JSON.stringify(bySource(await nodes(page), source))}`); });
}
async function plotImage(page, id, plotHeight) {
  const c = card(page, id);
  await page.waitForFunction(([id, h]) => { const img = document.querySelector(`.card[data-id="${id}"] img`); return !!img && img.complete && img.naturalHeight === h; }, [id, plotHeight], { timeout: 10000 })
    .catch(async () => { throw new Error(`image natural height: ${await c.locator('img').first().evaluate(i => i.naturalHeight).catch(() => 'no image')} (want ${plotHeight})`); });
  return c.evaluate(el => { const img = el.querySelector('img'), body = img.parentElement;
    return { natural: img.naturalHeight, imgBottom: img.offsetTop + img.offsetHeight, imgHeight: img.offsetHeight, card: el.offsetHeight,
      scroll: body.scrollHeight - body.clientHeight, overflowY: getComputedStyle(body).overflowY }; });
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
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.3));
    const catalogWidth = 440; // mock catalog defaultSize.width for this card
    // 1. Add: card height = plotHeight + chrome; width = the catalog default; the whole plot in the card, no inner scroll.
    await page.evaluate(source => window.__nexo.handle.addCard(source), SOURCE);
    await waitNode(page, SOURCE, 'true', 'violin card added');
    let v = bySource(await nodes(page), SOURCE);
    const plotHeight = v.instance.inputs.violin_zoom_pct;
    assert.equal(plotHeight, 2340, 'mock plotHeight for the synthetic selection');
    assert.equal(v.height, plotHeight + CHROME, 'card height = plotHeight + chrome');
    assert.equal(v.width, catalogWidth, 'width stays the catalog default');
    let shown = await plotImage(page, v.id, plotHeight);
    assert.equal(shown.natural, plotHeight);
    assert.ok(shown.imgBottom <= shown.card, `the whole plot is inside the card (${JSON.stringify(shown)})`);
    assert.ok(shown.scroll <= 0, `no scroll inside the card (${JSON.stringify(shown)})`);
    console.log(`PASS F5 ${name} add-card-height-plotHeight-plus-chrome`);
    // 2. A neighbour right below the violin card.
    await page.evaluate(source => window.__nexo.handle.addCard(source), NEIGHBOUR);
    await waitNode(page, NEIGHBOUR, 'true', 'neighbour added');
    let b = bySource(await nodes(page), NEIGHBOUR);
    await page.evaluate(([id, x, y]) => window.__nexo.handle.setCardPosition(id, { x, y }), [b.id, v.x, v.y + v.height + 20]);
    const neighbourX = v.x, neighbourY = v.y + v.height + 20;
    await waitNode(page, NEIGHBOUR, `n.y === ${neighbourY}`, 'neighbour below');
    await page.evaluate(id => window.__nexo.handle.focusNode(id), v.id);
    fs.mkdirSync(evidence, { recursive: true });
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-added.png') });
    // 3. Plot Height in the Data tab: the card follows, the neighbour is pushed, the plot re-renders at that height.
    await card(page, v.id).locator('header').click();
    await page.getByRole('tab', { name: 'Data', exact: true }).click();
    const slider = page.locator('input#violin_zoom_pct');
    await slider.waitFor();
    // The printed value (Team's slider label); a native range snaps an off-step value (2340) to its step grid when shown.
    assert.equal(await page.locator('output[for="violin_zoom_pct"]').textContent(), String(plotHeight));
    const patches = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await slider.fill('3000');
    await waitNode(page, SOURCE, `n.height === ${3000 + CHROME} && n.instance.inputs.violin_zoom_pct === 3000`, 'slider 3000 resizes the card');
    v = bySource(await nodes(page), SOURCE); b = bySource(await nodes(page), NEIGHBOUR);
    // Pushed by the existing settle (Team's shortest move: down or aside), never overlapped.
    const overlap = b.x < v.x + v.width && v.x < b.x + b.width && b.y < v.y + v.height && v.y < b.y + b.height;
    assert.ok(!overlap && (b.x !== v.x || b.y !== neighbourY), `neighbour pushed, not overlapped (${JSON.stringify({ v: [v.x, v.y, v.width, v.height], b: [b.x, b.y, b.width, b.height] })})`);
    assert.ok(await page.evaluate(n => window.__nexoMock.cardPatches.length > n, patches), 'the slider change was sent');
    shown = await plotImage(page, v.id, 3000);
    assert.ok(shown.imgBottom <= shown.card && shown.scroll <= 0, JSON.stringify(shown));
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-slider-3000.png') });
    console.log(`PASS F5 ${name} slider-resizes-card-pushes-neighbour`);
    // 4. One Ctrl+Z restores the size, the neighbour and violin_zoom_pct (sent back to the instance).
    await undo(page);
    await waitNode(page, SOURCE, `n.height === ${plotHeight + CHROME} && n.instance.inputs.violin_zoom_pct === ${plotHeight}`, 'undo restores');
    await waitNode(page, NEIGHBOUR, `n.x === ${neighbourX} && n.y === ${neighbourY}`, 'undo restores the neighbour');
    await page.waitForFunction(h => { const p = window.__nexoMock.cardPatches.at(-1); return p && p.body.inputs.violin_zoom_pct === h; }, plotHeight, { timeout: 10000 });
    await plotImage(page, v.id, plotHeight);
    console.log(`PASS F5 ${name} undo-restores-size-and-input`);
    // 5. A hand resize writes the plot height back to violin_zoom_pct (stepped, clamped) and snaps the card to it.
    await page.evaluate(id => window.__nexo.handle.focusNode(id), v.id);
    await page.waitForTimeout(800); // focusNode may fly the camera
    const handleBox = await card(page, v.id).locator('.resize-handle').boundingBox();
    const scale = await page.evaluate(id => { const el = document.querySelector(`.card[data-id="${id}"]`); return el.getBoundingClientRect().height / el.offsetHeight; }, v.id);
    const hx = handleBox.x + handleBox.width / 2, hy = handleBox.y + handleBox.height / 2;
    await page.mouse.move(hx, hy); await page.mouse.down();
    await page.mouse.move(hx, hy - 600 * scale, { steps: 6 }); await page.mouse.up();
    v = bySource(await nodes(page), SOURCE);
    const written = v.instance.inputs.violin_zoom_pct;
    assert.ok(written >= 300 && written <= 5000 && written % 50 === 0, `stepped and clamped: ${written}`);
    assert.ok(Math.abs(written - (plotHeight - 600)) <= 25, `about 600 px shorter: ${written}`);
    assert.equal(v.height, written + CHROME, 'card snapped to the written plot height');
    await page.waitForFunction(h => { const p = window.__nexoMock.cardPatches.at(-1); return p && p.body.inputs.violin_zoom_pct === h; }, written, { timeout: 10000 });
    await plotImage(page, v.id, written);
    await undo(page);
    await waitNode(page, SOURCE, `n.height === ${plotHeight + CHROME} && n.instance.inputs.violin_zoom_pct === ${plotHeight}`, 'undo of a hand resize');
    console.log(`PASS F5 ${name} hand-resize-writes-violin_zoom_pct-one-undo`);
    assert.deepEqual(errors, []); console.log(`PASS F5 ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F5 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('F5 violin height OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
