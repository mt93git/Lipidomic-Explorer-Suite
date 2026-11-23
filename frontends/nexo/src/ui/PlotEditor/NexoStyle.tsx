// Nexo's own style fields (state/nexo.ts), placed in the Style sections they belong to: axis range, scale and ticks
// under Axes and grid, weights under Text, margins under Size and layout. Every change is validated by drawing it once.
import {useState} from 'react';
import type {Figure} from '../../editor/applyEditor';
import {applyNexoStyle} from '../../editor/applyNexoStyle';
import {validateNexoStyle,type NexoStyle as Style,type AxisStyle} from '../../state/nexo';
import {strings as s} from '../strings';
import {NexoField} from './NexoField';
export interface Nexo {style:Style;change:(style:Style)=>void}
/** The Nexo style and its checked change; error is the last refusal, shown once under the Style top bar. */
export function useNexo(figure:Figure,style:Style|undefined,onChange:((style:Style)=>void)|undefined):{nexo?:Nexo;error:string}{
 const [error,setError]=useState('');
 if(!onChange)return {error:''};
 const change=(next:Style)=>{const clean=validateNexoStyle(next);try{applyNexoStyle(figure,clean);setError('');onChange(clean);}catch(e){setError(e instanceof Error?e.message:String(e));}};
 return {nexo:{style:style??{},change},error};
}
type AxisKey='xaxis'|'yaxis';
const num=(v:string)=>v.trim()===''?undefined:Number(v);
const axis=(nexo:Nexo,key:AxisKey,patch:Partial<AxisStyle>)=>nexo.change({...nexo.style,[key]:{...nexo.style[key],...patch}});
/** Range and scale of one axis. */
export function NexoAxisRange({nexo,axis:key}:{nexo:Nexo;axis:AxisKey}){const style=nexo.style;return <>
 <label>{s.nexoScale}<select aria-label={`${key[0]} ${s.nexoScale}`} value={style[key]?.type??'linear'} onChange={e=>axis(nexo,key,{type:e.target.value as 'linear'|'log'})}><option value="linear">{s.nexoLinear}</option><option value="log">{s.nexoLog}</option></select></label>
 {(['min','max'] as const).map(k=><NexoField key={k} label={`${key[0]} ${k==='min'?s.nexoMin:s.nexoMax}`} value={style[key]?.[k]} onCommit={v=>axis(nexo,key,{[k]:num(v)})}/>)}
</>;}
/** Tick format, spacing and count of one axis (spacing and count exclude each other). */
export function NexoTicks({nexo,axis:key}:{nexo:Nexo;axis:AxisKey}){const style=nexo.style;return <>
 <NexoField label={`${key[0]} ${s.nexoTickFormat}`} type="text" value={style[key]?.tickformat} onCommit={v=>axis(nexo,key,{tickformat:v||undefined})}/>
 <NexoField label={`${key[0]} ${s.nexoTickSpacing}`} value={style[key]?.dtick} onCommit={v=>axis(nexo,key,{dtick:num(v),nticks:undefined})}/>
 <NexoField label={`${key[0]} ${s.nexoTickCount}`} value={style[key]?.nticks} onCommit={v=>axis(nexo,key,{nticks:num(v),dtick:undefined})}/>
</>;}
/** Title, axis title and legend weights. */
export function NexoWeights({nexo}:{nexo:Nexo}){const style=nexo.style;return <>{(['titleWeight','axisWeight','legendWeight'] as const).map((k,i)=><label key={k}>{[s.nexoTitle,s.nexoAxisTitles,s.nexoLegend][i]}<select aria-label={[s.nexoTitle,s.nexoAxisTitles,s.nexoLegend][i]} value={style[k]??'normal'} onChange={e=>nexo.change({...style,[k]:e.target.value})}><option value="normal">{s.nexoNormal}</option><option value="bold">{s.nexoBold}</option></select></label>)}</>;}
/** Plot margins and padding. */
export function NexoMargins({nexo}:{nexo:Nexo}){const style=nexo.style;return <>{(['l','r','t','b','pad'] as const).map((k,i)=><NexoField key={k} label={`${s.nexoMargin} ${[s.nexoLeft,s.nexoRight,s.nexoTop,s.nexoBottom,s.nexoPadding][i]}`} value={style.margin?.[k]} onCommit={v=>nexo.change({...style,margin:{...style.margin,[k]:num(v)}})}/>)}</>;}
/** The axes summary: "x log · y 0–10", "auto" when nothing is set. */
export function axesSummary(style:Style|undefined):string{
 const one=(key:AxisKey)=>{const a=style?.[key];if(!a)return '';const parts=[a.type&&a.type!=='linear'?a.type:'',a.min!==undefined||a.max!==undefined?`${a.min??s.nexoAuto}–${a.max??s.nexoAuto}`:''].filter(Boolean);return parts.length?`${key[0]} ${parts.join(' ')}`:'';};
 return [one('xaxis'),one('yaxis')].filter(Boolean).join(' · ')||s.nexoAuto;
}
