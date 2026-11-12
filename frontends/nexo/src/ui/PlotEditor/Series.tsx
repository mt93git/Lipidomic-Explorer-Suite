import { baselineOf, editableColor, ellipseSeries, readPath, seriesCapabilities, sourceKey, symbolChoices } from '../../editor/applyEditor';
import type { FieldSpec } from '../../editor/editorState';
import { Field, labelFor, colorHex } from './Fields';
import HeatScale from './HeatScale';
import type { PlotEditorProps } from './PlotEditor';
// Team's marker shape labels (www/team/js/plot_editor.js); '' is a series whose points carry their own shapes.
const SYMBOL_LABELS:Record<string,string>={circle:'Circle',square:'Square','triangle-up':'Triangle',star:'Star',diamond:'Diamond','':'As plotted'};
export default function Series(p:PlotEditorProps){const source=baselineOf(p.figure);
  // Team ba774a0e: a figure can ask for no Series section (the all-classes structural grid).
  if(source.layout?.meta?.teamHideSeries)return null;
  const outlinesOn=p.editor.groupEllipses===true,outlinesAvailable=ellipseSeries(source).length>0;return <details><summary>Series</summary>
  <div className="plot-editor-series-actions"><button type="button" aria-pressed={outlinesOn} data-group-outlines="true" disabled={!outlinesAvailable&&!outlinesOn} title={outlinesAvailable||outlinesOn?'Draw a dotted 95% ellipse around the points of each group, in the color of its markers. Presentation only: no values or statistics change.':'Group outlines need a scatter plot with at least 3 points per group.'} onClick={()=>p.onChange({type:'groupEllipses',value:!outlinesOn})}>Group outlines: {outlinesOn?'On':'Off'}</button>
  <button type="button" onClick={()=>p.onChange({type:'traces',patches:(p.editor.traces??[]).map(t=>({...t,hidden:false}))})}>Show all series</button></div><p>Visibility changes whole identified series and their companion layers. At least one scientific series must remain visible.</p>{p.traces.map((t,index)=>{
  // Team 01dd860d: helper traces (meta.teamNoEdit) and traces with no data (legend proxies: all-null x and y) are not listed.
  if(t.meta?.teamNoEdit||(t.type!=='heatmap'&&Array.isArray(t.x)&&t.x.length&&t.x.every((v:unknown)=>v==null)&&(!Array.isArray(t.y)||t.y.every((v:unknown)=>v==null))))return null;
  const caps=seriesCapabilities(t),key=sourceKey(source.data[index]??t,source.data),patch=p.editor.traces?.find(t=>t.index===index),bar=['bar','histogram'].includes(t.type),border=bar?'marker.line':'line',fill=bar?'marker.color':'fillcolor';
  // Per-point sizes (Team ba774a0e): one proportional slider, shown at the mean of the series' own sizes.
  const sizes:unknown[]|undefined=Array.isArray(source.data[index]?.marker?.size)&&source.data[index].marker.size.length?source.data[index].marker.size:undefined;
  // Marker shape: 5 shapes (3 in 3D). Points that already carry their own shapes show "As plotted" until one is chosen.
  const shapes=symbolChoices(t),original=source.data[index]?.marker?.symbol,asPlotted=!(original==null||(typeof original==='string'&&shapes.includes(original)));
  const values:Record<string,unknown>={name:t.name??'',fillColor:readPath(t,fill),fillOpacity:Number(String(readPath(t,fill)??'').match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([.\d]+)\s*\)$/)?.[1]??1),color:t.marker?.color,lineColor:readPath(t,border+'.color'),lineWidth:readPath(t,border+'.width')??0,markerSize:sizes?Math.round(sizes.reduce((a:number,b:unknown)=>a+(Number(b)||0),0)/sizes.length):t.marker?.size??6,opacity:t.opacity??1,
    markerSymbol:asPlotted?'':typeof original==='string'?original:'circle',markerLineColor:typeof t.marker?.line?.color==='string'?t.marker.line.color:'#ffffff',markerLineWidth:typeof t.marker?.line?.width==='number'?t.marker.line.width:0,...patch};
  const perPoint=!editableColor(t,'marker'),outline=caps.pointer&&!bar;
  const fields=['name',...(caps.fill&&(!bar||editableColor(t,'marker'))?['fillColor','fillOpacity']:[]),...(caps.marker&&!bar&&(!perPoint||caps.pointer)?['color']:[]),...(outline?['markerLineColor','markerLineWidth']:[]),...(caps.line?['lineWidth',...(editableColor(t,border)?['lineColor']:[])]:[]),...(caps.pointer?['markerSymbol']:[]),...(caps.markerSize?['markerSize']:[]),'opacity'];
  const specOf=(k:string):FieldSpec=>k==='name'?{type:'text'}:k==='markerSymbol'?{type:'text',choices:asPlotted?['',...shapes]:shapes,labels:SYMBOL_LABELS}:['fillColor','color','lineColor','markerLineColor'].includes(k)?{type:'color'}:k==='markerSize'&&sizes?{type:'number',min:2,max:80,slider:true}:{type:'number',min:0,max:['opacity','fillOpacity'].includes(k)?1:['lineWidth','markerLineWidth'].includes(k)?20:100};
  return <fieldset key={index}><legend>{String(t.name??`Series ${index+1}`)}</legend><label>Show series<input type="checkbox" checked={!patch?.hidden&&t.visible!==false&&t.visible!=='legendonly'} disabled={!key||source.data[index]?.visible===false||source.data[index]?.visible==='legendonly'} onChange={e=>p.onChange({type:'trace',index,patch:{sourceKey:key,hidden:!e.target.checked}})}/></label>
    {caps.continuous&&<HeatScale {...p} trace={t} index={index}/>}{caps.marker&&perPoint&&caps.pointer&&<p>This plot colors each point by value. Choosing a marker color below gives every point of this series one color instead; Reset presentation restores the original colors.</p>}{t.type==='violin'&&(['points','innerBox'] as const).map(k=><Field key={k} label={k==='points'?'Points':'Inner box'} value={patch?.[k]??(k==='points'?t.points!==false:!!t.box?.visible)} spec={{type:'boolean'}} onChange={v=>p.onChange({type:'trace',index,patch:{[k]:v}})}/>)}
    {fields.map(k=><Field key={k} label={labelFor(k)} value={values[k]} spec={specOf(k)} onChange={v=>p.onChange({type:'trace',index,patch:{...(key?{sourceKey:key}:{}),...(['fillColor','fillOpacity'].includes(k)?{fillColor:colorHex(values.fillColor),fillOpacity:Number(values.fillOpacity)}:{}),[k]:v}})}/>)}
  </fieldset>;
})}</details>;}
