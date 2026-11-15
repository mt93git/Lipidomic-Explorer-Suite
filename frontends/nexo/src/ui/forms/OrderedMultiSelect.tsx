import { useRef, useState } from 'react';
import type { SchemaControl } from '../../api';
import { strings as s } from '../strings';
import { moveOrderedItem } from './orderedSelection';
import './orderedSelection.css';

export function OrderedMultiSelect({control, value, onChange}: {
  control: SchemaControl; value: string[]; onChange: (value: string[]) => void;
}) {
  const rows = useRef(new Map<string, HTMLLIElement>()), dragged = useRef<string | null>(null);
  const [announcement, announce] = useState('');
  const options = control.options ?? [], label = (key: string) => options.find(o => o.value === key)?.label ?? key;
  function move(from: number, to: number) {
    const next = moveOrderedItem(value, from, to);
    if (next === value) return;
    onChange(next);
    announce(`${label(value[from])}. ${s.orderedPosition} ${to + 1} ${s.orderedOf} ${next.length}.`);
    // The keyed row follows the item; keep keyboard focus on that item after moving.
    rows.current.get(value[from])?.focus();
  }
  return <div className="ordered-selection" role="group" aria-label={control.label}>
    <small id={`${control.id}-order-help`}>{s.orderedHint}</small>
    <ol aria-label={control.label} aria-describedby={`${control.id}-order-help`}>
      {value.map((key, index) => <li key={key} tabIndex={0} draggable
        ref={el => { if (el) rows.current.set(key, el); else rows.current.delete(key); }}
        aria-label={`${label(key)}, ${s.orderedPosition} ${index + 1} ${s.orderedOf} ${value.length}`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        onKeyDown={e => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); move(index, index + (e.key === 'ArrowUp' ? -1 : 1)); } }}
        onDragStart={e => { dragged.current = key; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); }}
        onDragEnd={() => { dragged.current = null; }}
        onDragOver={e => { if (dragged.current !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
        onDrop={e => { if (dragged.current === null) return; e.preventDefault(); e.stopPropagation(); move(value.indexOf(dragged.current), index); dragged.current = null; }}>
        <span className="ordered-selection-label">{label(key)}</span>
        <div className="ordered-selection-actions">
          <button type="button" aria-label={`${s.orderedUp}: ${label(key)}`} disabled={index === 0} onClick={() => move(index, index - 1)}>{s.orderedUp}</button>
          <button type="button" aria-label={`${s.orderedDown}: ${label(key)}`} disabled={index === value.length - 1} onClick={() => move(index, index + 1)}>{s.orderedDown}</button>
          <button type="button" aria-label={`${s.orderedRemove}: ${label(key)}`} onClick={() => {
            onChange(value.filter(v => v !== key)); announce(`${s.orderedRemove}: ${label(key)}`);
            const next = value[index + 1] ?? value[index - 1];
            if (next) rows.current.get(next)?.focus(); else document.getElementById(control.id)?.focus();
          }}>{s.orderedRemove}</button>
        </div>
      </li>)}
    </ol>
    <select id={control.id} aria-label={`${s.orderedAdd}: ${control.label}`} value="" disabled={options.every(o => value.includes(o.value))}
      onChange={e => { if (e.target.value) { onChange([...value, e.target.value]); announce(label(e.target.value)); } }}>
      <option value="" disabled>{s.orderedChoose}</option>
      {options.filter(o => !value.includes(o.value)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <span className="ordered-selection-status" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </div>;
}
