// H9 wave 1: how the canvas opens (library closed, every card in view, library icons) in Chromium and WebKit (mock build).
// node tests/dual-ui/test_nexo_canvas_open.cjs      (NEXO_BROWSERS=chromium limits the run)
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
const nodes = page => page.evaluate(() => window.__nexo.store.get().nodes);
const percent = page => page.$eval('#hud', el => parseInt(el.textContent.split('|')[1]));
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
// FIX-PROD-A screenshots (<tmp>/nexo-fix-prod-a).
const shots = path.join(require('node:os').tmpdir(), 'nexo-fix-prod-a');
// Every card of the board (not only the drawn ones: culled cards are hidden) lies inside the viewport, by the camera.
async function everyCardFramed(page) {
  return page.evaluate(() => { const v = document.querySelector('#viewport'), t = document.querySelector('#world').style.transform;
    const [x, y, scale] = (t.match(/-?[\d.e+-]+(?=px|\))/g) ?? []).map(Number);
    return window.__nexo.store.get().nodes.every(n => x + n.x * scale >= -1 && y + n.y * scale >= -1
      && x + (n.x + n.width) * scale <= v.clientWidth + 1 && y + (n.y + n.height) * scale <= v.clientHeight + 1); });
}
// Every card's box lies inside the viewport.
async function allInView(page) {
  return page.evaluate(() => { const v = document.querySelector('#viewport').getBoundingClientRect();
    return [...document.querySelectorAll('.card:not([hidden])')].every(c => { const r = c.getBoundingClientRect();
      return r.left >= v.left - 1 && r.top >= v.top - 1 && r.right <= v.right + 1 && r.bottom <= v.bottom + 1; }); });
}
async function saveAndReload(page, label) {
  await button(page, 'Export figure ▾').click(); await button(page, 'Save checkpoint…').click();
  const dialog = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
  await dialog.getByRole('textbox', { name: 'New checkpoint name' }).fill(label);
  await button(dialog, 'Save current analysis').click(); await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => /^[a-f0-9]{64}$/.test(new URL(location.href).searchParams.get('checkpoint') ?? ''));
  await page.reload(); await page.waitForSelector('.card'); await page.waitForTimeout(600);
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
    await page.waitForSelector('.card'); await page.waitForTimeout(600);
    // The canvas opens with both panels closed and every card in view.
    assert.equal(await page.locator('.library-panel').isHidden(), true, 'library closed on open');
    assert.equal(await page.locator('.inspector-column').evaluate(el => el.getBoundingClientRect().width), 0, 'inspector closed on open');
    assert.equal(await allInView(page), true, 'every card in view on open');
    assert(await percent(page) <= 100);
    // The canvas has keyboard focus from the start, but no focus ring until the keyboard is used.
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'viewport');
    assert.equal(await page.$eval('#viewport', el => getComputedStyle(el).outlineStyle), 'none', 'no focus ring on open');
    await page.keyboard.press('Shift');
    assert.notEqual(await page.$eval('#viewport', el => getComputedStyle(el).outlineStyle), 'none', 'focus ring once the keyboard is used');
    console.log(`PASS H9 ${name} opens-panels-closed-all-cards-in-view`);
    // The rail opens the library; each plot row carries its chart-type icon next to the name (decorative).
    const columnBefore = await page.locator('.canvas-column').boundingBox(), cameraBefore = await page.$eval('#world', el => el.style.transform);
    await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
    await page.locator('.library-panel').waitFor(); await page.waitForTimeout(300);
    // The library floats: the canvas keeps its width and camera, and the panel clears the tabs, minimap and zoom.
    assert.deepEqual(await page.locator('.canvas-column').boundingBox(), columnBefore, 'library resized the canvas');
    assert.equal(await page.$eval('#world', el => el.style.transform), cameraBefore, 'library moved the camera');
    { const lib = await page.locator('.library-panel').boundingBox();
      for (const sel of ['.canvas-header', '.status-band', '#minimap', '.zoom-pill']) { const o = await page.locator(sel).boundingBox();
        assert(lib.x >= o.x + o.width || o.x >= lib.x + lib.width || lib.y >= o.y + o.height || o.y >= lib.y + lib.height, `library covers ${sel}`); } }
    await page.locator('#viewport').click({ position: { x: (await page.locator('#viewport').boundingBox()).width - 30, y: 30 } });
    await page.locator('.library-panel').waitFor({ state: 'hidden' });
    await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click(); await page.locator('.library-panel').waitFor();
    console.log(`PASS H9 ${name} library-floats-canvas-stays-closes-on-canvas`);
    const rows = page.locator('#library-panel-plots .library-row');
    const icons = await rows.evaluateAll(list => list.map(r => { const svg = r.querySelector('svg.library-icon'), use = svg?.querySelector('use');
      return { name: r.querySelector('strong')?.textContent, hidden: svg?.getAttribute('aria-hidden'), ref: use?.getAttribute('href'), drawn: !!(use?.getAttribute('href') && document.querySelector(use.getAttribute('href'))), width: svg?.getBoundingClientRect().width }; }));
    assert(icons.length >= 5, 'library rows');
    for (const i of icons) { assert(i.name, 'row keeps its name'); assert.equal(i.hidden, 'true'); assert.equal(i.drawn, true, `icon ${i.ref} for ${i.name}`); assert(i.width >= 16 && i.width <= 24, `icon size ${i.width}`); }
    console.log(`PASS H9 ${name} library-rows-chart-icons`);
    await button(page, 'Close library').click(); await page.locator('.library-panel').waitFor({ state: 'hidden' });
    // A large board opens lower, with every card in view.
    const ids = (await nodes(page)).map(n => n.id);
    await page.evaluate(id => window.__nexo.handle.setCardPosition(id, { x: 5200, y: 3400 }), ids[ids.length - 1]);
    await saveAndReload(page, 'wide board');
    assert.equal(await page.locator('.library-panel').isHidden(), true);
    assert.equal(await allInView(page), true, 'large board: every card in view');
    { const p = await percent(page); assert(p < 50 && p >= 10, `large board opens at ${p}%`); }
    console.log(`PASS H9 ${name} large-board-opens-fitted`);
    // FIX-PROD-A: a row of cards far above the others opened at 10 % on the empty middle; Fit stayed there. The board
    // opens framed on every card, and Fit frames every card again, below 10 % when it must.
    for (let i = 0; i < 5; i++) await page.evaluate(id => window.__nexo.handle.duplicate(id), ids[0]);
    const copies = (await nodes(page)).map(n => n.id).filter(id => !ids.includes(id)); assert.equal(copies.length, 5, 'five copies');
    // Positions stay at x, y >= 0: the row along the top, the other cards 20 000 px below it.
    await page.evaluate(([row, rest]) => { row.forEach((id, i) => window.__nexo.handle.setCardPosition(id, { x: i * 3000, y: 0 }));
      rest.forEach((id, i) => window.__nexo.handle.setCardPosition(id, { x: i * 600, y: 20000 })); }, [[...copies, ids[ids.length - 1]], ids.slice(0, -1)]);
    await saveAndReload(page, 'spread board');
    assert.equal(await everyCardFramed(page), true, 'spread board: every card framed on open');
    { const p = await percent(page); assert(p < 10, `spread board opens at ${p}%`); }
    await page.evaluate(() => window.__nexo.handle.zoomTo(1)); await page.waitForTimeout(200);
    assert.equal(await everyCardFramed(page), false, 'at 100 % the spread board is not all in view');
    await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click(); await page.waitForTimeout(600);
    assert.equal(await everyCardFramed(page), true, 'spread board: Fit frames every card');
    { const p = await percent(page); assert(p < 10, `spread board fits at ${p}%`); }
    await page.screenshot({ path: path.join(shots, `${name}-1440-spread-board-fit.png`) });
    // Zoom out after such a Fit stays put rather than jumping in to 10 %.
    const fitted = await page.$eval('#world', el => el.style.transform);
    await page.locator('.zoom-pill').getByRole('button', { name: 'Zoom out', exact: true }).click(); await page.waitForTimeout(200);
    assert.equal(await page.$eval('#world', el => el.style.transform), fitted, 'zoom out below the fit');
    console.log(`PASS H9 ${name} spread-board-opens-and-fits-every-card`);
    // At 1024 the toast never covers the zoom controls.
    await page.evaluate(id => window.__nexo.handle.remove(id), copies[0]); await page.locator('.toast', { hasText: 'Card removed' }).waitFor();
    await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(300);
    const [toast, pill] = await Promise.all([page.locator('.toast').boundingBox(), page.locator('.zoom-pill').boundingBox()]);
    assert(toast && pill, 'toast and zoom pill visible');
    assert(toast.x >= pill.x + pill.width || pill.x >= toast.x + toast.width || toast.y >= pill.y + pill.height || pill.y >= toast.y + toast.height, 'toast overlaps the zoom controls');
    // Both panels open at 1024 leave a narrow canvas: the toast moves to the top, one line, clear of everything.
    await page.evaluate(id => window.__nexo.handle.setCardPosition(id, { x: 700, y: 30 }), ids[ids.length - 1]);
    await page.evaluate(() => window.__nexo.handle.fit()); await page.waitForTimeout(300);
    await page.locator('.card').first().locator('.body').click();
    await page.locator('.card').first().locator('.card-actions').getByRole('button', { name: 'Edit', exact: true }).click(); await page.waitForTimeout(300);
    await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click(); await page.locator('.library-panel').waitFor();
    const inspector = page.locator('.inspector-column');
    await inspector.locator('header').getByRole('button', { name: 'More plot actions', exact: true }).click();
    await inspector.getByRole('button', { name: 'Remove', exact: true }).click();
    const narrow = page.locator('.toast').last(); await narrow.waitFor();
    { const t = await narrow.boundingBox(); assert(t.height < 52, `toast wraps (${t.height}px)`);
      for (const sel of ['.zoom-pill', '#minimap', '.canvas-header']) { const o = await page.locator(sel).boundingBox();
        if (o) assert(t.x >= o.x + o.width || o.x >= t.x + t.width || t.y >= o.y + o.height || o.y >= t.y + t.height, `narrow toast overlaps ${sel}`); } }
    console.log(`PASS H9 ${name} toast-clear-of-zoom-controls`);
    const datasetPage = await context.newPage();
    await datasetPage.goto(`${base}/nexo/?dataset=3f6c1e2a-7b4d-4a8e-9c01-5d2f8e7a0041`);
    await datasetPage.getByRole('button', {name:'Prepare and check', exact:true}).click();
    await datasetPage.getByRole('heading', {name:'Quality check', exact:true}).waitFor();
    await datasetPage.getByRole('button', {name:/^Open the Canvas/}).click();
    await datasetPage.locator('.canvas-empty').waitFor();
    const settings = await datasetPage.evaluate(() => window.__nexoDatasetMock.last);
    await datasetPage.evaluate(() => { window.__nexoPrefetchMock.evict(409); window.__nexo.autosave.markDirty(); return window.__nexo.autosave.flush(); });
    await datasetPage.waitForFunction(() => window.__nexoDatasetMock.opened === 2, null, {timeout:20000});
    assert.deepEqual(await datasetPage.evaluate(() => window.__nexoDatasetMock.last), settings);
    assert.equal(await datasetPage.getByText('Session lost', {exact:false}).count(), 0);
    console.log(`PASS H9 ${name} dataset-eviction-recovered`);
    await datasetPage.close();
    assert.deepEqual(errors, []); console.log(`PASS H9 ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H9-open Playwright: ${e.message}`); return; } throw e; }
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
  console.log('H9-open OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
