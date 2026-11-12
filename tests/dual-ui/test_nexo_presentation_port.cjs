// NEXO-P: the lab's Team presentation features (Salcedo, merged at abe454b4) in the Nexo client, on the mock, Chromium and WebKit.
// Marker shape and outline on the PCA card, Publication style, Group outlines, the Composition legend outside the bars,
// the violin inner box two shades darker than its fill; save and reopen keeps them. Screenshots per step.
// NEXO-P2 (step 6): the Plotly Structure cards: Arial 10 default, a legend proxy that follows its series, the proportional
// marker size slider for per-point sizes, no Series section when the figure asks, Remodeling shifts running its analysis itself.
// NEXO-P3: a short Composition card keeps its legend inside the plot area; a new Composition card opens 560 px tall;
// Nexo after Publication drops the black frame; one marker shape control, and a saved Nexo marker symbol moves to Team's.
// node tests/dual-ui/test_nexo_presentation_port.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const shots = path.join(root, 'docs/integration/nexo-presentation-port');
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
const PCA = 'results_dashboard-plot_pca', VIOLIN = 'results_dashboard-plot_violin', COMP_SOURCE = 'results_dashboard-plot_comp';
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
// The drawn plot of a card, as Plotly holds it.
const plot = (page, id, f) => page.evaluate(([id, f]) => { const el = document.querySelector(`.card[data-id="${id}"] .js-plotly-plot`); return el && new Function('el', `return (${f})(el)`)(el); }, [id, String(f)]);
const until = (page, id, f) => page.waitForFunction(([id, f]) => { const el = document.querySelector(`.card[data-id="${id}"] .js-plotly-plot`); return !!el && !!new Function('el', `return (${f})(el)`)(el); }, [id, String(f)]);
// Every group outline lies inside the drawn axis ranges (Plotly autoranges to shapes; R-fixed ranges are widened).
const outlinesInside = el => (el.layout.shapes || []).filter(s => String(s.name).startsWith('team-ellipse:')).every(s => {
  const [x0, x1] = el._fullLayout.xaxis.range.slice().sort((a, b) => a - b), [y0, y1] = el._fullLayout.yaxis.range.slice().sort((a, b) => a - b);
  return s.path.replace(/[MLZ]/g, ' ').trim().split(/\s+/).every(p => { const [x, y] = p.split(',').map(Number); return x >= x0 && x <= x1 && y >= y0 && y <= y1; });
});
const compLabels = el => (el.layout.annotations || []).filter(a => String(a.name).startsWith('team-bar-label:')).map(a => a.name.slice('team-bar-label:'.length));
const violinBox = el => [el.data[0].box?.fillcolor, el.data[0].box?.line?.color];
async function confirmDesign(dialog) {
  await dialog.waitFor();
  await dialog.getByLabel('Experimental unit').selectOption('Animal');
  await dialog.getByLabel('Sample relationship').selectOption('independent');
  await dialog.getByRole('button', { name: 'Confirm study design', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
async function journey(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    const shot = async (id, file) => { await page.evaluate(id => window.__nexo.handle.focusNode(id), id); await page.waitForTimeout(400); await card(page, id).screenshot({ path: path.join(shots, `${name}-${file}.png`) }); };
    const inspector = page.locator('#inspector');
    const appearance = async id => { await page.evaluate(id => window.__nexo.handle.focusNode(id), id); await card(page, id).locator('header').click();
      await inspector.getByRole('tab', { name: 'Appearance', exact: true }).click();
      const series = inspector.locator('details', { has: page.locator('summary', { hasText: /^Series$/ }) });
      if (!(await series.evaluate(d => d.open))) await series.locator('summary').click();
      return series; };
    // A Series field by its own label (a select's accessible name also carries its chosen option).
    const field = (scope, label) => scope.locator('label.plot-editor-field', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('select, input');
    const fieldset = (series, legend) => series.locator('fieldset', { has: page.locator('legend', { hasText: new RegExp(`^${legend}$`) }) });
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector(`.card[data-id="${PCA}"] .js-plotly-plot`);
    await until(page, PCA, el => el.data?.length === 2);
    await shot(PCA, '1-pca-before');

    // 1. Marker shape and outline on a PCA-like card (Series appearance panel).
    let series = await appearance(PCA);
    const control = fieldset(series, 'Control');
    await field(control, 'Marker shape').waitFor();
    assert.deepEqual(await field(control, 'Marker shape').locator('option').evaluateAll(os => os.map(o => [o.value, o.textContent])),
      [['circle', 'Circle'], ['square', 'Square'], ['triangle-up', 'Triangle'], ['star', 'Star'], ['diamond', 'Diamond']]);
    // NEXO-P3: Team's Marker shape is the only marker shape control (Nexo's Series style keeps Line dash only).
    assert.equal(await inspector.locator('select[aria-label^="Line dash"]').count(), 2);
    assert.equal(await inspector.locator('select[aria-label^="Marker symbol"]').count(), 0, 'a second marker shape control');
    await field(control, 'Marker shape').selectOption('diamond');
    await until(page, PCA, el => el.data[0].marker.symbol === 'diamond');
    await field(control, 'Marker outline color').fill('#ff00aa');
    await until(page, PCA, el => el.data[0].marker.line?.color === '#ff00aa');
    await field(control, 'Marker outline width').fill('2');
    await until(page, PCA, el => el.data[0].marker.line?.width === 2);
    assert.equal(await page.locator(`.card[data-id="${PCA}"] .scatterlayer .trace:first-child path.point`).first().evaluate(p => getComputedStyle(p).strokeWidth), '2px');
    await shot(PCA, '2-pca-diamond-outline');
    console.log(`PASS P1 ${name} marker-shape-and-outline-on-pca`);
    console.log(`PASS P13 ${name} one-marker-shape-control-teams`);

    // 2. Publication style: frame with mirrored black axis lines, black zero lines, Arial 10, no grid, outline 0.4.
    await inspector.getByRole('group', { name: 'Presentation preset', exact: true }).getByRole('button', { name: 'Publication', exact: true }).click();
    await until(page, PCA, el => el.layout.xaxis.mirror === true && el.layout.font.family === 'Arial');
    assert.deepEqual(await plot(page, PCA, el => ({ font: el.layout.font.size, mirror: [el.layout.xaxis.mirror, el.layout.yaxis.mirror], line: el.layout.xaxis.linecolor, zero: el.layout.yaxis.zerolinecolor, grid: el.layout.xaxis.showgrid, outline: el.data.map(t => t.marker.line?.width), symbol: el.data[0].marker.symbol, bg: el.layout.paper_bgcolor })),
      { font: 10, mirror: [true, true], line: '#000000', zero: '#000000', grid: false, outline: [0.4, 0.4], symbol: 'diamond', bg: undefined });
    assert.equal(await inspector.getByRole('button', { name: 'Publication', exact: true }).getAttribute('aria-pressed'), 'true');
    await shot(PCA, '3-pca-publication');
    // NEXO-P3: a preset starts from the figure's own settings: Nexo after Publication keeps no black mirrored frame.
    const presets = inspector.getByRole('group', { name: 'Presentation preset', exact: true });
    await presets.getByRole('button', { name: 'Nexo', exact: true }).click();
    await until(page, PCA, el => el.layout.font.family === 'system-ui');
    // Only what Publication set goes back to the figure's own; the user's marker shape and outline stay (as Team's
    // Publication keeps them), the 0.4 outline Publication set is gone.
    assert.deepEqual(await plot(page, PCA, el => [el.layout.xaxis.mirror, el.layout.xaxis.linecolor, el.layout.yaxis.zerolinecolor, el.data[0].marker.symbol, el.data[0].marker.line?.color]),
      [undefined, undefined, undefined, 'diamond', '#ff00aa']);
    assert.equal(await presets.getByRole('button', { name: 'Nexo', exact: true }).getAttribute('aria-pressed'), 'true');
    await shot(PCA, '3b-pca-nexo-after-publication');
    await presets.getByRole('button', { name: 'Publication', exact: true }).click();
    await until(page, PCA, el => el.layout.xaxis.mirror === true && el.layout.font.family === 'Arial' && el.data.every(t => t.marker.line?.width === 0.4));
    console.log(`PASS P2b ${name} nexo-after-publication-drops-the-black-frame`);
    console.log(`PASS P2 ${name} publication-style-frame-zero-lines-arial-10-outline-0.4`);

    // 3. Group outlines: a dotted ellipse per group, in its marker color, fully inside the axes.
    series = await appearance(PCA);
    await series.getByRole('button', { name: 'Group outlines: Off', exact: true }).click();
    await until(page, PCA, el => (el.layout.shapes || []).filter(s => String(s.name).startsWith('team-ellipse:')).length === 2);
    assert.deepEqual(await plot(page, PCA, el => el.layout.shapes.map(s => [s.line.dash, s.line.color === el.data[el.layout.shapes.indexOf(s)].marker.color])), [['dot', true], ['dot', true]]);
    assert.equal(await plot(page, PCA, outlinesInside), true, 'an outline runs past the axes');
    assert.equal(await page.locator(`.card[data-id="${PCA}"] .shapelayer path`).count(), 2);
    assert.equal(await series.getByRole('button', { name: 'Group outlines: On', exact: true }).getAttribute('aria-pressed'), 'true');
    await shot(PCA, '4-pca-group-outlines');
    console.log(`PASS P3 ${name} group-outlines-dotted-ellipses-inside-axes`);

    // 4. Composition overview: the class legend outside the bars, in stack order, recomputed after a draw.
    // A Composition card from the library is a canvas copy: its node id is the new instance's.
    const COMP = await page.evaluate(async source => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard(source); const id = window.__nexo.store.get().nodes.find(n => !before.has(n.id) && n.instance?.source === source).id;
      window.__nexo.handle.focusNode(id); return id; }, COMP_SOURCE);
    await page.waitForSelector(`.card[data-id="${COMP}"] .js-plotly-plot`);
    // NEXO-P3: a new Composition card opens at Team's 560 px height.
    assert.equal(await page.evaluate(id => window.__nexo.store.get().nodes.find(n => n.id === id).height, COMP), 560);
    assert.equal(await card(page, COMP).evaluate(el => el.offsetHeight), 560);
    await until(page, COMP, el => el.layout?.annotations?.some(a => String(a.name).startsWith('team-bar-label:')));
    assert.deepEqual(await plot(page, COMP, compLabels), ['LPC', 'TG', 'PE', 'PC']);
    const placed = await plot(page, COMP, el => { const area = el.querySelector('.nsewdrag').getBoundingClientRect();
      return [...el.querySelectorAll('.annotation')].filter(a => /●/.test(a.textContent)).map(a => a.getBoundingClientRect().left > area.right); });
    assert.deepEqual(placed, [true, true, true, true], 'a legend entry is not outside the bars');
    assert.equal(await page.locator(`.card[data-id="${COMP}"] .barlayer text`).count(), 0, 'text inside the bars');
    await shot(COMP, '5-composition-legend');
    series = await appearance(COMP);
    await fieldset(series, 'TG').getByLabel('Show series', { exact: true }).uncheck();
    await until(page, COMP, el => el.layout.annotations.filter(a => String(a.name).startsWith('team-bar-label:')).length === 3);
    assert.deepEqual(await plot(page, COMP, compLabels), ['LPC', 'PE', 'PC']);
    await shot(COMP, '6-composition-legend-class-off');
    console.log(`PASS P4 ${name} composition-legend-outside-bars-stack-order-follows-visibility`);

    // 4b. NEXO-P3: a short Composition card with 22 classes keeps its legend inside the plot area: one column at 380 px,
    // two columns and a wider right margin at 260 px. The mock draws 4 classes, so 22 synthetic ones are drawn on the card.
    const SHORT = await page.evaluate(async source => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard(source); const id = window.__nexo.store.get().nodes.find(n => !before.has(n.id) && n.instance?.source === source).id;
      window.__nexo.handle.focusNode(id); return id; }, COMP_SOURCE);
    await page.waitForSelector(`.card[data-id="${SHORT}"] .js-plotly-plot`);
    await until(page, SHORT, el => el.layout?.annotations?.some(a => String(a.name).startsWith('team-bar-label:')));
    const shortLegend = async height => {
      const drawn = await plot(page, SHORT, el => el._fullLayout.height);
      await page.evaluate(([id, height]) => window.__nexo.handle.setCardSize(id, { width: 620, height }), [SHORT, height]);
      await until(page, SHORT, `el => el._fullLayout.height < ${drawn} - 50`);
      await page.evaluate(id => { const gd = document.querySelector(`.card[data-id="${id}"] .js-plotly-plot`), cats = gd._fullLayout.xaxis._categories;
        const data = Array.from({ length: 22 }, (_, k) => ({ type: 'bar', name: `Class ${k + 1}`, x: cats, y: cats.map(() => 5), marker: { color: `hsl(${k * 47 % 360},55%,${35 + k % 3 * 15}%)` } }));
        return window.Plotly.react(gd, data, gd.layout); }, SHORT);
      await until(page, SHORT, el => el.layout.annotations.filter(a => String(a.name).startsWith('team-bar-label:')).length === 22);
      return plot(page, SHORT, el => { const area = el.querySelector('.nsewdrag').getBoundingClientRect(), rows = [...el.querySelectorAll('.annotation')].filter(a => /●/.test(a.textContent)).map(a => a.getBoundingClientRect());
        const cols = [...new Set(rows.map(r => Math.round(r.left)))].sort((a, b) => a - b), first = rows.filter(r => Math.round(r.left) === cols[0]);
        return { inside: rows.every(r => r.bottom <= area.bottom + 0.5 && r.top >= area.top - 0.5), columns: cols.length,
          apart: cols.length < 2 || Math.max(...first.map(r => r.right)) <= cols[1], right: el._fullLayout.margin.r }; });
    };
    assert.deepEqual(await shortLegend(380), { inside: true, columns: 1, apart: true, right: 125 });
    await shot(SHORT, '16-composition-short-card-after');
    const two = await shortLegend(260);
    assert.deepEqual([two.inside, two.columns, two.apart, two.right > 125], [true, 2, true, true]);
    await shot(SHORT, '17-composition-very-short-card-two-columns');
    console.log(`PASS P11 ${name} short-composition-card-legend-inside-the-plot-area`);

    // 5. Violin: the inner box follows the violin fill, two shades darker, with a darker outline.
    await shot(VIOLIN, '7-violin-before');
    series = await appearance(VIOLIN);
    await field(fieldset(series, 'Control'), 'Fill color').fill('#808080');
    await until(page, VIOLIN, el => el.data[0].box?.fillcolor === '#5a5a5a');
    assert.deepEqual(await plot(page, VIOLIN, violinBox), ['#5a5a5a', '#333333']);
    await shot(VIOLIN, '8-violin-box-two-shades-darker');
    console.log(`PASS P5 ${name} violin-inner-box-follows-fill`);

    // 6. Structure (NEXO-P2). The Structure cards need a confirmed design: confirmed from the Library, as a user.
    const DOT_SOURCE = 'structural_grid_tab-dotplotPlot', DOT_LABEL = 'Structural grid · selected class dotplot';
    const nodeOf = source => page.evaluate(source => window.__nexo.store.get().nodes.find(n => n.instance?.source === source)?.id ?? null, source);
    await page.getByRole('button', { name: 'Plots', exact: true }).click();
    await page.getByLabel('Search plots').fill(DOT_LABEL);
    await page.getByRole('button', { name: `Confirm study design… (${DOT_LABEL})`, exact: true }).click();
    await confirmDesign(page.getByRole('dialog', { name: 'Confirm study design', exact: true }));
    const addCopy = source => page.evaluate(async source => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard(source); const id = window.__nexo.store.get().nodes.find(n => !before.has(n.id) && n.instance?.source === source).id;
      window.__nexo.handle.focusNode(id); return id; }, source);
    const DOT = await nodeOf(DOT_SOURCE) ?? await addCopy(DOT_SOURCE);
    await page.evaluate(id => window.__nexo.handle.focusNode(id), DOT);
    await page.waitForSelector(`.card[data-id="${DOT}"] .js-plotly-plot`);
    await until(page, DOT, el => el.data?.length === 4);
    assert.deepEqual(await plot(page, DOT, el => [el.layout.font.family, el.layout.font.size, !!el.data[3].meta?.teamLegendProxy, el.data[3].marker.color, el.data[1].marker.size]),
      ['Arial, Helvetica, sans-serif', 10, true, '#D55E00', [6, 12, 18, 24]]);
    await shot(DOT, '12-structure-dotplot-before');
    series = await appearance(DOT);
    assert.deepEqual(await series.locator('fieldset > legend').allTextContents(), ['Up', 'Points'], 'legend proxy and text labels are not listed');
    const points = fieldset(series, 'Points'), size = field(points, 'Marker size');
    assert.deepEqual([await size.getAttribute('type'), await size.inputValue(), await points.locator('output').textContent()], ['range', '15', '15']);
    // Each edit is in the document before the next one (the plot shows it first; a quick second fill could race it).
    const inDocument = f => page.waitForFunction(([id, f]) => (window.__nexo.store.get().nodes.find(n => n.id === id).visual?.editor?.traces ?? []).some(new Function('t', `return (${f})(t)`)), [DOT, String(f)]);
    await size.fill('30');
    await until(page, DOT, el => JSON.stringify(el.data[1].marker.size) === '[12,24,36,48]');
    await inDocument(t => t.markerSize === 30);
    assert.equal(await points.locator('output').textContent(), '30');
    await field(fieldset(series, 'Up'), 'Fill color').fill('#112233');
    await until(page, DOT, el => el.data[3].marker.color === 'rgba(17,34,51,1)');
    await inDocument(t => t.fillColor === '#112233');
    assert.equal(await plot(page, DOT, el => el.data[0].marker.color), 'rgba(17,34,51,1)');
    await shot(DOT, '13-structure-dotplot-slider-proxy-colour');
    console.log(`PASS P6 ${name} structure-arial-10-proxy-follows-series-proportional-size-slider`);
    const ALL = await addCopy('structural_grid_tab-mergedPlot');
    await page.waitForSelector(`.card[data-id="${ALL}"] .js-plotly-plot`);
    await card(page, ALL).locator('header').click();
    await inspector.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await inspector.locator('summary', { hasText: /^Typography$/ }).waitFor();
    assert.equal(await inspector.locator('summary', { hasText: /^Series$/ }).count(), 0, 'Series section shown for the all-classes grid');
    // The section list where Series would be (between Conditions and Text annotations), as the inspector shows it.
    await inspector.locator('summary', { hasText: /^Text annotations$/ }).evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(shots, `${name}-14-structure-all-classes-no-series.png`), clip: await inspector.boundingBox().then(b => ({ x: b.x, y: 0, width: b.width, height: 1000 })) });
    console.log(`PASS P7 ${name} structure-all-classes-grid-hides-series`);
    const SHIFTS = await addCopy('structural_tab-summaryPlot');
    await page.waitForSelector(`.card[data-id="${SHIFTS}"] .js-plotly-plot`);
    await until(page, SHIFTS, el => el.layout.title?.text === 'Structural remodeling shifts');
    assert.deepEqual(await page.evaluate(id => window.__nexo.store.get().nexo.nodes[id]?.actions, SHIFTS), ['runAnalysis']);
    await shot(SHIFTS, '15-structure-shifts-ran-itself');
    console.log(`PASS P8 ${name} remodeling-shifts-runs-its-structural-analysis-itself`);

    // NEXO-P3: a board saved before NEXO-P3 may carry Nexo's own marker symbol (nexo series markerSymbol). Planted on the
    // PCA's second series; Nexo no longer draws it, the reopen moves it to Team's markerSymbol.
    await page.evaluate(id => window.__nexo.store.set(doc => ({ ...doc, nexo: { ...doc.nexo, nodes: { ...doc.nexo.nodes, [id]: { ...doc.nexo.nodes[id], style: { series: [{ index: 1, markerSymbol: 'square' }, { index: 0, markerSymbol: 'cross' }] } } } } })), PCA);
    assert.equal(await plot(page, PCA, el => el.data[1].marker.symbol), undefined);
    // 7. Save and reopen keeps every change (Team's canvas fields, validated on the way in and out).
    await page.getByTitle('Open or save a checkpoint', { exact: true }).click();
    const checkpoints = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await checkpoints.getByLabel('New checkpoint name', { exact: true }).fill(`Presentation port ${name}`);
    await checkpoints.getByRole('button', { name: 'Save current analysis', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('checkpoint')?.length === 64);
    await checkpoints.waitFor({ state: 'detached' });
    await page.reload(); await page.waitForSelector('.card'); await page.waitForFunction(() => !!window.__nexo?.handle);
    // A checkpoint saved with a confirmed design asks for it again on reopen, prefilled.
    const asked = page.getByRole('dialog', { name: 'Confirm study design', exact: true });
    if (await asked.waitFor({ timeout: 5000 }).then(() => true, () => false)) await confirmDesign(asked);
    // The Structure cards widen the board: Fit opens far out, where cards are pictures; draw at 100 % as before.
    await page.evaluate(() => window.__nexo.handle.zoomTo(1));
    for (const id of [PCA, COMP, VIOLIN]) { await page.evaluate(id => window.__nexo.handle.focusNode(id), id); await page.waitForSelector(`.card[data-id="${id}"] .js-plotly-plot`); }
    await until(page, PCA, el => el.layout.xaxis.mirror === true && el.data[0].marker.symbol === 'diamond' && (el.layout.shapes || []).length === 2);
    assert.deepEqual(await plot(page, PCA, el => [el.data[0].marker.line.color, el.data.map(t => t.marker.line.width), el.layout.font.family]), ['#ff00aa', [0.4, 0.4], 'Arial']);
    await until(page, COMP, el => (el.layout.annotations || []).filter(a => String(a.name).startsWith('team-bar-label:')).length === 3);
    assert.deepEqual(await plot(page, COMP, compLabels), ['LPC', 'PE', 'PC']);
    await until(page, VIOLIN, el => el.data[0].box?.fillcolor === '#5a5a5a');
    const saved = await page.evaluate(() => window.__nexo.store.get().nodes.find(n => n.id === 'results_dashboard-plot_pca').visual.editor);
    assert.equal(saved.groupEllipses, true); assert.equal(saved.layout['xaxis.mirror'], true); assert.equal(saved.layout['xaxis.linecolor'], '#000000');
    const shaped = saved.traces.find(t => t.markerSymbol);
    assert.deepEqual([shaped.markerSymbol, shaped.markerLineColor, shaped.markerLineWidth], ['diamond', '#ff00aa', 0.4]);
    // The planted Nexo marker symbol is Team's now; Team's own diamond wins over Nexo's cross; Nexo keeps none.
    await until(page, PCA, el => el.data[1].marker.symbol === 'square');
    assert.deepEqual(saved.traces.filter(t => t.markerSymbol).map(t => [t.index, t.markerSymbol]).sort(), [[0, 'diamond'], [1, 'square']]);
    assert.equal(await page.evaluate(id => window.__nexo.store.get().nexo.nodes[id]?.style?.series, PCA), undefined);
    await shot(PCA, '18-pca-nexo-marker-symbol-moved-to-team');
    console.log(`PASS P12 ${name} saved-nexo-marker-symbol-moves-to-team-marker-shape`);
    await page.evaluate(id => window.__nexo.handle.focusNode(id), DOT); await page.waitForSelector(`.card[data-id="${DOT}"] .js-plotly-plot`);
    await until(page, DOT, el => JSON.stringify(el.data[1].marker.size) === '[12,24,36,48]');
    const dotEditor = await page.evaluate(id => window.__nexo.store.get().nodes.find(n => n.id === id).visual.editor, DOT);
    assert.equal(dotEditor.traces.find(t => t.markerSize !== undefined).markerSize, 30);
    await shot(PCA, '9-pca-after-reopen'); await shot(COMP, '10-composition-after-reopen'); await shot(VIOLIN, '11-violin-after-reopen');
    console.log(`PASS P9 ${name} save-reopen-keeps-shape-outline-publication-outlines-legend-box-marker-size`);
    assert.deepEqual(errors, []);
    console.log(`PASS P10 ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP NEXO-P Playwright: ${e.message}`); return; } throw e; }
  fs.mkdirSync(shots, { recursive: true });
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
  for (const name of (process.env.ENGINES || 'chromium,webkit').split(',')) await journey(pw, name, base);
  console.log('NEXO-P OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
