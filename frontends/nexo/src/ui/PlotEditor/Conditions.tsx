import { baselineOf, sourceKey } from '../../editor/applyEditor';
import type { PlotEditorProps } from './PlotEditor';
export default function Conditions(p:PlotEditorProps){const source=baselineOf(p.figure);return p.legendGroups.length?<details><summary>Conditions</summary><div className="plot-editor-chips">{p.legendGroups.map(group=>{
  const members=source.data.flatMap((t,index)=>t.legendgroup===group?[{index,sourceKey:sourceKey(t,source.data)}]:[]);
  const hidden=members.some(m=>p.editor.traces?.some(t=>t.index===m.index&&t.hidden));
  return <button key={group} type="button" aria-pressed={!hidden} disabled={!members.length||members.some(m=>!m.sourceKey)||!members.some(m=>source.data[m.index].visible!==false&&source.data[m.index].visible!=='legendonly')} onClick={()=>p.onChange({type:'traces',patches:members.map(m=>({...m,hidden:!hidden}))})}>{group}</button>;
})}</div></details>:null;}
