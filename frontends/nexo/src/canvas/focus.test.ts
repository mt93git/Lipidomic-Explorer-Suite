import { describe, expect, it } from 'vitest';
import { focusCamera, FOCUS_BELOW } from './focus';
import { tier } from '../tiers';
const view = { width: 1000, height: 800 };
describe('focusCamera', () => {
  it('centres the card at the largest zoom that fits, up to 100 %', () => {
    const cam = focusCamera(view, { x: 0, y: 0, scale: 0.2 }, { x: 2000, y: 1000, width: 620, height: 720 });
    expect(cam.scale).toBeCloseTo((800 - 112) / 720, 5);
    expect(cam.x + (2000 + 310) * cam.scale).toBeCloseTo(500, 5);
    expect(cam.y + (1000 + 360) * cam.scale).toBeCloseTo(400, 5);
  });
  it('never zooms past 100 % for a small card', () => {
    expect(focusCamera(view, { x: 0, y: 0, scale: 0.2 }, { x: 0, y: 0, width: 300, height: 200 }).scale).toBe(1);
  });
  it('never zooms out: a card larger than the view keeps the current zoom', () => {
    expect(focusCamera(view, { x: 0, y: 0, scale: 0.3 }, { x: 0, y: 0, width: 4000, height: 4000 }).scale).toBe(0.3);
  });
  it('focuses only below a thumbnail zoom', () => { expect(FOCUS_BELOW).toBeGreaterThan(0.25); expect(FOCUS_BELOW).toBeLessThan(0.6); });
  // A click either reaches a live plot or focuses the card: no zoom band where it does neither.
  it('starts exactly where plots stop being live', () => {
    const card = { x: 10, y: 10, width: 100, height: 100 }, vp = { x: 0, y: 0, width: 1000, height: 800 };
    expect(tier(card, vp, FOCUS_BELOW - 0.001, false, false)).toBe('frozen');
    expect(tier(card, vp, FOCUS_BELOW, false, false)).toBe('live');
  });
});
