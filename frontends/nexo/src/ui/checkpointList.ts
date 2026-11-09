import type { Checkpoint } from '../api/types';
import { strings as s } from './strings';
// The start page groups checkpoints the way people look for them: the one prepared in Team first, then named
// saves, then the rolling autosaves, each newest first, with when and where it came from.
export type CheckpointGroup = 'folder' | 'saved' | 'autosave';
export interface CheckpointRow { id: string; title: string; meta: string; group: CheckpointGroup }
export const groupTitles: Record<CheckpointGroup, string> = { folder: s.pickerFolder, saved: s.pickerSaved, autosave: s.pickerAutosaves };
const order: CheckpointGroup[] = ['folder', 'saved', 'autosave'];
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export function checkpointRows(list: Checkpoint[], when: (iso: string) => string = formatWhen): CheckpointRow[] {
  const group = (c: Checkpoint): CheckpointGroup => c.source === 'folder' ? 'folder' : c.name === 'autosave' ? 'autosave' : 'saved';
  const time = (c: Checkpoint) => { const t = Date.parse(c.createdAt); return Number.isNaN(t) ? 0 : t; };
  return [...list].sort((a, b) => order.indexOf(group(a)) - order.indexOf(group(b)) || time(b) - time(a)).map(c => ({
    id: c.id, group: group(c), title: group(c) === 'autosave' ? s.autosave : c.name,
    meta: [when(c.createdAt), group(c) === 'folder' ? s.pickerFromTeam : s.pickerFromNexo].filter(Boolean).join(' · ')
  }));
}
