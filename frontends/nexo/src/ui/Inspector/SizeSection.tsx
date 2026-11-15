import {useEffect,useState} from 'react';
import {getExportPresets} from '../../api';
import {fromUnit,journalChips,nextSize,px300,ratioText,stepField,toUnit,type JournalChip,type Size,type Unit} from './cardSize';
import {strings as s} from '../strings';
type Geometry=Size&{x:number;y:number};
type Key='width'|'height'|'x'|'y';
// Unit and lock are browser preferences, not checkpoint data.
const pref=(key:string,fallback:string)=>{try{return localStorage.getItem(`nexo.size.${key}`)??fallback;}catch{return fallback;}};
const keep=(key:string,value:string)=>{try{localStorage.setItem(`nexo.size.${key}`,value);}catch{/* private mode */}};
/** F1+F2 Size & position: typed values commit on Enter or leaving the field, one undo step; Esc restores. */
export function SizeSection({geometry,onSize,onPosition}:{geometry:Geometry;onSize:(size:Size)=>void;onPosition:(pos:{x:number;y:number})=>void}){
 const [unit,setUnitState]=useState<Unit>(()=>pref('unit','px')==='mm'?'mm':'px'),[locked,setLockedState]=useState(()=>pref('lock','0')==='1');
 const [draft,setDraft]=useState<Partial<Record<Key,string>>>({}),[clamped,setClamped]=useState(false),[chips,setChips]=useState<JournalChip[]>([]);
 const setUnit=(u:Unit)=>{keep('unit',u);setUnitState(u);setDraft({});},setLocked=(v:boolean)=>{keep('lock',v?'1':'0');setLockedState(v);};
 useEffect(()=>{let live=true;void getExportPresets().then(p=>{if(live)setChips(journalChips(p));}).catch(()=>{});return()=>{live=false;};},[]);
 useEffect(()=>setDraft({}),[geometry.width,geometry.height,geometry.x,geometry.y]);
 const shown=(k:Key)=>k==='x'||k==='y'?String(Math.round(geometry[k])):String(toUnit(geometry[k],unit));
 function commit(k:Key,text:string|undefined){
  setDraft(d=>{const {[k]:_,...rest}=d;return rest;});
  if(text===undefined||text.trim()===''||!Number.isFinite(Number(text))||text===shown(k))return;
  if(k==='x'||k==='y'){onPosition({x:geometry.x,y:geometry.y,[k]:Number(text)});return;}
  const px=fromUnit(Number(text),unit),next=nextSize(geometry,{[k]:px},locked);
  setClamped(next[k]!==px);
  if(next.width!==geometry.width||next.height!==geometry.height)onSize(next);
 }
 const field=(k:Key,label:string,u:string)=><label key={k}>{label}<input type="number" aria-label={`${label} (${u})`} step={unit==='mm'&&(k==='width'||k==='height')?0.1:1} value={draft[k]??shown(k)}
  onChange={e=>{const v=e.target.value;setDraft(d=>({...d,[k]:v}));}} onBlur={e=>commit(k,draft[k]===undefined?undefined:e.currentTarget.value)}
  onKeyDown={e=>{
   if(e.key==='Enter'){e.preventDefault();commit(k,e.currentTarget.value);return;}
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDraft(d=>{const {[k]:_,...rest}=d;return rest;});return;}
   if(e.altKey&&e.key.toLowerCase()==='l'){e.preventDefault();setLocked(!locked);return;}
   const stepped=stepField(e.currentTarget.value,e.key,e.shiftKey);if(stepped!==null){e.preventDefault();setDraft(d=>({...d,[k]:stepped}));}
  }}/><span aria-hidden="true">{u}</span></label>;
 return <details className="size-section" open><summary>{s.sizePositionHeading}</summary>
  <div role="group" aria-label={s.sizeUnits} className="size-units">{(['mm','px'] as const).map(u=><button type="button" key={u} aria-pressed={unit===u} onClick={()=>setUnit(u)}>{u}</button>)}</div>
  {field('width',s.sizeWidthField,unit)}{field('height',s.sizeHeightField,unit)}
  <label><input type="checkbox" checked={locked} onChange={e=>setLocked(e.target.checked)}/>{s.sizeLock} <span className="size-ratio">{ratioText(geometry.width,geometry.height)}</span></label>
  <p className="size-line">{`${Math.round(geometry.width)} × ${Math.round(geometry.height)} px on canvas · ${px300(geometry.width)} × ${px300(geometry.height)} px at 300 DPI`}</p>
  {clamped&&<p className="size-line" role="status">{s.sizeClamped}</p>}
  {!!chips.length&&<div role="group" aria-label={s.sizePresets} className="size-chips">{chips.map(c=><button type="button" key={c.label} disabled={c.disabled} title={c.reason} onClick={()=>{const next=nextSize(geometry,{width:c.px},locked);if(next.width!==geometry.width||next.height!==geometry.height)onSize(next);}}>{`${c.label} ${c.mm}`}</button>)}</div>}
  {chips.filter(c=>c.disabled).map(c=><p className="size-line" key={c.label}>{`${c.label}: ${c.reason}`}</p>)}
  {field('x',s.positionX,'px')}{field('y',s.positionY,'px')}
 </details>;
}

