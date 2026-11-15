// Steph review 4b: the palette toast said "every plot" while one card redrew. Nexo now counts the cards a change
// actually redrew (their drawing changed), the ones that kept their colours, and the ones not drawn yet; the Data
// tab of a card that kept its colours says it uses its own. The API's palette response does not say which cards
// follow the palette, so this is derived on the client.
import { afterEach, describe, expect, it } from 'vitest';
import { followsSessionPalette, forgetPaletteRedraw, recordPaletteRedraw, startRedrawWatch, type DrawProbe } from './paletteRedraw';
import { paletteNoteKind } from '../ui/Inspector/paletteNote';
import { strings as s, phrases as p } from '../ui/strings';
function probe(id: string, sig: string | undefined, render?: { next: string | undefined; ticks: number }): DrawProbe & { start(): void; tick(): void } {
  let now = sig, left = -1;
  return { id, signature: () => now, busy: () => left > 0,
    start() { if (render) left = render.ticks; },
    tick() { if (left > 0 && --left === 0) now = render!.next; } };
}
afterEach(() => forgetPaletteRedraw());
describe('which cards a palette change redrew', () => {
  it('redrew = drawing changed; kept = drew again unchanged; later = not drawn again in time, or never drawn', async () => {
    const pca = probe('pca', 'a', { next: 'b', ticks: 2 }), violin = probe('violin', 'v', { next: 'v', ticks: 1 }),
      offscreen = probe('volcano', 'x'), slow = probe('slow', 's', { next: 't', ticks: 1000 }), fresh = probe('fresh', undefined, { next: 'n', ticks: 1 });
    const all = [pca, violin, offscreen, slow, fresh], watch = startRedrawWatch(all);
    all.forEach(c => c.start()); // the palette PATCH invalidates every drawn card: the ones on the board start drawing
    let clock = 0;
    const result = await watch.settle({ timeoutMs: 1000, now: () => clock, sleep: async ms => { clock += ms; all.forEach(c => c.tick()); } });
    expect(result).toEqual({ redrew: ['pca'], kept: ['violin'], later: ['volcano', 'slow', 'fresh'] });
  });
  it('remembers per card: redrew follows, kept does not; a card never checked falls back to the schema', () => {
    recordPaletteRedraw({ redrew: ['pca'], kept: ['violin'], later: ['volcano'] });
    expect(followsSessionPalette('pca', false)).toBe(true);
    expect(followsSessionPalette('violin', true)).toBe(false);
    expect(followsSessionPalette('volcano', true)).toBe(true);
    expect(followsSessionPalette('volcano', false)).toBe(false);
    forgetPaletteRedraw('violin'); expect(followsSessionPalette('violin', true)).toBe(true);
  });
});
describe('honest wording', () => {
  it('no palette string says the colours reach every plot', () => {
    for (const text of [s.paletteIntro, s.paletteUpdating, p.paletteApplied(1, 5, 0)]) expect(text).not.toMatch(/every plot|all plots/i);
    expect(s.paletteIntro).toMatch(/follow the session palette/);
  });
  it('the toast says how many cards redrew, N of M, and that plots with their own colour settings keep them', () => {
    expect(p.paletteApplied(1, 4, 0)).toBe('Session colours applied: 1 of 4 plots redrew. Plots with their own colour settings keep them.');
    expect(p.paletteApplied(2, 5, 2)).toBe('Session colours applied: 2 of 5 plots redrew (2 not drawn yet). Plots with their own colour settings keep them.');
  });
  it('the Data tab: palette-following cards say so; a card that does not follow says it uses its own colours', () => {
    const schema = { sessionPalette: true, controls: [] };
    expect(paletteNoteKind(schema, true)).toBe('follows');
    expect(paletteNoteKind(schema, false)).toBe('own');
    expect(paletteNoteKind({ sessionPalette: false, controls: [] }, false)).toBe('own');
    // The module's own per-group pickers are right there in the Data tab (cellular polar map): no note.
    expect(paletteNoteKind({ sessionPalette: true, controls: [{ id: 'customCol_Control', type: 'color', label: 'Control' }] } as never, true)).toBe(null);
    expect(s.paletteOwnColours).toBe('This plot uses its own colours (Appearance tab).');
    expect(s.paletteFollowsSession).toBe('Group colours and shapes follow the session palette.');
  });
});
