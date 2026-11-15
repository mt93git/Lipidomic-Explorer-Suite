/** Team's Signal distribution transport (R/results_dashboard.R, plotly_build.team_compact_distribution): a box
 * trace's repeated sample name is sent once ({teamRepeat, n}) and its values as exact little-endian doubles
 * ({teamFloat64}). Restore the same plain arrays before Plotly sees the figure, as www/team/js/plot_payload.js does
 * for Team. Every trace is validated first; on any defect the figure is returned exactly as received. */
type Packed={teamPacked?:unknown;data?:unknown};
function doubles(b64:string):number[]{
  const bin=atob(b64);if(bin.length%8)throw new Error('truncated doubles');
  const view=new DataView(new ArrayBuffer(bin.length));for(let i=0;i<bin.length;i++)view.setUint8(i,bin.charCodeAt(i));
  return Array.from({length:bin.length>>3},(_,j)=>view.getFloat64(j*8,true));
}
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const only=(v:Record<string,unknown>,keys:string[])=>{const k=Object.keys(v);return k.length===keys.length&&keys.every(key=>k.includes(key));};
function member(v:unknown,kind:'x'|'y'):{packed:boolean;value:unknown}{
  if(!plain(v))return {packed:false,value:v};
  if(kind==='x'&&only(v,['teamRepeat','n'])&&typeof v.teamRepeat==='string'&&Number.isSafeInteger(v.n)&&(v.n as number)>0)return {packed:true,value:Array(v.n as number).fill(v.teamRepeat)};
  if(kind==='y'&&only(v,['teamFloat64'])&&typeof v.teamFloat64==='string')return {packed:true,value:doubles(v.teamFloat64)};
  throw new Error('malformed packed '+kind);
}
/** NEXO-P9 2: Team's rule (plotly_build.team_compact_distribution): a per-point hovertemplate whose entries are all the
 * same string is that one string, the same text for every point. plotly R expands the dashboard violin's template per
 * sample, and hovering a violin's body Plotly hands the whole array to its formatter ("t.replace is not a function"). */
const repeated=(h:unknown):h is string[]=>Array.isArray(h)&&h.length>1&&typeof h[0]==='string'&&h.every(v=>v===h[0]);
function compactTemplates<T>(figure:T):T{
  const f=figure as Packed;
  if(!plain(f)||!Array.isArray(f.data)||!f.data.some(t=>plain(t)&&repeated(t.hovertemplate)))return figure;
  return {...f,data:f.data.map(t=>plain(t)&&repeated(t.hovertemplate)?{...t,hovertemplate:t.hovertemplate[0]}:t)} as T;
}
export function unpackFigure<T>(received:T):T{
  const figure=compactTemplates(received),f=figure as Packed;
  if(!plain(f)||f.teamPacked!==1||!Array.isArray(f.data))return figure;
  let decoded:{x:unknown[]|null;y:unknown[]|null}[];
  try{
    decoded=f.data.map(trace=>{
      if(!plain(trace))throw new Error('trace is not an object');
      const dx=member(trace.x,'x'),dy=member(trace.y,'y');
      if((dx.packed||dy.packed)&&!(Array.isArray(dx.value)&&Array.isArray(dy.value)&&dx.value.length===dy.value.length))throw new Error('packed x/y lengths differ');
      return {x:dx.packed?dx.value as unknown[]:null,y:dy.packed?dy.value as unknown[]:null};
    });
  }catch(error){console.warn('Team plot payload could not be restored; left unchanged.',error);return figure;}
  const {teamPacked:_,...rest}=f;
  return {...rest,data:f.data.map((trace,i)=>({...trace as object,...(decoded[i].x?{x:decoded[i].x}:{}),...(decoded[i].y?{y:decoded[i].y}:{})}))} as T;
}
