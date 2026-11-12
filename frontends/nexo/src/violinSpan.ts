/** FIX-PROD-H 2, as Team's www/team/js/violin_display.js (fit): every visible soft-span violin is drawn to
 *  min - 4 bw … max + 4 bw of its groups. Rendering extent only: Plotly's bandwidth, quartiles and points stay. */
type Group = { min: number; max: number; bandwidth: number };
type Drawn = { _fullData?: { type?: string; visible?: unknown; spanmode?: string }[]; calcdata?: Group[][] };
export function fitViolins(Plotly: { restyle(gd: HTMLElement, update: Record<string, unknown>, indices: number[]): Promise<unknown> }, gd: HTMLElement): Promise<boolean> {
  const { _fullData = [], calcdata } = gd as unknown as Drawn;
  if (!Array.isArray(calcdata)) return Promise.resolve(false);
  const indices: number[] = [], spans: number[][] = [];
  _fullData.forEach((trace, i) => {
    if (trace.type !== 'violin' || trace.visible === false || trace.visible === 'legendonly' || trace.spanmode !== 'soft') return;
    const groups = (calcdata[i] ?? []).filter(g => Number.isFinite(g.min) && Number.isFinite(g.max) && Number.isFinite(g.bandwidth) && g.bandwidth > 0);
    if (!groups.length) return;
    const lo = Math.min(...groups.map(g => g.min - 4 * g.bandwidth)), hi = Math.max(...groups.map(g => g.max + 4 * g.bandwidth));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return;
    indices.push(i); spans.push([lo, hi]);
  });
  if (!indices.length) return Promise.resolve(false);
  return Plotly.restyle(gd, { spanmode: 'manual', span: spans }, indices).then(() => true);
}
