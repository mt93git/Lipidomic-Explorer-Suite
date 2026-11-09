import type { Catalog, CatalogEntry, Design, RenderKind } from './api/types';
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
export function renderKindFor(nodeId: string, catalog: CatalogEntry[] | Catalog): RenderKind {
  const outputs = Array.isArray(catalog) ? catalog : catalog.outputs;
  return outputs.find(e => e.id === nodeId || nodeId.endsWith(`-${e.output}`))?.render ?? 'plotly';
}
