import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {figure1Page} from './figure1';
import {reportDate,reportSummary,titleBlock} from './report';
// Review 2026-11-24: Figure 1's panels were wide and short (A and B about 2:1, C's bars very short, each E violin a
// wide flat box). Plot areas are now about square. Synthetic board: 10 long-label groups, 21 classes, 4 violins.
const groups=['Ecoli_Live (n = 7)','Ecoli_Heat (n = 7)','Saureus_Live (n = 6)','Saureus_Heat (n = 6)','Zymosan_Opsonized (n = 8)','Zymosan_Plain (n = 8)','Beads_IgG (n = 7)','Beads_Plain (n = 7)','Medium_Control (n = 9)','LPS_Primed (n = 7)'];
const classes=['PC','PE','PI','PS','PG','PA','LPC','LPE','LPI','LPS','SM','Cer','HexCer','DG','TG','CE','FA','CAR','PE-O','PC-O','CL'];
const colour=(i:number)=>`#${(0x123456+i*0x0a0b0c).toString(16).slice(-6)}`;
const figures:Record<string,Figure>={
 pca:{data:groups.map((g,i)=>({type:'scatter',mode:'markers',name:g,x:[i],y:[i],marker:{color:colour(i)}})),layout:{title:{text:'log2(x + 1)'},xaxis:{title:'PC1 (31.4%)'},yaxis:{title:'PC2 (12.7%)'}}},
 score:{data:groups.map((g,i)=>({type:'box',name:g,x:[g,g],y:[i,i+1],marker:{color:colour(i)}})),layout:{yaxis:{title:'PC1 score (31.4% of variance)'}}},
 comp:{data:classes.map((c,i)=>({type:'bar',name:c,x:groups,y:groups.map(()=>i+1)})),layout:{barmode:'stack',yaxis:{title:'Mean share of selected signal (%)'}}},
 heat:{data:[{type:'heatmap',x:groups,y:Array.from({length:25},(_,i)=>`L${i}`),z:Array.from({length:25},()=>groups.map(()=>0))}],layout:{}},
 violin:{data:groups.map((g,i)=>({type:'violin',name:g,x:[g,g],y:[i,i+1],fillcolor:colour(i)})),layout:{title:{text:'PC 30:0'},yaxis:{title:{text:'log10 prepared abundance'}}}},
};
const node=(id:string,source:string):Node=>({id,kind:'plot',label:id,x:0,y:0,width:420,height:320,instance:{instanceId:id,source}});
const cards=[node('pca','results_dashboard-plot_pca'),node('score','results_dashboard-plot_pcascore'),node('comp','results_dashboard-plot_comp'),node('heat','results_dashboard-plot_heat'),...[1,2,3,4].map(i=>node(`v${i}`,'results_dashboard-plot_violin'))];
async function page1(){
 const drawn:{figure:Figure;w:number;h:number}[]=[];
 const page=(await figure1Page(cards,{source:async n=>({figure:figures[n.id.startsWith('v')?'violin':n.id]}),render:async(figure,w,h)=>{drawn.push({figure,w,h});return 'data:image/png;base64,AA';},
  title:()=>titleBlock({title:'Synthetic board',date:reportDate(new Date(2026,10,24)),summary:reportSummary({samples:72,lipids:1622,groups:10})})}))!;
 return {page,drawn};
}
// The plot area of a rendered panel (CSS px): the image less its fixed margins.
const area=({figure,w,h}:{figure:Figure;w:number;h:number})=>{const m=figure.layout.margin;return {w:w*96/72-m.l-m.r,h:h*96/72-m.t-m.b,fixed:m.autoexpand===false};};
describe('Figure 1 panels are about square',()=>{
 it('A, B and every E violin have a plot area between 0.85 and 1.15 wide per high',async()=>{
  const {drawn}=await page1();expect(drawn).toHaveLength(8);
  for(const k of [0,1,4,5,6,7]){const a=area(drawn[k]);expect(a.fixed).toBe(true);expect(a.w/a.h).toBeGreaterThanOrEqual(.85);expect(a.w/a.h).toBeLessThanOrEqual(1.15);expect(a.w).toBeGreaterThan(80);}
 });
 it('C keeps its bars at least 0.6 high per wide',async()=>{
  const {drawn}=await page1(),c=area(drawn[2]);expect(c.fixed).toBe(true);expect(c.h/c.w).toBeGreaterThanOrEqual(.6);expect(c.h).toBeGreaterThan(60);
 });
 it('keeps title, Figure 1 and its legend on page 1, every label at least 6 pt',async()=>{
  const {page,drawn}=await page1(),c=page.caption!;
  expect(c.y+c.lines.length*c.lineHeight).toBeLessThanOrEqual(A4[1]-34+1e-6);
  expect(Math.min(...page.items.map(i=>i.y))).toBeGreaterThan(page.titleBlock!.y+page.titleBlock!.height);
  for(const l of page.legends??[]){expect(l.fontSize).toBeGreaterThanOrEqual(6);for(const e of l.entries)expect(e.y).toBeLessThan(c.y);}
  // Text in the panels: 8 px is 6 pt on the page.
  const sizes=(f:Figure)=>Object.entries(f.layout).filter(([k])=>/^[xy]axis\d*$/.test(k)).flatMap(([,a])=>[a.tickfont?.size,a.title?.font?.size]).filter((v):v is number=>typeof v==='number');
  for(const d of drawn)for(const s of sizes(d.figure))expect(s).toBeGreaterThanOrEqual(8);
  expect(c.fontSize).toBeGreaterThanOrEqual(6);
 });
 it('lists every group and every class in legends the page draws, columns apart',async()=>{
  const {page}=await page1(),legends=page.legends!;
  expect(legends.find(l=>l.nodeId==='pca')!.entries.map(e=>e.label)).toEqual(groups);
  expect(legends.find(l=>l.nodeId==='comp')!.entries.map(e=>e.label).sort()).toEqual([...classes].sort());
  for(const l of legends){const xs=[...new Set(l.entries.map(e=>e.x))].sort((a,b)=>a-b);
   for(const e of l.entries){const next=xs.find(x=>x>e.x);if(next!==undefined)expect(e.x+l.dot+4+e.label.length*l.fontSize*.55).toBeLessThanOrEqual(next);}}
 });
});
