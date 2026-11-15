/** The companion's phases (docs/integration/nexo-companion/prototype.html): the first-visit entrance on Start, docked in
 *  the top bar, or out: anywhere the person drags it, until they put it back. */
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
/** invoke: a click, Enter/Space or a drag on the docked mascot takes it out; dock: the entrance's 6 s ran out (or it
 *  reached another screen), or the person put it back (Dock, a double-click, a drop on the bar). Out, it stays out. */
export function next(phase: Phase, event: 'invoke' | 'dock'): Phase {
  if (phase === 'docked') return event === 'invoke' ? 'out' : phase;
  return event === 'dock' || phase === 'entrance' ? 'docked' : phase;
}
/** Where it rests, for this tab only (sessionStorage, as Team), per person. */
export const placeKey = (user: string) => `nexo.companion.place.${user}`;
/** A screen's tip shows by itself once (after the entrance), unless the person chose Fewer tips; a click always shows it. */
export function autoTip(flags: Flags, screen: Screen, tipped: string[]): boolean { return flags.seen && !flags.fewer && !tipped.includes(screen); }
export function readTipped(store: Store | undefined, user: string): string[] {
  try { return (store?.getItem(`nexo.companion.tipped.${user}`) ?? '').split(',').filter(Boolean); } catch { return []; }
}
export function writeTipped(store: Store | undefined, user: string, tipped: string[]) {
  try { store?.setItem(`nexo.companion.tipped.${user}`, tipped.join(',')); } catch { /* this page only */ }
}
