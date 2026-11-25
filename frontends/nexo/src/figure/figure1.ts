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
 for(const role of ROLES){const found=nodes.filter(n=>roleOf(n)===role).slice(0,MAX_CARDS[role]??1);if(found.length)panels.push({letter:String.fromCharCode(65+panels.length),role,nodes:found});}
 return panels;
}
/** Cards per panel: E's violins in a 2 × 2 block, B one PCA score card per PCA cluster side by side, C two composition
 *  cards (for example major and minor classes) one above the other. */
const MAX_CARDS:Partial<Record<Role,number>>={violin:4,pcascore:3,comp:2};
/** The height (CSS px) a card's name takes above its plot when a panel has several cards. */
export const SUBTITLE_PX=14;
export interface Slot {role:Role;nodeId:string;letter?:string;x:number;y:number;width:number;height:number}
export const MARGIN=34;const GUTTER=12;
/** Plot margins (CSS px) of the square panels and of C's bars: axis ticks and titles; the plot area is the rest. */
export const PANEL_MARGINS={pca:{l:40,r:6,t:6,b:34},pcascore:{l:44,r:6,t:6,b:22},violin:{l:34,r:4,t:16,b:22},comp:{l:40,r:4,t:6,b:22}} as const;
/** Every Figure 1 image sits right of a strip for its panel letter (pageSVG). */
export const LETTER_PAD=12;
const PT=72/96,MIN_SIDE=70,MIN_E_SIDE=40,C_RATIO=1,C_RATIO_EACH=.5,SUB_GAP=6;
const marginsPt=(r:keyof typeof PANEL_MARGINS)=>{const m=PANEL_MARGINS[r];return {w:(m.l+m.r)*PT,h:(m.t+m.b)*PT};};
/** Panel boxes on A4 portrait (points). The panels' plot areas are about square: E's violins as wide as their half of the
 *  left column allows, C's bars at least as high as wide (its legend, drawn by the page, on its right), A the height
 *  left in the left column (its legend, drawn by the page, on its right), B the same row height, D the rest of the
 *  right column. `reserve` is the height kept under the figure for its legend; `a` and `c` the sizes of A's and C's legends. */
export function figure1Geometry(panels:Panel[],reserve=0,top=MARGIN,legends:{a?:{width:number;height:number};c?:{width:number;height:number}}={}):Slot[]{
 const W=A4[0]-2*MARGIN,H=A4[1]-top-MARGIN-reserve,cw=(W-GUTTER)/2,left=MARGIN,right=MARGIN+cw+GUTTER;
 const has=(r:Role)=>panels.find(p=>p.role===r),slots:Slot[]=[];
 // A panel's cards share its box: side by side (B) or one above the other (C), the letter on the first.
 const put=(p:Panel|undefined,x:number,y:number,width:number,height:number,stack=false)=>{if(!p)return;const k=p.nodes.length,w=stack?width:(width-(k-1)*SUB_GAP)/k,h=stack?(height-(k-1)*SUB_GAP)/k:height;
  p.nodes.forEach((n,i)=>slots.push({role:p.role,nodeId:n.id,letter:i?undefined:p.letter,x:stack?x:x+i*(w+SUB_GAP),y:stack?y+i*(h+SUB_GAP):y,width:w,height:h}));};
 const pca=has('pca'),score=has('pcascore'),comp=has('comp'),heat=has('heat'),violin=has('violin'),row1=!!(pca||score);
 const none={width:0,height:0},aLegend=pca?legends.a??none:none,cLegend=comp?legends.c??none:none;
 const eRows=violin?(violin.nodes.length>2?2:1):0,cellW=(cw-GUTTER)/2;let sE=cellW-LETTER_PAD-marginsPt('violin').w;
 const eH=()=>eRows?eRows*(sE+marginsPt('violin').h)+(eRows-1)*GUTTER:0;
 const cK=comp?.nodes.length??1,bw=cw-LETTER_PAD-cLegend.width-marginsPt('comp').w,cEach=cK>1?C_RATIO_EACH*bw+marginsPt('comp').h+SUBTITLE_PX*PT:C_RATIO*bw+marginsPt('comp').h;
 let cH=comp?cK*Math.max(cEach,cLegend.height)+(cK-1)*SUB_GAP:0;
 const below=()=>(comp?cH+GUTTER:0)+(violin?eH()+GUTTER:0);
 const aMax=pca?Math.max(cw-LETTER_PAD-aLegend.width-marginsPt('pca').w+marginsPt('pca').h,aLegend.height):cw-LETTER_PAD-marginsPt('pcascore').w+marginsPt('pcascore').h;
 let r1=row1?(comp||violin?H-below():aMax):0;
 // A at least MIN_SIDE square: E gives up height first (its violins stay square, smaller).
 const aSide=()=>r1-marginsPt(pca?'pca':'pcascore').h;
 if(row1&&violin&&aSide()<MIN_SIDE){sE=Math.max(MIN_E_SIDE,sE-(MIN_SIDE-aSide())/eRows);r1=H-below();}
 // More room than a square A needs: C's bars (else E's row) take it.
 if(row1&&r1>aMax){if(comp)cH+=r1-aMax;r1=aMax;}
 if(!row1&&comp)cH=Math.max(cH,H-(violin?eH()+GUTTER:0));
 put(pca,left,top,cw,r1);put(score,right,top,cw,r1);
 const by=top+(row1?r1+GUTTER:0);put(comp,left,by,cw,cH,true);put(heat,right,by,cw,top+H-by);
 if(violin){const ey=by+(comp?cH+GUTTER:0),h=sE+marginsPt('violin').h;violin.nodes.forEach((n,i)=>slots.push({role:'violin',nodeId:n.id,letter:i?undefined:violin.letter,x:left+(i%2)*(cellW+GUTTER),y:ey+Math.floor(i/2)*(h+GUTTER),width:cellW,height:h}));}
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
/** One card's figure as its Figure 1 panel. `title`: the card's name above its plot, when the panel has several cards
 *  (their plots then fill their boxes instead of being squared). */
export function figure1Figure(role:Role,source:Figure,colours:Map<string,string>,order:string[],size:{width:number;height:number},opts:{title?:string}={}):Figure{
 const f=clone(source),layout:PlotObject={...f.layout};let data=f.data.map(t=>({...t}));
 if(role==='pcascore'){
  const domain0=layout.yaxis?.domain?.[0]??0;data=data.filter(t=>!t.meta?.teamLegendProxy&&t.xaxis!=='x2'&&t.yaxis!=='y2');delete layout.xaxis2;delete layout.yaxis2;
  layout.yaxis={...layout.yaxis,domain:[0,1]};layout.xaxis={...layout.xaxis,showticklabels:true};
  layout.annotations=(layout.annotations??[]).filter((a:PlotObject)=>!(a.xref==='paper'&&a.yref==='paper'&&Number(a.y)<domain0)&&a.xref!=='x2'&&a.yref!=='y2');
  layout.shapes=(layout.shapes??[]).filter((s:PlotObject)=>s.xref!=='x2'&&s.yref!=='y2');
  significanceLetters(data,layout);
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
 // Fixed margins (Plotly does not move them) so the plot area has the shape it should: square for A, B and E, the
 // extra space split on both sides; C's bars at least 0.6 high per wide.
 const fix=(r:keyof typeof PANEL_MARGINS,minRatio?:number)=>{const m={...PANEL_MARGINS[r]};if(opts.title)m.t+=SUBTITLE_PX;const w=size.width/PT,h=size.height/PT,pw=w-m.l-m.r,ph=h-m.t-m.b;
  if(minRatio===undefined){const side=Math.max(20,Math.min(pw,ph));m.l+=(pw-side)/2;m.r+=(pw-side)/2;m.t+=(ph-side)/2;m.b+=(ph-side)/2;}
  else if(ph/pw<minRatio){const nw=ph/(minRatio+1e-6);m.l+=(pw-nw)/2;m.r+=(pw-nw)/2;}
  layout.margin={...m,autoexpand:false};return {w:w-m.l-m.r};};
 // Group names under B and E: as written when they fit, else as coloured dots (as in C and D), never under 6 pt.
 const names=(g:string[],plotW:number)=>g.join('').length*5+g.length*6<=plotW?{tickangle:0,tickfont:{size:8,color:'#000000'}}:groupDots(g);
 const groupDots=(groups:string[])=>({tickmode:'array',tickvals:groups,ticktext:groups.map(g=>colours.has(g)?dot(colours.get(g)!):g),tickangle:0,tickfont:{size:14,color:'#000000'},title:{text:''}});
 const ordered=(groups:string[])=>[...order.filter(g=>groups.includes(g)),...groups.filter(g=>!order.includes(g))];
 // Panel A: the page draws the group legend under the plot (pcaLegend); markers about 6 pt across on the A4 page.
 if(role==='pca'){delete layout.title;layout.showlegend=false;for(const t of data)if(t.marker&&(t.type??'scatter')==='scatter')t.marker={...t.marker,size:PCA_MARKER_PX,line:{...(t.marker.line??{}),width:.5}};fix('pca');}
 if(role==='pcascore'){delete layout.title;layout.showlegend=false;const g=ordered(categories({data,layout})),{w}=fix('pcascore',opts.title?0:undefined);layout.xaxis={...layout.xaxis,type:'category',categoryorder:'array',categoryarray:g,...names(g,w)};}
 if(role==='comp'){delete layout.title;// The card's long y title (Mean share of selected signal (%)) does not fit a short panel.
  if(/share/i.test(textOf(layout.yaxis?.title)))layout.yaxis={...layout.yaxis,title:{text:'Mean share (%)',font:{size:8}}};// C's class legend is drawn by the page on its right (figure1Page).
  layout.showlegend=false;fix('comp',opts.title?0:C_RATIO);const g=ordered(categories({data,layout}));layout.xaxis={...layout.xaxis,type:'category',categoryorder:'array',categoryarray:g,...groupDots(g)};}
 if(role==='heat'){
  delete layout.title;const t=data.find(t=>t.type==='heatmap'),rows=(Array.isArray(t?.y)?t!.y:[]).map(String),groups=(Array.isArray(t?.x)?t!.x:[]).map(String);
  const px=size.height*96/72,font=Math.max(3,Math.min(8,px*.75/Math.max(1,rows.length)));
  layout.yaxis={...layout.yaxis,type:'category',tickmode:'array',tickvals:rows,ticktext:rows,tickfont:{size:font,color:'#000000'},ticks:'',title:{text:''}};
  for(const k of ['scaleanchor','scaleratio','constrain','domain'])delete layout.yaxis[k];
  layout.xaxis={...layout.xaxis,type:'category',...groupDots(groups),ticks:''};for(const k of ['scaleanchor','scaleratio','constrain','domain','categoryorder','categoryarray'])delete layout.xaxis[k];
  data=data.map(d=>d.type!=='heatmap'?d:{...d,showscale:true,colorbar:{title:{text:'Mean z-score',side:'right',font:{size:8}},orientation:'v',x:1.02,xanchor:'left',y:.5,yanchor:'middle',len:.5,lenmode:'fraction',thickness:8,tickfont:{size:7},outlinecolor:'#000000',outlinewidth:1}});
 }
 if(role==='violin'){
  layout.title={text:textOf(source.layout?.title),x:.5,xanchor:'center',y:.99,yanchor:'top',font:{size:9,color:'#000000'}};layout.showlegend=false;
  // The n labels (n = 18 samples) crowd into one line in a small panel; n is in panel A's legend.
  const before=(layout.annotations??[]).length;layout.annotations=(layout.annotations??[]).filter((a:PlotObject)=>!/^tcstat-n-/.test(String(a.name??''))&&!/^n = /.test(plain(String(a.text??''))));
  if(layout.annotations.length<before&&!layout.annotations.some((a:PlotObject)=>/^tcstat-label-/.test(String(a.name??'')))){delete layout.yaxis.range;layout.yaxis.autorange=true;}
  if(/log10/i.test(textOf(layout.yaxis.title)))layout.yaxis.title={text:'log10 abundance',font:{size:8}};
  // Wide violins with small dots, so the shapes are not lost behind the samples.
  layout.violingap=.05;layout.violingroupgap=0;
  data=data.map(t=>t.type!=='violin'?t:{...t,width:.9,scalemode:'width',jitter:.3,marker:{...(t.marker??{}),size:2.5,line:{...(t.marker?.line??{}),width:.4}},...(t.box?{box:{...t.box,width:.12}}:{})});
  const g=ordered(categories({data,layout})),{w}=fix('violin');
  layout.xaxis={...layout.xaxis,type:'category',categoryorder:'array',categoryarray:g,...names(g,w)};
 }
 if(opts.title)layout.title={text:opts.title,x:.5,xanchor:'center',y:1,yanchor:'top',pad:{t:2},font:{size:8,color:'#000000'}};
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
  // One card per PCA cluster: each card's name and the groups it compares.
  const each=panel.nodes.length>1?panel.nodes.map(n=>{const g=sources.get(n.id)?.figure;return `${n.label} (${g?categories({data:g.data.filter(t=>t.xaxis!=='x2'&&!t.meta?.teamLegendProxy),layout:g.layout}).join(', '):''})`;}).join('; '):'';
  return lead+`${pc} scores by group (box plots with every sample)${each?`, one plot per PCA cluster, each comparing only its own groups: ${each}`:''}; ${omni} across groups and ${pair} on each pair with ${corr} correction; groups that share a letter do not differ (adjusted p ≥ 0.05), groups with no letter in common do (adjusted p < 0.05).`;}
 const shown=(g?:Figure)=>g?.data.filter(t=>t.type==='bar'&&t.visible!==false).length;
 if(panel.role==='comp'&&panel.nodes.length>1)return lead+`Lipid composition: mean share of signal by lipid class in each group, in ${panel.nodes.length} stacked-bar plots, each normalised to 100% of its own classes: ${panel.nodes.map(n=>`${n.label} (${shown(sources.get(n.id)?.figure)??0} classes)`).join('; ')}; dots mark the groups, coloured as in A.`;
 if(panel.role==='comp'){const classes=shown(f);return lead+`Lipid composition: mean share of signal by lipid class in each group (stacked bars${classes?`, ${classes} classes`:''}); dots mark the groups, coloured as in A.`;}
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
 // Legends the page draws: A's groups on the right of its plot, C's classes (top of the stack first) on the right of
 // its bars. A class the author turned off in the card (an invisible trace) is not in C's legend.
 const cw=(A4[0]-2*MARGIN-GUTTER)/2,figureOf=(r:Role)=>{const p=panels.find(p=>p.role===r);return p&&sources.get(p.nodes[0].id)?.figure;};
 const groupsOf=(f:Figure)=>f.data.filter(t=>t.showlegend!==false&&t.name&&(t.type??'scatter')==='scatter').map(t=>({label:plain(String(t.name)),color:colours.get(conditionOf(t))??hex(t.marker?.color)??'#7F7F7F'}));
 const classesOf=(f:Figure)=>f.data.filter(t=>t.showlegend!==false&&t.visible!==false&&t.name&&t.type==='bar').reverse().map(t=>({label:plain(String(t.name)),color:hex(t.marker?.color)??String(t.marker?.color??'#7F7F7F')}));
 const pcaGroups=figureOf('pca')?groupsOf(figureOf('pca')!):undefined,compClasses=figureOf('comp')?classesOf(figureOf('comp')!):undefined;
 const aLegend=pcaGroups&&sideLegend('',0,0,pcaGroups,cw*.5),cLegend=compClasses&&sideLegend('',0,0,compClasses,cw*.45);
 const slots=figure1Geometry(panels,reserve,top,{a:aLegend&&{width:aLegend.width,height:aLegend.height},c:cLegend&&{width:cLegend.width,height:cLegend.height}});
 const pcaSlot=slots.find(s=>s.role==='pca'),compSlots=slots.filter(s=>s.role==='comp');
 const legend=pcaSlot&&pcaGroups&&aLegend?sideLegend(pcaSlot.nodeId,pcaSlot.x+pcaSlot.width,pcaSlot.y+Math.max(0,(pcaSlot.height-aLegend.height)/2),pcaGroups,cw*.5):undefined;
 // One class legend per C card, on the right of its own bars.
 const compLegends=new Map(compSlots.flatMap(c=>{const f=sources.get(c.nodeId)?.figure;return f?[[c.nodeId,sideLegend(c.nodeId,c.x+c.width,c.y,classesOf(f),cw*.45)] as const]:[];}));
 const legends=[legend,...compLegends.values()].filter((l):l is PanelLegend=>!!l);
 const multi=(r:Role)=>(panels.find(p=>p.role===r)?.nodes.length??0)>1;
 const items:Positioned[]=[];
 for(const slot of slots){const s=sources.get(slot.nodeId)!,node=nodes.find(n=>n.id===slot.nodeId);
  const side=slot.role==='pca'?legend:slot.role==='comp'?compLegends.get(slot.nodeId):undefined,height=slot.height,width=side?slot.width-side.width:slot.width,box={...slot,width:width-LETTER_PAD,height};
  const image=s.figure?await options.render(figure1Figure(slot.role,s.figure,colours,order,box,(slot.role==='pcascore'||slot.role==='comp')&&multi(slot.role)&&node?{title:node.label}:{}),box.width,box.height):s.url!;
  items.push({x:slot.x,y:slot.y,width,height,node,image,...(slot.letter?{letter:slot.letter}:{})});}
 const bottom=Math.max(...slots.map(s=>s.y+s.height));
 return {width:A4[0],height:A4[1],items,figure1:true,caption:{...caption,y:bottom+gap},...(legends.length?{legends}:{}),...(title?{titleBlock:title}:{})};
}

/** Compact letter display (insert-absorb): each group gets letters so that two groups share a letter exactly when
 *  their pair is not in `significant`. Letters run a, b, c… in the order of `groups`. */
export function compactLetters(groups:string[],significant:string[][]):Map<string,string>{
 let columns:Set<string>[]=[new Set(groups)];
 for(const [a,b] of significant){
  const next:Set<string>[]=[];
  for(const c of columns){if(c.has(a)&&c.has(b)){const x=new Set(c),y=new Set(c);x.delete(a);y.delete(b);next.push(x,y);}else next.push(c);}
  // Absorb: drop a column that is empty or inside another one.
  columns=next.filter((c,i)=>c.size&&!next.some((d,j)=>j!==i&&[...c].every(g=>d.has(g))&&(d.size>c.size||j<i)));
 }
 const first=(c:Set<string>)=>Math.min(...[...c].map(g=>groups.indexOf(g)));
 columns.sort((x,y)=>first(x)-first(y));
 const letter=(i:number)=>i<26?String.fromCharCode(97+i):String.fromCharCode(65+i-26);
 return new Map(groups.map(g=>[g,columns.map((c,i)=>c.has(g)?letter(i):'').join('')]));
}
/** Panel B: the card's pair brackets read as significant or not (ns), drawn as one row of compact letters above the
 *  boxes instead; the y range tightened to them. The card is unchanged; this is the Figure 1 drawing only. */
function significanceLetters(data:PlotObject[],layout:PlotObject){
 const nums=(path:string)=>(path.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)??[]).map(Number);
 const isBracket=(s:PlotObject)=>s.type==='path'&&typeof s.path==='string'&&nums(s.path).length===8;
 const labels=(layout.annotations??[]).filter((a:PlotObject)=>a.xref!=='paper'&&a.yref!=='paper'),others=(layout.annotations??[]).filter((a:PlotObject)=>!labels.includes(a));
 const brackets=(layout.shapes??[]).filter(isBracket),rest=(layout.shapes??[]).filter((s:PlotObject)=>!isBracket(s));
 // The card's brackets use the positions of its own group order.
 const lev=categories({data,layout});
 // Each label sits on its bracket (same middle x, the label just above the bracket top): the nearest such bracket.
 const used=new Set<PlotObject>(),significant:string[][]=[];
 for(const a of labels){const near=brackets.filter((s:PlotObject)=>!used.has(s)&&Math.abs((nums(s.path)[0]+nums(s.path)[4])/2-Number(a.x))<1e-6).sort((x:PlotObject,y:PlotObject)=>Math.abs(nums(x.path)[3]-Number(a.y))-Math.abs(nums(y.path)[3]-Number(a.y)))[0];
  if(!near)continue;used.add(near);const v=nums(near.path),g=[lev[Math.round(v[0])],lev[Math.round(v[4])]];
  if(g[0]!==undefined&&g[1]!==undefined&&!/^ns$/i.test(plain(String(a.text??''))))significant.push(g);}
 const letters=compactLetters(lev,significant);
 const ys=data.flatMap(t=>Array.isArray(t.y)?t.y.filter((v:unknown)=>typeof v==='number'&&Number.isFinite(v)):[]) as number[];
 layout.shapes=rest;
 if(!ys.length){layout.annotations=others;return;}
 const lo=Math.min(...ys),hi=Math.max(...ys),span=Math.max(hi-lo,1e-9),y=hi+span*.04;
 layout.annotations=[...others,...lev.map((g:string)=>({x:g,y,xref:'x',yref:'y',text:letters.get(g),showarrow:false,xanchor:'center',yanchor:'bottom',font:{family:'Arial, Helvetica, sans-serif',size:8,color:'#000000'}}))];
 layout.yaxis={...layout.yaxis,range:[lo-span*.05,hi+span*.16],autorange:false};
}


const PCA_MARKER_PX=18,LEGEND_PAD=12;
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
  if(height<=.4*slot.height||!Number.isFinite(slot.height))break;
 }
 const y=slot.y+slot.height-best!.height;
 return {...best!,y,entries:best!.entries.map(e=>({...e,y:y+e.y}))};
}

/** A legend the page draws on the right of a panel (C's classes): columns top to bottom, as many as needed to stay
 *  within the panel's height share, at most `maxWidth` wide; 6 pt text on 8.5 pt rows. `x` is the panel's right edge. */
export function sideLegend(nodeId:string,x:number,y:number,entries:{label:string;color:string}[],maxWidth:number):PanelLegend{
 const fontSize=6,dot=fontSize*.8,rowHeight=fontSize+2.5,colWidth=(ls:{label:string}[])=>dot+4+Math.max(0,...ls.map(l=>l.label.length))*fontSize*.55+8;
 let k=1;for(;k<4;k++){const rows=Math.ceil(entries.length/k),cols=Array.from({length:k+1},(_,c)=>entries.slice(c*Math.ceil(entries.length/(k+1)),(c+1)*Math.ceil(entries.length/(k+1)))).filter(c=>c.length);
  if(rows<=12||cols.reduce((s,c)=>s+colWidth(c),0)>maxWidth)break;}
 const rows=Math.ceil(entries.length/k),cols=Array.from({length:k},(_,c)=>entries.slice(c*rows,(c+1)*rows)).filter(c=>c.length),width=cols.reduce((s,c)=>s+colWidth(c),0);
 const placed:PanelLegend['entries']=[];let cx=x-width;cols.forEach(col=>{col.forEach((e,r)=>placed.push({...e,x:cx,y:y+2+r*rowHeight+rowHeight/2}));cx+=colWidth(col);});
 return {nodeId,x:x-width,y,width,height:rows*rowHeight+4,fontSize,rowHeight,dot,entries:placed};
}
