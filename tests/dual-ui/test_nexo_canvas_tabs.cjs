// H2 F: mock canvas editing using real pointers in Chromium and WebKit.
// node tests/dual-ui/test_nexo_canvas_tabs.cjs
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
const camera = page => page.$eval('#world', el => el.style.transform);
const percent = page => page.$eval('#hud', el => el.textContent.split('|')[1].trim());
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function focus(page) { await page.locator('#viewport').focus(); }
async function undo(page) { await focus(page); await page.keyboard.press('Control+z'); }
async function drag(page, id, dx, dy, resize = false) {
  const box = await card(page, id).locator(resize ? '.resize-handle' : 'header').boundingBox();
  assert(box, 'missing drag target');
  const x = box.x + (resize ? box.width / 2 : 40), y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const original = await nodes(page), id = original[0].id;
    // The library has its own Plots/Illustrations tabs: scope to the canvas tabs bar.
    const tabs = page.locator('[role=tablist]').filter({ hasText: 'Canvas 1' }).getByRole('tab');
    const count = original.length;
    await page.getByRole('button', { name: 'Add canvas tab', exact: true }).click();
    assert.equal(await tabs.count(), 2);
    assert.equal(await page.locator('.card:visible').count(), 0);
    // H8b: an empty tab shows the centred hint with an Add plot button.
    await page.locator('.canvas-empty').getByText('This canvas is empty. Add a plot from the library or drag an illustration here.', { exact: true }).waitFor();
    assert.equal(await page.locator('.canvas-empty').getByRole('button', { name: 'Add plot', exact: true }).count(), 1);
    const emptyHud = await page.locator('#hud').textContent();
    await tabs.first().click();
    await card(page, id).locator('header').click();
    // H6-0: card actions live in the card's ⋯ menu.
    await card(page, id).getByRole('button', { name: 'More card actions', exact: true }).click();
    await card(page, id).getByRole('button', { name: 'Move to tab…', exact: true }).click();
    const movePicker = page.getByRole('dialog', { name: 'Move to tab', exact: true });
    // H8 journeys 5.1/5.2: a titled picker without the current tab, and a toast that says where the card went.
    assert.equal(await movePicker.getByText('Move to tab', { exact: true }).count(), 1);
    assert.equal(await movePicker.getByRole('button', { name: /^Canvas 1/ }).count(), 0);
    await movePicker.getByRole('button', { name: 'Canvas 2', exact: true }).click();
    await page.locator('.toast', { hasText: 'Moved to Canvas 2' }).waitFor({ timeout: 3000 });
    assert.equal(await page.locator('.toast').getByRole('button', { name: 'Undo', exact: true }).count(), 1);
    console.log('PASS H8 ' + name + ' move-to-tab-titled-picker-and-toast');
    assert.equal(await page.locator('.card:visible').count(), count - 1);
    await tabs.nth(1).click();
    assert.equal(await page.locator('.card:visible').count(), 1);
    assert.notEqual(await page.locator('#hud').textContent(), emptyHud);
    assert.equal(await page.locator('.canvas-empty').count(), 0, 'empty hint over a tab with a card');
    assert.equal(await page.locator('#minimap rect.node').count(), 1);
    await tabs.nth(1).focus(); await page.keyboard.press('F2');
    await page.getByRole('textbox', { name: 'Tab name', exact: true }).fill('Analysis');
    await page.keyboard.press('Enter');
    assert.match(await tabs.nth(1).textContent(), /Analysis/);
    await page.locator('.toast', { hasText: 'Tab renamed to Analysis' }).waitFor({ timeout: 3000 });
    console.log(`PASS H2G ${name} move-filter-hud-minimap-F2`);
    const first = await tabs.first().boundingBox(), second = await tabs.nth(1).boundingBox();
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2, { steps: 12 });
    await page.mouse.up();
    assert.match(await tabs.first().textContent(), /Analysis/);
    await tabs.first().click();
    await page.getByRole('button', { name: 'Tab actions', exact: true }).click();
    await page.getByRole('button', { name: 'Delete tab…', exact: true }).click();
    assert.match(await page.getByRole('dialog').textContent(), /This tab holds 1 card\./);
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.locator('.toast', { hasText: /Deleted tab Analysis; 1 card moved to / }).waitFor({ timeout: 3000 });
    assert.equal(await tabs.count(), 1);
    console.log(`PASS H8 ${name} tab-rename-delete-feedback-and-card-count`);
    assert.equal(await page.locator('.card:visible').count(), count);
    await undo(page);
    assert.equal(await tabs.count(), 2);
    assert.equal(await page.locator('.card:visible').count(), 1);
    console.log(`PASS H2G ${name} pointer-reorder-delete-move-single-undo`);
    // H9 tabs that scale: many tabs at 1440 with both panels open keep a usable strip. Names ellipsize with the
    // full name on hover, the strip scrolls with edge fades, the active tab stays in view, and "All tabs" lists every tab.
    await page.setViewportSize({ width: 1440, height: 900 });
    // The library floats over the left of the canvas (wave 1): select the card first, then open it.
    await tabs.first().click(); await card(page, id).locator('header').click();
    if (await page.locator('.library-panel').isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
    while (await tabs.count() < 9) await page.getByRole('button', { name: 'Add canvas tab', exact: true }).click();
    const long = 'Supplementary figure panels for review';
    await tabs.nth(2).click(); await page.keyboard.press('F2'); await page.getByRole('textbox', { name: 'Tab name', exact: true }).fill(long); await page.keyboard.press('Enter');
    const strip = page.locator('.tablist[role=tablist]');
    await page.waitForTimeout(200); const stripBox = await strip.boundingBox();
    assert.ok(stripBox.width >= 160, `tab strip keeps room (${stripBox.width}px)`);
    const heights = new Set(await tabs.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top))));
    assert.equal(heights.size, 1, 'tabs stay on one row');
    const longTab = tabs.nth(2);
    assert.equal(await longTab.getAttribute('title'), long);
    assert.ok(await longTab.locator('.tab-name').evaluate(e => e.scrollWidth > e.clientWidth), 'a long name ellipsizes');
    await tabs.last().click();
    await page.waitForFunction(i => { const s = document.querySelector('.tablist[role=tablist]').getBoundingClientRect(), b = document.querySelectorAll('.tablist[role=tablist] [role=tab]')[i < 0 ? document.querySelectorAll('.tablist[role=tablist] [role=tab]').length - 1 : i].getBoundingClientRect(); return b.left >= s.left - 1 && b.right <= s.right + 1; }, -1, { timeout: 3000 }); // the active tab is scrolled into view
    assert.ok(await strip.evaluate(e => e.classList.contains('fade-left')), 'a fade marks tabs hidden to the left');
    const all = page.getByRole('button', { name: 'All tabs', exact: true });
    await all.click();
    await page.getByRole('group', { name: 'All tabs' }).getByRole('button').first().click();
    assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
    await page.waitForFunction(i => { const s = document.querySelector('.tablist[role=tablist]').getBoundingClientRect(), b = document.querySelectorAll('.tablist[role=tablist] [role=tab]')[i < 0 ? document.querySelectorAll('.tablist[role=tablist] [role=tab]').length - 1 : i].getBoundingClientRect(); return b.left >= s.left - 1 && b.right <= s.right + 1; }, 0, { timeout: 3000 }); // the picked tab is in view
    { const t = await page.locator('.toolbar').boundingBox(), s = await strip.boundingBox(); assert.ok(s.x + s.width <= t.x + 1, 'strip and toolbar never overlap'); }
    // 1024 with library and inspector open: past Team's four levels Nexo folds Analysis settings and Figure page
    // when it must, so the active tab still shows whole. The library floats (wave 1), so the header keeps more room
    // and may not need to fold: Analysis settings is then in the toolbar or in ⋯, exactly once.
    await page.setViewportSize({ width: 1024, height: 768 }); await tabs.last().click();
    assert.equal(await page.locator('.shell').evaluate(el => el.classList.contains('inspector-open') && !el.classList.contains('library-closed')), true, 'both panels open');
    await page.waitForFunction(() => { const s = document.querySelector('.tablist[role=tablist]').getBoundingClientRect(), all = document.querySelectorAll('.tablist[role=tablist] [role=tab]'), b = all[all.length - 1].getBoundingClientRect(); return b.width > 60 && b.left >= s.left - 1 && b.right <= s.right + 1; }, null, { timeout: 3000 });
    { const t = await page.locator('.toolbar').boundingBox(), s = await strip.boundingBox(); assert.ok(s.x + s.width <= t.x + 1, 'strip and toolbar never overlap at 1024'); }
    await page.locator('.toolbar').getByRole('button', { name: 'Canvas tools', exact: true }).click();
    { const folded = await page.locator('.toolbar').getByRole('group', { name: 'Canvas tools' }).getByRole('button', { name: 'Analysis settings', exact: true }).count();
      const shown = await page.locator('.toolbar > button', { hasText: /^Analysis settings$/ }).count();
      assert.equal(folded + shown, 1, `Analysis settings once (toolbar ${shown}, ⋯ ${folded})`); }
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`PASS H9 ${name} tabs-scale-ellipsis-scroll-fade-all-tabs-menu`);
    assert.deepEqual(errors, []); console.log(`PASS H2G ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H2G Playwright: ${e.message}`); return; } throw e; }
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
  console.log('H2G OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
