import { expect, it } from 'vitest';
import { groupColors, scale, ticks } from './charts';
it('a linear scale maps the domain onto the range', () => { const x = scale(0, 10, 100, 200); expect(x(0)).toBe(100); expect(x(5)).toBe(150); expect(x(10)).toBe(200); });
it('ticks step through the domain', () => { expect(ticks(-3, 6, 2)).toEqual([-2, 0, 2, 4, 6]); });
it('groups keep fixed colours in order and never cycle: a fifth group is gray', () => {
  expect(groupColors(['A', 'B', 'A', 'C', 'D', 'E'])).toEqual({ A: '#2a78d6', B: '#eb6834', C: '#1b9e77', D: '#9b59b6', E: '#9aa5b1' });
});
