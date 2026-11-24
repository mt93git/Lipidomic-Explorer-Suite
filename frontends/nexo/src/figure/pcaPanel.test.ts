import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {figure1Figure,figure1Page} from './figure1';
import {reportDate,reportSummary,titleBlock} from './report';
// Staging, after PR #94: with its legend under the plot, panel A's PCA was a flat strip (~20% of the panel height),
// its markers huge and overlapping. Synthetic board: 10 groups with long labels, the full Figure 1 set of cards.
const labels=['Ecoli_Live (n = 7)','Ecoli_Heat (n = 7)','Saureus_Live (n = 6)','Saureus_Heat (n = 6)','Zymosan_Opsonized (n = 8)','Zymosan_Plain (n = 8)','Beads_IgG (n = 7)','Beads_Plain (n = 7)','Medium_Control (n = 9)','LPS_Primed (n = 7)'];
const colour=(i:number)=>`#${['1F77B4','FF7F0E','2CA02C','D62728','9467BD','8C564B','E377C2','7F7F7F','BCBD22','17BECF'][i]}`;
const pca:Figure={data:labels.map((g,i)=>({type:'scatter',mode:'markers',name:g,x:[i,i+1],y:[i,-i],marker:{color:colour(i),size:14}})),layout:{xaxis:{title:'PC1 (30.0%)'},yaxis:{title:'PC2 (10.0%)'}}};
const node=(id:string,source:string):Node=>({id,kind:'plot',label:id,x:0,y:0,width:420,height:320,instance:{instanceId:id,source}});
const cards=[node('pca','results_dashboard-plot_pca'),node('score','results_dashboard-plot_pcascore'),node('comp','results_dashboard-plot_comp'),node('heat','results_dashboard-plot_heat'),...[1,2,3,4].map(i=>node(`v${i}`,'results_dashboard-plot_violin'))];
const other:Figure={data:[{type:'scatter',mode:'markers',name:labels[0],x:[1],y:[1]}],layout:{}};
const build=()=>figure1Page(cards,{source:async n=>({figure:n.id==='pca'?pca:other}),render:async()=>'data:image/png;base64,AA',
 title:()=>titleBlock({title:'Synthetic board',date:reportDate(new Date(2026,10,23)),summary:reportSummary({samples:72,lipids:1622,groups:10})})});
describe('Figure 1 panel A',()=>{
 // Review 2026-11-24: the legend moved to the right of the plot (figure1Legibility.test.ts), so the PCA takes the
 // whole panel height and gives the height it saves to panel C.
 it('gives the PCA plot the whole panel height, with every group in a compact legend on its right',async()=>{
  const page=(await build())!,plot=page.items.find(i=>i.node?.id==='pca')!,legend=page.legends!.find(l=>l.nodeId==='pca')!;
  expect(legend.x).toBeGreaterThanOrEqual(plot.x+plot.width-1e-9);
  expect(legend.y).toBeGreaterThanOrEqual(plot.y-1e-9);expect(legend.y+legend.height).toBeLessThanOrEqual(plot.y+plot.height+1e-9);
  expect(legend.entries.map(e=>e.label)).toEqual(labels);expect(legend.entries.map(e=>e.color)).toEqual(labels.map((_,i)=>colour(i).toUpperCase()));
  // Columns sized by their longest label: no entry runs into the next column; all inside the left column of the page.
  const columns=[...new Set(legend.entries.map(e=>e.x))].sort((a,b)=>a-b),cw=(A4[0]-68-12)/2;
  for(const e of legend.entries){const next=columns.find(x=>x>e.x);const right=e.x+legend.dot+4+e.label.length*legend.fontSize*.55;
   if(next!==undefined)expect(right).toBeLessThanOrEqual(next);expect(right).toBeLessThanOrEqual(34+cw+1e-9);}
  expect(legend.rowHeight).toBeLessThanOrEqual(10);expect(legend.y+legend.height).toBeLessThanOrEqual(A4[1]-34);
  // The legend stays above row 2 (panels C and D).
  const below=page.items.filter(i=>i.node&&['comp','heat'].includes(i.node.id));expect(Math.min(...below.map(i=>i.y))).toBeGreaterThan(legend.y+legend.height);
 });
 it('draws sample markers about 6–7 pt across on the A4 page, the legend drawn by the page',()=>{
  const a=figure1Figure('pca',pca,new Map(labels.map((l,i)=>[l,colour(i)])),labels,{width:257,height:140});
  for(const t of a.data){expect(t.marker.size).toBeLessThanOrEqual(8);expect(t.marker.size).toBeGreaterThanOrEqual(7);}
  expect(a.layout.showlegend).toBe(false);
 });
});
