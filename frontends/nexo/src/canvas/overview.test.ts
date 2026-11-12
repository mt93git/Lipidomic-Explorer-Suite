import { describe, expect, it } from 'vitest';
import { overviewCamera, refitOnResize, ZOOM_MIN } from './overview';
const view = { width: 1200, height: 800 };
const centre = (cam: { x: number; y: number; scale: number }, b: { x: number; y: number; width: number; height: number }) =>
  [cam.x + (b.x + b.width / 2) * cam.scale, cam.y + (b.y + b.height / 2) * cam.scale];
describe('overviewCamera (opening zoom and Fit)', () => {
  it('a board that fits opens at 100 %, centred', () => {
    const b = { x: 40, y: 40, width: 900, height: 500 }, cam = overviewCamera(view, b);
    expect(cam.scale).toBe(1); expect(centre(cam, b)).toEqual([600, 400]);
  });
  it('a large board opens lower so every card is in view', () => {
    const b = { x: 0, y: 0, width: 5000, height: 3000 }, cam = overviewCamera(view, b);
    expect(cam.scale).toBeCloseTo((1200 - 60) / 5000, 6);
    expect(cam.x).toBeCloseTo(30, 6); expect(cam.y).toBeGreaterThanOrEqual(30);
  });
  // FIX-PROD-A: a row of 20 cards far above a few others opened (and fitted) at 10 % on the empty middle, 4 cards in view.
  it('a board spread far apart frames every card, below the minimum zoom if it must', () => {
    const row = Array.from({ length: 20 }, (_, i) => ({ x: i * 900, y: -40000, width: 480, height: 360 }));
    const rest = [{ x: 0, y: 0, width: 480, height: 360 }, { x: 600, y: 0, width: 480, height: 360 }, { x: 0, y: 500, width: 480, height: 360 }];
    const cards = [...row, ...rest], x = Math.min(...cards.map(c => c.x)), y = Math.min(...cards.map(c => c.y));
    const b = { x, y, width: Math.max(...cards.map(c => c.x + c.width)) - x, height: Math.max(...cards.map(c => c.y + c.height)) - y };
    const cam = overviewCamera(view, b);
    expect(cam.scale).toBeLessThan(ZOOM_MIN);
    for (const c of cards) {
      const left = cam.x + c.x * cam.scale, top = cam.y + c.y * cam.scale;
      expect(left).toBeGreaterThanOrEqual(0); expect(top).toBeGreaterThanOrEqual(0);
      expect(left + c.width * cam.scale).toBeLessThanOrEqual(view.width); expect(top + c.height * cam.scale).toBeLessThanOrEqual(view.height);
    }
  });
  it('centres a board that does not start at the origin', () => {
    const b = { x: -3000, y: 9000, width: 800, height: 400 }, cam = overviewCamera(view, b);
    expect(cam.scale).toBe(1); expect(centre(cam, b)).toEqual([600, 400]);
  });
});
// FIX-JOINER-PHONE: a board fitted on opening at a desktop width kept 100 % when its viewport became a phone's (390 px),
// its only card off-screen to the right. The opening fit holds through a window resize until the person moves the camera.
describe('refitOnResize (the opening fit through a resize)', () => {
  const fitted = { camera: { x: 270, y: 120, scale: 1 }, view: { width: 1440, height: 900 } };
  it('a board still at its opening fit fits again when the window changes size', () => {
    expect(refitOnResize(fitted, { x: 270, y: 120, scale: 1 }, { width: 390, height: 844 })).toBe(true);
  });
  it('a camera the person moved keeps its place', () => {
    expect(refitOnResize(fitted, { x: 200, y: 120, scale: 1 }, { width: 390, height: 844 })).toBe(false);
  });
  it('the same size does not fit again', () => {
    expect(refitOnResize(fitted, { x: 270, y: 120, scale: 1 }, { width: 1440, height: 900 })).toBe(false);
  });
  it('a board not fitted yet waits for its opening fit', () => {
    expect(refitOnResize(null, { x: 24, y: 24, scale: 1 }, { width: 390, height: 844 })).toBe(false);
  });
});
