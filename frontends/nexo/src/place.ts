import type { Rect } from './tiers';
const GAP = 40;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const padded = (r: Rect): Rect => ({ x: r.x - GAP, y: r.y - GAP, width: r.width + 2 * GAP, height: r.height + 2 * GAP });
// Keep the wanted spot if it is free; otherwise take the nearest free slot around it (rings of
// card-sized steps, keeping the gap), so many additions form a compact block instead of one long
// row (H8 live stress: 24 plots ended in a 10 % strip). Never moves the camera.
// Team's validator rejects negative positions, so every slot stays at x, y >= 0.
export function place(cards: Rect[], target: Rect): { x: number; y: number } {
  const wanted = { ...target, x: Math.max(0, target.x), y: Math.max(0, target.y) };
  if (!cards.some(c => overlaps(c, wanted))) return { x: wanted.x, y: wanted.y };
  const stepX = wanted.width + GAP, stepY = wanted.height + GAP;
  for (let ring = 1; ring <= 16; ring++) {
    let best: { x: number; y: number; d: number } | undefined;
    for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
      const spot = { ...wanted, x: wanted.x + i * stepX, y: wanted.y + j * stepY };
      if (spot.x < 0 || spot.y < 0) continue;
      if (cards.some(c => overlaps(padded(c), spot))) continue;
      // Reading order breaks ties: right before left, below before above.
      const d = Math.hypot(i * stepX, j * stepY) + (i < 0 ? 1 : 0) + (j < 0 ? 0.5 : 0);
      if (!best || d < best.d) best = { x: spot.x, y: spot.y, d };
    }
    if (best) return { x: best.x, y: best.y };
  }
  return { x: Math.max(...cards.map(c => c.x + c.width)) + GAP, y: Math.max(0, Math.min(...cards.map(c => c.y))) };
}
