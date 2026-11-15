import { supportsHeatScale, type PlotObject } from '../../editor/applyEditor';
import { Field } from './Fields';
import { heatStop } from './heatPresets';
import type { PlotEditorProps } from './PlotEditor';
export default function HeatScale({trace,index,...p}:PlotEditorProps&{trace:PlotObject;index:number}){
  if(!supportsHeatScale(trace))return <p>This plot uses a continuous color scale that cannot be edited here. Group palettes do not change it.</p>;
  const patch=p.editor.traces?.find(t=>t.index===index),keys=['scaleLow','scaleMid','scaleHigh'] as const;
  const values=keys.map((key,i)=>String(patch?.[key]??heatStop(trace.colorscale,i)??['#0047AB','#FFFFFF','#FF0000'][i]));
  return <fieldset><legend>Heatmap scale</legend><p>Change the low, scale midpoint and high colors of this plot only. The midpoint is not necessarily zero. Numeric values and scale limits stay unchanged.</p>{keys.map((key,i)=><Field key={key} label={['Low color','Scale midpoint color','High color'][i]} value={values[i]} spec={{type:'color'}} onChange={value=>p.onChange({type:'trace',index,patch:{scaleLow:values[0],scaleMid:values[1],scaleHigh:values[2],[key]:value}})}/>)}</fieldset>;
}
