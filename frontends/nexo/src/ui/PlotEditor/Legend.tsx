import { layoutSchema } from '../../editor/editorState';
import { LayoutFields } from './Fields';
import type { PlotEditorProps } from './PlotEditor';
import { LEGEND_PRESETS, legendPositionPatch, legendPresetOf } from './legendPresets';
import { LegendOrder, legendOrderLabel } from './NexoExtras';
import type { Nexo } from './NexoStyle';
import { inspectorStrings as is, proStrings as ps } from '../strings';
const FINE = ['legend.x', 'legend.y', 'legend.xanchor', 'legend.yanchor'];
/** "Right outside · Reversed": the Legend section's summary. */
export function legendSummary(p: PlotEditorProps): string {
  const preset = legendPresetOf(p.editor), shown = (p.editor.layout as Record<string, unknown> | undefined)?.showlegend;
  return [shown === false ? is.legendHidden : preset?.name ?? 'Custom', p.nexoStyle?.legendOrder && p.nexoStyle.legendOrder !== 'normal' ? legendOrderLabel(p.nexoStyle) : ''].filter(Boolean).join(' · ');
}
/** The Legend section (drawn only when the plot has something to list): show legend, one position control (presets and
 *  the 3×3 grid), order, font and orientation, then the exact position. */
export default function Legend({nexo,...p}:PlotEditorProps&{nexo?:Nexo}){
  const preset=legendPresetOf(p.editor),rest=Object.keys(layoutSchema).filter(k=>k.startsWith('legend.')&&!FINE.includes(k));
  return <>
    <LayoutFields {...p} keys={['showlegend']}/>
    <fieldset className="style-subgroup legend-position"><legend>{is.legendPosition}</legend>
      <div className="plot-editor-chips" role="group" aria-label={ps.legendPresets}>{LEGEND_PRESETS.map(x=><button key={x.id} type="button" aria-pressed={preset?.id===x.id} onClick={()=>p.onChange({type:'layoutPatch',patch:x.patch})}>{x.name}</button>)}</div>
      <div className="plot-editor-positions" role="group" aria-label={is.legendPosition}>{(['Top','Middle','Bottom'] as const).flatMap((vertical,row)=>(['Left','Center','Right'] as const).map((horizontal,col)=><button key={`${row}${col}`} type="button" onClick={()=>p.onChange({type:'layoutPatch',patch:legendPositionPatch(vertical,horizontal)})}>{vertical} {horizontal}</button>))}</div>
    </fieldset>
    {nexo&&<LegendOrder nexo={nexo}/>}
    <LayoutFields {...p} keys={rest}/>
    <details className="style-fine"><summary>{is.legendFine}</summary><LayoutFields {...p} keys={FINE}/></details>
  </>;
}
