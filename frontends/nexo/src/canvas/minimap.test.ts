import { expect, it } from 'vitest';
import { minimapVisible, remoteViewports } from './minimap';
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
const view2 = (activeTab: string, x: number, y: number, scale: number) => ({ activeTab, camera: { x, y, scale }, viewport: { width: 800, height: 600 } });
it('another person on this tab is the canvas rectangle they see, in their colour', () => {
  const states = new Map<number, unknown>([[2, { displayName: 'Ana Ruiz', colour: '#c0392b', view: view2('t1', -200, -100, 2) }]]);
  expect(remoteViewports(states, 1, 't1')).toEqual([{ id: 2, name: 'Ana Ruiz', colour: '#c0392b', rect: { x: 100, y: 50, width: 400, height: 300 } }]);
});
it('oneself, people on another tab and people without a view are not drawn', () => {
  const states = new Map<number, unknown>([[1, { view: view2('t1', 0, 0, 1) }], [2, { view: view2('t2', 0, 0, 1) }], [3, { displayName: 'Bo' }]]);
  expect(remoteViewports(states, 1, 't1')).toEqual([]);
});
