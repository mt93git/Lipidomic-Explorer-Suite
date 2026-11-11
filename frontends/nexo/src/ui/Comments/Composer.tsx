import { useLayoutEffect, useRef, useState } from 'react';
import { findMention, insertMention, matching, mentioned, org, type Person } from '../../collab/comments';
/** A box for a new comment or a reply: Send hands over the trimmed text and the people it @mentions, then clears the box.
 *  Typing "@" opens a picker of `people` (prototype-v2 scene 3), filtered as you type: Up/Down move, Enter or a click
 *  inserts "@Name", Escape closes it. Without people (the list could not load) there is no picker and plain text works. */
export function Composer({ label, action, onSend, autoFocus = false, people = [] }: { label: string; action: string; onSend(text: string, mentions: string[]): void; autoFocus?: boolean; people?: Person[] }) {
  const [text, setText] = useState(''), [caret, setCaret] = useState(0), [active, setActive] = useState(0), [closed, setClosed] = useState(false);
  const [picked, setPicked] = useState<Person[]>([]), box = useRef<HTMLTextAreaElement>(null), moveTo = useRef<number | null>(null);
  useLayoutEffect(() => { if (moveTo.current !== null) { box.current?.setSelectionRange(moveTo.current, moveTo.current); moveTo.current = null; } });
  const at = closed ? null : findMention(text, caret), options = at ? matching(people, at.query).slice(0, 8) : [];
  const index = Math.min(active, options.length - 1);
  function pick(person: Person) {
    const next = insertMention(text, at!, person);
    setText(next.text); setCaret(next.caret); moveTo.current = next.caret; setPicked([...picked, person]); setActive(0);
  }
  function key(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!options.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setActive((index + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    else if (e.key === 'Enter' && !e.shiftKey) pick(options[index]);
    else if (e.key === 'Escape') { setClosed(true); e.stopPropagation(); }
    else return;
    e.preventDefault();
  }
  return <div style={{ display: 'grid', gap: 6, position: 'relative' }}>
    <textarea ref={box} aria-label={label} autoFocus={autoFocus} rows={3} value={text} aria-autocomplete="list" aria-expanded={options.length > 0}
      onChange={e => { setText(e.target.value); setCaret(e.target.selectionStart); setClosed(false); setActive(0); }}
      onSelect={e => setCaret(e.currentTarget.selectionStart)} onKeyDown={key}/>
    {options.length > 0 && <div role="listbox" aria-label="Mention someone" style={{ position: 'absolute', left: 8, top: 40, zIndex: 2, minWidth: 200, padding: 4, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)' }}>
      {options.map((p, i) => <div key={p.userId} role="option" aria-selected={i === index} onMouseDown={e => { e.preventDefault(); pick(p); }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: i === index ? 'var(--tint)' : undefined }}>
        <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 9, background: '#7256b5', color: '#fff', font: '700 8px/18px system-ui', textAlign: 'center' }}>{p.displayName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
        {p.displayName} <small style={{ color: 'var(--muted)' }}>{org(p.kind)}</small>
      </div>)}
    </div>}
    <div className="actions"><button type="button" className="primary" disabled={!text.trim()} onClick={() => { onSend(text.trim(), mentioned(text, picked)); setText(''); setPicked([]); }}>{action}</button></div>
  </div>;
}
