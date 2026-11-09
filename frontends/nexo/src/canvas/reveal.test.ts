import { describe, expect, it } from 'vitest';
import { fitScale, revealCamera, revealAddedCamera } from './reveal';
const view = { width: 1000, height: 800 };
describe('revealing a newly placed card', () => {
  it('keeps the camera when the card is already in view', () =>
    expect(revealCamera(view, { x: 0, y: 0, scale: 1 }, { x: 100, y: 100, width: 300, height: 300 })).toBeNull());
  it('pans just enough to bring an off-screen card inside the margin', () => {
    const next = revealCamera(view, { x: 0, y: 0, scale: 1 }, { x: 1200, y: 100, width: 300, height: 300 }, 48)!;
    expect(next.scale).toBe(1);
    expect(1200 + next.x + 300).toBe(1000 - 48); // right edge lands on the margin
    expect(next.y).toBe(0);                       // no vertical move needed
  });
  it('respects the zoom when converting world to screen', () => {
    const next = revealCamera(view, { x: 0, y: 0, scale: 0.5 }, { x: -400, y: 0, width: 200, height: 200 }, 48)!;
    expect(-400 * 0.5 + next.x).toBe(48);
  });
  it('a card larger than the view shows its title corner: top-left on the margins', () => {
    const next = revealCamera(view, { x: 0, y: 0, scale: 2 }, { x: 600, y: 600, width: 620, height: 720 }, 48)!;
    expect(600 * 2 + next.y).toBe(48);
    expect(600 * 2 + next.x).toBe(48);
  });
  it('treats the strip under the floating library as out of view', () => {
    const covered = { ...view, left: 280 };
    expect(revealCamera(covered, { x: 0, y: 0, scale: 1 }, { x: 100, y: 100, width: 300, height: 300 }, 48)!.x).toBe(280 + 48 - 100);
    expect(revealCamera(covered, { x: 0, y: 0, scale: 1 }, { x: 400, y: 100, width: 300, height: 300 }, 48)).toBeNull();
  });
  it('locating zooms out just enough for a card that does not fit, never in', () => {
    expect(fitScale(view, 4, { x: 0, y: 0, width: 620, height: 720 }, 48)).toBeCloseTo((800 - 96) / 720);
    expect(fitScale(view, 0.5, { x: 0, y: 0, width: 620, height: 720 }, 48)).toBe(0.5);
  });
  it('reveals the entire added card in the final view beside library and inspector', () => {
    const card = { x: 1000, y: 250, width: 440, height: 330 }, camera = { x: 20, y: 20, scale: 1 };
    for (const width of [1064, 648]) {
      const finalView = { width, height: 740, left: 280 };
      const next = revealAddedCamera(finalView, camera, card)!;
      expect(card.x * next.scale + next.x).toBeGreaterThanOrEqual(finalView.left + 48 - .001);
      expect((card.x + card.width) * next.scale + next.x).toBeLessThanOrEqual(width - 48 + .001);
      expect(card.y * next.scale + next.y).toBeGreaterThanOrEqual(48);
      expect((card.y + card.height) * next.scale + next.y).toBeLessThanOrEqual(740 - 48);
      expect(next.scale).toBeLessThanOrEqual(camera.scale);
    }
  });
  it('leaves an already visible addition alone and respects the Nexo zoom floor', () => {
    expect(revealAddedCamera(view, { x: 0, y: 0, scale: 1 }, { x: 100, y: 100, width: 300, height: 300 })).toBeNull();
    expect(revealAddedCamera({ width: 200, height: 200, left: 150 }, { x: 0, y: 0, scale: .2 }, { x: 1000, y: 1000, width: 4000, height: 4000 })!.scale).toBe(.1);
  });
});
