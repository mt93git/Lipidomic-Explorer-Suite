import type { CardSchema } from '../../api';
/** The inputs each Team dashboard plot reads (R/results_dashboard.R). The API offers every dashboard card the module's
 * eleven inputs; Team's drawer shows color_by plus the plot's own keys (www/team/js/canvas.js:405-409), and the
 * composition and heatmap selections belong to those plots only. Other modules are left as the API sends them. */
const read: Record<string, string[]> = {
  pca: ['color_by', 'pca_transform', 'pca_scale'],
  violin: ['color_by', 'violin_lipid'],
  dist: ['color_by'],
  comp: ['color_by', 'comp_class_selection', 'comp_group_selection', 'comp_axis_mode'],
  heat: ['color_by', 'top_n', 'heat_group_selection', 'heat_lipid_selection', 'heat_significance'],
};
export function dashboardSchema(source: string, schema: CardSchema): CardSchema {
  const keys = read[/^results_dashboard-plot_(\w+)$/.exec(source)?.[1] ?? ''];
  return keys ? { ...schema, controls: schema.controls.filter(c => keys.includes(c.id)) } : schema;
}
