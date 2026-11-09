import {useEffect,useRef,useState} from 'react';
import type {Node,Visual} from '../../state/document';
import type {CanvasHandle} from '../../canvas/handle';
import {type Figure,type Preset,nexoEditor,publicationEditor} from '../../editor/applyEditor';
import {isHex,reduceEditor,serializeEditor,type EditorAction,type EditorState} from '../../editor/editorState';
import PlotEditor from '../PlotEditor/PlotEditor';
import type {AppearancePatch} from '../../state/visualCommands';
import {SizeSection} from './SizeSection';
import {StyleBar} from './StyleBar';
import {matchFontsEntries} from '../../editor/style';
import {strings as s} from '../strings';
import ColourBlindCheck from '../PlotEditor/ColourBlindCheck';
export function legendGroupsOf(figure:Figure):string[]{return [...new Set(figure.data.map(t=>t.legendgroup||t.name).filter((v):v is string=>typeof v==='string'&&!!v))];}
export function visualPatchFor(kind:string,field:string,value:string):AppearancePatch{
 if(field==='label')return {label:value.slice(0,512)};
 if(!isHex(value))return {};
 if(kind==='plot'&&field==='background')return {visual:{background:value}};
 if(kind==='illustration'&&field==='color')return {color:value};
 return {};
}
export function AppearanceTab({node,handle}:{node:import('../../api').Node;handle:CanvasHandle}){
 const [,refresh]=useState(0),[editor,setEditor]=useState<EditorState>((node.visual as Visual)?.editor??{});
 const local=useRef(editor),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>handle.onChange(()=>refresh(v=>v+1)),[handle]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const current=(handle.getSession().canvas.nodes.find(n=>n.id===node.id)??node) as Node;
 const figure=handle.figureOf(node.id);
 const saved=JSON.stringify(current.visual?.editor??{});
 useEffect(()=>{if(JSON.stringify(serializeEditor(local.current))!==JSON.stringify(serializeEditor(current.visual?.editor))){const next={...current.visual?.editor,history:local.current.history};local.current=next;setEditor(next);}},[saved]);
 function change(action:EditorAction){const next=reduceEditor(local.current,action);local.current=next;setEditor(next);clearTimeout(timer.current);timer.current=setTimeout(()=>{timer.current=undefined;handle.setVisual(node.id,{editor:serializeEditor(next)});},150);}
 function matchFonts(){clearTimeout(timer.current);const nodes=handle.getSession().canvas.nodes as Node[];handle.styleNodes('matchFonts',matchFontsEntries({...current,visual:{...current.visual,editor:serializeEditor(local.current)}},figure,handle.tabNodeIds(node.id).map(id=>nodes.find(n=>n.id===id)).filter((n):n is Node=>!!n),id=>handle.figureOf(id)));}
 function field(name:string,value:string){handle.setAppearance(node.id,visualPatchFor(node.kind,name,value));}
 if(node.finished&&node.kind!=='illustration')return null;
 function flush(){if(timer.current===undefined)return;clearTimeout(timer.current);timer.current=undefined;handle.setVisual(node.id,{editor:serializeEditor(local.current)});}
 return <>{node.kind==='plot'&&<StyleBar id={node.id} handle={handle} hasFigure={!!figure} flush={flush}/>}{node.kind==='plot'&&<SizeSection geometry={{width:current.width,height:current.height,x:current.x,y:current.y}} onSize={size=>handle.setCardSize(node.id,size)} onPosition={pos=>handle.setCardPosition(node.id,pos)}/>}<label>Label<input value={current.label} maxLength={512} onChange={e=>field('label',e.target.value)}/></label>{node.kind==='illustration'?<label>Accent colour<input type="color" value={current.color??'#000000'} onChange={e=>field('color',e.target.value)}/></label>:<><label>Background<input type="color" value={current.visual?.background??'#ffffff'} onChange={e=>field('background',e.target.value)}/></label>{figure&&<PlotEditor styleHost={{handle,id:node.id,flush}} nexoStyle={handle.nexoStyle(node.id)} onNexoStyle={style=>handle.setNexoStyle(node.id,style)} teamView={handle.isTeamView(node.id)} onTeamView={show=>handle.showAsTeam(node.id,show)} figure={figure} traces={figure.data} legendGroups={legendGroupsOf(figure)} editor={editor} onChange={change} onUndo={()=>change({type:'undo'})} onRedo={()=>change({type:'redo'})} onReset={()=>change({type:'reset'})} onMatchFonts={matchFonts} onPreset={(preset:Preset)=>change({type:'replace',editor:preset==='team'?{}:preset==='nexo'?nexoEditor(figure,editor):publicationEditor(figure,editor)})}/>}{node.kind==='plot'&&!figure&&<ColourBlindCheck id={node.id}/>}</>}</>;
}
