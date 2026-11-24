import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {initialDocument,syncDocument} from './model';
import {buildReport,reportDate,titleBlock} from './report';
// Staging, after PR #95: the "Selected-feature distributions" card (4 violins in a 3+1 grid) came out as a small image
// in the top third of its page, and a ~200-row "Filtered average heatmap" was shrunk to half the width with unreadable
// labels: body cards were rendered at their on-screen aspect. Synthetic cards.
const W=A4[0]-68;
const node=(id:string,label:string,w:number,h:number):Node=>({id,kind:'plot',label,x:0,y:0,width:w,height:h,instance:{instanceId:id,source:`x-${id}`}});
// Four violin panels in a 3 + 1 grid (two rows of subplots), as a wide on-screen card.
const facets:Figure={data:[1,2,3,4].map(i=>({type:'violin',name:'Alpha',x:['Alpha','Alpha'],y:[i,i+1],xaxis:i>1?`x${i}`:'x',yaxis:i>1?`y${i}`:'y'})),
 layout:Object.fromEntries([1,2,3,4].flatMap(i=>{const k=i>1?String(i):'',row=i<=3?[.55,1]:[0,.45],col=i<=3?[(i-1)/3,(i-1)/3+.3]:[0,.3];return [[`xaxis${k}`,{domain:col,anchor:`y${k}`}],[`yaxis${k}`,{domain:row,anchor:`x${k}`}]];}))};
const rows=Array.from({length:200},(_,i)=>`Lipid ${i} synthetic`);
const heat:Figure={data:[{type:'heatmap',x:['A','B','C'],y:rows,z:rows.map(()=>[1,0,-1])}],layout:{yaxis:{tickvals:rows,ticktext:rows}}};
const cards=[node('facets','Selected-feature distributions',900,360),node('heat','Filtered average heatmap',460,2400)];
const figures:Record<string,Figure>={facets,heat};
async function report(){
 const sizes=new Map<string,[number,number]>(),drawn=new Map<string,Figure>();
 const pages=await buildReport(syncDocument(initialDocument(),cards),cards,{source:async n=>({figure:figures[n.id]}),title:()=>titleBlock({title:'Synthetic',date:reportDate(new Date(2026,10,24))}),
  render:async(f,w,h)=>{const id=f===facets||f.data[0]?.type==='violin'?'facets':'heat';sizes.set(id,[w,h]);drawn.set(id,f);return 'data:image/png;base64,AA';}});
 return {items:pages.slice(1).flatMap(p=>p.items),sizes,drawn};
}
describe('report body cards are drawn for the page',()=>{
 it('renders a faceted violin card at the content width, covering at least 60% of the page height',async()=>{
  const {items,sizes}=await report(),item=items.find(i=>i.node!.id==='facets')!;
  expect(item.width).toBeCloseTo(W);expect(item.height).toBeGreaterThanOrEqual(.6*A4[1]);
  // Rendered at that size (not the on-screen 900 × 360 card scaled), so its text keeps its size on the page.
  const [w,h]=sizes.get('facets')!;expect(w).toBeCloseTo(W);expect(h).toBeCloseTo(item.height-16);
 });
 it('renders a tall heatmap at the page aspect, filling the content width; too many rows for 5 pt labels → labels omitted and said',async()=>{
  const {items,sizes,drawn}=await report(),item=items.find(i=>i.node!.id==='heat')!;
  expect(item.width).toBeGreaterThanOrEqual(.9*W);expect(item.y+item.height).toBeLessThanOrEqual(A4[1]-34+1e-9);
  expect(sizes.get('heat')![0]).toBeGreaterThanOrEqual(.9*W);
  const f=drawn.get('heat')!;expect(f.layout.yaxis.showticklabels).toBe(false);
  expect(item.caption).toBe('Filtered average heatmap · 200 rows; labels omitted');
  // Values unchanged.
  expect(f.data[0].z).toEqual(heat.data[0].z);expect(f.data[0].y).toEqual(rows);
 });
 it('keeps row labels when they can be at least 5 pt',async()=>{
  const few=Array.from({length:60},(_,i)=>`L${i}`),small:Figure={data:[{type:'heatmap',x:['A'],y:few,z:few.map(()=>[0])}],layout:{}};
  const one=[node('h60','Heatmap 60',460,1400)];let drawn:Figure|undefined;
  const pages=await buildReport(syncDocument(initialDocument(),one),one,{source:async()=>({figure:small}),title:()=>titleBlock({title:'S',date:'24 November 2026'}),render:async f=>{drawn=f;return 'data:image/png;base64,AA';}});
  expect(drawn!.layout.yaxis?.showticklabels).not.toBe(false);expect(pages[1].items[0].caption).toBe('Heatmap 60');expect(pages[1].items[0].width).toBeGreaterThanOrEqual(.9*W);
 });
});
// The real "Selected-feature distributions" and "Filtered average heatmap" cards are server-drawn images (PNG), not
// Plotly: the report asks the server to draw them again at the size they take on the page.
describe('report body image cards are drawn again at the page size',()=>{
 const png=(id:string,source:string,label:string,w:number,h:number):Node=>({id,kind:'plot',label,x:0,y:0,width:w,height:h,instance:{instanceId:id,source}});
 const violins=png('fv','heatmap_barchart_tab-violin_plot_render','Selected-feature distributions',900,360);
 const heatmap=png('fh','heatmap_barchart_tab-filteredHeatmapPlot','Filtered average heatmap',460,2400);
 it('asks for the faceted violins at the content width and at least 60% of the page; the tall heatmap at the page shape',async()=>{
  const asked=new Map<string,{width:number;height:number}>();
  const pages=await buildReport(syncDocument(initialDocument(),[violins,heatmap]),[violins,heatmap],{title:()=>titleBlock({title:'S',date:'24 November 2026'}),render:async()=>'data:image/png;base64,AA',
   source:async(n,size)=>{if(size)asked.set(n.id,size);return {url:`data:image/png;base64,${size?'QkI':'QQ'}`};}});
  const items=pages.slice(1).flatMap(p=>p.items),v=items.find(i=>i.node!.id==='fv')!,h=items.find(i=>i.node!.id==='fh')!;
  expect(v.width).toBeCloseTo(W);expect(v.height).toBeGreaterThanOrEqual(.6*A4[1]);expect(v.image).toBe('data:image/png;base64,QkI');
  expect(asked.get('fv')!.width).toBeCloseTo(W*96/72,0);expect(asked.get('fv')!.height).toBeCloseTo((v.height-16)*96/72,0);
  expect(h.width).toBeGreaterThanOrEqual(.9*W);expect(asked.get('fh')!.width).toBeCloseTo(W*96/72,0);expect(asked.get('fh')!.height).toBeCloseTo((h.height-16)*96/72,0);
 });
});
