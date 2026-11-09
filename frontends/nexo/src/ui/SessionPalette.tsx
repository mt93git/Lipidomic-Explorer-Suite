// Pilot F1: Team's session palette (the data hub's "Colors & palettes"), opened from the rail's Palettes and from a
// card's Data tab. The cards that follow the session palette take their group colours from here; a card with its own
// colour settings (Team's violin pastels, a palette chosen in its Appearance tab) keeps them. After a change the toast
// says how many cards actually redrew (Steph review 4b; palette/paletteRedraw.ts).
// Non-modal: the board stays visible and the cards redraw behind it. Each change is one undo step (canvas.ts).
import { useContext, useEffect, useRef, useState } from 'react';
import { getPalette, updatePalette, type Session } from '../api';
import { CanvasHandleContext } from '../canvas/handle';
import { groupColourChange, paletteChoiceChange, type PaletteChange, type SessionPalette } from '../palette/sessionPalette';
import { similarGroups } from '../palette/groupContrast';
import { recordPaletteRedraw, startRedrawWatch } from '../palette/paletteRedraw';
import { notify, notifyFailure } from './model';
import { strings as s, phrases as p } from './strings';
/** What the panel shows; stateless, so it can be checked without a browser (sessionPalette.test.tsx). */
export function PaletteView({palette, busy, onPalette, onColour}: {palette: SessionPalette; busy: boolean;
  onPalette: (name: string) => void; onColour: (context: string, group: string, value: string, commit: boolean) => void}) {
  return <fieldset disabled={busy} className="session-palette-body">
    <h3>{s.paletteChoose}</h3>
    <div className="session-palette-choices" role="group" aria-label={s.paletteChoose}>
      {palette.palettes.map(choice => <button key={choice.name} type="button" aria-pressed={choice.name === palette.active} onClick={() => onPalette(choice.name)}>
        <span className="session-palette-name">{choice.name}</span>
        <span className="session-palette-chips" aria-hidden="true">{choice.colors.map((c, i) => <span key={i} style={{background: c}}/>)}</span>
      </button>)}
    </div>
    <h3>{s.paletteFineTune}</h3>
    {palette.contexts.map(context => <fieldset key={context.id} className="session-palette-context"><legend>{context.label}</legend>
      {context.groups.map(g => <label key={g.name} className="session-palette-row"><span>{g.name}</span>
        <input type="color" aria-label={p.groupColour(g.name)} value={g.color.toLowerCase()}
          onChange={e => onColour(context.id, g.name, e.target.value, false)} onBlur={e => onColour(context.id, g.name, e.target.value, true)}/></label>)}
      {/* Steph review 7c: say which groups of this grouping look alike; the colour is applied all the same. */}
      {similarGroups(context.groups).map(([a, b]) => <p key={`${a}|${b}`} className="session-palette-warning" role="status">{p.hardToTellApart(a, b)}</p>)}
    </fieldset>)}
    {!palette.shapesEditable && <small className="field-help">{s.paletteNoShapes}</small>}
  </fieldset>;
}
export function SessionPalettePanel({session, onClose, onApplied}: {session: Session; onClose: () => void; onApplied: () => void}) {
  const ref = useRef<HTMLDialogElement>(null), handle = useContext(CanvasHandleContext);
  const [palette, setPalette] = useState<SessionPalette | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [redrawing, setRedrawing] = useState(false);
  // server: what the session holds (the base of every change and of its undo); palette: what is shown (a dragged colour first).
  const mounted = useRef(true), timer = useRef<ReturnType<typeof setTimeout>>(undefined), server = useRef<SessionPalette | null>(null);
  const take = (value: SessionPalette) => { server.current = value; if (mounted.current) setPalette(value); };
  useEffect(() => {
    mounted.current = true; const dialog = ref.current!; if (!dialog.open) dialog.show();
    dialog.querySelector<HTMLElement>('h2')?.focus();
    // Undo/redo (canvas.ts) sends an earlier state: show what the session now holds.
    const restored = (event: Event) => take((event as CustomEvent<SessionPalette>).detail);
    window.addEventListener('nexo-palette-restored', restored);
    void getPalette(session.sessionId).then(take, e => { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); });
    return () => { mounted.current = false; clearTimeout(timer.current); window.removeEventListener('nexo-palette-restored', restored); if (dialog.open) dialog.close();
      document.querySelector<HTMLElement>('nav.rail [aria-label="Palettes"]')?.focus(); };
  }, [session.sessionId]);
  async function apply(change: PaletteChange | null) {
    const before = server.current; if (!change || !before) return;
    // The fieldset is disabled while the change is applied, which drops focus to <body>: give it back afterwards.
    const focused = document.activeElement instanceof HTMLElement && ref.current?.contains(document.activeElement) ? document.activeElement : null;
    setBusy(true); setError('');
    // Each plot card's drawing now; the PATCH invalidates them, and the ones on the board start drawing again.
    const watch = startRedrawWatch(handle?.drawProbes?.() ?? []);
    try {
      const next = await updatePalette(session.sessionId, change);
      take(next); handle?.setSessionPalette?.(before.state, next.state);
      onApplied();
      const undo = () => handle?.undo();
      notify(s.paletteRedrawing, false, undo);
      if (mounted.current) setRedrawing(true);
      void watch.settle({ timeoutMs: 20000 }).then(result => {
        recordPaletteRedraw(result);
        notify(p.paletteApplied(result.redrew.length, result.redrew.length + result.kept.length + result.later.length, result.later.length), false, undo);
      }).finally(() => { if (mounted.current) setRedrawing(false); });
    } catch (e) {
      if (server.current && mounted.current) setPalette(server.current);
      if (mounted.current) setError(e instanceof Error ? e.message : String(e)); notifyFailure(s.paletteFailed, e);
    } finally {
      if (mounted.current) { setBusy(false); requestAnimationFrame(() => { if (ref.current && !ref.current.contains(document.activeElement)) (focused?.isConnected ? focused : ref.current.querySelector<HTMLElement>('h2'))?.focus(); }); }
    }
  }
  function colour(context: string, group: string, value: string, commit: boolean) {
    clearTimeout(timer.current);
    // The picker reports while dragging: the swatch follows at once, the session takes it after a pause or on blur.
    setPalette(now => now && {...now, contexts: now.contexts.map(c => c.id !== context ? c : {...c, groups: c.groups.map(g => g.name === group ? {...g, color: value} : g)})});
    const send = () => { if (server.current) void apply(groupColourChange(server.current, context, group, value)); };
    if (commit) send(); else timer.current = setTimeout(send, 400);
  }
  return <dialog className="analysis-sheet session-palette" ref={ref} aria-labelledby="session-palette-title"
    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><h2 id="session-palette-title" tabIndex={-1}>{s.paletteTitle}</h2><button type="button" onClick={onClose} aria-label={s.paletteClose} data-tip={s.paletteClose}>{s.close}</button></header>
    <p className="field-help">{s.paletteIntro}</p>
    <div className="analysis-content" aria-busy={busy}>
      {!palette && !error && <p role="status">{s.paletteLoading}</p>}
      {palette && <PaletteView palette={palette} busy={busy} onPalette={name => void apply(paletteChoiceChange(palette, name))} onColour={colour}/>}
    </div>
    <p role="status" className="analysis-status">{error ? '' : busy ? s.paletteUpdating : redrawing ? s.paletteRedrawing : ''}</p><p role="alert">{error}</p>
  </dialog>;
}
