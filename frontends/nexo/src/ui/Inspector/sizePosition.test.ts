import { expect, it } from 'vitest';
import presets from '../../mock/exportPresets.json';
import { createStore } from '../../state/store';
import { createHistory } from '../../state/history';
import { fromUnit, journalChips, positionCommands, px300, ratioText, stepField, toUnit } from './cardSize';
it('mm and px convert at 96 px per inch; the 300 DPI line scales from 96', () => {
  expect(fromUnit(89, 'mm')).toBe(336); expect(fromUnit(336, 'px')).toBe(336);
  expect(toUnit(336, 'mm')).toBe(88.9); expect(toUnit(240, 'mm')).toBe(63.5); expect(toUnit(400, 'px')).toBe(400);
  expect(px300(336)).toBe(1050);
});
it('the aspect ratio reads as width:height reduced to 2 decimals', () => {
  expect(ratioText(400, 300)).toBe('1.33 : 1'); expect(ratioText(500, 500)).toBe('1 : 1');
});
it('journal chips come from the export presets: single and double column; below 240 px is disabled with the reason', () => {
  const chips = journalChips(presets as never);
  expect(chips.map(c => c.label)).toEqual(['Nature 1-col', 'Nature 2-col', 'Cell 1-col', 'Cell 2-col', 'Science 1-col', 'Science 2-col', 'EMBO 1-col', 'EMBO 2-col']);
  const science = chips.find(c => c.label === 'Science 1-col')!;
  expect(science).toMatchObject({ mm: 55, disabled: true });
  expect(science.reason).toBe("Below Team's 240 px card minimum (63 mm). Set 55 mm in Export instead.");
  expect(chips.find(c => c.label === 'Nature 1-col')).toMatchObject({ mm: 89, px: 336, disabled: false });
});
it('arrow keys step ±1, Shift ±10, in the shown unit', () => {
  expect(stepField('400', 'ArrowUp', false)).toBe('401'); expect(stepField('400', 'ArrowDown', true)).toBe('390');
  expect(stepField('88.9', 'ArrowUp', false)).toBe('89.9'); expect(stepField('x', 'ArrowUp', false)).toBe(null); expect(stepField('4', 'a', false)).toBe(null);
});
it('exact X/Y is one undo step that settles the neighbours, clamped to 0-1e6', () => {
  const a = { id: 'a', label: 'A', x: 0, y: 0, width: 300, height: 300 }, b = { id: 'b', label: 'B', x: 400, y: 0, width: 300, height: 300 };
  const store = createStore({ nodes: [a, b] }), history = createHistory(store);
  positionCommands(store.get().nodes, 'a', { x: 380, y: -5 }, 'pos:1').forEach((c, i) => history.dispatch(c, { fold: i > 0 }));
  const [na, nb] = store.get().nodes;
  expect(na).toMatchObject({ x: 380, y: 0, width: 300 });
  expect(nb.x >= na.x + na.width || nb.y >= na.y + na.height || nb.x + nb.width <= na.x).toBe(true);
  expect(history.undo()).toBe(true); expect(store.get().nodes).toEqual([a, b]);
});
