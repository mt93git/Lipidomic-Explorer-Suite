import { describe, expect, it } from 'vitest';
import { paletteTarget } from './railActions';
import type { Node } from '../api';
const node = (id: string, kind: Node['kind'], finished = false): Node => ({ id, kind, label: id, x: 0, y: 0, width: 300, height: 300, finished: finished ? { url: 'data:x' } : null });
describe('rail palettes', () => {
  const nodes = [node('art', 'illustration'), node('done', 'plot', true), node('live', 'plot')];
  it('targets the first selected live plot', () => {
    expect(paletteTarget(['art', 'live'], nodes)).toBe('live');
  });
  it('has no target for illustrations, finished plots or an empty selection', () => {
    expect(paletteTarget(['art', 'done'], nodes)).toBeNull();
    expect(paletteTarget([], nodes)).toBeNull();
  });
});
