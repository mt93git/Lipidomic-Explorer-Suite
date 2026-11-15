import {useEffect,useRef,useState} from 'react';
import {groupComparison,type Node} from '../../api';
import type {CanvasHandle} from '../../canvas/handle';
import type {GroupComparison,Visual} from '../../state/document';
import {colorFor,csv,defaultVisual,report,resetColors,resultRows,selected,setColor,setFeatures,setStyle,stateFrom,toggleCondition,toggleFeature,togglePanel,type GcMessage} from '../../groupComparison/model';
const chip=(label:string,pressed:boolean,onClick:()=>void,name=label)=><button key={name} type="button" className="tc-chip" aria-pressed={pressed} aria-label={name===label?undefined:name} onClick={onClick}>{label}</button>;
/** A native `change` (not React's per-move `input`) so one colour pick is one undo step. */
function Swatch({label,value,onPick}:{label:string;value:string;onPick:(v:string)=>void}){
 const ref=useRef<HTMLInputElement>(null),pick=useRef(onPick);pick.current=onPick;
 useEffect(()=>{const el=ref.current;if(!el)return;el.value=value;const on=()=>pick.current(el.value);el.addEventListener('change',on);return()=>el.removeEventListener('change',on);},[value]);
 return <label style={{display:'inline-flex',alignItems:'center',gap:4,marginRight:8}}><input ref={ref} type="color" aria-label={label} defaultValue={value}/>{label.replace(/^Colour of /,'')}</label>;
}
/** Display controls, results and CSV of the Group comparison card; edits node.visual.groupComparison (undoable). */
export function GroupComparisonSection({node,handle,instanceId}:{node:Node;handle:CanvasHandle;instanceId:string}){
 const sessionId=handle.getSession().sessionId;
 const [message,setMessage]=useState<GcMessage>(),[error,setError]=useState('');
 useEffect(()=>{let live=true;const load=()=>{groupComparison(sessionId,instanceId).then(m=>{if(live){setMessage(m as GcMessage);setError('');}},e=>{if(live)setError(String(e));});};
  load();const confirmed=(e:Event)=>{if((e as CustomEvent<string>).detail===node.id)load();};
  window.addEventListener('nexo-group-comparison-confirmed',confirmed);return()=>{live=false;window.removeEventListener('nexo-group-comparison-confirmed',confirmed);};},[sessionId,instanceId,node.id]);
 const data=<p><button type="button" className="link" onClick={()=>window.dispatchEvent(new CustomEvent('nexo-inspector-tab',{detail:'Data'}))}>Change analysis settings in Data</button></p>;
 if(error)return <section aria-label="Group comparison"><h4>Group comparison</h4><p role="alert">{error}</p>{data}</section>;
 if(!message)return <section aria-label="Group comparison"><h4>Group comparison</h4><p role="status">Loading the comparison…</p></section>;
 if(message.requiresConfirmation)return <section aria-label="Group comparison"><h4>Group comparison</h4><p>Confirm the reference group on the card to compute the comparison.</p>{data}</section>;
 const saved=(node.visual as Visual|undefined)?.groupComparison??null, base=stateFrom(message), v:GroupComparison=saved??defaultVisual(base), s=stateFrom(message,v);
 const set=(next:GroupComparison)=>handle.setVisual(node.id,{groupComparison:next});
 const rows=resultRows(s);
 const download=()=>{const url=URL.createObjectURL(new Blob([csv(s)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='lipidomic-group-comparison.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
 return <section aria-label="Group comparison" style={{padding:8}}>
  <h4>Group comparison</h4>
  {data}
  <fieldset><legend>Lipid classes</legend>
   {chip('All',false,()=>set(setFeatures(v,s.features)),'Show all lipid classes')}{chip('None',false,()=>set(setFeatures(v,[])),'Hide all lipid classes')}
   <div role="group" aria-label="Lipid classes shown">{s.features.map(c=>chip(c,s.enabled.has(c),()=>set(toggleFeature(v,c))))}</div>
  </fieldset>
  <fieldset><legend>Conditions</legend><div role="group" aria-label="Conditions shown">{s.groups.map(g=>chip(g,!s.off.has(g),()=>set(toggleCondition(v,g))))}</div></fieldset>
  <fieldset><legend>Colours</legend>
   {s.groups.map(g=><Swatch key={g+colorFor(s,g)} label={'Colour of '+g} value={colorFor(s,g)} onPick={value=>set(setColor(v,g,value,s.features))}/>)}
   <div>{chip('Reset colours',false,()=>set(resetColors(v)))}</div>
  </fieldset>
  <fieldset><legend>Per panel</legend>{s.features.filter(c=>s.enabled.has(c)).map(c=>{const st=v.panelStyles[c]??{colors:{},points:true,box:true};return <div key={c} role="group" aria-label={'Panel '+c}>
   <strong>{c}</strong> {s.groups.map(g=>chip(g,selected(s,c,g),()=>set(togglePanel(v,c,g)),`${g} in ${c}`))}
   {chip('Points',st.points,()=>set(setStyle(v,c,{points:!st.points})),`Points in ${c}`)}{chip('Inner box',st.box,()=>set(setStyle(v,c,{box:!st.box})),`Inner box in ${c}`)}
  </div>;})}</fieldset>
  <h4>Results</h4>
  <table aria-label="Group comparison results"><thead><tr>{['Lipid class','Comparison','p-value','Significance'].map(t=><th key={t}>{t}</th>)}</tr></thead>
   <tbody>{rows.map(r=><tr key={r.feature+'|'+r.comparison} data-shown={r.shown}><th title={r.feature}>{r.feature}</th><td title={r.comparison}>{r.comparison}</td><td>{r.p==null?'n/a':r.p.toPrecision(3)}</td><td>{r.significance}</td></tr>)}</tbody></table>
  <p>Unadjusted local p-values. Hiding classes or conditions does not exclude observations or recompute tests.</p>
  <button type="button" onClick={download}>Comparison CSV</button>
  <details><summary>Full statistical report</summary><pre className="gc-report" style={{whiteSpace:'pre-wrap'}}>{report(s)}</pre></details>
 </section>;
}
