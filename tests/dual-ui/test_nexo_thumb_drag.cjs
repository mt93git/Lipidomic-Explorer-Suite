// Pilot F2 (P3): at the thumb tier (< 20 %) a card's header is 0 px and inert, so the card moves from its body:
// a press that leaves the click threshold drags it (snapping, settle, one undo step, as a header drag); a press
// that stays within it still focuses the card (H9 click to focus). Mock API, real pointers, Chromium and WebKit.
// node tests/dual-ui/test_nexo_thumb_drag.cjs
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
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
const percent = page => page.$eval('#hud', el => parseInt(el.textContent.split('|')[1]));
async function undo(page) { await page.locator('#viewport').focus(); await page.keyboard.press('Control+z'); }
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    // The restore settles (cards drawn, camera final) before the zoom is set.
    await page.waitForFunction(() => ![...document.querySelectorAll('.card .body')].some(b => /Restoring/.test(b.textContent)));
    await page.waitForTimeout(300);
    const original = await nodes(page), id = original.find(n => n.kind === 'plot').id;
    // The pilot's Fit with Team's plot heights lands at ~14 %.
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.14));
    assert.equal(await percent(page), 14);
    assert.equal(await card(page, id).evaluate(el => el.classList.contains('card-thumb')), true, 'the card is at the thumb tier');
    assert.equal(await card(page, id).locator('header').evaluate(el => el.inert && el.getBoundingClientRect().height === 0), true, 'its header is hidden and inert');
    // Drag the body by 70 screen px to the right (500 world px at 14 %).
    const box = await card(page, id).locator('.body').boundingBox(); assert(box, 'card body');
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 70, y, { steps: 10 }); await page.mouse.up();
    await page.waitForFunction(([nodeId, x0]) => window.__nexo.store.get().nodes.find(n => n.id === nodeId).x > x0 + 300, [id, original.find(n => n.id === id).x]);
    const moved = (await nodes(page)).find(n => n.id === id), before = original.find(n => n.id === id);
    assert.ok(moved.x - before.x > 300, `moved ${moved.x - before.x} world px`);
    assert.equal(await percent(page), 14, 'a drag never focuses the card');
    assert.equal(await page.getByRole('button', { name: /Back to overview/ }).isVisible(), false, 'no focus after a drag');
    // Neighbours settle as after a header drag: no other card overlaps the moved one.
    const after = await nodes(page);
    for (const n of after) if (n.id !== id && n.kind !== 'illustration') {
      const apart = n.x >= moved.x + moved.width || moved.x >= n.x + n.width || n.y >= moved.y + moved.height || moved.y >= n.y + n.height;
      assert.ok(apart, `${n.id} overlaps the moved card`);
    }
    await undo(page);
    assert.deepEqual(await nodes(page), original, 'one Undo restores the board');
    console.log(`PASS F2 ${name} thumb-body-drag-moves-settles-single-undo`);
    // A press within the click threshold is still a click: it focuses the card and moves nothing.
    const box2 = await card(page, id).locator('.body').boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2); await page.mouse.down();
    await page.mouse.move(box2.x + box2.width / 2 + 2, box2.y + box2.height / 2 + 1, { steps: 2 }); await page.mouse.up();
    await page.getByRole('button', { name: /Back to overview/ }).waitFor();
    await page.waitForTimeout(400);
    assert.ok(await percent(page) > 14, 'a click at the thumb tier focuses the card');
    assert.deepEqual(await nodes(page), original, 'a click moves nothing');
    console.log(`PASS F2 ${name} thumb-click-still-focuses`);
    assert.deepEqual(errors, []); console.log(`PASS F2 ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F2 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('F2 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
