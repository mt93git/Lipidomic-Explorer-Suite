// NEXO-P2: the analyst's plot_editor.js changes for the Plotly Structure figures (Team 01dd860d, ba774a0e, c2d165ed), ported:
// Arial 10 default text, legend proxies that follow their series, a proportional marker size slider for per-point sizes,
// helper traces not listed, and layout.meta.teamHideSeries. Same saved field (markerSize).
import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyEditor, sourceKey, withTeamFont } from './applyEditor';
import { serializeEditor } from './editorState';
import { sanitizeEditor } from '../state/validate-support';
import PlotEditor from '../ui/PlotEditor/PlotEditor';
import { mockStructureFigure } from '../mock/structure';
// Mock dotplot: 0 bar "Up" (legend group Up), 1 "Points" with sizes [6,12,18,24], 2 text labels (teamNoEdit), 3 round proxy of "Up".
const dotplot = () => mockStructureFigure('structural_grid_tab-dotplotPlot', 'Dotplot') as any;
const noop = () => {};
const seriesOf = (html: string) => html.slice(html.indexOf('<summary>Series</summary>'), html.indexOf('<summary>Text annotations</summary>'));
const panel = (figure: any, editor: any = {}) => renderToStaticMarkup(createElement(PlotEditor, {figure, traces: figure.data, editor, legendGroups: [], onChange: noop, onUndo: noop, onRedo: noop, onReset: noop, onPreset: noop}));

// Team sets it in its Plotly newPlot/react wrapper, before the editor: Nexo applies it to the figure a card fetches.
it('every Plotly figure draws Arial 10 by default; editor settings still override it', () => {
  const figure: any = withTeamFont({data: [{type: 'scatter', x: [1], y: [1]}], layout: {font: {family: 'Open Sans', size: 12, color: '#444444'}}});
  expect(applyEditor(figure, {}).layout.font).toEqual({family: 'Arial, Helvetica, sans-serif', size: 10, color: '#444444'});
  expect(applyEditor(figure, {layout: {'font.family': 'Georgia', 'font.size': 14}} as any).layout.font).toEqual({family: 'Georgia', size: 14, color: '#444444'});
  const fsName = 'node:fs';
  return import(fsName).then(({ readFileSync }) => {
    const cards = readFileSync(new URL('../cards.ts', import.meta.url), 'utf8') as string;
    expect(cards).toMatch(/withTeamFont\(result\.figure/);
    expect(cards).toMatch(/withTeamFont\(gcFigure\(/);
  });
});

it('a legend proxy follows its series colour and visibility', () => {
  const figure = dotplot(), key = sourceKey(figure.data[0], figure.data);
  const coloured = applyEditor(figure, {traces: [{index: 0, sourceKey: key, fillColor: '#112233', fillOpacity: 1}]} as any);
  expect(coloured.data[0].marker.color).toBe('rgba(17,34,51,1)');
  expect(coloured.data[3].marker.color).toBe('rgba(17,34,51,1)');
  expect(applyEditor(figure, {traces: [{index: 0, sourceKey: key, hidden: true}]} as any).data[3].visible).toBe(false);
});

it('marker size scales per-point sizes proportionally from their own base', () => {
  const figure = dotplot(), key = sourceKey(figure.data[1], figure.data);
  const bigger = applyEditor(figure, {traces: [{index: 1, sourceKey: key, markerSize: 30}]} as any);
  expect(bigger.data[1].marker.size).toEqual([12, 24, 36, 48]);
  // Applied again from the baseline, never compounded; a point never shrinks below 1.
  expect(applyEditor(bigger, {traces: [{index: 1, sourceKey: key, markerSize: 15}]} as any).data[1].marker.size).toEqual([6, 12, 18, 24]);
  expect(applyEditor(figure, {traces: [{index: 1, sourceKey: key, markerSize: 2}]} as any).data[1].marker.size).toEqual([1, 1.6, 2.4, 3.2]);
  // The saved field is Team's markerSize, kept as it is.
  const saved = {traces: [{index: 1, sourceKey: key, markerSize: 30}]};
  expect((serializeEditor(saved).traces as any)[0].markerSize).toBe(30);
  expect((sanitizeEditor(saved) as any).traces[0].markerSize).toBe(30);
});

it('per-point sizes get a slider with its value shown next to it', () => {
  const html = panel(dotplot());
  const points = seriesOf(html).split('<fieldset').find(f => f.includes('<legend>Points</legend>'))!;
  expect(points).toMatch(/Marker size<\/span><input type="range"[^>]* min="2" max="80" step="1"[^>]* value="15"/);
  expect(points).toContain('<output>15</output>');
});

it('helper traces are not listed and teamHideSeries hides the Series section', () => {
  const html = panel(dotplot());
  const listed = [...seriesOf(html).matchAll(/<fieldset><legend>([^<]*)<\/legend>/g)].map(m => m[1]);
  expect(listed).toEqual(['Up', 'Points']);
  expect(panel(mockStructureFigure('structural_grid_tab-mergedPlot', 'All classes'))).not.toContain('<summary>Series</summary>');
});
