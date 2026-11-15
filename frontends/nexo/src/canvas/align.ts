import type { Box, Move } from './types';
export function align(boxes: Box[], mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'): Move[] {
  if (!boxes.length) return [];
  const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.width)), bottom = Math.max(...boxes.map(b => b.y + b.height));
  return boxes.map(b => ({ id: b.id,
    x: mode === 'left' ? left : mode === 'right' ? right - b.width : mode === 'centerX' ? left + (right - left - b.width) / 2 : b.x,
    y: mode === 'top' ? top : mode === 'bottom' ? bottom - b.height : mode === 'centerY' ? top + (bottom - top - b.height) / 2 : b.y }));
}
export function distribute(boxes: Box[], axis: 'x' | 'y'): Move[] {
  const sorted = boxes.slice().sort((a, b) => a[axis] - b[axis]);
  if (sorted.length < 2) return sorted.map(b => ({ id: b.id, x: b.x, y: b.y }));
  const size = axis === 'x' ? 'width' : 'height';
  const start = sorted[0][axis];
  const end = Math.max(...sorted.map(b => b[axis] + b[size]));
  const gap = (end - start - sorted.reduce((sum, b) => sum + b[size], 0)) / (sorted.length - 1);
  let position = start;
  return sorted.map(b => {
    const move = { id: b.id, x: b.x, y: b.y, [axis]: position };
    position += b[size] + gap;
    return move;
  });
}
export function sameSize(boxes: Box[], dim: 'width' | 'height' | 'both'): Box[] {
  return boxes.map(b => ({ id: b.id, x: b.x, y: b.y,
    width: dim === 'height' ? b.width : boxes[0].width,
    height: dim === 'width' ? b.height : boxes[0].height }));
}
