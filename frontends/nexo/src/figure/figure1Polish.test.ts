import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {figure1Figure,figure1Geometry,figure1Page,figure1Panels,pcaLegend,roundNumbers,sideLegend} from './figure1';
import {reportBodyLayout} from './report';
// Staging review of a real report (10 groups, 21 lipid classes, 4 violins, a PCA score card with 45 brackets incl. ns).
// Synthetic stand-ins: 10 groups, 21 classes.
const groups=Array.from({length:10},(_,i)=>`Group ${String.fromCharCode(65+i)}`);
const colours=new Map(groups.map((g,i)=>[g,`#${(0x101010*(i+1)).toString(16).padStart(6,'0').slice(-6).toUpperCase()}`]));
const classes=Array.from({length:21},(_,i)=>`Class${i+1}`);
const legendEntries=(f:Figure)=>f.data.filter(t=>t.showlegend!==false&&t.name);
const capacity=(heightPt:number)=>Math.floor((heightPt*96/72-60)/19);
describe('Figure 1 legends show every entry',()=>{
 it('A lists all 10 groups in the legend the page draws under the plot, within the panel',()=>{
  const pca:Figure={data:groups.map((g,i)=>({type:'scatter',mode:'markers',name:g,x:[i],y:[i],marker:{color:colours.get(g)}})),layout:{xaxis:{title:'PC1 (30.0%)'},yaxis:{title:'PC2 (10.0%)'}}};
  const size={width:260,height:150},a=figure1Figure('pca',pca,colours,groups,size);
  expect(a.layout.showlegend).toBe(false);
  const legend=pcaLegend({nodeId:'p',x:34,y:100,...size},groups.map(g=>({label:g,color:colours.get(g)!})));
  expect(legend.entries.map(e=>e.label)).toEqual(groups);expect(legend.y+legend.height).toBeCloseTo(250);
  expect(legend.entries.every(e=>e.x>=34&&e.x+legend.dot+4+e.label.length*legend.fontSize*.55<=34+260)).toBe(true);
 });
 // Review 2026-11-24: C's classes are listed by the page on the right of its bars, in columns that never overlap.
 it('C lists all 21 classes in the legend the page draws on its right, columns apart',()=>{
  const comp:Figure={data:classes.map((c,i)=>({type:'bar',name:c,x:groups,y:groups.map(()=>i+1)})),layout:{barmode:'stack'}};
  expect(figure1Figure('comp',comp,colours,groups,{width:260,height:180}).layout.showlegend).toBe(false);
  const l=sideLegend('c',294,100,classes.map(c=>({label:c,color:'#111111'})),117);
  expect(l.entries.map(e=>e.label)).toEqual(classes);expect(l.x+l.width).toBeCloseTo(294);expect(l.width).toBeLessThanOrEqual(117);
  const xs=[...new Set(l.entries.map(e=>e.x))].sort((p,q)=>p-q);for(const e of l.entries){const next=xs.find(x=>x>e.x);if(next!==undefined)expect(e.x+l.dot+4+e.label.length*l.fontSize*.55).toBeLessThanOrEqual(next);}
 });

});
describe('Figure 1 panel B keeps only significant brackets',()=>{
 const pairs=[['Group A','Group B','*'],['Group A','Group C','ns'],['Group B','Group C','***'],['Group A','Group D','ns']];
 const lev=['Group A','Group B','Group C','Group D'];
 const score=(stars:string[][]):Figure=>({data:lev.map((g,i)=>({type:'box',name:g,x:[g,g],y:[i,i+1],marker:{color:'#111111'}})),layout:{yaxis:{range:[-1,20]},
  shapes:stars.map(([a,b],i)=>{const x1=lev.indexOf(a),x2=lev.indexOf(b),y0=4+.6*i,y1=y0+.1;return {type:'path',path:`M ${x1},${y0} L ${x1},${y1} L ${x2},${y1} L ${x2},${y0}`,line:{color:'#000000'}};}),
  annotations:stars.map(([a,b,s],i)=>({x:(lev.indexOf(a)+lev.indexOf(b))/2,y:4+.6*i+.1,text:s,showarrow:false}))}});
 it('drops ns brackets and labels, keeps the starred ones, and tightens the y range to them',()=>{
  const b=figure1Figure('pcascore',score(pairs),colours,groups,{width:260,height:150});
  expect(b.layout.annotations.map((a:{text:string})=>a.text)).toEqual(['*','***']);expect(b.layout.shapes).toHaveLength(2);
  const tops=b.layout.annotations.map((a:{y:number})=>a.y),top=Math.max(...tops);
  expect(b.layout.yaxis.range[1]).toBeGreaterThan(top);expect(b.layout.yaxis.range[1]).toBeLessThan(20);
  // Each remaining bracket keeps its label right on it.
  b.layout.shapes.forEach((s:{path:string},i:number)=>{const y1=Number(s.path.split(' L ')[1].split(',')[1]);expect(b.layout.annotations[i].y).toBeCloseTo(y1);});
 });
 it('draws no bracket when none is significant',()=>{
  const b=figure1Figure('pcascore',score(pairs.filter(p=>p[2]==='ns')),colours,groups,{width:260,height:150});
  expect(b.layout.annotations).toEqual([]);expect(b.layout.shapes).toEqual([]);expect(b.layout.yaxis.range[1]).toBeLessThan(5);
 });
});
describe('Figure 1 panel E violins',()=>{
 const violin:Figure={data:groups.map((g,i)=>({type:'violin',name:g,x:[g,g],y:[i,i+1],fillcolor:colours.get(g)})),layout:{title:{text:'PC 30:0 synthetic'},yaxis:{title:{text:'log10 prepared abundance'},range:[-3,12]},
  annotations:groups.map((g,i)=>({name:`tcstat-n-${i}`,xref:'x',yref:'y',x:i,y:-1,text:'n = 18 samples'}))}};
 it('has no n labels, a short y title, and readable group labels',()=>{
  const e=figure1Figure('violin',violin,colours,groups,{width:120,height:150});
  expect((e.layout.annotations??[]).filter((a:{name?:string;text?:string})=>/^tcstat-n-/.test(a.name??'')||/^n = /.test(a.text??''))).toEqual([]);
  expect(e.layout.yaxis.title.text).toBe('log10 abundance');expect(e.layout.yaxis.automargin).toBe(true);
  // Ten groups in a narrow violin: names as group dots (as in C and D), or names turned -45°.
  const ax=e.layout.xaxis;expect(ax.ticktext?.every((t:string)=>t.includes('●'))||ax.tickangle===-45).toBe(true);
  expect(e.layout.yaxis.range).toBeUndefined();
 });
 it('fills its 2×2 block and Figure 1 uses the free page height',()=>{
  const node=(id:string,source:string):Node=>({id,kind:'plot',label:id,x:0,y:0,width:300,height:300,instance:{instanceId:id,source}});
  const panels=figure1Panels([node('p','results_dashboard-plot_pca'),node('s','results_dashboard-plot_pcascore'),node('c','results_dashboard-plot_comp'),node('h','results_dashboard-plot_heat'),...[1,2,3,4].map(i=>node(`v${i}`,'results_dashboard-plot_violin'))]);
  const reserve=120,g=figure1Geometry(panels,reserve),bottom=Math.max(...g.map(s=>s.y+s.height));
  expect(bottom).toBeCloseTo(A4[1]-34-reserve,0);
  const v=g.filter(s=>s.role==='violin');expect(Math.min(...v.map(s=>s.height))).toBeGreaterThan(110);
 });
});
describe('legend numbers',()=>{
 it('rounds every long number the legend prints',()=>{
  expect(roundNumbers('from -2.98765432 to 2.98765432, PC1 (41.23456%)')).toBe('from −2.99 to 2.99, PC1 (41.2%)');
  expect(roundNumbers('25 most variable lipids, 1.5 fold')).toBe('25 most variable lipids, 1.5 fold');
 });
 it('says the heatmap scale with one decimal and a real minus sign',async()=>{
  const node=(id:string,source:string):Node=>({id,kind:'plot',label:id,x:0,y:0,width:300,height:300,instance:{instanceId:id,source}});
  const heat:Figure={data:[{type:'heatmap',x:['Group A','Group B'],y:['L1','L2'],z:[[1,-1],[-1,1]],zmin:-2.9876,zmax:2.9876}],layout:{}};
  const page=(await figure1Page([node('h','results_dashboard-plot_heat')],{source:async()=>({figure:heat}),render:async()=>'data:image/png;base64,AA'}))!;
  expect(page.caption!.paragraphs[0]).toContain('Mean z-score from −3.0 to 3.0');
  expect(page.caption!.paragraphs.join(' ')).not.toMatch(/\d\.\d{3,}/);
 });
});
describe('report body packing',()=>{
 const card=(id:string,w:number,h:number):Node=>({id,kind:'plot',label:id,x:0,y:0,width:w,height:h});
 // Staging review 2 (2026-11-23): cards at half the page width wasted the page; each card now takes the content width.
 it('keeps every card at 70% of the content width or more, a very tall card alone at the page height',()=>{
  const pages=reportBodyLayout([card('a',640,560),card('b',640,560),card('c',520,420),card('heat',460,1100),card('d',640,560)]);
  expect(pages.find(p=>p.items.some(i=>i.node!.id==='heat'))!.items).toHaveLength(1);
  for(const p of pages)for(const i of p.items){expect(i.y+i.height).toBeLessThanOrEqual(A4[1]-34+1e-9);if(i.node!.id!=='heat')expect(i.width).toBeGreaterThanOrEqual(.7*(A4[0]-68)-1e-9);}
 });
});
it('keeps the p thresholds the legend states as written',()=>{
 expect(roundNumbers('* p < 0.05, ** p < 0.01, *** p < 0.001')).toBe('* p < 0.05, ** p < 0.01, *** p < 0.001');
 expect(roundNumbers('p = 0.000123456')).toBe('p = 0.00012');
});
