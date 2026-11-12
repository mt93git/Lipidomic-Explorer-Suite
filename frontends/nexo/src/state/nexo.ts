import type {Command} from './commands';
import {MARKER_SYMBOLS} from '../editor/editorState';
export interface AxisStyle {min?:number;max?:number;type?:'linear'|'log';tickformat?:string;dtick?:number;nticks?:number}
export const markerSymbols=['circle','square','diamond','cross','x','triangle-up','triangle-down','star','circle-open','square-open','diamond-open'] as const;
export const lineDashes=['solid','dot','dash','longdash','dashdot','longdashdot'] as const;
export const legendOrders=['normal','reversed','grouped','grouped+reversed'] as const;
export interface NexoSeries {index:number;sourceKey?:string;lineDash?:typeof lineDashes[number]}
export interface NexoShape {type:'line'|'rect';x0:number;x1:number;y0:number;y1:number;color?:string;width?:number;opacity?:number}
export interface NexoAnnotation {text:string;x:number;y:number;ax?:number;ay?:number;color?:string;size?:number}
export interface NexoStyle {series?:NexoSeries[];legendOrder?:typeof legendOrders[number];shapes?:NexoShape[];annotations?:NexoAnnotation[];xaxis?:AxisStyle;yaxis?:AxisStyle;titleWeight?:'normal'|'bold';axisWeight?:'normal'|'bold';legendWeight?:'normal'|'bold';margin?:Partial<Record<'l'|'r'|'t'|'b'|'pad',number>>;
 /** F10: diverging heat scales centred on 0 (zmid); presentation only. */
 heatSymmetric?:boolean}
/** A fixed dashboard card (no Team instance) keeps its own Data inputs here: Team's node cannot carry them. */
export type NexoInputs=Record<string,unknown>;
/** actions: module buttons pressed on the card, in order (state/actions.ts; chart audit b07 F3). */
export interface NexoNode {style?:NexoStyle;inputs?:NexoInputs;actions?:string[]}
/** Steph review rows 2/12: the study design the author confirmed, kept so a reopen can offer it when the session does not
 *  come back confirmed (production's restore re-applies the archived design inputs; the mock does not). Never confirmed
 *  from here by itself: the user confirms. */
export interface SavedDesign {unit:string;type:'independent'|'paired'}
export interface Nexo {version:1;nodes:Record<string,NexoNode>;design?:SavedDesign}
export function validateSavedDesign(value:unknown):SavedDesign|undefined{
 const v=object(value);if(typeof v.unit!=='string'||!v.unit.trim()||v.unit.length>80||(v.type!=='independent'&&v.type!=='paired'))return undefined;
 return {unit:v.unit,type:v.type};
}
export function withSavedDesign(nexo:Nexo|undefined,design:SavedDesign):Nexo{const next=validateNexo(nexo),clean=validateSavedDesign(design);if(clean)next.design=clean;return next;}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const number=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function tickFormat(value:unknown):value is string {
 if(typeof value!=='string'||value.length>80)return false;
 // Bound padding/precision as well as length: d3-format may otherwise allocate huge labels.
 const numeric=/^(?:(?:[^\r\n][<>=^])|[<>=^])?[+\-( ]?[$#]?0?\d{0,3},?(?:\.\d{1,2})?~?[bcdeEfFgGnosprxX%]?$/;
 const date=/^(?:[^%<>]*%[-_0^#]?[a-zA-Z%])+[^%<>]*$/;
 return numeric.test(value)||date.test(value);
}
export function validateNexoStyle(value:unknown):NexoStyle {
 const v=object(value),out:NexoStyle={};
 for(const key of ['xaxis','yaxis'] as const){const a=object(v[key]),axis:AxisStyle={};for(const k of ['min','max'] as const)if(number(a[k],-1e15,1e15))axis[k]=a[k];if(axis.min!==undefined&&axis.max!==undefined&&axis.min>=axis.max){delete axis.min;delete axis.max;}
 if(a.type==='linear'||a.type==='log')axis.type=a.type;
 if(tickFormat(a.tickformat))axis.tickformat=a.tickformat;
 if(number(a.dtick,1e-12,1e15))axis.dtick=a.dtick;
 if(number(a.nticks,1,1000)&&Number.isInteger(a.nticks))axis.nticks=a.nticks;
 if(Object.keys(axis).length)out[key]=axis;}
 if(v.heatSymmetric===true)out.heatSymmetric=true;
 for(const k of ['titleWeight','axisWeight','legendWeight'] as const)if(v[k]==='normal'||v[k]==='bold')out[k]=v[k];
 const m=object(v.margin),margin:NexoStyle['margin']={};for(const k of ['l','r','t','b','pad'] as const)if(number(m[k],0,1000))margin[k]=m[k];if(Object.keys(margin).length)out.margin=margin;
 const color=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 if(legendOrders.includes(v.legendOrder as typeof legendOrders[number]))out.legendOrder=v.legendOrder as typeof legendOrders[number];
 if(Array.isArray(v.series)){const series:NexoSeries[]=[];const seen=new Set<number>();for(const raw of v.series.slice(0,100)){const t=object(raw);if(!number(t.index,0,999)||!Number.isInteger(t.index)||seen.has(t.index))continue;const patch:NexoSeries={index:t.index};if(typeof t.sourceKey==='string'&&t.sourceKey.length<=500)patch.sourceKey=t.sourceKey;
 if(lineDashes.includes(t.lineDash as typeof lineDashes[number]))patch.lineDash=t.lineDash as typeof lineDashes[number];
 if(patch.lineDash){series.push(patch);seen.add(t.index);}}if(series.length)out.series=series;}
 if(Array.isArray(v.shapes)){const shapes:NexoShape[]=[];for(const raw of v.shapes.slice(0,50)){const t=object(raw);if(t.type!=='line'&&t.type!=='rect'||!['x0','x1','y0','y1'].every(k=>number(t[k],-1e15,1e15)))continue;const shape:NexoShape={type:t.type,x0:t.x0 as number,x1:t.x1 as number,y0:t.y0 as number,y1:t.y1 as number};if(color(t.color))shape.color=t.color;if(number(t.width,0,20))shape.width=t.width;if(number(t.opacity,0,1))shape.opacity=t.opacity;shapes.push(shape);}if(shapes.length)out.shapes=shapes;}
 if(Array.isArray(v.annotations)){const annotations:NexoAnnotation[]=[];for(const raw of v.annotations.slice(0,30)){const t=object(raw);if(typeof t.text!=='string'||t.text.length>500||!number(t.x,-1e15,1e15)||!number(t.y,-1e15,1e15))continue;const a:NexoAnnotation={text:t.text,x:t.x,y:t.y};if(color(t.color))a.color=t.color;if(number(t.size,6,72))a.size=t.size;for(const k of ['ax','ay'] as const)if(number(t[k],-200,200))a[k]=t[k];annotations.push(a);}if(annotations.length)out.annotations=annotations;}
 return out;
}
/** NEXO-P3: one marker shape, Team's saved markerSymbol (visual.editor.traces). A saved Nexo "Series style → Marker
 *  symbol" (nexo series markerSymbol, read before validateNexo drops it) moves there on load when Team offers the shape
 *  and the series has no Team shape yet; other shapes are dropped. Returns the nodes, changed ones copied. */
export function migrateMarkerSymbols<T extends {id:string;visual?:unknown}>(nodes:T[],nexo:unknown):T[] {
 const saved=object(object(nexo).nodes);
 return nodes.map(node=>{
  const series=(Array.isArray(object(object(saved[node.id]).style).series)?object(object(saved[node.id]).style).series as unknown[]:[]).map(object)
   .filter(s=>Number.isInteger(s.index)&&(MARKER_SYMBOLS as readonly unknown[]).includes(s.markerSymbol));
  if(!series.length)return node;
  const visual=structuredClone(object(node.visual)),editor=visual.editor=object(visual.editor),traces=editor.traces=Array.isArray(editor.traces)?editor.traces:[];
  for(const s of series){const key=typeof s.sourceKey==='string'?s.sourceKey:undefined;
   const patch=traces.find((t:Record<string,unknown>)=>key?t.sourceKey===key:t.index===s.index);
   if(!patch)traces.push({index:s.index,...(key?{sourceKey:key}:{}),markerSymbol:s.markerSymbol});else if(!patch.markerSymbol)patch.markerSymbol=s.markerSymbol;}
  return {...node,visual};
 });
}
export function validateNexo(value:unknown,ids?:readonly string[]):Nexo {
 const out:Nexo={version:1,nodes:{}};try{if(new TextEncoder().encode(JSON.stringify(value)).length>2*1024**2)return out;}catch{return out;}
 const v=object(value);if(v.version!==1)return out;
 for(const [id,node] of Object.entries(object(v.nodes))){if(ids&&!ids.includes(id)||id==='__proto__'||id==='constructor')continue;const clean=validateNexoNode(node);if(clean)out.nodes[id]=clean;}
 const design=validateSavedDesign(v.design);if(design)out.design=design;return out;
}
/** Same bounds as Team's instance inputs: a plain object, at most 250 keys and 512 KiB. */
export function validateNexoInputs(value:unknown):NexoInputs|undefined {
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const keys=Object.keys(value);if(!keys.length||keys.length>250||keys.some(k=>k==='__proto__'||k==='constructor'))return undefined;
 try{const text=JSON.stringify(value);return text.length>512*1024?undefined:JSON.parse(text);}catch{return undefined;}
}
function validateNexoNode(value:unknown):NexoNode|undefined {
 const v=object(value),style=validateNexoStyle(v.style),inputs=validateNexoInputs(v.inputs),out:NexoNode={};
 if(Object.keys(style).length)out.style=style;if(inputs)out.inputs=inputs;
 const actions=validateNexoActions(v.actions);if(actions.length)out.actions=actions;
 return Object.keys(out).length?out:undefined;
}
function withNode(nexo:Nexo|undefined,id:string,patch:NexoNode):Nexo {
 const next=validateNexo(nexo),node=validateNexoNode({...next.nodes[id],...patch});
 if(node)next.nodes[id]=node;else delete next.nodes[id];return next;
}
export function setNexoInputs(id:string,inputs:NexoInputs|undefined):Command {
 return {kind:'setNexoInputs',apply(doc){return {...doc,nexo:withNode((doc as typeof doc&{nexo?:Nexo}).nexo,id,{inputs:inputs&&structuredClone(inputs)})};},invert(doc){return setNexoInputs(id,(doc as typeof doc&{nexo?:Nexo}).nexo?.nodes[id]?.inputs);}};
}
/** Same rule as state/actions.ts recordedActions (kept here so nexo.ts has no import cycle). */
function validateNexoActions(value:unknown):string[] {
 if(!Array.isArray(value))return [];const out:string[]=[];
 for(const id of value)if(typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(id)&&!/download/i.test(id)&&!out.includes(id)&&out.length<20)out.push(id);
 return out;
}
export function setNexoActions(id:string,actions:string[]|undefined):Command {
 return {kind:'setNexoActions',apply(doc){return {...doc,nexo:withNode((doc as typeof doc&{nexo?:Nexo}).nexo,id,{actions:actions?[...actions]:undefined})};},invert(doc){return setNexoActions(id,(doc as typeof doc&{nexo?:Nexo}).nexo?.nodes[id]?.actions);}};
}
export function setNexoStyle(id:string,style:NexoStyle):Command {
 return {kind:'setNexoStyle',coalesceKey:`nexo:${id}`,apply(doc){return {...doc,nexo:withNode((doc as typeof doc&{nexo?:Nexo}).nexo,id,{style})};},invert(doc){return setNexoStyle(id,(doc as typeof doc&{nexo?:Nexo}).nexo?.nodes[id]?.style??{});}};
}

/** The mock mirrors the API's envelope validation, before any optional field sanitizing. */
export function assertNexoMember(value:unknown):asserts value is Nexo {
 const fail=(message:string)=>{throw Object.assign(new Error(message),{error:'invalid_nexo',status:400});};
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Nexo must be an object.');
 if(object(value).version!==1)fail('Nexo version must be 1.');
 let bytes=Infinity;try{bytes=new TextEncoder().encode(JSON.stringify(value)).length;}catch{/* Invalid JSON is rejected below. */}
 if(bytes>2*1024**2)fail('Nexo must be at most 2 MiB.');
}
