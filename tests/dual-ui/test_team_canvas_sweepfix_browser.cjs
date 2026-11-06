// Canvas click-audit fixes (ux29): Return all plots (confirm, Undo, figure page copy dropped),
// card-head keys (arrows only on the head, Shift+arrows resize), no reflow on add, no save on a plain
// click, page setup saved while the page cannot be composed, tab menu limits, plot editor locks.
// Synthetic fixture: real canvas markup (R/frontends/team/canvas.R) and the real Canvas scripts.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('../browser/ci/node_modules/playwright');
const markup = execFileSync('Rscript', ['--vanilla', '-e', 'source("R/frontends/team/canvas.R");cat(as.character(team_canvas_ui()))'], {encoding: 'utf8'});
const svg = n => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Ctext%3E${n}%3C/text%3E%3C/svg%3E`;
const plots = ['pca', 'volcano', 'heat2'].map(n => `<div class="rd-card"><h3>${n}</h3><div id="results_dashboard-plot_${n}" class="shiny-plot-output"><img src="${svg(n)}"></div></div>`).join('');

async function canvasPage(browser, withPreview, before = []) {
  const page = await browser.newPage({viewport: {width: 1400, height: 1000}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<!doctype html><html lang="en"><body class="team-workspace-app">' + markup + plots + '</body></html>');
  await page.addStyleTag({path: path.resolve('www/team/css/canvas.css')});
  await page.evaluate(() => {
    window.TeamIllustrations = {list: [{id: 'blood-tube', title: 'Blood sample tube', category: 'Sample context'}], svg: (id, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><circle cx="120" cy="90" r="45" fill="${color}"/></svg>`};
    window.TeamBusy = {begin: () => 't', end: () => {}, fail: () => {}};
    window.changes = 0; window.addEventListener('team-canvas-changed', () => window.changes++);
  });
  for (const js of before) await page.addScriptTag({path: path.resolve(`www/team/js/${js}.js`)});
  await page.addScriptTag({path: path.resolve('www/team/js/canvas.js')});
  if (withPreview) {
    await page.addStyleTag({path: path.resolve('www/team/css/canvas_preview.css')});
    await page.addScriptTag({path: path.resolve('www/team/js/canvas_preview.js')});
  }
  return {page, errors};
}

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // ---- F-01: Return all plots asks first, can be undone, and the figure page drops its copy.
    {
      const {page, errors} = await canvasPage(browser, true);
      // Empty canvas: nothing to lose, no question.
      await page.locator('.tc-reset').click();
      assert.equal(await page.locator('.tc-reset-confirm').count(), 0, 'empty canvas returns without a confirmation');
      await page.evaluate(() => { TeamCanvas.addPlot('results_dashboard-plot_pca'); TeamCanvas.addPlot('results_dashboard-plot_volcano'); TeamCanvas.addIllustration('blood-tube'); });
      await page.waitForTimeout(150);
      await page.evaluate(() => TeamCanvas.setDocument({version: '1', layout: 'free', paper: 'letter', orientation: 'portrait', showPageFurniture: false, items: [{id: 'note-1', type: 'text', x: 40, y: 40, width: 220, height: 50, text: 'Panel note', fontSize: 16, color: '#172d4b', z: 1}]}));
      const before = JSON.stringify(await page.evaluate(() => TeamCanvas.serialize()));
      assert.equal(JSON.parse(before).document.items.length, 1, 'fixture has a figure-page text');
      // Cancel leaves the saved state byte-identical.
      await page.locator('.tc-reset').click();
      const dialog = page.locator('.tc-reset-confirm[role="alertdialog"]');
      assert.equal(await dialog.locator('p').textContent(), 'Return all 2 plots and 1 illustration? This clears the figure page.');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Cancel', 'focus starts on Cancel');
      await dialog.getByRole('button', {name: 'Cancel'}).click();
      assert.equal(await dialog.count(), 0);
      assert.equal(JSON.stringify(await page.evaluate(() => TeamCanvas.serialize())), before, 'Cancel changes nothing');
      // Escape cancels too.
      await page.locator('.tc-reset').click(); await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0); assert.equal(JSON.stringify(await page.evaluate(() => TeamCanvas.serialize())), before);
      // Open the figure page so canvas_preview.js holds its own copy of the document.
      await page.getByRole('tab', {name: 'Print preview'}).click(); await page.waitForTimeout(150);
      await page.getByRole('tab', {name: 'Workspace', exact: true}).click();
      await page.locator('.tc-reset').click(); await dialog.getByRole('button', {name: 'Return all'}).click();
      const cleared = await page.evaluate(() => TeamCanvas.serialize());
      assert.equal(cleared.nodes.length, 0); assert.ok(cleared.document == null, 'figure page document cleared');
      const toast = page.locator('.tc-reset-toast');
      assert.match(await toast.textContent(), /^Returned 3 items/);
      // The figure page shows no stale text, and its next save does not send the old document back.
      await page.getByRole('tab', {name: 'Print preview'}).click(); await page.waitForTimeout(150);
      assert.equal(await page.locator('.tc-preview-pages').getByText('Panel note').count(), 0, 'no stale text on the figure page');
      await page.getByRole('tab', {name: 'Workspace', exact: true}).click();
      // Undo brings the cards and the figure page document back, and saves it as an edit.
      const changesBefore = await page.evaluate(() => window.changes);
      await toast.getByRole('button', {name: 'Undo'}).click(); await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => window.changes) > changesBefore, 'Undo is saved');
      const undone = await page.evaluate(() => TeamCanvas.serialize());
      assert.equal(undone.nodes.length, 3, 'cards are back');
      assert.deepEqual(undone.nodes.map(n => [n.id, n.x, n.y, n.width, n.height]), JSON.parse(before).nodes.map(n => [n.id, n.x, n.y, n.width, n.height]));
      assert.deepEqual(undone.document, JSON.parse(before).document, 'figure page document is back');
      assert.equal(await page.locator('.tc-node').count(), 3);
      // Second time: a page setup change after Return all saves no stale text, and makes Undo unavailable.
      await page.locator('.tc-reset').click(); await dialog.getByRole('button', {name: 'Return all'}).click();
      await page.getByRole('tab', {name: 'Print preview'}).click(); await page.waitForTimeout(150);
      await page.evaluate(() => { const l = document.querySelector('.tc-preview-layout'); l.value = 'pages'; l.dispatchEvent(new Event('change')); }); await page.waitForTimeout(100);
      const resent = await page.evaluate(() => TeamCanvas.getDocument());
      assert.ok(!resent || !resent.items.some(i => i.type === 'text'), 'the cleared text is not re-sent: ' + JSON.stringify(resent));
      await page.getByRole('tab', {name: 'Workspace', exact: true}).click();
      await toast.getByRole('button', {name: 'Undo'}).click(); await page.waitForTimeout(100);
      assert.equal((await page.evaluate(() => TeamCanvas.serialize())).nodes.length, 0, 'a stale Undo does not overwrite later changes');
      assert.match(await page.locator('.tc-status').textContent(), /cannot be undone/);
      // A question left open while the canvas changes asks again with the new counts.
      await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_pca')); await page.waitForTimeout(100);
      await page.locator('.tc-reset').click();
      await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_volcano')); await page.waitForTimeout(100);
      await dialog.getByRole('button', {name: 'Return all'}).click();
      assert.equal(await page.locator('.tc-node').count(), 2, 'a stale confirmation clears nothing');
      assert.equal(await dialog.locator('p').textContent(), 'Return all 2 plots? This clears the figure page.');
      await dialog.getByRole('button', {name: 'Cancel'}).click();
      assert.deepEqual(errors, []);
      await page.close();
    }
    // ---- F-04 / F-32 / F-10 / F-31: card head keys, plain click, no reflow on add.
    {
      const {page, errors} = await canvasPage(browser, false);
      await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_pca')); await page.waitForTimeout(100);
      const node = page.locator('.tc-node').first(), head = node.locator('.tc-node-head');
      const geo = () => node.evaluate(n => ({left: n.style.left, top: n.style.top, width: n.offsetWidth, height: n.offsetHeight}));
      const start = await geo();
      // Arrows on a button in the head never move the card.
      const btn = head.locator('button').first(); await btn.focus(); await btn.press('ArrowDown'); await btn.press('ArrowRight');
      assert.deepEqual(await geo(), start, 'arrow keys on a head button do not move the card');
      // Shift+arrows resize: 10 px, Shift+Alt 1 px; one undo step per burst.
      await head.focus();
      await head.press('Shift+ArrowRight'); await head.press('Shift+ArrowRight'); await head.press('Shift+ArrowDown'); await head.press('Shift+Alt+ArrowRight');
      let g = await geo();
      assert.equal(g.width, start.width + 21); assert.equal(g.height, start.height + 10); assert.equal(g.left, start.left, 'resize does not move');
      await page.waitForTimeout(800);
      await head.press('Control+z');
      g = await geo(); assert.equal(g.width, start.width, 'one undo reverts the whole burst'); assert.equal(g.height, start.height);
      // Undo right after a resize (burst still open) reverts that resize.
      await head.press('Shift+ArrowRight'); await head.press('Control+z');
      assert.equal((await geo()).width, start.width, 'immediate Undo reverts the open resize burst');
      // Minimum size holds.
      for (let i = 0; i < 60; i++) await head.press('Shift+ArrowLeft');
      assert.equal((await geo()).width, 330, 'min width respected');
      await page.waitForTimeout(800);
      // A plain click on the title (no drag) does not save.
      const c0 = await page.evaluate(() => window.changes);
      const box = await head.boundingBox(); await page.mouse.click(box.x + 8, box.y + box.height / 2);
      assert.equal(await page.evaluate(() => window.changes), c0, 'click without drag does not autosave');
      // Adding a card keeps the person's placement.
      await node.evaluate(n => { n.style.left = '700px'; n.style.top = '500px'; });
      await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_volcano')); await page.waitForTimeout(150);
      assert.deepEqual(await node.evaluate(n => [n.style.left, n.style.top]), ['700px', '500px'], 'existing card stays where it was put');
      const nodes = await page.locator('.tc-node').evaluateAll(ns => ns.map(n => [n.offsetLeft, n.offsetTop, n.offsetWidth, n.offsetHeight]));
      const [a, b] = nodes; assert.ok(!(a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]), 'cards do not overlap');
      // Explicit Arrange still repacks.
      await page.locator('.tc-arrange').click();
      assert.notDeepEqual(await node.evaluate(n => [n.style.left, n.style.top]), ['700px', '500px'], 'Arrange still arranges');
      assert.deepEqual(errors, []);
      await page.close();
    }
    // ---- F-03 / F-16 / F-17: plot editor locks, palette availability, annotation limit.
    {
      const library = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], {encoding: 'utf8'}).trim();
      const page = await browser.newPage();
      await page.setContent('<div id="plot"></div><div id="editor"></div><div id="plot2"></div><div id="editor2"></div>');
      await page.addScriptTag({path: library}); await page.addScriptTag({path: path.resolve('www/team/js/plot_editor.js')});
      const r = await page.evaluate(async () => {
        const out = {};
        const gd = document.getElementById('plot');
        await Plotly.newPlot(gd, [{x: [1, 2], y: [3, 4], name: 'A', marker: {color: '#112233'}}, {x: [1, 2], y: [5, 6], name: 'B', marker: {color: '#445566'}}], {});
        let state = {layout: {}, traces: [], annotations: []}, locked = true, calls = 0;
        TeamPlotEditor.mount({container: document.getElementById('editor'), getPlot: () => gd, isLocked: () => locked, getState: () => state, onChange: n => { calls++; state = n; }});
        const ed = document.getElementById('editor'), find = (root, t) => Array.from(root.querySelectorAll('button')).find(b => b.textContent.trim() === t);
        out.hasApply = !!find(ed, 'Apply palette');
        const before = JSON.stringify(state);
        ['Publication style', 'Apply palette', 'Add annotation'].forEach(t => { const b = find(ed, t); if (b) b.click(); });
        out.showAllDisabled = find(ed, 'Show all series').disabled;
        out.lockedCalls = calls; out.lockedSame = JSON.stringify(state) === before;
        locked = false; const pub = find(ed, 'Publication style'); pub.focus(); pub.click();
        out.unlockedCalls = calls; out.focusKept = document.activeElement && document.activeElement.textContent.trim();
        // 30 annotations: Add annotation is disabled.
        state = {layout: {}, traces: [], annotations: Array.from({length: 30}, (_, i) => ({text: 'n' + i, x: .5, y: .5}))};
        TeamPlotEditor.mount({container: document.getElementById('editor2'), getPlot: () => gd, getState: () => state, onChange: n => { state = n; }});
        out.addDisabled = find(document.getElementById('editor2'), 'Add annotation').disabled;
        // Per-point colours only: no palette to apply, an explanation instead.
        const gd2 = document.getElementById('plot2');
        await Plotly.newPlot(gd2, [{x: [1, 2], y: [3, 4], mode: 'markers', marker: {color: ['#ff0000', '#00ff00']}}], {});
        const host = document.createElement('div'); document.body.appendChild(host);
        TeamPlotEditor.mount({container: host, getPlot: () => gd2, getState: () => ({layout: {}, traces: []}), onChange: () => {}});
        out.pointApply = !!find(host, 'Apply palette'); out.pointNote = /no series a palette can recolour/.test(host.textContent);
        return out;
      });
      assert.equal(r.hasApply, true, 'series chart keeps Apply palette');
      assert.equal(r.showAllDisabled, true, 'Show all series is disabled on a finished card'); assert.equal(r.lockedCalls, 0, 'a locked (finished) card saves no style change'); assert.equal(r.lockedSame, true);
      assert.ok(r.unlockedCalls > 0, 'unlocked card applies Publication style');
      assert.equal(r.focusKept, 'Publication style', 'focus returns to the control after the panel redraws');
      assert.equal(r.addDisabled, true, 'Add annotation disabled at 30');
      assert.equal(r.pointApply, false); assert.equal(r.pointNote, true, 'per-point chart explains why there is no palette');
      await page.close();
    }
    // ---- F-20 / F-18: tab menu limits; New tab + move is one undo step.
    {
      const {page, errors} = await canvasPage(browser, false, ['canvas_viewport']);
      await page.evaluate(() => { window.LIPIDOMIC_TEAM_WORKSPACE = true; document.getElementById('team-canvas-root').dataset.tsShell = 'true'; });
      await page.addScriptTag({path: path.resolve('www/team/js/canvas_tabs_model.js')});
      await page.addScriptTag({path: path.resolve('www/team/js/canvas_tabs.js')});
      await page.waitForTimeout(100);
      if (await page.locator('.tc-canvas-tab-more').count() === 1 || await page.locator('.tc-canvas-tab-more').count()) {
        await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_pca')); await page.waitForTimeout(100);
        await page.locator('.tc-canvas-tab-add').first().click(); await page.waitForTimeout(50);
        const more = page.locator('.tc-canvas-tab-more').first(); await more.click();
        const menu = more.locator('xpath=..'), left = menu.locator('.tc-canvas-tab-actions button', {hasText: 'Move tab left'}), right = menu.locator('.tc-canvas-tab-actions button', {hasText: 'Move tab right'});
        assert.equal(await right.isDisabled(), true, 'last tab cannot move right'); assert.equal(await left.isDisabled(), false);
        await page.keyboard.press('Escape');
        await page.locator('.tc-canvas-tab').first().click(); await page.waitForTimeout(50); await more.click();
        assert.equal(await left.isDisabled(), true, 'first tab cannot move left'); assert.equal(await right.isDisabled(), false);
        await page.keyboard.press('Escape');
        // Return all with tabs mounted: the tabs bookkeeping does not void Undo.
        await page.locator('.tc-reset').click(); await page.locator('.tc-reset-yes').click(); await page.waitForTimeout(100);
        assert.equal(await page.locator('.tc-node').count(), 0);
        await page.locator('.tc-reset-toast .tc-reset-undo').click(); await page.waitForTimeout(300);
        assert.equal(await page.locator('.tc-node').count(), 1, 'Undo works with canvas tabs');
      } else assert.fail('tab bar did not mount');
      assert.deepEqual(errors, []);
      await page.close();
    }
    // ---- F-29: page setup is saved even when the page cannot be composed right now.
    {
      const page = await browser.newPage();
      await page.setContent('<!doctype html><html lang="en"><body>' + markup + '</body></html>');
      await page.evaluate(() => {
        window.jQuery = () => ({on: function () { return this; }}); window.TeamBusy = {begin: () => 't', end: () => {}, fail: () => {}};
        window.savedDoc = {version: '1', layout: 'free', paper: 'letter', orientation: 'portrait', showPageFurniture: true, items: []}; window.setCalls = 0;
        window.TeamCanvas = {previewState: () => { throw new Error('Analysis busy.'); }, getDocument: () => structuredClone(savedDoc), setDocument: d => { setCalls++; savedDoc = structuredClone(d); }};
      });
      await page.addScriptTag({path: path.resolve('www/team/js/canvas_preview.js')});
      await page.getByRole('tab', {name: 'Print preview'}).click(); await page.waitForTimeout(100);
      await page.evaluate(() => { for (const [sel, v] of [['.tc-preview-paper', 'a4'], ['.tc-preview-orientation', 'landscape']]) { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('change')); } });
      const doc = await page.evaluate(() => savedDoc);
      assert.equal(doc.paper, 'a4'); assert.equal(doc.orientation, 'landscape', 'page setup saved while the page cannot be composed');
      assert.deepEqual(doc.items, [], 'no objects added');
      await page.close();
    }
    console.log('PASS team canvas sweep fixes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
