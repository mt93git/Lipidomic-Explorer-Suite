import { expect, it } from 'vitest';
import { createStore } from '../../state/store';
import { createHistory } from '../../state/history';
import { clampSize, nextSize, presetWidth, sizePresets, sizeCommands, sizeText } from './cardSize';
it('clamps to the canvas limits: 240-4000 wide, 220-4000 high, whole pixels', () => {
  expect(clampSize({ width: 10, height: 5 })).toEqual({ width: 240, height: 220 });
  expect(clampSize({ width: 9000, height: 4001 })).toEqual({ width: 4000, height: 4000 });
  expect(clampSize({ width: 500.6, height: Number.NaN })).toEqual({ width: 501, height: 220 });
});
it('a free size changes one side; a locked size keeps the aspect, both clamped', () => {
  const start = { width: 400, height: 300 };
  expect(nextSize(start, { width: 800 }, false)).toEqual({ width: 800, height: 300 });
  expect(nextSize(start, { width: 800 }, true)).toEqual({ width: 800, height: 600 });
  expect(nextSize(start, { height: 150 }, true)).toEqual({ width: 293, height: 220 });
  expect(nextSize(start, { width: 6000 }, true)).toEqual({ width: 4000, height: 3000 });
});
it('journal presets set the width at 96 px per inch', () => {
  expect(sizePresets.map(p => [p.label, p.mm])).toEqual([['Single column', 89], ['1.5 column', 120], ['Double column', 183]]);
  expect(sizePresets.map(p => presetWidth(p.mm))).toEqual([336, 454, 692]);
  expect(nextSize({ width: 400, height: 300 }, { width: presetWidth(183) }, true)).toEqual({ width: 692, height: 519 });
});
it('setting the size is one undo step that also settles the neighbours', () => {
  const a = { id: 'a', label: 'A', x: 0, y: 0, width: 300, height: 300 }, b = { id: 'b', label: 'B', x: 320, y: 0, width: 300, height: 300 };
  const store = createStore({ nodes: [a, b] }), history = createHistory(store);
  const commands = sizeCommands(store.get().nodes, 'a', { width: 600, height: 300 }, 'size:1');
  commands.forEach((command, i) => history.dispatch(command, { fold: i > 0 }));
  const [na, nb] = store.get().nodes;
  expect(na).toMatchObject({ width: 600, height: 300 });
  expect(nb.x >= na.x + na.width + 20 || nb.y >= na.y + na.height + 20).toBe(true);
  expect(history.undo()).toBe(true);
  expect(store.get().nodes).toEqual([a, b]);
  expect(history.canUndo).toBe(false);
});
it('shows a drag-resized size in whole pixels (b03-qc-b: Height read 498.33333333333337)', () => {
  expect(sizeText(498.33333333333337)).toBe('498');
  expect(sizeText(422.5)).toBe('423');
  expect(sizeText(620)).toBe('620');
});
