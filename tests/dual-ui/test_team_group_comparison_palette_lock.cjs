// Run with: node tests/dual-ui/test_team_group_comparison_palette_lock.cjs
// Items 15 and 16 (2026-11-04). The shared group colour map is the single source of truth of the group comparison:
//  15. applying a plot-editor palette recolours every group without a manual override (overrides are kept, in the
//      violins and the legend alike), and the legend is always
//      derived from the map, so for every group the legend colour equals its violin colour in every panel and in the
//      SVG/PDF exports. Sequences: (a) Lab, a Canvas replay, then Viridis; (b) a manual override, then Lab;
//      (c) Lab, then a manual override, then a replay that still carries the Lab legend patch.
//  21. Lab, save, restore in a fresh page, then Viridis gives Viridis (a replayed palette is not an override).
//  22. a restored figure with the legend hidden (showlegend=false) shows the condition labels.
//  16. when two displayed groups share a colour (7 groups on a 6-colour palette; two healthy* groups in grey) the
//      figure shows production's condition tick labels and "Condition" axis title; otherwise the labels stay hidden.
// The Canvas stub stores the editor state and replays it with the real TeamPlotEditor.apply after every draw, and
// clears per-panel violin colours exactly as canvas.js clearGroupComparisonPanelColors does.
const { chromium } = require('../browser/ci/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const FEATURES = ['PC', 'PE', 'PG'];
const LAB = ['#377eb8', '#e41a1c', '#4daf4a', '#984ea3', '#ff7f00', '#a65628'], VIRIDIS = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'];
const hex = c => { c = String(c).trim().toLowerCase(); if (/^#[0-9a-f]{6}$/.test(c)) return c; const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? '#' + m.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('') : c; };

async function setup(browser, lib, groups, canvas, preset = {}) {
  const p = await browser.newPage({ viewport: { width: 1100, height: 1300 }, acceptDownloads: true }); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.setContent(canvas
    ? '<div style="width:900px" class="tc-node"><div class="tc-settings"></div><div class="gc-root" data-gc-instance="tcinstance_a"><div class="gc-plot"></div><div class="gc-controls"></div></div></div>'
    : '<div style="width:900px"><div class="gc-root" data-gc-instance="tcinstance_a"><div class="gc-plot"></div><div class="gc-controls"></div></div></div>');
  await p.evaluate(({ canvas, preset }) => {
    window.Shiny = { handlers: {}, addCustomMessageHandler: (n, f) => Shiny.handlers[n] = f, setInputValue: () => {} };
    window.jspdf = { jsPDF: function () { return { svg: async el => { window.__pdfSvg = new XMLSerializer().serializeToString(el); }, output: () => new Blob(['%PDF-1.4']) }; } };
    window.editorState = preset.editor ? JSON.parse(preset.editor) : null; window.replays = 0; window.saved = preset.saved ? JSON.parse(preset.saved) : null;
    if (canvas) window.TeamCanvas = { getGroupComparison: () => window.saved, setGroupComparison: (id, v) => { window.saved = JSON.parse(JSON.stringify(v)); },
      clearGroupComparisonPanelColors: (id, feature) => { const e = window.editorState; if (!e || !Array.isArray(e.traces)) return true;
        e.traces.forEach(t => { const prefix = 'source:group-comparison:'; if (typeof t.sourceKey !== 'string' || !t.sourceKey.startsWith(prefix)) return;
          const parts = JSON.parse(t.sourceKey.slice(prefix.length)); if (parts[0] !== feature || parts[2] !== 'violin') return; ['fillColor', 'fillOpacity', 'lineColor'].forEach(k => delete t[k]); }); return true; },
      reapplyGroupComparisonEditor: () => { const gd = document.querySelector('.gc-plot'); window.replays++; TeamPlotEditor.resetSource(gd);
        return window.editorState ? TeamPlotEditor.apply(gd, window.editorState) : Promise.resolve(true); } };
    // The editor's Apply palette button: paletteStyle on the current state, stored, then applied.
    window.applyPalette = name => { const gd = document.querySelector('.gc-plot'); const next = TeamPlotEditor.paletteStyle(gd, window.editorState || {}, name, true); window.editorState = next; return TeamPlotEditor.apply(gd, next); };
  }, { canvas, preset });
  for (const f of [lib, 'www/team/js/plot_editor.js', 'www/team/js/group_comparison.js']) await p.addScriptTag({ path: path.resolve(f) });
  await p.addStyleTag({ path: path.resolve('www/team/css/group_comparison.css') });
  await p.evaluate(({ groups, FEATURES }) => {
    const rows = []; FEATURES.forEach((c, i) => groups.forEach((g, k) => Array.from({ length: 8 }, (_, j) => rows.push({ Sample: 's' + k + '-' + j, Feature: c, GroupingVal: g, Plot_Value: Math.sin(j * .7) + k + i * .3, Is_Baseline: k === 0, P_Value: null, Significance: k ? 'ns' : 'Reference', Facet_Grp: 'All' }))));
    Shiny.handlers['team-group-comparison-data']({ id: 'tcinstance_a', rows, groups, baseline: [groups[0]], inferenceAllowed: false, scienceSignature: 'a'.repeat(64), requiresConfirmation: false, settings: { method: 'non_parametric', comparison: 'Global (Combined Reference)', scale: 'log2fc', significance: 'star', test: 'Wilcoxon rank-sum', grouping: ['Group1'] } });
  }, { groups, FEATURES });
  await p.waitForFunction(() => document.querySelector('.gc-plot').data?.length > 0);
  return { p, errors };
}
const showPanels = async p => {
  await p.evaluate(() => { const d = document.querySelector('.gc-root details, .gc-inspector details'); });
  await p.getByText('Display controls', { exact: true }).first().click();
  for (const c of ['PE', 'PG']) await p.locator('.gc-controls').getByRole('button', { name: c, exact: true }).click();
  await p.waitForFunction(() => new Set(document.querySelector('.gc-plot').data.map(t => t.meta?.teamPanel).filter(Boolean)).size === 3);
};
// Wait until the figure stops changing (redraws and replays settle).
async function settle(p) {
  let last = '', same = 0;
  for (let i = 0; i < 60 && same < 4; i++) { await p.waitForTimeout(150); const now = JSON.stringify(await colours(p)); same = now === last ? same + 1 : 0; last = now; }
}
const colours = p => p.evaluate(() => { const out = {}; document.querySelector('.gc-plot').data.forEach(t => { const m = t.meta || {}; if (!m.teamCondition) return;
  if (t.type === 'violin' && t.visible !== true) return; (out[m.teamCondition] = out[m.teamCondition] || []).push([m.teamPanel || 'legend', String(t.type === 'violin' ? t.fillcolor : t.marker.color)]); }); return out; });
async function assertLocked(p, label, expected) {
  const map = await colours(p);
  for (const [g, list] of Object.entries(map)) {
    const set = new Set(list.map(x => hex(x[1])));
    assert.equal(set.size, 1, `${label}: legend colour equals violin colour for ${g} in every panel: ${JSON.stringify(list)}`);
    assert.ok(list.some(x => x[0] === 'legend'), `${label}: ${g} is in the legend`);
    if (expected && expected[g]) assert.equal([...set][0], expected[g], `${label}: ${g} has the expected colour`);
  }
  return map;
}
function svgColours(svg) {
  const fills = re => Array.from(svg.matchAll(re), m => hex(m[1]));
  return { violins: new Set(fills(/<path class="violin"[^>]*?style="[^"]*?fill: (rgb\([^)]*\))/g)), legend: new Set(fills(/<path class="scatterpts"[^>]*?style="[^"]*?fill: (rgb\([^)]*\))/g)) };
}
async function exportsAgree(p, label, expected) {
  const ev = p.waitForEvent('download'); await p.getByRole('button', { name: 'SVG', exact: true }).first().click();
  const svg = fs.readFileSync(await (await ev).path(), 'utf8');
  await p.evaluate(() => { window.__pdfSvg = null; }); await p.getByRole('button', { name: 'PDF', exact: true }).first().click();
  await p.waitForFunction(() => !!window.__pdfSvg); const pdfSvg = await p.evaluate(() => window.__pdfSvg);
  for (const [kind, text] of [['SVG', svg], ['PDF', pdfSvg]]) {
    const c = svgColours(text);
    assert.deepEqual([...c.violins].sort(), [...new Set(Object.values(expected))].sort(), `${label} ${kind}: panels use the map's colours`);
    for (const v of c.violins) assert.ok(c.legend.has(v), `${label} ${kind}: every panel colour is a legend colour (${v})`);
  }
}
const paletteMap = (groups, colors) => { const sorted = groups.slice().sort(), out = {}; groups.forEach(g => { out[g] = /^healthy(?:$|[_ -])/i.test(g) ? '#7a7a7a' : colors[sorted.indexOf(g) % colors.length]; }); return out; };
const redraw = p => p.evaluate(() => TeamGroupComparison.forPlot(document.querySelector('.gc-plot')).showAll());
const setGroupColour = (p, feature, g, value) => p.evaluate(({ feature, g, value }) => { const d = Array.from(document.querySelectorAll('.gc-controls summary')).find(x => x.textContent === feature).parentElement; d.open = true;
  const input = Array.from(d.querySelectorAll('label')).find(l => l.textContent.trim() === g).querySelector('input'); input.value = value; input.dispatchEvent(new Event('change')); }, { feature, g, value });
const ticks = p => p.evaluate(() => { const l = document.querySelector('.gc-plot').layout; return Object.keys(l).filter(k => /^xaxis\d*$/.test(k)).sort().map(k => ({ axis: k, shown: l[k].showticklabels !== false, title: (l[k].title && l[k].title.text) || '' })); });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const lib = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], { encoding: 'utf8' }).trim();
    const G4 = ['Healthy', 'A', 'B', 'C'];
    for (const canvas of [true, false]) {
      const where = canvas ? 'Canvas' : 'card';
      // (a) Lab, a replay (Canvas) or redraw, then Viridis.
      let { p, errors } = await setup(browser, lib, G4, canvas);
      await showPanels(p); await settle(p);
      await p.evaluate(() => applyPalette('Lab')); await settle(p);
      await assertLocked(p, `${where} (a) after Lab`, paletteMap(G4, LAB));
      const before = await p.evaluate(() => window.replays); await redraw(p); await settle(p);
      if (canvas) assert.ok(await p.evaluate(() => window.replays) > before, 'the redraw replayed the editor state');
      await assertLocked(p, `${where} (a) after Lab and a replay`, paletteMap(G4, LAB));
      await p.evaluate(() => applyPalette('Viridis')); await settle(p);
      await assertLocked(p, `${where} (a) Lab, replay, then Viridis`, paletteMap(G4, VIRIDIS));
      await redraw(p); await settle(p);
      await assertLocked(p, `${where} (a) and after one more replay`, paletteMap(G4, VIRIDIS));
      await exportsAgree(p, `${where} (a)`, paletteMap(G4, VIRIDIS));
      assert.deepEqual(errors, []); await p.close();
      // (b) a manual override, then Lab: the palette recolours the other groups; the override is kept everywhere.
      ({ p, errors } = await setup(browser, lib, G4, canvas));
      await showPanels(p); await settle(p);
      await setGroupColour(p, 'PE', 'A', '#123456'); await settle(p);
      await assertLocked(p, `${where} (b) after the override`, { A: '#123456' });
      await p.evaluate(() => applyPalette('Lab')); await settle(p);
      const keptA = Object.assign(paletteMap(G4, LAB), { A: '#123456' });
      await assertLocked(p, `${where} (b) override, then Lab`, keptA);
      await redraw(p); await settle(p);
      await assertLocked(p, `${where} (b) and after a replay`, keptA);
      await exportsAgree(p, `${where} (b)`, keptA);
      // (c) then a manual override after the palette, and a replay that still carries the Lab legend patch.
      await setGroupColour(p, 'PG', 'B', '#aa5500'); await settle(p);
      await redraw(p); await settle(p);
      const expected = Object.assign(paletteMap(G4, LAB), { A: '#123456', B: '#aa5500' });
      await assertLocked(p, `${where} (c) Lab, override, replay`, expected);
      await exportsAgree(p, `${where} (c)`, expected);
      assert.deepEqual(errors, []); await p.close();
    }
    // 21. Lab, save, restore in a fresh page (the editor state and the group-comparison snapshot are all that is
    // kept), then Viridis: the replayed Lab colours are palette colours, not overrides, so Viridis recolours them.
    {
      let { p, errors } = await setup(browser, lib, G4, true);
      await showPanels(p); await settle(p);
      await p.evaluate(() => applyPalette('Lab')); await settle(p);
      await assertLocked(p, '(21) before saving', paletteMap(G4, LAB));
      const saved = await p.evaluate(() => ({ editor: JSON.stringify(window.editorState), saved: JSON.stringify(window.saved) }));
      assert.ok(JSON.parse(saved.saved) && JSON.parse(saved.saved).features.length === 3, '(21) the snapshot was saved');
      assert.deepEqual(errors, []); await p.close();
      ({ p, errors } = await setup(browser, lib, G4, true, saved));
      await p.waitForFunction(() => new Set(document.querySelector('.gc-plot').data.map(t => t.meta?.teamPanel).filter(Boolean)).size === 3);
      await settle(p);
      await assertLocked(p, '(21) restored in a fresh page', paletteMap(G4, LAB));
      assert.ok(await p.evaluate(() => Object.values(window.saved.panelStyles || {}).every(st => !Object.keys(st.colors || {}).length)), '(21) the restored palette did not become manual overrides');
      await p.evaluate(() => applyPalette('Viridis')); await settle(p);
      await assertLocked(p, '(21) restore, then Viridis', paletteMap(G4, VIRIDIS));
      await exportsAgree(p, '(21)', paletteMap(G4, VIRIDIS));
      assert.deepEqual(errors, []); await p.close();
    }
    // 22. A restored figure with the legend hidden (editor "Show legend" off) shows the condition labels.
    {
      const editor = JSON.stringify({ layout: { showlegend: false }, traces: [] });
      let { p, errors } = await setup(browser, lib, G4, true, { editor, saved: JSON.stringify({ features: FEATURES, hiddenConditions: [], panelOff: {}, panelStyles: {} }) });
      await p.waitForFunction(() => new Set(document.querySelector('.gc-plot').data.map(t => t.meta?.teamPanel).filter(Boolean)).size === 3);
      await settle(p); await p.waitForTimeout(500);
      assert.equal(await p.evaluate(() => document.querySelector('.gc-plot').layout.showlegend), false, '(22) the legend stays hidden');
      let t = await ticks(p); assert.ok(t.length === 3 && t.every(a => a.shown) && t[0].title === 'Condition', '(22) hidden legend: condition labels shown: ' + JSON.stringify(t));
      const ev = p.waitForEvent('download'); await p.getByRole('button', { name: 'SVG', exact: true }).first().click();
      const svg = fs.readFileSync(await (await ev).path(), 'utf8');
      for (const g of G4) assert.ok(svg.includes('>' + g + '</text>'), `(22) the exported SVG names group ${g}`);
      // Showing the legend again returns to Paula's hidden labels.
      await p.evaluate(() => { window.editorState = { layout: { showlegend: true }, traces: [] }; return TeamPlotEditor.apply(document.querySelector('.gc-plot'), window.editorState); });
      await p.waitForFunction(() => document.querySelector('.gc-plot').layout.xaxis.showticklabels === false, null, { timeout: 10000 });
      t = await ticks(p); assert.ok(t.every(a => !a.shown), '(22) legend shown again: labels hidden: ' + JSON.stringify(t));
      assert.deepEqual(errors, []); await p.close();
    }
    // 16. Repeated colours show the condition labels.
    const G7 = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    let { p, errors } = await setup(browser, lib, G7, false);
    await showPanels(p); await settle(p);
    let map = await colours(p); assert.equal(hex(map.A[0][1]), hex(map.G[0][1]), 'A and G share a colour on the 6-colour default palette');
    let t = await ticks(p); assert.ok(t.length === 3 && t.every(a => a.shown), 'A-G: condition tick labels shown in every panel: ' + JSON.stringify(t));
    assert.equal(t[0].title, 'Condition', 'A-G: production axis title'); 
    // Hide G everywhere: no displayed colour repeats any more, so Paula's hidden labels return.
    await p.evaluate(() => { const gd = document.querySelector('.gc-plot'), i = gd.data.findIndex(x => x.meta?.teamRole === 'legend' && x.meta?.teamCondition === 'G'); gd.emit('plotly_legendclick', { data: gd.data, curveNumber: i }); });
    await p.waitForFunction(() => { const l = document.querySelector('.gc-plot').layout; return l.xaxis && l.xaxis.showticklabels === false; });
    t = await ticks(p); assert.ok(t.every(a => !a.shown && !a.title), 'A-F: labels hidden again: ' + JSON.stringify(t));
    // Lab wraps the same way.
    await redraw(p); await settle(p); await p.evaluate(() => applyPalette('Lab')); await settle(p);
    t = await ticks(p); assert.ok(t.every(a => a.shown), 'A-G on Lab: labels shown: ' + JSON.stringify(t));
    await assertLocked(p, 'A-G on Lab', paletteMap(G7, LAB));
    assert.deepEqual(errors, []); await p.close();
    // Two healthy* groups are both forced grey.
    ({ p, errors } = await setup(browser, lib, ['Healthy', 'Healthy_2', 'A'], false));
    await showPanels(p); await settle(p);
    map = await colours(p); assert.equal(hex(map.Healthy[0][1]), '#7a7a7a'); assert.equal(hex(map.Healthy_2[0][1]), '#7a7a7a');
    t = await ticks(p); assert.ok(t.every(a => a.shown), 'two healthy groups in grey: labels shown: ' + JSON.stringify(t));
    await p.close();
    // Distinct colours keep the labels hidden (Paula's design).
    ({ p, errors } = await setup(browser, lib, G4, false));
    await showPanels(p); await settle(p);
    t = await ticks(p); assert.ok(t.every(a => !a.shown && !a.title), 'distinct colours: labels hidden: ' + JSON.stringify(t));
    assert.deepEqual(errors, []); await p.close();
    console.log('PASS: palettes recolour the shared group colour map (manual overrides kept) and the legend follows it (Lab, replay, Viridis; override then Lab; Lab, override, replay), live and in SVG/PDF, on Canvas and card; a palette survives save and restore without becoming overrides; a hidden legend or repeated colours (A-G, two healthy groups) show the condition labels, distinct colours keep them hidden');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
