import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {compactLetters,figure1Caption,figure1Figure,figure1Page,figure1Panels} from './figure1';
import {initialDocument,syncDocument} from './model';
import {buildReport,reportBodyLayout,reportDate,reportSummary,titleBlock} from './report';
// Review of the 24 November 2026 report: B's 45 brackets were unreadable, C too short, E's violins lost behind their
// dots, A's legend under the plot took the height C needed, and body pages held one plot each. Synthetic board.
const groups=['Alpha (n = 6)','Beta (n = 6)','Gamma_Long_Label (n = 6)','Delta (n = 6)','Epsilon (n = 6)','Zeta (n = 6)','Eta (n = 6)','Theta (n = 6)','Iota (n = 6)','Kappa_Control (n = 18)'];
const colour=(i:number)=>`#${['4E79A7','F28E2B','E15759','76B7B2','59A14F','EDC948','B07AA1','FF9DA7','9C755F','BAB0AC'][i]}`;
const colours=new Map(groups.map((g,i)=>[g,colour(i)]));
const node=(id:string,source:string,label=id):Node=>({id,kind:'plot',label,x:0,y:0,width:420,height:320,instance:{instanceId:id,source}});

describe('Figure 1 panel B: compact letters instead of brackets',()=>{
 const lev=['A','B','C','D'];
 const score=(pairs:string[][]):Figure=>({data:lev.map((g,i)=>({type:'box',name:g,x:[g,g],y:[i,i+1],marker:{color:'#111111'}})),layout:{xaxis:{type:'category',categoryorder:'array',categoryarray:lev},yaxis:{range:[-1,20]},
  shapes:pairs.map(([a,b],i)=>{const x1=lev.indexOf(a),x2=lev.indexOf(b),y0=4+.6*i,y1=y0+.1;return {type:'path',path:`M ${x1},${y0} L ${x1},${y1} L ${x2},${y1} L ${x2},${y0}`,line:{color:'#000000'}};}),
  annotations:pairs.map(([a,b,s],i)=>({x:(lev.indexOf(a)+lev.indexOf(b))/2,y:4+.6*i+.1,text:s,showarrow:false}))}});
 it('finds the letters: groups that share one do not differ',()=>{
  expect(compactLetters(lev,[['A','B'],['B','C']])).toEqual(new Map([['A','a'],['B','b'],['C','a'],['D','ab']]));
  expect(compactLetters(lev,[])).toEqual(new Map(lev.map(g=>[g,'a'])));
  // Every significant pair shares no letter; every other pair shares one.
  const sig=[['A','B'],['A','C'],['B','D']],l=compactLetters(lev,sig);
  for(const a of lev)for(const b of lev)if(a<b){const share=[...l.get(a)!].some(c=>l.get(b)!.includes(c)),isSig=sig.some(p=>p.includes(a)&&p.includes(b));expect(share).toBe(!isSig);}
 });
 it('draws one letter label above each box and no bracket',()=>{
  const b=figure1Figure('pcascore',score([['A','B','*'],['A','C','ns'],['B','C','***'],['A','D','ns'],['B','D','ns'],['C','D','ns']]),new Map(),lev,{width:260,height:200});
  expect(b.layout.shapes).toEqual([]);
  const labels=Object.fromEntries(b.layout.annotations.map((a:{x:string;text:string})=>[a.x,a.text]));
  expect(labels).toEqual({A:'a',B:'b',C:'a',D:'ab'});
  const ys=b.layout.annotations.map((a:{y:number})=>a.y);expect(Math.min(...ys)).toBeGreaterThan(4);expect(b.layout.yaxis.range[1]).toBeGreaterThan(Math.max(...ys));expect(b.layout.yaxis.range[1]).toBeLessThan(8);
 });
 it('says how to read the letters in the legend',()=>{
  const p=figure1Panels([node('s','results_dashboard-plot_pcascore')]);
  const text=figure1Caption(p,new Map()).paragraphs[0];
  expect(text).toMatch(/share a letter/);expect(text).not.toMatch(/bracket/);
 });
});

describe('Figure 1 page layout',()=>{
 const classes=['SM','DAG','TAG','PC','PE','LPC','PS','PI','PA','CER'];
 const figures:Record<string,Figure>={
  pca:{data:groups.map((g,i)=>({type:'scatter',mode:'markers',name:g,x:[i],y:[i],marker:{color:colour(i)}})),layout:{}},
  score:{data:groups.map((g,i)=>({type:'box',name:g,x:[g],y:[i],marker:{color:colour(i)}})),layout:{}},
  // TAG and DAG turned off in the card (Team keeps hidden classes as invisible traces).
  comp:{data:classes.map((c,i)=>({type:'bar',name:c,x:groups,y:groups.map(()=>10),marker:{color:colour(i)},...(c==='TAG'||c==='DAG'?{visible:false}:{})})),layout:{}},
  heat:{data:[{type:'heatmap',x:groups,y:['L1','L2'],z:[groups.map(()=>0),groups.map(()=>1)]}],layout:{}},
  violin:{data:groups.map((g,i)=>({type:'violin',name:g,x:[g,g],y:[i,i+1],fillcolor:colour(i),marker:{color:'#ffffff',size:6}})),layout:{title:{text:'PC 30:0'}}}};
 const cards=[node('pca','results_dashboard-plot_pca'),node('score','results_dashboard-plot_pcascore'),node('comp','results_dashboard-plot_comp'),node('heat','results_dashboard-plot_heat'),...[1,2,3,4].map(i=>node(`v${i}`,'results_dashboard-plot_violin'))];
 const build=async()=>{const drawn=new Map<string,{figure:Figure;w:number;h:number}>();
  const page=(await figure1Page(cards,{source:async n=>({figure:figures[n.id.startsWith('v')?'violin':n.id]}),render:async(figure,w,h)=>{drawn.set(drawn.size+':'+(figure.data[0]?.type??''),{figure,w,h});return 'data:image/png;base64,AA';},
   title:()=>titleBlock({title:'Synthetic',date:reportDate(new Date(2026,10,24)),summary:reportSummary({samples:72,lipids:2208,groups:10})})}))!;
  return {page,drawn};};
 it('puts A\'s group legend on the right of the PCA, inside A\'s column',async()=>{
  const {page}=await build(),plot=page.items.find(i=>i.node?.id==='pca')!,legend=page.legends!.find(l=>l.nodeId==='pca')!;
  expect(legend.x).toBeGreaterThanOrEqual(plot.x+plot.width-1e-9);
  expect(legend.y).toBeGreaterThanOrEqual(plot.y-1e-9);expect(legend.y+legend.height).toBeLessThanOrEqual(plot.y+plot.height+1e-9);
  const cw=(A4[0]-68-12)/2;for(const e of legend.entries)expect(e.x+legend.dot+4+e.label.length*legend.fontSize*.55).toBeLessThanOrEqual(34+cw+1e-6);
  expect(legend.entries.map(e=>e.label)).toEqual(groups);expect(legend.fontSize).toBeGreaterThanOrEqual(6);
 });
 it('gives C a plot area at least as high as wide, and leaves turned-off classes out of its legend and the text',async()=>{
  const {page,drawn}=await build(),c=[...drawn.values()].find(d=>d.figure.data[0]?.type==='bar')!,m=c.figure.layout.margin;
  expect((c.h*96/72-m.t-m.b)/(c.w*96/72-m.l-m.r)).toBeGreaterThanOrEqual(1);
  const legend=page.legends!.find(l=>l.nodeId==='comp')!;expect(legend.entries.map(e=>e.label).sort()).toEqual(classes.filter(c=>c!=='TAG'&&c!=='DAG').sort());
  expect(page.caption!.paragraphs.join(' ')).toMatch(/8 classes/);
 });
 it('draws E\'s violins wide with small dots',()=>{
  const e=figure1Figure('violin',figures.violin,colours,groups,{width:120,height:120});
  for(const t of e.data){expect(t.width).toBeGreaterThanOrEqual(.8);expect(t.marker.size).toBeLessThanOrEqual(3);}
  expect(e.layout.violingap).toBeLessThanOrEqual(.1);
 });
});

describe('report body: two plots per page',()=>{
 const W=A4[0]-68;
 it('stacks the cards two to a page, each the full content width and half the page',()=>{
  const nodes=[node('a','x-a'),{...node('b','x-b'),height:2400},{...node('c','x-c'),width:2000,height:200},node('d','x-d'),node('e','x-e')];
  const pages=reportBodyLayout(nodes);
  expect(pages.map(p=>p.items.length)).toEqual([2,2,1]);
  const half=(A4[1]-68-14)/2;
  for(const p of pages)p.items.forEach((i,k)=>{expect(i.width).toBeCloseTo(W);expect(i.height).toBeCloseTo(half);expect(i.y).toBeCloseTo(34+k*(half+14));});
 });
 it('renders each card at its half-page size',async()=>{
  const cards=[node('a','x-a'),node('b','x-b'),node('c','x-c')],sizes:number[][]=[];
  const fig:Figure={data:[{type:'scatter',x:[1],y:[1]}],layout:{}};
  const pages=await buildReport(syncDocument(initialDocument(),cards),cards,{source:async()=>({figure:fig}),title:()=>titleBlock({title:'S',date:'24 November 2026'}),render:async(_f,w,h)=>{sizes.push([w,h]);return 'data:image/png;base64,AA';}});
  expect(pages.slice(1).map(p=>p.items.length)).toEqual([2,1]);
  for(const [w,h] of sizes){expect(w).toBeCloseTo(W);expect(h).toBeCloseTo((A4[1]-68-14)/2-16);}
 });
});
