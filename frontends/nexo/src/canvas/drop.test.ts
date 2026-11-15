import { expect, it } from 'vitest';
import { dropWorldPoint } from './drop';
it('converts the client drop point through viewport offset, pan and zoom', () => {
  expect(dropWorldPoint({ x: 600, y: 400 }, { left: 56, top: 124 }, { x: -100, y: 26, scale: .5 })).toEqual({ x: 1288, y: 500 });
  expect(dropWorldPoint({ x: 600, y: 400 }, { left: 56, top: 124 }, { x: 44, y: -24, scale: 2 })).toEqual({ x: 250, y: 150 });
});
