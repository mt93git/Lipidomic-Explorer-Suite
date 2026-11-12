// Composition overview: a legend outside the bars, at the right, lists every visible class with a dot in its color, in the
// same order as the stack (top to bottom). Team draws it with an htmlwidgets onRender hook (R/results_dashboard.R
// rd_comp_label_js) that Nexo does not run; this is the same algorithm on Nexo's drawn plot. Presentation only: it reads
// the plotted values and never changes them. R leaves the right margin for it.
const PREFIX = 'team-bar-label:';
type Plot = { data?: any[]; layout?: any; _fullLayout?: any; on?: (event: string, f: () => void) => void };
const ours = (a: any) => !!a && typeof a.name === 'string' && a.name.indexOf(PREFIX) === 0;
const visibleBar = (t: any) => t && t.type === 'bar' && t.visible !== false && t.visible !== 'legendonly';

// Estimated width of "● name" in Arial (at most about 0.6 em a character); the gap between two legend columns.
const entryWidth = (name: string, size: number) => Math.ceil((name.length + 2) * size * 0.6), GAP = 8;
/** The legend annotations for a drawn plot and the right margin they need (`right`: the figure's own), or null while it
 *  is not laid out yet. */
export function compositionLabels(gd: Plot, right = 0): { labels: any[]; right: number } | null {
  const full = gd._fullLayout; if (!full || !full.xaxis || !full.yaxis || !full._size) return null;
  const cats = full.xaxis._categories || []; if (!cats.length) return { labels: [], right };
  const last = cats[cats.length - 1], h = full._size.h; if (!(h > 0)) return null;
  const items: { name: string; color: string }[] = [];
  for (const t of gd.data || []) {
    if (!visibleBar(t) || !Array.isArray(t.x) || !Array.isArray(t.y)) continue;
    const i = t.x.indexOf(last), v = Number(t.y[i]); if (i < 0 || !Number.isFinite(v) || v <= 0) continue;
    items.push({ name: String(t.name), color: t.marker && typeof t.marker.color === 'string' ? t.marker.color : '#52514e' });
  }
  if (!items.length) return { labels: [], right };
  // The last trace drawn is the top segment.
  items.reverse();
  // NEXO-P3: the rows never leave the plot area. Team's step (up to 17 px) when they fit, else tighter down to the font
  // height (9 px), else in columns, top to bottom then left to right. A line of text is about 1.3 font sizes tall around
  // its middle: `room` keeps 4 px for the half lines that pass the first and last step, `off` (whole px) moves the rows down.
  const n = items.length, room = h - 4;
  let cols = 1, rows = n, step = Math.min(17, room / n);
  if (step < 9) { cols = Math.ceil(n / Math.max(1, Math.floor(room / 9))); rows = Math.ceil(n / cols); step = Math.min(17, room / rows); }
  const fs = Math.max(9, Math.min(12, Math.round(step - 4))), off = Math.max(0, Math.ceil(0.65 * fs - step / 2)), text = (full.font && full.font.color) || '#52514e';
  // Each further column starts past the widest entry of the one before; the right margin grows by what they need.
  const widths = Array.from({ length: cols }, (_, c) => Math.max(...items.slice(c * rows, (c + 1) * rows).map(it => entryWidth(it.name, fs))));
  const wanted = right + widths.slice(1).reduce((sum, w) => sum + GAP + w, 0), plotWidth = full._size.w + Number(full.margin?.r ?? right) - wanted;
  const left = (c: number) => widths.slice(0, c).reduce((sum, w) => sum + w + GAP, 0);
  const labels = items.map((it, k) => { const c = Math.floor(k / rows), row = k % rows;
    return { name: PREFIX + it.name, xref: 'paper', yref: 'paper', x: c ? Math.round((1.02 + left(c) / plotWidth) * 10000) / 10000 : 1.02, y: Math.round((1 - (off + (row + 0.5) * step) / h) * 10000) / 10000, showarrow: false,
      text: '<span style="color:' + it.color + '">●</span> ' + it.name, xanchor: 'left', yanchor: 'middle', align: 'left', font: { size: fs, color: text }, captureevents: false }; });
  return { labels, right: wanted };
}

const sig = (list: any[]) => JSON.stringify(list.map(a => [a.name, a.y, a.text, a.x, a.font && a.font.size]));
const bound = new WeakSet<object>(), busy = new WeakSet<object>();
// The figure's own right margin, and the one the legend set last: a margin the legend did not set is the figure's.
const margins = new WeakMap<object, { own: number; set: number }>();
/** Draws the legend on a Composition overview (layout.meta.teamComposition) now and after every draw of that plot. */
export function bindCompositionLegend(Plotly: { relayout(gd: any, update: Record<string, unknown>): unknown }, plot: object): Promise<void> {
  const gd = plot as Plot;
  if (!gd.layout?.meta?.teamComposition) return Promise.resolve();
  const refresh = (): Promise<void> => {
    if (busy.has(gd) || !gd.layout) return Promise.resolve();
    const now = Number(gd.layout.margin?.r ?? gd._fullLayout?.margin?.r ?? 0), last = margins.get(gd), own = last && last.set === now ? last.own : now;
    const wanted = compositionLabels(gd, own); if (wanted === null) return Promise.resolve();
    if (sig((gd.layout.annotations || []).filter(ours)) === sig(wanted.labels) && wanted.right === now) return Promise.resolve();
    busy.add(gd); margins.set(gd, { own, set: wanted.right });
    const others = (gd.layout.annotations || []).filter((a: any) => !ours(a));
    const update: Record<string, unknown> = { annotations: others.concat(wanted.labels) }; if (wanted.right !== now) update['margin.r'] = wanted.right;
    return Promise.resolve(Plotly.relayout(gd, update)).catch(() => {}).then(() => { busy.delete(gd); });
  };
  if (!bound.has(gd) && gd.on) { bound.add(gd); gd.on('plotly_afterplot', () => { void refresh(); }); }
  return refresh();
}
