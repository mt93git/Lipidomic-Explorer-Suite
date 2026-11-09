import { expect, it } from 'vitest';
import { minimapVisible } from './minimap';
const view = { width: 800, height: 600 }, camera = { x: 20, y: 20, scale: 1 };
const board = [{ x: 0, y: 0, width: 700, height: 500 }];
it('hides an empty or fully visible board, shows a clipped board after pan or zoom', () => {
  expect(minimapVisible(view, camera, [], false, false)).toBe(false);
  expect(minimapVisible(view, camera, board, false, false)).toBe(false);
  expect(minimapVisible(view, { ...camera, scale: 2 }, board, false, false)).toBe(true);
  expect(minimapVisible(view, { ...camera, x: -10 }, board, false, false)).toBe(true);
});
it('pinning and corner hover reveal the map even when everything fits', () => {
  expect(minimapVisible(view, camera, board, true, false)).toBe(true);
  expect(minimapVisible(view, camera, board, false, true)).toBe(true);
});
