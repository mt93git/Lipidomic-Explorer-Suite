import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4,a4Pdf} from './a4Pdf';
import {figure1Page} from './figure1';
import {model,selectedNodes} from './layout';
import {initialDocument,syncDocument} from './model';
import {DEFAULT_REPORT_TITLE,reportDate,reportFileName,reportPages,reportSummary,reportTitle,titleBlock,titlePage} from './report';
import type {JsPdf} from '../export/pdfHeader';
import source from '../../public/vendor/jspdf.umd.min.js?raw';
// Synthetic boards, cards and figures only.
const day=new Date(2026,10,23,15,30);
describe('report title block',()=>{
 it('names the report after the board, then the dataset, then a plain default',()=>{
  expect(reportTitle({projectName:'Synthetic board A',placeholder:'Checkpoints',datasetName:'ORD000 · v1'})).toBe('Synthetic board A');
  expect(reportTitle({projectName:'Checkpoints',placeholder:'Checkpoints',datasetName:'ORD000 · v1'})).toBe('ORD000 · v1');
  expect(reportTitle({projectName:'  ',placeholder:'Checkpoints'})).toBe(DEFAULT_REPORT_TITLE);
  expect(DEFAULT_REPORT_TITLE).toBe('Lipidomics report');
  // A title the author typed wins over every default; a blank one does not.
  expect(reportTitle({custom:'My synthetic study',projectName:'Synthetic board A',placeholder:'Checkpoints'})).toBe('My synthetic study');
  expect(reportTitle({custom:' ',projectName:'Synthetic board A',placeholder:'Checkpoints'})).toBe('Synthetic board A');
 });
 it('writes the export date in long form and the dataset summary when known',()=>{
  expect(reportDate(day)).toBe('23 November 2026');expect(reportDate(new Date(2026,0,5))).toBe('5 January 2026');
  expect(reportSummary({samples:6,lipids:120,groups:3})).toBe('6 samples · 120 lipids · 3 groups');
  expect(reportSummary({samples:1,lipids:1,groups:1})).toBe('1 sample · 1 lipid · 1 group');
  expect(reportSummary({samples:[1,2,3],lipids:undefined,groups:2})).toBe('3 samples · 2 groups');
  expect(reportSummary({})).toBeUndefined();
 });
 it('names the file <project>_report_<YYYY-MM-DD>.pdf with safe characters only',()=>{
  expect(reportFileName('Synthetic board A',day)).toBe('Synthetic_board_A_report_2026-11-23.pdf');
  expect(reportFileName('ORD000 · v1 / "draft"?',day)).toBe('ORD000_v1_draft_report_2026-11-23.pdf');
  expect(reportFileName(DEFAULT_REPORT_TITLE,day)).toBe('lipidomics_report_2026-11-23.pdf');
  expect(reportFileName('···',day)).toBe('lipidomics_report_2026-11-23.pdf');
  expect(reportFileName('x'.repeat(300),day).length).toBeLessThanOrEqual(100);
 });
});
const node=(id:string,source:string):Node=>({id,kind:'plot',label:id,x:0,y:0,width:300,height:300,instance:{instanceId:id,source}});
const pca=node('p','results_dashboard-plot_pca'),heat=node('h','results_dashboard-plot_heat');
const figures:Record<string,Figure>={p:{data:[{type:'scatter',mode:'markers',name:'Alpha',x:[1],y:[1],marker:{color:'#1F77B4'}},{type:'scatter',mode:'markers',name:'Beta',x:[2],y:[2],marker:{color:'#D62728'}}],layout:{xaxis:{title:'PC1 (40.0%)'},yaxis:{title:'PC2 (20.0%)'}}},
 h:{data:[{type:'heatmap',x:['Alpha','Beta'],y:['PC 30:0 synthetic','PE 32:1 synthetic'],z:[[1,-1],[-1,1]]}],layout:{}}};
const options={source:async(n:Node)=>({figure:figures[n.id]}),render:async()=>'data:image/png;base64,AA'};
describe('report page 1',()=>{
 const block=titleBlock({title:'Synthetic board A',date:reportDate(day),summary:'6 samples · 120 lipids · 2 groups'});
 it('puts the title, date and summary above Figure 1, and Figure 1 with its legend still fits on the page',async()=>{
  const page=(await figure1Page([pca,heat],{...options,title:block}))!;
  const t=page.titleBlock!;expect(t.lines).toEqual(['Synthetic board A']);expect(t.date).toBe('23 November 2026');expect(t.summary).toBe('6 samples · 120 lipids · 2 groups');
  const below=t.y+t.height,top=Math.min(...page.items.map(i=>i.y));
  expect(t.y).toBeGreaterThanOrEqual(28);expect(top).toBeGreaterThan(below);
  const c=page.caption!;expect(c.y).toBeGreaterThan(Math.max(...page.items.map(i=>i.y+i.height)));expect(c.y+c.lines.length*c.lineHeight).toBeLessThanOrEqual(A4[1]-28);
  // Figure 1 shrinks to make room for the title block.
  const plain=(await figure1Page([pca,heat],options))!;
  expect(Math.max(...page.items.map(i=>i.height))).toBeLessThan(Math.max(...plain.items.map(i=>i.height)));
 });
 it('wraps a long title and never lets the page overflow',async()=>{
  const long=titleBlock({title:'A very long synthetic board name '.repeat(8),date:reportDate(day)});
  expect(long.lines.length).toBeGreaterThan(1);expect(long.lines.length).toBeLessThanOrEqual(3);
  const page=(await figure1Page([pca,heat],{...options,title:long}))!,c=page.caption!;
  expect(Math.min(...page.items.map(i=>i.y))).toBeGreaterThan(long.y+long.height);expect(c.y+c.lines.length*c.lineHeight).toBeLessThanOrEqual(A4[1]-28);
 });
 it('is page 1 of the report, then the figure page pages unchanged; a title page alone when there is no Figure 1',async()=>{
  const cards=[node('a','x-a'),node('b','x-b')],doc=syncDocument({...initialDocument(),layout:'pages'},cards),existing=model(doc,selectedNodes(doc,cards));
  const first=(await figure1Page([pca,heat],{...options,title:block}))!;
  expect(reportPages(doc,cards,first,block)).toEqual([first,...existing]);
  const alone=reportPages(doc,cards,null,block);expect(alone.slice(1)).toEqual(existing);
  expect(alone[0]).toEqual(titlePage(block));expect(alone[0].titleBlock?.lines).toEqual(['Synthetic board A']);expect([alone[0].width,alone[0].height]).toEqual(A4);
 });
 it('stays A4 with the header band on every page',async()=>{
  const holder={exports:{} as {jsPDF:JsPdf}};new Function('module','exports',source)(holder,holder.exports);
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
  const cards=[node('a','x-a')],doc=syncDocument({...initialDocument(),layout:'pages'},cards);
  const pages=reportPages(doc,cards,null,block).map(p=>({width:p.width,height:p.height,png}));
  const text=new TextDecoder('latin1').decode(await a4Pdf(pages,holder.exports.jsPDF,{type:'arraybuffer',compress:false}) as ArrayBuffer);
  expect([...text.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map(m=>m[1].trim().split(/\s+/).map(v=>Math.round(Number(v)*100)/100))).toEqual([[0,0,595.28,841.89],[0,0,595.28,841.89]]);
  expect(text.match(/-22\. re\s+f/g)).toHaveLength(2);
 });
});
