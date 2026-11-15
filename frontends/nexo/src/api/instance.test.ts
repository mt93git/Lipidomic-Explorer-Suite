import { describe, expect, it } from 'vitest';
import { cardInstanceId } from './instance';
describe('cardInstanceId', () => {
  it('reads a checkpoint card, a card added in this session and a legacy dashboard node', () => {
    expect(cardInstanceId({ id: 'tcinstance_aaaaaaaaaaaa-plot_violin', instance: { id: 'tcinstance_aaaaaaaaaaaa', source: 'results_dashboard-plot_violin' } })).toBe('tcinstance_aaaaaaaaaaaa');
    expect(cardInstanceId({ id: 'tcinstance_bbbbbbbbbbbb-plot_violin', instance: { instanceId: 'tcinstance_bbbbbbbbbbbb', source: 'results_dashboard-plot_violin' } })).toBe('tcinstance_bbbbbbbbbbbb');
    expect(cardInstanceId({ id: 'results_dashboard-plot_violin' })).toBe('tcinstance_v0_violin');
    expect(cardInstanceId({ id: 'note' })).toBe('note');
  });
  it('reads Team instance ids and an older fixed family node as the server restores them', () => {
    expect(cardInstanceId({ id: 'tcinstance_mw45phge_6gwfo69f-pca2dPlot', instance: { id: 'tcinstance_mw45phge_6gwfo69f', source: 'qc_pca_tab-pca2dPlot' } })).toBe('tcinstance_mw45phge_6gwfo69f');
    expect(cardInstanceId({ id: 'logratio_tab-logratioPlot' })).toBe('tcinstance_fixed_logratio_tab_logratioplot');
    expect(cardInstanceId({ id: 'qc_pca_tab-load2dPlot' })).toBe('tcinstance_fixed_qc_pca_tab_load2dplot');
  });
});
