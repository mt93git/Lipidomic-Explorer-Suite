import { layoutSchema } from '../../editor/editorState';
import { baselineOf, sourceKey } from '../../editor/applyEditor';
import { Field, LayoutFields } from './Fields';
import type { PlotEditorProps } from './PlotEditor';
export default function AxisSection({axis,...p}:PlotEditorProps&{axis:'xaxis'|'yaxis'}){
  const source=baselineOf(p.figure),letter=p.editor.swapAxes?(axis==='xaxis'?'y':'x'):axis[0];
  const values:string[]=[...new Set(source.data.flatMap(t=>Array.isArray(t[letter])?t[letter].filter((v:unknown):v is string=>typeof v==='string'):[]))];
  const sourceKeys=source.data.map(t=>sourceKey(t,source.data)).sort(),patch=p.editor.categoryLabels?.find(c=>c.axis===axis);
  return <details><summary>{axis==='xaxis'?'Horizontal axis':'Vertical axis'}</summary><LayoutFields {...p} keys={Object.keys(layoutSchema).filter(k=>k.startsWith(axis+'.')&&!['showgrid','zeroline'].includes(k.slice(axis.length+1)))}/>
    {values.length>0&&values.length<=100&&sourceKeys.every(Boolean)&&<fieldset><legend>Category labels</legend>{values.map((v,i)=><Field key={v} label={v} spec={{type:'text'}} value={patch?.labels[i]??v} onChange={value=>{const labels=patch?.labels.slice()??values.slice();labels[i]=String(value);p.onChange({type:'categoryLabels',categoryLabels:[...(p.editor.categoryLabels??[]).filter(c=>c.axis!==axis),{axis,sourceKeys,values,labels}]});}}/>)}</fieldset>}
  </details>;
}
