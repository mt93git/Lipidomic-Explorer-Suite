import { expect, it } from 'vitest';
import { tidy } from './tidy';
it('lays five boxes in reading order in three columns with gaps 30', () => {
  const boxes = [
    { id: 'e', x: 800, y: 600 }, { id: 'b', x: 400, y: 10 },
    { id: 'd', x: 0, y: 600 }, { id: 'a', x: 0, y: 0 }, { id: 'c', x: 800, y: 0 },
  ].map(b => ({ ...b, width: 500, height: 500 }));
  const before = structuredClone(boxes);
  expect(tidy(boxes, { width: 1600, height: 900 })).toEqual([
    { id: 'a', x: 30, y: 30 }, { id: 'b', x: 560, y: 30 }, { id: 'c', x: 1090, y: 30 },
    { id: 'd', x: 30, y: 560 }, { id: 'e', x: 560, y: 560 },
  ]);
  expect(boxes).toEqual(before);
});
