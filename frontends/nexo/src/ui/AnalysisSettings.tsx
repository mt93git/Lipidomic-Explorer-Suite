import { useEffect, useReducer, useRef, useState } from 'react';
import { getAnalysis, updateAnalysis, type AnalysisSettings as Settings, type Session } from '../api';
import { SchemaForm } from './forms/SchemaForm.jsx';
import { diffInputs } from './forms/schemaForm';
import { analysisReducer, analysisValues, conditionVisible } from './analysisDraft';
import { notify, ui } from './model';
import { Toast } from './Toast';
import { strings as s } from './strings';
import { withTimePoints } from '../catalog';
export function AnalysisSettings({session, onClose, onApplied}: {session:Session; onClose:()=>void; onApplied:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 const [schema,setSchema]=useState<Settings|null>(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
 const [state,dispatch]=useReducer(analysisReducer,{applied:{},draft:{}});
 const mounted=useRef(true);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement, dialog=ref.current!;dialog.showModal();
  const restored=(event:Event)=>{const value=(event as CustomEvent<Settings>).detail;setSchema(value);dispatch({type:'apply',inputs:analysisValues(value)});};
  window.addEventListener('nexo-analysis-restored',restored);
  void getAnalysis(session.sessionId).then(value=>{if(!mounted.current)return;setSchema(value);dispatch({type:'apply',inputs:analysisValues(value)});}).catch(e=>setError(e.message));
  return()=>{mounted.current=false;window.removeEventListener('nexo-analysis-restored',restored);dialog.close();
  // WebKit does not focus a button on click, so the element active at open can be <body>: return to the trigger.
  const back=previous&&previous!==document.body?previous:document.querySelector<HTMLElement>('[data-analysis-trigger]');back?.focus();};
 },[session.sessionId]);
 const changed=diffInputs(state.applied,state.draft), count=Object.keys(changed).length;
 function accept(value:Settings) {
  session.design=withTimePoints(value.design,value.deState);session.deState=value.deState;ui({design:session.design});onApplied();
  window.dispatchEvent(new CustomEvent('nexo-analysis-applied'));
  if(mounted.current){setSchema(value);dispatch({type:'apply',inputs:analysisValues(value)});}
 }
 async function apply() {
  const previous=Object.fromEntries(Object.keys(changed).map(id=>[id,state.applied[id]]));
  setBusy(true);setError('');
  try {
   accept(await updateAnalysis(session.sessionId,changed));
   // Shared science settings deliberately stay outside the canvas edit undo history.
   let undone=false;
   notify(s.analysisApplied,false,()=>{if(undone)return;undone=true;
    void updateAnalysis(session.sessionId,previous).then(value=>{accept(value);window.dispatchEvent(new CustomEvent('nexo-analysis-restored',{detail:value}));notify(s.analysisUndone);}).catch(e=>{undone=false;if(mounted.current)setError(e.message);notify(e.message,true);});
   });
  } catch(e) {const message=e instanceof Error?e.message:String(e);setError(message);}
  finally {if(mounted.current)setBusy(false);}
 }
 return <dialog className="analysis-sheet" ref={ref} aria-labelledby="analysis-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header><h2 id="analysis-title">{s.analysisSettings}</h2><button type="button" onClick={onClose} aria-label={s.closeAnalysisSettings} data-tip={s.closeAnalysisSettings}>{s.close}</button></header>
  <div className="analysis-content" aria-busy={busy}>{!schema && !error && <p role="status">{s.analysisLoading}</p>}
  {schema?.sections.map(section=><details key={section.title} open={section.title==='Differential Expression' ? true : undefined}>
   <summary>{section.title}</summary><fieldset disabled={busy}><SchemaForm schema={{controls:section.controls.filter(c=>conditionVisible(c.condition,state.draft)),actions:[],tabs:{}}} sessionId={session.sessionId} instanceId="" draftValues={state.draft} onDraftChange={inputs=>dispatch({type:'change',inputs})} onUpdated={async()=>{}} onStatus={()=>{}}/></fieldset>
  </details>)}
  </div>
  <p role="status" className="analysis-status">{busy && !error ? s.analysisUpdating : ''}</p><p role="alert">{error}</p><footer><button disabled={busy || !count} onClick={()=>dispatch({type:'discard'})}>{s.analysisDiscard}</button><button className="primary" disabled={busy || !count} onClick={()=>void apply()}>{s.analysisApply} ({count})</button></footer>
 <Toast/></dialog>;
}
