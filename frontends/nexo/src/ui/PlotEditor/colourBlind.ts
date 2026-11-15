// F7 colour-blind check: Machado, Oliveira & Fernandes 2009 matrices (severity 1.0) in linear RGB, CIE76 deltaE.
// Preview only: a CSS/SVG filter on the card element; nothing is saved, exported or put in history.
import type { Figure } from '../../editor/applyEditor';
export type Simulation = 'deuteranopia' | 'protanopia' | 'tritanopia' | 'greyscale';
type M = readonly (readonly [number, number, number])[];
export const CVD_MATRICES: Record<Simulation, M> = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  greyscale: [[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]],
};
export const SIMULATIONS = Object.keys(CVD_MATRICES) as Simulation[];
const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const hexOf = (v: number[]) => '#' + v.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
export function simulate(hex: string, kind: Simulation): string {
  const lin = rgb(hex).map(toLinear);
  return hexOf(CVD_MATRICES[kind].map(row => toSrgb(Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])))));
}
export function toLab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(toLinear);
  const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
  const [fx, fy, fz] = xyz.map(t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function deltaE(a: string, b: string): number { const x = toLab(a), y = toLab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
/** The SVG feColorMatrix values (4x5) for a simulation; the filter's default linearRGB space matches the matrices. */
export const filterValues = (kind: Simulation) => [...CVD_MATRICES[kind].map(r => [...r, 0, 0].join(' ')), '0 0 0 1 0'].join(' ');
export interface SeriesColour { name: string; color: string }
function normalise(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (/^#[\da-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(v)) return ('#' + [...v.slice(1)].map(c => c + c).join('')).toLowerCase();
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  return m ? hexOf(m.slice(1, 4).map(n => Math.min(255, Number(n)) / 255)) : null;
}
/** One colour per visible series with a single colour (continuous scales and per-point colours are skipped). */
export function seriesColours(figure: Figure): SeriesColour[] {
  const out: SeriesColour[] = [];
  figure.data.forEach((t, i) => {
    if (t.visible === false || t.visible === 'legendonly' || t.type === 'heatmap' || t.type === 'contour') return;
    const color = normalise(t.marker?.color) ?? normalise(t.line?.color) ?? normalise(t.fillcolor);
    const name = typeof t.name === 'string' && t.name ? t.name.replace(/<[^>]*>/g, '') : `Series ${i + 1}`;
    if (color && !out.some(s => s.name === name && s.color === color)) out.push({ name, color });
  });
  return out;
}
export type ColourReport = { ok: true } | { ok: false; few: true } | { ok: false; a: string; b: string; simulation: Simulation | 'normal'; deltaE: number };
/** Green when every pair has deltaE >= 15 under normal vision and each simulation; otherwise the closest pair. */
export function colourReport(colours: readonly SeriesColour[], threshold = 15): ColourReport {
  if (colours.length < 2) return { ok: false, few: true };
  let worst: Extract<ColourReport, { a: string }> | null = null;
  for (const sim of ['normal', ...SIMULATIONS] as const) for (let i = 0; i < colours.length; i++) for (let j = i + 1; j < colours.length; j++) {
    const f = (c: string) => sim === 'normal' ? c : simulate(c, sim), d = deltaE(f(colours[i].color), f(colours[j].color));
    if (!worst || d < worst.deltaE) worst = { ok: false, a: colours[i].name, b: colours[j].name, simulation: sim, deltaE: d };
  }
  return worst && worst.deltaE < threshold ? worst : { ok: true };
}
