import NexoExtras from './NexoExtras';
import {useState} from 'react';
import type {Figure} from '../../editor/applyEditor';
import {applyNexoStyle} from '../../editor/applyNexoStyle';
import {validateNexoStyle,type NexoStyle as Style,type AxisStyle} from '../../state/nexo';
import {strings as s} from '../strings';
import {NexoField} from './NexoField';
export default function NexoStyle({figure,style={},onChange,teamView=false,onTeamView}:{figure:Figure;style?:Style;onChange:(style:Style)=>void;teamView?:boolean;onTeamView:(show:boolean)=>void}){
 const [error,setError]=useState('');
 function change(next:Style){const clean=validateNexoStyle(next);try{applyNexoStyle(figure,clean);setError('');onChange(clean);}catch(e){setError(e instanceof Error?e.message:String(e));}}
 const axis=(key:'xaxis'|'yaxis',patch:Partial<AxisStyle>)=>change({...style,[key]:{...style[key],...patch}});
 const num=(v:string)=>v.trim()===''?undefined:Number(v);
 const summary=(key:'xaxis'|'yaxis')=>{const a=style[key];return a?`${a.type??'linear'} ${key[0]} · ${a.min??s.nexoAuto}–${a.max??s.nexoAuto}`:'';};
 return <div className="nexo-style">
 <label><input type="checkbox" checked={teamView} onChange={e=>onTeamView(e.target.checked)}/>{s.nexoTeamView}</label>
 {error&&<p role="alert">{error}</p>}
 <details><summary>{s.nexoAxis} {(['xaxis','yaxis'] as const).map(summary).filter(Boolean).join(' · ')}</summary>
 {(['xaxis','yaxis'] as const).map(key=><fieldset key={key}><legend>{key==='xaxis'?s.nexoX:s.nexoY}</legend>
 <label>{s.nexoScale}<select aria-label={`${key[0]} ${s.nexoScale}`} value={style[key]?.type??'linear'} onChange={e=>axis(key,{type:e.target.value as 'linear'|'log'})}><option value="linear">{s.nexoLinear}</option><option value="log">{s.nexoLog}</option></select></label>
 {(['min','max'] as const).map(k=><NexoField key={k} label={`${key[0]} ${k==='min'?s.nexoMin:s.nexoMax}`} value={style[key]?.[k]} onCommit={v=>axis(key,{[k]:num(v)})}/>)}
 </fieldset>)}</details>
 <details><summary>{s.nexoTicks} {(['xaxis','yaxis'] as const).map(k=>{const a=style[k];const values=[a?.tickformat,a?.dtick===undefined?'':`${s.nexoTickSpacing} ${a.dtick}`,a?.nticks===undefined?'':`${s.nexoTickCount} ${a.nticks}`].filter(Boolean);return values.length?`${k[0]} ${values.join(', ')}`:'';}).filter(Boolean).join(' · ')||s.nexoAuto}</summary>
 {(['xaxis','yaxis'] as const).map(key=><fieldset key={key}><legend>{key==='xaxis'?s.nexoX:s.nexoY}</legend><NexoField label={`${key[0]} ${s.nexoTickFormat}`} type="text" value={style[key]?.tickformat} onCommit={v=>axis(key,{tickformat:v||undefined})}/>
 <NexoField label={`${key[0]} ${s.nexoTickSpacing}`} value={style[key]?.dtick} onCommit={v=>axis(key,{dtick:num(v),nticks:undefined})}/><NexoField label={`${key[0]} ${s.nexoTickCount}`} value={style[key]?.nticks} onCommit={v=>axis(key,{nticks:num(v),dtick:undefined})}/></fieldset>)}</details>
 <details><summary>{s.nexoWeightsMargins} {Object.values(style).includes('bold')?s.nexoBold:s.nexoNormal}{style.margin?` · ${Object.entries(style.margin).map(([k,v])=>`${k} ${v}`).join(' ')}`:''}</summary>
 {(['titleWeight','axisWeight','legendWeight'] as const).map((k,i)=><label key={k}>{[s.nexoTitle,s.nexoAxisTitles,s.nexoLegend][i]}<select aria-label={[s.nexoTitle,s.nexoAxisTitles,s.nexoLegend][i]} value={style[k]??'normal'} onChange={e=>change({...style,[k]:e.target.value})}><option value="normal">{s.nexoNormal}</option><option value="bold">{s.nexoBold}</option></select></label>)}
 {(['l','r','t','b','pad'] as const).map((k,i)=><NexoField key={k} label={`${s.nexoMargin} ${[s.nexoLeft,s.nexoRight,s.nexoTop,s.nexoBottom,s.nexoPadding][i]}`} value={style.margin?.[k]} onCommit={v=>change({...style,margin:{...style.margin,[k]:num(v)}})}/>)}
 </details><NexoExtras figure={figure} style={style} onChange={change}/><button type="button" onClick={()=>change({})}>{s.nexoReset}</button></div>;
}
