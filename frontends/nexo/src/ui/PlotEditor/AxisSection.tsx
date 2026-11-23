import { layoutSchema } from '../../editor/editorState';
import { baselineOf, sourceKey } from '../../editor/applyEditor';
import { Field, LayoutFields } from './Fields';
import type { PlotEditorProps } from './PlotEditor';
import { NexoAxisRange, NexoTicks, type Nexo } from './NexoStyle';
import { inspectorStrings as is } from '../strings';
// One axis of Axes and grid: title, range and scale, ticks, line, grid, zero line and category labels, in that order.
const GROUPS: [string, string[]][] = [
  ['title', ['title.text', 'title.font.size']], ['ticks', ['tickangle', 'showticklabels', 'tickfont.size']],
  ['line', ['showline', 'mirror', 'linecolor', 'linewidth', 'color']], ['grid', ['showgrid', 'gridcolor', 'gridwidth']], ['zero', ['zeroline', 'zerolinecolor', 'zerolinewidth']],
];
export default function AxisSection({axis,nexo,...p}:PlotEditorProps&{axis:'xaxis'|'yaxis';nexo?:Nexo}){
  const source=baselineOf(p.figure),letter=p.editor.swapAxes?(axis==='xaxis'?'y':'x'):axis[0];
  const values:string[]=[...new Set(source.data.flatMap(t=>Array.isArray(t[letter])?t[letter].filter((v:unknown):v is string=>typeof v==='string'):[]))];
  const sourceKeys=source.data.map(t=>sourceKey(t,source.data)).sort(),patch=p.editor.categoryLabels?.find(c=>c.axis===axis);
  const all=Object.keys(layoutSchema).filter(k=>k.startsWith(axis+'.')).map(k=>k.slice(axis.length+1));
  const listed=new Set(GROUPS.flatMap(([,keys])=>keys)),keysOf=(group:string)=>[...GROUPS.find(([g])=>g===group)![1],...(group==='line'?all.filter(k=>!listed.has(k)):[])].filter(k=>all.includes(k)).map(k=>`${axis}.${k}`);
  const fields=(group:string)=><LayoutFields {...p} keys={keysOf(group)}/>;
  return <fieldset className="style-axis"><legend>{axis==='xaxis'?is.xAxis:is.yAxis}</legend>
    {fields('title')}
    {nexo&&<NexoAxisRange nexo={nexo} axis={axis}/>}
    <fieldset className="style-subgroup"><legend>{is.axisTicks}</legend>{nexo&&<NexoTicks nexo={nexo} axis={axis}/>}{fields('ticks')}</fieldset>
    <fieldset className="style-subgroup"><legend>{is.axisLine}</legend>{fields('line')}</fieldset>
    <fieldset className="style-subgroup"><legend>{is.axisGrid}</legend>{fields('grid')}</fieldset>
    <fieldset className="style-subgroup"><legend>{is.axisZero}</legend>{fields('zero')}</fieldset>
    {values.length>0&&values.length<=100&&sourceKeys.every(Boolean)&&<fieldset className="style-subgroup"><legend>{is.categoryLabels}</legend>{values.map((v,i)=><Field key={v} label={v} spec={{type:'text'}} value={patch?.labels[i]??v} onChange={value=>{const labels=patch?.labels.slice()??values.slice();labels[i]=String(value);p.onChange({type:'categoryLabels',categoryLabels:[...(p.editor.categoryLabels??[]).filter(c=>c.axis!==axis),{axis,sourceKeys,values,labels}]});}}/>)}</fieldset>}
  </fieldset>;
}
