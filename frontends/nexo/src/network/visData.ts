// Team's visNetwork widget payload (the R htmlwidget's `x`, as the API returns it) → vis-network's own input.
// R sends data frames column by column, with nested options flattened to dotted names ("color.background");
// the visNetwork binding rebuilds one object per row. Missing values (null) are left out, as R's NA.
type Columns = Record<string, unknown>;
export interface VisWidget {
  nodes?: Columns | Record<string, unknown>[] | null; edges?: Columns | Record<string, unknown>[] | null;
  options?: Record<string, unknown> | null;
}
function setPath(target: Record<string, unknown>, path: string[], value: unknown) {
  let at = target;
  for (const key of path.slice(0, -1)) at = (at[key] && typeof at[key] === 'object' ? at[key] : (at[key] = {})) as Record<string, unknown>;
  at[path[path.length - 1]] = value;
}
export function rows(data: VisWidget['nodes']): Record<string, unknown>[] {
  if (!data) return [];
  const expand = (row: Record<string, unknown>) => { const out: Record<string, unknown> = {}; for (const [k, v] of Object.entries(row)) if (v != null) setPath(out, k.split('.'), v); return out; };
  if (Array.isArray(data)) return data.map(expand);
  const keys = Object.keys(data), n = Math.max(0, ...keys.map(k => Array.isArray(data[k]) ? (data[k] as unknown[]).length : 1));
  return Array.from({ length: n }, (_, i) => expand(Object.fromEntries(keys.map(k => [k, Array.isArray(data[k]) ? (data[k] as unknown[])[i] : data[k]]))));
}
/**
 * Team's options, adapted where the canvas owns the gesture (Nexo v0 wins): the wheel zooms the canvas, not the
 * network (its navigation buttons still zoom it), and the arrow keys move cards (vis binds them to the window).
 * The card redraws the network when it is resized, so vis does not watch its container (WebKit logged a
 * ResizeObserver loop).
 */
export function networkOptions(options: VisWidget['options']): Record<string, unknown> {
  const out = structuredClone(options ?? {}) as Record<string, unknown>;
  const interaction = { ...(out.interaction as Record<string, unknown> | undefined), zoomView: false, keyboard: false };
  return { ...out, width: '100%', height: '100%', autoResize: false, interaction };
}
export function networkData(widget: VisWidget) { return { nodes: rows(widget.nodes), edges: rows(widget.edges), options: networkOptions(widget.options) }; }
