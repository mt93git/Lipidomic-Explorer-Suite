import { useEffect, useId, useRef, useState } from 'react';
import { AdminSignInRequired, adminSignInUrl, type DatasetSettings, type PreparationChoices } from '../../api';
import { strings as s, datasetStrings as d } from '../strings';
import { prepareState, setSample, setSamples, setValue, settingsBody, canConfirm, type PrepareField } from '../datasetPrepare';
/** Prepare dataset: the samples and Team's preparation settings a released Admin dataset still needs (422 preparation_choices_required).
 *  Every sample starts ticked and every setting at Team's default; Confirm sends them as the settings body, Cancel opens nothing. */
export function PrepareDatasetDialog({ choices, onConfirm, onCancel }: { choices: PreparationChoices; onConfirm: (settings: DatasetSettings) => Promise<void>; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId(), alive = useRef(true);
  const [state, setState] = useState(() => prepareState(choices));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [signIn, setSignIn] = useState(false);
  useEffect(() => { const previous = document.activeElement as HTMLElement; const dialog = ref.current!; dialog.showModal(); return () => { alive.current = false; dialog.close(); previous?.focus(); }; }, []);
  async function confirm() {
    if (!canConfirm(state)) { setError(d.noSamples); return; }
    setBusy(true); setError(''); setSignIn(false);
    try { await onConfirm(settingsBody(state)); }
    catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : String(e)); setSignIn(e instanceof AdminSignInRequired); } }
    finally { if (alive.current) setBusy(false); }
  }
  const fieldId = (f: PrepareField) => `${id}-${f.name}`;
  function field(f: PrepareField) {
    const value = state.values[f.name], change = (raw: string | boolean) => setState(prev => setValue(prev, f.name, raw));
    if (f.kind === 'boolean') return <div className="field field-boolean" key={f.name}><input id={fieldId(f)} type="checkbox" checked={!!value} onChange={e => change(e.target.checked)}/><label htmlFor={fieldId(f)}>{f.label}</label></div>;
    return <div className="field" key={f.name}><label htmlFor={fieldId(f)}>{f.label}</label>
      {f.kind === 'number' ? <div className="range-single">
          <input id={fieldId(f)} type="range" min={f.min} max={f.max} step={f.step} value={String(value ?? '')} onChange={e => change(e.target.value)}/>
          <output htmlFor={fieldId(f)} aria-live="polite">{String(value ?? '')}</output>
        </div>
      : f.kind === 'choice' ? <select id={fieldId(f)} value={String(value ?? '')} onChange={e => change(e.target.value)}>{(f.choices ?? []).map(c => <option key={c} value={c}>{c}</option>)}</select>
      : <input id={fieldId(f)} type="text" value={String(value ?? '')} onChange={e => change(e.target.value)}/>}
    </div>;
  }
  return <dialog ref={ref} className="prepare-dialog" aria-labelledby={id} onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <form className="schema-form" onSubmit={e => { e.preventDefault(); if (!busy) void confirm(); }}>
      <h2 id={id}>{d.title}</h2>
      <p>{d.intro}</p>
      <fieldset disabled={busy}><legend>{d.samples}</legend>
        <div className="selection-list" role="group" aria-label={d.samples}>
          <div className="selection-actions"><button type="button" onClick={() => setState(prev => setSamples(prev, prev.samples))}>{s.selectAll}</button><button type="button" onClick={() => setState(prev => setSamples(prev, []))}>{s.selectNone}</button><span className="selection-count" aria-live="polite">{d.selectedCount(state.selected.length, state.samples.length)}</span></div>
          <div className="choice-list">{state.samples.map((name, index) => <label key={name}><input type="checkbox" name="samples" value={name} autoFocus={index === 0} checked={state.selected.includes(name)} onChange={e => setState(prev => setSample(prev, name, e.target.checked))}/>{name}</label>)}</div>
        </div>
      </fieldset>
      <fieldset disabled={busy}><legend>{d.settings}</legend>{state.fields.map(field)}</fieldset>
      <p role="alert">{error}</p>{signIn && <a className="primary sign-in" href={adminSignInUrl(location.href)}>{d.signIn}</a>}
      <footer><button type="button" disabled={busy} onClick={onCancel}>{s.cancel}</button><button className="primary" disabled={busy || !canConfirm(state)} aria-busy={busy || undefined}>{busy ? d.preparing : d.open}</button></footer>
    </form>
  </dialog>;
}
