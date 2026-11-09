import { expect, it } from 'vitest';
import { checkpointLabel } from './topBarLabel';
const list = [{ id: 'a', name: 'Synthetic lipid study' }, { id: 'b', name: '  ' }];
it('names the open checkpoint, else falls back to the list label', () => {
  expect(checkpointLabel(list, 'a', 'Checkpoints')).toBe('Synthetic lipid study');
  expect(checkpointLabel(list, 'b', 'Checkpoints')).toBe('Checkpoints');
  expect(checkpointLabel(list, 'missing', 'Checkpoints')).toBe('Checkpoints');
  expect(checkpointLabel(list, null, 'Checkpoints')).toBe('Checkpoints');
});
