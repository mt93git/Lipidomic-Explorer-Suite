import { describe, expect, it } from 'vitest';
// AAA (WCAG 1.4.6): every text/background token pair the shell uses is at least 7:1.
// Read from disk: vitest replaces imported CSS with an empty module. The specifier is a variable so the app's tsc needs no node types.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const token = (name: string) => { const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})`)); if (!m) throw new Error(`no --${name}`); return m[1]; };
const luminance = (hex: string) => {
  const h = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map(i => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [luminance(token(a)), luminance(token(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs: [string, string][] = [
  ['ink', 'paper'], ['ink', 'canvas'], ['muted', 'paper'], ['muted', 'canvas'], ['muted', 'tint'],
  ['accent', 'paper'], ['accent', 'canvas'], ['accent', 'tint'], ['paper', 'accent'], ['paper', 'navy'],
  ['amber-fg', 'amber-bg'], ['blue-fg', 'blue-bg'], ['red-fg', 'red-bg'], ['paper', 'toast-error'], ['paper', 'danger'], ['paper', 'green-strong'],
  // Row 14: the save pill's text in every state sits on the navy bar.
  ['pill-fg', 'navy'], ['pill-dirty', 'navy'], ['pill-saving', 'navy'], ['pill-error', 'navy'],
];
describe('colour tokens', () => {
  it.each(pairs)('%s on %s is at least 7:1', (fg, bg) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(7); });
});
