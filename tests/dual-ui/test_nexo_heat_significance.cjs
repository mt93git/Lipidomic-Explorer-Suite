// Abundance heatmap "Show: Significant only" (results_dashboard-plot_heat), as Team (R/results_dashboard.R
// heat_significance_status, www/team/js/dashboard_significance.js): the Data tab disables only "Significant only"
// when Team's note says it is unavailable, shows the note under the control (aria-describedby), and shows
// "Showing N significant lipids: ..." when it is available. A failed card shows its message at the top of the body
// (visible whenever the header is) and the status badge is not covered by a title tooltip. Mock build, Chromium and WebKit.
// node tests/dual-ui/test_nexo_heat_significance.cjs
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
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/heat-significance');
const SOURCE = 'results_dashboard-plot_heat';
const UNAVAILABLE = /^Significant only is unavailable\. \S/;
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
const bySource = (list, source) => list.find(n => n.instance?.source === source && (n.instance?.id || n.instance?.instanceId));
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function waitNode(page, test, label) {
  await page.waitForFunction(([source, test]) => { const n = window.__nexo.store.get().nodes.find(n => n.instance?.source === source && (n.instance?.id || n.instance?.instanceId)); return !!n && new Function('n', `return ${test}`)(n); }, [SOURCE, test], { timeout: 10000 })
    .catch(async () => { throw new Error(`${label}: ${JSON.stringify(bySource(await nodes(page), SOURCE))}`); });
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
    await page.evaluate(source => window.__nexo.handle.addCard(source), SOURCE);
    await waitNode(page, 'true', 'heat card added');
    let h = bySource(await nodes(page), SOURCE);
    await page.evaluate(id => window.__nexo.handle.focusNode(id), h.id);
    await page.waitForTimeout(600);
    await card(page, h.id).locator('header').click();
    await page.getByRole('tab', { name: 'Data', exact: true }).click();
    const significant = page.getByRole('radio', { name: 'Significant only', exact: true });
    const all = page.getByRole('radio', { name: 'All lipids', exact: true });
    const note = page.locator('#heat_significance-status');
    await significant.waitFor();
    fs.mkdirSync(evidence, { recursive: true });

    // 1. Not allowed (design not confirmed): only "Significant only" is disabled; Team's reason under the control.
    await note.waitFor();
    assert.equal(await significant.isDisabled(), true, 'Significant only disabled while unavailable');
    assert.equal(await all.isDisabled(), false, 'All lipids stays enabled');
    assert.equal(await all.isChecked(), true);
    assert.match((await note.textContent()).trim(), UNAVAILABLE);
    assert.equal(await note.getAttribute('role'), 'status');
    assert.equal(await note.getAttribute('data-allowed'), 'false');
    assert.equal(await significant.getAttribute('aria-describedby'), 'heat_significance-status');
    // The note sits right under the control.
    const group = await page.locator('#heat_significance').boundingBox(), noteBox = await note.boundingBox();
    assert.ok(noteBox.y >= group.y + group.height - 1 && noteBox.y - (group.y + group.height) < 24, `note under the control (${JSON.stringify({ group, noteBox })})`);
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-not-allowed.png') });
    console.log(`PASS heat-significance ${name} not-allowed-option-disabled-note-says-why`);

    // 2. Independent design confirmed (the card's design action, as the library link): available; "Showing N ...".
    await page.evaluate(id => document.querySelector(`.card[data-id="${id}"]`).dispatchEvent(new CustomEvent('nexo-card-action', { bubbles: true, detail: { action: 'design', nodeId: id } })), h.id);
    const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
    await design.getByRole('button', { name: 'Confirm study design', exact: true }).click();
    await design.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => { const r = document.querySelector('input[type=radio][value=significant]'); return r && !r.disabled; }, null, { timeout: 10000 });
    assert.equal(await all.isDisabled(), false);
    await significant.check();
    await waitNode(page, `n.instance.inputs.heat_significance === 'significant'`, 'Significant only written to the card');
    await page.waitForFunction(() => /^Showing \d+ significant lipids?: .+\.$/.test(document.querySelector('#heat_significance-status')?.textContent?.trim() ?? ''), null, { timeout: 10000 })
      .catch(async () => { throw new Error(`allowed note: ${await note.textContent().catch(() => 'missing')}`); });
    assert.equal(await note.getAttribute('data-allowed'), 'true');
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-allowed-showing.png') });
    console.log(`PASS heat-significance ${name} allowed-option-enabled-note-showing-n`);

    // 3. A stored "significant" while Team's guard now says no (mock knob, refreshed as after a design change):
    // the value is kept (checked, disabled), the note says why, the card shows Team's message. No input is sent.
    const patches = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await page.evaluate(id => { window.__nexoPrefetchMock.heatSignificance = false; window.dispatchEvent(new CustomEvent('nexo-design-confirmed')); window.__nexo.handle.refreshCard(id); }, h.id);
    await page.waitForFunction(() => document.querySelector('input[type=radio][value=significant]')?.disabled === true, null, { timeout: 10000 });
    assert.equal(await significant.isChecked(), true, 'stored Significant only kept');
    assert.match((await note.textContent()).trim(), UNAVAILABLE);
    h = bySource(await nodes(page), SOURCE);
    assert.equal(h.instance.inputs.heat_significance, 'significant', 'input unchanged');
    const message = card(page, h.id).locator('.body.message p').first();
    await message.waitFor({ timeout: 10000 });
    assert.match((await message.textContent()).trim(), /^Significant only is unavailable\..*Choose All lipids to show the heatmap\.$/);
    assert.equal(await page.evaluate(n => window.__nexoMock.cardPatches.slice(n).filter(p => 'heat_significance' in (p.body.inputs ?? {})).length, patches), 0, 'nothing silently written');
    console.log(`PASS heat-significance ${name} stored-significant-kept-reason-shown-card-message`);

    // 4. Card failure placement: a 1000x1100 card at a zoom where only its top third is on screen, header at the top.
    await page.evaluate(id => window.__nexo.handle.setCardSize(id, { width: 1000, height: 1100 }), h.id);
    await waitNode(page, 'n.height === 1100', 'card resized');
    await page.evaluate(() => window.__nexo.handle.zoomTo(2.2));
    await page.waitForTimeout(400);
    const pan = await page.evaluate(id => { const vp = document.querySelector('#viewport').getBoundingClientRect(), head = document.querySelector(`.card[data-id="${id}"] header`).getBoundingClientRect();
      return { dx: head.left - (vp.left + 40), dy: head.top - (vp.top + 24), cx: vp.left + vp.width / 2, cy: vp.top + vp.height / 2 }; }, h.id);
    await page.mouse.move(pan.cx, pan.cy);
    await page.mouse.wheel(pan.dx, pan.dy);
    await page.waitForTimeout(500);
    await message.waitFor({ timeout: 10000 });
    const geo = await page.evaluate(id => { const el = document.querySelector(`.card[data-id="${id}"]`), r = x => { const b = x.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
      return { vp: r(document.querySelector('#viewport')), card: r(el), head: r(el.querySelector('header')), body: r(el.querySelector('.body')), message: r(el.querySelector('.body.message p')), status: r(el.querySelector('.card-status')) }; }, h.id);
    const shown = (geo.vp.bottom - geo.card.top) / (geo.card.bottom - geo.card.top);
    assert.ok(geo.head.top >= geo.vp.top && geo.head.bottom <= geo.vp.bottom, `header on screen (${JSON.stringify(geo)})`);
    assert.ok(shown > 0.2 && shown < 0.45, `about the top third of the card is on screen (${shown.toFixed(2)})`);
    assert.ok(geo.message.top >= geo.head.bottom && geo.message.bottom <= geo.vp.bottom, `the message is in the visible top part of the body (${JSON.stringify(geo)})`);
    assert.ok(geo.message.top - geo.body.top < (geo.body.bottom - geo.body.top) * 0.15, `the message is at the top of the body (${JSON.stringify(geo)})`);
    assert.ok(geo.message.left >= geo.vp.left && geo.message.right <= geo.vp.right, `the message is on screen horizontally too (${JSON.stringify(geo)})`);
    assert.ok(geo.message.left - geo.body.left < (geo.body.right - geo.body.left) * 0.15, `the message starts at the left of the body (${JSON.stringify(geo)})`);
    assert.ok(geo.status.top >= geo.vp.top && geo.status.bottom <= geo.vp.bottom, 'the status badge is on screen');
    console.log(`PASS heat-significance ${name} card-failure-message-at-top-of-body`);

    // 5. Hover the status badge: no title tooltip (native or card-level) covers it; the title's own tooltip is on the title text.
    const status = card(page, h.id).locator('.card-status');
    assert.equal(await status.getAttribute('data-state'), 'error');
    const box = await status.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const hover = await page.evaluate(([x, y, id]) => { const top = document.elementFromPoint(x, y), el = document.querySelector(`.card[data-id="${id}"]`), status = el.querySelector('.card-status'), title = el.querySelector('.card-title');
      return { onStatus: status.contains(top), titled: (t => t && !status.contains(t) ? t.className || t.tagName : null)(top?.closest('[title]')), statusTip: status.getAttribute('title'), titleLeft: title.getBoundingClientRect().left, statusRight: status.getBoundingClientRect().right, titleTip: title.getAttribute('title') }; }, [box.x + box.width / 2, box.y + box.height / 2, h.id]);
    assert.equal(hover.onStatus, true, 'the badge is topmost at its centre');
    // The badge may carry its own explanation (title); no tooltip from outside it (the card, the card title) applies there.
    assert.equal(hover.titled, null, `no title tooltip from outside the badge applies over it (${hover.titled})`);
    assert.ok(hover.titleLeft >= hover.statusRight, 'the title (and its tooltip) starts after the badge');
    // Empty header space right of the title text (left of the actions) carries no title tooltip either: the tooltip is
    // anchored to the title text, not to the whole header or card.
    const blank = await page.evaluate(id => { const el = document.querySelector(`.card[data-id="${id}"]`), t = el.querySelector('.card-title').getBoundingClientRect(), a = el.querySelector('.card-actions').getBoundingClientRect(), vp = document.querySelector('#viewport').getBoundingClientRect();
      const x = Math.min(t.right + 30, (t.right + Math.min(a.left, vp.right)) / 2), y = t.top + t.height / 2, top = document.elementFromPoint(x, y);
      return { x, inHeader: !!top?.closest('header'), titled: top?.closest('[title]') ? (top.closest('[title]').className || top.closest('[title]').tagName) : null }; }, h.id);
    assert.equal(blank.inHeader, true, `probe point in the header (${JSON.stringify(blank)})`);
    assert.equal(blank.titled, null, `no title tooltip on empty header space (${JSON.stringify(blank)})`);
    assert.equal(hover.titleTip, h.label, 'the title keeps its own tooltip');
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-card-failure-top.png') });
    console.log(`PASS heat-significance ${name} status-badge-not-covered-by-title-tooltip`);

    assert.deepEqual(errors.filter(e => !/Failed to load resource|Significant only is unavailable/.test(e)), [], `console errors in ${name}`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP heat-significance Playwright: ${e.message}`); return; } throw e; }
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
  console.log('heat-significance OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
