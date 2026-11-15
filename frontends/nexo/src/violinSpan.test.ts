// FIX-PROD-H 2: Team's www/team/js/violin_display.js extends every visible soft-span violin to min - 4 bw … max + 4 bw
// of its groups after each draw (restyle to spanmode 'manual'); Nexo drew Plotly's default soft span (2 bw), shorter
// tails. Rendering extent only: same bandwidth, quartiles and points. Synthetic two-group figure.
import { expect, it } from 'vitest';
import { fitViolins } from './violinSpan';
type Trace = { type: string; spanmode?: string; visible?: boolean | string };
function plot(fullData: Trace[], calcdata: { min: number; max: number; bandwidth: number }[][]) {
  const calls: unknown[][] = [];
  const Plotly = { restyle: async (...args: unknown[]) => { calls.push(args.slice(1)); } };
  const gd = { _fullData: fullData, calcdata } as unknown as HTMLElement;
  return { Plotly, gd, calls };
}
const groupA = { min: -1, max: 6, bandwidth: 0.5 }, groupB = { min: 0, max: 5, bandwidth: 0.25 };

it('a soft violin reaches 4 bandwidths past its groups', async () => {
  const { Plotly, gd, calls } = plot([{ type: 'violin', spanmode: 'soft' }], [[groupA, groupB]]);
  expect(await fitViolins(Plotly, gd)).toBe(true);
  expect(calls).toEqual([[{ spanmode: 'manual', span: [[-3, 8]] }, [0]]]);
});
it('each soft violin trace gets its own span', async () => {
  const { Plotly, gd, calls } = plot([{ type: 'violin', spanmode: 'soft' }, { type: 'violin', spanmode: 'soft' }], [[groupA], [groupB]]);
  await fitViolins(Plotly, gd);
  expect(calls).toEqual([[{ spanmode: 'manual', span: [[-3, 8], [-1, 6]] }, [0, 1]]]);
});
it('a hard or hidden violin and other traces stay as drawn', async () => {
  const { Plotly, gd, calls } = plot([{ type: 'violin', spanmode: 'hard' }, { type: 'violin', spanmode: 'soft', visible: 'legendonly' }, { type: 'scatter' }], [[groupA], [groupA], []]);
  expect(await fitViolins(Plotly, gd)).toBe(false);
  expect(calls).toEqual([]);
});
it('a group without a bandwidth is left out', async () => {
  const { Plotly, gd, calls } = plot([{ type: 'violin', spanmode: 'soft' }], [[{ min: 1, max: 1, bandwidth: 0 }]]);
  expect(await fitViolins(Plotly, gd)).toBe(false);
  expect(calls).toEqual([]);
});
// No Card harness in vitest (cardBodyMessage.test.ts reads the source the same way): every Plotly draw on a div fits.
it('cards fit violins after each newPlot and react', async () => {
  const fsName = 'node:fs', { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
  const src = readFileSync(new URL('./cards.ts', import.meta.url), 'utf8');
  const draws = src.match(/await Plotly(\.newPlot|\.react|\[reuse \? 'react' : 'newPlot'\])\((\w+)[^;]*;/g) ?? [];
  expect(draws.length).toBeGreaterThanOrEqual(3);
  for (const draw of draws) expect(src.slice(src.indexOf(draw) + draw.length, src.indexOf(draw) + draw.length + 60)).toMatch(/^\s*await fitViolins\(Plotly, ?\w+\);/);
});
it('a frozen card\'s off-screen snapshot fits violins before its image', async () => {
  const fsName = 'node:fs', { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
  const src = readFileSync(new URL('./cards.ts', import.meta.url), 'utf8');
  const snapshot = src.slice(src.indexOf('  private offscreenSnapshot('), src.indexOf('  /** The Group comparison card before'));
  expect(snapshot).toMatch(/fitViolins/);
});
it('the mock violin uses a soft span, as Team\'s figure does', async () => {
  const violin = (await import('./mock/violin.json')).default as { data: Trace[] };
  expect(violin.data.map(t => t.spanmode)).toEqual(['soft', 'soft']);
});
