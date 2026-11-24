import type {Node} from '../api';
import type {Figure,PlotObject} from '../editor/applyEditor';
import {conditionOf} from '../editor/conditionColors';
import {A4} from './a4Pdf';
import type {Caption,Page,PanelLegend,Positioned,TitleBlock} from './layout';
// Figure 1: page 1 of the figure page PDF, composed from the author's own dashboard cards as the lab's Figure 1 template
// lays them out (A PCA scores, B PCA score analysis, C composition, D abundance heatmap, E up to four feature
// distributions), with its legend under it. Presentation only: each panel is the card's live figure restyled for print
// (white background, black frame, legends and group dots); no data value is recomputed or changed.
export type Role='pca'|'pcascore'|'comp'|'heat'|'violin';
const ROLES:Role[]=['pca','pcascore','comp','heat','violin'];
export const roleOf=(n:Node):Role|undefined=>{if(n.kind!=='plot')return undefined;const m=/^results_dashboard-plot_(pca|pcascore|comp|heat|violin)$/.exec(n.instance?.source??n.id);return m?.[1] as Role|undefined;};
export interface Panel {letter:string;role:Role;nodes:Node[]}
/** The cards that fill Figure 1, in canvas order; a missing card leaves its panel out and the rest are re-lettered. */
export function figure1Panels(nodes:Node[]):Panel[]{
 const panels:Panel[]=[];
 for(const role of ROLES){const found=nodes.filter(n=>roleOf(n)===role).slice(0,role==='violin'?4:1);if(found.length)panels.push({letter:String.fromCharCode(65+panels.length),role,nodes:found});}
 return panels;
}
export interface Slot {role:Role;nodeId:string;letter?:string;x:number;y:number;width:number;height:number}
export const MARGIN=34;const GUTTER=12;
/** Panel boxes on A4 portrait (points), filling the page height left above the legend (`reserve`). */
export function figure1Geometry(panels:Panel[],reserve=0,top=MARGIN,row1Share=.3):Slot[]{
 const W=A4[0]-2*MARGIN,H=A4[1]-top-MARGIN-reserve,cw=(W-GUTTER)/2,left=MARGIN,right=MARGIN+cw+GUTTER;
 const has=(r:Role)=>panels.find(p=>p.role===r),slots:Slot[]=[];
 const put=(p:Panel|undefined,x:number,y:number,width:number,height:number)=>{if(p)slots.push({role:p.role,nodeId:p.nodes[0].id,letter:p.letter,x,y,width,height});};
 const row1=!!(has('pca')||has('pcascore')),r1=row1Share*H,by=top+(row1?r1:0),bh=(1-row1Share)*H;
 put(has('pca'),left,top,cw,r1-GUTTER);put(has('pcascore'),right,top,cw,r1-GUTTER);
 const comp=has('comp'),violin=has('violin'),ch=violin?.4*bh-GUTTER/2:bh,ey=by+(comp?.4*bh+GUTTER/2:0),eh=comp?.6*bh-GUTTER/2:bh;
 put(comp,left,by,cw,ch);put(has('heat'),right,by,cw,bh);
 if(violin){const w=(cw-GUTTER)/2,h=(eh-GUTTER)/2;violin.nodes.forEach((n,i)=>slots.push({role:'violin',nodeId:n.id,letter:i?undefined:violin.letter,x:left+(i%2)*(w+GUTTER),y:ey+Math.floor(i/2)*(h+GUTTER),width:w,height:h}));}
 return slots;
}
const clone=<T>(v:T):T=>{try{return structuredClone(v);}catch{return JSON.parse(JSON.stringify(v));}};
const hex=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)?v.slice(0,7).toUpperCase():undefined;
const textOf=(t:unknown):string=>typeof t==='string'?t:t&&typeof t==='object'&&typeof (t as {text?:unknown}).text==='string'?(t as {text:string}).text:'';
const plain=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
/** Group → colour of the session palette, as the cards carry it: the PCA scores first, then violins and the score boxes. */
export function groupColours(f:{pca?:Figure;violin?:Figure[];pcascore?:Figure}):Map<string,string>{
 const map=new Map<string,string>();
 const take=(fig:Figure|undefined,colour:(t:PlotObject)=>unknown)=>{for(const t of fig?.data??[]){if(t.meta?.teamLegendProxy||t.xaxis==='x2')continue;const g=conditionOf(t),c=hex(colour(t));if(g&&c&&!map.has(g))map.set(g,c);}};
 take(f.pca,t=>t.marker?.color);for(const v of f.violin??[])take(v,t=>t.fillcolor??t.line?.color);take(f.pcascore,t=>t.marker?.color??t.fillcolor);
 return map;
}
const dot=(c:string)=>`<span style="color:${c};font-size:13px">●</span>`;
const withAlpha=(old:unknown,c:string)=>{if(typeof old==='string'){const a=/^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(old)?.[1];if(a)return c+a;const r=/^rgba\([^)]*,\s*([.\d]+)\s*\)$/.exec(old)?.[1];if(r)return `rgba(${[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)).join(',')},${r})`;}return c;};
const categories=(f:Figure,axis='x')=>{const a=f.layout[axis+'axis'];if(Array.isArray(a?.categoryarray)&&a.categoryorder==='array')return a.categoryarray.map(String);const out:string[]=[];for(const t of f.data)for(const v of (Array.isArray(t[axis])?t[axis]:[]))if(!out.includes(String(v)))out.push(String(v));return out;};
const transpose=(m:unknown)=>Array.isArray(m)&&m.length&&m.every(r=>Array.isArray(r))?(m[0] as unknown[]).map((_,i)=>(m as unknown[][]).map(r=>r[i])):m;
/** One card's figure as its Figure 1 panel. */
export function figure1Figure(role:Role,source:Figure,colours:Map<string,string>,order:string[],size:{width:number;height:number}):Figure{
 const f=clone(source),layout:PlotObject={...f.layout};let data=f.data.map(t=>({...t}));
 if(role==='pcascore'){
  const domain0=layout.yaxis?.domain?.[0]??0;data=data.filter(t=>!t.meta?.teamLegendProxy&&t.xaxis!=='x2'&&t.yaxis!=='y2');delete layout.xaxis2;delete layout.yaxis2;
  layout.yaxis={...layout.yaxis,domain:[0,1]};layout.xaxis={...layout.xaxis,showticklabels:true};
  layout.annotations=(layout.annotations??[]).filter((a:PlotObject)=>!(a.xref==='paper'&&a.yref==='paper'&&Number(a.y)<domain0)&&a.xref!=='x2'&&a.yref!=='y2');
  layout.shapes=(layout.shapes??[]).filter((s:PlotObject)=>s.xref!=='x2'&&s.yref!=='y2');
  significantBrackets(data,layout);
 }
 if(role==='heat'&&layout.meta?.teamHeatmap?.geometry==='square-horizontal')data=data.map(t=>t.type!=='heatmap'?t:{...t,x:t.y,y:t.x,z:transpose(t.z),text:transpose(t.text)});
 // Group colours from panel A, the same in every panel.
 for(const t of data){const c=colours.get(conditionOf(t));if(!c||t.type==='heatmap'||role==='comp')continue;
  if(t.type==='violin'||t.type==='box'){t.fillcolor=withAlpha(t.fillcolor,c);if(t.type==='box'&&t.marker&&typeof t.marker.color==='string')t.marker={...t.marker,color:c};}
  else{if(t.marker&&typeof t.marker.color==='string')t.marker={...t.marker,color:c};if(t.line&&String(t.mode??'').includes('lines'))t.line={...t.line,color:c};}}
 const frame={showline:true,linecolor:'#000000',linewidth:1,mirror:true,ticks:'outside',tickcolor:'#000000',ticklen:3,showgrid:false,zeroline:false,automargin:true,tickfont:{size:8,color:'#000000'}};
 for(const k of Object.keys(layout))if(/^[xy]axis\d*$/.test(k)&&layout[k]?.visible!==false)layout[k]={...layout[k],...frame};
 if(!layout.xaxis)layout.xaxis={...frame};if(!layout.yaxis)layout.yaxis={...frame};
 Object.assign(layout,{paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff',font:{family:'Arial, Helvetica, sans-serif',size:9,color:'#000000'},margin:{l:8,r:8,t:role==='violin'?22:8,b:8,autoexpand:true},width:undefined,height:undefined,autosize:false});
 delete layout.width;delete layout.height;
 const legendRight={x:1.02,xanchor:'left',y:1,yanchor:'top',bgcolor:'rgba(0,0,0,0)',borderwidth:0,font:{size:8,color:'#000000'}};
 // Every legend entry shows (legendPlan): columns to the right, each as wide as its longest label, while the plot keeps
 // at least 55% of the panel; else one horizontal legend under the plot.
 const columns=(entries:PlotObject[],reversed:boolean,minPlot=.55,axisPx=46)=>{const plan=legendPlan(entries.map(t=>String(t.name)),size,minPlot),font={size:plan.font,color:'#000000'};
  // Under the plot: fixed margins so the legend sits below the x axis (its ticks and title) across the panel width.
  if(plan.mode==='below'){entries.forEach(t=>{delete t.legend;});const panelH=size.height*96/72,b=axisPx+plan.legendHeightPx,plotH=Math.max(20,panelH-b-8),plotW=size.width*96/72-LEGEND_AXIS_PX-LEGEND_GAP_PX;
   layout.margin={l:LEGEND_AXIS_PX,r:LEGEND_GAP_PX,t:8,b,autoexpand:false};
   layout.legend={...legendRight,orientation:'h',x:-(LEGEND_AXIS_PX-LEGEND_GAP_PX)/plotW,xanchor:'left',y:-axisPx/plotH,yanchor:'top',font,tracegroupgap:0,itemwidth:30,entrywidth:plan.entryWidthPx-LEGEND_MARKER_PX,entrywidthmode:'pixels',...(reversed?{traceorder:'reversed'}:{})};return;}
  layout.margin={...layout.margin,l:LEGEND_AXIS_PX,r:plan.marginRightPx,b:Math.max(layout.margin?.b??0,40),autoexpand:false};
  plan.columns.forEach((c,k)=>{const key=k?`legend${k+1}`:'legend';entries.filter(t=>c.labels.includes(String(t.name))).forEach(t=>{t.legend=key;});
   layout[key]={...legendRight,x:1+c.offsetPx/plan.plotWidthPx,font,tracegroupgap:0,itemwidth:30,...(reversed?{traceorder:'reversed'}:{})};});};
 const groupDots=(groups:string[])=>({tickmode:'array',tickvals:groups,ticktext:groups.map(g=>colours.has(g)?dot(colours.get(g)!):g),tickangle:0,tickfont:{size:14,color:'#000000'},title:{text:''}});
 const ordered=(groups:string[])=>[...order.filter(g=>groups.includes(g)),...groups.filter(g=>!order.includes(g))];
 // Panel A: the page draws the group legend under the plot (pcaLegend); markers about 6 pt across on the A4 page.
 if(role==='pca'){delete layout.title;layout.showlegend=false;for(const t of data)if(t.marker&&(t.type??'scatter')==='scatter')t.marker={...t.marker,size:PCA_MARKER_PX,line:{...(t.marker.line??{}),width:.5}};}
 if(role==='pcascore'){delete layout.title;layout.showlegend=false;const g=categories({data,layout});layout.xaxis={...layout.xaxis,type:'category',categoryorder:'array',categoryarray:ordered(g)};}
 if(role==='comp'){delete layout.title;// The card's long y title (Mean share of selected signal (%)) does not fit a short panel.
  if(/share/i.test(textOf(layout.yaxis?.title)))layout.yaxis={...layout.yaxis,title:{text:'Mean share (%)',font:{size:8}}};layout.showlegend=true;columns(data.filter(t=>t.showlegend!==false&&t.name).reverse(),true,.3,30);const g=ordered(categories({data,layout}));layout.xaxis={...layout.xaxis,type:'category',categoryorder:'array',categoryarray:g,...groupDots(g)};}
 if(role==='heat'){
  delete layout.title;const t=data.find(t=>t.type==='heatmap'),rows=(Array.isArray(t?.y)?t!.y:[]).map(String),groups=(Array.isArray(t?.x)?t!.x:[]).map(String);
  const px=size.height*96/72,font=Math.max(3,Math.min(8,px*.75/Math.max(1,rows.length)));
  layout.yaxis={...layout.yaxis,type:'category',tickmode:'array',tickvals:rows,ticktext:rows,tickfont:{size:font,color:'#000000'},ticks:'',title:{text:''}};
  for(const k of ['scaleanchor','scaleratio','constrain','domain'])delete layout.yaxis[k];
  layout.xaxis={...layout.xaxis,type:'category',...groupDots(groups),ticks:''};for(const k of ['scaleanchor','scaleratio','constrain','domain','categoryorder','categoryarray'])delete layout.xaxis[k];
  data=data.map(d=>d.type!=='heatmap'?d:{...d,showscale:true,colorbar:{title:{text:'Mean z-score',side:'right',font:{size:8}},orientation:'v',x:1.02,xanchor:'left',y:.5,yanchor:'middle',len:.5,lenmode:'fraction',thickness:8,tickfont:{size:7},outlinecolor:'#000000',outlinewidth:1}});
 }
 if(role==='violin'){
  layout.title={text:textOf(source.layout?.title),x:.5,xanchor:'center',y:.99,yanchor:'top',font:{size:9,color:'#000000'}};layout.showlegend=false;layout.margin={...layout.margin,t:16,l:4,r:4,b:4};
  // The n labels (n = 18 samples) crowd into one line in a small panel; n is in panel A's legend.
  const before=(layout.annotations??[]).length;layout.annotations=(layout.annotations??[]).filter((a:PlotObject)=>!/^tcstat-n-/.test(String(a.name??''))&&!/^n = /.test(plain(String(a.text??''))));
  if(layout.annotations.length<before&&!layout.annotations.some((a:PlotObject)=>/^tcstat-label-/.test(String(a.name??'')))){delete layout.yaxis.range;layout.yaxis.autorange=true;}
  if(/log10/i.test(textOf(layout.yaxis.title)))layout.yaxis.title={text:'log10 abundance',font:{size:8}};
  const g=ordered(categories({data,layout})),avail=size.width*96/72-50,fits=g.join('').length*5<=avail;
  layout.xaxis={...layout.xaxis,type:'category',categoryorder:'array',categoryarray:g,...(fits?{tickangle:0}:g.length*11<=avail?{tickangle:-45,tickfont:{size:7,color:'#000000'}}:groupDots(g))};
 }
 return {data,layout};
}
// The legend under Figure 1: one paragraph per panel, written from each card's figure and settings.
const TESTS:Record<string,[string,string]>={rank:['Kruskal-Wallis test','Mann-Whitney U tests'],param:['one-way ANOVA','Welch t-tests']};
const CORRECTIONS:Record<string,string>={BH:'Benjamini-Hochberg',holm:'Holm',bonferroni:'Bonferroni',none:'no'};
export interface PanelSource {figure?:Figure;url?:string;inputs?:Record<string,unknown>}
/** A number with a real minus sign. */
const fixed=(v:number,digits:number)=>v.toFixed(digits).replace(/^-/,'−');
/** Long decimals (4 or more places) the legend would print from a card (axis titles, limits): 1 decimal from 10, 2
 *  from 1, two significant digits below 1; a real minus sign. Short numbers (thresholds such as 0.001) stay as written. */
export const roundNumbers=(text:string)=>text.replace(/-?\d+\.\d{4,}/g,m=>{const v=Number(m);return Math.abs(v)<1?String(Number(v.toPrecision(2))).replace(/^-/,'−'):fixed(v,Math.abs(v)>=10?1:2);});
function sentence(panel:Panel,sources:Map<string,PanelSource>):string{
 const s=sources.get(panel.nodes[0].id)??{},f=s.figure,title=(k:string)=>plain(textOf(f?.layout?.[k]?.title)),inputs={...(panel.nodes[0].instance?.inputs??{}),...(s.inputs??{})};
 const lead=`(${panel.letter}) `;
 if(panel.role==='pca'){const t=plain(textOf(f?.layout?.title)),x=title('xaxis'),y=title('yaxis');return lead+`Principal component analysis scores${t?` (${t})`:''}${x&&y?`, ${x} versus ${y}`:''}; each point is one sample, coloured by group.`;}
 if(panel.role==='pcascore'){const pc=String(inputs.pcs_pc??(/PC\d+/.exec(title('yaxis'))?.[0]??'PC')),[omni,pair]=TESTS[String(inputs.pcs_test??'rank')]??TESTS.rank,corr=CORRECTIONS[String(inputs.pcs_corr??'BH')]??String(inputs.pcs_corr);
  return lead+`${pc} scores by group (box plots with every sample); ${omni} across groups and ${pair} on each pair with ${corr} correction; brackets mark the significant pairs (adjusted * p < 0.05, ** p < 0.01, *** p < 0.001).`;}
 if(panel.role==='comp'){const classes=f?.data.filter(t=>t.type==='bar').length;return lead+`Lipid composition: mean share of signal by lipid class in each group (stacked bars${classes?`, ${classes} classes`:''}); dots mark the groups, coloured as in A.`;}
 if(panel.role==='heat'){const t=f?.data.find(t=>t.type==='heatmap'),square=f?.layout?.meta?.teamHeatmap?.geometry==='square-horizontal',rows=((square?t?.x:t?.y)??[]).length,def=String(f?.layout?.meta?.teamHeatmap?.valueDefinition??'mean lipid z-score').toLowerCase(),hi=typeof t?.zmax==='number'?t.zmax:undefined,lo=typeof t?.zmin==='number'?t.zmin:hi===undefined?undefined:-Math.abs(hi),lim=hi===undefined?'':` from ${fixed(lo!,1)} to ${fixed(hi,1)}`;
  return lead+`Abundance heatmap of the ${rows} most variable lipids: ${def} per group (colour bar, Mean z-score${lim}); every row is labelled with its lipid and dots mark the groups.`;}
 const lipids=panel.nodes.map(n=>plain(textOf(sources.get(n.id)?.figure?.layout?.title))||n.label);
 return lead+`Feature distributions of ${lipids.join(', ')} by group (violins with every sample), in the group order and colours of A.`;
}
export function wrap(text:string,width:number,fontSize:number):string[]{
 const max=Math.max(1,Math.floor(width/(fontSize*.55))),lines:string[]=[];let line='';
 for(let word of text.split(/\s+/).filter(Boolean)){while(word.length>max){if(line){lines.push(line);line='';}lines.push(word.slice(0,max));word=word.slice(max);}
  if(line&&(line+' '+word).length>max){lines.push(line);line=word;}else line=line?line+' '+word:word;}
 if(line)lines.push(line);return lines;
}
/** The legend block: largest font from 8 pt down to 6 pt that keeps it under 40% of the page; past that, lines are cut. */
export function figure1Caption(panels:Panel[],sources:Map<string,PanelSource>):Omit<Caption,'y'>{
 const paragraphs=panels.map(p=>roundNumbers(sentence(p,sources))),lead='Figure 1.',width=A4[0]-2*MARGIN,limit=(A4[1]-2*MARGIN)*.4;
 let fontSize=8,lines:Caption['lines']=[];
 for(fontSize of [8,7.5,7,6.5,6]){lines=paragraphs.flatMap((p,i)=>wrap(i?p:`${lead} ${p}`,width,fontSize).map((text,j)=>({text,lead:!i&&!j})));if(lines.length*fontSize*1.25<=limit)break;}
 const most=Math.floor(limit/(fontSize*1.25));if(lines.length>most){lines=lines.slice(0,most);const last=lines[most-1];last.text=last.text.slice(0,Math.max(0,last.text.length-1))+'…';}
 return {x:MARGIN,width,fontSize,lineHeight:fontSize*1.25,lead,paragraphs,lines};
}
/** Figure 1 as a page: null when the canvas has none of its cards. `source` gives a card's live figure (or its image);
 *  `render` turns a restyled figure into an image of the slot's size (points). */
export async function figure1Page(nodes:Node[],options:{source:(n:Node)=>Promise<PanelSource|undefined>;render:(figure:Figure,width:number,height:number)=>Promise<string>;title?:TitleBlock|((groups:string[])=>TitleBlock)}):Promise<Page|null>{
 const sources=new Map<string,PanelSource>();
 for(const n of nodes)if(roleOf(n)){const s=await options.source(n);if(s&&(s.figure||s.url))sources.set(n.id,s);}
 const panels=figure1Panels(nodes.filter(n=>sources.has(n.id)));if(!panels.length)return null;
 const fig=(role:Role)=>panels.find(p=>p.role===role)?.nodes.map(n=>sources.get(n.id)?.figure).filter((f):f is Figure=>!!f)??[];
 const colours=groupColours({pca:fig('pca')[0],violin:fig('violin'),pcascore:fig('pcascore')[0]}),order=[...colours.keys()];
 const caption=figure1Caption(panels,sources),gap=14,title=typeof options.title==='function'?options.title(order):options.title,top=title?title.y+title.height+gap:MARGIN,reserve=caption.lines.length*caption.lineHeight+gap;
 let slots=figure1Geometry(panels,reserve,top);
 // Panel A keeps at least 60% of its height for the plot: its legend (drawn by the page) takes at most 40%; when it
 // needs more, row 1 borrows height from the rows below (up to 45% of the figure).
 const pcaSlot=slots.find(s=>s.role==='pca'),pcaFigure=pcaSlot&&sources.get(pcaSlot.nodeId)?.figure;
 const groupsOf=(f:Figure)=>f.data.filter(t=>t.showlegend!==false&&t.name&&(t.type??'scatter')==='scatter').map(t=>({label:plain(String(t.name)),color:colours.get(conditionOf(t))??hex(t.marker?.color)??'#7F7F7F'}));
 let legend=pcaSlot&&pcaFigure?pcaLegend(pcaSlot,groupsOf(pcaFigure)):undefined;
 if(pcaSlot&&legend&&legend.height>.4*pcaSlot.height){const H=A4[1]-top-MARGIN-reserve;slots=figure1Geometry(panels,reserve,top,Math.min(.45,(legend.height/.4+GUTTER)/H));const s=slots.find(s=>s.role==='pca')!;legend=pcaLegend(s,groupsOf(pcaFigure!));}
 const items:Positioned[]=[];
 for(const slot of slots){const s=sources.get(slot.nodeId)!,node=nodes.find(n=>n.id===slot.nodeId);
  const height=slot.role==='pca'&&legend?slot.height-legend.height:slot.height,box={...slot,height};
  const image=s.figure?await options.render(figure1Figure(slot.role,s.figure,colours,order,box),box.width,box.height):s.url!;
  items.push({x:slot.x,y:slot.y,width:slot.width,height,node,image,...(slot.letter?{letter:slot.letter}:{})});}
 const bottom=Math.max(...slots.map(s=>s.y+s.height));
 return {width:A4[0],height:A4[1],items,figure1:true,caption:{...caption,y:bottom+gap},...(legend?{legends:[legend]}:{}),...(title?{titleBlock:title}:{})};
}

/** Panel B: only the significant brackets (stars), stacked again from the data top, and the y range tightened to them.
 *  The card is unchanged; this is the Figure 1 drawing only. */
function significantBrackets(data:PlotObject[],layout:PlotObject){
 const nums=(path:string)=>(path.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)??[]).map(Number);
 const isBracket=(s:PlotObject)=>s.type==='path'&&typeof s.path==='string'&&nums(s.path).length===8;
 const labels=(layout.annotations??[]).filter((a:PlotObject)=>a.xref!=='paper'&&a.yref!=='paper'),others=(layout.annotations??[]).filter((a:PlotObject)=>!labels.includes(a));
 const brackets=(layout.shapes??[]).filter(isBracket),rest=(layout.shapes??[]).filter((s:PlotObject)=>!isBracket(s));
 // Each label sits on its bracket (same middle x, the label just above the bracket top): the nearest such bracket.
 const used=new Set<PlotObject>(),pairs=labels.map((a:PlotObject)=>{const near=brackets.filter((s:PlotObject)=>!used.has(s)&&Math.abs((nums(s.path)[0]+nums(s.path)[4])/2-Number(a.x))<1e-6).sort((x:PlotObject,y:PlotObject)=>Math.abs(nums(x.path)[3]-Number(a.y))-Math.abs(nums(y.path)[3]-Number(a.y)))[0];if(near)used.add(near);return {a,s:near};});
 const kept=pairs.filter((p:{a:PlotObject})=>!/^ns$/i.test(plain(String(p.a.text??''))));
 const ys=data.flatMap(t=>Array.isArray(t.y)?t.y.filter((v:unknown)=>typeof v==='number'&&Number.isFinite(v)):[]) as number[];
 if(!ys.length){layout.annotations=[...others,...kept.map((p:{a:PlotObject})=>p.a)];layout.shapes=[...rest,...kept.flatMap((p:{s?:PlotObject})=>p.s?[p.s]:[])];return;}
 const lo=Math.min(...ys),hi=Math.max(...ys),span=Math.max(hi-lo,1e-9);let top=hi+span*.05;
 const shapes:PlotObject[]=[],annotations:PlotObject[]=[];
 // Many brackets share about 1.4 data spans above the boxes, so the boxes keep most of the panel height.
 const step=Math.min(.17,1.4/Math.max(1,kept.length));
 kept.forEach((p:{a:PlotObject;s?:PlotObject},j:number)=>{const y0=hi+span*(.06+step*j),y1=y0+span*.03;top=y1+span*.12;annotations.push({...p.a,y:y1,...(step<.12?{font:{...p.a.font,size:10}}:{})});
  if(p.s){const v=nums(p.s.path);shapes.push({...p.s,path:`M ${v[0]},${y0} L ${v[0]},${y1} L ${v[4]},${y1} L ${v[4]},${y0}`});}});
 layout.annotations=[...others,...annotations];layout.shapes=[...rest,...shapes];layout.yaxis={...layout.yaxis,range:[lo-span*.05,top],autorange:false};
}

const LEGEND_AXIS_PX=52,LEGEND_MARKER_PX=40,LEGEND_GAP_PX=8;
export interface LegendPlan {mode:'right'|'below';font:number;columns:{labels:string[];offsetPx:number;widthPx:number}[];marginRightPx:number;plotWidthPx:number;entryWidthPx:number;legendHeightPx:number}
/** Where a panel's legend goes (CSS px of the rendered panel). To the right: the fewest columns whose entries fit the
 *  plot height (19 px per entry), each column as wide as its longest label (0.58 em per character) plus the marker,
 *  while the plot keeps at least `minPlot` of the panel width (8, then 7, then 6 px text). Otherwise one horizontal
 *  legend under the plot and its x axis, entries as wide as the longest label, in rows across the panel width that
 *  fit half the panel height (Plotly's limit for a horizontal legend). */
export function legendPlan(labels:string[],size:{width:number;height:number},minPlot=.55):LegendPlan{
 const panel=size.width*96/72,height=size.height*96/72,per=Math.max(1,Math.floor((height-60)/19));
 const width=(ls:string[],font:number)=>Math.max(0,...ls.map(l=>l.length))*font*.58+LEGEND_MARKER_PX;
 for(const font of [8,7,6])for(let n=Math.ceil(labels.length/per);n<=4;n++){
  const each=Math.ceil(labels.length/n),columns:LegendPlan['columns']=[];let offset=LEGEND_GAP_PX;
  for(let k=0;k<n;k++){const chunk=labels.slice(k*each,(k+1)*each);if(!chunk.length)break;const w=width(chunk,font);columns.push({labels:chunk,offsetPx:offset,widthPx:w});offset+=w+LEGEND_GAP_PX;}
  const plot=panel-LEGEND_AXIS_PX-offset;
  if(plot>=minPlot*panel)return {mode:'right',font,columns,marginRightPx:offset,plotWidthPx:plot,entryWidthPx:0,legendHeightPx:0};
 }
 // Below: rows across the whole panel width; Plotly lets a horizontal legend use at most half the panel height.
 const plotWidthPx=panel-LEGEND_AXIS_PX-LEGEND_GAP_PX,across=panel-2*LEGEND_GAP_PX,rows=(font:number)=>Math.ceil(labels.length/Math.max(1,Math.floor(across/width(labels,font))));let font=8;
 for(font of [8,7,6])if(rows(font)*19+6<=height/2)break;
 return {mode:'below',font,columns:[{labels,offsetPx:0,widthPx:across}],marginRightPx:0,plotWidthPx,entryWidthPx:width(labels,font),legendHeightPx:rows(font)*19+6};
}

const PCA_MARKER_PX=8,LEGEND_PAD=12;
/** Panel A's group legend, drawn by the page under the plot: dots and labels in as many columns as fit the panel width,
 *  each column as wide as its longest label (0.55 em per character), filled top to bottom; 6.5 pt text on 9 pt rows,
 *  smaller (down to 5.5 pt) only when the rows would take more than 40% of the panel. */
export function pcaLegend(slot:{nodeId:string;x:number;y:number;width:number;height:number},groups:{label:string;color:string}[]):PanelLegend{
 const width=slot.width-LEGEND_PAD,x0=slot.x+LEGEND_PAD;let best:PanelLegend|undefined;
 for(const fontSize of [6.5,6,5.5]){
  const dot=fontSize*.8,rowHeight=fontSize+2.5,colWidth=(ls:{label:string}[])=>dot+4+Math.max(0,...ls.map(l=>l.label.length))*fontSize*.55+8;
  let k=Math.max(1,groups.length);
  for(;k>1;k--){const rows=Math.ceil(groups.length/k),cols=Array.from({length:k},(_,c)=>groups.slice(c*rows,(c+1)*rows)).filter(c=>c.length);if(cols.reduce((sum,c)=>sum+colWidth(c),0)-8<=width)break;}
  const rows=Math.ceil(groups.length/k),height=rows*rowHeight+4,entries:PanelLegend['entries']=[];let x=x0;
  for(let c=0;c<k;c++){const col=groups.slice(c*rows,(c+1)*rows);if(!col.length)break;col.forEach((g,r)=>entries.push({label:g.label,color:g.color,x,y:0+2+r*rowHeight+rowHeight/2}));x+=colWidth(col);}
  best={nodeId:slot.nodeId,x:x0,y:0,width,height,fontSize,rowHeight,dot,entries};
  if(height<=.4*slot.height)break;
 }
 const y=slot.y+slot.height-best!.height;
 return {...best!,y,entries:best!.entries.map(e=>({...e,y:y+e.y}))};
}
