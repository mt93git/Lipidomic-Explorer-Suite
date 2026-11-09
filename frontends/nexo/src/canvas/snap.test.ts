import { expect, it } from 'vitest';
import { snap } from './snap';
const moving = { x: 105, y: 200, width: 40, height: 40 };
const other = { x: 100, y: 0, width: 100, height: 50 };
it('edge within 6 snaps with one vertical guide spanning both boxes', () => {
  expect(snap(moving, [other], { threshold: 6 })).toEqual({
    x: 100, y: 200, guides: [{ axis: 'x', at: 100, from: 0, to: 240 }],
  });
});
it('snaps centres', () => {
  expect(snap({ ...moving, x: 132 }, [other], { threshold: 6 })).toEqual({
    x: 130, y: 200, guides: [{ axis: 'x', at: 150, from: 0, to: 240 }],
  });
});
it('leaves positions outside threshold unchanged', () => {
  expect(snap({ ...moving, x: 300 }, [other], { threshold: 6 })).toEqual({ x: 300, y: 200, guides: [] });
});
it('bypass rounds to the grid without guides', () => {
  expect(snap({ ...moving, x: 105.4, y: 202.8 }, [other], { threshold: 6, bypass: true, grid: 10 }))
    .toEqual({ x: 110, y: 200, guides: [] });
  expect(snap({ ...moving, x: 105.4 }, [other], { threshold: 6, bypass: true }).x).toBe(105);
});
