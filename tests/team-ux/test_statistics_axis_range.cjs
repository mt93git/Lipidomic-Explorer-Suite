// Violin statistics keep the value axis of the first render: repeated draws after an
// autoscale, a resize, a capture-size freeze, a float round trip, an editor relayout or an
// equivalent server render must not move it. Before the fix every redraw re-read a range
// that already held the n-label padding (Plotly's autorange includes data-referenced
// annotations) and the axis bottom fell by about 9% of the span each time.
// No server: Plotly + canvas_statistics.js in headless Chromium.
//   node tests/team-ux/test_statistics_axis_range.cjs
// PLAYWRIGHT (module path) and PLOTLY_JS (plotly.min.js, e.g. the R plotly package's
// htmlwidgets/lib/plotlyjs/plotly-latest.min.js) override the defaults.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const {chromium} = require(process.env.PLAYWRIGHT || path.join(root, 'tests/browser/ci/node_modules/playwright'));
function plotlyPath() {
  if (process.env.PLOTLY_JS) return process.env.PLOTLY_JS;
  const rel = 'plotly/htmlwidgets/lib/plotlyjs/plotly-latest.min.js';
  const libs = (require('node:child_process').spawnSync('Rscript', ['-e', 'cat(.libPaths(), sep="\\n")'], {encoding: 'utf8'}).stdout || '').split('\n').filter(Boolean);
  const hit = libs.map(l => path.join(l, rel)).find(f => fs.existsSync(f));
  if (!hit) throw Error('Set PLOTLY_JS to a plotly.min.js file.');
  return hit;
}
const STATS = path.join(root, 'www/team/js/canvas_statistics.js');

async function scenario(page, horizontal) {
  return page.evaluate(async horizontal => {
    const T = window.TeamCanvasStatistics, gd = document.getElementById('g');
    window.TeamPlotEditor = {isSwapped: () => horizontal};
    const lcg = (n, seed, lo, w) => { const a = []; let x = seed; for (let i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; a.push(lo + w * x / 233280); } return a; };
    const trace = (name, n, seed, lo, w) => { const v = lcg(n, seed, lo, w), c = Array(n).fill(name);
      return {type: 'violin', name, points: 'all', spanmode: 'soft', box: {visible: true}, marker: {size: 5}, orientation: horizontal ? 'h' : 'v', x: horizontal ? v : c, y: horizontal ? c : v}; };
    const serverData = (lo = 5.9) => [trace('Healthy', 16, 7, lo, 1.1), trace('SC-SteadyState', 34, 11, lo, 1.1)];
    const value = horizontal ? 'xaxis' : 'yaxis';
    const serverLayout = () => { const l = {margin: {l: 60, r: 20, t: 10, b: 95}, showlegend: false, width: 600, height: 420}; l[value] = {title: {text: 'log10 prepared abundance'}, autorange: true, zeroline: false}; l[horizontal ? 'yaxis' : 'xaxis'] = {type: 'category'}; return l; };
    const groups = [{group: 'Healthy', nSamples: 16, nExcluded: 0}, {group: 'SC-SteadyState', nSamples: 34, nExcluded: 0}];
    const render = async (lo) => { Plotly.purge(gd); await Plotly.newPlot(gd, serverData(lo), serverLayout()); };
    await render();
    // Confirmed statistics, so a bracket and its p-value label are drawn as well as the n labels.
    const applied = {test: 'welch', correction: 'holm', scope: 'displayed', comparisons: [['Healthy', 'SC-SteadyState']], effect: 'none'};
    const result = {groups, rows: [{a: 'Healthy', b: 'SC-SteadyState', nA: 16, nB: 34, statistic: 1.2, df: 30, p: 0.04, pAdj: 0.04, effect: null, note: ''}]};
    const r = {instance: {id: 'tci'}, statistics: {ctx: {plot: () => gd, current: () => true}, status: 'current', applied, result, requests: {}, describe: {groups}, baseline: null, drawnRange: null,
      presentation: {show: true, pValue: 'adjusted', label: 'both', fontSize: 12, spacing: 0.08, tip: 0.02, nDisplay: 'samples', hidden: []}}};
    const range = () => gd._fullLayout[value].range.slice();
    // Value-axis coordinates of every statistics annotation and bracket line.
    const nLabels = () => (gd.layout.annotations || []).filter(a => /^tcstat-/.test(a.name || '')).map(a => horizontal ? a.x : a.y)
      .concat((gd.layout.shapes || []).filter(x => /^tcstat-/.test(x.name || '')).flatMap(x => horizontal ? [x.x0, x.x1] : [x.y0, x.y1]));
    const ticks = async () => { const url = await Plotly.toImage(gd, {format: 'svg', width: 600, height: 420}); const d = new DOMParser().parseFromString(decodeURIComponent(url.split(',')[1]), 'image/svg+xml'); return [...d.querySelectorAll((horizontal ? '.xtick' : '.ytick') + ' text')].map(t => t.textContent + '@' + (t.getAttribute(horizontal ? 'x' : 'y') || '') + (t.parentNode.getAttribute('transform') || '')); };
    const autorangeBefore = range();
    let draws = 0; const draw = async () => { draws++; await T.draw(r); };
    await draw();
    const first = {range: range(), labels: nLabels(), ticks: await ticks()};
    const steps = [];
    const check = async tag => { await draw(); steps.push({tag, range: range(), labels: nLabels()}); };
    const set = {}; set[value + '.autorange'] = true;
    for (let i = 0; i < 8; i++) {
      await Plotly.relayout(gd, set); await check('autoscale ' + i);                                  // double-click autoscale
      await Plotly.relayout(gd, {autosize: false, width: 700 + i, height: 500 + i}); await check('freeze at capture size ' + i);
      await Plotly.relayout(gd, {width: 600, height: 420}); await check('restore frame ' + i);
      const nudged = {}; nudged[value + '.range'] = gd.layout[value].range.map(v => v * (1 + 1e-13)); await Plotly.relayout(gd, nudged); await check('float round trip ' + i);
      await Plotly.react(gd, JSON.parse(JSON.stringify(gd.data)), JSON.parse(JSON.stringify(gd.layout))); await check('react clone ' + i);
      await Plotly.relayout(gd, {annotations: (gd.layout.annotations || []).filter(a => !/^tcstat-/.test(a.name || ''))}); await Plotly.relayout(gd, set); await check('editor relayout ' + i);
      await render(); await check('equivalent server render ' + i);
    }
    // Finish: an autoscale-and-redraw, then the capture-size freeze and toImage.
    for (let i = 0; i < 4; i++) { await Plotly.relayout(gd, set); await draw(); } await Plotly.relayout(gd, {autosize: false, width: 640, height: 450}); await draw();
    const frozen = await ticks();
    // A zoom on the same values is the person's view and stays.
    const zoom = {}; zoom[value + '.range'] = [6.1, 6.6]; await Plotly.relayout(gd, zoom); await draw();
    const zoomed = range();
    // ...also across an editor relayout that rebuilds the annotations, and a hide/show.
    await Plotly.relayout(gd, {annotations: (gd.layout.annotations || []).filter(a => !/^tcstat-/.test(a.name || ''))}); await draw();
    r.statistics.presentation.show = false; r.statistics.presentation.nDisplay = 'hidden'; await draw();
    r.statistics.presentation.show = true; r.statistics.presentation.nDisplay = 'samples'; await draw();
    const zoomKept = range(), zoomLabels = nLabels().length;
    // Hiding the labels returns the axis to Plotly's own autorange.
    await Plotly.relayout(gd, set); await draw();
    r.statistics.presentation.show = false; r.statistics.presentation.nDisplay = 'hidden'; await draw();
    const hiddenRange = range(), hiddenLabels = nLabels().length;
    // New values: the baseline follows them, even while the old padding is still drawn.
    r.statistics.presentation.show = true; r.statistics.presentation.nDisplay = 'samples'; await draw();
    await Plotly.restyle(gd, horizontal ? {x: serverData(3.0).map(t => t.x)} : {y: serverData(3.0).map(t => t.y)});
    const pending = T.draw(r), busyWhileMeasuring = T.busy(r); await pending; const moved = range(), idleAfter = !T.busy(r);
    const fresh = document.createElement('div'); document.body.appendChild(fresh);
    const s2 = {instance: {id: 'tc2'}, statistics: Object.assign({}, r.statistics, {ctx: {plot: () => fresh, current: () => true}, baseline: null, drawnRange: null})};
    await Plotly.newPlot(fresh, serverData(3.0), serverLayout()); await T.draw(s2); const freshRange = fresh._fullLayout[value].range.slice();
    return {autorangeBefore, first, steps, frozen, zoomed, zoomKept, zoomLabels, busyWhileMeasuring, idleAfter, hiddenRange, hiddenLabels, moved, freshRange, draws};
  }, horizontal);
}

(async () => {
  const browser = await chromium.launch({headless: true});
  let failed = 0;
  try {
    for (const horizontal of [false, true]) {
      const page = await browser.newPage();
      await page.setContent('<div id="g" style="width:600px;height:420px"></div>');
      await page.addScriptTag({content: fs.readFileSync(plotlyPath(), 'utf8')});
      await page.addScriptTag({content: fs.readFileSync(STATS, 'utf8')});
      const out = await scenario(page, horizontal), name = horizontal ? 'horizontal' : 'vertical', eps = 1e-9;
      const close = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps);
      const t = (label, fn) => { try { fn(); console.log('PASS ' + name + ': ' + label); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + label + '\n  ' + e.message.split('\n')[0]); } };
      t('first draw pads the data autorange: n labels below, the bracket above', () => { assert.ok(out.first.range[0] < out.autorangeBefore[0]); assert.ok(out.first.range[1] > out.autorangeBefore[1]); });
      const bad = out.steps.filter(s => !close(s.range, out.first.range) || !close(s.labels, out.first.labels));
      t(out.steps.length + ' redraws keep the first render range and labels (draws=' + out.draws + ')', () => assert.equal(bad.length, 0,
        bad.length ? 'first ' + JSON.stringify(out.first.range) + '; ' + bad[0].tag + ' ' + JSON.stringify(bad[0].range) + '; last ' + bad.at(-1).tag + ' ' + JSON.stringify(bad.at(-1).range) : ''));
      t('frozen/exported image has the first render axis', () => assert.deepEqual(out.frozen, out.first.ticks));
      t('a zoom on the same values is kept', () => assert.ok(close(out.zoomed, [6.1, 6.6]), JSON.stringify(out.zoomed)));
      t('the zoom survives an editor relayout and a hide/show of the labels', () => { assert.ok(close(out.zoomKept, [6.1, 6.6]), JSON.stringify(out.zoomKept)); assert.equal(out.zoomLabels, out.first.labels.length); });
      t('first render draws the bracket, its label and the n labels', () => assert.equal(out.first.labels.length, 2 + 1 + 6));
      t('Finish sees the statistics as busy until a re-measure has drawn', () => { assert.equal(out.busyWhileMeasuring, true); assert.equal(out.idleAfter, true); });
      t('hidden labels restore the data autorange', () => { assert.equal(out.hiddenLabels, 0); assert.ok(close(out.hiddenRange, out.autorangeBefore), JSON.stringify(out.hiddenRange) + ' vs ' + JSON.stringify(out.autorangeBefore)); });
      t('new values get a baseline from the data, as a fresh render', () => assert.ok(Math.abs(out.moved[0] - out.freshRange[0]) < 0.02 && Math.abs(out.moved[1] - out.freshRange[1]) < 0.02, JSON.stringify(out.moved) + ' vs fresh ' + JSON.stringify(out.freshRange)));
      await page.close();
    }
  } finally { await browser.close(); }
  if (failed) { console.log(failed + ' check(s) failed'); process.exit(1); }
  console.log('ALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
