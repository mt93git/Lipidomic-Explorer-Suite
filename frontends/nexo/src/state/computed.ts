// Controls Team's module computes at run time (renderUI per group / sample): Team's canvas never saves them,
// so Nexo keeps them in its own member (NexoNode.inputs) and re-sends them to the card after a reopen.
import type {Command} from './commands';
import {markerSymbols, setNexoInputs, type Nexo, type NexoInputs} from './nexo';
import type {Node,SchemaControl} from '../api/types';
export const plotlySymbols=[...new Set<string>([...markerSymbols,'triangle-left','triangle-right','pentagon','hexagon','star-open','triangle-up-open'])];
// gridLog2fcThresh: the structural grid's "Log2FC Threshold (abs):" (12_structural_grid_module.R gridLog2fcThreshUI).
// sel_<category>: FLA's index picker (10_fla_module.R indexPickerUI); the server offers it on FLA cards only (schema.R).
export function isComputedId(id:string):boolean { return /^(customCol|customShape|sel)_.+$/.test(id)||id==='bqcSamples'||id==='gridLog2fcThresh'||/^case_bucket_.+$/.test(id); }
export function computedOf(inputs:Record<string,unknown>|undefined):NexoInputs {
 return Object.fromEntries(Object.entries(inputs??{}).filter(([k])=>isComputedId(k)));
}
export const isCheckboxGroup=(type:string|undefined):boolean=>type?.toLowerCase()==='checkboxgroup';
/** The shape select's choices: the control's own options (Team's ggplot pch numbers with names), plotly symbols as a fallback. */
export function shapeChoices(control:SchemaControl|undefined):{value:string;label:string}[] {
 return control?.options?.length?control.options.map(o=>({value:String(o.value),label:o.label||String(o.value)})):plotlySymbols.map(v=>({value:v,label:v}));
}
// Preview glyphs: ggplot pch numbers Team's module offers, and the plotly symbol names.
const glyphs:Record<string,string>={'16':'●','19':'●','20':'●','1':'○','15':'■','0':'□','17':'▲','2':'△','18':'◆','5':'◇','3':'✚','4':'✕','8':'✳',
 circle:'●',square:'■',diamond:'◆',cross:'✚',x:'✕','triangle-up':'▲','triangle-down':'▼','triangle-left':'◀','triangle-right':'▶',star:'★',pentagon:'⬟',hexagon:'⬢','circle-open':'○','square-open':'□','diamond-open':'◇','star-open':'☆','triangle-up-open':'△'};
export const shapeGlyph=(value:string):string=>glyphs[value]??'●';
/** Only well-formed values reach the API: a hex colour, a shape the control offers, a list of sample ids, a threshold >= 0.
 * A shape is checked against its control's options; a control without options takes plotly names; with no schema
 * at hand (reopen, paste) a plotly name or a ggplot pch number (0-25) passes. */
export function validateComputed(inputs:Record<string,unknown>|undefined,controls?:readonly SchemaControl[]):NexoInputs {
 const out:NexoInputs={};
 for(const [k,v] of Object.entries(computedOf(inputs))){
  if(k.startsWith('customCol_')){if(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))out[k]=v;}
  else if(k.startsWith('customShape_')){
   if(typeof v!=='string')continue;
   const control=controls?.find(c=>c.id===k);
   const ok=control?.options?.length?control.options.some(o=>String(o.value)===v):controls?/^[a-z-]{1,40}$/.test(v):/^[a-z-]{1,40}$/.test(v)||/^(1?\d|2[0-5])$/.test(v);
   if(ok)out[k]=v;
  }
  else if(k==='gridLog2fcThresh'){if(typeof v==='number'&&Number.isFinite(v)&&v>=0)out[k]=v;}
  else if(Array.isArray(v))out[k]=v.filter(x=>typeof x==='string'&&x.length<=500).slice(0,5000);
 }
 return out;
}
/** One committed change: merged into the node's member; `baseline` (the server's value before the first edit)
 * fills keys the member lacks so undo has something to restore and send. */
export function setNexoComputed(id:string,patch:NexoInputs,baseline:NexoInputs={}):Command {
 return {kind:'setNexoComputed',apply(doc){
  const current=(doc as typeof doc&{nexo?:Nexo}).nexo?.nodes[id]?.inputs??{};
  const before={...Object.fromEntries(Object.entries(baseline).filter(([k])=>!(k in current))),...current};
  const inner=setNexoInputs(id,{...before,...structuredClone(patch)});
  return inner.apply(doc);
 },invert(doc){
  const current=(doc as typeof doc&{nexo?:Nexo}).nexo?.nodes[id]?.inputs??{};
  const before={...Object.fromEntries(Object.entries(baseline).filter(([k])=>!(k in current))),...current};
  return setNexoInputs(id,Object.keys(before).length?before:undefined);
 }};
}
/** The PATCHes to send after a session opens: one per Team card whose member carries computed values. */
export function computedResends(nodes:readonly Node[],nexo:Nexo|undefined):{nodeId:string;instanceId:string;inputs:NexoInputs}[] {
 return nodes.flatMap(n=>{const instanceId=n.instance?.instanceId??n.instance?.id;const inputs=validateComputed(nexo?.nodes[n.id]?.inputs);
  return instanceId&&Object.keys(inputs).length?[{nodeId:n.id,instanceId,inputs}]:[];});
}
/** Duplicate / paste: the copy gets its own clone of the original's computed values. */
export function carryComputed(id:string,inputs:Record<string,unknown>|undefined):Command {
 const values=computedOf(inputs);return setNexoInputs(id,Object.keys(values).length?structuredClone(values):undefined);
}
