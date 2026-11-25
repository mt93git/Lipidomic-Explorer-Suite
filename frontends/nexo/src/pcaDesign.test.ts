import { describe, expect, it } from 'vitest';
import catalog from './mock/catalog.json';
import icons from './ui/Library/icons-map.json';
import { catalogEntryFor, groupCatalog, renderKindFor } from './catalog';
import { fromCanvasV1 } from './state/serialize';
import { nexoSource, PCA_ALIASES } from './pcaDesign';
import { dashboardSchema } from './ui/forms/dashboardControls';
import { model } from './figure/layout';
import { initialDocument } from './figure/model';
import type { CatalogEntry, CardSchema } from './api/types';
// Nexo always shows the frontend's PCA design: the dashboard "Principal components" card for the scores and the
// dashboard "PCA loadings" card for the loadings (R/frontends/team/results_dashboard.R plot_pca / plot_loadings).
// The Quality-check PCA cards are never offered, and a saved board holding one reopens it as the dashboard card
// (as the API does: frontends/nexo-api/catalog.R api_nexo_source).
const outputs = catalog.outputs as CatalogEntry[];
const qc = ['qc_pca_tab-pca2dPlot', 'qc_pca_tab-pca2dVectorPlot', 'qc_pca_tab-load2dPlot', 'qc_pca_tab-load2dVectorPlot'];
const loadings = 'results_dashboard-plot_loadings';
const entry = (id: string, group = 'Quality check'): CatalogEntry => ({ ...outputs[0], id, output: id.split('-')[1], group, family: id.split('-')[0] });

describe('PCA in our design', () => {
  it('maps the four QC PCA sources to the dashboard scores and loadings cards', () => {
    expect(qc.map(nexoSource)).toEqual(['results_dashboard-plot_pca', 'results_dashboard-plot_pca', loadings, loadings]);
    expect(nexoSource('qc_pca_tab-pca3dPlot')).toBe('qc_pca_tab-pca3dPlot');
    expect(Object.keys(PCA_ALIASES).sort()).toEqual([...qc].sort());
  });
  it('the Library never lists the QC PCA cards, even if a catalog still carries them, and lists PCA loadings', () => {
    const withQc = [...outputs, ...qc.map(id => entry(id))];
    const listed = groupCatalog(withQc).flatMap(g => g.entries.map(e => e.id));
    for (const id of qc) expect(listed).not.toContain(id);
    expect(groupCatalog(outputs).find(g => g.label === 'Dashboard')!.entries.map(e => e.id)).toContain(loadings);
  });
  it('the mock catalog mirrors the API: no QC PCA card, a plotly PCA loadings card in Dashboard with its icon', () => {
    for (const id of qc) expect(outputs.find(e => e.id === id), id).toBeUndefined();
    const l = outputs.find(e => e.id === loadings)!;
    expect(l && { label: l.label, group: l.group, render: l.render, family: l.family, output: l.output, description: l.description })
      .toEqual({ label: 'PCA loadings', group: 'Dashboard', render: 'plotly', family: 'results_dashboard', output: 'plot_loadings', description: 'See which lipids drive the principal components.' });
    const map = (icons as { outputs: Record<string, string> }).outputs;
    expect(map[loadings]).toBe('nx-loadings');
    for (const id of qc) expect(map[id], id).toBeUndefined();
  });
  it('a saved QC PCA node finds the dashboard entry, and draws as Plotly', () => {
    const node = { id: 'tcinstance_abc-pca2dPlot', instance: { id: 'tcinstance_abc', source: 'qc_pca_tab-pca2dPlot', inputs: {} } };
    expect(catalogEntryFor(node, outputs)?.id).toBe('results_dashboard-plot_pca');
    expect(catalogEntryFor({ id: 'qc_pca_tab-load2dPlot' }, outputs)?.id).toBe(loadings);
    expect(renderKindFor({ id: 'qc_pca_tab-load2dPlot' }, outputs)).toBe('plotly');
  });
  it('fromCanvasV1 reopens the four QC cards as our cards, same place and size, references renamed, QC inputs dropped', () => {
    const plot = (id: string, x: number, instance?: { id: string; source: string; inputs: Record<string, string | number> }) =>
      ({ kind: 'plot', id, label: id, x, y: 20, width: 600 + x / 100, height: 500, visual: { plotTitle: 'Kept' }, finished: null, ...(instance ? { instance } : {}) });
    const state = { version: '1', libraryHidden: false, nodes: [
      plot('tcinstance_a-pca2dPlot', 0, { id: 'tcinstance_a', source: 'qc_pca_tab-pca2dPlot', inputs: { scoreMarkerSize2D: 9 } }),
      plot('tcinstance_b-pca2dVectorPlot', 700, { id: 'tcinstance_b', source: 'qc_pca_tab-pca2dVectorPlot', inputs: {} }),
      plot('tcinstance_c-load2dVectorPlot', 1400, { id: 'tcinstance_c', source: 'qc_pca_tab-load2dVectorPlot', inputs: {} }),
      plot('qc_pca_tab-load2dPlot', 2100),
      plot('tcinstance_d-plot_violin', 2800, { id: 'tcinstance_d', source: 'results_dashboard-plot_violin', inputs: { violin_lipid: 'PC 34:1' } }),
    ], document: null,
      tabs: { version: '1', active: 'tab-1', tabs: [{ id: 'tab-1', name: 'Canvas 1', nodes: ['tcinstance_a-pca2dPlot', 'tcinstance_b-pca2dVectorPlot', 'tcinstance_c-load2dVectorPlot', 'qc_pca_tab-load2dPlot', 'tcinstance_d-plot_violin'] }],
        figure: { deselected: ['qc_pca_tab-load2dPlot'], order: ['tcinstance_c-load2dVectorPlot', 'tcinstance_a-pca2dPlot'] } } };
    const opened = fromCanvasV1(state);
    expect(opened.nodes.map(n => [n.id, n.instance?.source, n.x, n.y, n.width, n.height])).toEqual([
      ['tcinstance_a-plot_pca', 'results_dashboard-plot_pca', 0, 20, 600, 500],
      ['tcinstance_b-plot_pca', 'results_dashboard-plot_pca', 700, 20, 607, 500],
      ['tcinstance_c-plot_loadings', loadings, 1400, 20, 614, 500],
      ['tcinstance_fixed_qc_pca_tab_load2dplot-plot_loadings', loadings, 2100, 20, 621, 500],
      ['tcinstance_d-plot_violin', 'results_dashboard-plot_violin', 2800, 20, 628, 500],
    ]);
    expect(opened.nodes[0].instance).toEqual({ id: 'tcinstance_a', source: 'results_dashboard-plot_pca', inputs: {} });
    expect(opened.nodes[3].instance).toEqual({ id: 'tcinstance_fixed_qc_pca_tab_load2dplot', source: loadings, inputs: {} });
    expect(opened.nodes[4].instance?.inputs).toEqual({ violin_lipid: 'PC 34:1' });
    expect(opened.nodes[0].visual).toEqual({ plotTitle: 'Kept' });
    expect(opened.tabs.tabs[0].nodes).toEqual(opened.nodes.map(n => n.id));
    expect(opened.tabs.figure).toEqual({ deselected: ['tcinstance_fixed_qc_pca_tab_load2dplot-plot_loadings'], order: ['tcinstance_c-plot_loadings', 'tcinstance_a-plot_pca'] });
  });
  it('fromCanvasV1 renames a figure page panel that showed a QC PCA card', () => {
    const doc = { ...initialDocument(), layout: 'free' as const, items: [{ id: 'item-1', type: 'figure' as const, nodeId: 'tcinstance_a-pca2dPlot', caption: 'B', x: 10, y: 10, width: 200, height: 200, z: 1 }] };
    const state = { version: '1', libraryHidden: false, document: doc, nodes: [{ kind: 'plot', id: 'tcinstance_a-pca2dPlot', label: 'PCA', x: 0, y: 0, width: 600, height: 500, visual: {}, finished: null,
      instance: { id: 'tcinstance_a', source: 'qc_pca_tab-pca2dPlot', inputs: {} } }] };
    const opened = fromCanvasV1(state);
    expect((opened.document!.items[0] as { nodeId: string }).nodeId).toBe('tcinstance_a-plot_pca');
  });
  it('the loadings card shows the PCA controls of the scores card (Team: canvas.js compactDashboardControls)', () => {
    const ids = ['color_by', 'pca_transform', 'pca_scale', 'top_n'];
    const schema: CardSchema = { controls: ids.map(id => ({ id, type: 'select', label: id })), actions: [], tabs: {} } as unknown as CardSchema;
    expect(dashboardSchema(loadings, schema).controls.map(c => c.id)).toEqual(['pca_transform', 'pca_scale']);
  });
  it('figure 1 panel B prefers a dashboard PCA copy over a QC copy', () => {
    const node = (id: string, source: string) => ({ id, kind: 'plot' as const, label: id, x: 0, y: 0, width: 300, height: 300, instance: { instanceId: id.split('-')[0], source } });
    const qcCopy = node('tcinstance_q-pca2dPlot', 'qc_pca_tab-pca2dPlot'), ours = node('tcinstance_o-plot_pca', 'results_dashboard-plot_pca');
    const b = (nodes: ReturnType<typeof node>[]) => model({ ...initialDocument(), layout: 'figure1' }, nodes)[0].items.find(i => i.caption?.startsWith('B / PCA'))!;
    expect(b([qcCopy, ours]).node?.id).toBe('tcinstance_o-plot_pca');
    expect(b([qcCopy]).node?.id).toBe('tcinstance_q-pca2dPlot');
  });
});
