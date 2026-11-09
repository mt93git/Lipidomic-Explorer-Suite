import type {Figure} from '../../editor/applyEditor';
import {baselineOf,sourceKey} from '../../editor/applyEditor';
import {markerSymbols,lineDashes,legendOrders,type NexoStyle,type NexoShape,type NexoAnnotation,type NexoSeries} from '../../state/nexo';
import {strings as s} from '../strings';
import {NexoField as Field} from './NexoField';
type Props={figure:Figure;style:NexoStyle;onChange:(style:NexoStyle)=>void};
export default function NexoExtras({figure,style,onChange}:Props){
 const original=baselineOf(figure);
 const series=(index:number,patch:Partial<NexoSeries>)=>{
 const rest=(style.series??[]).filter(t=>t.index!==index),previous=style.series?.find(t=>t.index===index);
 onChange({...style,series:[...rest,{...previous,index,sourceKey:sourceKey(original.data[index],original.data),...patch}]});};
 const shape=(index:number,patch:Partial<NexoShape>)=>onChange({...style,shapes:style.shapes?.map((v,i)=>i===index?{...v,...patch}:v)});
 const annotation=(index:number,patch:Partial<NexoAnnotation>)=>onChange({...style,annotations:style.annotations?.map((v,i)=>i===index?{...v,...patch}:v)});
 return <>
 <details><summary>{s.nexoSeries} · {style.series?.length??0} · {[s.nexoNormal,s.nexoReversed,s.nexoGrouped,s.nexoGroupedReversed][legendOrders.indexOf(style.legendOrder??'normal')]}</summary>
 <label>{s.nexoLegendOrder}<select aria-label={s.nexoLegendOrder} value={[s.nexoNormal,s.nexoReversed,s.nexoGrouped,s.nexoGroupedReversed][legendOrders.indexOf(style.legendOrder??'normal')]} onChange={e=>onChange({...style,legendOrder:e.target.value as NexoStyle['legendOrder']})}>{legendOrders.map((v,i)=><option key={v} value={v}>{[s.nexoNormal,s.nexoReversed,s.nexoGrouped,s.nexoGroupedReversed][i]}</option>)}</select></label>
 {figure.data.map((trace,index)=>{const patch=style.series?.find(t=>t.index===index),markers=['scatter','scattergl','box','violin'].includes(trace.type??'scatter'),lines=['scatter','scattergl'].includes(trace.type??'scatter');return markers||lines?<fieldset key={index}><legend>{trace.name??`${s.nexoSeries} ${index+1}`}</legend>
 {markers&&<label>{s.nexoSymbol}<select aria-label={`${s.nexoSymbol} ${index+1}`} value={patch?.markerSymbol??''} onChange={e=>series(index,{markerSymbol:(e.target.value||undefined) as NexoSeries['markerSymbol']})}><option value="">{s.nexoAuto}</option>{markerSymbols.map((v,i)=><option key={v} value={v}>{[s.nexoCircle,s.nexoSquare,s.nexoDiamond,s.nexoCross,s.nexoSymbolX,s.nexoTriangleUp,s.nexoTriangleDown,s.nexoStar,s.nexoCircleOpen,s.nexoSquareOpen,s.nexoDiamondOpen][i]}</option>)}</select></label>}
 {lines&&<label>{s.nexoDash}<select aria-label={`${s.nexoDash} ${index+1}`} value={patch?.lineDash??''} onChange={e=>series(index,{lineDash:(e.target.value||undefined) as NexoSeries['lineDash']})}><option value="">{s.nexoAuto}</option>{lineDashes.map((v,i)=><option key={v} value={v}>{[s.nexoSolid,s.nexoDotted,s.nexoDashed,s.nexoLongDash,s.nexoDashDot,s.nexoLongDashDot][i]}</option>)}</select></label>}</fieldset>:null;})}
 </details>
 <details><summary>{s.nexoReferences} · {style.shapes?.length??0}</summary><p>{s.nexoDataCoordinates}</p>
 {(style.shapes??[]).map((v,i)=><fieldset key={i}><legend>{v.type==='line'?s.nexoReferenceLine:s.nexoBand} {i+1}</legend>
 {(['x0','x1','y0','y1'] as const).map((k,j)=><Field key={k} label={`${s.nexoReference} ${i+1} ${[s.nexoXStart,s.nexoXEnd,s.nexoYStart,s.nexoYEnd][j]}`} value={v[k]} onCommit={n=>{if(n.trim()&&Number.isFinite(Number(n)))shape(i,{[k]:Number(n)});}}/>)}
 <Field label={`${s.nexoReference} ${i+1} ${s.nexoColor}`} type="color" value={v.color??'#555555'} onCommit={color=>shape(i,{color})}/>
 <Field label={`${s.nexoReference} ${i+1} ${s.nexoLineWidth}`} value={v.width??1} onCommit={n=>shape(i,{width:Number(n)})}/>
 <Field label={`${s.nexoReference} ${i+1} ${s.nexoOpacity}`} value={v.opacity??(v.type==='rect'?.2:1)} onCommit={n=>shape(i,{opacity:Number(n)})}/>
 <button type="button" onClick={()=>onChange({...style,shapes:style.shapes?.filter((_,at)=>at!==i)})}>{s.nexoRemove}</button></fieldset>)}
 {(['line','rect'] as const).map(type=><button type="button" key={type} disabled={(style.shapes?.length??0)>=50} onClick={()=>onChange({...style,shapes:[...style.shapes??[],{type,x0:1,x1:2,y0:1,y1:type==='line'?1:2,color:'#555555',opacity:type==='line'?1:.2}]})}>{type==='line'?s.nexoAddLine:s.nexoAddBand}</button>)}
 </details>
 <details><summary>{s.nexoArrows} · {style.annotations?.length??0}</summary><p>{s.nexoDataCoordinates}</p>
 {(style.annotations??[]).map((v,i)=><fieldset key={i}><legend>{s.nexoAnnotation} {i+1}</legend><Field label={`${s.nexoAnnotation} ${i+1} ${s.nexoText}`} type="text" value={v.text} onCommit={text=>annotation(i,{text})}/>
 {(['x','y','ax','ay'] as const).map((k,j)=><Field key={k} label={`${s.nexoAnnotation} ${i+1} ${[s.nexoXCoordinate,s.nexoYCoordinate,s.nexoArrowX,s.nexoArrowY][j]}`} value={v[k]??(k==='ax'?20:-30)} onCommit={n=>{if(n.trim()&&Number.isFinite(Number(n)))annotation(i,{[k]:Number(n)});}}/>)}
 <Field label={`${s.nexoAnnotation} ${i+1} ${s.nexoColor}`} type="color" value={v.color??'#333333'} onCommit={color=>annotation(i,{color})}/>
 <Field label={`${s.nexoAnnotation} ${i+1} ${s.nexoFontSize}`} value={v.size??12} onCommit={n=>annotation(i,{size:Number(n)})}/>
 <button type="button" onClick={()=>onChange({...style,annotations:style.annotations?.filter((_,at)=>at!==i)})}>{s.nexoRemove}</button></fieldset>)}
 <button type="button" disabled={(style.annotations?.length??0)>=30} onClick={()=>onChange({...style,annotations:[...style.annotations??[],{text:s.nexoAnnotation,x:1,y:1,ax:20,ay:-30}]})}>{s.nexoAddArrow}</button>
 </details></>;
}
