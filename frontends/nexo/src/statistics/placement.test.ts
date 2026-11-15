// FIX-PROD-H 3 (placement): Team's canvas_statistics.js draw() reads the value axis as Plotly lays it out on the data
// alone (its own labels and brackets removed), places the n labels at its bottom (yanchor top) and the brackets above its
// top, then sets the axis to include them: [bottom - span * (both ? .17 : .09) * fontSize/12, brackets ? highest +
// span * (.05 + .07 * fontSize/12) : top]. Nexo placed the labels at the lowest data value, over the violin tails.
import { expect, it } from 'vitest';
import { applyStatisticsToFigure } from './annotations';
import { placeStatistics } from '../editor/applyNexoStatistics';
const groups = [{ group: 'Alpha', nSamples: 16, nExcluded: 0, nParticipants: null }, { group: 'Beta', nSamples: 3, nExcluded: 0, nParticipants: null }];
const data = [{ type: 'violin', x: ['Alpha', 'Alpha', 'Beta', 'Beta'], y: [1, 3, 2, 6] }];
const n = (layout: Record<string, unknown>) => (layout.annotations as { name?: string; y?: number }[]).filter(a => a.name?.startsWith('tcstat-n-'));

it('with an axis baseline the labels sit at its bottom and the axis makes room for them', () => {
  const out = applyStatisticsToFigure({ data, layout: { yaxis: { range: [-2, 12] } } }, null, groups);
  expect(n(out.layout).map(a => a.y)).toEqual([-2, -2]);
  expect((out.layout.yaxis as { range: number[] }).range).toEqual([-2 - 14 * .09, 12]);
});
it('a drawn plot places its labels from the axis Plotly lays out without them', async () => {
  const calls: Record<string, unknown>[] = [];
  const gd = { data, layout: { annotations: [{ text: 'keep' }, { name: 'tcstat-n-0', y: 1 }], shapes: [], yaxis: { autorange: true, range: [0, 7] } }, _fullLayout: { yaxis: { range: [0, 7] } } };
  const Plotly = { relayout: async (_: unknown, update: Record<string, unknown>) => {
    calls.push(update); Object.assign(gd.layout, update);
    if (calls.length === 1) gd._fullLayout.yaxis.range = [-3, 9]; // the data alone, tails included
  } };
  await placeStatistics(Plotly, gd as unknown as HTMLElement, null, groups);
  expect(calls[0]).toEqual({ annotations: [{ text: 'keep' }], shapes: [] });
  expect(n(calls[1]).map(a => a.y)).toEqual([-3, -3]);
  expect(calls[1]['yaxis.range']).toEqual([-3 - 12 * .09, 9]);
  expect(calls[1]['yaxis.autorange']).toBe(false);
});
it('a plot without statistics items is left as drawn', async () => {
  const calls: unknown[] = [];
  await placeStatistics({ relayout: async (...a: unknown[]) => { calls.push(a); } }, { data, layout: { annotations: [{ text: 'keep' }] }, _fullLayout: {} } as unknown as HTMLElement, null);
  expect(calls).toEqual([]);
});
// No Card harness in vitest (cardBodyMessage.test.ts reads the source the same way).
it('cards place the statistics after fitting the violins', async () => {
  const fsName = 'node:fs', { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
  const src = readFileSync(new URL('../cards.ts', import.meta.url), 'utf8');
  const fits = src.match(/await fitViolins\(Plotly, ?(\w+)\);/g) ?? [];
  expect(fits.length).toBeGreaterThanOrEqual(4);
  for (const fit of fits) { const gd = fit.match(/Plotly, ?(\w+)\)/)![1];
    expect(src.slice(src.indexOf(fit) + fit.length, src.indexOf(fit) + fit.length + 120)).toMatch(new RegExp(`^\\s*await placeStatistics\\(Plotly, ?${gd}, ?this\\.node\\.statistics, ?this\\.described\\);`)); }
});
