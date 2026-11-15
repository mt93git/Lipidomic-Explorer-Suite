import { describe, expect, it } from 'vitest';
import { moveActive, wholeRows } from './pickerKeys';
describe('searchable picker keyboard', () => {
  it('moves the active option with arrows, Home and End, clamped to the filtered list', () => {
    expect(moveActive('ArrowDown', -1, 3)).toBe(0);
    expect(moveActive('ArrowDown', 0, 3)).toBe(1);
    expect(moveActive('ArrowDown', 2, 3)).toBe(2);
    expect(moveActive('ArrowUp', -1, 3)).toBe(2);
    expect(moveActive('ArrowUp', 1, 3)).toBe(0);
    expect(moveActive('ArrowUp', 0, 3)).toBe(0);
    expect(moveActive('Home', 2, 3)).toBe(0);
    expect(moveActive('End', 0, 3)).toBe(2);
  });
  it('leaves other keys and an empty list to the field', () => {
    expect(moveActive('a', 0, 3)).toBeNull();
    expect(moveActive('Enter', 0, 3)).toBeNull();
    expect(moveActive('ArrowDown', -1, 0)).toBeNull();
  });
  it('shows whole rows only: never more rows than options, at most six', () => {
    expect(wholeRows(76)).toBe(6);
    expect(wholeRows(3)).toBe(3);
    expect(wholeRows(0)).toBe(1);
  });
});
