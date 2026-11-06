// Canvas Undo: a finished figure always comes back stale (never archived), its figure-page item comes back, and the
// browser-error diagnostic sends code locations only. Synthetic page: real canvas.js +
// canvas_feedback.js with a Plotly dashboard plot (as tests/dual-ui/test_team_canvas_finish_size.cjs).
// Run from the repository root: node tests/team-ux/test_canvas_undo_validity_browser.cjs
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT || '../browser/ci/node_modules/playwright');
const R = expr => execFileSync('Rscript', ['--vanilla', '-e', expr], {encoding: 'utf8'}).trim();
const jquery = R('cat(system.file("www/shared/jquery.min.js",package="shiny"))');
const plotly = R('cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))');
const ID = 'results_dashboard-plot_dist';
const markup = `<div class="rd-dashboard"><div class="rd-card"><div class="rd-card-head"><h3>Abundance distribution</h3></div><div id="${ID}" class="plotly html-widget-output" style="height:420px"></div></div></div><section id="team-canvas-root"><button class="tc-library-toggle"></button><div class="tc-layout"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset">Return all plots</button><button class="tc-arrange"></button><div class="tc-scroll" style="height:600px"><div class="tc-board"><div class="tc-empty"></div></div></div><div class="tc-status" tabindex="-1"></div></div></section>`;
const data = [{type: 'scatter', x: [1, 2, 3], y: [2, 3, 4]}], layout = {margin: {t: 10}, width: 500, height: 400};

async function setup(browser) {
  const page = await browser.newPage({viewport: {width: 1200, height: 1000}, acceptDownloads: true});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<!doctype html><html lang="en"><body>' + markup + '</body></html>');
  await page.addStyleTag({path: path.resolve('www/team/css/canvas.css')});
  await page.addStyleTag({path: path.resolve('www/team/css/canvas_feedback.css')});
  await page.addScriptTag({path: jquery}); await page.addScriptTag({path: plotly});
  await page.evaluate(({ID, data, layout}) => Plotly.newPlot(ID, data, layout), {ID, data, layout});
  await page.addScriptTag({path: path.resolve('www/team/js/canvas_feedback.js')});
  await page.addScriptTag({path: path.resolve('www/team/js/canvas.js')});
  await prep(page, 1);
  return {page, errors};
}
async function prep(page, revision) {
  await page.evaluate(revision => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: true, pending: false, running: false, revision}})), revision);
  await page.evaluate(({ID, data, layout}) => { const gd = document.getElementById(ID); jQuery(gd).trigger({type: 'shiny:value', value: {x: {data, layout}}}); return Plotly.react(gd, data, layout); }, {ID, data, layout});
  await page.waitForTimeout(450);
}
async function finished(page) {
  await page.evaluate(ID => TeamCanvas.addPlot(ID), ID); await page.waitForTimeout(100);
  await prep(page, await page.evaluate(() => window.__rev || 1));
  await page.locator('.tc-node-head button', {hasText: 'Finish plot'}).click();
  await page.waitForSelector('.tc-snapshot img');
}
const card = page => page.locator('#team-canvas-root .tc-board > .tc-node');
async function returnAndUndo(page, between) {
  await card(page).locator('button', {hasText: /^Return$/}).click();
  await page.waitForFunction(() => !document.querySelector('#team-canvas-root .tc-board > .tc-node'));
  if (between) await between();
  await page.locator('.tc-feedback-toast').hover();
  await page.locator('.tc-feedback-toast .tc-feedback-undo').click();
  await page.waitForSelector('#team-canvas-root .tc-board > .tc-node .tc-snapshot img');
}
// Export: a download, or a refusal on the status line (no download).
async function exportResult(page) {
  const download = page.waitForEvent('download', {timeout: 2500}).then(() => 'download', () => 'none');
  await card(page).getByRole('button', {name: 'SVG', exact: true}).click({force: true});
  const got = await download;
  return {got, stale: (await page.evaluate(() => TeamCanvas.serialize())).nodes[0].finished.stale, status: await page.locator('.tc-status').textContent()};
}

async function editAndFinish(page) {
  await card(page).locator('.tc-node-head button', {hasText: 'Edit'}).click();
  await prep(page, await page.evaluate(() => window.__rev || 1));
  await card(page).locator('.tc-node-head button', {hasText: 'Finish plot'}).click();
  await page.waitForSelector('#team-canvas-root .tc-board > .tc-node .tc-snapshot img');
}
async function undoneStale(page, what) {
  const caption = await card(page).locator('.tc-snapshot-status').textContent();
  assert.doesNotMatch(caption, /Saved checkpoint figure/, what + ': never an archived checkpoint figure');
  assert.match(caption, /Restored by Undo/, what + ': caption');
  const r = await exportResult(page);
  assert.equal(r.got, 'none', what + ': export refused after Undo'); assert.equal(r.stale, true, what + ': stale');
}

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // 1. Return, Undo: the frozen image is back but stale; Edit, then Finish plot, exports again.
    {
      const {page, errors} = await setup(browser);
      await finished(page);
      assert.equal((await exportResult(page)).got, 'download', 'fixture: a finished figure exports');
      await returnAndUndo(page);
      assert.match(await page.evaluate(() => { const t = TeamCanvasFeedback.current(); return t ? t.querySelector('.tc-feedback-text').textContent : ''; }), /Finish plot, before exporting/);
      await undoneStale(page, 'Return/Undo');
      await editAndFinish(page);
      assert.equal((await exportResult(page)).got, 'download', 'Edit, then Finish plot: exports again');
      // 2. Return all, Undo: the same rule, and the toast says so.
      await page.locator('.tc-reset').click(); await page.locator('.tc-reset-yes').click();
      await page.waitForFunction(() => !document.querySelector('#team-canvas-root .tc-board > .tc-node'));
      await page.locator('.tc-reset-toast .tc-reset-undo').click(); await page.waitForSelector('#team-canvas-root .tc-board > .tc-node .tc-snapshot img');
      assert.equal(await page.evaluate(() => { const t = TeamCanvasFeedback.current(); return t ? t.querySelector('.tc-feedback-text').textContent : ''; }), 'Restored 1 item · finished figures need Finish again before export');
      await undoneStale(page, 'Return all/Undo');
      await editAndFinish(page);
      assert.equal((await exportResult(page)).got, 'download', 'Return all: Edit, then Finish plot exports again');
      assert.deepEqual(errors, []); await page.close();
      console.log('ok Return / Return all Undo: stale, export refused until Edit + Finish plot');
    }
    // 3. Already stale before Return: stays stale.
    {
      const {page, errors} = await setup(browser);
      await finished(page);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: true, pending: false, running: false, revision: 2}})));
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(() => TeamCanvas.serialize())).nodes[0].finished.stale, true, 'fixture: stale before Return');
      await returnAndUndo(page);
      await undoneStale(page, 'stale before');
      assert.deepEqual(errors, []); await page.close();
      console.log('ok stale before removal stays stale after Undo');
    }
    // 4. Nested and pending: Return all, Undo while the plot's view is not mounted (the card waits
    //    as a pending node), Return all again, Undo again, then the view mounts: stale, not archived.
    {
      const {page, errors} = await setup(browser);
      await finished(page);
      const reset = async () => { await page.locator('.tc-reset').click(); await page.locator('.tc-reset-yes').click(); await page.waitForFunction(() => !document.querySelector('#team-canvas-root .tc-board > .tc-node')); };
      await reset();
      await page.evaluate(() => { window.__card = document.querySelector('.rd-card'); window.__card.remove(); });
      await page.locator('.tc-reset-toast .tc-reset-undo').click(); await page.waitForTimeout(200);
      const pending = await page.evaluate(ID => TeamCanvas.serialize().nodes.find(n => n.id === ID), ID);
      assert.ok(pending && pending.finished && pending.finished.stale === true, 'pending node saved stale: ' + JSON.stringify(pending && pending.finished && pending.finished.stale));
      await reset();
      await page.locator('.tc-reset-toast .tc-reset-undo').click(); await page.waitForTimeout(200);
      await page.evaluate(() => document.querySelector('.rd-dashboard').appendChild(window.__card));
      await page.waitForSelector('#team-canvas-root .tc-board > .tc-node .tc-snapshot img', {timeout: 10000});
      await undoneStale(page, 'nested pending Undo');
      assert.deepEqual(errors, []); await page.close();
      console.log('ok nested and pending Undo: stale, never archived');
    }
    // 4. Figure-page item (position, size, caption) comes back with the card.
    {
      const {page, errors} = await setup(browser);
      await finished(page);
      const item = {id: 'figure-0-x', nodeId: ID, type: 'figure', x: 300, y: 410, width: 180, height: 120, caption: 'Custom caption', z: 1};
      await page.evaluate(item => TeamCanvas.setDocument({version: '1', layout: 'free', paper: 'letter', orientation: 'portrait', showPageFurniture: false, items: [item]}), item);
      let updated = 0; await page.exposeFunction('__docUpdated', () => updated++);
      await page.evaluate(() => window.addEventListener('team-canvas-document-updated', () => window.__docUpdated()));
      // The figure page drops the item while the card is gone (as canvas_preview.js's save does).
      await returnAndUndo(page, () => page.evaluate(() => TeamCanvas.setDocument({version: '1', layout: 'free', paper: 'letter', orientation: 'portrait', showPageFurniture: false, items: []})));
      const doc = await page.evaluate(() => TeamCanvas.getDocument());
      assert.deepEqual(doc.items, [item], 'figure-page item restored');
      assert.deepEqual((await page.evaluate(() => TeamCanvas.serialize())).document.items, [item], 'and saved');
      assert.equal(updated, 1, 'the figure page is told to reload');
      // The page setup changed while the card was off the canvas and the old place no longer fits:
      // the item is not put back (the figure page places the card), and saving still works.
      const low = Object.assign({}, item, {x: 300, y: 700, width: 180, height: 50});
      await page.evaluate(low => TeamCanvas.setDocument({version: '1', layout: 'free', paper: 'letter', orientation: 'portrait', showPageFurniture: false, items: [low]}), low);
      await returnAndUndo(page, () => page.evaluate(() => TeamCanvas.setDocument({version: '1', layout: 'free', paper: 'letter', orientation: 'landscape', showPageFurniture: false, items: []})));
      const saved = await page.evaluate(() => TeamCanvas.serialize());
      assert.deepEqual(saved.document.items, [], 'an item that no longer fits is not restored');
      assert.deepEqual(errors, []); await page.close();
      console.log('ok figure-page position, size and caption come back with Undo');
    }
    // 5. A checkpoint restored while a Return fades: the new card is not removed.
    {
      const {page, errors} = await setup(browser);
      await page.evaluate(ID => TeamCanvas.addPlot(ID), ID); await page.waitForTimeout(100);
      const state = await page.evaluate(() => TeamCanvas.serialize());
      await card(page).locator('button', {hasText: /^Return$/}).click();
      await page.evaluate(state => TeamCanvas.restore(state), state);
      await page.waitForTimeout(500);
      assert.equal(await card(page).count(), 1, 'restored card survives the pending Return');
      assert.equal(await card(page).evaluate(n => n.classList.contains('tc-feedback-leaving')), false);
      assert.deepEqual(errors, []); await page.close();
      console.log('ok pending Return does not remove a card restored meanwhile');
    }
    // 6. Diagnostic: a multi-line error message sends neither its continuation lines nor names.
    {
      const {page, errors} = await setup(browser);
      await page.evaluate(() => { window.__sent = []; window.Shiny = {setInputValue: (k, v) => window.__sent.push(v)}; Promise.reject(new Error('Import failed\nalice@example.com\nprivate_study.csv')); Promise.reject(new Error('Import failed\n    at https://example.org/patient_ALICE_HIV/private_study.js:12:34')); });
      await page.waitForTimeout(200);
      const sent = await page.evaluate(() => window.__sent);
      assert.equal(sent.length, 2);
      const text = JSON.stringify(sent);
      assert.doesNotMatch(text, /alice|ALICE|example\.(com|org)|private_study|patient/, 'no user data: ' + text);
      sent.forEach(v => { assert.equal(v.message, 'Import failed'); assert.ok(v.stack.split(' | ').every(f => /^[^\s]+\.js:\d+:\d+$|^$/.test(f)), 'stack is code locations only: ' + v.stack); });
      assert.deepEqual(errors.filter(e => !/^Import failed/.test(e)), []); await page.close();
      console.log('ok diagnostic sends the first message line and code locations only');
    }
    console.log('PASS canvas Undo validity');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
