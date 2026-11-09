import type { Box, Move } from './types';
// Rounded 150-unit rows from the prototype; Team's aspect-based column sizing.
export function tidy(boxes: Box[], viewport: { width: number; height: number }, gap = 30): Move[] {
  if (!boxes.length) return [];
  const sorted = boxes.slice().sort((a, b) => Math.round(a.y / 150) - Math.round(b.y / 150) || a.x - b.x);
  const n = sorted.length;
  const avgW = sorted.reduce((sum, b) => sum + b.width, 0) / n;
  const avgH = sorted.reduce((sum, b) => sum + b.height, 0) / n;
  const maxW = Math.max(...sorted.map(b => b.width));
  const columns = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * (viewport.width / Math.max(1, viewport.height)) * (avgH / Math.max(1, avgW))) - .25)));
  const width = Math.max(viewport.width, gap + columns * (avgW + gap) + (maxW - avgW) + 1);
  let x = gap, y = gap, rowHeight = 0;
  const moves: Move[] = [];
  for (const b of sorted) {
    if (x > gap && x + b.width + gap > width) { x = gap; y += rowHeight + gap; rowHeight = 0; }
    if (b.x !== x || b.y !== y) moves.push({ id: b.id, x, y });
    x += b.width + gap; rowHeight = Math.max(rowHeight, b.height);
  }
  return moves;
}
