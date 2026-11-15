// Team's longitudinal time-course designer (sortable buckets, R/modules/11_longitudinal_module.R:1265-1320) as an
// accessible Inspector control: every item can be moved, reordered or removed with buttons and selects (keyboard),
// and dragged as a bonus. A change sets case_bucket_<id> the way sortable's JS does, then presses Team's
// "Generate Analysis" (submit_longitudinal_btn) so the card redraws with the new time courses.
import { useMemo, useRef, useState } from 'react';
import { notifyFailure } from '../model';
import { strings as s } from '../strings';
import { updateCard, type Inputs, type SchemaControl } from '../../api';
import { addCohort, bucketsOf, moveItem, removeItem, reorderItem, type BucketPatch } from '../../timecourse/designer';

export const GENERATE_ACTION = 'submit_longitudinal_btn';
export function TimecourseDesigner({controls, own, sessionId, instanceId, onCommit, onStatus}: {
  controls: SchemaControl[]; own?: Record<string, unknown>; sessionId: string; instanceId: string;
  onCommit: (patch: Inputs, baseline: Inputs) => void; onStatus: (status: string) => void;
}) {
  const initial = useMemo(() => bucketsOf(controls, own), [controls, own]);
  const [open, setOpen] = useState<{bucket: string; index: number} | null>(null), [buckets, setBuckets] = useState(initial.buckets), [busy, setBusy] = useState(false), [said, setSaid] = useState('');
  const drag = useRef<{from: string; index: number} | null>(null);
  function apply(patch: BucketPatch, message: string) {
    if (!Object.keys(patch).length || busy) return;
    const before = buckets, baseline = Object.fromEntries(Object.keys(patch).map(id => [id, before.find(b => b.id === id)?.items ?? []]));
    setBuckets(bs => bs.map(b => b.id in patch ? {...b, items: patch[b.id]} : b)); setBusy(true); onStatus('Updating…');
    void updateCard(sessionId, instanceId, patch as Inputs, [GENERATE_ACTION]).then(() => {
      setBusy(false); setSaid(message); onCommit(patch as Inputs, baseline as Inputs); onStatus('Up to date');
    }, error => { setBusy(false); setBuckets(before); notifyFailure(s.failUpdate, error); onStatus(s.updateFailed); });
  }
  return <fieldset className="tc-designer" aria-busy={busy || undefined}>
    <legend>{s.timecourseDesigner}</legend>
    <div className="tc-buckets">{buckets.map(b => <section key={b.id} className="tc-bucket" data-bucket={b.id} aria-label={b.label}
      onDragOver={e => { if (drag.current) e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); const d = drag.current; drag.current = null; if (!d) return;
        const item = buckets.find(x => x.id === d.from)?.items[d.index];
        if (d.from === '') { const cohort = initial.source[d.index]; apply(addCohort(buckets, cohort, b.id), `${cohort} added to ${b.label}`); }
        else apply(moveItem(buckets, d.from, d.index, b.id), `${item} moved to ${b.label}`); }}>
      <h4 className="tc-bucket-title">{b.label}</h4>
      {b.items.length ? <ol className="tc-items">{b.items.map((item, i) => <li key={item + i} className="tc-item" draggable={!busy}
        onDragStart={e => { drag.current = {from: b.id, index: i}; e.dataTransfer.setData('text/plain', item); }}>
        <span className="tc-item-name" title={item}>{item}</span>
        <button type="button" className="tc-icon" aria-label={`Move ${item} up in ${b.label}`} data-tip="Move up" disabled={busy || i === 0} onClick={() => apply(reorderItem(buckets, b.id, i, -1), `${item} moved up`)}>↑</button>
        <button type="button" className="tc-icon" aria-label={`Move ${item} down in ${b.label}`} data-tip="Move down" disabled={busy || i === b.items.length - 1} onClick={() => apply(reorderItem(buckets, b.id, i, 1), `${item} moved down`)}>↓</button>
        {buckets.length > 1 && <button type="button" className="tc-move" aria-haspopup="menu" aria-expanded={open?.bucket === b.id && open.index === i}
          aria-label={`Move ${item} to another time course`} disabled={busy} onClick={() => setOpen(o => o?.bucket === b.id && o.index === i ? null : {bucket: b.id, index: i})}>Move…</button>}
        <button type="button" className="tc-icon tc-remove" aria-label={`Remove ${item} from ${b.label}`} data-tip="Remove" disabled={busy} onClick={() => apply(removeItem(buckets, b.id, i), `${item} removed from ${b.label}`)}>×</button>
        {open?.bucket === b.id && open.index === i && <div className="tc-menu" role="menu" aria-label={`Move ${item} to`}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(null); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
              const at = items.indexOf(document.activeElement as HTMLButtonElement); items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); } }}>
          {buckets.filter(t => t.id !== b.id).map((t, k) => <button key={t.id} type="button" role="menuitem" autoFocus={k === 0} disabled={t.items.includes(item)}
            onClick={() => { setOpen(null); apply(moveItem(buckets, b.id, i, t.id), `${item} moved to ${t.label}`); }}>{`Move to ${t.label}`}</button>)}
        </div>}
      </li>)}</ol> : <p className="field-help tc-empty">{s.timecourseEmpty}</p>}
      <select className="tc-add" aria-label={`Add a cohort to ${b.label}`} value="" disabled={busy || initial.source.every(c => b.items.includes(c))}
        onChange={e => { const c = e.target.value; if (c) apply(addCohort(buckets, c, b.id), `${c} added to ${b.label}`); }}>
        <option value="">Add cohort…</option>
        {initial.source.map(c => <option key={c} value={c} disabled={b.items.includes(c)}>{c}</option>)}
      </select>
    </section>)}</div>
    {initial.source.length > 0 && <div className="tc-source" aria-label={s.timecourseSource}><span className="field-help">{s.timecourseSource}:</span>
      {initial.source.map((c, i) => <span key={c} className="tc-chip" draggable={!busy} onDragStart={e => { drag.current = {from: '', index: i}; e.dataTransfer.setData('text/plain', c); }}>{c}</span>)}</div>}
    <small className="field-help">{s.timecourseHint}</small>
    <p className="visually-hidden" role="status" aria-live="polite">{said}</p>
  </fieldset>;
}
