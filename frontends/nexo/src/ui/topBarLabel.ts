import type { Checkpoint } from '../api';
/** The top bar names the open checkpoint; without one (a new or unsaved canvas) it names the list it opens. */
export function checkpointLabel(checkpoints: readonly Pick<Checkpoint, 'id' | 'name'>[], id: string | null, fallback: string) {
  return (id && checkpoints.find(c => c.id === id)?.name.trim()) || fallback;
}
