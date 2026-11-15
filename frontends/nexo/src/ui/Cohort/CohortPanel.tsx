import { useEffect, useMemo, useRef, useState } from 'react';
import { setCohort, type CohortState } from '../../api';
import { cohortStrings as c } from '../strings';
import { applyPayload, groupByClass, invert, selectAll, setClass, toggle } from './selection';
/** A side sheet like Analysis settings: pick lipids by search and class, then Apply redraws every card. */
export function CohortPanel({sessionId, cohort, readOnly, onClose, onApplied}:{sessionId:string; cohort:CohortState|null; readOnly:boolean; onClose:()=>void; onApplied:(value:CohortState)=>void}) {
 const ref=useRef<HTMLDialogElement>(null), mounted=useRef(true);
 const [query,setQuery]=useState(''), [selected,setSelected]=useState(()=>new Set(cohort?.lipids ?? [])), [busy,setBusy]=useState(false), [error,setError]=useState('');
 useEffect(()=>{ setSelected(new Set(cohort?.lipids ?? [])); },[cohort]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement, dialog=ref.current!; dialog.showModal();
  return ()=>{ mounted.current=false; dialog.close();
   // WebKit does not focus a button on click: return to the trigger when <body> was active.
   const back=previous&&previous!==document.body&&previous.isConnected?previous:document.querySelector<HTMLElement>('[data-cohort-trigger]'); back?.focus(); };
 },[]);
 const available=cohort?.available ?? [], groups=useMemo(()=>groupByClass(available,query),[available,query]);
 const visible=groups.flatMap(g=>g.lipids), payload=applyPayload(selected,available);
 const changed=cohort!==null && payload.join('\n')!==applyPayload(new Set(cohort.lipids),available).join('\n');
 async function apply() {
  setBusy(true); setError('');
  try { const value=await setCohort(sessionId,payload); onApplied(value); }
  catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); }
  finally { if (mounted.current) setBusy(false); }
 }
 const locked=readOnly||busy||!cohort;
 return <dialog className="analysis-sheet cohort-sheet" ref={ref} aria-labelledby="cohort-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <header><h2 id="cohort-title">{c.title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label={c.close}>×</button></header>
  <p className="cohort-intro">{readOnly ? c.viewOnly : c.intro}</p>
  <input type="search" className="cohort-search" aria-label={c.search} placeholder={c.search} value={query} onChange={e=>setQuery(e.target.value)} disabled={!cohort}/>
  <div className="cohort-actions" role="group" aria-label={c.title}>
   <button type="button" disabled={locked||!visible.length} onClick={()=>setSelected(s=>selectAll(s,visible))}>{c.selectAll}</button>
   <button type="button" disabled={locked||!selected.size} onClick={()=>setSelected(new Set())}>{c.clear}</button>
   <button type="button" disabled={locked||!visible.length} onClick={()=>setSelected(s=>invert(s,visible))}>{c.invert}</button>
  </div>
  <p className="cohort-count" aria-live="polite">{cohort ? c.count(payload.length,available.length) : ''}</p>
  <div className="cohort-list" aria-busy={busy}>
   {!cohort && !error && <p role="status">{c.loading}</p>}
   {cohort && !groups.length && <p>{c.none}</p>}
   {groups.map(g=>{ const on=g.lipids.filter(l=>selected.has(l)).length, id=`cohort-class-${g.class.replace(/[^A-Za-z0-9_-]/g,'_')}`;
    return <div key={g.class} role="group" aria-labelledby={id} className="cohort-class">
     <label className="cohort-class-head"><input type="checkbox" aria-label={c.classLabel(g.class)} disabled={locked} checked={on===g.lipids.length} ref={el=>{ if(el) el.indeterminate=on>0&&on<g.lipids.length; }} onChange={e=>setSelected(s=>setClass(s,g.lipids,e.target.checked))}/><span id={id}>{g.class}</span><span className="cohort-class-count">{c.classCount(on,g.lipids.length)}</span></label>
     <ul>{g.lipids.map(l=><li key={l}><label><input type="checkbox" disabled={locked} checked={selected.has(l)} onChange={()=>setSelected(s=>toggle(s,l))}/>{l}</label></li>)}</ul>
    </div>; })}
  </div>
  <p role="status" className="analysis-status">{busy && !error ? c.updating : ''}</p><p role="alert" className="cohort-error">{error}</p>
  <footer><button type="button" onClick={onClose} disabled={busy}>{readOnly ? c.close : c.cancel}</button>{!readOnly && <button type="button" className="primary" disabled={busy||!changed} onClick={()=>void apply()}>{c.apply} ({payload.length})</button>}</footer>
 </dialog>;
}
