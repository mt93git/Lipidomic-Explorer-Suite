import {useRef,useState} from 'react';
/** Draft text commits on blur or Enter, matching other plot editor fields. */
export function NexoField({label,value,onCommit,type='number'}:{label:string;value:string|number|undefined;onCommit:(v:string)=>void;type?:string}){
 const [draft,setDraft]=useState<string|null>(null),pending=useRef<string|null>(null);
 const commit=()=>{if(pending.current!==null){const value=pending.current;pending.current=null;setDraft(null);onCommit(value);}};
 return <label>{label}<input aria-label={label} type={type} value={draft??value??''} onChange={e=>{pending.current=e.target.value;setDraft(e.target.value);}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){commit();e.currentTarget.blur();}if(e.key==='Escape'){pending.current=null;setDraft(null);}}}/></label>;
}
