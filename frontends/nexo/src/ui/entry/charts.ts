// Plain-SVG chart pieces for the entry screens (no library): a linear scale, ticks and fixed group colours.
export const scale = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + (r1 - r0) * (v - d0) / ((d1 - d0) || 1);
export function ticks(min: number, max: number, step: number) {
  const out: number[] = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6); return out;
}
// Categorical hues in a fixed order (validated for colour-blind separation); a fifth group and beyond is gray, never a cycled hue.
const SERIES = ['#2a78d6', '#eb6834', '#1b9e77', '#9b59b6'], OTHER = '#9aa5b1';
export function groupColors(groups: string[]): Record<string, string> {
  const unique = [...new Set(groups)]; return Object.fromEntries(unique.map((g, i) => [g, SERIES[i] ?? OTHER]));
}
