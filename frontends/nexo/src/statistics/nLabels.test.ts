// FIX-PROD-H 3: Team's canvas_statistics.js asks the server to describe every violin card (group counts) and draws
// "n = <count> sample(s)" under each group from that answer whenever nDisplay is not 'hidden', even with no statistics
// applied (draw(): groups = describe.groups; spec when show || groups.length && nDisplay !== 'hidden'). Nexo drew nothing.
import { expect, it } from 'vitest';
import { applyStatisticsToFigure } from './annotations';
import { DEFAULT_PRESENTATION } from './settings';
const figure = { data: [{ type: 'violin', x: ['Alpha', 'Alpha', 'Beta', 'Beta'], y: [1, 3, 2, 6] }], layout: {} };
const groups = [{ group: 'Alpha', nSamples: 16, nExcluded: 0, nParticipants: null }, { group: 'Beta', nSamples: 1, nExcluded: 0, nParticipants: null }];
const saved = { presentation: { ...DEFAULT_PRESENTATION, show: true, nDisplay: 'samples' as const }, applied: null, result: null };
const labels = (f: { layout: Record<string, unknown> }) => (f.layout.annotations as { name?: string }[] ?? []).filter(a => a.name?.startsWith('tcstat-n-'));

it('described groups get "n = … samples" under each group with no statistics applied', () => {
  expect(labels(applyStatisticsToFigure(figure, saved, groups))).toEqual([
    { name: 'tcstat-n-0', xref: 'x', yref: 'y', x: 0, y: 1, yanchor: 'top', showarrow: false, text: 'n = 16 samples', font: { size: 11, color: '#526477' }, bgcolor: 'rgba(255,255,255,0.94)', borderpad: 2 },
    { name: 'tcstat-n-1', xref: 'x', yref: 'y', x: 1, y: 1, yanchor: 'top', showarrow: false, text: 'n = 1 sample', font: { size: 11, color: '#526477' }, bgcolor: 'rgba(255,255,255,0.94)', borderpad: 2 },
  ]);
});
it('a violin card without saved statistics shows the labels, as Team\'s default presentation', () => {
  expect(labels(applyStatisticsToFigure(figure, null, groups)).map(a => (a as { text?: string }).text)).toEqual(['n = 16 samples', 'n = 1 sample']);
});
it('hidden group size labels stay hidden', () => {
  expect(labels(applyStatisticsToFigure(figure, { ...saved, presentation: { ...saved.presentation, nDisplay: 'hidden' } }, groups))).toEqual([]);
});
it('without described groups nothing is drawn', () => {
  expect(labels(applyStatisticsToFigure(figure, saved))).toEqual([]);
});
// No Card harness in vitest (cardBodyMessage.test.ts reads the source the same way).
it('a violin card asks for its group counts and draws them', async () => {
  const fsName = 'node:fs', { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
  const src = readFileSync(new URL('../cards.ts', import.meta.url), 'utf8');
  expect(src).toMatch(/violinStatistics\(this\.session\.sessionId, ?[^,]+, ?\{ ?mode: ?'describe' ?\}\)/);
  const draws = src.match(/applyStatisticsToFigure\([^;]*?this\.node\.statistics[^;]*?\)/g) ?? [];
  expect(draws.length).toBe(3);
  for (const draw of draws) expect(draw).toMatch(/this\.node\.statistics, ?this\.described\)$/);
});

// NEXO-P6 item 4: Team attaches violin statistics (describe, n labels) only to a card record with an instance of the
// dashboard violin (www/team/js/canvas.js: `r.instance && TeamCanvasStatistics.supports(r.instance.source)`). A board's
// fixed "Violin plots" view (node id results_dashboard-plot_violin, no instance) shows no n labels in Team.
it('only an instance copy of the dashboard violin is described (gets n labels), as in Team', async () => {
  const { describesGroups } = await import('./result');
  expect([
    describesGroups({ id: 'tcinstance_0123456789ac-plot_violin', instance: { source: 'results_dashboard-plot_violin' } }),
    describesGroups({ id: 'results_dashboard-plot_violin' }),
    describesGroups({ id: 'tcinstance_0123456789ad-plot_pca', instance: { source: 'results_dashboard-plot_pca' } }),
  ]).toEqual([true, false, false]);
});
