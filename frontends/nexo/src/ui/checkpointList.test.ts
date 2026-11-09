import { describe, expect, it } from 'vitest';
import { checkpointRows } from './checkpointList';
import type { Checkpoint } from '../api/types';
const cp = (id: string, name: string, createdAt: string, source: Checkpoint['source'] = 'store'): Checkpoint => ({ id, name, createdAt, source, sizeBytes: 1, sha256: id });
const when = (iso: string) => iso.slice(0, 16);
describe('checkpointRows', () => {
  it('lists Team checkpoints first, then named saves, then autosaves, newest first in each group', () => {
    const rows = checkpointRows([cp('a1', 'autosave', '2026-01-03T10:00:00Z'), cp('s1', 'Figure 1 draft', '2026-01-02T09:00:00Z'),
      cp('f1', 'prepared.zip', '2026-01-01T08:00:00Z', 'folder'), cp('a2', 'autosave', '2026-01-04T10:00:00Z'), cp('s2', 'Final', '2026-01-05T09:00:00Z')], when);
    expect(rows.map(r => r.id)).toEqual(['f1', 's2', 's1', 'a2', 'a1']);
    expect(rows.map(r => r.group)).toEqual(['folder', 'saved', 'saved', 'autosave', 'autosave']);
  });
  it('names autosaves and shows when and where each checkpoint came from', () => {
    const [folder, auto] = checkpointRows([cp('a', 'autosave', '2026-01-03T10:00:00Z'), cp('f', 'prepared.zip', '2026-01-01T08:00:00Z', 'folder')], when);
    expect(folder).toMatchObject({ title: 'prepared.zip', meta: '2026-01-01T08:00 · From Team' });
    expect(auto).toMatchObject({ title: 'Autosave', meta: '2026-01-03T10:00 · Saved in Nexo' });
  });
  it('leaves out a date it cannot read', () => {
    expect(checkpointRows([cp('x', 'Old', 'not a date')])[0].meta).toBe('Saved in Nexo');
  });
});
