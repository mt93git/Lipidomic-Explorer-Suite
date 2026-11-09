import { isHex, serializeEditor, type Editor } from './editorState';
import { PALETTES } from './palettes';
import type { EditorTrace } from '../state/document';
// Plotly JSON is extensible; keep arbitrary scientific attributes at this boundary.
export type PlotObject = Record<string, any>;
export interface Figure { data: PlotObject[]; layout: PlotObject }
const sources=new WeakMap<Figure,Figure>();
const clone=<T,>(v:T):T=>structuredClone(v);
/** Detached original. Retain this across JSON/worker boundaries, which lose provenance. */
export function baselineOf(figure:Figure):Figure{return clone(sources.get(figure)??figure);}
export function readPath(o:PlotObject|undefined,path:string):any{return path.split('.').reduce((v,k)=>v?.[k],o);}
function writePath(o:PlotObject,path:string,value:unknown){
  const parts=path.split('.');let target=o;
  for(const k of parts.slice(0,-1)){if(!target[k]||typeof target[k]!=='object')target[k]=typeof target[k]==='string'?{text:target[k]}:{};target=target[k];}
  target[parts[parts.length-1]]=value;
}
export function sourceKey(t:PlotObject,data:PlotObject[],legacy=false):string{
  const key=t.meta?.teamSourceKey;
  if(!legacy&&typeof key==='string'&&key.length&&key.length<=450)return data.filter(a=>a.meta?.teamSourceKey===key).length===1?'source:'+key:'';
  const parts=[t.type||'scatter',t.name||'',t.legendgroup||''],signature=JSON.stringify(parts);
  if(data.filter(a=>JSON.stringify([a.type||'scatter',a.name||'',a.legendgroup||''])===signature).length!==1)return '';
  let hash=2166136261;for(let c=0;c<signature.length;c++){hash^=signature.charCodeAt(c);hash=Math.imul(hash,16777619);}
  return JSON.stringify([parts[0],String(parts[1]).slice(0,100),String(parts[2]).slice(0,100),hash>>>0,0]);
}
export function seriesCapabilities(t:PlotObject){
  const type=t.type||'scatter',mode=String(t.mode||'markers'),scatter=['scatter','scattergl'].includes(type);
  return {marker:scatter?mode.includes('markers'):['bar','histogram','box','violin','waterfall'].includes(type),markerSize:scatter&&mode.includes('markers'),line:scatter?mode.includes('lines'):['box','violin','bar','histogram'].includes(type),fill:['box','violin','bar','histogram'].includes(type)||!!(scatter&&t.fill&&t.fill!=='none'&&!t.fillgradient),continuous:['heatmap','contour','histogram2d'].includes(type)};
}
export const editableColor=(t:PlotObject,path:string)=>{const obj=readPath(t,path)||{};return (obj.color==null||['string','number','boolean'].includes(typeof obj.color))&&!obj.colorscale&&!obj.coloraxis;};
export const supportsHeatScale=(t:PlotObject)=>t.type==='heatmap'&&!t.coloraxis&&!t.reversescale&&t.zmid==null;
const fillPath=(t:PlotObject)=>['bar','histogram'].includes(t.type)?'marker.color':'fillcolor';
const borderPath=(t:PlotObject)=>['bar','histogram'].includes(t.type)?'marker.line':'line';
const alpha=(v:unknown)=>typeof v==='string'?Number(v.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([.\d]+)\s*\)$/)?.[1]??1):1;
const rgba=(hex:string,a:number)=>`rgba(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(',')},${a})`;
const darker=(hex:string,f:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-f)).toString(16).padStart(2,'0')).join('');
const safeText=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function orientationSupported(f:Figure):boolean{return f.data.every(t=>['scatter','scattergl','bar','box','violin','heatmap','contour','histogram','histogram2d'].includes(t.type||'scatter')&&!t.transforms)&&!(f.layout.shapes||[]).some((s:PlotObject)=>s.type==='path')&&!f.layout.scene&&!f.layout.polar;}
const axisRef=(v:any):any=>typeof v==='string'?v.replace(/^(x|y)(axis)?(\d*)( domain)?$/,(_,a,b,n,d)=>(a==='x'?'y':'x')+(b||'')+n+(d||'')):v;
function swap(o:PlotObject,a:string,b:string){const av=o[a],bv=o[b];if(bv===undefined)delete o[a];else o[a]=bv;if(av===undefined)delete o[b];else o[b]=av;}
const transpose=(m:any):any=>Array.isArray(m)&&m.length&&m.every(r=>Array.isArray(r)&&r.length===m[0].length)?m[0].map((_:unknown,i:number)=>m.map(r=>r[i])):m;
function orient(f:Figure):Figure{
  const {data,layout}=clone(f);
  for(const t of data){
    for(const [a,b] of [['x','y'],['x0','y0'],['dx','dy'],['error_x','error_y'],['xbins','ybins']])swap(t,a,b);
    if(t.fill)t.fill=({tozeroy:'tozerox',tozerox:'tozeroy',tonexty:'tonextx',tonextx:'tonexty'} as PlotObject)[t.fill]||t.fill;
    const xa=t.xaxis,ya=t.yaxis;t.xaxis=axisRef(ya||'y');t.yaxis=axisRef(xa||'x');
    if(['bar','box','violin','histogram'].includes(t.type)||t.stackgroup)t.orientation=t.orientation==='h'?'v':'h';
    if(['heatmap','contour','histogram2d'].includes(t.type))for(const k of ['z','text','hovertext','customdata'])if(t[k])t[k]=transpose(t[k]);
    for(const k of ['hovertemplate','texttemplate'])if(typeof t[k]==='string')t[k]=t[k].replace(/%\{([xy])(?=[:}])/g,(_:string,a:string)=>'%{'+(a==='x'?'y':'x'));
  }
  const axes=Object.keys(f.layout).filter(k=>/^[xy]axis\d*$/.test(k));
  for(const k of axes)delete layout[k];
  for(const k of axes){const a=clone(f.layout[k]);for(const p of ['anchor','overlaying','matches','scaleanchor'])if(a[p])a[p]=axisRef(a[p]);layout[axisRef(k)]=a;}
  const partners=new Map<string,Set<string>>();
  for(const t of f.data){const x=t.xaxis||'x',y=t.yaxis||'y';partners.set(x,(partners.get(x)??new Set()).add(y));partners.set(y,(partners.get(y)??new Set()).add(x));}
  if(![...partners.values()].some(s=>s.size>1))for(const t of f.data){const x=(t.xaxis||'x').replace(/^x/,'xaxis'),y=(t.yaxis||'y').replace(/^y/,'yaxis');if(layout[axisRef(y)]&&f.layout[x]?.domain)layout[axisRef(y)].domain=clone(f.layout[x].domain);if(layout[axisRef(x)]&&f.layout[y]?.domain)layout[axisRef(x)].domain=clone(f.layout[y].domain);}
  if(typeof layout.hovermode==='string')layout.hovermode=layout.hovermode.replace(/^[xy](?= unified$|$)/,(a:string)=>axisRef(a));
  if(layout.grid){swap(layout.grid,'rows','columns');swap(layout.grid,'xaxes','yaxes');if(layout.grid.subplots)layout.grid.subplots=transpose(layout.grid.subplots).map((row:any[])=>row.map(v=>typeof v==='string'?v.replace(/x(\d*)y(\d*)/g,(_,x,y)=>'x'+y+'y'+x):v));}
  for(const k of ['annotations','shapes','images'])for(const a of layout[k]||[]){
    if((a.xref||(k==='shapes'?'x':'paper'))==='paper'&&(a.yref||(k==='shapes'?'y':'paper'))==='paper')continue;
    for(const [x,y] of [['x','y'],['x0','y0'],['x1','y1'],['ax','ay'],['sizex','sizey'],['xanchor','yanchor']])swap(a,x,y);
    const xr=a.xref,yr=a.yref;a.xref=axisRef(yr||'y');a.yref=axisRef(xr||'x');
    if(a.xanchor)a.xanchor=({bottom:'left',top:'right',middle:'center'} as PlotObject)[a.xanchor]||a.xanchor;
    if(a.yanchor)a.yanchor=({left:'bottom',right:'top',center:'middle'} as PlotObject)[a.yanchor]||a.yanchor;
    const ax=a.axref,ay=a.ayref;if(ax||ay){a.axref=axisRef(ay);a.ayref=axisRef(ax);}
  }
  return {data,layout};
}
function publicationGroup(label:string):string|undefined{
  const key=label.toLowerCase().replace(/[^a-z]/g,'');
  if(/^healthy(?:$|[_ -])/i.test(label))return '#7A7A7A';
  if(['steady','steadystate','scsteadystate'].includes(key))return '#377eb8';
  if(['pain','crisis','paincrisis','scpaincrisis'].includes(key))return '#d82332';
}
export function publicationEditor(figure:Figure,editor?:Editor):Editor{
  const source=baselineOf(figure),next=serializeEditor(editor);
  Object.assign(next.layout!,{'paper_bgcolor':'#ffffff','plot_bgcolor':'#ffffff','font.family':'Arial','font.color':'#000000','font.size':12,'title.font.family':'Arial','title.font.color':'#000000','title.font.size':16,'legend.font.family':'Arial','legend.font.color':'#000000','legend.font.size':11,'legend.bgcolor':'#ffffff'});
  for(const axis of ['xaxis','yaxis'])if(source.layout[axis])Object.assign(next.layout!,{[axis+'.showgrid']:false,[axis+'.showline']:true,[axis+'.linewidth']:0.75,[axis+'.color']:'#000000',[axis+'.title.font.size']:12,[axis+'.tickfont.size']:11});
  source.data.forEach((t,index)=>{const a=publicationGroup(t.name||''),b=publicationGroup(t.legendgroup||''),color=a||b;if(!color||(a&&b&&a!==b)||!editableColor(t,'marker'))return;
    let patch=next.traces!.find(p=>p.index===index);if(!patch){patch={index};next.traces!.push(patch);}patch.color=color;if(editableColor(t,'line'))patch.lineColor=color;if(seriesCapabilities(t).fill)patch.fillColor=color;
  });return next;
}
/** Study conditions from layout.meta; the API's auto_unbox sends a one-level study as a bare string. */
export function teamConditionsOf(layout:Figure['layout']):string[]|undefined{
  const c=layout?.meta?.teamConditions;return c==null?undefined:(Array.isArray(c)?c:[c]).filter((n:unknown):n is string=>typeof n==='string');
}
export type Preset='team'|'nexo'|'publication';
export const PRESET_LABELS:Record<Preset,string>={team:'Team original',nexo:'Nexo',publication:'Publication'};
/** Nexo presentation: the card's own chrome (system font, ink text, hairline axes, light grid), a colour-blind-safe
 * palette with Healthy in grey, and a centred legend under the plot. Only cosmetic allow-list keys; the science and
 * Team's per-class colours (traces outside layout.meta.teamConditions) are untouched. Team original stays one click away. */
export function nexoEditor(figure:Figure,editor?:Editor):Editor{
  const source=baselineOf(figure),next=serializeEditor(editor);
  Object.assign(next.layout!,{'paper_bgcolor':'#ffffff','plot_bgcolor':'#ffffff','font.family':'system-ui','font.color':'#141b24','font.size':12,'title.font.family':'system-ui','title.font.color':'#162230','title.font.size':15,'legend.font.family':'system-ui','legend.font.color':'#141b24','legend.font.size':11,'legend.bgcolor':'#ffffff'});
  if(source.layout.showlegend!==false)Object.assign(next.layout!,{'legend.orientation':'h','legend.x':0.5,'legend.xanchor':'center','legend.y':-0.25,'legend.yanchor':'top'});
  for(const axis of ['xaxis','yaxis'])if(source.layout[axis])Object.assign(next.layout!,{[axis+'.showgrid']:source.layout[axis].type!=='category'&&!source.data.some(t=>t.type==='heatmap'),[axis+'.gridcolor']:'#e3e7ec',[axis+'.gridwidth']:1,[axis+'.zeroline']:false,[axis+'.showline']:true,[axis+'.linewidth']:1,[axis+'.title.font.size']:12,[axis+'.tickfont.size']:11});
  next.palette='Okabe–Ito';next.greyHealthy=true;
  next.traces=(next.traces??[]).map(t=>{const n={...t};for(const k of ['color','lineColor','fillColor','fillOpacity'] as const)delete n[k];return n;});
  return next;
}
/** Which preset the editor currently sits on: Team original when nothing is changed, Nexo or Publication when applying
 * that preset again would change nothing. Custom tweaks on top of a preset report no preset. */
export function presetOf(figure:Figure,editor?:Editor):Preset|undefined{
  const current=JSON.stringify(serializeEditor(editor));
  if(current===JSON.stringify(serializeEditor({})))return 'team';
  if(current===JSON.stringify(nexoEditor(figure,editor)))return 'nexo';
  if(current===JSON.stringify(publicationEditor(figure,editor)))return 'publication';
}
/** Pure figure transform. Outputs carry private weak provenance for repeat application/reset.
 * After serialization, apply to a retained baselineOf(original), not the rendered JSON.
 */
export function applyEditor(figure:Figure,editor:Editor|undefined,options:{publication?:boolean}={}):Figure{
  const original=baselineOf(figure),s=options.publication?publicationEditor(original,editor):serializeEditor(editor);
  const out=s.swapAxes&&orientationSupported(original)?orient(original):clone(original);
  const conditions=teamConditionsOf(original.layout),labels=[...new Set((conditions??original.data.map(t=>t.meta?.teamCondition||t.legendgroup||t.name)).filter(Boolean))];
  const patches=new Map<number,EditorTrace>();
  const allKeyed=original.data.every(t=>sourceKey(t,original.data)!=='');
  for(const patch of s.traces??[]){if(!patch.sourceKey&&!allKeyed)continue;const index=patch.sourceKey?original.data.findIndex(t=>[sourceKey(t,original.data),sourceKey(t,original.data,true)].includes(patch.sourceKey!)):patch.index;if(index>=0)patches.set(index,patch);}
  const hidden=new Set<number>();
  for(const [i,p] of patches)if(p.hidden){const t=original.data[i];if(!t)continue;original.data.forEach((a,j)=>{if(j===i||(t.legendgroup&&a.legendgroup===t.legendgroup&&(!t.meta?.teamPanel||a.meta?.teamPanel===t.meta.teamPanel)))hidden.add(j);});}
  const candidates=original.data.flatMap((t,i)=>t.visible!==false&&t.visible!=='legendonly'&&['x','y','z','values'].some(k=>t[k]?.length)?[i]:[]);
  if(candidates.length&&candidates.every(i=>hidden.has(i)))hidden.clear();
  out.data.forEach((t,index)=>{
    const source=original.data[index],caps=seriesCapabilities(source),fill=fillPath(source),border=borderPath(source);let p:Partial<EditorTrace>={};
    if(s.palette&&editableColor(source,'marker')&&!caps.continuous&&!source.meta?.teamPanelColorOverride){
      const label=source.meta?.teamCondition||source.legendgroup||source.name||'';
      if(!conditions||conditions.includes(label)){
        const colors=PALETTES[s.palette],c=s.greyHealthy!==false&&/^healthy(?:$|[_ -])/i.test(label)?'#7A7A7A':colors[Math.max(0,labels.indexOf(label))%colors.length],role=source.meta?.teamRole;
        p={color:source.type==='violin'||role==='points'?'#000000':c,lineColor:role==='inner-box'?darker(c,.60):source.type==='violin'?darker(c,.45):c};
        if(caps.fill&&(fill!=='marker.color'||editableColor(source,'marker')))Object.assign(p,{fillColor:role==='inner-box'?darker(c,.15):c,fillOpacity:1});
      }
    }
    p={...p,...patches.get(index)};
    if(p.name!==undefined)t.name=safeText(p.name);
    if(hidden.has(index))t.visible=false;
    if(p.color&&editableColor(source,'marker'))writePath(t,'marker.color',p.color);
    if(p.lineColor&&editableColor(source,border))writePath(t,border+'.color',p.lineColor);
    if(p.lineWidth!==undefined)writePath(t,border+'.width',p.lineWidth);
    if(caps.fill&&(fill!=='marker.color'||editableColor(source,'marker'))&&p.fillColor)writePath(t,fill,rgba(p.fillColor,p.fillOpacity??alpha(readPath(source,fill))));
    if(p.markerSize!==undefined&&!Array.isArray(source.marker?.size))writePath(t,'marker.size',p.markerSize);
    if(p.opacity!==undefined)t.opacity=p.opacity;
    if(source.type==='violin'){if(p.points!==undefined)t.points=p.points?'all':false;if(p.innerBox!==undefined)writePath(t,'box.visible',p.innerBox);
      // Team tints the inner box from its own colour; follow the palette so the box never keeps a previous hue.
      if(p.fillColor&&isHex(p.fillColor)&&typeof source.box?.fillcolor==='string'){writePath(t,'box.fillcolor',darker(p.fillColor,.15));if(typeof source.box?.line?.color==='string')writePath(t,'box.line.color',darker(p.fillColor,.60));}}
    if(supportsHeatScale(source)&&p.scaleLow&&p.scaleMid&&p.scaleHigh){t.colorscale=[[0,p.scaleLow],[0.5,p.scaleMid],[1,p.scaleHigh]];t.autocolorscale=false;}
  });
  for(const [k,v] of Object.entries(s.layout??{}))writePath(out.layout,k,k.endsWith('title.text')&&typeof v==='string'?safeText(v):v);
  // A 3D scene ignores plot_bgcolor: "Plot background" (the area behind the data) is the scene's bgcolor there.
  const bg=s.layout?.plot_bgcolor;
  if(bg)for(const scene of new Set(out.data.filter(t=>['scatter3d','mesh3d','surface','cone','streamtube','isosurface','volume'].includes(t.type)).map(t=>t.scene||'scene')))writePath(out.layout,scene+'.bgcolor',bg);
  if(s.layout?.['title.text']?.trim())writePath(out.layout,'margin.t',Math.max(55,Number(original.layout.margin?.t)||0));
  if(s.annotations)out.layout.annotations=[...(out.layout.annotations??[]).filter((a:PlotObject)=>a.name!=='__presentation__'&&!String(a.name||'').startsWith('tcstat-')), ...s.annotations.map(a=>({...clone(a),name:'__presentation__',text:safeText(a.text)}))];
  for(const c of s.categoryLabels??[]){
    const keys=original.data.map(t=>sourceKey(t,original.data)).sort();
    if(keys.some(k=>!k)||JSON.stringify(keys)!==JSON.stringify(c.sourceKeys))continue;
    const letter=c.axis[0],axis=out.layout[c.axis]??{},values=[...new Set(out.data.flatMap(t=>(t[c.axis]||letter)===letter&&Array.isArray(t[letter])?t[letter].filter((v:unknown)=>typeof v==='string'):[]))];
    const categories=axis.categoryarray??values;
    if(JSON.stringify(categories)!==JSON.stringify(c.values))continue;
    const ticks=axis.tickmode==='array'&&axis.tickvals?.length&&axis.tickvals.every((v:string)=>c.values.includes(v))?axis.tickvals:c.values;
    writePath(out.layout,c.axis+'.tickmode','array');writePath(out.layout,c.axis+'.tickvals',clone(ticks));writePath(out.layout,c.axis+'.ticktext',ticks.map((v:string)=>safeText(c.labels[c.values.indexOf(v)])));
  }
  sources.set(out,original);return out;
}
