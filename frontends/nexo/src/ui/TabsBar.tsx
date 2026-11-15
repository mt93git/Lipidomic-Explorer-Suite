import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as model from '../state/tabs';
import { useShell, notify } from './model';
import { Menu } from './Menu';
import { Confirm } from './Dialogs/Confirm';
import { strings as s, phrases as m } from './strings';
import { isReadOnly } from '../state/readonly';
export function TabsBar({ editTabs, duplicate, remove, activate }: {
  editTabs(edit: (next: model.TabState) => void): void;
  duplicate(id: string): void;
  remove(id: string, target: string | null): void;
  activate(id: string): void;
}) {
  const drag = useRef<{ id: string; x: number; pointer: number } | null>(null);
  const { tabs } = useShell(), [editing, setEditing] = useState<string | null>(null), [name, setName] = useState('');
  const [deleting, setDeleting] = useState(false), [destination, setDestination] = useState('');
  const active = model.tabOf(tabs, tabs.active), index = tabs.tabs.indexOf(active);
  const readOnly = isReadOnly();
  const rename = (id: string) => { if (readOnly) return; setEditing(id); setName(model.tabOf(tabs, id).name); };
  // H9: many tabs scroll in one row with edge fades; the active tab is kept in view and "All tabs" lists them all.
  const strip = useRef<HTMLDivElement>(null), [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => { const el = strip.current; if (!el) return; const left = el.scrollLeft > 1, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges(e => e.left === left && e.right === right ? e : { left, right }); };
  useLayoutEffect(measure);
  useEffect(() => { const el = strip.current!, observer = new ResizeObserver(measure); observer.observe(el); return () => observer.disconnect(); }, []);
  useEffect(() => {
    const el = strip.current, tab = document.getElementById(tabs.active); if (!el || !tab || !el.contains(tab)) return;
    const pad = 28, left = tab.offsetLeft - el.offsetLeft, right = left + tab.offsetWidth;
    const to = left - pad < el.scrollLeft ? left - pad : right + pad > el.scrollLeft + el.clientWidth ? right + pad - el.clientWidth : null;
    if (to !== null) el.scrollTo({ left: Math.max(0, to), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [tabs.active, tabs.tabs.map(t => t.name).join('\n')]);
  const finish = () => { const clean = model.cleanName(name); if (editing && clean && clean !== model.tabOf(tabs, editing).name) { editTabs(t => { model.rename(t, editing, name); }); notify(m.tabRenamed(clean)); } setEditing(null); };

  return <div className="tabsbar" onPointerMove={e => {
    const d = drag.current; if (!d || d.pointer !== e.pointerId || Math.abs(e.clientX - d.x) < 8) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[role="tab"]');
    const at = tabs.tabs.findIndex(t => t.id === hit?.id);
    if (at >= 0 && hit?.id !== d.id) { editTabs(t => { model.reorder(t, d.id, at); }); d.x = e.clientX; }
  }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><div ref={strip} onScroll={measure} className={`tablist${edges.left ? ' fade-left' : ''}${edges.right ? ' fade-right' : ''}`} role="tablist" aria-label={s.tabs}>
    {tabs.tabs.map((tab, i) => editing === tab.id ? <input key={tab.id} autoFocus aria-label={s.tabName} value={name} maxLength={40} onChange={e => setName(e.target.value)} onBlur={finish} onKeyDown={e => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') { e.preventDefault(); setEditing(null); } }}/>
      : <button key={tab.id} role="tab" title={tab.name} style={{ touchAction: 'none' }} onPointerDown={e => {
        if (e.button !== 0 || readOnly) return;
        drag.current = { id: tab.id, x: e.clientX, pointer: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }} id={tab.id} aria-controls="canvas-host" aria-selected={tab.id === tabs.active} tabIndex={tab.id === tabs.active ? 0 : -1} onClick={() => activate(tab.id)} onDoubleClick={() => rename(tab.id)} onKeyDown={e => {
        if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); rename(tab.id); }
        if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.tabs.length) % tabs.tabs.length; activate(tabs.tabs[n].id); document.getElementById(tabs.tabs[n].id)?.focus(); }
      }}><span className="tab-name">{tab.name}</span><span className="badge">{tab.nodes.length}</span></button>)}
    </div>{(edges.left || edges.right) && <div className="all-tabs"><Menu label={s.allTabsIcon} name={s.allTabs}>
      {tabs.tabs.map(tab => <button key={tab.id} className="tab-option" aria-current={tab.id === tabs.active ? 'true' : undefined} onClick={() => activate(tab.id)}><span className="tab-name">{tab.name}</span><span className="badge">{tab.nodes.length}</span></button>)}
    </Menu></div>}{!readOnly && <><button aria-label={s.addTab} data-tip={s.addTab} disabled={tabs.tabs.length >= model.MAX_TABS} onClick={() => editTabs(t => { model.addTab(t); })}>{s.plus}</button>
    <Menu label={s.more} name={s.tabActions}>
      <button onClick={() => rename(active.id)}>{s.rename}</button>
      <button disabled={tabs.tabs.length >= model.MAX_TABS} onClick={() => {
        duplicate(active.id); notify(m.tabDuplicated(active.name));
      }}>{s.duplicate}</button>
      <button disabled={index === 0} onClick={() => editTabs(t => { model.reorder(t, active.id, index - 1); })}>{s.left}</button>
      <button disabled={index === tabs.tabs.length - 1} onClick={() => editTabs(t => { model.reorder(t, active.id, index + 1); })}>{s.right}</button>
      <button disabled={tabs.tabs.length === 1} onClick={() => { setDestination(tabs.tabs.find(t => t.id !== active.id)!.id); setDeleting(true); }}>{s.delete}</button>
    </Menu></>}
    {deleting && <Confirm destructive title={`${s.deleteTab}: ${active.name}`} onCancel={() => setDeleting(false)} onConfirm={() => { const count = active.nodes.length, target = tabs.tabs.find(t => t.id === destination)?.name; remove(active.id, destination || null); setDeleting(false); notify(m.tabDeleted(active.name, count, target)); }}>
      <p className="muted">{m.tabHolds(active.nodes.length)}</p>
      <label><input type="radio" name="cards" checked={!!destination} onChange={() => setDestination(tabs.tabs.find(t => t.id !== active.id)!.id)}/>{s.moveCards}
        <select aria-label={s.moveCards} value={destination} onChange={e => setDestination(e.target.value)}>{!destination && <option value=""/>}{tabs.tabs.filter(t => t.id !== active.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label><input type="radio" name="cards" checked={!destination} onChange={() => setDestination('')}/>{s.removeCards}</label>
    </Confirm>}
  </div>;
}
