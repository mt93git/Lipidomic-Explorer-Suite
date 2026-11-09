// H8c: live Group comparison card (confirm, draw, inspector display state + undo, results, CSV) in Chromium and WebKit.
// node tests/dual-ui/test_nexo_group_comparison.cjs
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
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const before = (await nodes(page)).map(n => n.id);
    if (await page.locator('.library-panel').isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click(); // the library opens closed (wave 1)
    await page.locator('.library-search').first().fill('Lipid class comparison');
    await page.getByRole('button', { name: 'Add Lipid class comparison', exact: true }).click();
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length === n + 1, before.length);
    const id = (await nodes(page)).find(n => !before.includes(n.id)).id;
    const gc = card(page, id);
    const prompt = gc.locator('.gc-confirm');
    await prompt.waitFor();
    assert.equal((await prompt.locator('p').textContent()).trim(), 'Confirm the reference group to compute the comparison.');
    console.log(`PASS H8c ${name} confirm-prompt`);
    await prompt.getByRole('button', { name: 'Confirm reference group', exact: true }).click();
    // Live while on screen; a card frozen by the live cap shows its off-screen snapshot instead.
    await gc.locator('header').click();
    await page.waitForFunction(sel => document.querySelector(sel + ' .js-plotly-plot')?.data?.length > 0, `.card[data-id="${id}"]`, { timeout: 20000 });
    const violins = () => gc.locator('.js-plotly-plot').evaluate(el => el.data.filter(t => t.type === 'violin').length);
    const initial = await violins();
    assert.equal(initial, 3);
    console.log(`PASS H8c ${name} confirm-then-live-plot`);
    const inspector = page.locator('#inspector');
    // H8 journeys 2.4: a group comparison opens the inspector on Statistics, where its settings live.
    assert.equal(await inspector.getByRole('tab', { selected: true }).textContent(), 'Statistics');
    console.log(`PASS H8 ${name} group-comparison-opens-on-statistics`);
    await inspector.getByRole('tab', { name: 'Statistics', exact: true }).click();
    const conditions = inspector.getByRole('group', { name: 'Conditions shown', exact: true });
    await conditions.waitFor();
    await conditions.getByRole('button', { name: 'Case B', exact: true }).click();
    await page.waitForFunction(([sel, n]) => document.querySelector(sel + ' .js-plotly-plot')?.data?.filter(t => t.type === 'violin').length === n, [`.card[data-id="${id}"]`, initial - 1]);
    assert.deepEqual((await nodes(page)).find(n => n.id === id).visual.groupComparison.hiddenConditions, ['Case B']);
    await undo(page);
    await page.waitForFunction(([sel, n]) => document.querySelector(sel + ' .js-plotly-plot')?.data?.filter(t => t.type === 'violin').length === n, [`.card[data-id="${id}"]`, initial]);
    assert.equal(await violins(), initial);
    console.log(`PASS H8c ${name} hide-condition-undo`);
    await gc.locator('header').click();
    await inspector.getByRole('tab', { name: 'Statistics', exact: true }).click();
    const rows = inspector.getByRole('table', { name: 'Group comparison results', exact: true }).locator('tbody tr');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 4);
    const [download] = await Promise.all([page.waitForEvent('download'), inspector.getByRole('button', { name: 'Comparison CSV', exact: true }).click()]);
    assert.equal(download.suggestedFilename(), 'lipidomic-group-comparison.csv');
    const text = require('node:fs').readFileSync(await download.path(), 'utf8');
    assert(text.length > 0 && text.split('\r\n').length === 19, `csv rows: ${text.split('\r\n').length}`);
    console.log(`PASS H8c ${name} results-table-csv`);
    assert.deepEqual(errors, []);
    console.log(`PASS H8c ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H8c Playwright: ${e.message}`); return; } throw e; }
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
  console.log('H8c OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
