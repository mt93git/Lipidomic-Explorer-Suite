import { useEffect, useState } from 'react';
import { PALETTES, type PaletteName } from '../../editor/palettes';
import { editableColor, seriesCapabilities } from '../../editor/applyEditor';
import {conditionOf,conditionNames,conditionColorPatches} from '../../editor/conditionColors';
import {applyEditor} from '../../editor/applyEditor';
import {colorHex} from './Fields';
import {strings as s,phrases as phrases} from '../strings';
import type { PlotEditorProps } from './PlotEditor';
export default function PaletteSection(p:PlotEditorProps){
  const [palette,setPalette]=useState<PaletteName>(p.editor.palette??'Gelato Days'),[grey,setGrey]=useState(p.editor.greyHealthy!==false);
  useEffect(()=>{setPalette(p.editor.palette??'Gelato Days');setGrey(p.editor.greyHealthy!==false);},[p.editor.palette,p.editor.greyHealthy]);
  const painted=applyEditor(p.figure,p.editor);
  const conditions=conditionNames(p.figure).filter(name=>conditionColorPatches(p.figure,name,'#000000').length);
  const available=p.traces.some(t=>!seriesCapabilities(t).continuous&&editableColor(t,'marker'));
  return <details><summary>Color palette</summary>{available?<><div className="palette-options" role="group" aria-label="Color palette">{(Object.keys(PALETTES) as PaletteName[]).map(name=><button type="button" className="palette-option" key={name} aria-pressed={palette===name} onClick={()=>{setPalette(name);p.onChange({type:'palette',palette:name,greyHealthy:grey});}}><span>{name}</span><span className="palette-swatches" aria-hidden="true">{PALETTES[name].slice(0,6).map(color=><i key={color} style={{backgroundColor:color}}/>)}</span></button>)}</div><label>Healthy in grey<input type="checkbox" checked={grey} onChange={e=>{setGrey(e.target.checked);p.onChange({type:'palette',palette,greyHealthy:e.target.checked});}}/></label></>:<p>This chart uses continuous or per-point colors. Categorical palettes apply to charts with series or groups.</p>}{conditions.length>0&&<fieldset><legend>{s.conditionColors}</legend>{conditions.map(name=>{const matches=painted.data.filter(t=>conditionOf(t)===name&&editableColor(t,'marker'));const trace=matches.find(t=>seriesCapabilities(t).fill)??matches[0];return <label key={name}>{name}<input type="color" aria-label={phrases.chooseConditionColor(name)} value={colorHex(trace?.fillcolor??trace?.marker?.color??trace?.line?.color)} onChange={e=>p.onChange({type:'traces',patches:conditionColorPatches(p.figure,name,e.target.value)})}/></label>;})}</fieldset>}</details>;
}
