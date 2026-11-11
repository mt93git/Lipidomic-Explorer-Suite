import { collab } from '../../collab/mode';
import { notifyFailure } from '../model';
import { strings as s } from '../strings';
import { useEffect, useRef, useState } from 'react';
import { updateCard, type CardSchema, type Inputs, type SchemaControl } from '../../api';
import { OrderedMultiSelect } from './OrderedMultiSelect';
import { isOrderedMultiSelect, coerceValue, controlsByGroup, diffInputs, groupTitle, isRangePair, splitLabel, choiceStates, statusNote, schemaRefreshNeeded } from './schemaForm';
import { readSelection, writeSelection } from './selection';
import { phrases as p } from '../strings';
import { addedControlValues, formControls, pressAction, type ModuleDialog as Dialog } from './actions';
import { SearchablePicker } from './SearchablePicker';
import { isLongPicker } from './pickerFilter';
import { ModuleDialog } from '../Dialogs/ModuleDialog';
export function SchemaForm({schema, sessionId, instanceId, onUpdated, onStatus, onActed, draftValues, onDraftChange}: {
  draftValues?: Inputs; onDraftChange?: (inputs: Inputs) => void;
  schema: CardSchema; sessionId: string; instanceId: string;
  onUpdated: (inputs: Inputs, refresh: boolean) => Promise<void>; onStatus: (status: string) => void;
  /** A module button was pressed: the card redraws with these inputs (not an undo step). */
  onActed?: (inputs: Inputs, action: string) => Promise<void>;
}) {
  useEffect(() => () => { if (collab()) void import('../../collab/provider').then(m => m.getAwareness()?.setLocalStateField('editing', null)); }, []);
  const initial: Inputs = Object.fromEntries(schema.controls.filter(c => c.type !== 'action').map(c => [c.id,coerceValue(c,c.value ?? c.default ?? (c.multiple || c.type === 'multiselect' || c.type === 'checkboxgroup' ? [] : c.type === 'boolean' ? false : ''))]));
  const [values, setValues] = useState<Inputs>(initial);
  const saved = useRef(initial), latest = useRef(initial), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef(Promise.resolve()), alive = useRef(true), revision = useRef(0);
  const [busy, setBusy] = useState<string | null>(null), [dialog, setDialog] = useState<Dialog | undefined>();
  // Leaving the form (another Inspector tab, another card) within the debounce sends the pending change instead of
  // dropping it (chart audit round 2: a Data change then Appearance at once never reached the server).
  const flush = useRef<() => void>(() => {});
  useEffect(() => () => { alive.current = false; if (timer.current !== undefined) { clearTimeout(timer.current); timer.current = undefined; flush.current(); } }, []);
  // A module button built new controls (b07 F4: "Select Shifts to Visualize:"): they join the form with their value, no remount.
  useEffect(() => {
    const added = addedControlValues(schema, latest.current);
    if (!Object.keys(added).length) return;
    const coerced: Inputs = Object.fromEntries(schema.controls.filter(c => c.id in added).map(c => [c.id, coerceValue(c, added[c.id])]));
    latest.current = {...latest.current, ...coerced}; saved.current = {...saved.current, ...coerced}; setValues(latest.current);
  }, [schema]);
  // A module button (Team's live module UI): pending edits go first, then the action alone.
  function act(id: string) {
    clearTimeout(timer.current); timer.current = undefined; submit(); setBusy(id); onStatus('Updating…');
    chain.current = chain.current.then(async () => {
      try {
        const shown = await pressAction(sessionId, instanceId, id, async inputs => { saved.current = inputs; await (onActed ? onActed(inputs, id) : onUpdated(inputs, false)); });
        if (!alive.current) return;
        onStatus('Up to date'); if (shown) setDialog(shown);
      } catch (error) { if (alive.current) { notifyFailure(s.failAction, error); onStatus(s.updateFailed); } }
      finally { if (alive.current) setBusy(null); }
    });
  }
  function submit(actions: string[] = []) {
    const next = {...latest.current}, version = revision.current;
    chain.current = chain.current.then(async () => {
      const patch = diffInputs(saved.current, next);
      try {
        const result = await updateCard(sessionId, instanceId, patch, actions);
        saved.current = result.inputs;
        await onUpdated(result.inputs, schemaRefreshNeeded(schema.controls, patch));
        if (alive.current && version === revision.current) onStatus('Up to date');
      } catch (error) { if (alive.current) { notifyFailure(s.failUpdate, error); onStatus(s.updateFailed); } }
    });
  }
  function change(c: SchemaControl, raw: unknown) {
    if (onDraftChange) { onDraftChange({[c.id]:coerceValue(c,raw)}); return; }
    latest.current = {...latest.current,[c.id]:coerceValue(c,raw)};
    setValues(latest.current); revision.current++; onStatus('Updating…');
    clearTimeout(timer.current); timer.current = setTimeout(() => { timer.current = undefined; submit(); },250);
  }
  flush.current = () => submit();
  function control(c: SchemaControl) {
    const value = (draftValues ?? values)[c.id], options = c.options ?? [];
    if (isLongPicker(c)) {
      const choices = options.map(o => o.value), encoded = c.type === 'text';
      const multiple = encoded || c.type === 'multiselect' || c.type === 'checkboxgroup' || !!c.multiple;
      return <SearchablePicker id={c.id} label={splitLabel(c.label)[0]} options={options} multiple={multiple}
        value={encoded ? readSelection(value, choices, c.defaultChoices) : multiple ? (Array.isArray(value) ? value as string[] : []) : String(value ?? '')}
        onChange={next => change(c, encoded ? writeSelection(next as string[], choices, c.allToken) : next)}
        onDefault={encoded && c.defaultChoices?.length ? () => change(c, '__ALL__') : undefined}/>;
    }
    if (c.type === 'action') return <button type="button" className="module-action" disabled={busy !== null} aria-busy={busy === c.id} onClick={() => act(c.id)}>{c.label}</button>;
    // A radio with Team's status note (heat_significance): the gated option disabled and described by the note.
    if (c.type === 'radio' && c.status) return <div id={c.id} className="choice-list" role="radiogroup" aria-label={c.label || undefined}>{choiceStates(c, value).map(o =>
      <label key={o.value} className={o.disabled ? 'choice-disabled' : undefined}><input type="radio" name={c.id} value={o.value} checked={o.checked} disabled={o.disabled} aria-describedby={o.describedBy} onChange={() => change(c,o.value)}/>{o.label}</label>)}</div>;
    if (c.type === 'tabs' || c.type === 'radio' || c.type === 'checkboxgroup') return <div className={c.type === 'tabs' ? 'segmented' : 'choice-list'} role={c.type === 'tabs' ? 'group' : undefined} aria-label={c.label}>{options.map(o => c.type === 'tabs' ?
      <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => change(c,o.value)}>{o.label}</button> :
      <label key={o.value}><input type={c.type === 'radio' ? 'radio' : 'checkbox'} name={c.id} checked={c.type === 'radio' ? value === o.value : Array.isArray(value) && value.includes(o.value)} onChange={e => change(c,c.type === 'radio' ? o.value : e.target.checked ? [...(Array.isArray(value) ? value : []),o.value] : (Array.isArray(value) ? value : []).filter(v => v !== o.value))}/>{o.label}</label>)}</div>;
    if (c.type === 'select' || c.type === 'multiselect') return isOrderedMultiSelect(c) ? <OrderedMultiSelect control={c} value={Array.isArray(value) ? value as string[] : []} onChange={next => change(c,next)}/> : <select id={c.id} multiple={c.type === 'multiselect' || c.multiple} value={value as string | string[]} onChange={e => change(c,e.target.multiple ? Array.from(e.target.selectedOptions,o => o.value) : e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    if (c.type === 'text' && options.length) {
      // A Team dashboard selection bar: checkboxes over the choices, written back as Team's token or JSON array.
      const choices = options.map(o => o.value), picked = readSelection(value, choices, c.defaultChoices);
      const set = (next: string[]) => change(c, writeSelection(next, choices, c.allToken));
      return <div className="selection-list" role="group" aria-label={c.label ?? undefined}>
        <div className="selection-actions"><button type="button" onClick={() => set(choices)}>{s.selectAll}</button>
          {c.defaultChoices?.length ? <button type="button" onClick={() => change(c, '__ALL__')}>{s.selectDefault}</button> : null}
          <button type="button" onClick={() => set([])}>{s.selectNone}</button><span className="selection-count">{p.selectedOf(picked.length, choices.length)}</span></div>
        <div className="choice-list">{options.map(o => <label key={o.value}><input type="checkbox" checked={picked.includes(o.value)} onChange={e => set(e.target.checked ? [...picked, o.value] : picked.filter(v => v !== o.value))}/>{o.label}</label>)}</div>
      </div>;
    }
    if (isRangePair(c)) {
      // Two ends, as Team's two-handled slider: each end is its own number field; the pair is sent together.
      const ends = Array.isArray(value) ? value as number[] : Array.isArray(c.default) ? c.default as number[] : [c.min ?? 0, c.max ?? 0];
      return <div className="range-pair" role="group" aria-label={c.label ?? undefined}>
        <label>{s.rangeFrom}<input id={c.id} type="number" min={c.min} max={c.max} step={c.step} value={String(ends[0] ?? '')} onChange={e => change(c,[e.target.value, ends[1]])}/></label>
        <label>{s.rangeTo}<input type="number" min={c.min} max={c.max} step={c.step} value={String(ends[1] ?? '')} onChange={e => change(c,[ends[0], e.target.value])}/></label>
      </div>;
    }
    if (c.type === 'textarea') return <textarea id={c.id} value={String(value ?? '')} onChange={e => change(c,e.target.value)}/>;
    // One-ended slider: the current value is printed beside it, as Team's sliderInput does.
    if (c.type === 'range') return <div className="range-single">
      <input id={c.id} type="range" min={c.min} max={c.max} step={c.step} value={String(value ?? '')} onChange={e => change(c,e.target.value)}/>
      <output htmlFor={c.id} aria-live="polite">{String(value ?? '')}</output>
    </div>;
    return <input id={c.id} type={c.type === 'boolean' ? 'checkbox' : c.type} min={c.min} max={c.max} step={c.step} {...(c.type === 'boolean' ? {checked:!!value} : {value:String(value ?? '')})} onChange={e => change(c,c.type === 'boolean' ? e.target.checked : e.target.value)}/>;
  }
  // Team's note under the control (role=status, as Team's <p class="rd-heat-significance-note">).
  const noteFor = (c: SchemaControl) => { const note = statusNote(c); return note ? <p className="control-status-note" id={note.id} role="status" data-allowed={String(note.allowed)}>{note.text}</p> : null; };
  return <form className="schema-form" onFocus={e => { const field = (e.target as HTMLElement).closest('.field')?.querySelector('label[for]')?.getAttribute('for'); if (collab() && field) void import('../../collab/provider').then(m => (() => { const awareness = m.getAwareness(), nodeId = awareness?.getLocalState()?.selection?.[0]; if (nodeId) awareness?.setLocalStateField('editing', { nodeId, field }); })()); }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null) && collab()) void import('../../collab/provider').then(m => m.getAwareness()?.setLocalStateField('editing', null)); }} onSubmit={e => e.preventDefault()}>{Object.entries(controlsByGroup(formControls(schema))).map(([group,controls]) => <fieldset key={group}>{group && <legend>{groupTitle(group, controls)}</legend>}{controls.map(c => { const [title, help] = splitLabel(c.label); return <div key={c.id} className={`field field-${c.type}`}>{c.type !== 'action' && <label htmlFor={c.id}>{title}</label>}{control(c)}{help && c.type !== 'action' && <small className="field-help" id={`${c.id}-help`}>{help}</small>}{noteFor(c)}</div>; })}</fieldset>)}{dialog && <ModuleDialog dialog={dialog} onClose={() => setDialog(undefined)}/>}</form>;
}
