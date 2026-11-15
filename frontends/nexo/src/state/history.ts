import type { Command } from './commands';
import type { CanvasState } from './types';
interface Store { get(): CanvasState; set(updater: (state: CanvasState) => CanvasState): void }
interface Entry { forward: Command[]; backward: Command[]; key?: string; time: number }
export function createHistory(store: Store, options: { clock?: () => number; window?: number; cap?: number } = {}) {
  const clock = options.clock ?? Date.now, window = options.window ?? 700;
  const cap = Math.max(1, Math.floor(options.cap ?? 50));
  const entries: Entry[] = [];
  let cursor = 0, boundary = false;
  return {
    get cursor() { return cursor; },
    get canUndo() { return cursor > 0; },
    get canRedo() { return cursor < entries.length; },
    dispatch(cmd: Command, { fold = false }: { fold?: boolean } = {}) {
      const before = store.get(), inverse = cmd.invert(before), next = cmd.apply(before), now = clock();
      const previous = entries[cursor - 1];
      const merge = !boundary && cursor === entries.length && previous && (fold || (cmd.coalesceKey !== undefined && previous.key === cmd.coalesceKey && now >= previous.time && now - previous.time < window));
      entries.splice(cursor);
      if (merge) { previous.forward.push(cmd); previous.backward.unshift(inverse); previous.time = now; }
      else { entries.push({ forward: [cmd], backward: [inverse], key: cmd.coalesceKey, time: now }); cursor++; }
      if (entries.length > cap) { entries.shift(); cursor--; }
      boundary = false; store.set(() => next);
    },
    undo() {
      if (!cursor) return false;
      const entry = entries[--cursor]; boundary = true;
      store.set(doc => entry.backward.reduce((state, cmd) => cmd.apply(state), doc)); return true;
    },
    redo() {
      if (cursor === entries.length) return false;
      const entry = entries[cursor++]; boundary = true;
      store.set(doc => entry.forward.reduce((state, cmd) => cmd.apply(state), doc)); return true;
    }
  };
}
