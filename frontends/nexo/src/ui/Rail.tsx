import { useContext, useEffect } from 'react';
import { CanvasHandleContext } from '../canvas/handle';
import { openFigureAdd } from './railActions';
import { store, ui, useShell, openLibrary } from './model';
import { strings as s, keys, tip } from './strings';
import { isReadOnly } from '../state/readonly';
function Icon({ kind }: { kind: string }) {
  return <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {kind === 'plots' ? <><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/></> : kind === 'illustrations' ? <><circle cx="9" cy="9" r="6"/><circle cx="9" cy="9" r="2"/></> : kind === 'palettes' ? <><circle cx="6" cy="7" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="9" cy="12" r="2"/></> : kind === 'text' ? <path d="M4 4h10M9 4v10"/> : kind === 'select' ? <path d="M4 2v13l4-4 4 5 2-2-4-5h5z"/> : kind === 'move' ? <path d="M9 1v16M1 9h16M6 4l3-3 3 3M6 14l3 3 3-3M4 6L1 9l3 3M14 6l3 3-3 3"/> : <><rect x="2" y="2" width="14" height="14" rx="2"/><path d="M11 2v14"/></>}
  </svg>;
}
export function Rail() {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const state = useShell().ui, handle = useContext(CanvasHandleContext);
  // Pilot F1: Team's session palette, session-wide (every group-coloured card), not one card's Appearance section.
  const palettes = () => ui({ paletteOpen: !state.paletteOpen });
  const open = (k: 'plots' | 'illustrations' | 'text' | 'palettes') => k === 'plots' || k === 'illustrations' ? (state.libraryOpen && state.library === k ? ui({ libraryOpen: false }) : openLibrary(k)) : k === 'palettes' ? palettes() : (handle && !handle.figureMode && handle.enterFigureMode(), openFigureAdd());
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable],dialog')) return;
      const k = e.key.toLowerCase();
      if (!isReadOnly() && (k === 'l' || k === '/')) {
        e.preventDefault(); const current = store.get().ui;
        const tab = e.shiftKey && k === 'l' ? 'illustrations' : 'plots';
        if (k === 'l' && current.libraryOpen && current.library === tab) ui({ libraryOpen: false }); else openLibrary(tab);
      }
      if (k === 'v' || k === 'h') { e.preventDefault(); ui({ mode: k === 'v' ? 'select' : 'move' }); }
      if (k === 'i') { e.preventDefault(); ui({ inspectorOpen: !store.get().ui.inspectorOpen }); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  return <nav className="rail" aria-label={s.tools}>
    {!isReadOnly() && <>{(['plots','illustrations','text','palettes'] as const).map(k => <button key={k} data-tip={touch ? undefined : tip(s[k], k === 'plots' ? keys.plots : k === 'illustrations' ? keys.illustrations : undefined)} aria-keyshortcuts={k === 'plots' ? 'L' : k === 'illustrations' ? 'Shift+L' : undefined} aria-label={s[k]} aria-pressed={k === 'plots' || k === 'illustrations' ? state.libraryOpen && state.library === k : k === 'text' ? state.figureMode : k === 'palettes' ? state.paletteOpen : undefined} onClick={() => open(k)}><Icon kind={k}/></button>)}
    <hr/></>}{(['select','move'] as const).map(k => <button key={k} data-tip={touch ? undefined : tip(k === 'select' ? s.selectTouch : s.moveTouch, keys[k])} aria-keyshortcuts={touch ? undefined : keys[k]} aria-label={k === 'select' ? s.selectTouch : s.moveTouch} aria-pressed={state.mode === k} onClick={() => ui({ mode: k })}><Icon kind={k}/></button>)}
    <button data-tip={touch ? undefined : tip(s.inspectorTouch, keys.inspector)} aria-keyshortcuts={touch ? undefined : keys.inspector} aria-label={s.inspectorTouch} aria-pressed={state.inspectorOpen} onClick={() => ui({ inspectorOpen: !state.inspectorOpen })}><Icon kind="inspector"/></button>
  </nav>;
}
