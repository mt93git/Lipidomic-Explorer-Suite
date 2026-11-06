import { describe, it, expect } from 'vitest';
import { tier } from './tiers';
const card = { x: 10, y: 10, width: 100, height: 100 };
const viewport = { x: 0, y: 0, width: 800, height: 600 };
describe('U3 render tiers', () => {
  it('in view at 100 % → live', () => expect(tier(card, viewport, 1, false, false)).toBe('live'));
  it('in view at 25 % → frozen', () => expect(tier(card, viewport, .25, false, false)).toBe('frozen'));
  it('out of view → culled', () => expect(tier({ ...card, x: 1200 }, viewport, 1, false, false)).toBe('culled'));
  it('selected in view at 60 % during no gesture → live', () => expect(tier(card, viewport, .6, true, false)).toBe('live'));
  it('in view at 100 % while gesturing → frozen', () => expect(tier(card, viewport, 1, false, true)).toBe('frozen'));
  it('card partially in the 200 px margin → not culled', () => expect(tier({ ...card, x: 950 }, viewport, 1, false, false)).not.toBe('culled'));
});
