import { useState } from 'react';
import { orientationSupported, presetOf, PRESET_LABELS, type Preset } from '../../editor/applyEditor';
import type { PlotEditorProps } from './PlotEditor';
const PRESETS:Preset[]=['team','nexo','publication'];
export default function Toolbar(p:PlotEditorProps){const [confirm,setConfirm]=useState(false);const current=presetOf(p.figure,p.editor);return <div className="plot-editor-toolbar">
  <button type="button" disabled={!p.editor.history?.past.length} onClick={p.onUndo}>Undo</button><button type="button" disabled={!p.editor.history?.future.length} onClick={p.onRedo}>Redo</button>
  <button type="button" onClick={()=>setConfirm(true)}>Reset presentation</button><button type="button" disabled={!orientationSupported(p.figure)} onClick={()=>p.onChange({type:'swapAxes'})}>Change orientation</button>
  {confirm&&<div role="group" aria-label="Confirm presentation reset"><span>Reset all presentation changes?</span><button type="button" onClick={()=>{p.onReset();setConfirm(false);}}>Reset all</button><button type="button" onClick={()=>setConfirm(false)}>Cancel</button></div>}
  <div className="plot-editor-presets" role="group" aria-label="Presentation preset"><span>Preset</span>{PRESETS.map(k=><button key={k} type="button" aria-pressed={current===k} onClick={()=>p.onPreset(k)}>{PRESET_LABELS[k]}</button>)}</div>
</div>;}
