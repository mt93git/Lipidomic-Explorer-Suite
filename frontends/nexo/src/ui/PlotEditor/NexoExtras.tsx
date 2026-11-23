// Nexo's series and annotation extras, placed in their Style sections: legend order under Legend, line dash under
// Points and series, reference lines, shaded bands and arrows under Annotations.
import type {Figure} from '../../editor/applyEditor';
import {baselineOf,sourceKey} from '../../editor/applyEditor';
import {lineDashes,legendOrders,type NexoStyle,type NexoShape,type NexoAnnotation,type NexoSeries} from '../../state/nexo';
import {strings as s} from '../strings';
import {NexoField as Field} from './NexoField';
import type {Nexo} from './NexoStyle';
const ORDER_LABELS=()=>[s.nexoNormal,s.nexoReversed,s.nexoGrouped,s.nexoGroupedReversed];
export const legendOrderLabel=(style:NexoStyle)=>ORDER_LABELS()[legendOrders.indexOf(style.legendOrder??'normal')];
export function LegendOrder({nexo}:{nexo:Nexo}){const {style,change}=nexo;
 return <label>{s.nexoLegendOrder}<select aria-label={s.nexoLegendOrder} value={legendOrderLabel(style)} onChange={e=>change({...style,legendOrder:e.target.value as NexoStyle['legendOrder']})}>{legendOrders.map((v,i)=><option key={v} value={v}>{ORDER_LABELS()[i]}</option>)}</select></label>;}
/** Line dash per line series (scatter traces), one fieldset each. */
export function LineDashes({figure,nexo}:{figure:Figure;nexo:Nexo}){const {style,change}=nexo,original=baselineOf(figure);
 const series=(index:number,patch:Partial<NexoSeries>)=>{const rest=(style.series??[]).filter(t=>t.index!==index),previous=style.series?.find(t=>t.index===index);
  change({...style,series:[...rest,{...previous,index,sourceKey:sourceKey(original.data[index],original.data),...patch}]});};
 return <>{figure.data.map((trace,index)=>{const patch=style.series?.find(t=>t.index===index),lines=['scatter','scattergl'].includes(trace.type??'scatter');return lines?<fieldset key={index} className="style-subgroup"><legend>{s.nexoDash} · {trace.name??`${s.nexoSeries} ${index+1}`}</legend>
 <label>{s.nexoDash}<select aria-label={`${s.nexoDash} ${index+1}`} value={patch?.lineDash??''} onChange={e=>series(index,{lineDash:(e.target.value||undefined) as NexoSeries['lineDash']})}><option value="">{s.nexoAuto}</option>{lineDashes.map((v,i)=><option key={v} value={v}>{[s.nexoSolid,s.nexoDotted,s.nexoDashed,s.nexoLongDash,s.nexoDashDot,s.nexoLongDashDot][i]}</option>)}</select></label></fieldset>:null;})}</>;}
/** Reference lines and shaded bands, in data coordinates. */
export function NexoShapes({nexo}:{nexo:Nexo}){const {style,change}=nexo;
 const shape=(index:number,patch:Partial<NexoShape>)=>change({...style,shapes:style.shapes?.map((v,i)=>i===index?{...v,...patch}:v)});
 return <>{(style.shapes??[]).map((v,i)=><fieldset key={i}><legend>{v.type==='line'?s.nexoReferenceLine:s.nexoBand} {i+1}</legend>
 {(['x0','x1','y0','y1'] as const).map((k,j)=><Field key={k} label={`${s.nexoReference} ${i+1} ${[s.nexoXStart,s.nexoXEnd,s.nexoYStart,s.nexoYEnd][j]}`} value={v[k]} onCommit={n=>{if(n.trim()&&Number.isFinite(Number(n)))shape(i,{[k]:Number(n)});}}/>)}
 <Field label={`${s.nexoReference} ${i+1} ${s.nexoColor}`} type="color" value={v.color??'#555555'} onCommit={color=>shape(i,{color})}/>
 <Field label={`${s.nexoReference} ${i+1} ${s.nexoLineWidth}`} value={v.width??1} onCommit={n=>shape(i,{width:Number(n)})}/>
 <Field label={`${s.nexoReference} ${i+1} ${s.nexoOpacity}`} value={v.opacity??(v.type==='rect'?.2:1)} onCommit={n=>shape(i,{opacity:Number(n)})}/>
 <button type="button" onClick={()=>change({...style,shapes:style.shapes?.filter((_,at)=>at!==i)})}>{s.nexoRemove}</button></fieldset>)}</>;}
export const addShape=(nexo:Nexo,type:'line'|'rect')=>nexo.change({...nexo.style,shapes:[...nexo.style.shapes??[],{type,x0:1,x1:2,y0:1,y1:type==='line'?1:2,color:'#555555',opacity:type==='line'?1:.2}]});
/** Arrow annotations, in data coordinates. */
export function NexoArrows({nexo}:{nexo:Nexo}){const {style,change}=nexo;
 const annotation=(index:number,patch:Partial<NexoAnnotation>)=>change({...style,annotations:style.annotations?.map((v,i)=>i===index?{...v,...patch}:v)});
 return <>{(style.annotations??[]).map((v,i)=><fieldset key={i}><legend>{s.nexoArrowAnnotation} {i+1}</legend><Field label={`${s.nexoAnnotation} ${i+1} ${s.nexoText}`} type="text" value={v.text} onCommit={text=>annotation(i,{text})}/>
 {(['x','y','ax','ay'] as const).map((k,j)=><Field key={k} label={`${s.nexoAnnotation} ${i+1} ${[s.nexoXCoordinate,s.nexoYCoordinate,s.nexoArrowX,s.nexoArrowY][j]}`} value={v[k]??(k==='ax'?20:-30)} onCommit={n=>{if(n.trim()&&Number.isFinite(Number(n)))annotation(i,{[k]:Number(n)});}}/>)}
 <Field label={`${s.nexoAnnotation} ${i+1} ${s.nexoColor}`} type="color" value={v.color??'#333333'} onCommit={color=>annotation(i,{color})}/>
 <Field label={`${s.nexoAnnotation} ${i+1} ${s.nexoFontSize}`} value={v.size??12} onCommit={n=>annotation(i,{size:Number(n)})}/>
 <button type="button" onClick={()=>change({...style,annotations:style.annotations?.filter((_,at)=>at!==i)})}>{s.nexoRemove}</button></fieldset>)}</>;}
export const addArrow=(nexo:Nexo)=>nexo.change({...nexo.style,annotations:[...nexo.style.annotations??[],{text:s.nexoAnnotation,x:1,y:1,ax:20,ay:-30}]});
