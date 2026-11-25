import {useEffect,useRef,useState} from 'react';
import type {Node,Visual} from '../../state/document';
import type {CanvasHandle} from '../../canvas/handle';
import {type Figure,type Preset,presetEditor} from '../../editor/applyEditor';
import {isHex,reduceEditor,serializeEditor,type EditorAction,type EditorState} from '../../editor/editorState';
import PlotEditor from '../PlotEditor/PlotEditor';
import type {AppearancePatch} from '../../state/visualCommands';
import {SizeSection} from './SizeSection';
import {StyleBar} from './StyleBar';
import {matchFontsEntries} from '../../editor/style';
import {inspectorStrings as is} from '../strings';
import ColourBlindCheck, {colourBlindSummary} from '../PlotEditor/ColourBlindCheck';
import {StyleSection,useOpenSections} from '../PlotEditor/StyleSection';
import '../PlotEditor/plotEditor.css';
import {clearAppearanceSection,pendingAppearanceSection,revealSection} from './appearanceFocus';
export function legendGroupsOf(figure:Figure):string[]{return [...new Set(figure.data.map(t=>t.legendgroup||t.name).filter((v):v is string=>typeof v==='string'&&!!v))];}
export function visualPatchFor(kind:string,field:string,value:string):AppearancePatch{
 if(field==='label')return {label:value.slice(0,512)};
 if(!isHex(value))return {};
 if(kind==='plot'&&field==='background')return {visual:{background:value}};
 if(kind==='illustration'&&field==='color')return {color:value};
 return {};
}
/** The Style tab (approved layout 2026-11-23). The card's name is edited in the Inspector header. A Plotly card gets the
 *  full plot editor; an image card its size, background, style bar and colour-blind preview; an illustration its accent. */
export function AppearanceTab({node,handle}:{node:import('../../api').Node;handle:CanvasHandle}){
 const [,refresh]=useState(0),[editor,setEditor]=useState<EditorState>((node.visual as Visual)?.editor??{});
 const local=useRef(editor),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [isOpen,toggle]=useOpenSections();
 useEffect(()=>handle.onChange(()=>refresh(v=>v+1)),[handle]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 // A link that names a section opens it here once the sections are drawn.
 useEffect(()=>{const section=pendingAppearanceSection();if(section&&revealSection(document.getElementById('inspector')??document,section))clearAppearanceSection();});
 const current=(handle.getSession().canvas.nodes.find(n=>n.id===node.id)??node) as Node;
 const figure=handle.figureOf(node.id);
 const saved=JSON.stringify(current.visual?.editor??{});
 useEffect(()=>{if(JSON.stringify(serializeEditor(local.current))!==JSON.stringify(serializeEditor(current.visual?.editor))){const next={...current.visual?.editor,history:local.current.history};local.current=next;setEditor(next);}},[saved]);
 function change(action:EditorAction){const next=reduceEditor(local.current,action);local.current=next;setEditor(next);clearTimeout(timer.current);timer.current=setTimeout(()=>{timer.current=undefined;handle.setVisual(node.id,{editor:serializeEditor(next)});},150);}
 function matchFonts(){clearTimeout(timer.current);const nodes=handle.getSession().canvas.nodes as Node[];handle.styleNodes('matchFonts',matchFontsEntries({...current,visual:{...current.visual,editor:serializeEditor(local.current)}},figure,handle.tabNodeIds(node.id).map(id=>nodes.find(n=>n.id===id)).filter((n):n is Node=>!!n),id=>handle.figureOf(id)));}
 function field(name:string,value:string){handle.setAppearance(node.id,visualPatchFor(node.kind,name,value));}
 if(node.finished&&node.kind!=='illustration')return null;
 function flush(){if(timer.current===undefined)return;clearTimeout(timer.current);timer.current=undefined;handle.setVisual(node.id,{editor:serializeEditor(local.current)});}
 const section=(id:Parameters<typeof isOpen>[0],summary:string|undefined,body:React.ReactNode)=><StyleSection id={id} summary={summary} isOpen={isOpen(id)} onToggle={toggle}>{body}</StyleSection>;
 if(node.kind==='illustration')return <div className="plot-editor">{section('colours',current.color??undefined,<label>{is.accentColour}<input type="color" value={current.color??'#000000'} onChange={e=>field('color',e.target.value)}/></label>)}</div>;
 const background=<label>{is.cardBackground}<input type="color" value={current.visual?.background??'#ffffff'} onChange={e=>field('background',e.target.value)}/></label>;
 const size=<SizeSection geometry={{width:current.width,height:current.height,x:current.x,y:current.y}} onSize={size=>handle.setCardSize(node.id,size)} onPosition={pos=>handle.setCardPosition(node.id,pos)}/>;
 const sizeSummary=`${Math.round(current.width)} × ${Math.round(current.height)} px`;
 const styleBar=<StyleBar id={node.id} handle={handle} hasFigure={!!figure} flush={flush}/>;
 if(figure)return <PlotEditor styleHost={{handle,id:node.id,flush}} nexoStyle={handle.nexoStyle(node.id)} onNexoStyle={style=>handle.setNexoStyle(node.id,style)} teamView={handle.isTeamView(node.id)} onTeamView={show=>handle.showAsTeam(node.id,show)} figure={figure} traces={figure.data} legendGroups={legendGroupsOf(figure)} editor={editor} onChange={change} onUndo={()=>change({type:'undo'})} onRedo={()=>change({type:'redo'})} onReset={()=>change({type:'reset'})} onMatchFonts={matchFonts} onPreset={(preset:Preset)=>change({type:'replace',editor:presetEditor(preset,figure,editor)})}
  cardBackground={background} sizeFields={size} sizeSummary={sizeSummary} styleBar={styleBar}/>;
 // An image card (a PNG from Team): what can still change.
 return <div className="plot-editor"><p className="style-note">{is.imageNote}</p>
  {section('colours',undefined,<fieldset className="style-subgroup"><legend>{is.backgrounds}</legend>{background}</fieldset>)}
  {section('size',sizeSummary,size)}
  {section('library',undefined,styleBar)}
  {section('colourblind',colourBlindSummary(),<ColourBlindCheck id={node.id}/>)}
 </div>;
}
