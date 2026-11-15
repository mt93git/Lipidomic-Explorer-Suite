import {useEffect,useRef,useState} from 'react';
import type {CanvasHandle} from '../../canvas/handle';
import {onStyleClip,readStyleClip} from '../../editor/style';
import {phrases as p,strings as s} from '../strings';
type Plan=NonNullable<ReturnType<CanvasHandle['applyStyleToTab']>>;
/** F4/F5 style bar: Copy style · Paste style · Apply to tab, with the reason when off. */
export function StyleBar({id,handle,hasFigure,flush}:{id:string;handle:CanvasHandle;hasFigure:boolean;flush:()=>void}){
 const [,refresh]=useState(0),[plan,setPlan]=useState<Plan|null>(null),[status,setStatus]=useState(''),confirm=useRef<HTMLButtonElement>(null);
 useEffect(()=>onStyleClip(()=>refresh(v=>v+1)),[]);
 const others=handle.tabNodeIds(id).filter(i=>i!==id&&handle.getSession().canvas.nodes.some(n=>n.id===i&&n.kind==='plot')).length;
 const open=()=>{flush();setPlan(handle.applyStyleToTab(id,false));};
 useEffect(()=>{const f=(e:Event)=>{if((e as CustomEvent).detail===id&&hasFigure&&others)open();};window.addEventListener('nexo:apply-style-to-tab',f);return()=>window.removeEventListener('nexo:apply-style-to-tab',f);});
 useEffect(()=>{if(plan)confirm.current?.focus();},[plan]);
 const clip=readStyleClip();
 return <div className="style-bar" role="group" aria-label={s.styleBar}>
  <button type="button" disabled={!hasFigure} title={hasFigure?s.copyStyleKeys:s.copyStyleOff} onClick={()=>{flush();setStatus(handle.copyStyle(id)?s.copiedStyle:'');}}>{s.copyStyle}</button>
  <button type="button" disabled={!clip} title={clip?s.pasteStyleKeys:s.pasteStyleEmpty} onClick={()=>{const n=handle.pasteStyle([id]);setStatus(n?(hasFigure?s.pastedStyle:s.pastedSize):'');}}>{s.pasteStyle}</button>
  <button type="button" disabled={!hasFigure||!others} title={!hasFigure?s.copyStyleOff:!others?s.applyNoOthers:s.applyKeys} onClick={open}>{s.applyToTab}</button>
  {status&&<span role="status">{status}</span>}
  {plan&&<div role="dialog" aria-label={s.applyToTab} className="style-confirm" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setPlan(null);}}}>
   <p>{p.applyStyleSummary(handle.getSession().canvas.nodes.find(n=>n.id===id)?.label??'',plan.tab,plan.full,plan.sizeOnly,plan.skipped)}</p>
   <button type="button" ref={confirm} onClick={()=>{handle.applyStyleToTab(id,true);setPlan(null);setStatus(s.appliedStyle);}}>{s.applyConfirm}</button><button type="button" onClick={()=>setPlan(null)}>{s.cancel}</button>
  </div>}
 </div>;
}
