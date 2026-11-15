import { Fragment, useEffect, useState } from 'react';
import type { EditorLayout } from '../../state/document';
import { layoutSchema, serializeEditor, valid, type FieldSpec } from '../../editor/editorState';
import { readPath } from '../../editor/applyEditor';
import type { PlotEditorProps } from './PlotEditor';
export const labels:Record<string,string>={'title.text':'Plot title','title.x':'Title horizontal position','title.y':'Title vertical position','font.family':'Chart font','font.size':'Chart font size','font.color':'Chart text color','paper_bgcolor':'Page background','plot_bgcolor':'Plot background','xaxis.zeroline':'X = 0 reference line','yaxis.zeroline':'Y = 0 reference line','xaxis.showgrid':'Vertical grid lines','yaxis.showgrid':'Horizontal grid lines','showlegend':'Show legend',name:'Series label',color:'Marker color',fillColor:'Fill color',fillOpacity:'Fill opacity',lineColor:'Border / line color',lineWidth:'Border / line width',markerSize:'Marker size',markerSymbol:'Marker shape',markerLineColor:'Marker outline color',markerLineWidth:'Marker outline width',opacity:'Opacity',text:'Text',x:'Horizontal position',y:'Vertical position',size:'Font size'};
export function labelFor(key:string){return labels[key]??key.replace(/^(xaxis|yaxis|legend)\./,'').replace(/\./g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,s=>s.toUpperCase());}
// A color field with no usable color shows the chart's own dark gray text color (Team 72fef5e5).
export function colorHex(value:unknown):string {
  if(typeof value!=='string')return '#52514e';
  if(/^#[\da-f]{6}$/i.test(value))return value;
  const rgb=value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if(rgb)return '#'+rgb.slice(1,4).map(v=>Math.min(255,Number(v)).toString(16).padStart(2,'0')).join('');
  return ({white:'#ffffff',black:'#000000',transparent:'#ffffff'} as Record<string,string>)[value]??'#52514e';
}
export function Field({label,value,spec,onChange}:{label:string;value:unknown;spec:FieldSpec;onChange:(v:string|number|boolean)=>void}){
  const change=(v:string|number|boolean)=>{if(valid(v,spec))onChange(v);};
  if(spec.type==='number'&&spec.slider)return <label className="plot-editor-field"><span>{label}</span><input type="range" min={spec.min} max={spec.max} step="1" value={String(value)} onChange={e=>change(Number(e.target.value))}/><output>{String(value)}</output></label>;
  if(spec.type==='number')return <label className="plot-editor-field"><span>{label}</span><NumberInput value={value} spec={spec} onChange={change}/></label>;
  return <label className="plot-editor-field"><span>{label}</span>{spec.choices?<select value={String(value??spec.choices[0])} onChange={e=>change(e.target.value)}>{spec.choices.map(v=><option key={v} value={v}>{spec.labels?.[v]??(v==='h'?'Horizontal':v==='v'?'Vertical':v)}</option>)}</select>:spec.type==='boolean'?<input type="checkbox" checked={!!value} onChange={e=>change(e.target.checked)}/>:<input type={spec.type==='color'?'color':(spec.type as string)==='number'?'number':'text'} value={spec.type==='color'?colorHex(value):String(value??((spec.type as string)==='number'?(label.toLowerCase().includes('font')?12:spec.min??0):''))} min={spec.min} max={spec.max} step="any" maxLength={500} onChange={e=>{if(spec.type!=='number'||e.target.value!=='')change(spec.type==='number'?Number(e.target.value):e.target.value);}}/>}</label>;
}
/** A changed chart color has "Reset": the change is removed and the plot's original color comes back (Team 72fef5e5). */
export function LayoutFields({keys,...p}:PlotEditorProps&{keys:string[]}){return <>{keys.map(key=>{const changed=p.editor.layout?.[key as keyof EditorLayout];return <Fragment key={key}><Field label={labelFor(key)} spec={layoutSchema[key]} value={changed??readPath(p.figure.layout,key)} onChange={value=>p.onChange({type:'layout',key:key as keyof EditorLayout,value})}/>
  {layoutSchema[key]?.type==='color'&&changed!==undefined&&<button type="button" className="plot-editor-reset-color" title="Back to the original color" aria-label={`Reset ${labelFor(key)} to the original color`} onClick={()=>{const next=serializeEditor(p.editor);delete next.layout![key as keyof EditorLayout];p.onChange({type:'replace',editor:next});}}>Reset</button>}</Fragment>;})}</>;}

// Numeric fields keep a text draft so intermediate states ("", "-", "1.") can be
// typed; the editor only receives finite values inside the field's limits.
function NumberInput({value,spec,onChange}:{value:unknown;spec:FieldSpec;onChange:(v:number)=>void}){
  const shown=value==null?'':String(value);
  const [draft,setDraft]=useState(shown);
  useEffect(()=>{setDraft(shown);},[shown]);
  return <input type="number" value={draft} min={spec.min} max={spec.max} step="any" onChange={e=>{const t=e.target.value;setDraft(t);if(t.trim()==='')return;const n=Number(t);if(Number.isFinite(n)&&valid(n,spec))onChange(n);}} onBlur={()=>{if(draft.trim()===''||!Number.isFinite(Number(draft)))setDraft(shown);}}/>;
}
