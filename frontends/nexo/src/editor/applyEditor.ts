import { isHex, MARKER_SYMBOLS, serializeEditor, type Editor } from './editorState';
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
// Trace types whose points take Team's marker shapes (www/team/js/plot_editor.js). 3D scatter only draws circle, square and diamond.
const POINT_SCATTER=['scatter','scattergl','scatter3d','scatterpolar','scatterpolargl','scatterternary','scattergeo','scattercarpet'];
export const symbolChoices=(t:PlotObject):readonly string[]=>t.type==='scatter3d'?['circle','square','diamond']:MARKER_SYMBOLS;
export function seriesCapabilities(t:PlotObject){
  const type=t.type||'scatter',mode=String(t.mode||'markers'),scatter=['scatter','scattergl'].includes(type);
  // Every trace that draws point markers: scatter-like traces in markers mode, and the sample points of a box or violin.
  const pointer=(POINT_SCATTER.includes(type)&&mode.includes('markers'))||(type==='box'&&t.boxpoints!==false&&t.boxpoints!=='false')||(type==='violin'&&t.points!==false&&t.points!=='false');
  return {marker:POINT_SCATTER.includes(type)?mode.includes('markers'):['bar','histogram','box','violin','waterfall'].includes(type),pointer,markerSize:pointer,line:scatter?mode.includes('lines'):['box','violin','bar','histogram'].includes(type),fill:['box','violin','bar','histogram'].includes(type)||!!(scatter&&t.fill&&t.fill!=='none'&&!t.fillgradient),continuous:['heatmap','contour','histogram2d'].includes(type)};
}
// Group outlines (Team 23d288aa): the plotted numeric coordinates of a trace.
function numericPoints(t:PlotObject):[number,number][]{
  const xs=t.x,ys=t.y,list=(v:unknown):v is ArrayLike<unknown>=>Array.isArray(v)||ArrayBuffer.isView(v);if(!list(xs)||!list(ys))return [];
  const out:[number,number][]=[];for(let i=0;i<Math.min(xs.length,ys.length);i++){const x=Number(xs[i]),y=Number(ys[i]);if(typeof xs[i]!=='string'&&typeof ys[i]!=='string'&&Number.isFinite(x)&&Number.isFinite(y))out.push([x,y]);}
  return out;
}
// 95% data ellipse: squared Mahalanobis radius of a chi-square with 2 degrees of freedom; same path as Team's.
const ELLIPSE_CHI2=5.991,ELLIPSE_STEPS=72,ELLIPSE_PREFIX='team-ellipse:';
function ellipsePath(points:[number,number][]){
  const n=points.length;if(n<3)return null;
  let mx=0,my=0;for(const p of points){mx+=p[0];my+=p[1];}mx/=n;my/=n;
  let sxx=0,syy=0,sxy=0;for(const p of points){const dx=p[0]-mx,dy=p[1]-my;sxx+=dx*dx;syy+=dy*dy;sxy+=dx*dy;}sxx/=n-1;syy/=n-1;sxy/=n-1;
  const tr=sxx+syy,det=sxx*syy-sxy*sxy,disc=Math.sqrt(Math.max(0,tr*tr/4-det)),l1=tr/2+disc,l2=tr/2-disc;
  if(!(l1>0)||!(l2>1e-12*l1))return null;
  // Unit eigenvector of l1 (major axis); the minor axis is perpendicular.
  let vx:number,vy:number;if(Math.abs(sxy)>1e-12){vx=l1-syy;vy=sxy;}else if(sxx>=syy){vx=1;vy=0;}else{vx=0;vy=1;}
  const len=Math.hypot(vx,vy);vx/=len;vy/=len;
  const a=Math.sqrt(ELLIPSE_CHI2*l1),b=Math.sqrt(ELLIPSE_CHI2*l2),coords:number[]=[];let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(let k=0;k<ELLIPSE_STEPS;k++){const th=2*Math.PI*k/ELLIPSE_STEPS,u=a*Math.cos(th),v=b*Math.sin(th),x=mx+u*vx-v*vy,y=my+u*vy+v*vx;
    coords.push(x,y);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
  let path='M';for(let j=0;j<coords.length;j+=2)path+=(j?' L':'')+Number(coords[j].toPrecision(6))+','+Number(coords[j+1].toPrecision(6));
  return {path:path+' Z',bounds:{x:[xmin,xmax],y:[ymin,ymax]}};
}
/** Group outlines: one dashed ellipse (Team eac6bb75) per visible marker series, in its marker color, as layout shapes. Presentation only. */
function groupOutlines(out:Figure,original:Figure){
  const shapes:PlotObject[]=[],bounds:Record<'x'|'y',number[]>={x:[Infinity,-Infinity],y:[Infinity,-Infinity]};
  for(const i of ellipseSeries(out)){
    const t=out.data[i],key=sourceKey(original.data[i],original.data),color=t.marker?.color;
    if(!key||t.visible===false||t.visible==='legendonly'||typeof color!=='string')continue;
    const e=ellipsePath(numericPoints(t));if(!e)continue;
    shapes.push({type:'path',name:ELLIPSE_PREFIX+key,xref:'x',yref:'y',path:e.path,line:{color,width:1.5,dash:'dash'},fillcolor:'rgba(0,0,0,0)',layer:'above',editable:false});
    for(const a of ['x','y'] as const){bounds[a][0]=Math.min(bounds[a][0],e.bounds[a][0]);bounds[a][1]=Math.max(bounds[a][1],e.bounds[a][1]);}
  }
  if(!shapes.length)return;
  out.layout.shapes=[...(out.layout.shapes??[]),...shapes];
  // Plotly autoranges to shapes; an axis whose range R fixed is widened just enough to show the whole outline.
  for(const a of ['x','y'] as const){const axis=out.layout[a+'axis'];if(!axis||!Array.isArray(axis.range)||axis.autorange===true||(axis.type&&axis.type!=='linear'))continue;
    const [r0,r1]=axis.range.map(Number),flipped=r0>r1,pad=(bounds[a][1]-bounds[a][0])*0.03,lo=Math.min(r0,r1,bounds[a][0]-pad),hi=Math.max(r0,r1,bounds[a][1]+pad);
    axis.range=flipped?[hi,lo]:[lo,hi];axis.autorange=false;}
}
/** Marker series that can carry a group outline: a 2D scatter in markers mode on the default axes, outside panels, with 3+ points. */
export function ellipseSeries(f:Figure):number[]{
  return f.data.flatMap((t,i)=>seriesCapabilities(t).markerSize&&['scatter','scattergl'].includes(t.type||'scatter')&&(!t.xaxis||t.xaxis==='x')&&(!t.yaxis||t.yaxis==='y')&&!t.meta?.teamPanel&&numericPoints(t).length>=3?[i]:[]);
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
// Plotly gives these traces an x and a y axis even when the layout names none.
const CARTESIAN=['scatter','scattergl','bar','box','violin','heatmap','contour','histogram','histogram2d','waterfall'];
/** Publication style as Team's final plot_editor.js: only a full frame around the plot (mirrored black axis lines), black
 * zero lines and Arial 10; grid lines are removed; a 0.4 marker outline on every point series. Colors and backgrounds stay. */
export function publicationEditor(figure:Figure,editor?:Editor):Editor{
  const source=baselineOf(figure),next=serializeEditor(editor);
  Object.assign(next.layout!,{'font.family':'Arial','font.size':10,'title.font.family':'Arial','title.font.size':10,'legend.font.family':'Arial','legend.font.size':10});
  for(const axis of ['xaxis','yaxis'])if(source.layout[axis]||source.data.some(t=>CARTESIAN.includes(t.type||'scatter')))Object.assign(next.layout!,{[axis+'.showgrid']:false,[axis+'.showline']:true,[axis+'.mirror']:true,[axis+'.linecolor']:'#000000',[axis+'.linewidth']:1,[axis+'.zeroline']:true,[axis+'.zerolinecolor']:'#000000',[axis+'.zerolinewidth']:1,[axis+'.title.font.size']:10,[axis+'.tickfont.size']:10});
  source.data.forEach((t,index)=>{const key=sourceKey(t,source.data);if(!key||!seriesCapabilities(t).pointer||['bar','histogram'].includes(t.type))return;
    let patch=next.traces!.find(p=>p.sourceKey===key);if(!patch){patch={index,sourceKey:key};next.traces!.push(patch);}patch.markerLineWidth=0.4;
  });return serializeEditor(next);
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
/** What a preset button gives. Every setting a preset makes that the editor still holds goes back to the figure's own
 *  (what Reset presentation gives) before the chosen preset applies, so the last preset chosen wins. The user's own
 *  edits stay, made before or after a preset, as Team's Publication (plot_editor.js, on its current state) keeps them. */
export function presetEditor(preset:Preset,figure:Figure,editor?:Editor):Editor{
  if(preset==='team')return {};
  const next=serializeEditor(editor),layout=next.layout as Record<string,unknown>;
  for(const made of [nexoEditor(figure,{}),publicationEditor(figure,{})]){
    for(const [key,value] of Object.entries(made.layout??{}))if(layout[key]===value)delete layout[key];
    if(made.palette&&next.palette===made.palette)delete next.palette;
    if(made.greyHealthy&&next.greyHealthy===made.greyHealthy)delete next.greyHealthy;
    for(const t of made.traces??[]){const p=next.traces?.find(x=>x.sourceKey===t.sourceKey);if(p&&p.markerLineWidth===t.markerLineWidth)delete p.markerLineWidth;}
  }
  next.traces=next.traces?.filter(t=>Object.keys(t).some(k=>k!=='index'&&k!=='sourceKey'));
  return preset==='nexo'?nexoEditor(figure,next):publicationEditor(figure,next);
}
/** Which preset the editor currently sits on: Team original when nothing is changed, Nexo or Publication when applying
 * that preset again would change nothing. Custom tweaks on top of a preset report no preset. */
export function presetOf(figure:Figure,editor?:Editor):Preset|undefined{
  const current=JSON.stringify(serializeEditor(editor));
  if(current===JSON.stringify(serializeEditor({})))return 'team';
  if(current===JSON.stringify(nexoEditor(figure,editor)))return 'nexo';
  if(current===JSON.stringify(publicationEditor(figure,editor)))return 'publication';
}
/** Default text of every Plotly figure a card draws: Arial 10, as Team's newPlot/react wrapper (01dd860d). Applied to the
 *  figure as drawn, before the editor, so the editor's own font settings still override it and Reset returns to it. */
export const withTeamFont=(f:Figure):Figure=>({...f,layout:{...f.layout,font:{...f.layout?.font,family:'Arial, Helvetica, sans-serif',size:10}}});
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
    // A point trace takes one marker color even over per-point colors (Team 006468be); Reset presentation restores them.
    if(p.color&&(editableColor(source,'marker')||caps.pointer))writePath(t,'marker.color',p.color);
    if(p.markerSymbol&&caps.pointer&&symbolChoices(source).includes(p.markerSymbol))writePath(t,'marker.symbol',p.markerSymbol);
    if(caps.pointer&&!['bar','histogram'].includes(source.type)){if(p.markerLineWidth!==undefined)writePath(t,'marker.line.width',p.markerLineWidth);if(p.markerLineColor)writePath(t,'marker.line.color',p.markerLineColor);}
    if(p.lineColor&&editableColor(source,border))writePath(t,border+'.color',p.lineColor);
    if(p.lineWidth!==undefined)writePath(t,border+'.width',p.lineWidth);
    if(caps.fill&&(fill!=='marker.color'||editableColor(source,'marker'))&&p.fillColor)writePath(t,fill,rgba(p.fillColor,p.fillOpacity??alpha(readPath(source,fill))));
    if(p.markerSize!==undefined&&!Array.isArray(source.marker?.size))writePath(t,'marker.size',p.markerSize);
    // Per-point sizes (Team ba774a0e): scaled proportionally from the series' own sizes, so their mean becomes markerSize.
    else if(p.markerSize!==undefined&&caps.pointer){const base:unknown[]=source.marker.size,mean=base.reduce((a:number,b)=>a+(Number(b)||0),0)/base.length||1;writePath(t,'marker.size',base.map(v=>Math.max(1,(Number(v)||0)*p.markerSize!/mean)));}
    if(p.opacity!==undefined)t.opacity=p.opacity;
    if(source.type==='violin'){if(p.points!==undefined)t.points=p.points?'all':false;if(p.innerBox!==undefined)writePath(t,'box.visible',p.innerBox);
      // The box inside a violin follows the violin's fill: the same color two shades darker (two 15% steps), with a darker outline (Team bb410e93).
      if(isHex(p.fillColor)){writePath(t,'box.fillcolor',darker(p.fillColor,.30));writePath(t,'box.line.color',darker(p.fillColor,.60));}}
    if(supportsHeatScale(source)&&p.scaleLow&&p.scaleMid&&p.scaleHigh){t.colorscale=[[0,p.scaleLow],[0.5,p.scaleMid],[1,p.scaleHigh]];t.autocolorscale=false;}
  });
  if(s.groupEllipses===true)groupOutlines(out,original);
  // A round legend proxy (meta.teamLegendProxy, Team 01dd860d) takes the marker color of the series in its legend group.
  for(const proxy of out.data.filter(t=>t.meta?.teamLegendProxy)){const series=out.data.find(t=>t!==proxy&&!t.meta?.teamLegendProxy&&t.legendgroup&&t.legendgroup===proxy.legendgroup);
    const c=Array.isArray(series?.marker?.color)?series.marker.color[0]:series?.marker?.color;if(typeof c==='string')writePath(proxy,'marker.color',c);}
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
