import { afterEach, expect, it, vi } from 'vitest';
import type { CardSchema } from '../../api';
import checkpoints from '../../mock/checkpoints.json';
import { pcaScoreCard } from '../../catalog';
import { hasPcaScore, pcaScoreSchema, plotsOnCanvas } from './PcaScoreSection';
// NEXO-P5/P8: Team's PCA score analysis (R/results_dashboard.R rd_pca_score_ui) sits in the dashboard module. Since Team
// 8e2f5c07 the Statistics tab of a PCA card keeps its four controls and a "Plot on canvas" button (no Run), and the
// boxplot with the group table is a canvas card of its own (results_dashboard-plot_pcascore, www/team/js/canvas.js addPcaScore).
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
const schema = (): CardSchema => ({
  controls: ['color_by', 'pca_transform', 'pca_scale', 'violin_lipid', 'pcs_pc', 'pcs_groups', 'pcs_test', 'pcs_corr'].map(id => ({ id, type: 'select', label: id, group: id.startsWith('pcs_') ? 'PCA score analysis' : undefined })),
  actions: ['heat_reset'], actionControls: [{ id: 'heat_reset', label: 'Reset', tab: 'Heatmap' }], tabs: {},
});
it('the Statistics tab offers Team\'s four PCA score controls, in Team\'s order, and no module button', () => {
  const shown = pcaScoreSchema(schema());
  expect(shown.controls.map(c => c.id)).toEqual(['pcs_pc', 'pcs_groups', 'pcs_test', 'pcs_corr']);
  expect(shown.actionControls).toEqual([]);
});
it('PCA and PCA score cards carry it; Plot on canvas sits on the PCA card only', () => {
  expect(hasPcaScore('results_dashboard-plot_pca')).toBe(true);
  expect(hasPcaScore('results_dashboard-plot_pcascore')).toBe(true);
  expect(hasPcaScore('results_dashboard-plot_violin')).toBe(false);
  expect(hasPcaScore('qc_pca_tab-pca2dPlot')).toBe(false);
  expect(hasPcaScore(undefined)).toBe(false);
  expect(plotsOnCanvas('results_dashboard-plot_pca')).toBe(true);
  expect(plotsOnCanvas('results_dashboard-plot_pcascore')).toBe(false);
});
it('Plot on canvas: the PCA score card takes the PCA card\'s settings and Team\'s label', () => {
  const inputs = { color_by: 'Group1', pcs_pc: 'PC2', pcs_groups: ['Control', 'Case'], pcs_test: 'param', pcs_corr: 'holm' };
  const card = pcaScoreCard(inputs);
  expect(card).toEqual({ source: 'results_dashboard-plot_pcascore', inputs, label: 'PCA score analysis · PC2' });
  expect(card.inputs).not.toBe(inputs);
  expect(pcaScoreCard({}).label).toBe('PCA score analysis · PC1');
});
it('the mock answers the report of the chosen tests without Run, and draws the PCA score card with its group table', async () => {
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {});
  const memory = new Map<string, string>(); vi.stubGlobal('sessionStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) });
  vi.resetModules();
  const api = await import('../../api');
  const id = (await api.openSession(checkpoints[0].id)).sessionId;
  const card = await api.createCard(id, 'results_dashboard-plot_pca', {});
  expect((await api.pcaScore(id, card.instanceId)).report.map(r => r.text).join('\n')).toContain('Kruskal-Wallis');
  await api.updateCard(id, card.instanceId, { pcs_test: 'param' });
  expect((await api.pcaScore(id, card.instanceId)).report.map(r => r.text).join('\n')).toContain('One-way ANOVA');
  const score = await api.createCard(id, 'results_dashboard-plot_pcascore', { pcs_pc: 'PC2' });
  const figure = ((await api.renderCard(id, score.instanceId, 620, 700, 'auto')) as { figure: unknown }).figure as { data: { type: string; meta?: { teamLegendProxy?: boolean } }[]; layout: { annotations: { text: string }[] } };
  expect(figure.data.filter(t => t.type === 'box')).toHaveLength(3);
  expect(figure.data.filter(t => t.meta?.teamLegendProxy)).toHaveLength(3);
  expect(figure.layout.annotations.map(a => a.text)).toContain('<b>Median PC2</b>');
  expect((await api.pcaScore(id, score.instanceId)).report.length).toBeGreaterThan(0);
});
// Team eac6bb75: the group table's dots are round legend proxies (meta.teamLegendProxy) in each box series' legend
// group, so recolouring a series in the plot editor recolours its dot in the table (plot_editor.js syncLegendProxies).
it('the PCA score card\'s table dots follow the series colours set in the plot editor', async () => {
  const { mockPcaScoreFigure } = await import('../../mock/pcaScore');
  const { applyEditor, sourceKey } = await import('../../editor/applyEditor');
  const figure = mockPcaScoreFigure({ pcs_pc: 'PC1' }) as any, i = figure.data.findIndex((t: any) => t.type === 'box' && t.name === 'Case');
  const out = applyEditor(figure, { traces: [{ index: i, sourceKey: sourceKey(figure.data[i], figure.data), color: '#112233' }] } as any);
  expect(out.data[i].marker.color).toBe('#112233');
  expect(out.data.find((t: any) => t.meta?.teamLegendProxy && t.legendgroup === 'Case')?.marker.color).toBe('#112233');
  expect(out.data.find((t: any) => t.meta?.teamLegendProxy && t.legendgroup === 'Control')?.marker.color).toBe(figure.data.find((t: any) => t.name === 'Control')?.marker.color);
});
