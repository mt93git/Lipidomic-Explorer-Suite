import { useContext, useEffect, useId, useRef, useState } from 'react';
import { confirmDesign, type Design } from '../../api';
import { CanvasHandleContext } from '../../canvas/handle';
import type { SavedDesign } from '../../state/nexo';
import { ui } from '../model';
import { strings as s } from '../strings';
const UNITS = ['Animal', 'Human', 'Cell line', 'Donor'];

/** saved: the design the checkpoint was saved with (Nexo's member, Steph review rows 2/12): prefilled, one click. */
export function DesignDialog({ sessionId, onConfirmed, onClose, saved }: {
  sessionId: string; onConfirmed: (design: Design) => void; onClose: () => void; saved?: SavedDesign;
}) {
  const ref = useRef<HTMLDialogElement>(null), title = useId(), handle = useContext(CanvasHandleContext);
  const [unit, setUnit] = useState(saved?.unit ?? 'Animal'), [type, setType] = useState<string>(saved?.type ?? 'independent');
  const units = saved && !UNITS.includes(saved.unit) ? [...UNITS, saved.unit] : UNITS;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!; dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  async function confirm() {
    setBusy(true); setError('');
    try {
      const design = await confirmDesign(sessionId, unit, type);
      // Kept in Nexo's member, so whoever reopens the checkpoint is offered this design (not confirmed for them).
      if (type === 'independent' || type === 'paired') handle?.saveDesign?.({ unit, type });
      ui({ design }); onConfirmed(design); window.dispatchEvent(new CustomEvent('nexo-design-confirmed')); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <dialog ref={ref} aria-labelledby={title} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={e => { e.preventDefault(); if (!busy) void confirm(); }}>
      <h2 id={title}>Confirm study design</h2>
      {saved && <p className="field-help design-saved">{s.designSaved}</p>}
      <label>Experimental unit <select value={unit} disabled={busy} onChange={e => setUnit(e.target.value)}>
        {units.map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>Sample relationship <select value={type} disabled={busy} onChange={e => setType(e.target.value)}>
        {['independent', 'paired'].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <p role="alert">{error}</p>
      <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy}>Confirm study design</button></footer>
    </form>
  </dialog>;
}
