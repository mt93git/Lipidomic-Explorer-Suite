import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {figure1Figure,figure1Page,figure1Panels} from './figure1';
import {reportDate,titleBlock} from './report';
// Review 2026-11-24: panel B as one PCA score card per PCA cluster (up to three, side by side), panel C as two
// composition cards (major and minor classes, stacked), and A's dots at least 18. Synthetic board.
const groups=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta'];
const colour=(i:number)=>`#${['4E79A7','F28E2B','E15759','76B7B2','59A14F','EDC948'][i]}`;
const node=(id:string,source:string,label:string):Node=>({id,kind:'plot',label,x:0,y:0,width:420,height:320,instance:{instanceId:id,source}});
const score=(gs:string[]):Figure=>({data:gs.map(g=>({type:'box',name:g,x:[g,g],y:[groups.indexOf(g),groups.indexOf(g)+1],marker:{color:colour(groups.indexOf(g))}})),layout:{xaxis:{type:'category',categoryorder:'array',categoryarray:gs},yaxis:{title:{text:'PC1 score (6.9% of variance)'}},shapes:[],annotations:[]}});
const comp=(classes:string[],hidden:string[]=[]):Figure=>({data:[...classes,...hidden].map((c,i)=>({type:'bar',name:c,x:groups,y:groups.map(()=>10),marker:{color:colour(i%6)},...(hidden.includes(c)?{visible:false}:{})})),layout:{yaxis:{title:{text:'Mean share of selected signal (%)'}}}});
const clusters:Record<string,string[]>={b1:['Alpha','Beta'],b2:['Gamma','Delta','Epsilon','Zeta'],b3:['Alpha','Zeta']};
const figures:Record<string,Figure>={
 pca:{data:groups.map((g,i)=>({type:'scatter',mode:'markers',name:g,x:[i],y:[i],marker:{color:colour(i),size:6}})),layout:{}},
 b1:score(clusters.b1),b2:score(clusters.b2),b3:score(clusters.b3),b4:score(groups),
 c1:comp(['SM','LPC','PE'],['TAG','DAG']),c2:comp(['PG','CE','PC','PS','PI','LPE','LPS','CL','LPA','LPG'],['TAG','DAG']),c3:comp(['SM']),
 heat:{data:[{type:'heatmap',x:groups,y:['L1','L2'],z:[groups.map(()=>0),groups.map(()=>1)]}],layout:{}},
 v:{data:groups.map((g,i)=>({type:'violin',name:g,x:[g,g],y:[i,i+1],fillcolor:colour(i)})),layout:{title:{text:'PC 30:0'}}}};
const cards=[node('pca','results_dashboard-plot_pca','Principal components'),
 node('b1','results_dashboard-plot_pcascore','Top-left cluster'),node('b2','results_dashboard-plot_pcascore','Top-right cluster'),node('b3','results_dashboard-plot_pcascore','Bottom cluster'),node('b4','results_dashboard-plot_pcascore','PCA score analysis'),
 node('c1','results_dashboard-plot_comp','Major lipid classes'),node('c2','results_dashboard-plot_comp','Minor lipid classes'),node('c3','results_dashboard-plot_comp','Composition overview'),
 node('heat','results_dashboard-plot_heat','Abundance heatmap'),...[1,2,3,4].map(i=>node(`v${i}`,'results_dashboard-plot_violin',`Feature ${i}`))];
async function build(){
 const drawn=new Map<string,{figure:Figure;w:number;h:number}>();let k=0;
 const page=(await figure1Page(cards,{source:async n=>({figure:figures[n.id.startsWith('v')?'v':n.id]}),render:async(figure,w,h)=>{drawn.set(String(k++),{figure,w,h});return 'data:image/png;base64,AA';},
  title:()=>titleBlock({title:'Synthetic',date:reportDate(new Date(2026,10,24))})}))!;
 return {page,drawn:[...drawn.values()]};
}
const cw=(A4[0]-68-12)/2;
describe('Figure 1 with several B and C cards',()=>{
 it('takes up to three PCA score cards for B and two composition cards for C, in canvas order',()=>{
  const p=figure1Panels(cards);
  expect(p.find(x=>x.role==='pcascore')!.nodes.map(n=>n.id)).toEqual(['b1','b2','b3']);
  expect(p.find(x=>x.role==='comp')!.nodes.map(n=>n.id)).toEqual(['c1','c2']);
  expect(p.map(x=>x.letter)).toEqual(['A','B','C','D','E']);
 });
 it('puts the three B cards side by side in the right column, each titled with its card name, the letter once',async()=>{
  const {page,drawn}=await build(),b=['b1','b2','b3'].map(id=>page.items.find(i=>i.node?.id===id)!);
  expect(b.map(i=>i.letter)).toEqual(['B',undefined,undefined]);
  for(let j=0;j<3;j++){expect(b[j].y).toBeCloseTo(b[0].y);expect(b[j].height).toBeCloseTo(b[0].height);expect(b[j].x).toBeGreaterThanOrEqual(34+cw);expect(b[j].x+b[j].width).toBeLessThanOrEqual(A4[0]-34+1e-6);if(j)expect(b[j].x).toBeGreaterThanOrEqual(b[j-1].x+b[j-1].width-1e-6);}
  const titles=drawn.filter(d=>d.figure.data[0]?.type==='box').map(d=>d.figure.layout.title?.text);
  expect(titles).toEqual(['Top-left cluster','Top-right cluster','Bottom cluster']);
  // Each B card has its own letters, from its own groups only.
  const xs=drawn.filter(d=>d.figure.data[0]?.type==='box').map(d=>d.figure.layout.annotations.filter((a:{xref?:string})=>a.xref==='x').map((a:{x:string})=>a.x));
  expect(xs).toEqual([clusters.b1,clusters.b2,clusters.b3]);
 });
 it('stacks the two C cards in the left column, each with its own legend of its visible classes and its name',async()=>{
  const {page,drawn}=await build(),[c1,c2]=['c1','c2'].map(id=>page.items.find(i=>i.node?.id===id)!);
  expect(c1.letter).toBe('C');expect(c2.letter).toBeUndefined();
  expect(c2.y).toBeGreaterThanOrEqual(c1.y+c1.height-1e-6);expect(c1.x).toBeCloseTo(c2.x);expect(c1.x+c1.width).toBeLessThanOrEqual(34+cw+1e-6);
  const l1=page.legends!.find(l=>l.nodeId==='c1')!,l2=page.legends!.find(l=>l.nodeId==='c2')!;
  expect(l1.entries.map(e=>e.label).sort()).toEqual(['LPC','PE','SM']);expect(l2.entries.map(e=>e.label).sort()).toEqual(['CE','CL','LPA','LPE','LPG','LPS','PC','PG','PI','PS']);
  expect(l1.y).toBeGreaterThanOrEqual(c1.y-1e-6);expect(l1.y).toBeLessThan(c2.y);expect(l2.y).toBeGreaterThanOrEqual(c2.y-1e-6);
  for(const [l,c] of [[l1,c1],[l2,c2]] as const)expect(l.x).toBeGreaterThanOrEqual(c.x+c.width-1e-6);
  expect(drawn.filter(d=>d.figure.data[0]?.type==='bar').map(d=>d.figure.layout.title?.text)).toEqual(['Major lipid classes','Minor lipid classes']);
 });
 it('says in the legend which groups each B card compares and which classes each C card shows',async()=>{
  const {page}=await build(),text=page.caption!.paragraphs.join(' ');
  expect(text).toMatch(/Top-left cluster \(Alpha, Beta\)/);expect(text).toMatch(/Top-right cluster \(Gamma, Delta, Epsilon, Zeta\)/);expect(text).toMatch(/Bottom cluster \(Alpha, Zeta\)/);
  expect(text).toMatch(/Major lipid classes \(3 classes\)/);expect(text).toMatch(/Minor lipid classes \(10 classes\)/);
 });
 it('one B card and one C card keep their single-panel look (no title)',()=>{
  const b=figure1Figure('pcascore',figures.b4,new Map(),groups,{width:250,height:200});expect(b.layout.title).toBeUndefined();
  const c=figure1Figure('comp',figures.c3,new Map(),groups,{width:250,height:200});expect(c.layout.title).toBeUndefined();
 });
 it('draws A\'s dots at size 18 or more',()=>{
  const a=figure1Figure('pca',figures.pca,new Map(),groups,{width:200,height:200});
  for(const t of a.data)expect(t.marker.size).toBeGreaterThanOrEqual(18);
 });
});
