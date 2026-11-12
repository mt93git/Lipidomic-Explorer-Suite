import { afterEach, expect, it, vi } from 'vitest';
import type { CardSchema } from '../../api';
import checkpoints from '../../mock/checkpoints.json';
import { hasPcaScore, pcaScoreSchema } from './PcaScoreSection';
// NEXO-P5: Team's PCA score analysis (R/results_dashboard.R rd_pca_score_ui) sits in the dashboard module, so the API
// gives every dashboard card its four inputs and its Run button; Team's inspector shows them under Statistics of a PCA card.
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
const schema = (): CardSchema => ({
  controls: ['color_by', 'pca_transform', 'pca_scale', 'violin_lipid', 'pcs_pc', 'pcs_groups', 'pcs_test', 'pcs_corr'].map(id => ({ id, type: 'select', label: id, group: id.startsWith('pcs_') ? 'PCA score analysis' : undefined })),
  actions: ['pcs_run'], actionControls: [{ id: 'pcs_run', label: 'Run PCA score analysis', tab: 'PCA score analysis' }], tabs: {},
});
it('the Statistics tab offers Team\'s PCA score controls and Run, in Team\'s order', () => {
  const shown = pcaScoreSchema(schema());
  expect(shown.controls.map(c => c.id)).toEqual(['pcs_pc', 'pcs_groups', 'pcs_test', 'pcs_corr']);
  expect(shown.actionControls?.map(a => a.id)).toEqual(['pcs_run']);
});
it('only dashboard PCA cards carry it', () => {
  expect(hasPcaScore('results_dashboard-plot_pca')).toBe(true);
  expect(hasPcaScore('results_dashboard-plot_violin')).toBe(false);
  expect(hasPcaScore('qc_pca_tab-pca2dPlot')).toBe(false);
  expect(hasPcaScore(undefined)).toBe(false);
});
it('the mock answers Team\'s status before Run, then the result of the chosen tests', async () => {
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {});
  const memory = new Map<string, string>(); vi.stubGlobal('sessionStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) });
  vi.resetModules();
  const api = await import('../../api');
  const id = (await api.openSession(checkpoints[0].id)).sessionId;
  const card = await api.createCard(id, 'results_dashboard-plot_pca', {});
  const before = await api.pcaScore(id, card.instanceId);
  expect(before.status).toBe('Choose the component, groups and tests, then run the analysis.');
  expect(before.figure).toBeNull();
  await api.updateCard(id, card.instanceId, {}, ['pcs_run']);
  const rank = await api.pcaScore(id, card.instanceId);
  expect(rank.status).toBeNull();
  expect(rank.report.map(r => r.text).join('\n')).toContain('Kruskal-Wallis');
  expect(rank.table?.rows).toHaveLength(3);
  expect(rank.figure?.data).toHaveLength(3);
  await api.updateCard(id, card.instanceId, { pcs_test: 'param' }, ['pcs_run']);
  expect((await api.pcaScore(id, card.instanceId)).report.map(r => r.text).join('\n')).toContain('One-way ANOVA');
});
