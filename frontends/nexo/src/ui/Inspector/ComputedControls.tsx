// Controls Team's module computes at run time (per-group colour/shape, BQC samples, the structural grid's Log2FC threshold): Nexo goes beyond Team's
// canvas card and keeps them in its own checkpoint member; Team still opens the checkpoint and draws its default.
import { useMemo, useRef, useState } from 'react';
import { notifyFailure } from '../model';
import { strings as s, phrases as p } from '../strings';
import { updateCard, type Inputs, type SchemaControl } from '../../api';
import { SearchablePicker } from '../forms/SearchablePicker';
import { splitLabel } from '../forms/schemaForm';
import { isCheckboxGroup, shapeChoices, shapeGlyph, validateComputed } from '../../state/computed';
import { isBucketControl } from '../../timecourse/designer';
import { TimecourseDesigner } from './TimecourseDesigner';
export const isComputedControl = (c: SchemaControl) => c.computed === true;
export function ComputedControls({controls, own, sessionId, instanceId, onCommit, onStatus}: {
  controls: SchemaControl[]; own?: Record<string, unknown>; sessionId: string; instanceId: string;
  /** The PATCH succeeded: record the change (one undo step) with the value it replaced. */
  onCommit: (patch: Inputs, baseline: Inputs) => void; onStatus: (status: string) => void;
}) {
  // A saved value the control no longer offers (e.g. an old plotly name) falls back to Team's value.
  const initial = useMemo(() => { const kept = validateComputed(own, controls); return Object.fromEntries(controls.map(c => [c.id, c.id in kept ? kept[c.id] : c.value ?? c.default ?? (isCheckboxGroup(c.type) ? [] : '')])); }, [controls, own]);
  const [values, setValues] = useState<Inputs>(initial), [invalid, setInvalid] = useState<Record<string, string>>({});
  const committed = useRef<Inputs>(initial), timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function commit(id: string, value: unknown) {
    const before = committed.current[id];
    if (JSON.stringify(before) === JSON.stringify(value)) return;
    committed.current = {...committed.current, [id]: value}; onStatus('Updating…');
    void updateCard(sessionId, instanceId, {[id]: value} as Inputs).then(() => { onCommit({[id]: value} as Inputs, {[id]: before} as Inputs); onStatus('Up to date'); },
      error => { committed.current = {...committed.current, [id]: before}; setValues(v => ({...v, [id]: before})); notifyFailure(s.failUpdate, error); onStatus(s.updateFailed); });
  }
  function change(id: string, value: unknown, delay = 0) {
    setValues(v => ({...v, [id]: value})); clearTimeout(timers.current[id]);
    if (delay) timers.current[id] = setTimeout(() => commit(id, value), delay); else commit(id, value);
  }
  const groups = [...new Set(controls.filter(c => /^custom(Col|Shape)_/.test(c.id)).map(c => c.id.replace(/^custom(Col|Shape)_/, '')))];
  const bqc = controls.find(c => c.id === 'bqcSamples');
  // Numeric renderUI controls (gridLog2fcThresh): sent once the typed value is a number within Team's bounds.
  const numbers = controls.filter(c => c.type === 'number');
  function typed(c: SchemaControl, text: string, delay: number) {
    const n = Number(text), low = c.min ?? -Infinity, high = c.max ?? Infinity;
    if (text.trim() === '' || !Number.isFinite(n) || n < low || n > high) { setValues(v => ({...v, [c.id]: text})); setInvalid(e => ({...e, [c.id]: p.numberBounds(c.min, c.max)})); clearTimeout(timers.current[c.id]); return; }
    setInvalid(e => { const {[c.id]: _gone, ...rest} = e; return rest; }); change(c.id, n, delay);
  }
  const pickers = indexPickers(controls);
  const samples = (bqc?.options ?? []).map(o => o.value), picked = Array.isArray(values.bqcSamples) ? values.bqcSamples as string[] : [];
  // Team's time-course designer buckets (case_bucket_<id>): their own control, one PATCH per move (b10 F4).
  const buckets = controls.filter(isBucketControl), others = controls.length > buckets.length;
  return <div className="computed-controls">
    {buckets.length > 0 && <TimecourseDesigner controls={buckets} own={own} sessionId={sessionId} instanceId={instanceId} onCommit={onCommit} onStatus={onStatus}/>}
    {groups.length > 0 && <fieldset className="computed-groups"><legend>{s.computedGroups}</legend>
      {groups.map(g => { const col = `customCol_${g}`, shape = `customShape_${g}`, shapeControl = controls.find(c => c.id === shape);
        const choices = shapeChoices(shapeControl), current = String(values[shape] || choices[0]?.value || '');
        return <div key={g} className="computed-row" role="group" aria-label={g}>
          <span className="computed-group-name">{g}</span>
          {controls.some(c => c.id === col) && <input type="color" aria-label={p.groupColour(g)} value={String(values[col] || '#000000')} onChange={e => change(col, e.target.value, 300)} onBlur={e => change(col, e.target.value)}/>}
          {shapeControl && <span className="computed-shape"><span className="computed-glyph" aria-hidden="true" style={{color: String(values[col] || 'currentColor')}}>{shapeGlyph(current)}</span>
            <select aria-label={p.groupShape(g)} value={current} onChange={e => { const v = e.target.value; if (Object.keys(validateComputed({[shape]: v}, controls)).length) change(shape, v); }}>{choices.map(o => <option key={o.value} value={o.value}>{`${shapeGlyph(o.value)} ${o.label}`}</option>)}</select></span>}
        </div>; })}
    </fieldset>}
    {bqc && <fieldset className="computed-bqc"><legend>{s.computedBqc}</legend>
      {/* The inspector's long-list picker (search, All/None, one clipped row per sample); picks keep the sample order. */}
      <div className="schema-form"><SearchablePicker id={`computed-bqc-${instanceId}`} label={bqc.label || s.computedBqc} options={bqc.options ?? []} multiple
        value={picked} selectedText={p.bqcSelected} onChange={next => change('bqcSamples', samples.filter(v => (next as string[]).includes(v)))}/></div>
    </fieldset>}
    {pickers.length > 0 && <fieldset className="computed-indices"><legend>{s.computedIndices}</legend>
      {/* FLA's index picker: one checkbox group per category, Team's labels and choices; sent in Team's choice order. */}
      {pickers.map(c => { const picked = Array.isArray(values[c.id]) ? values[c.id] as string[] : [], offered = (c.options ?? []).map(o => o.value);
        return <div key={c.id} className="schema-form computed-index-group"><span className="computed-group-name">{c.label}</span>
          <div className="choice-list" role="group" aria-label={c.label}>
          {(c.options ?? []).map(o => <label key={o.value}><input type="checkbox" value={o.value} checked={picked.includes(o.value)}
            onChange={e => { const on = e.target.checked; change(c.id, offered.filter(v => v === o.value ? on : picked.includes(v))); }}/>{o.label}</label>)}
        </div></div>; })}
    </fieldset>}
    {numbers.length > 0 && <div className="schema-form computed-numbers">{numbers.map(c => { const [title, help] = splitLabel(c.label), id = `computed-${instanceId}-${c.id}`;
      return <div key={c.id} className="field"><label htmlFor={id}>{title}</label>
        <input id={id} type="number" min={c.min} max={c.max} step={c.step} value={String(values[c.id] ?? '')} aria-invalid={invalid[c.id] ? true : undefined}
          aria-describedby={invalid[c.id] ? `${id}-error` : undefined} onChange={e => typed(c, e.target.value, 400)} onBlur={e => typed(c, e.target.value, 0)}/>
        {help && <small className="field-help">{help}</small>}
        {invalid[c.id] && <p id={`${id}-error`} className="field-error" role="alert">{invalid[c.id]}</p>}</div>; })}</div>}
    {others && <small className="field-help computed-hint">{s.computedHint}</small>}
  </div>;
}
/** FLA's index picker (sel_<category>, chart audit b09): the computed checkbox groups other than BQC samples. */
export function indexPickers(controls: SchemaControl[]): SchemaControl[] { return controls.filter(c => isCheckboxGroup(c.type) && c.id !== 'bqcSamples'); }
