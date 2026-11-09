import { describe, expect, it } from 'vitest';
import catalog from './mock/catalog.json';
import { availability, groupCatalog, renderKindFor, groupOrder, withTimePoints } from './catalog';
import type { CatalogEntry } from './api/types';
const outputs = catalog.outputs as CatalogEntry[];
describe('catalog', () => {
  it('preserves Team group order and all 59 outputs', () => {
    const groups = groupCatalog(outputs);
    expect(groups.map(g => g.label)).toEqual(groupOrder);
    expect(groups.map(g => g.count)).toEqual([5,14,4,4,5,8,1,3,5,2,3,4,1]);
    expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(59);
  });
  it('uses plotly for dashboard outputs', () => expect(outputs.filter(e => e.family === 'results_dashboard').every(e => e.render === 'plotly')).toBe(true));
  it('uses png for heatmapPlot', () => expect(outputs.find(e => e.id === 'heatmap_barchart_tab-heatmapPlot')?.render).toBe('png'));
  it('requires confirmed design for differential outputs', () => {
    const entry = outputs.find(e => e.needs === 'de')!;
    expect(availability(entry, {allowed:false, confirmed:false, unit:null, type:null})).toBe('needs-design');
    expect(availability(entry, {allowed:true, confirmed:true, unit:'animal', type:'independent'})).toBe('add');
  });
  // Chart audit b09-fla: without a confirmed independent design Team's FLA circos draws only "requires a confirmed
  // independent study design" (R/frontends/team/inferential_network_adapter.R) and the FLA volcano has no p-values,
  // so it says "Please select target comparison groups"; the Library must ask for the design first, as for "de" rows.
  it('requires confirmed design for the functional-ratio volcano and circos', () => {
    for (const id of ['fla_tab-plotVolcano', 'fla_tab-plotCircos', 'structural_tab-networkPlot']) {
      const entry = outputs.find(e => e.id === id)!;
      expect(entry.needs, id).toBe('de');
      expect(availability(entry, {allowed:false, confirmed:false, unit:null, type:null})).toBe('needs-design');
    }
    expect(outputs.find(e => e.id === 'fla_tab-logratioPlot')!.needs ?? null).toBe(null);
  });
  it('opens time courses when Team reports two or more time points (deState.timepoints), as the API sends it', () => {
    // The real API answers design without timePointsReady; Team's own gate (team_canvas_timepoints_available) rides in deState.
    const entry = outputs.find(e => e.needs === 'time')!;
    const design = {allowed:false, confirmed:false, unit:null, type:null};
    expect(availability(entry, withTimePoints(design, {ready:false, design:false, gate:'design', timepoints:true}))).toBe('add');
    expect(availability(entry, withTimePoints(design, {ready:false, design:false, gate:'design', timepoints:false}))).toBe('needs-time');
    expect(availability(entry, withTimePoints(design, null))).toBe('needs-time');
    expect(availability(entry, withTimePoints({...design, timePointsReady:true}, null))).toBe('add');
    expect(withTimePoints(undefined, {timepoints:true})).toBeUndefined();
  });
  it('resolves instance output suffixes and legacy dashboard ids', () => {
    expect(renderKindFor('tcinstance_0123456789ab-heatmapPlot', outputs)).toBe('png');
    expect(renderKindFor('results_dashboard-plot_pca', outputs)).toBe('plotly');
  });
});
