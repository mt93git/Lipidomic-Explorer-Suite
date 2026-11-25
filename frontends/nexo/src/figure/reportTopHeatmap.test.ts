import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {initialDocument,syncDocument} from './model';
import {buildReport,titleBlock,topHeatmapFigure,type TopHeatmap} from './report';
// User decision 2026-11-24: in the report the "Filtered average heatmap" (about 200 significant lipids) shows its 40
// most significant lipids, grouped by class with the class strip and legend, every row labelled at 6 pt or more, at
// full width, with a subtitle naming the counts, criteria and comparison. The 40 rows come from the session
// (frontends/nexo-api/report.R, tested in tests/dual-ui/test_api_report_heatmap.R); nothing is recomputed here.
// Synthetic: 208 significant lipids, 4 classes, 3 groups.
const W=A4[0]-68,classes=['PC','PE','SM','TG'];
const rows=Array.from({length:40},(_,i)=>({lipid:`${classes[Math.floor(i/10)]} ${30+i}:${i%6} synthetic`,class:classes[Math.floor(i/10)],p:1e-6*(i+1),log2FC:2,values:[i/40,-i/40,0]}));
const top:TopHeatmap={available:true,total:208,shown:40,groups:['Control','TLR4_KLA','Mix'],scaleMode:'global_zscore',limits:[-3,3],pType:'adjusted',pThreshold:.05,fcThreshold:1,
 comparison:'TLR4_KLA vs Control',classColors:{PC:'#1B9E77',PE:'#D95F02',SM:'#E7298A',TG:'#7570B3'},rows};
const card:Node={id:'fh',kind:'plot',label:'Filtered average heatmap',x:0,y:0,width:460,height:2400,instance:{instanceId:'fh',source:'heatmap_barchart_tab-filteredHeatmapPlot'}};
async function report(answer:TopHeatmap|undefined){
 let drawn:Figure|undefined,size:[number,number]|undefined;
 const pages=await buildReport(syncDocument(initialDocument(),[card]),[card],{title:()=>titleBlock({title:'S',date:'24 November 2026'}),
  source:async()=>({url:'data:image/png;base64,QQ'}),topHeatmap:async()=>answer,render:async(f,w,h)=>{drawn=f;size=[w,h];return 'data:image/png;base64,QkI';}});
 return {item:pages[1].items[0],drawn,size};
}
describe('report: top 40 of the filtered average heatmap',()=>{
 it('draws exactly 40 labelled rows grouped by class, at full width, labels at 6 pt or more, with the subtitle',async()=>{
  const {item,drawn,size}=await report(top);
  expect(item.width).toBeGreaterThanOrEqual(.9*W);expect(size![0]).toBeGreaterThanOrEqual(.9*W);expect(item.image).toBe('data:image/png;base64,QkI');
  const f=drawn!,heat=f.data.find(t=>t.type==='heatmap'&&(t.xaxis??'x')==='x')!;
  expect(heat.y).toEqual(rows.map(r=>r.lipid));expect(heat.z).toEqual(rows.map(r=>r.values));
  expect(f.layout.yaxis.tickvals).toEqual(rows.map(r=>r.lipid));expect(f.layout.yaxis.ticktext).toEqual(rows.map(r=>r.lipid));
  // 8 px = 6 pt on the page; rows big enough for it.
  expect(f.layout.yaxis.tickfont.size).toBeGreaterThanOrEqual(8);expect((size![1]/.75-f.layout.margin.t-f.layout.margin.b)/40).toBeGreaterThanOrEqual(f.layout.yaxis.tickfont.size);
  // Class strip beside the rows and one legend entry per class, in row order.
  const strip=f.data.find(t=>t.type==='heatmap'&&t.xaxis==='x2')!;expect(strip.y).toEqual(heat.y);
  expect(f.data.filter(t=>t.type==='scatter'&&t.showlegend!==false).map(t=>t.name)).toEqual(classes);
  expect(f.layout.title.text).toBe('Top 40 of 208 significant lipids (|log2FC| ≥ 1, adjusted P < 0.05), TLR4_KLA vs Control');
  expect(heat.zmin).toBe(-3);expect(heat.zmax).toBe(3);
 });
 it('keeps the card image when the session has no top 40 (no differential result, class averages, an error)',async()=>{
  for(const answer of [undefined,{available:false as const,reason:'There is no differential result for this session.'}]){
   const {item,drawn}=await report(answer as TopHeatmap|undefined);expect(drawn).toBeUndefined();expect(item.image).toBe('data:image/png;base64,QQ');expect(item.width).toBeGreaterThanOrEqual(.9*W);}
 });
 it('builds the figure from the reply only',()=>{
  const f=topHeatmapFigure({...top,scaleMode:'relative',limits:[0,100]},{width:W,height:700});
  expect(f.data[0].zmin).toBe(0);expect(f.data[0].zmax).toBe(100);expect(f.data[0].colorbar.title.text).toBe('Relative scaling (0-100)');
 });
});
// Staging export 2026-11-24: at half a page, 14 class entries ran down into the colour bar drawn under them.
describe('report: top heatmap colour bar',()=>{
 it('draws the colour bar in its own column right of the class legend, inside the page',()=>{
  const many=Array.from({length:14},(_,i)=>`GP_CLASS_${i}`),r=rows.map((x,i)=>({...x,class:many[i%14]}));
  const box={width:W,height:(A4[1]-68-14)/2-16},f=topHeatmapFigure({...top,rows:r,classColors:Object.fromEntries(many.map(c=>[c,'#1B9E77']))},box);
  const m=f.layout.margin,plotW=box.width*96/72-m.l-m.r,bar=f.data[0].colorbar;
  const legendRight=1.02*plotW+Math.max(...many.map(c=>c.length))*8*.6+30;
  expect(bar.x*plotW).toBeGreaterThanOrEqual(legendRight);
  expect(bar.x*plotW+bar.thickness+40).toBeLessThanOrEqual(plotW+m.r);
 });
});
