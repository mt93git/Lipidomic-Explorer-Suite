import { expect, it } from 'vitest';
import { align, distribute, sameSize } from './align';
it('aligns left, distributes equal x gaps, and copies the first size', () => {
  const boxes = [
    { id: 'a', x: 10, y: 20, width: 40, height: 60 },
    { id: 'b', x: 80, y: 30, width: 20, height: 30 },
    { id: 'c', x: 200, y: 40, width: 60, height: 50 },
  ];
  const before = structuredClone(boxes);
  expect(align(boxes, 'left')).toEqual(boxes.map(b => ({ id: b.id, x: 10, y: b.y })));
  expect(distribute(boxes, 'x')).toEqual([
    { id: 'a', x: 10, y: 20 }, { id: 'b', x: 115, y: 30 }, { id: 'c', x: 200, y: 40 },
  ]);
  expect(sameSize(boxes, 'both')).toEqual(boxes.map(b => ({ ...b, width: 40, height: 60 })));
  expect(boxes).toEqual(before);
});
