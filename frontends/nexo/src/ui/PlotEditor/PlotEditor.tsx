import {applyEditor,type Figure,type PlotObject,type Preset} from '../../editor/applyEditor';
import type { EditorAction, EditorState } from '../../editor/editorState';
import NexoStyle from './NexoStyle';
import Toolbar from './Toolbar';
import PaletteSection from './PaletteSection';
import Typography from './Typography';
import Background from './Background';
import AxisSection from './AxisSection';
import Legend from './Legend';
import Conditions from './Conditions';
import Series from './Series';
import Annotations from './Annotations';
import { LayoutFields } from './Fields';
import './plotEditor.css';
// Wave 2 part A sections, mounted after the existing ones.
import HeatScalePresets from './HeatScalePresets';
import SavedStyles from './SavedStyles';
import ColourBlindCheck from './ColourBlindCheck';
export interface PlotEditorProps {
  nexoStyle?:import('../../state/nexo').NexoStyle;onNexoStyle?:(style:import('../../state/nexo').NexoStyle)=>void;teamView?:boolean;onTeamView?:(show:boolean)=>void;
  figure:Figure;editor:EditorState;traces:PlotObject[];legendGroups:string[];
  onChange:(action:EditorAction)=>void;
  onUndo:()=>void;onRedo:()=>void;onReset:()=>void;onPreset:(preset:Preset)=>void;
  /** F3 "Match fonts across tab"; absent hides the button. */
  onMatchFonts?:()=>void;
  /** F6 saved styles: the card and canvas they apply through (one style batch = one undo step); absent hides the section. */
  styleHost?:{handle:import('../../canvas/handle').CanvasHandle;id:string;flush:()=>void};
}
/** Unmounted integration surface: the AppearanceTab owner supplies state and callbacks. */
export default function PlotEditor(p:PlotEditorProps){
  const cartesian=p.traces.some(t=>!t.type||['scatter','scattergl','bar','box','violin','heatmap','contour','histogram','histogram2d','waterfall'].includes(t.type));
  return <div className="plot-editor"><Toolbar {...p}/><p>Presentation changes only. Scientific coordinates and per-point colors are preserved.</p><PaletteSection {...p}/><Typography {...p}/><Background {...p}/>{cartesian&&<><AxisSection {...p} axis="xaxis"/><AxisSection {...p} axis="yaxis"/><details><summary>Grid &amp; zero lines</summary><LayoutFields {...p} keys={['xaxis.showgrid','yaxis.showgrid','xaxis.zeroline','yaxis.zeroline']}/></details></>}{p.onNexoStyle&&p.onTeamView&&<NexoStyle figure={applyEditor(p.figure,p.editor)} style={p.nexoStyle} onChange={p.onNexoStyle} teamView={p.teamView} onTeamView={p.onTeamView}/>}{p.figure.data.some(t=>t.showlegend!==false)&&<Legend {...p}/>}<Conditions {...p}/><Series {...p}/><Annotations {...p}/><HeatScalePresets {...p}/><SavedStyles {...p}/>{p.styleHost&&<ColourBlindCheck id={p.styleHost.id} figure={applyEditor(p.figure,p.editor)}/>}</div>;
}
