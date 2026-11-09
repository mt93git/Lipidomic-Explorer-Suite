import { describe, it, expect } from 'vitest';
import { renderDpr } from './retina';
import { imageKey } from './imageCache';

describe('Retina PNG cards (Phase 1 close: retina-timing)', () => {
  it('a live png card at >= 100 % zoom asks for min(2, devicePixelRatio)', () => {
    expect(renderDpr({ tier: 'live', zoom: 1, devicePixelRatio: 2 })).toBe(2);
    expect(renderDpr({ tier: 'live', zoom: 1.5, devicePixelRatio: 3 })).toBe(2);
    expect(renderDpr({ tier: 'live', zoom: 1, devicePixelRatio: 1 })).toBe(1);
  });
  it('the API accepts 1 or 2 only: fractional ratios round, never above 2 or below 1', () => {
    expect(renderDpr({ tier: 'live', zoom: 1, devicePixelRatio: 1.25 })).toBe(1);
    expect(renderDpr({ tier: 'live', zoom: 1, devicePixelRatio: 1.5 })).toBe(2);
    expect(renderDpr({ tier: 'live', zoom: 1, devicePixelRatio: 0.5 })).toBe(1);
    expect(renderDpr({ tier: 'live', zoom: 1, devicePixelRatio: Number.NaN })).toBe(1);
  });
  it('zoomed out, frozen, culled or prefetched cards stay at 1x', () => {
    expect(renderDpr({ tier: 'live', zoom: 0.99, devicePixelRatio: 2 })).toBe(1);
    expect(renderDpr({ tier: 'frozen', zoom: 1, devicePixelRatio: 2 })).toBe(1);
    expect(renderDpr({ tier: 'culled', zoom: 1, devicePixelRatio: 2 })).toBe(1);
    expect(renderDpr({ tier: undefined, zoom: 1, devicePixelRatio: 2 })).toBe(1);
    expect(renderDpr({ tier: 'live', zoom: 1, devicePixelRatio: 2, prefetch: true })).toBe(1);
    expect(renderDpr({ tier: 'live', zoom: undefined, devicePixelRatio: 2 })).toBe(1);
  });
  it('the image cache key keeps 1x and 2x apart and leaves 1x keys as before', () => {
    const base = { id: 'tcinstance_abc', inputs: { a: 1 }, width: 600, height: 400, revision: 'r1' };
    expect(imageKey({ ...base, dpr: 2 })).not.toBe(imageKey({ ...base, dpr: 1 }));
    expect(imageKey({ ...base, dpr: 1 })).toBe(imageKey(base));
    expect(imageKey({ ...base, dpr: 2 })).toContain('@2x');
  });
});
