import { useId, useRef, useState, useEffect, useLayoutEffect } from 'react';
import { strings as s, phrases as p, pickerStrings as t } from '../strings';
import { filterOptions, optionClasses, toggleOptions, type PickerOption } from './pickerFilter';
import { moveActive, wholeRows } from './pickerKeys';
import './SearchablePicker.css';

function ClassToggle({name, options, selected, onChange}: {name: string; options: string[]; selected: string[]; onChange: (next: string[]) => void}) {
  const ref = useRef<HTMLInputElement>(null);
  const count = options.filter(v => selected.includes(v)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < options.length; }, [count, options.length]);
  return <label className="picker-class"><input ref={ref} type="checkbox" aria-label={t.classLabel(name)} checked={count === options.length}
    onChange={() => onChange(toggleOptions(selected, options))}/>{name} <span>{p.selectedOf(count,options.length)}</span></label>;
}

const Magnifier = () => <svg className="picker-icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="14" height="14">
  <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
const Check = () => <svg className="picker-check" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="14" height="14">
  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;

/** Keep a row inside the list's scroll box without scrolling the inspector around it. */
function reveal(list: HTMLElement | null, row: HTMLElement | null) {
  if (!list || !row) return;
  const top = row.offsetTop, bottom = top + row.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}

/** One bordered control: a filter field (count on its row) over a listbox (single) or checkbox rows (multiple). */
export function SearchablePicker({id, label, options, value, multiple, onChange, onDefault, selectedText}: {
  id: string; label: string; options: PickerOption[]; value: string | string[]; multiple: boolean;
  onChange: (next: string | string[]) => void; onDefault?: () => void;
  /** Own wording for the selection count ("2 of 66 samples selected"), announced as a live status. */
  selectedText?: (n: number, total: number) => string;
}) {
  const [query, setQuery] = useState(''), [active, setActive] = useState<string>(), uid = useId();
  const filtered = filterOptions(options,query), selected = Array.isArray(value) ? value : [];
  const listId = `${uid}-choices`, statusId = `${uid}-status`, list = useRef<HTMLDivElement>(null);
  const optionId = (v: string) => `${uid}-option-${options.findIndex(o => o.value === v)}`;
  const current = !multiple && filtered.some(o => o.value === active) ? active : !multiple && filtered.some(o => o.value === value) ? value as string : undefined;
  const status = <span id={statusId} aria-live="polite" className="picker-result-count">{filtered.length ? p.selectedOf(filtered.length,options.length) : t.noMatches}</span>;
  // The selected value is in view when the picker opens; the active option follows the keys.
  useLayoutEffect(() => { if (!multiple && list.current) reveal(list.current, list.current.querySelector<HTMLElement>('[aria-selected=true]')); }, [multiple]);
  useLayoutEffect(() => { if (current && list.current) reveal(list.current, document.getElementById(optionId(current))); });
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); return; }
    if (multiple) return;
    if (e.key === 'Enter') { e.preventDefault(); if (current && current !== value) onChange(current); return; }
    const next = moveActive(e.key, filtered.findIndex(o => o.value === current), filtered.length);
    if (next === null) return;
    e.preventDefault(); setActive(filtered[next].value);
  }
  return <div className={`searchable-picker${multiple ? ' is-multiple' : ''}`} role="group" aria-label={label}>
    <div className="picker-frame">
      <div className="picker-search">
        <Magnifier/>
        <input id={multiple ? id : `${uid}-filter`} type="search" aria-label={t.filterLabel(label)} placeholder={t.filter}
          aria-controls={multiple ? listId : id} aria-activedescendant={current ? optionId(current) : undefined} autoComplete="off"
          value={query} onChange={e => { setQuery(e.target.value); setActive(undefined); }} onKeyDown={onKey}/>
        {status}
      </div>
      {multiple && <div className="picker-toolbar">
        <div className="selection-actions">
          <button type="button" onClick={() => onChange(options.map(o => o.value))}>{s.selectAll}</button>
          {onDefault && <button type="button" onClick={onDefault}>{s.selectDefault}</button>}
          <button type="button" onClick={() => onChange([])}>{s.selectNone}</button>
          {selectedText ? <span className="selection-count" role="status" aria-live="polite">{selectedText(selected.length,options.length)}</span>
            : <span className="selection-count">{p.selectedOf(selected.length,options.length)}</span>}
        </div>
        <div className="picker-classes choice-list">{optionClasses(options).map(name => <ClassToggle key={name} name={name}
          options={options.filter(o => o.class === name).map(o => o.value)} selected={selected} onChange={onChange}/>)}</div>
      </div>}
      {multiple ? <div id={listId} ref={list} className="choice-list picker-list" aria-describedby={statusId} hidden={!filtered.length}
        style={{'--picker-rows': wholeRows(filtered.length)} as React.CSSProperties}>
        {filtered.map(o => <label key={o.value} className="picker-option"><input type="checkbox" checked={selected.includes(o.value)}
          onChange={() => onChange(toggleOptions(selected,[o.value]))}/><span className="picker-label" title={o.label}>{o.label}</span></label>)}
      </div> : <div id={id} ref={list} role="listbox" aria-label={label} aria-describedby={statusId} tabIndex={-1} className="picker-list"
        data-value={value as string} hidden={!filtered.length} style={{'--picker-rows': wholeRows(filtered.length)} as React.CSSProperties}>
        {filtered.map(o => <div key={o.value} id={optionId(o.value)} role="option" aria-selected={o.value === value}
          className={`picker-option${o.value === current ? ' is-active' : ''}`}
          onMouseDown={e => e.preventDefault()} onClick={() => { setActive(o.value); if (o.value !== value) onChange(o.value); }}>
          <span className="picker-label">{o.label}</span><Check/></div>)}
      </div>}
      {!filtered.length && <p className="picker-empty" aria-hidden="true">{t.noMatches}</p>}
    </div>
  </div>;
}
