import type { Rect } from '../tiers';
import type { Box, Move } from './types';
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// Team's fixed-box queue, shortest valid move, and down/right tie preference.
export function settle(boxes: Box[], anchorIds: string[], gap = 20): Move[] {
  const copies = boxes.map(b => ({ ...b }));
  const fixed = copies.filter(b => anchorIds.includes(b.id)), queue = fixed.slice(), moves: Move[] = [];
  const padded = (b: Rect): Rect => ({ x: b.x - gap + 1, y: b.y - gap + 1, width: b.width + 2 * gap - 2, height: b.height + 2 * gap - 2 });
  const clear = (b: Box, x: number, y: number) => fixed.every(f => f === b || !overlaps(padded({ ...b, x, y }), f));
  let passes = 0;
  while (queue.length && passes++ < 50) {
    const a = queue.shift()!;
    for (const b of copies) {
      if (fixed.includes(b) || !overlaps(a, b)) continue;
      const options = [
        { x: b.x, y: a.y + a.height + gap }, { x: a.x + a.width + gap, y: b.y },
        { x: b.x, y: a.y - gap - b.height }, { x: a.x - gap - b.width, y: b.y },
      ].filter(p => p.x >= 0 && p.y >= 0)
        .sort((p, q) => (Math.abs(p.x - b.x) + Math.abs(p.y - b.y)) - (Math.abs(q.x - b.x) + Math.abs(q.y - b.y)));
      let best = options.find(p => clear(b, p.x, p.y));
      if (!best) {
        let y = a.y + a.height + gap, again = true, tries = 0;
        while (again && tries++ < 100) {
          again = false;
          for (const f of fixed) {
            if (f !== b && overlaps({ ...b, y }, padded(f))) { y = f.y + f.height + gap; again = true; }
          }
        }
        best = { x: b.x, y };
      }
      b.x = best.x; b.y = best.y;
      fixed.push(b); queue.push(b); moves.push({ id: b.id, x: b.x, y: b.y });
    }
  }
  return moves;
}
