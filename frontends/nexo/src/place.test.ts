import { describe, expect, it } from 'vitest';
import { place } from './place';
import type { Rect } from './tiers';
const box = { width: 440, height: 330 };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
describe('new card placement', () => {
  it('keeps the wanted spot when it is free', () => expect(place([{ x: 0, y: 0, width: 300, height: 300 }], { x: 600, y: 0, ...box })).toEqual({ x: 600, y: 0 }));
  it('takes a free slot next to the wanted spot when it overlaps a card', () => {
    const cards = [{ x: 0, y: 0, width: 620, height: 720 }, { x: 660, y: 0, width: 620, height: 720 }];
    const spot = place(cards, { x: 100, y: 100, ...box });
    expect(cards.some(c => overlaps(c, { ...spot, ...box }))).toBe(false);
    expect(Math.hypot(spot.x - 100, spot.y - 100)).toBeLessThan(1320 - 100);
  });
  it('24 additions at the same spot form a compact block, not one long row', () => {
    const cards: Rect[] = [], card = { width: 620, height: 720 };
    for (let i = 0; i < 24; i++) cards.push({ ...place(cards, { x: 0, y: 0, ...card }), ...card });
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) expect(overlaps(cards[i], cards[j])).toBe(false);
    const w = Math.max(...cards.map(c => c.x + c.width)) - Math.min(...cards.map(c => c.x));
    const h = Math.max(...cards.map(c => c.y + c.height)) - Math.min(...cards.map(c => c.y));
    expect(Math.max(w / h, h / w)).toBeLessThan(2.5);
  });
  it('never places a card at a negative position (Team rejects it when saving)', () => {
    const cards: Rect[] = [], card = { width: 620, height: 720 };
    for (let i = 0; i < 24; i++) cards.push({ ...place(cards, { x: 50, y: 50, ...card }), ...card });
    expect(cards.every(c => c.x >= 0 && c.y >= 0)).toBe(true);
    expect(place([], { x: -300, y: -20, ...card })).toEqual({ x: 0, y: 0 });
  });
});
