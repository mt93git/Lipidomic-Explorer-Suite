// Chart audit b12 (Astra review 2026-11-08): a mouse click on a live cell plot's Plotly point is forwarded to the API
// as Shiny's plotly binding sends it (POST .../cards/<id>/events {event:'plotly_click', source, points}, cards.R
// api_card_event); the inputs Team's observer changes (cell_class / cell_sample) are recorded as one edit (Undo) and
// the card draws again. The mock models Team's observers (src/api.ts sendCardEvent) and draws the two cell plots with
// the instance's private event source. Mock build, Chromium and WebKit, 1440x900.
//   node tests/dual-ui/test_nexo_plotly_click.cjs
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
const node = (page, source) => page.evaluate(source => window.__nexo.store.get().nodes.find(n => n.instance?.source === source) ?? null, source);
const events = page => page.evaluate(() => window.__nexoMock.cardEvents ?? []);
async function addLive(page, source) {
  await page.evaluate(source => window.__nexo.handle.addCard(source), source);
  await page.waitForFunction(source => window.__nexo.store.get().nodes.some(n => n.instance?.source === source), source, { timeout: 10000 });
  const n = await node(page, source);
  await page.evaluate(id => window.__nexo.handle.focusNode(id), n.id);
  await page.evaluate(() => window.__nexo.handle.zoomTo(1));
  await page.waitForSelector(`.card[data-id="${n.id}"] .plot.js-plotly-plot .plot-container`, { timeout: 15000 });
  return n;
}
const title = (page, id) => page.evaluate(id => document.querySelector(`.card[data-id="${id}"] .plot`)?.layout?.title?.text ?? '', id);
// Click the centre of a drawn Plotly mark (a bar or a marker) with the mouse, as a user does: Plotly fires
// plotly_click from the point it is hovering, so the click comes once its hover label shows. The camera may still be
// gliding to the focused card, or the card drawn again at its live size: measure until the mark stops moving, and
// measure again if the hover did not come (the plot was replaced under the mouse).
async function clickMark(page, id, selector, index) {
  const mark = page.locator(`.card[data-id="${id}"] .plot ${selector}`).nth(index);
  const hover = page.locator(`.card[data-id="${id}"] .plot .hoverlayer .hovertext`);
  for (let attempt = 0; attempt < 3; attempt++) {
    let box = await mark.boundingBox();
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(100);
      const next = await mark.boundingBox();
      if (box && next && Math.abs(next.x - box.x) < 0.5 && Math.abs(next.y - box.y) < 0.5) break;
      box = next;
    }
    assert.ok(box && box.width > 0 && box.height > 0, `mark ${selector}[${index}] is drawn`);
    await page.mouse.move(0, 0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    if (await hover.first().waitFor({ timeout: 2000 }).then(() => true, () => false)) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return;
    }
  }
  throw new Error(`Plotly never hovered ${selector}[${index}] on ${id}`);
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

    // 1. Class totals: a click on the PE bar selects PE (Team: updateSelectInput(session,'cell_class',...)).
    const cls = await addLive(page, 'cell_class_plot');
    const instance = cls.instance.instanceId ?? cls.instance.id;
    // Mock bars are drawn bottom-up from y = ['PC','PE','TG']: index 1 is PE.
    await clickMark(page, cls.id, '.barlayer .point path', 1);
    await page.waitForFunction(() => (window.__nexoMock.cardEvents ?? []).length > 0, null, { timeout: 5000 });
    const [sent] = await events(page);
    assert.equal(sent.instance, instance, 'the event goes to this card');
    assert.equal(sent.body.event, 'plotly_click');
    assert.equal(sent.body.source, 'cell_class_profile');
    assert.equal(sent.body.points.length, 1);
    assert.deepEqual(Object.keys(sent.body.points[0]).sort(), ['curveNumber', 'pointNumber', 'x', 'y'], 'plotly binding shape (no customdata on this trace)');
    assert.equal(sent.body.points[0].y, 'PE');
    await page.waitForFunction(source => window.__nexo.store.get().nodes.find(n => n.instance?.source === source)?.instance?.inputs?.cell_class === 'PE', 'cell_class_plot', { timeout: 5000 });
    await page.waitForFunction(id => /class PE$/.test(document.querySelector(`.card[data-id="${id}"] .plot`)?.layout?.title?.text ?? ''), cls.id, { timeout: 10000 });
    console.log(`PASS b12 ${name} class-bar-click-selects-class-and-redraws (${await title(page, cls.id)})`);
    // One undo step: Undo brings back the previous class.
    await page.locator('#viewport').focus(); await page.keyboard.press('Control+z');
    await page.waitForFunction(source => window.__nexo.store.get().nodes.find(n => n.instance?.source === source)?.instance?.inputs?.cell_class !== 'PE', 'cell_class_plot', { timeout: 5000 });
    console.log(`PASS b12 ${name} class-click-is-one-undo-step`);

    // 2. Cohort comparison: a click on a measurement point selects it (cell_sample), customdata carried.
    const cmp = await addLive(page, 'cell_comparison_plot');
    const before = (await events(page)).length;
    await clickMark(page, cmp.id, '.scatterlayer .point', 2);
    await page.waitForFunction(n => (window.__nexoMock.cardEvents ?? []).length > n, before, { timeout: 5000 });
    const last = (await events(page)).at(-1);
    assert.equal(last.body.source, 'cell_comparison_points');
    assert.equal(last.body.points[0].customdata, 'S03');
    await page.waitForFunction(source => window.__nexo.store.get().nodes.find(n => n.instance?.source === source)?.instance?.inputs?.cell_sample === 'S03', 'cell_comparison_plot', { timeout: 5000 });
    await page.waitForFunction(id => /measurement S03$/.test(document.querySelector(`.card[data-id="${id}"] .plot`)?.layout?.title?.text ?? ''), cmp.id, { timeout: 10000 });
    console.log(`PASS b12 ${name} comparison-point-click-selects-measurement-and-redraws`);

    // 3. A plot without a click source sends nothing (the dashboard PCA, whose clicks open a Team side panel only).
    const count = (await events(page)).length;
    const pca = (await page.evaluate(() => window.__nexo.store.get().nodes)).find(n => /plot_pca$/.test(n.id));
    if (pca) {
      await page.evaluate(id => window.__nexo.handle.focusNode(id), pca.id);
      const point = page.locator(`.card[data-id="${pca.id}"] .plot .scatterlayer .point`).first();
      const clicked = await point.count() > 0;
      if (clicked) { const box = await point.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(500); }
      assert.equal((await events(page)).length, count, 'a plot without clickSource forwards no click');
      console.log(`PASS b12 ${name} no-click-forwarding-without-clickSource (${clicked ? 'dashboard PCA point clicked' : 'no PCA point drawn: not clicked'})`);
    }
    assert.deepEqual(errors.filter(e => !/Failed to load resource/.test(e)), []); console.log(`PASS b12 ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP b12 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('b12 plotly click OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
