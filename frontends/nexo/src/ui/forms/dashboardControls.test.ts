import { expect, it } from 'vitest';
import type { CardSchema } from '../../api';
import { dashboardSchema } from './dashboardControls';
// The API gives every results_dashboard card the module's eleven inputs (catalog allowedInputs). Each plot reads only
// some of them (R/results_dashboard.R); Team's drawer shows color_by plus the plot's own keys (www/team/js/canvas.js:405-409).
const ids = ['color_by','pca_transform','pca_scale','top_n','heat_group_selection','heat_lipid_selection','comp_class_selection','violin_lipid','heat_significance','comp_group_selection','comp_axis_mode'];
const schema = (): CardSchema => ({ controls: ids.map(id => ({ id, type: 'select', label: id })), actions: [], tabs: {} });
const shown = (source: string) => dashboardSchema(source, schema()).controls.map(c => c.id);
it('shows on each dashboard plot only the inputs that plot reads', () => {
  expect(shown('results_dashboard-plot_pca')).toEqual(['color_by','pca_transform','pca_scale']);
  expect(shown('results_dashboard-plot_violin')).toEqual(['color_by','violin_lipid']);
  expect(shown('results_dashboard-plot_dist')).toEqual(['color_by']);
  expect(shown('results_dashboard-plot_comp')).toEqual(['color_by','comp_class_selection','comp_group_selection','comp_axis_mode']);
  expect(shown('results_dashboard-plot_heat')).toEqual(['color_by','top_n','heat_group_selection','heat_lipid_selection','heat_significance']);
});
it('leaves other modules and their buttons untouched', () => {
  const s = { ...schema(), actionControls: [{ id: 'go', label: 'Go', tab: null }] };
  expect(dashboardSchema('qc_pca_tab-pca2dPlot', s)).toEqual(s);
  expect(dashboardSchema('results_dashboard-plot_pca', s).actionControls).toEqual(s.actionControls);
});
