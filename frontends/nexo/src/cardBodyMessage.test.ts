import { describe, expect, it } from 'vitest';
// Chart audit b02 round 2 (#3, pca2dVectorPlot/load2dVectorPlot): a failed render marks the card body `.message`
// (cards.ts, renderFailed + classList.add('message')), which pads it by var(--space-4) on each side (shell.css
// `.card .body.message`). Only the Retry button removed the class, so after the user fixed the input (smart labels off)
// the plot drew at node.height - CARD_CHROME inside a body 32 px shorter: layout 780x742 in a 780x710 div, x axis cut.
// Every redraw goes through setTier, which empties the body: it must also drop the message state.
// There is no DOM in this vitest setup and no Card harness, so the source is read from disk (as tokens.test.ts does);
// the browser proof is the audit's #3 overflow check and #5 "layout in div" note.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const src = readFileSync(new URL('./cards.ts', import.meta.url), 'utf8');

describe('card body message state', () => {
  const setTier = src.slice(src.indexOf('  setTier(next: Tier'), src.indexOf('  /** Fetch only data off screen'));
  it('finds setTier', () => { expect(setTier.length).toBeGreaterThan(200); });
  it('a failed render still marks the body as a message', () => { expect(src).toMatch(/renderFailed\(error\); this\.body\.classList\.add\('message'\)/); });
  it('setTier drops the message state when it empties the body for a new render', () => {
    const reset = setTier.indexOf('this.body.replaceChildren();');
    expect(reset).toBeGreaterThan(0);
    expect(setTier.slice(reset - 120, reset + 120)).toMatch(/this\.body\.classList\.remove\('message'\)/);
  });
});
