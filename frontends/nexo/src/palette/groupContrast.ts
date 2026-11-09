// Steph review 7c: two groups of one grouping in nearly the same colour (Control #0055aa beside Treatment's blue).
// The session palette warns, without blocking the change. Pure: CIELAB (sRGB, D65) and CIEDE2000.
export type Lab = [number, number, number];
const linear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const f = (t: number) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
/** sRGB #RRGGBB to CIELAB under D65 (the reference white of sRGB). */
export function hexToLab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map(i => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI;
const hue = (b: number, a: number) => a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360;
/** CIEDE2000 colour difference (kL = kC = kH = 1), as in Sharma, Wu and Dalal (2005). */
export function ciede2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1, a2p = (1 + g) * a2, c1p = Math.hypot(a1p, b1), c2p = Math.hypot(a2p, b2);
  const h1p = hue(b1, a1p), h2p = hue(b2, a2p), zero = c1p * c2p === 0;
  let dh = zero ? 0 : h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = l2 - l1, dC = c2p - c1p, dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dh / 2));
  const lBar = (l1 + l2) / 2, cBarP = (c1p + c2p) / 2;
  const hBar = zero ? h1p + h2p : Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const t = 1 - 0.17 * Math.cos(rad(hBar - 30)) + 0.24 * Math.cos(rad(2 * hBar)) + 0.32 * Math.cos(rad(3 * hBar + 6)) - 0.20 * Math.cos(rad(4 * hBar - 63));
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2)), rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + 0.015 * (lBar - 50) ** 2 / Math.sqrt(20 + (lBar - 50) ** 2), sc = 1 + 0.045 * cBarP, sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}
const valid = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex);
/** True when two colours are hard to tell apart: CIEDE2000 < 20, or hue within 25° with both chroma > 20. */
export function hardToTellApart(a: string, b: string): boolean {
  if (!valid(a) || !valid(b)) return false;
  const la = hexToLab(a), lb = hexToLab(b);
  if (ciede2000(la, lb) < 20) return true;
  const ca = Math.hypot(la[1], la[2]), cb = Math.hypot(lb[1], lb[2]);
  if (ca <= 20 || cb <= 20) return false;
  const d = Math.abs(hue(la[2], la[1]) - hue(lb[2], lb[1]));
  return Math.min(d, 360 - d) < 25;
}
/** Every pair of groups (in the given order) whose colours are hard to tell apart. */
export function similarGroups(groups: { name: string; color: string }[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++)
    if (hardToTellApart(groups[i].color, groups[j].color)) out.push([groups[i].name, groups[j].name]);
  return out;
}
