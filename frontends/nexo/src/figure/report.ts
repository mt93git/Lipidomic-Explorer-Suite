import type {Document} from '../state/document';
import type {Node} from '../api';
import {A4,pdfPages} from './a4Pdf';
import type {Page,TitleBlock} from './layout';
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
