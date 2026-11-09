import type { Editor, EditorLayout, EditorTrace } from '../state/document';
import { PALETTES, type PaletteName } from './palettes';
export type { Editor } from '../state/document';
export const FONTS = ['Arial','Helvetica','Verdana','Georgia','Times New Roman','Courier New','system-ui','sans-serif'] as const;
export interface FieldSpec { type: 'text'|'color'|'number'|'boolean'; min?: number; max?: number; choices?: readonly string[] }
export const layoutSchema: Record<string, FieldSpec> = {};
const spec=(keys:string[], value:FieldSpec)=>keys.forEach(k=>{layoutSchema[k]=value;});
spec(['title.text','xaxis.title.text','yaxis.title.text'],{type:'text'});
spec(['font.family','title.font.family','legend.font.family'],{type:'text',choices:FONTS});
spec(['paper_bgcolor','plot_bgcolor','font.color','title.font.color','legend.font.color','legend.bgcolor',...['xaxis','yaxis'].flatMap(a=>['color','gridcolor','zerolinecolor'].map(k=>`${a}.${k}`))],{type:'color'});
spec(['font.size','title.font.size','legend.font.size',...['xaxis','yaxis'].flatMap(a=>['title.font.size','tickfont.size'].map(k=>`${a}.${k}`))],{type:'number',min:6,max:72});
spec(['title.x','title.y','legend.x','legend.y'],{type:'number',min:-2,max:3});
spec(['showlegend',...['xaxis','yaxis'].flatMap(a=>['showgrid','zeroline','showline','showticklabels'].map(k=>`${a}.${k}`))],{type:'boolean'});
spec(['xaxis','yaxis'].flatMap(a=>['gridwidth','zerolinewidth','linewidth'].map(k=>`${a}.${k}`)),{type:'number',min:0,max:10});
spec(['xaxis.tickangle','yaxis.tickangle'],{type:'number',min:-180,max:180});
spec(['legend.orientation'],{type:'text',choices:['h','v']});
spec(['title.xanchor','legend.xanchor'],{type:'text',choices:['left','center','right','auto']});
spec(['title.yanchor','legend.yanchor'],{type:'text',choices:['top','middle','bottom','auto']});
export const isHex=(v:unknown):v is string=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v);
export function valid(v:unknown,s:FieldSpec): boolean {
  return s.type==='number'?typeof v==='number'&&Number.isFinite(v)&&v>=s.min!&&v<=s.max!:s.type==='boolean'?typeof v==='boolean':s.type==='color'?isHex(v):typeof v==='string'&&Array.from(v).length<=500&&(!s.choices||s.choices.includes(v));
}
const record=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const array=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
/** Validate as well as project: the result satisfies team_canvas_editor's cosmetic allow-list. */
export function serializeEditor(input:unknown):Editor {
  const s=record(input), layout:Record<string,unknown>={}, traces:EditorTrace[]=[];
  for(const [key,rule] of Object.entries(layoutSchema))if(valid(record(s.layout)[key],rule))layout[key]=record(s.layout)[key];
  const out:Editor={layout:layout as EditorLayout,traces};
  for(const key of ['swapAxes','greyHealthy'] as const)if(typeof s[key]==='boolean')out[key]=s[key];
  if(typeof s.palette==='string'&&Object.hasOwn(PALETTES,s.palette))out.palette=s.palette as PaletteName;
  const used=new Set<number>();
  for(const raw of array(s.traces)){
    const t=record(raw),index=t.index;
    if(typeof index!=='number'||!Number.isInteger(index)||index<0||index>999||used.has(index))continue;
    if(traces.length===100)break; used.add(index);
    const n:Record<string,unknown>={index};
    for(const key of ['sourceKey','name','hidden','points','innerBox','color','fillColor','fillOpacity','lineColor','lineWidth','markerSize','opacity','scaleLow','scaleMid','scaleHigh']){
      const rule:FieldSpec=['hidden','points','innerBox'].includes(key)?{type:'boolean'}:['sourceKey','name'].includes(key)?{type:'text'}:['color','fillColor','lineColor','scaleLow','scaleMid','scaleHigh'].includes(key)?{type:'color'}:{type:'number',min:0,max:['opacity','fillOpacity'].includes(key)?1:key==='lineWidth'?20:100};
      if(valid(t[key],rule))n[key]=t[key];
    }
    if(!n.sourceKey)delete n.hidden;
    if(!['scaleLow','scaleMid','scaleHigh'].every(k=>isHex(n[k])))for(const k of ['scaleLow','scaleMid','scaleHigh'])delete n[k];
    traces.push(n as EditorTrace);
  }
  if(Array.isArray(s.annotations))out.annotations=s.annotations.slice(0,30).flatMap(raw=>{
    const a=record(raw),font=record(a.font);
    if(!valid(a.text,{type:'text'})||!valid(a.x,{type:'number',min:0,max:1})||!valid(a.y,{type:'number',min:0,max:1}))return [];
    return [{text:a.text as string,x:a.x as number,y:a.y as number,xref:'paper' as const,yref:'paper' as const,showarrow:false as const,font:{size:Math.max(6,Math.min(72,Number(a.size??font.size)||14)),color:isHex(a.color)?a.color:isHex(font.color)?font.color:'#17375e'}}];
  });
  if(Array.isArray(s.categoryLabels)){
    out.categoryLabels=[];
    for(const raw of s.categoryLabels.slice(0,2)){
      const a=record(raw),keys=array(a.sourceKeys),values=array(a.values),labels=array(a.labels);
      if((a.axis!=='xaxis'&&a.axis!=='yaxis')||out.categoryLabels.some(c=>c.axis===a.axis)||!keys.length||keys.length>100||keys.some(k=>!valid(k,{type:'text'})||!k)||new Set(keys).size!==keys.length||!values.length||values.length>100||values.length!==labels.length||new Set(values).size!==values.length||[...values,...labels].some(v=>!valid(v,{type:'text'})))continue;
      out.categoryLabels.push({axis:a.axis,sourceKeys:(keys as string[]).slice().sort(),values:[...values] as string[],labels:[...labels] as string[]});
    }
  }
  return out;
}
export interface EditorState extends Editor { history?: {past:Editor[];future:Editor[]} }
export type EditorAction =
  | {type:'layout';key:keyof EditorLayout;value:string|number|boolean}
  | {type:'layoutPatch';patch:EditorLayout}
  | {type:'trace';index:number;patch:Partial<EditorTrace>}
  | {type:'traces';patches:EditorTrace[]}
  | {type:'palette';palette:PaletteName;greyHealthy:boolean}
  | {type:'swapAxes';value?:boolean}
  | {type:'annotations';annotations:NonNullable<Editor['annotations']>}
  | {type:'categoryLabels';categoryLabels:NonNullable<Editor['categoryLabels']>}
  | {type:'replace'|'publication';editor:Editor}
  | {type:'reset'|'undo'|'redo'};
/** History is local to this editor and is intentionally excluded from serialization. */
export function reduceEditor(editor:EditorState|undefined,action:EditorAction):EditorState {
  const current=serializeEditor(editor),{past=[],future=[]}=editor?.history??{};
  if(action.type==='undo')return past.length?{...structuredClone(past[past.length-1]),history:{past:past.slice(0,-1),future:[current,...future].slice(0,50)}}:editor??current;
  if(action.type==='redo')return future.length?{...structuredClone(future[0]),history:{past:[...past,current].slice(-50),future:future.slice(1)}}:editor??current;
  let next:Editor=structuredClone(current);
  switch(action.type){
    case 'layout': next.layout={...next.layout,[action.key]:action.value};break;
    case 'layoutPatch':next.layout={...next.layout,...action.patch};break;
    case 'trace': next.traces=[...(next.traces??[]).filter(t=>t.index!==action.index),{...(next.traces??[]).find(t=>t.index===action.index),...action.patch,index:action.index} as EditorTrace];break;
    case 'traces':for(const patch of action.patches){const old=next.traces?.find(t=>t.index===patch.index);next.traces=[...(next.traces??[]).filter(t=>t.index!==patch.index),{...old,...patch} as EditorTrace];}break;
    case 'palette':next.palette=action.palette;next.greyHealthy=action.greyHealthy;
      next.traces=(next.traces??[]).map(t=>{const n={...t};for(const k of ['color','lineColor','fillColor','fillOpacity'] as const)delete n[k];return n;});break;
    case 'swapAxes':next.swapAxes=action.value??!next.swapAxes;break;
    case 'annotations':next.annotations=action.annotations;break;
    case 'categoryLabels':next.categoryLabels=action.categoryLabels;break;
    case 'reset':next={};break;
    case 'replace':case 'publication':next=action.editor;break;
  }
  next=serializeEditor(next);
  if(JSON.stringify(current)===JSON.stringify(next))return editor??current;
  return {...next,history:{past:[...past,current].slice(-50),future:[]}};
}
