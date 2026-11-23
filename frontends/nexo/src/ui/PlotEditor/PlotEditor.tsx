import type { ReactNode } from 'react';
import {applyEditor,orientationSupported,type Figure,type PlotObject,type Preset} from '../../editor/applyEditor';
import type { EditorAction, EditorState } from '../../editor/editorState';
import Toolbar from './Toolbar';
import PaletteSection from './PaletteSection';
import Typography, { textSummary } from './Typography';
import AxisSection from './AxisSection';
import Legend, { legendSummary } from './Legend';
import Conditions from './Conditions';
import Series from './Series';
import Annotations, { annotationCount } from './Annotations';
import { LineDashes } from './NexoExtras';
import { NexoMargins, axesSummary, useNexo } from './NexoStyle';
import { hasLegendEntries } from './legendPresets';
import { loadStyles } from './stylePresets';
import { StyleSection, useOpenSections } from './StyleSection';
import { inspectorStrings as is } from '../strings';
import './plotEditor.css';
import SavedStyles from './SavedStyles';
import ColourBlindCheck, { colourBlindSummary } from './ColourBlindCheck';
export interface PlotEditorProps {
  nexoStyle?:import('../../state/nexo').NexoStyle;onNexoStyle?:(style:import('../../state/nexo').NexoStyle)=>void;teamView?:boolean;onTeamView?:(show:boolean)=>void;
  figure:Figure;editor:EditorState;traces:PlotObject[];legendGroups:string[];
  onChange:(action:EditorAction)=>void;
  onUndo:()=>void;onRedo:()=>void;onReset:()=>void;onPreset:(preset:Preset)=>void;
  /** F3 "Match fonts across tab"; absent hides the button. */
  onMatchFonts?:()=>void;
  /** F6 saved styles: the card and canvas they apply through (one style batch = one undo step); absent hides the section. */
  styleHost?:{handle:import('../../canvas/handle').CanvasHandle;id:string;flush:()=>void};
  /** The card's own fields, drawn inside the sections they belong to: its background (Colours › Backgrounds), its size
   *  and position (Size and layout) and the Copy / Paste / Apply to tab bar (Style library). */
  cardBackground?:ReactNode;sizeFields?:ReactNode;sizeSummary?:string;styleBar?:ReactNode;
}
const CARTESIAN=['scatter','scattergl','bar','box','violin','heatmap','contour','histogram','histogram2d','waterfall'];
/** The Style tab of a Plotly card (approved layout 2026-11-23): the preset bar, then one collapsible section per
 *  subject, each with a one-line summary; sections that cannot act on this plot are not drawn. */
export default function PlotEditor(p:PlotEditorProps){
  const [isOpen,toggle]=useOpenSections();
  const styled=applyEditor(p.figure,p.editor),{nexo,error}=useNexo(styled,p.nexoStyle,p.onNexoStyle);
  const cartesian=p.traces.some(t=>!t.type||CARTESIAN.includes(t.type));
  const legend=hasLegendEntries(p.figure.data as Parameters<typeof hasLegendEntries>[0]);
  const orientation=orientationSupported(p.figure);
  const section=(id:Parameters<typeof isOpen>[0],summary:string|undefined,body:ReactNode)=><StyleSection id={id} summary={summary} isOpen={isOpen(id)} onToggle={toggle}>{body}</StyleSection>;
  const shown=p.traces.filter((t,i)=>!p.editor.traces?.some(e=>e.index===i&&e.hidden)&&t.visible!==false).length;
  return <div className="plot-editor">
    <Toolbar {...p}/>
    <p className="style-note">{is.styleNote}</p>
    {error&&<p role="alert" className="nexo-style-error">{error}</p>}
    {section('colours',p.editor.palette??undefined,<PaletteSection {...p}/>)}
    {section('text',textSummary(p),<Typography {...p} nexo={nexo}/>)}
    {cartesian&&section('axes',axesSummary(p.nexoStyle),<><AxisSection {...p} nexo={nexo} axis="xaxis"/><AxisSection {...p} nexo={nexo} axis="yaxis"/></>)}
    {legend&&section('legend',legendSummary(p),<Legend {...p} nexo={nexo}/>)}
    {section('points',is.summaryShown(shown,p.traces.length,!!p.editor.groupEllipses),<><Conditions {...p}/><Series {...p}/>{nexo&&<LineDashes figure={styled} nexo={nexo}/>}</>)}
    {section('annotations',is.summaryAnnotations(annotationCount(p)),<Annotations {...p} nexo={nexo}/>)}
    {(p.sizeFields||nexo||orientation)&&section('size',p.sizeSummary,<>{p.sizeFields}{nexo&&<fieldset className="style-subgroup"><legend>{is.margins}</legend><NexoMargins nexo={nexo}/></fieldset>}
      {orientation&&<button type="button" aria-pressed={!!p.editor.swapAxes} onClick={()=>p.onChange({type:'swapAxes'})}>{is.orientation}</button>}</>)}
    {(p.styleBar||p.styleHost)&&section('library',p.styleHost?is.summarySaved(loadStyles().length):undefined,<>{p.styleBar}<SavedStyles {...p}/></>)}
    {p.styleHost&&section('colourblind',colourBlindSummary(styled),<ColourBlindCheck id={p.styleHost.id} figure={styled}/>)}
  </div>;
}
