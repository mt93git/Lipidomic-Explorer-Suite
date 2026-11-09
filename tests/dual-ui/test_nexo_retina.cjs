// Phase 1 close (retina-timing): on a Retina screen (deviceScaleFactor 2) a live PNG card at >= 100 % zoom asks the
// render route for dpr 2, and its image has twice its CSS width in pixels; zoomed out (frozen tier, < 100 %) it asks
// for dpr 1. The mock honours dpr as the API does (frontends/nexo-api/cards.R api_card_render: width*dpr x height*dpr).
// Mock build, Chromium and WebKit, 1440x900. node tests/dual-ui/test_nexo_retina.cjs
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
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/retina-timing');
const SOURCE = 'heatmap_barchart_tab-heatmapPlot';
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
const pngRequests = (page, instance) => page.evaluate(i => (window.__nexoMock.pngRenders ?? []).filter(r => r.instance === i), instance);
// The card's <img>: loaded, its natural (pixel) width and its CSS box width.
async function image(page, id, ratio, what) {
  const sel = `.card[data-id="${id}"] .body img`;
  await page.waitForFunction(([sel, ratio]) => { const img = document.querySelector(sel); if (!img || !img.complete || !img.naturalWidth) return false;
    const css = img.getBoundingClientRect().width / (window.__nexo.handle.scale?.() ?? 1);
    return Math.abs(img.naturalWidth / img.clientWidth - ratio) < 0.12 || Math.abs(img.naturalWidth / css - ratio) < 0.12; }, [sel, ratio], { timeout: 15000 })
    .catch(async () => { throw new Error(`${what}: image ${JSON.stringify(await page.evaluate(sel => { const i = document.querySelector(sel); return i && { natural: i.naturalWidth, css: i.clientWidth }; }, sel))}, wanted ratio ${ratio}`); });
  return page.evaluate(sel => { const i = document.querySelector(sel); return { natural: i.naturalWidth, naturalHeight: i.naturalHeight, css: i.clientWidth }; }, sel);
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    assert.equal(await page.evaluate(() => window.devicePixelRatio), 2, 'a Retina page');
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.4));
    await page.evaluate(source => window.__nexo.handle.addCard(source), SOURCE);
    await page.waitForFunction(source => window.__nexo.store.get().nodes.some(n => n.instance?.source === source), SOURCE, { timeout: 10000 });
    const node = await page.evaluate(source => window.__nexo.store.get().nodes.find(n => n.instance?.source === source), SOURCE);
    const instance = node.instance.instanceId ?? node.instance.id;
    // 1. Zoomed out (40 %): the card is frozen and its image is asked for at dpr 1.
    await page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"] .body img`)?.naturalWidth > 0, node.id, { timeout: 15000 });
    let asked = await pngRequests(page, instance);
    assert(asked.length >= 1, 'the card asked for its image');
    assert(asked.every(r => r.dpr === 1), `zoomed out asks dpr 1: ${JSON.stringify(asked)}`);
    const small = await page.evaluate(id => { const i = document.querySelector(`.card[data-id="${id}"] .body img`); return { natural: i.naturalWidth }; }, node.id);
    assert.equal(small.natural, Math.round(node.width), `1x image is the card's logical width (${small.natural})`);
    fs.mkdirSync(evidence, { recursive: true });
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-dpr2-zoomed-out-1x.png') });
    console.log(`PASS retina ${name} zoomed-out-asks-dpr-1 (${asked.length} request(s), image ${small.natural} px)`);
    // 2. At 100 % the live card asks for dpr 2: the image has twice its CSS width in pixels.
    await page.evaluate(id => { window.__nexo.handle.zoomTo(1); window.__nexo.handle.focusNode(id); window.__nexo.handle.zoomTo(1); }, node.id);
    await page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"]`)?.dataset.tier === 'live', node.id, { timeout: 10000 });
    const sharp = await image(page, node.id, 2, 'live at 100 %');
    asked = await pngRequests(page, instance);
    assert(asked.some(r => r.dpr === 2 && r.width === Math.round(node.width)), `live at 100 % asks dpr 2 at the logical width: ${JSON.stringify(asked)}`);
    assert.equal(sharp.natural, 2 * Math.round(node.width), `2x image natural width ${sharp.natural}`);
    assert(Math.abs(sharp.natural / sharp.css - 2) < 0.12, `natural ${sharp.natural} / CSS ${sharp.css} is 2`);
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-dpr2-live-100.png') });
    console.log(`PASS retina ${name} live-100-asks-dpr-2 (natural ${sharp.natural} px, CSS ${sharp.css} px)`);
    // 3. Zoomed out again (80 %, still live): back to dpr 1 (the 1x image comes from the cache or a 1x request, never 2x).
    const before = asked.length;
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.8));
    await page.waitForFunction(id => { const i = document.querySelector(`.card[data-id="${id}"] .body img`); return i && i.complete && i.naturalWidth > 0 && i.naturalWidth < 2 * i.clientWidth - 8; }, node.id, { timeout: 15000 })
      .catch(async () => { throw new Error(`80 %: ${JSON.stringify(await pngRequests(page, instance))}`); });
    asked = await pngRequests(page, instance);
    assert(asked.slice(before).every(r => r.dpr === 1), `at 80 % only dpr 1 is asked: ${JSON.stringify(asked.slice(before))}`);
    console.log(`PASS retina ${name} zoomed-out-80-back-to-dpr-1 (${asked.length - before} new request(s))`);
    // 4. Pilot round 2: clicking a zoomed-out card focuses it at 100 %, which asks for its 2x image; "Finish plot" pressed
    // while that render is in flight must wait for the new image instead of refusing with "Plot is not ready.".
    // A card never seen at 100 %, so its 2x image is not cached.
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.4));
    const fresh = await page.evaluate(async () => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard('qc_pca_tab-pca2dPlot'); return window.__nexo.store.get().nodes.find(n => !before.has(n.id)).id; });
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.4));
    await page.waitForFunction(id => { const c = document.querySelector(`.card[data-id="${id}"]`), i = c?.querySelector('.body img'); return !!i && i.complete && i.naturalWidth > 0 && i.naturalWidth < 1.5 * c.offsetWidth; }, fresh, { timeout: 10000 })
      .catch(async () => { throw new Error(`fresh card at 40 %: ${JSON.stringify(await page.evaluate(id => { const c = document.querySelector(`.card[data-id="${id}"]`), i = c?.querySelector('.body img'); return { tier: c?.dataset.tier, img: i && [i.naturalWidth, c.offsetWidth], zoom: document.querySelector('.zoom-pill span')?.textContent }; }, fresh))}`); });
    await page.evaluate(() => { window.__nexoPrefetchMock.delayMs = 400; window.__finishToasts = [];
      new MutationObserver(() => document.querySelectorAll('.toast').forEach(t => { const x = t.textContent.trim(); if (!window.__finishToasts.includes(x)) window.__finishToasts.push(x); })).observe(document.body, { childList: true, subtree: true, characterData: true }); });
    await page.locator(`.card[data-id="${fresh}"] header strong`).first().click();
    await page.locator('#inspector').getByRole('button', { name: 'Finish plot', exact: true }).click();
    const finished = await page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state === 'finished' || (window.__finishToasts || []).length > 0, fresh, { timeout: 15000 })
      .then(() => page.evaluate(id => document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state === 'finished', fresh), () => false);
    await page.evaluate(() => { window.__nexoPrefetchMock.delayMs = 0; });
    assert(finished, `Finish right after focusing refused: ${JSON.stringify(await page.evaluate(() => window.__finishToasts))}`);
    console.log(`PASS retina ${name} finish-while-the-2x-image-loads-waits-for-it`);
    assert.deepEqual(errors.filter(e => !/Failed to load resource/.test(e)), []); console.log(`PASS retina ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP retina Playwright: ${e.message}`); return; } throw e; }
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
  console.log('retina OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
