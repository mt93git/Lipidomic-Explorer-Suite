import { useState } from 'react';
import { presetOf, PRESET_LABELS, type Preset } from '../../editor/applyEditor';
import type { PlotEditorProps } from './PlotEditor';
import { Icon } from '../Icon';
import { inspectorStrings as is, strings as s } from '../strings';
const PRESETS:Preset[]=['team','nexo','publication'];
/** The Style tab's top bar, on one line: preset, Undo, Redo and the card's one Reset (presentation and Nexo style),
 *  then "Show as Team draws it". The reset asks first, as before. */
export default function Toolbar(p:PlotEditorProps){
  const [confirm,setConfirm]=useState(false),current=presetOf(p.figure,p.editor);
  const reset=()=>{p.onReset();if(p.onNexoStyle&&Object.keys(p.nexoStyle??{}).length)p.onNexoStyle({});setConfirm(false);};
  return <div className="style-topbar">
    <div className="style-topbar-row">
      <div className="plot-editor-presets" role="group" aria-label={is.presetGroup}>{PRESETS.map(k=><button key={k} type="button" aria-pressed={current===k} onClick={()=>p.onPreset(k)}>{PRESET_LABELS[k]}</button>)}</div>
      <div className="style-topbar-actions">
        <button type="button" className="icon-button" aria-label={is.undo} data-tip={is.undo} disabled={!p.editor.history?.past.length} onClick={p.onUndo}><Icon name="undo"/></button>
        <button type="button" className="icon-button" aria-label={is.redo} data-tip={is.redo} disabled={!p.editor.history?.future.length} onClick={p.onRedo}><Icon name="redo"/></button>
        <button type="button" className="icon-button" aria-label={is.resetPresentation} data-tip={is.resetPresentation} aria-expanded={confirm} onClick={()=>setConfirm(true)}><Icon name="reset"/></button>
      </div>
    </div>
    {p.onTeamView&&<label className="style-team-view"><input type="checkbox" checked={!!p.teamView} onChange={e=>p.onTeamView!(e.target.checked)}/>{s.nexoTeamView}</label>}
    {confirm&&<div className="style-confirm" role="group" aria-label="Confirm presentation reset"><span>{is.resetQuestion}</span><button type="button" onClick={reset}>{is.resetAll}</button><button type="button" onClick={()=>setConfirm(false)}>{s.cancel}</button></div>}
  </div>;
}
