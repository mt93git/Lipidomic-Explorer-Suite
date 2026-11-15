// H9 wave 2: library and canvas interactions in Chromium and WebKit (synthetic mock only).
// node tests/dual-ui/test_nexo_library.cjs
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
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const nodes = page => page.evaluate(() => window.__nexo.store.get().nodes);
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    const errors = [];
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const panel = page.locator('.library-panel'), search = panel.getByRole('searchbox', { name: 'Search plots' });
    for (const key of ['l', '/']) {
      await page.locator('#viewport').focus(); await page.keyboard.press(key);
      await panel.waitFor(); assert.equal(await search.evaluate(el => el === document.activeElement), true);
      await search.press('Escape'); await panel.waitFor({ state: 'hidden' });
    }
    await page.keyboard.press('l'); await panel.waitFor();
    await search.fill('pca'); await search.press('Escape'); assert.equal(await search.inputValue(), '');
    assert.equal(await panel.isVisible(), true);
    await button(panel, 'Close library').click();
    await page.locator('#viewport').focus();
    await page.keyboard.press('l'); await panel.waitFor();
    await button(panel, 'Close library').focus(); await page.keyboard.press('l'); await panel.waitFor({ state: 'hidden' });
    console.log(`PASS H9-library ${name} library-shortcuts-focus-escape`);
    await page.mouse.move(700, 100);
    await page.evaluate(() => window.__nexo.handle.fit());
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#minimap')).opacity === '0');
    await page.locator('#viewport').focus(); await page.keyboard.press('m');
    await page.waitForFunction(() => document.querySelector('#minimap').dataset.pinned === 'true');
    assert.equal(await page.$eval('#minimap', el => getComputedStyle(el).opacity), '1');
    await page.keyboard.press('m');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#minimap')).opacity === '0');
    const cornerView = await page.locator('#viewport').boundingBox();
    await page.mouse.move(cornerView.x + 170, cornerView.y + cornerView.height - 100);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#minimap')).opacity === '1');
    await page.mouse.move(700, 100);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#minimap')).opacity === '0');
    await page.evaluate(() => window.__nexo.handle.zoomTo(3));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#minimap')).opacity === '1');
    console.log(`PASS H9-library ${name} minimap-automatic-pinned`);
    const id = (await nodes(page))[0].id;
    await page.evaluate(id => window.__nexo.handle.focusNode(id), id);
    await page.locator('#viewport').focus(); await page.keyboard.press('Shift+Digit2');
    await page.waitForTimeout(100);
    assert(await page.evaluate(id => {
      const v = document.querySelector('#viewport').getBoundingClientRect(), c = document.querySelector(`.card[data-id="${id}"]`).getBoundingClientRect();
      return c.left >= v.left && c.right <= v.right && c.top >= v.top && c.bottom <= v.bottom;
    }, id), 'Shift+2 fits the selection');
    assert(await page.$eval('#hud', el => parseInt(el.textContent.split('|')[1])) <= 100, 'selection fit caps zoom at 100%');
    await page.keyboard.press('?');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' }); await shortcuts.waitFor();
    const keys = await shortcuts.locator('dt').allTextContents();
    for (const key of ['L', '/', 'Shift + 2', 'M']) assert(keys.includes(key), `shortcut ${key} is listed`);
    await page.keyboard.press('Escape'); await shortcuts.waitFor({ state: 'hidden' });
    console.log(`PASS H9-library ${name} fit-selection-and-shortcuts-dialog`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('/'); await panel.waitFor();
    await button(panel.getByRole('group', { name: 'Plot families' }), 'Quality check').click();
    assert.equal(await panel.locator('.library-group').count(), 1);
    // textContent: the summary is uppercased by CSS only; the DOM (and accessible) text keeps its case.
    assert.match(await panel.locator('.library-group summary').textContent(), /Quality check/);
    assert.equal(await panel.locator('.library-group').evaluate(el => el.open), true);
    await search.fill('heatmap');
    assert(await panel.locator('.library-group').count() >= 2, 'search spans families');
    assert.equal(await panel.locator('.library-group summary').first().evaluate(el => getComputedStyle(el).position), 'sticky');
    await search.fill('zz-no-such-plot');
    assert.equal(await panel.locator('.library-no-match').isVisible(), true);
    await button(panel, 'Clear').click(); assert.equal(await search.inputValue(), '');
    assert.equal(await search.evaluate(el => el === document.activeElement), true);
    assert(await panel.locator('.library-row').count() > 5);
    console.log(`PASS H9-library ${name} family-chips-search-clear-sticky`);
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js', { paths: [nexo] }) });
    const axe = await page.evaluate(async () => (await window.axe.run(document.querySelector('.library-panel'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag2aaa'] } })).violations);
    assert.deepEqual(axe.map(v => `${v.id}: ${v.description}`), []);
    console.log(`PASS H9-library ${name} panel-axe-clean`);
    await search.fill('Principal components');
    const tile = panel.locator('.library-row').first();
    const beforeDrop = (await nodes(page)).map(n => n.id);
    const sourceBox = await tile.locator('.tile-main').boundingBox();
    const viewport = await page.locator('#viewport').boundingBox();
    const drop = { x: viewport.x + viewport.width - 90, y: viewport.y + viewport.height * .6 };
    const expected = await page.evaluate(point => {
      const v = document.querySelector('#viewport').getBoundingClientRect(), m = new DOMMatrix(getComputedStyle(document.querySelector('#world')).transform);
      return { x: (point.x - v.left - m.e) / m.a, y: (point.y - v.top - m.f) / m.d };
    }, drop);
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 20); await page.mouse.down();
    await page.mouse.move(drop.x - 10, drop.y, { steps: 20 }); await page.mouse.move(drop.x, drop.y, { steps: 3 });
    await page.locator('.plot-drop-ghost').waitFor(); assert.equal(await panel.isVisible(), true);
    await page.mouse.up();
    await page.waitForFunction(ids => window.__nexo.store.get().nodes.some(n => !ids.includes(n.id)), beforeDrop);
    const dropped = (await nodes(page)).find(n => !beforeDrop.includes(n.id));
    assert(Math.abs(dropped.x - expected.x) <= 20 && Math.abs(dropped.y - expected.y) <= 20, `drop ${JSON.stringify(dropped)} expected ${JSON.stringify(expected)}`);
    assert.equal(await panel.isVisible(), true);
    console.log(`PASS H9-library ${name} drag-drop-world-position-ghost`);
    await button(panel, 'Close library').click();
    for (const [label, source] of [['Principal components', 'results_dashboard-plot_pca'], ['Feature distributions', 'results_dashboard-plot_violin'], ['Abundance heatmap', 'results_dashboard-plot_heat']]) {
      await button(page, 'Add canvas tab').click();
      const empty = page.locator('.canvas-empty'); await empty.waitFor();
      assert.equal(await empty.locator('.canvas-suggestions button').count(), 3);
      const before = (await nodes(page)).map(n => n.id);
      await button(empty, label).click();
      await page.waitForFunction(ids => window.__nexo.store.get().nodes.some(n => !ids.includes(n.id)), before);
      const added = (await nodes(page)).find(n => !before.includes(n.id));
      assert.equal(added.instance.source, source);
      await empty.waitFor({ state: 'hidden' });
    }
    console.log(`PASS H9-library ${name} three-empty-tab-suggestions-add`);
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const closeInspector = button(page, 'Close inspector'); if (await closeInspector.isVisible()) await closeInspector.click();
      if (await panel.isHidden()) await button(page.locator('.rail'), 'Plots').click();
      await search.fill('Principal components');
      await page.evaluate(() => window.__nexo.handle.zoomTo(1));
      const before = (await nodes(page)).map(n => n.id);
      await button(panel, 'Add Principal components').click();
      await page.waitForFunction(ids => window.__nexo.store.get().nodes.some(n => !ids.includes(n.id)), before);
      const added = (await nodes(page)).find(n => !before.includes(n.id));
      await page.waitForFunction(id => {
        const card = document.querySelector(`.card[data-id="${id}"]`).getBoundingClientRect();
        const v = document.querySelector('#viewport').getBoundingClientRect(), library = document.querySelector('.library-panel').getBoundingClientRect();
        const inspector = document.querySelector('.inspector-column').getBoundingClientRect();
        return inspector.width > 0 && card.left >= library.right && card.right <= Math.min(v.right, inspector.left) + 1 && card.top >= v.top && card.bottom <= v.bottom + 1;
      }, added.id);
      assert.equal(await panel.isVisible(), true);
    }
    console.log(`PASS H9-library ${name} added-card-visible-beside-both-panels-1440-1024`);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`not run: sandbox — H9-library Playwright: ${e.message}`); return; } throw e; }
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
  console.log('H9-library OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
