// The lab's Team presentation features (Salcedo, merged at abe454b4), ported to Nexo: same saved fields, same rules.
import { expect, it } from 'vitest';
import { reduceEditor, serializeEditor } from './editorState';
import { sanitizeEditor } from '../state/validate-support';
import { fromCanvasV1, toCanvasV1 } from '../state/serialize';
import { validate as validateTabs } from '../state/tabs';
import { applyEditor, publicationEditor, sourceKey } from './applyEditor';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlotEditor from '../ui/PlotEditor/PlotEditor';
import { colorHex } from '../ui/PlotEditor/Fields';

// Exactly the new fields R/frontends/team/canvas_state.R accepts in a saved editor.
const teamEditor = {
  layout: {'xaxis.mirror': true, 'yaxis.mirror': false, 'xaxis.linecolor': '#000000', 'yaxis.linecolor': '#1a2b3c'},
  traces: [{index: 0, sourceKey: 'source:pca:A', markerSymbol: 'diamond', markerLineColor: '#112233', markerLineWidth: 0.4},
    {index: 1, sourceKey: 'source:pca:B', markerSymbol: 'triangle-up', markerLineWidth: 20}],
  groupEllipses: true,
};
const teamCanvas = (editor: unknown) => ({version: '1', libraryHidden: false,
  nodes: [{kind: 'plot', id: 'results_dashboard-plot_pca', label: 'PCA', x: 0, y: 0, width: 620, height: 520, visual: {editor}, finished: null}]});
const newFields = (editor: any) => JSON.stringify({layout: ['xaxis.mirror', 'yaxis.mirror', 'xaxis.linecolor', 'yaxis.linecolor'].map(k => editor.layout?.[k]), traces: editor.traces.map((t: any) => ({index: t.index, markerSymbol: t.markerSymbol, markerLineColor: t.markerLineColor, markerLineWidth: t.markerLineWidth})), groupEllipses: editor.groupEllipses});

it('a Team canvas with the new presentation fields survives an edit in Nexo and saves back byte-equal', () => {
  const opened = fromCanvasV1(JSON.parse(JSON.stringify(teamCanvas(teamEditor))));
  const node = opened.nodes[0] as any;
  // Nexo's Appearance tab: one edit, then the editor is saved through serializeEditor.
  node.visual.editor = serializeEditor(reduceEditor(node.visual.editor, {type: 'layout', key: 'title.text', value: 'PCA'}));
  const saved = toCanvasV1({nodes: opened.nodes, libraryHidden: opened.libraryHidden}, validateTabs(null, opened.nodes.map(n => n.id)));
  expect(newFields(saved.nodes[0].visual.editor)).toBe(newFields(teamEditor));
  expect(newFields(sanitizeEditor(teamEditor))).toBe(newFields(teamEditor));
});

it('values canvas_state.R rejects never survive in Nexo', () => {
  const bad = {layout: {'xaxis.mirror': 'all', 'yaxis.linecolor': 'black'}, groupEllipses: 'yes',
    traces: [{index: 0, sourceKey: 'source:pca:A', markerSymbol: 'cross', markerLineColor: '#12345', markerLineWidth: 20.5},
      {index: 1, sourceKey: 'source:pca:B', markerSymbol: 'triangle', markerLineWidth: -1}]};
  for (const clean of [serializeEditor(bad), sanitizeEditor(bad)] as any[]) {
    expect(clean.layout).toEqual({});
    expect(clean.groupEllipses).toBeUndefined();
    expect(clean.traces).toEqual([{index: 0, sourceKey: 'source:pca:A'}, {index: 1, sourceKey: 'source:pca:B'}]);
  }
});

const points: any = {data: [
  {type: 'scatter', mode: 'markers', name: 'A', x: [1, 2, 3], y: [1, 3, 2], marker: {color: '#123456'}},
  {type: 'scatter', mode: 'markers', name: 'Per point', x: [1, 2], y: [2, 1], marker: {color: [1, 2], colorscale: 'Viridis'}},
  {type: 'box', name: 'Box', y: [1, 2, 3], boxpoints: 'all'},
  {type: 'violin', name: 'Violin', y: [1, 2, 3], points: 'all'},
  {type: 'scatter3d', mode: 'markers', name: '3D', x: [1], y: [1], z: [1]},
  {type: 'scatter', mode: 'lines', name: 'Line', x: [1, 2], y: [1, 2]},
  {type: 'bar', name: 'Bar', x: ['a'], y: [1]},
  {type: 'violin', name: 'No points', y: [1, 2], points: false},
], layout: {xaxis: {}, yaxis: {}}};
const every = (patch: any) => ({traces: points.data.map((_: unknown, index: number) => ({index, ...patch}))});

it('marker shape, color and outline go on every trace that draws points, as plot_editor.js does', () => {
  const out = applyEditor(points, every({markerSymbol: 'diamond', color: '#ff0000', markerLineColor: '#00ff00', markerLineWidth: 0.4}) as any);
  for (const i of [0, 1, 2, 3, 4]) expect(out.data[i].marker).toMatchObject({symbol: 'diamond', color: '#ff0000', line: {color: '#00ff00', width: 0.4}});
  // A lines-only scatter, a bar (its outline is the bar border) and a violin without points draw no point markers.
  for (const i of [5, 6, 7]) { expect(out.data[i].marker?.symbol).toBeUndefined(); expect(out.data[i].marker?.line).toBeUndefined(); }
  // 3D scatter draws only circle, square and diamond.
  expect(applyEditor(points, every({markerSymbol: 'star'}) as any).data[4].marker?.symbol).toBeUndefined();
  expect(applyEditor(points, every({markerSymbol: 'star'}) as any).data[0].marker.symbol).toBe('star');
});

it('axis mirror and line color reach the layout', () => {
  const out = applyEditor(points, {layout: {'xaxis.mirror': true, 'yaxis.linecolor': '#000000'}});
  expect(out.layout.xaxis.mirror).toBe(true); expect(out.layout.yaxis.linecolor).toBe('#000000');
});

const panelFigure: any = {data: [
  {type: 'scatter', mode: 'markers', name: 'A', x: [1, 2, 3], y: [1, 3, 2], marker: {color: '#123456'}},
  {type: 'scatter', mode: 'markers', name: 'B', x: [1, 2, 3], y: [2, 1, 3], marker: {symbol: ['circle', 'square', 'star']}},
  {type: 'bar', name: 'Bar', x: ['a'], y: [1]},
], layout: {xaxis: {}, yaxis: {}}};
const panel = (figure: any, editor: any = {}) => renderToStaticMarkup(createElement(PlotEditor, {figure, traces: figure.data, editor, legendGroups: [], onChange: noop, onUndo: noop, onRedo: noop, onReset: noop, onPreset: noop}));
const noop = () => {};
const series = (html: string) => html.slice(html.indexOf('<summary>Series</summary>'), html.indexOf('<summary>Text annotations</summary>')).split('<fieldset');

it('Series offers marker shape, outline color and width, with Team labels', () => {
  const [, a, b, bar] = series(panel(panelFigure));
  for (const [value, label] of [['circle', 'Circle'], ['square', 'Square'], ['triangle-up', 'Triangle'], ['star', 'Star'], ['diamond', 'Diamond']]) expect(a).toContain(`<option value="${value}"${value === 'circle' ? ' selected=""' : ''}>${label}</option>`);
  for (const label of ['Marker shape', 'Marker outline color', 'Marker outline width']) { expect(a).toContain(label); expect(b).toContain(label); expect(bar).not.toContain(label); }
  // Points that carry their own shapes show "As plotted" until a shape is chosen.
  expect(b).toContain('<option value="" selected="">As plotted</option>'); expect(a).not.toContain('As plotted');
});

it('Group outlines toggle sits left of Show all series, off by default, unavailable without a scatter of 3 points', () => {
  const html = panel(panelFigure);
  expect(html).toMatch(/<button type="button" aria-pressed="false" data-group-outlines="true" title="Draw a dotted 95% ellipse around the points of each group, in the color of its markers. Presentation only: no values or statistics change.">Group outlines: Off<\/button><button type="button">Show all series<\/button>/);
  expect(panel(panelFigure, {groupEllipses: true})).toContain('aria-pressed="true" data-group-outlines="true"');
  expect(panel({data: [panelFigure.data[2]], layout: {}})).toMatch(/disabled="" title="Group outlines need a scatter plot with at least 3 points per group.">Group outlines: Off</);
});

it('a changed chart color has Reset back to the original; color fields fall back to dark gray', () => {
  const html = panel(panelFigure, {layout: {plot_bgcolor: '#eeeeee'}});
  expect(html).toContain('aria-label="Reset Plot background to the original color"');
  expect(html).not.toContain('aria-label="Reset Page background to the original color"');
  expect(colorHex(undefined)).toBe('#52514e');
  // B has no single marker color: its field shows the gray fallback.
  expect(series(html)[2]).toMatch(/Marker color<\/span><input type="color"[^>]* value="#52514e"/);
});

it('Publication style: frame with mirrored axis lines, black zero lines, Arial 10, no grid, 0.4 outline on point series', () => {
  const figure: any = {data: [
    {type: 'scatter', mode: 'markers', name: 'Healthy', x: [1, 2, 3], y: [1, 2, 3], marker: {color: '#123456'}},
    {type: 'violin', name: 'Violin', y: [1, 2], points: 'all'},
    {type: 'bar', name: 'Bar', x: ['a'], y: [1]},
  ], layout: {xaxis: {}, yaxis: {}, paper_bgcolor: '#fafafa'}};
  const out = publicationEditor(figure, {layout: {'plot_bgcolor': '#eeeeee'}});
  const axis = {showgrid: false, showline: true, mirror: true, linecolor: '#000000', linewidth: 1, zeroline: true, zerolinecolor: '#000000', zerolinewidth: 1, 'title.font.size': 10, 'tickfont.size': 10};
  expect(out.layout).toEqual({'plot_bgcolor': '#eeeeee', 'font.family': 'Arial', 'font.size': 10, 'title.font.family': 'Arial', 'title.font.size': 10, 'legend.font.family': 'Arial', 'legend.font.size': 10,
    ...Object.fromEntries(['xaxis', 'yaxis'].flatMap(a => Object.entries(axis).map(([k, v]) => [`${a}.${k}`, v])))});
  // Colors and backgrounds stay as they are: only the marker outline of point series changes.
  expect(out.traces).toEqual([{index: 0, sourceKey: sourceKey(figure.data[0], figure.data), markerLineWidth: 0.4}, {index: 1, sourceKey: sourceKey(figure.data[1], figure.data), markerLineWidth: 0.4}]);
  const drawn = applyEditor(figure, out);
  expect(drawn.data[0].marker).toEqual({color: '#123456', line: {width: 0.4}}); expect(drawn.layout.paper_bgcolor).toBe('#fafafa');
});

const scatterGroups: any = {data: [
  {type: 'scatter', mode: 'markers', name: 'A', x: [-1, 1, 0, 0], y: [0, 0, -2, 2], marker: {color: '#123456'}},
  {type: 'scatter', mode: 'markers', name: 'B', x: [5, 6, 7], y: [1, 3, 2], marker: {color: '#654321'}},
  {type: 'scatter', mode: 'lines', name: 'Line', x: [1, 2, 3], y: [1, 2, 4]},
  {type: 'scatter', mode: 'markers', name: 'Two', x: [1, 2], y: [1, 2], marker: {color: '#111111'}},
  {type: 'scatter', mode: 'markers', name: 'Other axes', xaxis: 'x2', yaxis: 'y2', x: [1, 2, 3], y: [1, 3, 2], marker: {color: '#222222'}},
], layout: {xaxis: {}, yaxis: {}, shapes: [{type: 'rect', x0: 0, x1: 1, y0: 0, y1: 1}]}};
const outlines = (f: any) => (f.layout.shapes ?? []).filter((s: any) => String(s.name).startsWith('team-ellipse:'));

it('Group outlines: a dashed 95% data ellipse per marker series (Team eac6bb75), drawn from the plotted points as layout shapes', () => {
  const out = applyEditor(scatterGroups, {groupEllipses: true});
  const [a, b] = outlines(out);
  expect(outlines(out)).toHaveLength(2);
  expect(a).toMatchObject({type: 'path', name: 'team-ellipse:' + sourceKey(scatterGroups.data[0], scatterGroups.data), xref: 'x', yref: 'y',
    line: {color: '#123456', width: 1.5, dash: 'dash'}, fillcolor: 'rgba(0,0,0,0)', layer: 'above', editable: false});
  expect(b.line.color).toBe('#654321');
  // A: mean (0,0), variances 2/3 and 8/3, no covariance: major axis vertical, a = sqrt(5.991 * 8/3) = 3.997; 72 steps.
  expect(a.path.startsWith('M0,3.997 L')).toBe(true); expect(a.path.match(/ L/g)).toHaveLength(71); expect(a.path.endsWith(' Z')).toBe(true);
  // The plot's own shapes stay; the science is untouched.
  expect(out.layout.shapes[0]).toEqual(scatterGroups.layout.shapes[0]); expect(out.data).toEqual(scatterGroups.data);
});

it('Group outlines follow a marker color change, skip hidden series, and leave nothing when off', () => {
  const key = sourceKey(scatterGroups.data[1], scatterGroups.data);
  const out = applyEditor(scatterGroups, {groupEllipses: true, traces: [{index: 0, sourceKey: sourceKey(scatterGroups.data[0], scatterGroups.data), color: '#ff0000'}, {index: 1, sourceKey: key, hidden: true}]});
  expect(outlines(out).map((s: any) => s.line.color)).toEqual(['#ff0000']);
  expect(applyEditor(out, {groupEllipses: false}).layout).toEqual(scatterGroups.layout);
});

it('Group outlines widen an axis R fixed so the whole outline shows', () => {
  const fixed = {...scatterGroups, layout: {...scatterGroups.layout, xaxis: {range: [-2, 8]}, yaxis: {range: [5, -3]}}};
  const out = applyEditor(fixed, {groupEllipses: true});
  const [lo, hi] = out.layout.xaxis.range, [top, bottom] = out.layout.yaxis.range;
  expect(lo).toBeLessThan(-2); expect(hi).toBeGreaterThan(8.4); expect(out.layout.xaxis.autorange).toBe(false);
  // A reversed axis stays reversed.
  expect(top).toBe(5); expect(bottom).toBeLessThan(-3.997);
});

it('the box inside a violin follows the violin fill, two shades darker, with a darker outline (Team bb410e93)', () => {
  const violin: any = {data: [{type: 'violin', name: 'Control', x: ['Control'], y: [1, 2], fillcolor: '#BCD8EC', box: {visible: true}}], layout: {meta: {teamConditions: ['Control']}}};
  // A chosen fill: box 30% darker (two 15% steps), outline 60% darker.
  expect(applyEditor(violin, {traces: [{index: 0, fillColor: '#808080'}]}).data[0].box).toEqual({visible: true, fillcolor: '#5a5a5a', line: {color: '#333333'}});
  // A palette fill (Okabe–Ito orange #E69F00) follows the same rule.
  expect(applyEditor(violin, {palette: 'Okabe–Ito'}).data[0].box).toEqual({visible: true, fillcolor: '#a16f00', line: {color: '#5c4000'}});
  expect(applyEditor(violin, {}).data[0].box).toEqual({visible: true});
});
