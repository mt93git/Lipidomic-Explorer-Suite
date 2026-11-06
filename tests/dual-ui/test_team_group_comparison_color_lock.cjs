// Run with: node tests/dual-ui/test_team_group_comparison_color_lock.cjs
// The group comparison hides condition tick labels, so the shared top legend is the only colour key. Every
// group must therefore have one colour in every panel, whatever subset of groups a panel shows, in the live
// figure, in the legend and in the SVG and PDF exports. A colour edit made in one panel (panel colour input
// or a plot-editor restyle of one trace) changes that group everywhere. Older states with per-panel colours,
// and a replayed editor colour on one trace, resolve to a single colour per group as well.
const { chromium } = require('../browser/ci/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const GROUPS = ['Healthy', 'A', 'B', 'C'], FEATURES = ['PC', 'PE', 'PG'];
const rgb = h => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const norm = c => { c = String(c).trim().toLowerCase(); return /^#[0-9a-f]{6}$/.test(c) ? rgb(c) : c.replace(/\s+/g, '').replace(/,/g, ', '); };

async function setup(browser, lib, canvas, saved) {
  const p = await browser.newPage({ viewport: { width: 1100, height: 1300 }, acceptDownloads: true }); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.setContent(canvas
    ? '<div style="width:900px" class="tc-node"><div class="tc-settings"></div><div class="gc-root" data-gc-instance="tcinstance_a"><div class="gc-plot"></div><div class="gc-controls"></div></div></div>'
    : '<div style="width:900px"><div class="gc-root" data-gc-instance="tcinstance_a"><div class="gc-plot"></div><div class="gc-controls"></div></div></div>');
  await p.evaluate(({ canvas, saved }) => {
    window.Shiny = { handlers: {}, addCustomMessageHandler: (n, f) => Shiny.handlers[n] = f, setInputValue: () => {} };
    window.jspdf = { jsPDF: function () { return { svg: async el => { window.__pdfSvg = new XMLSerializer().serializeToString(el); }, output: () => new Blob(['%PDF-1.4']) }; } };
    if (canvas) {
      // A Canvas stub: a saved per-panel state from before the lock, and an editor colour on one trace (PE / B)
      // that is replayed after every draw until the group comparison clears it.
      window.editorB = true; window.cleared = [];
      window.TeamCanvas = { getGroupComparison: () => saved, setGroupComparison: (id, v) => { window.saved = v; },
        clearGroupComparisonPanelColors: (id, f) => { window.cleared.push(f); window.editorB = false; return true; },
        reapplyGroupComparisonEditor: () => { const gd = document.querySelector('.gc-plot'); if (!window.editorB) return Promise.resolve(true);
          const i = gd.data.findIndex(t => t.meta?.teamPanel === 'PE' && t.meta?.teamCondition === 'B'); return Plotly.restyle(gd, { fillcolor: '#333333' }, [i]); } };
    }
  }, { canvas, saved });
  for (const f of [lib, 'www/team/js/plot_editor.js', 'www/team/js/group_comparison.js']) await p.addScriptTag({ path: path.resolve(f) });
  await p.addStyleTag({ path: path.resolve('www/team/css/group_comparison.css') });
  await p.evaluate(({ GROUPS, FEATURES }) => {
    const rows = []; FEATURES.forEach((c, i) => GROUPS.forEach((g, k) => Array.from({ length: 8 }, (_, j) => rows.push({ Sample: 's' + k + '-' + j, Feature: c, GroupingVal: g, Plot_Value: Math.sin(j * .7) + k + i * .3, Is_Baseline: k === 0, P_Value: null, Significance: k ? 'ns' : 'Reference', Facet_Grp: 'All' }))));
    Shiny.handlers['team-group-comparison-data']({ id: 'tcinstance_a', rows, groups: GROUPS, baseline: ['Healthy'], inferenceAllowed: false, scienceSignature: 'a'.repeat(64), requiresConfirmation: false, settings: { method: 'non_parametric', comparison: 'Global (Combined Reference)', scale: 'log2fc', significance: 'star', test: 'Wilcoxon rank-sum', grouping: ['Group1'] } });
  }, { GROUPS, FEATURES });
  await p.waitForFunction(() => document.querySelector('.gc-plot').data?.length > 0);
  return { p, errors };
}
// Colour of every trace of each group: violins per panel, and the legend marker.
const colours = p => p.evaluate(() => { const out = {}; document.querySelector('.gc-plot').data.forEach(t => { const m = t.meta || {}; if (!m.teamCondition) return;
  if (t.type === 'violin' && t.visible !== true) return; (out[m.teamCondition] = out[m.teamCondition] || []).push([m.teamPanel || 'legend', String(t.type === 'violin' ? t.fillcolor : t.marker.color).toLowerCase()]); }); return out; });
function assertLocked(map, label) {
  for (const [g, list] of Object.entries(map)) {
    const set = new Set(list.map(x => norm(x[1])));
    assert.equal(set.size, 1, `${label}: ${g} has one colour in every panel and in the legend: ${JSON.stringify(list)}`);
    assert.ok(list.some(x => x[0] === 'legend'), `${label}: ${g} is in the legend`);
  }
}
// Violin fills and legend point fills in an exported SVG.
function svgColours(svg) {
  const fills = re => Array.from(svg.matchAll(re), m => norm(m[1]));
  return { violins: new Set(fills(/<path class="violin"[^>]*?style="[^"]*?fill: (rgb\([^)]*\))/g)),
           legend: new Set(fills(/<path class="scatterpts"[^>]*?style="[^"]*?fill: (rgb\([^)]*\))/g)) };
}
async function exports(p, label, expected) {
  const ev = p.waitForEvent('download'); await p.getByRole('button', { name: 'SVG', exact: true }).click();
  const svg = fs.readFileSync(await (await ev).path(), 'utf8');
  await p.evaluate(() => { window.__pdfSvg = null; }); await p.getByRole('button', { name: 'PDF', exact: true }).click();
  await p.waitForFunction(() => !!window.__pdfSvg); const pdfSvg = await p.evaluate(() => window.__pdfSvg);
  for (const [kind, text] of [['SVG', svg], ['PDF', pdfSvg]]) {
    const c = svgColours(text);
    assert.deepEqual([...c.violins].sort(), [...expected].sort(), `${label} ${kind}: panels use exactly one colour per shown group`);
    for (const v of c.violins) assert.ok(c.legend.has(v), `${label} ${kind}: every panel colour is a legend colour (${v})`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const lib = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], { encoding: 'utf8' }).trim();
    // 1. Standalone card: three panels showing different subsets of the groups.
    const { p, errors } = await setup(browser, lib, false);
    await p.getByText('Display controls', { exact: true }).click();
    for (const c of ['PE', 'PG']) await p.locator('.gc-controls').getByRole('button', { name: c, exact: true }).click();
    await p.waitForFunction(() => new Set(document.querySelector('.gc-plot').data.map(t => t.meta?.teamPanel).filter(Boolean)).size === 3);
    await p.evaluate(() => { const gd = document.querySelector('.gc-plot'), api = TeamGroupComparison.forPlot(gd), at = (c, g) => gd.data.findIndex(t => t.meta?.teamPanel === c && t.meta?.teamCondition === g);
      return api.setSeries(at('PE', 'A'), false).then(() => api.setSeries(at('PG', 'Healthy'), false)).then(() => api.setSeries(at('PG', 'B'), false)); });
    await p.waitForFunction(() => document.querySelector('.gc-plot').data.filter(t => t.type === 'violin' && t.visible === true).length === 9);
    let map = await colours(p); assertLocked(map, 'default palette, different subsets');
    await exports(p, 'default', new Set(Object.values(map).map(l => norm(l[0][1]))));
    // A plot-editor colour edit on one trace (PG / C) becomes the colour of C everywhere.
    await p.evaluate(() => { const gd = document.querySelector('.gc-plot'), i = gd.data.findIndex(t => t.meta?.teamPanel === 'PG' && t.meta?.teamCondition === 'C'); return Plotly.restyle(gd, { fillcolor: '#123456' }, [i]); });
    await p.waitForFunction(() => document.querySelector('.gc-plot').data.filter(t => t.meta?.teamCondition === 'C').every(t => String(t.type === 'violin' ? t.fillcolor : t.marker.color).toLowerCase() === '#123456'));
    map = await colours(p); assertLocked(map, 'after a one-trace editor edit');
    // The per-panel colour input in panel PE changes B in every panel and in the legend.
    await p.evaluate(() => { const sum = Array.from(document.querySelectorAll('.gc-controls summary')).find(x => x.textContent === 'PE'); sum.parentElement.open = true; });
    await p.evaluate(() => { const d = Array.from(document.querySelectorAll('.gc-controls summary')).find(x => x.textContent === 'PE').parentElement;
      const input = Array.from(d.querySelectorAll('label')).find(l => l.textContent.trim() === 'B').querySelector('input'); input.value = '#aa5500'; input.dispatchEvent(new Event('change')); });
    await p.waitForFunction(() => document.querySelector('.gc-plot').data.filter(t => t.meta?.teamCondition === 'B').every(t => String(t.type === 'violin' ? t.fillcolor : t.marker.color).toLowerCase() === '#aa5500'));
    map = await colours(p); assertLocked(map, 'after a panel colour input');
    assert.equal(norm(map.B[0][1]), rgb('#aa5500')); assert.equal(norm(map.C[0][1]), rgb('#123456'));
    await exports(p, 'edited', new Set(Object.values(map).map(l => norm(l[0][1]))));
    // Reset colors in one panel resets the shared colours: still one colour per group.
    await p.evaluate(() => { const d = Array.from(document.querySelectorAll('.gc-controls summary')).find(x => x.textContent === 'PG').parentElement; d.open = true; Array.from(d.querySelectorAll('button')).find(b => b.textContent === 'Reset colors').click(); });
    await p.waitForFunction(() => document.querySelector('.gc-plot').data.filter(t => t.meta?.teamCondition === 'B').every(t => String(t.type === 'violin' ? t.fillcolor : t.marker.color).toLowerCase() !== '#aa5500'));
    assertLocked(await colours(p), 'after Reset colors');
    assert.deepEqual(errors, []); await p.close();

    // 2. Canvas restore of a state saved before the lock: A had a different colour in PE and PG, and the
    // replayed editor state recolours one trace (PE / B). Both resolve to one colour per group.
    const saved = { features: FEATURES, hiddenConditions: [], panelOff: { PG: ['Healthy'] },
      panelStyles: { PE: { colors: { A: '#111111' }, lines: {}, points: true, box: true }, PG: { colors: { A: '#222222' }, lines: {}, points: true, box: true } } };
    const c = await setup(browser, lib, true, saved);
    await c.p.waitForFunction(() => new Set(document.querySelector('.gc-plot').data.map(t => t.meta?.teamPanel).filter(Boolean)).size === 3 &&
      document.querySelector('.gc-plot').data.filter(t => t.meta?.teamCondition === 'B').every(t => String(t.type === 'violin' ? t.fillcolor : t.marker.color).toLowerCase() === '#333333'), null, { timeout: 15000 });
    await c.p.waitForTimeout(500);
    map = await colours(c.p); assertLocked(map, 'restored legacy state');
    assert.equal(norm(map.A[0][1]), rgb('#111111'), 'the first class (feature order) with a colour gives the group its colour');
    assert.ok(await c.p.evaluate(() => window.cleared.length > 0 && window.editorB === false), 'the one-trace editor colour was cleared after it became the shared colour');
    assert.deepEqual(c.errors, []); await c.p.close();
    console.log('PASS: group comparison colours are locked per group across panels with different subsets, in the legend and in the SVG/PDF exports; one-panel edits, Reset colors, legacy per-panel states and replayed editor colours all resolve to one colour per group');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
