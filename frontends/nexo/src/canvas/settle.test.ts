import { expect, it } from 'vitest';
import { settle } from './settle';
const box = (id: string, x: number, y = 0) => ({ id, x, y, width: 100, height: 100 });
it('never moves anchors and does not mutate input', () => {
  const boxes = [box('a', 0), box('b', 50)];
  const before = structuredClone(boxes);
  expect(settle(boxes, ['a', 'b'])).toEqual([]);
  expect(boxes).toEqual(before);
});
it('a dropped box pushes its neighbour to gap 20', () => {
  const boxes = [box('a', 0), box('b', 90)];
  expect(settle(boxes, ['a'])).toEqual([{ id: 'b', x: 120, y: 0 }]);
  expect(boxes[1].x).toBe(90);
});
it('resolves a chain of three', () => {
  expect(settle([box('a', 0), box('b', 90), box('c', 210)], ['a']))
    .toEqual([{ id: 'b', x: 120, y: 0 }, { id: 'c', x: 240, y: 0 }]);
});
it('returns empty for non-overlapping input', () => {
  expect(settle([box('a', 0), box('b', 120)], ['a'])).toEqual([]);
});
