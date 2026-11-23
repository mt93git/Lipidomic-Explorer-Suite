import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {initialDocument,syncDocument} from './model';
import {buildReport,paletteGroupCount,reportBodyLayout,reportDate,reportSummary,titleBlock} from './report';
import type {Page} from './layout';
// Staging, 2026-11-23: on a real board (canvas at overview zoom, every card frozen, none finished) Export report made
// page 1 with the title block only and a second page of PENDING placeholders: Figure 1 and the body read the cards from
// the DOM. The report now gets each card's figure through the card's own fetch (mocked here at that layer), whatever
// its zoom tier or finished state, and never shows a placeholder. Synthetic board.
const node=(id:string,source:string,label:string,w=420,h=320):Node=>({id,kind:'plot',label,x:0,y:0,width:w,height:h,instance:{instanceId:id,source}});
const cards=[node('pca','results_dashboard-plot_pca','Principal components'),node('score','results_dashboard-plot_pcascore','PCA score analysis'),node('comp','results_dashboard-plot_comp','Composition overview'),
 node('heat','results_dashboard-plot_heat','Abundance heatmap',460,620),...[1,2,3,4].map(i=>node(`v${i}`,'results_dashboard-plot_violin',`Feature distribution ${i}`)),
 node('volcano','volcano_tab-volcanoPlot','Volcano plot'),node('logratio','logratio_tab-logratioPlot','Log ratio',600,300),node('png','qc_tab-qcImage','QC image')];
const scatter:Figure={data:[{type:'scatter',mode:'markers',name:'Alpha',x:[1],y:[1],marker:{color:'#1F77B4'}},{type:'scatter',mode:'markers',name:'Beta',x:[2],y:[2],marker:{color:'#D62728'}}],layout:{xaxis:{title:'PC1 (40.0%)'},yaxis:{title:'PC2 (20.0%)'}}};
const figureOf=(n:Node):Figure=>n.id==='heat'?{data:[{type:'heatmap',x:['Alpha','Beta'],y:['PC 30:0 synthetic'],z:[[1,-1]]}],layout:{}}:n.id.startsWith('v')?{data:[{type:'violin',name:'Alpha',x:['Alpha'],y:[1],fillcolor:'#1F77B4'}],layout:{title:{text:`Lipid ${n.id}`}}}:scatter;
// The card fetch: Plotly cards answer their figure, the PNG card its image; nothing comes from the DOM.
const fetched:string[]=[];
const cardFetch=async(n:Node)=>{fetched.push(n.id);return n.id==='png'?{url:'data:image/png;base64,QUFB'}:{figure:figureOf(n)};};
const render=async(_:Figure,w:number,h:number)=>`data:image/png;base64,${btoa(`${Math.round(w)}x${Math.round(h)}`)}`;
const title=(groups:string[])=>titleBlock({title:'Synthetic board',date:reportDate(new Date(2026,10,23)),summary:reportSummary({samples:72,lipids:1622,groups:groups.length})});
describe('report from a board whose cards are frozen and not finished',()=>{
 it('fills Figure 1 with every panel from the card fetch, and the body with images, never PENDING',async()=>{
  const doc=syncDocument(initialDocument(),cards);fetched.length=0;
  const pages=await buildReport(doc,cards,{source:cardFetch,render,title});
  expect(pages[0].figure1).toBe(true);
  expect(pages[0].items.map(i=>i.letter).filter(Boolean)).toEqual(['A','B','C','D','E']);
  expect(pages[0].items).toHaveLength(8);expect(pages[0].titleBlock?.lines).toEqual(['Synthetic board']);
  const body=pages.slice(1),items=body.flatMap(p=>p.items);
  expect(items.map(i=>i.caption)).toEqual(['Volcano plot','Log ratio','QC image']);
  for(const i of items){expect(i.image).toMatch(/^data:image\/png/);expect(i.note).toBeUndefined();}
  expect(JSON.stringify(pages)).not.toMatch(/PENDING|Finish this plot/);
  expect(pages.every(p=>p.width===A4[0]&&p.height===A4[1])).toBe(true);
  expect(new Set(fetched)).toEqual(new Set(cards.map(c=>c.id)));
 });
 it('leaves out a card that cannot be drawn, and names it, instead of a placeholder',async()=>{
  const doc=syncDocument(initialDocument(),cards),skipped:string[]=[];
  const pages=await buildReport(doc,cards,{source:async n=>n.id==='volcano'?undefined:cardFetch(n),render,title,skipped:l=>skipped.push(l)});
  expect(pages.slice(1).flatMap(p=>p.items).map(i=>i.caption)).toEqual(['Log ratio','QC image']);expect(skipped).toEqual(['Volcano plot']);
 });
});
describe('report body layout',()=>{
 const fits=(p:Page)=>p.items.every(i=>i.x>=34&&i.y>=34&&i.x+i.width<=A4[0]-34+1e-9&&i.y+i.height<=A4[1]-34+1e-9);
 it('puts each card full width under its label, two per page when they fit, keeping the card shape',()=>{
  const wide=[1,2,3].map(i=>node(`w${i}`,'x-w','Wide '+i,800,400));
  const pages=reportBodyLayout(wide);expect(pages.map(p=>p.items.length)).toEqual([2,1]);
  for(const p of pages){expect(fits(p)).toBe(true);for(const i of p.items){expect(i.width).toBeCloseTo(A4[0]-68);expect(i.height-16).toBeCloseTo((A4[0]-68)/2);}}
  const tall=[node('t','x-t','Tall',300,900),node('w','x-w','Wide',800,400)];
  const t=reportBodyLayout(tall);expect(t.map(p=>p.items.length)).toEqual([1,1]);expect(t.every(fits)).toBe(true);
  // A tall card is shrunk to the page height, its shape kept.
  const i=t[0].items[0];expect((i.height-16)/i.width).toBeCloseTo(3);
  expect(reportBodyLayout([])).toEqual([]);
 });
});
describe('report summary groups',()=>{
 it('counts the Group 1 levels of the session palette',()=>{
  const palette={active:'Default',palettes:[],state:{useCustomColors:false,customColors:{},activePalette:'Default'},shapesEditable:false,
   contexts:[{id:'Group1',label:'Sample groups (Group 1)',groups:[{name:'Alpha',color:'#111111'},{name:'Beta',color:'#222222'},{name:'Gamma',color:'#333333'}]},{id:'Lipid Class',label:'Lipid class',groups:[{name:'PC',color:'#444444'}]}]};
  expect(paletteGroupCount(palette)).toBe(3);expect(paletteGroupCount(undefined)).toBeUndefined();expect(paletteGroupCount({...palette,contexts:[]})).toBeUndefined();
 });
 it('uses the session count even when Figure 1 reads no group colours',async()=>{
  const plain=[node('volcano','volcano_tab-volcanoPlot','Volcano plot')],doc=syncDocument(initialDocument(),plain);
  const pages=await buildReport(doc,plain,{source:cardFetch,render,title:g=>titleBlock({title:'Synthetic board',date:'23 November 2026',summary:reportSummary({samples:72,lipids:1622,groups:g.length||4})})});
  expect(pages[0].titleBlock?.summary).toBe('72 samples · 1622 lipids · 4 groups');
 });
});
describe('where a report card comes from',()=>{
 const fig:Figure={data:[],layout:{}};
 it('takes the live drawing when the card is live, else the card fetch, else its image',async()=>{
  const {firstSource}=await import('./report');
  expect(await firstSource([()=>({figure:fig}),async()=>({url:'data:card'})])).toEqual({figure:fig});
  // Frozen or off screen: nothing in the DOM, the card's own fetch answers.
  expect(await firstSource([()=>undefined,async()=>({url:'data:image/png;base64,QQ'}),async()=>({url:'data:fallback'})])).toEqual({url:'data:image/png;base64,QQ'});
  // A fetch that fails or answers nothing falls through to the image the card shows.
  expect(await firstSource([()=>undefined,async()=>{throw new Error('synthetic');},async()=>({url:'data:fallback'})])).toEqual({url:'data:fallback'});
  expect(await firstSource([()=>undefined,async()=>({}),async()=>undefined])).toBeUndefined();
 });
});
describe('report body pairs',()=>{
 it('shrinks a card a little over half a page so two share a page, centred, shape kept',()=>{
  const cards=[node('a','x-a','A',400,300),node('b','x-b','B',460,360)],pages=reportBodyLayout(cards);
  expect(pages.map(p=>p.items.length)).toEqual([2]);
  for(const i of pages[0].items){expect((i.height-16)/i.width).toBeCloseTo(cards.find(c=>c.id===i.node!.id)!.height/cards.find(c=>c.id===i.node!.id)!.width);expect(i.x+i.width/2).toBeCloseTo(A4[0]/2);expect(i.y+i.height).toBeLessThanOrEqual(A4[1]-34+1e-9);}
 });
});
