import type {Document} from '../state/document';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import type {SessionPalette} from '../palette/sessionPalette';
import {A4,pdfPages} from './a4Pdf';
import {figure1Page,type PanelSource} from './figure1';
import {selectedNodes,type Page,type Positioned,type TitleBlock} from './layout';
// The report export: page 1 opens with a title block (the board's name, the export date and the dataset summary) above
// Figure 1 and its legend; the figure page's pages follow. Every page A4 with the header band (a4Pdf).
export const DEFAULT_REPORT_TITLE='Lipidomics report';
const MARGIN=34,TITLE_SIZE=16,TITLE_LINE=20,DATE_SIZE=10,SUMMARY_SIZE=8,MAX_TITLE_LINES=3;
/** The author's title, else the board's name as the top bar shows it (not its placeholder), else the dataset's, else the default. */
export function reportTitle(o:{custom?:string;projectName?:string;placeholder?:string;datasetName?:string}):string{
 const name=o.projectName?.trim();
 return o.custom?.trim()||(name&&name!==o.placeholder?name:'')||o.datasetName?.trim()||DEFAULT_REPORT_TITLE;
}
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
/** 23 November 2026 (local date, the same in every browser language). */
export const reportDate=(d:Date)=>`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const count=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:Array.isArray(v)?v.length:undefined;
/** 6 samples · 120 lipids · 3 groups, leaving out what is not known; undefined when nothing is. */
export function reportSummary(o:{samples?:unknown;lipids?:unknown;groups?:unknown}):string|undefined{
 const parts=([['samples','sample'],['lipids','lipid'],['groups','group']] as const).flatMap(([k,one])=>{const n=count(o[k]);return n===undefined?[]:[`${n} ${n===1?one:k}`];});
 return parts.length?parts.join(' · '):undefined;
}
/** <project>_report_<YYYY-MM-DD>.pdf, letters, digits, dot, dash and underscore only. */
export function reportFileName(title:string,d:Date):string{
 const slug=title===DEFAULT_REPORT_TITLE?'':title.normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/_+/g,'_').replace(/^[_.-]+|[_.-]+$/g,'').slice(0,70);
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${slug||'lipidomics'}_report_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.pdf`;
}
function wrapTitle(title:string,width:number):string[]{
 const max=Math.max(1,Math.floor(width/(TITLE_SIZE*.6))),lines:string[]=[];let line='';
 for(let word of title.split(/\s+/).filter(Boolean)){while(word.length>max){if(line){lines.push(line);line='';}lines.push(word.slice(0,max));word=word.slice(max);}
  if(line&&(line+' '+word).length>max){lines.push(line);line=word;}else line=line?line+' '+word:word;}
 if(line)lines.push(line);
 if(lines.length>MAX_TITLE_LINES){lines.length=MAX_TITLE_LINES;lines[MAX_TITLE_LINES-1]=lines[MAX_TITLE_LINES-1].slice(0,max-1)+'…';}
 return lines;
}
/** The title block at the top of page 1 (points): up to three title lines, the date, and the summary when known. */
export function titleBlock(o:{title:string;date:string;summary?:string}):TitleBlock{
 const width=A4[0]-2*MARGIN,lines=wrapTitle(o.title,width);
 const height=lines.length*TITLE_LINE+DATE_SIZE*1.6+(o.summary?SUMMARY_SIZE*1.6:0);
 return {x:MARGIN,y:MARGIN,width,height,lines,titleSize:TITLE_SIZE,lineHeight:TITLE_LINE,date:o.date,dateSize:DATE_SIZE,...(o.summary?{summary:o.summary,summarySize:SUMMARY_SIZE}:{})};
}
/** Page 1 when the canvas has no Figure 1 cards: the title block alone. */
export const titlePage=(block:TitleBlock):Page=>({width:A4[0],height:A4[1],items:[],figure1:true,titleBlock:block});
/** The report's pages: page 1 (title block + Figure 1, or the title block alone), then the figure page's pages. */
export function reportPages(doc:Document,nodes:Node[],first:Page|null,block:TitleBlock):Page[]{
 return pdfPages(doc,nodes,first??titlePage(block));
}
const KEY='nexo.report.title';
/** The title the author typed for the report in this tab; empty means the default (the board's name). */
export const reportTitlePreference={
 get:()=>{try{return sessionStorage.getItem(KEY)??'';}catch{return '';}},
 set:(title:string)=>{try{if(title.trim())sessionStorage.setItem(KEY,title.slice(0,200));else sessionStorage.removeItem(KEY);}catch{/* private mode */}},
};

/** The number of Group 1 levels in the session palette (Team's sample groups), undefined when unknown. */
export function paletteGroupCount(palette:SessionPalette|undefined):number|undefined{
 const n=palette?.contexts.find(c=>c.id==='Group1')?.groups.length;return n?n:undefined;
}
const CAPTION=16,GAP=14;
/** The report body: two cards per page, each under its label in half the page at the full content width. Every card
 *  is drawn again at that size (buildReport), so it fills its half whatever its shape on the canvas.
 *  Positions only; the images are filled in by buildReport. */
export function reportBodyLayout(nodes:Node[]):Page[]{
 const W=A4[0]-2*MARGIN,half=(A4[1]-2*MARGIN-GAP)/2,pages:Page[]=[];
 nodes.forEach((node,i)=>{if(i%2===0)pages.push({width:A4[0],height:A4[1],items:[],report:true});
  pages[pages.length-1].items.push({node,caption:node.label,x:MARGIN,y:MARGIN+(i%2)*(half+GAP),width:W,height:half});});
 return pages;
}
/** The whole report: page 1 (title block + Figure 1 and its legend, or the title block alone), then every other card
 *  of the figure page drawn from its current figure. Each card's figure comes from source (the card's own fetch,
 *  whatever its zoom tier or finished state); a card with neither figure nor image is left out and named, never drawn
 *  as a placeholder. */
export async function buildReport(doc:Document,nodes:Node[],o:{source:(n:Node,size?:{width:number;height:number})=>Promise<PanelSource|undefined>;render:(figure:Figure,width:number,height:number)=>Promise<string>;title:(groups:string[])=>TitleBlock;skipped?:(label:string)=>void;topHeatmap?:(n:Node)=>Promise<TopHeatmap|undefined>}):Promise<Page[]>{
 const memo=new Map<string,Promise<PanelSource|undefined>>(),source=(n:Node)=>{let s=memo.get(n.id);if(!s){s=o.source(n).catch(()=>undefined);memo.set(n.id,s);}return s;};
 const chosen=selectedNodes(doc,nodes),first=await figure1Page(chosen,{source,render:o.render,title:o.title});
 const inFigure1=new Set(first?.items.map(i=>i.node?.id)),images=new Map<string,string>(),notes=new Map<string,string>(),drawn:Node[]=[];
 for(const node of chosen.filter(n=>!inFigure1.has(n.id))){
  // Every card is drawn at the size of its half page. The filtered average heatmap: its 40 most significant rows, read from the session.
  const box=reportBodyLayout([node])[0].items[0];
  const top=/filteredHeatmapPlot$/.test(node.instance?.source??node.id)?await o.topHeatmap?.(node).catch(()=>undefined):undefined;
  if(top?.available){images.set(node.id,await o.render(topHeatmapFigure(top,{width:box.width,height:box.height-CAPTION}),box.width,box.height-CAPTION));drawn.push(node);continue;}
  const s=await source(node),body=s?.figure?reportBodyFigure(s.figure,{width:box.width,height:box.height-CAPTION}):undefined;
  // A server-drawn image card is drawn again at the size it takes on the page (CSS px), so its text keeps its size.
  const again=!s?.figure&&s?.url?await o.source(node,{width:box.width/PT_PER_PX,height:(box.height-CAPTION)/PT_PER_PX}).catch(()=>undefined):undefined;
  const image=body?await o.render(body.figure,box.width,box.height-CAPTION):again?.url??s?.url;
  if(image){images.set(node.id,image);if(body?.note)notes.set(node.id,body.note);drawn.push(node);}else o.skipped?.(node.label);
 }
 const body=reportBodyLayout(drawn).map(p=>({...p,items:p.items.map(i=>({...i,image:images.get(i.node!.id),...(notes.has(i.node!.id)?{caption:`${i.caption} · ${notes.get(i.node!.id)}`}:{})}))}));
 return [first??titlePage(o.title([])),...body];
}
/** The first source that gives a figure or an image: tried in order (live drawing, card fetch, the image shown). */
export async function firstSource(sources:(()=>PanelSource|undefined|Promise<PanelSource|undefined>)[]):Promise<PanelSource|undefined>{
 for(const source of sources){const s=await Promise.resolve().then(source).catch(()=>undefined);if(s?.figure||s?.url)return s;}
 return undefined;
}

const MAX_LABELLED_ROWS_PT=5;
const heatmapRows=(f:Figure)=>{const t=f.data.find(t=>t.type==='heatmap');return Array.isArray(t?.y)?t!.y.length:0;};
/** The card's figure as drawn in the report body (presentation only; values untouched): a heatmap whose row labels
 *  would be under 5 pt at this size shows no row labels, and the caption says how many rows there are. */
export function reportBodyFigure(f:Figure,box:{width:number;height:number}):{figure:Figure;note?:string}{
 const rows=heatmapRows(f);if(!rows||box.height*.85/rows>=MAX_LABELLED_ROWS_PT)return {figure:f};
 const t=f.data.find(t=>t.type==='heatmap')!,axis=String(t.yaxis??'y').replace(/^y/,'yaxis');
 return {figure:{data:f.data,layout:{...f.layout,[axis]:{...(f.layout[axis]??{}),showticklabels:false}}},note:`${rows} rows; labels omitted`};
}

const PT_PER_PX=72/96;
/** The report's top rows of a filtered average heatmap, as the API reads them from the session
 *  (frontends/nexo-api/report.R): the card's rows with the smallest p values, grouped by class, coloured as the card. */
export type TopHeatmap = {available:true;total:number;shown:number;groups:string[];scaleMode:'global_zscore'|'pattern_zscore'|'relative';limits:[number,number];
 pType:'adjusted'|'raw';pThreshold:number;fcThreshold:number;comparison:string;classColors:Record<string,string>;
 rows:{lipid:string;class:string;p:number;log2FC:number;values:number[]}[]}|{available:false;reason:string};
const SCALE_TITLES={global_zscore:'Global scaling (z-score)',pattern_zscore:'Row pattern scaling (0-100)',relative:'Relative scaling (0-100)'} as const;
/** The report's top-rows heatmap (Plotly): every row labelled with its lipid, a class strip on the left of the rows, a
 *  legend of the classes, Team's colour scale and limits, and the subtitle (how many of how many, criteria, comparison). */
export function topHeatmapFigure(t:Extract<TopHeatmap,{available:true}>,box:{width:number;height:number}):Figure{
 const px=(pt:number)=>pt*96/72,lipids=t.rows.map(r=>r.lipid),classes=[...new Set(t.rows.map(r=>r.class))],K=Math.max(1,classes.length);
 const longest=Math.max(0,...lipids.map(l=>l.length)),legendW=Math.max(0,...classes.map(c=>c.length))*8*.6+50;
 // Rows first (their label size sets the left margin), then the margins: lipid names left of the class strip, group
 // names turned under the columns.
 const groupLen=Math.max(0,...t.groups.map(g=>g.length)),b=Math.min(160,groupLen*8*.5+30),rowPx=(px(box.height)-34-b)/Math.max(1,lipids.length),font=Math.max(8,Math.min(10,Math.floor(rowPx*.8)));
 const margin={l:Math.max(60,longest*font*.62+14),r:legendW+90,t:34,b,autoexpand:false},plotW=Math.max(1,px(box.width)-margin.l-margin.r);
 // The colour bar in its own column right of the class legend, so a long legend never runs into it.
 const barX=1.02+legendW/plotW;
 const diverging=t.scaleMode==='global_zscore',colorscale=diverging?[[0,'#2166AC'],[.5,'#F7F7F7'],[1,'#B2182B']]:[[0,'#FFFFCC'],[.5,'#FD8D3C'],[1,'#800026']];
 const steps=classes.flatMap((c,k)=>[[k/K,t.classColors[c]??'#9CA3AF'],[(k+1)/K,t.classColors[c]??'#9CA3AF']]);
 const fixed=(v:number)=>String(Number(v.toPrecision(3)));
 return {data:[
  {type:'heatmap',x:t.groups,y:lipids,z:t.rows.map(r=>r.values),zmin:t.limits[0],zmax:t.limits[1],colorscale,
   colorbar:{title:{text:SCALE_TITLES[t.scaleMode],side:'right',font:{size:8}},x:barX,xanchor:'left',y:.5,yanchor:'middle',len:.6,thickness:10,tickfont:{size:8}}},
  {type:'heatmap',x:['Class'],y:lipids,z:t.rows.map(r=>[classes.indexOf(r.class)+.5]),zmin:0,zmax:K,colorscale:steps,showscale:false,xaxis:'x2',hoverinfo:'skip'},
  ...classes.map(c=>({type:'scatter',mode:'markers',name:c,x:[null],y:[null],marker:{symbol:'square',size:10,color:t.classColors[c]??'#9CA3AF'},showlegend:true}))],
  layout:{paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff',font:{family:'Arial, Helvetica, sans-serif',size:9,color:'#000000'},margin,
   title:{text:`Top ${t.shown} of ${t.total} significant lipids (|log2FC| ≥ ${fixed(t.fcThreshold)}, ${t.pType==='adjusted'?'adjusted ':''}P < ${fixed(t.pThreshold)})${t.comparison?`, ${t.comparison}`:''}`,x:0,xanchor:'left',xref:'paper',y:1,yanchor:'top',yref:'container',pad:{t:6},font:{size:10}},
   xaxis:{domain:[.06,1],type:'category',tickfont:{size:8},tickangle:-35,ticks:'',showline:true,linecolor:'#000000',mirror:true},
   xaxis2:{domain:[0,.04],type:'category',showticklabels:false,ticks:'',anchor:'y'},
   yaxis:{type:'category',autorange:'reversed',tickmode:'array',tickvals:lipids,ticktext:lipids,tickfont:{size:font},ticks:'',showline:true,linecolor:'#000000',mirror:true,anchor:'x2'},
   legend:{x:1.02,xanchor:'left',y:1,yanchor:'top',font:{size:8},bgcolor:'rgba(0,0,0,0)',tracegroupgap:0},showlegend:true}};
}
