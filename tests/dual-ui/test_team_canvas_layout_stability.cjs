// Run with: node tests/dual-ui/test_team_canvas_layout_stability.cjs   (about 90 s: one real 60 s idle)
// Canvas layout is explicit state (ux32). Mock page, real Canvas scripts and real Plotly
// (fixture_team_canvas_layout_page.cjs logs every card left/top/width/height write with its stack).
//  (a) A 17-card checkpoint restores at its saved geometry and nothing writes a card position or
//      size afterwards: not the Plotly draws (lazy mounts), Shiny value events, image reloads,
//      window resizes, plot relayouts, showing a Canvas restored while hidden, nor 60 s of idle.
//      Plot height changes reach Shiny as at most one window resize per frame.
//  (b) A drop that overlaps moves only the overlapped card, once, by the least distance, animated
//      (none with reduced motion); the drop and the nudge are one undo step. A keyboard resize
//      that ends overlapping settles the same way. Cards that overlap nothing never move.
//  (c) Tidy up packs in reading order; Undo in the shared toast restores the exact positions.
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('../browser/ci/node_modules/playwright');
const IDLE_S = Number(process.env.LAYOUT_IDLE_S || 60);
const {layoutPage, seventeenCardState} = require('./fixture_team_canvas_layout_page.cjs');

const heatDraw = `(async()=>{const x=Array.from({length:30},(_,i)=>'L'+i),y=['A','B','C','D'];await Plotly.newPlot('results_dashboard-plot_heat',[{type:'heatmap',x,y,z:y.map((g,j)=>x.map((l,i)=>i-j))}],{margin:{l:150,r:20,t:30,b:60},meta:{teamHeatmap:{version:1,geometry:'square-horizontal',naturalWidth:800,naturalHeight:300,rowCount:30,columnCount:4}}});jQuery(document.getElementById('results_dashboard-plot_heat')).trigger('shiny:value');})()`;
const scatterDraw = `(async()=>{await Plotly.newPlot('results_dashboard-plot_scatter',[{type:'scatter',x:[1,2,3],y:[3,1,2]}],{margin:{t:20}});jQuery(document.getElementById('results_dashboard-plot_scatter')).trigger('shiny:value');})()`;
const savedGeometry = state => state.nodes.map(n => ({id: n.id, left: n.x + 'px', top: n.y + 'px', width: n.width + 'px', height: n.height + 'px'})).sort((a, b) => a.id < b.id ? -1 : 1);
const box = (id, x, y, width, height) => ({id: 'results_dashboard-plot_' + id, label: id, x, y, width, height, visual: {background: '#ffffff'}, finished: null});
const frames = page => page.evaluate(() => Object.fromEntries(TeamCanvas.serialize().nodes.map(n => [n.id.replace('results_dashboard-plot_', ''), [n.x, n.y, n.width, n.height]])));

async function churn(page) {
  // Lazy mounts and Shiny updates: Plotly draws into restored cards, values arrive, images reload,
  // the window and the plots resize.
  await page.evaluate(heatDraw); await page.evaluate(scatterDraw);
  await page.evaluate(() => {
    document.querySelectorAll('.tc-node .shiny-plot-output').forEach(el => { jQuery(el).trigger('shiny:value'); const img = el.querySelector('img'); if (img) img.src = img.src.replace(/#.*$/, '') + '#reload'; });
    window.dispatchEvent(new Event('resize'));
    document.querySelectorAll('.tc-node .js-plotly-plot').forEach(gd => { Plotly.Plots.resize(gd); Plotly.relayout(gd, {'xaxis.autorange': true}); });
    if (window.TeamCanvas.fitAllPlots) TeamCanvas.fitAllPlots();
  });
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // ---- (a) Restore 17 cards, mount plots lazily, idle 60 s: no card moves or resizes.
    {
      const {page, errors} = await layoutPage(browser);
      const state = seventeenCardState();
      await page.evaluate(() => { window.__resizes = 0; const d = window.dispatchEvent.bind(window); window.dispatchEvent = e => { if (e.type === 'resize') window.__resizes++; return d(e); }; });
      await page.evaluate(s => TeamCanvas.restore(s), state);
      assert.deepEqual(await page.evaluate(() => __geometry()), savedGeometry(state), 'every card restores at its saved geometry');
      await page.evaluate(() => { window.__logWrites = true; });
      await churn(page);
      assert.ok(await page.evaluate(() => window.__resizes) <= 6, 'plot height changes reach Shiny as one window resize per frame, not one per card');
      const samples = [];
      for (let t = 0; t < IDLE_S; t += 5) { await page.waitForTimeout(5000); samples.push(await page.evaluate(() => __geometry())); }
      samples.forEach((g, i) => assert.deepEqual(g, savedGeometry(state), `no card moved or resized after ${(i + 1) * 5} s idle`));
      const writes = await page.evaluate(() => __writes);
      assert.deepEqual(writes, [], 'no code wrote a card position or size after the restore:\n' + writes.map(w => `${w.id} ${w.prop} ${w.before}->${w.after} ${w.stack}`).join('\n'));
      assert.deepEqual(errors, []);
      await page.close();
    }
    // ---- (a, shell) The same checkpoint restored while the Canvas is hidden, inside the Team shell
    // (card_frame.js, card_figure.js fit every card), then shown: still nothing moves.
    {
      const {page, errors} = await layoutPage(browser, {shell: true});
      const state = seventeenCardState();
      await page.evaluate(() => { document.getElementById('team-canvas-root').style.display = 'none'; });
      await page.evaluate(s => TeamCanvas.restore(s), state);
      await page.evaluate(() => { window.__logWrites = true; document.getElementById('team-canvas-root').style.display = ''; });
      await churn(page);
      await page.waitForTimeout(3000);
      assert.deepEqual(await page.evaluate(() => __geometry()), savedGeometry(state), 'shown after a hidden restore, every card keeps its saved geometry');
      assert.deepEqual(await page.evaluate(() => __writes.map(w => `${w.id} ${w.prop} ${w.stack}`)), [], 'no card write after a hidden restore is shown');
      assert.deepEqual(errors, []);
      await page.close();
    }
    // ---- (b) Drop and keyboard resize: only overlapping cards move, minimally, once.
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const {page, errors} = await layoutPage(browser, {shell: false});
      await page.emulateMedia({reducedMotion});
      await page.evaluate(s => TeamCanvas.restore(s), {version: '1', libraryHidden: false, nodes: [box('pca', 30, 30, 400, 300), box('volcano', 460, 30, 400, 300), box('violin', 30, 360, 400, 300), box('comp', 1200, 900, 400, 300)]});
      await page.evaluate(() => TeamCanvasViewport.setScale(1)); await page.waitForTimeout(200);
      const before = await frames(page);
      await page.evaluate(() => { window.__logWrites = true; window.__moving = 0; new MutationObserver(r => r.forEach(m => { if (m.target.classList && m.target.classList.contains('tc-layout-moving')) window.__moving++; })).observe(document.querySelector('.tc-board'), {subtree: true, attributes: true, attributeFilter: ['class']}); });
      // Drag PCA 270 px right: it now covers the left 240 px of Volcano.
      const head = page.locator('[data-plot-id="results_dashboard-plot_pca"] .tc-node-head strong');
      await head.scrollIntoViewIfNeeded();
      const h = await head.boundingBox();
      await page.mouse.move(h.x + 5, h.y + h.height / 2); await page.mouse.down();
      for (let i = 1; i <= 9; i++) await page.mouse.move(h.x + 5 + i * 30, h.y + h.height / 2);
      // Mid-drag nothing else moves.
      assert.deepEqual((await frames(page)).volcano, before.volcano, 'no card moves while a drag is in progress');
      await page.mouse.up(); await page.waitForTimeout(400);
      const dropped = await frames(page);
      assert.deepEqual(dropped.pca, [300, 30, 400, 300], 'the dropped card stays where it was dropped');
      // Least move that clears PCA by the 20 px gap: right to 720 (260 px); down would be 320 px.
      assert.deepEqual(dropped.volcano, [720, 30, 400, 300], 'only the overlapped card moves, by the shortest distance');
      assert.deepEqual(dropped.violin, before.violin, 'a card that overlaps nothing stays');
      assert.deepEqual(dropped.comp, before.comp, 'a distant card stays');
      const moved = await page.evaluate(() => [...new Set(__writes.filter(w => w.prop === 'left' || w.prop === 'top').map(w => w.id.replace('results_dashboard-plot_', '')))].sort());
      assert.deepEqual(moved, ['pca', 'volcano'], 'only the dragged and the overlapped card are written');
      assert.equal(await page.evaluate(() => __writes.filter(w => w.id.endsWith('volcano')).length), 1, 'the nudged card is written once');
      if (reducedMotion === 'reduce') assert.equal(await page.evaluate(() => window.__moving), 0, 'reduced motion: the nudge is instant');
      else assert.ok(await page.evaluate(() => window.__moving) > 0, 'the nudge animates');
      // A later plot draw or window resize moves nothing.
      await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(300);
      assert.deepEqual(await frames(page), dropped, 'nothing moves after the drop has settled');
      // The drop and its nudge are one undo step.
      await page.locator('[data-plot-id="results_dashboard-plot_pca"] .tc-node-head').focus();
      await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
      assert.deepEqual(await frames(page), before, 'one Undo restores the dragged and the nudged card');
      await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(100);
      assert.deepEqual(await frames(page), dropped, 'Redo applies both again');
      // Keyboard resize (Shift+Arrow): Violin grows into nothing, then down into nothing: no move.
      // PCA grows 60 px taller (10 px per key): its bottom (390) now reaches Violin? (Violin is at x 30-430, PCA at 300-700: overlap x 300-430.)
      await page.evaluate(() => { __writes.length = 0; });
      const pcaHead = page.locator('[data-plot-id="results_dashboard-plot_pca"] .tc-node-head');
      await pcaHead.focus();
      for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowDown');
      assert.deepEqual((await frames(page)).violin, before.violin, 'nothing settles during the resize burst');
      await page.waitForTimeout(1100);
      const resized = await frames(page);
      assert.deepEqual(resized.pca, [300, 30, 400, 360], 'the resized card keeps its new size');
      // PCA bottom 390 overlaps Violin (top 360) by 30 px: up is impossible (y < 0), left is 330+ px,
      // down to 410 is 50 px, right to 720 is 690 px: Violin moves down 50 px.
      assert.deepEqual(resized.violin, [30, 410, 400, 300], 'the end of a resize moves only the newly overlapped card, minimally');
      assert.deepEqual(resized.volcano, dropped.volcano); assert.deepEqual(resized.comp, dropped.comp);
      assert.deepEqual(errors, []);
      await page.close();
    }
    // ---- (b, keyboard) A keyboard move and its settle are one undo step; a burst over two cards
    // settles around both (a second card's keys do not cancel the first card's settle).
    {
      const {page, errors} = await layoutPage(browser, {shell: false});
      const start = {version: '1', libraryHidden: false, nodes: [box('pca', 30, 30, 400, 300), box('volcano', 460, 30, 400, 300), box('violin', 30, 360, 400, 300), box('comp', 460, 360, 400, 300), box('dist', 1400, 1400, 400, 300)]};
      await page.evaluate(s => TeamCanvas.restore(s), start);
      await page.evaluate(() => TeamCanvasViewport.setScale(1)); await page.waitForTimeout(200);
      const before = await frames(page);
      const head = id => page.locator(`[data-plot-id="results_dashboard-plot_${id}"] .tc-node-head`);
      // PCA 50 px right with the arrow keys: it overlaps Volcano by 20 px.
      await head('pca').focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1100);
      const moved = await frames(page);
      assert.deepEqual(moved.pca, [80, 30, 400, 300]);
      assert.deepEqual(moved.volcano, [500, 30, 400, 300], 'the keyboard drop nudges the overlapped card (40 px right)');
      await head('pca').focus(); await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
      assert.deepEqual(await frames(page), before, 'one Undo restores the keyboard move and its nudge together (no overlap left)');
      // A click on another card within 700 ms ends the burst: it settles and records first, as one step.
      await head('pca').focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
      await page.locator('[data-plot-id="results_dashboard-plot_dist"] .tc-node-head strong').click();
      await page.waitForTimeout(1100);
      assert.deepEqual(await frames(page), moved, 'the clicked-through burst still settles (Volcano nudged)');
      await head('pca').focus(); await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
      assert.deepEqual(await frames(page), before, 'one Undo restores a burst ended by a click, with its nudge');
      // Burst over two cards: Violin grows right into Comp, then (within 700 ms) PCA grows right into Volcano.
      await page.evaluate(s => TeamCanvas.restore(s), start); await page.evaluate(() => TeamCanvasViewport.setScale(1)); await page.waitForTimeout(200);
      await head('violin').focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
      await head('pca').focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(1100);
      const burst = await frames(page);
      assert.deepEqual(burst.violin, [30, 360, 450, 300]); assert.deepEqual(burst.pca, [30, 30, 450, 300]);
      assert.deepEqual(burst.comp, [500, 360, 400, 300], "the first card's settle still runs (Comp moves 40 px right)");
      assert.deepEqual(burst.volcano, [500, 30, 400, 300], "the second card's settle runs too (Volcano moves 40 px right)");
      assert.deepEqual(burst.dist, before.dist);
      await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
      assert.deepEqual(await frames(page), before, 'the burst and its settle are one undo step');
      assert.deepEqual(errors, []);
      await page.close();
    }
    // ---- (c) Tidy up, then Undo in the shared toast: exact positions back.
    {
      const {page, errors} = await layoutPage(browser, {shell: false});
      const state = seventeenCardState();
      await page.evaluate(s => TeamCanvas.restore(s), state);
      await page.waitForTimeout(300);
      const before = await page.evaluate(() => __geometry());
      const button = page.locator('#team-canvas-root .tc-arrange');
      assert.equal((await button.textContent()).trim(), 'Tidy up');
      await button.click(); await page.waitForTimeout(300);
      const tidied = await page.evaluate(() => __geometry());
      assert.notDeepEqual(tidied, before, 'Tidy up moved the cards');
      const toast = page.locator('.tc-feedback-toast');
      assert.match(await toast.locator('.tc-feedback-text').textContent(), /^Tidied up \d+ cards?\.$/);
      const nodes = await page.evaluate(() => TeamCanvas.serialize().nodes);
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; assert(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'tidied cards never overlap'); }
      assert.deepEqual(nodes.map(n => [n.width, n.height]), state.nodes.map(n => [n.width, n.height]), 'Tidy up never changes a size');
      await toast.getByRole('button', {name: 'Undo'}).click(); await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => __geometry()), before, 'Undo restores every card to its exact position');
      // Tidy up again; a later move makes the toast's Undo refuse (the toolbar history applies).
      await button.click(); await page.waitForTimeout(300);
      await page.evaluate(() => { const n = document.querySelector('.tc-node'); n.style.left = (parseFloat(n.style.left) + 7) + 'px'; });
      await page.locator('.tc-feedback-toast').getByRole('button', {name: 'Undo'}).click(); await page.waitForTimeout(200);
      assert.match(await page.locator('.tc-feedback-toast .tc-feedback-text').textContent(), /changed after Tidy up/);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS canvas layout stability: 17-card restore never moves (lazy mounts, resizes, 60 s idle, hidden restore); drop and resize nudge only overlapping cards minimally, once, animated (instant with reduced motion), one undo step; Tidy up + toast Undo restores exact positions');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
