// Team's Composition overview legend (R/results_dashboard.R rd_comp_label_js, Salcedo 29e4af0a), ported to the Nexo client.
import { expect, it } from 'vitest';
import { bindCompositionLegend, compositionLabels } from './compositionLegend';

// A drawn Composition overview as Plotly holds it: the hook reads the plotted bars and the drawn plot height.
const compositionPlot = () => ({
  data: [
    {type: 'bar', name: 'PC', x: ['S1', 'S2'], y: [60, 50], marker: {color: '#111111'}},
    {type: 'bar', name: 'PE', x: ['S1', 'S2'], y: [30, 40], marker: {color: '#222222'}},
    {type: 'bar', name: 'Off', x: ['S1', 'S2'], y: [5, 5], visible: false, marker: {color: '#333333'}},
    {type: 'bar', name: 'Legend only', x: ['S1', 'S2'], y: [5, 5], visible: 'legendonly'},
    {type: 'bar', name: 'Absent last', x: ['S1', 'S2'], y: [5, 0], marker: {color: '#444444'}},
    {type: 'bar', name: 'No color', x: ['S1', 'S2'], y: [1, 10]},
  ],
  layout: {annotations: [{text: 'Source note'}], meta: {teamComposition: {version: 1}}},
  _fullLayout: {xaxis: {_categories: ['S1', 'S2']}, yaxis: {}, _size: {h: 300}, font: {color: '#52514e'}},
});
const label = (name: string, color: string, y: number, size = 12) => ({name: 'team-bar-label:' + name, xref: 'paper', yref: 'paper', x: 1.02, y, showarrow: false,
  text: `<span style="color:${color}">●</span> ${name}`, xanchor: 'left', yanchor: 'middle', align: 'left', font: {size, color: '#52514e'}, captureevents: false});

it('Composition legend: visible bars in stack order top to bottom, a dot in the class color, outside the bars', () => {
  // Last trace drawn is the top segment; pitch = min(17, 300 / 3) = 17 px; a bar without a color gets the dark gray dot.
  expect(compositionLabels(compositionPlot())?.labels).toEqual([label('No color', '#52514e', 0.9717), label('PE', '#222222', 0.915), label('PC', '#111111', 0.8583)]);
});

it('Composition legend is recomputed after every draw and never touches other annotations', async () => {
  const gd: any = compositionPlot(), calls: any[] = [], handlers: Record<string, () => void> = {};
  gd.on = (event: string, f: () => void) => { handlers[event] = f; };
  const Plotly = {relayout: async (el: any, update: any) => { calls.push(update); el.layout.annotations = update.annotations; }};
  await bindCompositionLegend(Plotly, gd);
  expect(calls).toHaveLength(1); expect(calls[0].annotations[0]).toEqual({text: 'Source note'}); expect(calls[0].annotations).toHaveLength(4);
  await handlers.plotly_afterplot(); expect(calls).toHaveLength(1);
  // A class turned off leaves the legend at the next draw; the others close up.
  gd.data[1].visible = false; await handlers.plotly_afterplot();
  expect(calls[1].annotations.slice(1)).toEqual([label('No color', '#52514e', 0.9717), label('PC', '#111111', 0.915)]);
  // Not a Composition figure: no hook.
  const other: any = {...compositionPlot(), layout: {}}; other.on = () => { throw new Error('bound'); };
  await bindCompositionLegend(Plotly, other); expect(calls).toHaveLength(2);
});

// NEXO-P3: 22 classes. A Composition card 380, 560 and 900 px tall on the mock has a plot area 148 px shorter (card
// header and Team's margins); 150 px is a card too short for one column. The plot area is 400 px wide, right margin 125.
const manyClasses = (h: number) => {
  const names = Array.from({length: 22}, (_, k) => `Class ${k + 1}`);
  return {data: names.map((name, k) => ({type: 'bar', name, x: ['A', 'B', 'C'], y: [5, 5, 5], marker: {color: '#' + String(k).padStart(6, '0')}})),
    layout: {margin: {r: 125}, meta: {teamComposition: {version: 1}}} as any,
    _fullLayout: {xaxis: {_categories: ['A', 'B', 'C']}, yaxis: {}, _size: {h, w: 400}, margin: {r: 125}, font: {color: '#52514e'}}};
};
async function drawLegend(h: number) {
  const gd: any = manyClasses(h), calls: any[] = [];
  await bindCompositionLegend({relayout: async (el: any, update: any) => { calls.push(update); el.layout.annotations = update.annotations; }}, gd);
  const labels = calls[0].annotations.filter((a: any) => a.name.startsWith('team-bar-label:'));
  // A line of text is about 1.3 font sizes tall around its middle (yanchor middle).
  return {labels, right: calls[0]['margin.r'] ?? 125, rows: labels.map((a: any) => ({x: a.x, mid: (1 - a.y) * h, half: a.font.size * 0.65, size: a.font.size}))};
}
it.each([232, 412, 752])('Composition legend: 22 classes stay inside a %i px plot area, in one column, rows apart', async h => {
  const {labels, right, rows} = await drawLegend(h);
  expect(labels.map((a: any) => a.name)).toEqual(Array.from({length: 22}, (_, k) => `team-bar-label:Class ${22 - k}`));
  expect(new Set(rows.map((r: any) => r.x))).toEqual(new Set([1.02]));
  expect(right).toBe(125);
  for (const r of rows) { expect(r.mid - r.half).toBeGreaterThanOrEqual(0); expect(r.mid + r.half).toBeLessThanOrEqual(h); }
  rows.slice(1).forEach((r: any, k: number) => expect(r.mid - rows[k].mid).toBeGreaterThanOrEqual(r.size));
});
it('Composition legend: too many rows for one column split into two, the right margin widened for the second', async () => {
  const {labels, right, rows} = await drawLegend(150);
  const columns = [...new Set<number>(rows.map((r: any) => r.x))].sort((a, b) => a - b);
  expect(columns).toHaveLength(2);
  // Stack order reads down the first column, then down the second.
  expect(labels.slice(0, 11).every((a: any) => a.x === columns[0])).toBe(true);
  for (const r of rows) { expect(r.mid - r.half).toBeGreaterThanOrEqual(0); expect(r.mid + r.half).toBeLessThanOrEqual(150); }
  // The second column starts past the first column's longest entry ("● Class 22" at 9 px, about 0.6 em a character).
  expect(right).toBeGreaterThan(125);
  expect((columns[1] - columns[0]) * (400 + 125 - right)).toBeGreaterThanOrEqual(10 * 9 * 0.6);
  expect(right - 125).toBeGreaterThanOrEqual(10 * 9 * 0.6);
});
