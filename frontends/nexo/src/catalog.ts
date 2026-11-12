import type { Catalog, CatalogEntry, Design, Node, RenderKind } from './api/types';
export const groupOrder = ['Dashboard', 'Quality check', 'Composition', 'Differential', 'Heatmaps', 'Structure', 'Group comparison', 'Distributions & ratios', 'Longitudinal', 'Pathways', 'Cellular organization', 'Cell comparisons', 'Export studio'];
export function groupCatalog(outputs: CatalogEntry[]) {
  return groupOrder.map(label => { const entries = outputs.filter(e => e.group === label || label === 'Differential' && e.group === 'Differential analysis'); return {label, entries, count:entries.length}; });
}
export const availabilityReasons = {
  'needs-design': 'Needs a confirmed study design',
  'needs-time': 'Time courses need at least two TimePoint values in the sample metadata. Without them nothing can be drawn; with them, check the time-course settings in Data & settings.',
  unavailable: 'Not available for a paired design',
  add: ''
};
/** The API answers the study design without timePointsReady; Team's own time-point gate
 * (team_canvas_timepoints_available: two or more real TimePoint values) rides in deState.timepoints. */
export function withTimePoints<T extends Design | undefined>(design: T, deState: unknown): T {
  if (!design || design.timePointsReady) return design;
  const ready = !!deState && typeof deState === 'object' && (deState as { timepoints?: unknown }).timepoints === true;
  return (ready ? { ...design, timePointsReady: true } : design) as T;
}
export function availability(entry: CatalogEntry, design?: Design): keyof typeof availabilityReasons {
  if (entry.needs === 'de' && !design?.allowed) return design?.confirmed ? 'unavailable' : 'needs-design';
  if (entry.needs === 'time' && !design?.timePointsReady) return 'needs-time';
  return 'add';
}
/** A card's catalog entry: the exact id of its Team instance source (or of the node), else the output suffix of an
 * older node when only one entry has that output (two Team cards end in -heatmapPlot, two in -logratioPlot). */
export function catalogEntryFor(node: Pick<Node, 'id' | 'instance'>, outputs: CatalogEntry[]): CatalogEntry | undefined {
  const exact = outputs.find(e => e.id === (node.instance?.source ?? node.id)) ?? outputs.find(e => e.id === node.id);
  if (exact) return exact;
  const bySuffix = outputs.filter(e => node.id.endsWith(`-${e.output}`));
  return bySuffix.length === 1 ? bySuffix[0] : undefined;
}
export function renderKindFor(node: Pick<Node, 'id' | 'instance'>, catalog: CatalogEntry[] | Catalog): RenderKind {
  return catalogEntryFor(node, Array.isArray(catalog) ? catalog : catalog.outputs)?.render ?? 'plotly';
}
/** The size a new card opens at. A Composition overview opens 560 px tall, as Team's (www/team/js/canvas.js newCardSize,
 *  compact shell); saved cards keep their saved size. */
/** Team's "Plot on canvas" (www/team/js/canvas.js addPcaScore): the PCA score card takes the PCA card's inputs and its label names the component. */
export const pcaScoreCard = (inputs: Record<string, unknown>) => ({source: 'results_dashboard-plot_pcascore', inputs: structuredClone(inputs), label: `PCA score analysis · ${String(inputs.pcs_pc ?? 'PC1')}`});
export const newCardSize = (entry: CatalogEntry) => entry.id === 'results_dashboard-plot_comp' ? { ...entry.defaultSize, height: 560 } : entry.defaultSize;
