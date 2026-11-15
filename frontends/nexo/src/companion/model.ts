/** The companion's phases (docs/integration/nexo-companion/prototype.html): the first-visit entrance on Start, docked in
 *  the top bar, or out (re-invoked) on the canvas area with the current screen's tip. */
export type Screen = 'start' | 'data' | 'review' | 'canvas' | 'inspector';
export type Phase = 'entrance' | 'docked' | 'out';
export type Flags = { seen: boolean; fewer: boolean };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const key = (name: keyof Flags, user: string) => `nexo.companion.${name}.${user}`;
/** Per-user flags in localStorage; storage that throws (private mode, blocked) reads as a first visit. */
export function readFlags(store: Store | undefined, user: string): Flags {
  try { return { seen: store?.getItem(key('seen', user)) === '1', fewer: store?.getItem(key('fewer', user)) === '1' }; }
  catch { return { seen: false, fewer: false }; }
}
export function writeFlag(store: Store | undefined, user: string, name: keyof Flags, value: boolean) {
  try { store?.setItem(key(name, user), value ? '1' : '0'); } catch { /* the flag lasts this page only */ }
}
export function startPhase(flags: Flags, screen: Screen): Phase { return !flags.seen && screen === 'start' ? 'entrance' : 'docked'; }
/** invoke: a click or Enter/Space on the docked mascot; dock: the entrance reached Canvas or its 6 s ran out;
 *  timeout / dismiss: the tip's ~5 s, Esc or a click elsewhere. */
export function next(phase: Phase, event: 'invoke' | 'dock' | 'timeout' | 'dismiss'): Phase {
  if (phase === 'docked') return event === 'invoke' ? 'out' : phase;
  if (phase === 'entrance') return event === 'invoke' || event === 'dock' || event === 'timeout' ? 'docked' : phase;
  return event === 'timeout' || event === 'dismiss' ? 'docked' : phase;
}
/** A screen's tip shows by itself once (after the entrance), unless the person chose Fewer tips; a click always shows it. */
export function autoTip(flags: Flags, screen: Screen, tipped: string[]): boolean { return flags.seen && !flags.fewer && !tipped.includes(screen); }
export function readTipped(store: Store | undefined, user: string): string[] {
  try { return (store?.getItem(`nexo.companion.tipped.${user}`) ?? '').split(',').filter(Boolean); } catch { return []; }
}
export function writeTipped(store: Store | undefined, user: string, tipped: string[]) {
  try { store?.setItem(`nexo.companion.tipped.${user}`, tipped.join(',')); } catch { /* this page only */ }
}
