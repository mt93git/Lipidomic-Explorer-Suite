import { describe, expect, it } from 'vitest';
import { cardPress, beyondClick, CLICK_SLOP } from './editing';
// Pilot F2: at the thumb tier (< 20 %) the header is 0 px and inert, so a card must move from its body.
describe('cardPress: what a press on a card starts', () => {
 const part = (p: Partial<{header:boolean;resize:boolean;control:boolean}>) => ({header:false,resize:false,control:false,...p});
 it('a header press moves and a handle press resizes at any zoom', () => {
  expect(cardPress(part({header:true}), false)).toBe('move');
  expect(cardPress(part({header:true}), true)).toBe('move');
  expect(cardPress(part({resize:true}), false)).toBe('resize');
 });
 it('a body press does nothing above the thumb tier (the plot keeps its own gestures)', () => {
  expect(cardPress(part({}), false)).toBeNull();
 });
 it('a body press at the thumb tier is a move once it leaves the click threshold', () => {
  expect(cardPress(part({}), true)).toBe('pending-move');
 });
 it('controls never start a drag', () => {
  expect(cardPress(part({control:true}), true)).toBeNull();
  expect(cardPress(part({header:true,control:true}), false)).toBeNull();
 });
});
describe('beyondClick: the click threshold shared with click-to-focus', () => {
 it('is 4 screen px', () => { expect(CLICK_SLOP).toBe(4); });
 it('a press that stays within it is a click; one that leaves it drags', () => {
  expect(beyondClick(0, 0)).toBe(false);
  expect(beyondClick(2, 3)).toBe(false);
  expect(beyondClick(3, 3)).toBe(true);
  expect(beyondClick(-12, 0)).toBe(true);
 });
});
