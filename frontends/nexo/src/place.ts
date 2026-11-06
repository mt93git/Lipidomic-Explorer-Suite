import type { Rect } from './tiers';
const GAP = 40;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// Keep the wanted spot if it is free; otherwise put the card right of all cards, top-aligned.
export function place(cards: Rect[], wanted: Rect): { x: number; y: number } {
  if (!cards.some(c => overlaps(c, wanted))) return { x: wanted.x, y: wanted.y };
  return { x: Math.max(...cards.map(c => c.x + c.width)) + GAP, y: Math.min(...cards.map(c => c.y)) };
}
