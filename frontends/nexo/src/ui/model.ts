import type { Design } from '../api';
import { useSyncExternalStore } from 'react';
import { createStore } from '../state/store';
import * as tabs from '../state/tabs';
import { strings } from './strings';
export const store = createStore({
  ui: { design: undefined as Design | undefined, libraryFocus: 0, saveStatus: strings.ready as string, mode: 'select' as 'select' | 'move', inspectorOpen: false,
    figureMode: false, libraryOpen: false, library: 'plots' as 'plots' | 'illustrations' | 'text' | 'palettes',
    /** Pilot F1: Team's session palette panel (rail Palettes, a card's Data tab). */
    paletteOpen: false,
    /** UX-B4: the collab Version history panel (rail clock, Checkpoints title in collab mode). */
    versionsOpen: false },
  tabs: tabs.initial([]), past: [] as tabs.TabState[], future: [] as tabs.TabState[],
  toast: null as null | { id: number; message: string; error: boolean; undo?: () => void; action?: string }
});
const subscription = store.subscribe(s => s, () => {});
export function useShell() { return useSyncExternalStore(subscription.subscribe, subscription.getSnapshot, subscription.getSnapshot); }
export function ui(patch: Partial<ReturnType<typeof store.get>['ui']>) { store.set(s => ({ ...s, ui: { ...s.ui, ...patch } })); }
/** One notice path: the toast is the only place a message is shown and announced (review R15). */
export function notify(message: string, error = false, undo?: () => void, action?: string) {
  store.set(s => ({ ...s, toast: { id: Date.now(), message, error, undo, ...(action ? { action } : {}) } }));
}
/** A failed action: an error toast with a human sentence; the inspector status line keeps showing state. */
export function notifyFailure(action: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).replace(/^Error:\s*/, '');
  notify(`Could not ${action}: ${message}`, true);
}
export function editTabs(edit: (next: tabs.TabState) => void) {
  store.set(s => { const next = tabs.clone(s.tabs); edit(next); return { ...s, tabs: next, past: [...s.past, s.tabs], future: [] }; });
  notify(strings.local, false, undo);
}
export function undo() {
  store.set(s => !s.past.length ? s : { ...s, tabs: s.past.at(-1)!, past: s.past.slice(0, -1), future: [s.tabs, ...s.future] });
}
export function redo() {
  store.set(s => !s.future.length ? s : { ...s, tabs: s.future[0], past: [...s.past, s.tabs], future: s.future.slice(1) });
}
export function proxy(id: string) { document.getElementById(id)?.click(); }

export function openLibrary(library: 'plots' | 'illustrations') {
  ui({ library, libraryOpen: true, libraryFocus: store.get().ui.libraryFocus + 1 });
}
