// Pure pieces of the Diagnostics figures (no React): scales, the d_eff colour ramp, the continuous
// landscape of Shin et al. 2025 Fig. 4d and the layout of the regulatory network (Fig. 3c).
import type { Attractor, NetworkNode } from '../../api/diagnostics';

export const scale = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + (r1 - r0) * (v - d0) / ((d1 - d0) || 1);
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export function extent(values: number[], pad = 0.05): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 1];
  let lo = Math.min(...finite), hi = Math.max(...finite);
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  const span = hi - lo; return [lo - span * pad, hi + span * pad];
}
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / Math.max(1, count), mag = 10 ** Math.floor(Math.log10(raw || 1)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6); return out;
}

// Reference (d = 0) teal to target (d = 1) coral, through a light middle, as in the paper's panels.
const RAMP: [number, number, number][] = [[31, 158, 160], [148, 196, 190], [236, 214, 170], [232, 140, 112], [214, 82, 72]];
export function rampColor(t: number): string {
  const x = clamp(t) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  const c = RAMP[i].map((v, k) => Math.round(v + (RAMP[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// Sequential (entropy): pale to deep blue-violet.
export function entropyColor(t: number): string {
  const a = [222, 235, 247], b = [74, 52, 140], x = clamp(t);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * x)).join(',')})`;
}
const SERIES = ['#2a78d6', '#eb6834', '#1b9e77', '#9b59b6', '#c49a00', '#d6457a'], OTHER = '#9aa5b1';
export function groupColors(groups: string[]): Record<string, string> {
  return Object.fromEntries([...new Set(groups)].map((g, i) => [g, SERIES[i] ?? OTHER]));
}

/** Fig. 4d: each attractor is a Gaussian well centred on its effective distance, as deep as Smax - S_k and as wide as
 *  its basin (the paper's f(x) = -S e^{-x^2/B^2}); the surface is the deepest well at each x. */
export function wellWidth(basin: number) { return 0.025 + 0.13 * Math.sqrt(clamp(basin)); }
export function landscapeCurve(attractors: Pick<Attractor, 'deff' | 'entropy' | 'basin'>[], smax: number, from = -0.15, to = 1.15, points = 240) {
  return Array.from({ length: points + 1 }, (_, i) => {
    const x = from + (to - from) * i / points;
    const dip = Math.max(0, ...attractors.map(a => (smax - a.entropy) * Math.exp(-((x - a.deff) ** 2) / wellWidth(a.basin) ** 2)));
    return { x, y: smax - dip };
  });
}

/** Fig. 3c layout: the engine's Fruchterman-Reingold coordinates fitted into the box with a margin. */
export function fitLayout(nodes: Pick<NetworkNode, 'id' | 'x' | 'y'>[], width: number, height: number, margin = 40) {
  const [x0, x1] = extent(nodes.map(n => n.x), 0), [y0, y1] = extent(nodes.map(n => n.y), 0);
  const sx = scale(x0, x1, margin, width - margin), sy = scale(y0, y1, margin, height - margin);
  return Object.fromEntries(nodes.map(n => [n.id, { x: sx(n.x), y: sy(n.y) }])) as Record<number, { x: number; y: number }>;
}
/** An edge from a to b shortened to the node circles, bent when the reverse edge exists. */
export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, r: number, bent: boolean) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const bend = bent ? 0.18 * len : 0, mx = (a.x + b.x) / 2 - uy * bend, my = (a.y + b.y) / 2 + ux * bend;
  const sa = Math.atan2(my - a.y, mx - a.x), eb = Math.atan2(b.y - my, b.x - mx);
  const sx = a.x + Math.cos(sa) * r, sy = a.y + Math.sin(sa) * r, ex = b.x - Math.cos(eb) * (r + 2), ey = b.y - Math.sin(eb) * (r + 2);
  return { d: `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`, end: { x: ex, y: ey }, angle: eb };
}

/** Binned mean of y over x (the smooth line of Fig. 4b, right). */
export function binnedMean(points: { x: number; y: number }[], bins = 10) {
  const [lo, hi] = extent(points.map(p => p.x), 0), width = (hi - lo) / bins || 1;
  return Array.from({ length: bins }, (_, i) => {
    const inBin = points.filter(p => p.x >= lo + i * width && (i === bins - 1 ? p.x <= hi : p.x < lo + (i + 1) * width));
    return inBin.length ? { x: lo + (i + 0.5) * width, y: inBin.reduce((s, p) => s + p.y, 0) / inBin.length } : null;
  }).filter((p): p is { x: number; y: number } => p !== null);
}

export const fmtP = (p: number | null | undefined) => p == null || !Number.isFinite(p) ? '—' : p < 0.001 ? p.toExponential(1) : p.toFixed(3);
/** Lipid names lose their adduct suffix on the figures (TAG(51:1_FA18:1)+NH4 -> TAG(51:1_FA18:1)). */
export const shortName = (name: string) => name.replace(/[+-](H|NH4|2H|Na|HCOO|CH3COO|K)$/, '').replace(/\)[+-].*$/, ')');
/** "LIPID_0" / "LIPID_1": the perturbation id, as the paper writes knockdown (0) and overexpression (1). */
export const perturbationLabel = (id: string) => { const m = /^(.*)_([01])$/.exec(id); return m ? `${shortName(m[1])} = ${m[2] === '0' ? 'low' : 'high'}` : id; };
