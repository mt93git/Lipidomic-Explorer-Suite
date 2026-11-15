import { useEffect, useState } from 'react';
import { getCohort, setCohort, type CohortState } from '../../api';
import { isReadOnly } from '../../state/readonly';
import { notify, notifyFailure } from '../model';
import { cohortStrings as c } from '../strings';
import { CohortPanel } from './CohortPanel';
import './cohort.css';
/** The "Targeted lipids" action and, while a cohort is active, its chip in the canvas header. */
export function CohortEntry({sessionId, onChanged}:{sessionId:string; onChanged?:()=>void}) {
 const [cohort,setState]=useState<CohortState|null>(null), [open,setOpen]=useState(false), [clearing,setClearing]=useState(false), readOnly=isReadOnly();
 useEffect(()=>{ let live=true; setState(null); void getCohort(sessionId,{background:true}).then(v=>{ if(live) setState(v); }).catch(()=>{ /* The panel retries when opened. */ }); return ()=>{ live=false; }; },[sessionId]);
 useEffect(()=>{ if(open&&!cohort) void getCohort(sessionId).then(setState).catch(e=>notifyFailure(c.loading,e)); },[open,cohort,sessionId]);
 function accepted(value:CohortState) { setState(value); onChanged?.(); notify(c.applied(value.lipids.length)); }
 async function clear() {
  setClearing(true);
  try { accepted(await setCohort(sessionId,[])); } catch (e) { notifyFailure(c.failClear,e); } finally { setClearing(false); }
 }
 const count=cohort?.active ? cohort.lipids.length : 0;
 return <div className="cohort-entry">
  <button type="button" data-cohort-trigger onClick={()=>setOpen(true)}>{c.title}</button>
  {count>0 && <span className="cohort-chip"><button type="button" onClick={()=>setOpen(true)} aria-label={`${c.chip(count)}. ${c.title}`}>{c.chip(count)}</button>{!readOnly && <button type="button" disabled={clearing} onClick={()=>void clear()} aria-label={c.clearCohort} title={c.clearCohort}>×</button>}</span>}
  {open && <CohortPanel sessionId={sessionId} cohort={cohort} readOnly={readOnly} onClose={()=>setOpen(false)} onApplied={value=>{ setOpen(false); accepted(value); }}/>}
 </div>;
}
