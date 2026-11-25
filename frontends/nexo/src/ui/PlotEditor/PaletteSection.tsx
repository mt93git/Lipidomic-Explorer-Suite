import { useEffect, useState } from 'react';
import { PALETTES, type PaletteName } from '../../editor/palettes';
import { baselineOf, editableColor, seriesCapabilities } from '../../editor/applyEditor';
import {conditionOf,conditionNames,conditionColorPatches} from '../../editor/conditionColors';
import {applyEditor} from '../../editor/applyEditor';
import {colorHex, LayoutFields} from './Fields';
import HeatScale from './HeatScale';
import HeatScalePresets from './HeatScalePresets';
import {strings as s,phrases as phrases,inspectorStrings as is} from '../strings';
import type { PlotEditorProps } from './PlotEditor';
/** The Colours section: palette and Healthy in grey, condition colours, the three backgrounds (card, page, plot) and,
 *  on heatmaps, the heat scale presets and the scale's own stops. */
export default function PaletteSection(p:PlotEditorProps){
  const [palette,setPalette]=useState<PaletteName>(p.editor.palette??'Gelato Days'),[grey,setGrey]=useState(p.editor.greyHealthy!==false);
  useEffect(()=>{setPalette(p.editor.palette??'Gelato Days');setGrey(p.editor.greyHealthy!==false);},[p.editor.palette,p.editor.greyHealthy]);
  const painted=applyEditor(p.figure,p.editor);
  const conditions=conditionNames(p.figure).filter(name=>conditionColorPatches(p.figure,name,'#000000').length);
  const available=p.traces.some(t=>!seriesCapabilities(t).continuous&&editableColor(t,'marker'));
  // Heatmap scales sat in each series before; the same traces get them here (helper traces and teamHideSeries excepted).
  const scales=baselineOf(p.figure).layout?.meta?.teamHideSeries?[]:p.traces.flatMap((t,index)=>seriesCapabilities(t).continuous&&!t.meta?.teamNoEdit?[{t,index}]:[]);
  return <>{available?<><div className="palette-options" role="group" aria-label={is.colourPalette}>{(Object.keys(PALETTES) as PaletteName[]).map(name=><button type="button" className="palette-option" key={name} aria-pressed={palette===name} onClick={()=>{setPalette(name);p.onChange({type:'palette',palette:name,greyHealthy:grey});}}><span>{name}</span><span className="palette-swatches" aria-hidden="true">{PALETTES[name].slice(0,6).map(color=><i key={color} style={{backgroundColor:color}}/>)}</span></button>)}</div><label>Healthy in grey<input type="checkbox" checked={grey} onChange={e=>{setGrey(e.target.checked);p.onChange({type:'palette',palette,greyHealthy:e.target.checked});}}/></label></>:<p>{is.continuousColours}</p>}
    {conditions.length>0&&<fieldset className="style-subgroup"><legend>{s.conditionColors}</legend>{conditions.map(name=>{const matches=painted.data.filter(t=>conditionOf(t)===name&&editableColor(t,'marker'));const trace=matches.find(t=>seriesCapabilities(t).fill)??matches[0];return <label key={name}>{name}<input type="color" aria-label={phrases.chooseConditionColor(name)} value={colorHex(trace?.fillcolor??trace?.marker?.color??trace?.line?.color)} onChange={e=>p.onChange({type:'traces',patches:conditionColorPatches(p.figure,name,e.target.value)})}/></label>;})}</fieldset>}
    <fieldset className="style-subgroup"><legend>{is.backgrounds}</legend>{p.cardBackground}<LayoutFields {...p} keys={['paper_bgcolor','plot_bgcolor']}/></fieldset>
    <HeatScalePresets {...p}/>
    {scales.map(({t,index})=><HeatScale key={index} {...p} trace={t} index={index}/>)}
  </>;
}
