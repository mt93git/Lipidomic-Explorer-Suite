import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {figure1Figure,figure1Geometry,figure1Page,figure1Panels,groupColours} from './figure1';
// Synthetic cards and figures only: two groups, made-up lipids.
const node=(id:string,source?:string,label=id):Node=>({id,kind:'plot',label,x:0,y:0,width:300,height:300,...(source?{instance:{instanceId:id,source}}:{})});
const pca=node('results_dashboard-plot_pca'),score=node('tcinstance_s-plot_pcascore','results_dashboard-plot_pcascore'),comp=node('results_dashboard-plot_comp'),heat=node('tcinstance_h-plot_heat','results_dashboard-plot_heat');
const violins=[1,2,3,4,5].map(i=>node(`tcinstance_v${i}-plot_violin`,'results_dashboard-plot_violin',`Violin ${i}`));
const other=node('volcano_tab-volcanoPlot');
const COLOURS={Alpha:'#1F77B4',Beta:'#D62728'};
const figures:Record<string,Figure>={
 pca:{data:[{type:'scatter',mode:'markers',name:'Alpha',x:[-1,-2],y:[0,1],marker:{color:COLOURS.Alpha}},{type:'scatter',mode:'markers',name:'Beta',x:[1,2],y:[1,0],marker:{color:COLOURS.Beta}}],layout:{xaxis:{title:'PC1'},yaxis:{title:'PC2'}}},
 score:{data:[{type:'box',name:'Alpha',x:['Alpha','Alpha'],y:[-1,-2],fillcolor:'#AAAAAAA6',marker:{color:'#AAAAAA'},line:{color:'#000000'}},{type:'box',name:'Beta',x:['Beta','Beta'],y:[1,2],fillcolor:'#BBBBBBA6',marker:{color:'#BBBBBB'},line:{color:'#000000'}},
  {type:'scatter',mode:'markers',x:[0.04],y:[0.1],xaxis:'x2',yaxis:'y2',name:'Alpha',meta:{teamLegendProxy:true},marker:{color:'#AAAAAA'}}],
  layout:{xaxis:{type:'category',showticklabels:false},yaxis:{title:'PC1 score',domain:[0.28,1]},xaxis2:{domain:[0,1],visible:false},yaxis2:{domain:[0,0.28],visible:false},
   shapes:[{type:'path',path:'M 0,3 L 0,3.2 L 1,3.2 L 1,3',line:{color:'#000000'}}],annotations:[{x:0.5,y:3.3,text:'*',showarrow:false},{x:0.27,y:0.215,xref:'paper',yref:'paper',text:'<b>Group</b>',showarrow:false}]}},
 comp:{data:['PC','PE','TG'].map((c,i)=>({type:'bar',name:c,x:['Alpha','Beta'],y:[40-i,41-i],marker:{color:['#111111','#222222','#333333'][i]}})),layout:{barmode:'stack',showlegend:false,xaxis:{title:'Condition / cell type',type:'category'},yaxis:{title:'Mean share of selected signal (%)'}}},
 heat:{data:[{type:'heatmap',x:['Alpha','Beta'],y:['PC 16:0_18:1 synthetic','PE 18:0_20:4 synthetic','TG 52:2 synthetic'],z:[[-1,1],[0.5,-0.5],[-0.8,0.8]]}],layout:{yaxis:{tickvals:['PC 16:0_18:1 synthetic'],ticktext:['PC 16:0…']}}},
 violin:{data:[{type:'violin',name:'Beta',x:['Beta','Beta'],y:[3,4],fillcolor:'#999999',marker:{color:'#000000'}},{type:'violin',name:'Alpha',x:['Alpha','Alpha'],y:[1,2],fillcolor:'#888888',marker:{color:'#000000'}}],layout:{title:{text:'PC 16:0_18:1 synthetic'}}},
};
const roleOf=(n:Node)=>{const s=n.instance?.source??n.id;return s.endsWith('pcascore')?'score':s.endsWith('_pca')?'pca':s.endsWith('_comp')?'comp':s.endsWith('_heat')?'heat':'violin';};
const letters=(nodes:Node[])=>figure1Panels(nodes).map(p=>[p.letter,p.role,p.nodes.map(n=>n.id)]);
describe('Figure 1 panels',()=>{
 it('puts the dashboard cards into A to E, the first four violins in canvas order, and ignores other cards',()=>{
  expect(letters([...violins,other,heat,comp,score,pca])).toEqual([
   ['A','pca',[pca.id]],['B','pcascore',[score.id]],['C','comp',[comp.id]],['D','heat',[heat.id]],['E','violin',violins.slice(0,4).map(v=>v.id)]]);
 });
 it('leaves a missing card out and re-letters the rest in order',()=>{
  expect(letters([violins[0],heat,pca])).toEqual([['A','pca',[pca.id]],['B','heat',[heat.id]],['C','violin',[violins[0].id]]]);
  expect(letters([other])).toEqual([]);
 });
 it('lays the panels out on an A4 portrait page like the template, inside the margins',()=>{
  const g=figure1Geometry(figure1Panels([...violins,heat,comp,score,pca]));
  const [w,h]=A4,box=(r:string)=>g.find(s=>s.role===r)!;
  for(const s of g){expect(s.x).toBeGreaterThanOrEqual(28);expect(s.y).toBeGreaterThanOrEqual(28);expect(s.x+s.width).toBeLessThanOrEqual(w-28);expect(s.y+s.height).toBeLessThanOrEqual(h-28);}
  expect(box('pca').x).toBeLessThan(w/2);expect(box('pcascore').x).toBeGreaterThan(w/2);expect(box('pca').y).toBe(box('pcascore').y);
  expect(box('comp').x).toBe(box('pca').x);expect(box('heat').x).toBe(box('pcascore').x);
  const v=g.filter(s=>s.role==='violin');expect(v).toHaveLength(4);
  // D spans rows 2 and 3: from the top of C to the bottom of the violins.
  expect(box('heat').y).toBe(box('comp').y);expect(box('heat').y+box('heat').height).toBeCloseTo(Math.max(...v.map(s=>s.y+s.height)));
  // E is a 2×2 grid under C, in the left half.
  expect(new Set(v.map(s=>s.x)).size).toBe(2);expect(new Set(v.map(s=>s.y)).size).toBe(2);expect(Math.min(...v.map(s=>s.y))).toBeGreaterThan(box('comp').y+box('comp').height);
  expect(v.every(s=>s.x+s.width<=w/2)).toBe(true);
 });
});
describe('Figure 1 presentation',()=>{
 const colours=groupColours({pca:figures.pca,violin:[figures.violin],pcascore:figures.score});
 const order=['Alpha','Beta'];
 it('takes the group colours of the session palette from the PCA scores',()=>{expect(colours).toEqual(new Map([['Alpha','#1F77B4'],['Beta','#D62728']]));});
 it('changes presentation only: every data value stays as the card drew it',()=>{
  for(const [role,key] of [['pca','pca'],['pcascore','score'],['comp','comp'],['heat','heat'],['violin','violin']] as const){
   const out=figure1Figure(role,figures[key],colours,order,{width:300,height:260});
   const values=(f:Figure)=>f.data.filter(t=>!t.meta?.teamLegendProxy).map(t=>({x:t.x,y:t.y,z:t.z,type:t.type}));
   expect(values(out)).toEqual(values(figures[key]));
   expect(out.layout.paper_bgcolor).toBe('#ffffff');expect(out.layout.plot_bgcolor).toBe('#ffffff');
   expect(out.layout.xaxis).toMatchObject({showline:true,mirror:true,linecolor:'#000000'});
  }
 });
 it('draws the PCA legend on the right and the PCA score box plot without its table',()=>{
  // Staging, after PR #94: panel A's legend is drawn by the page under the plot (pcaPanel.test.ts), not by Plotly.
  const a=figure1Figure('pca',figures.pca,colours,order,{width:300,height:200});expect(a.layout.showlegend).toBe(false);
  const b=figure1Figure('pcascore',figures.score,colours,order,{width:300,height:200});
  expect(b.data.some(t=>t.xaxis==='x2'||t.meta?.teamLegendProxy)).toBe(false);expect(b.layout.xaxis2).toBeUndefined();expect(b.layout.yaxis.domain).toEqual([0,1]);
  expect(b.layout.annotations.map((a:{text:string})=>a.text)).toEqual(['*']);expect(b.layout.shapes).toHaveLength(1);
 });
 // Review 2026-11-24: C's class legend is drawn by the page on the right of the bars (squarePanels.test.ts).
 it('shows composition groups as coloured dots, its class legend left to the page',()=>{
  const c=figure1Figure('comp',figures.comp,colours,order,{width:300,height:200});
  expect(c.layout.showlegend).toBe(false);
  expect(c.layout.xaxis.tickvals).toEqual(['Alpha','Beta']);expect(c.layout.xaxis.ticktext.map((t:string)=>t.match(/#[0-9A-F]{6}/i)?.[0])).toEqual(['#1F77B4','#D62728']);
  expect(c.layout.xaxis.ticktext.join('')).not.toContain('Alpha');
 });
 it('labels every heatmap row with its full lipid name, with a Mean z-score colour bar and group dots under the columns',()=>{
  const d=figure1Figure('heat',figures.heat,colours,order,{width:300,height:500});
  expect(d.layout.yaxis.tickvals).toEqual(figures.heat.data[0].y);expect(d.layout.yaxis.ticktext).toEqual(figures.heat.data[0].y);
  expect(d.data[0].colorbar.title.text).toBe('Mean z-score');
  expect(d.layout.xaxis.ticktext.map((t:string)=>t.match(/#[0-9A-F]{6}/i)?.[0])).toEqual(['#1F77B4','#D62728']);
 });
 it('turns a square heatmap with groups as rows into lipids as rows, values unchanged',()=>{
  const square:Figure={data:[{type:'heatmap',x:['L1','L2','L3'],y:['Alpha','Beta'],z:[[1,2,3],[4,5,6]]}],layout:{meta:{teamHeatmap:{geometry:'square-horizontal'}}}};
  const d=figure1Figure('heat',square,colours,order,{width:300,height:300});
  expect(d.data[0].y).toEqual(['L1','L2','L3']);expect(d.data[0].x).toEqual(['Alpha','Beta']);expect(d.data[0].z).toEqual([[1,4],[2,5],[3,6]]);
 });
 it('gives each violin its lipid as title and the group order of panel A',()=>{
  const e=figure1Figure('violin',figures.violin,colours,order,{width:150,height:120});
  expect(e.layout.title.text).toBe('PC 16:0_18:1 synthetic');expect(e.layout.xaxis.categoryarray).toEqual(['Alpha','Beta']);
 });
 it('uses the same colour for each group in every panel',()=>{
  const seen=new Map<string,Set<string>>();const add=(g:string,c:string)=>{if(!seen.has(g))seen.set(g,new Set());seen.get(g)!.add(c.slice(0,7).toUpperCase());};
  for(const t of figure1Figure('pca',figures.pca,colours,order,{width:300,height:200}).data)add(t.name,t.marker.color);
  for(const t of figure1Figure('pcascore',figures.score,colours,order,{width:300,height:200}).data){add(t.name,t.fillcolor);add(t.name,t.marker.color);}
  for(const t of figure1Figure('violin',figures.violin,colours,order,{width:150,height:120}).data)add(t.name,t.fillcolor);
  for(const role of ['comp','heat'] as const){const ax=figure1Figure(role,figures[role],colours,order,{width:300,height:300}).layout.xaxis;ax.tickvals.forEach((g:string,i:number)=>add(g,ax.ticktext[i].match(/#[0-9A-F]{6}/i)![0]));}
  expect([...seen].map(([g,c])=>[g,[...c]])).toEqual([['Alpha',['#1F77B4']],['Beta',['#D62728']]]);
 });
});
describe('Figure 1 page',()=>{
 it('composes an A4 page from the live card figures, lettered A to E',async()=>{
  const rendered:string[]=[];
  const page=(await figure1Page([...violins,heat,comp,score,pca,other],{source:async n=>({figure:figures[roleOf(n)]}),render:async(f,w,h)=>{rendered.push(`${w}x${h}`);return `data:image/png;base64,${btoa(String(rendered.length))}`;}}))!;
  expect([page.width,page.height]).toEqual(A4);expect(page.items).toHaveLength(8);
  expect(page.items.map(i=>i.letter).filter(Boolean)).toEqual(['A','B','C','D','E']);
  expect(page.items.every(i=>i.image?.startsWith('data:image/png'))).toBe(true);
 });
 it('uses the card image when there is no live figure and leaves out a card with neither',async()=>{
  const page=(await figure1Page([pca,comp,heat],{source:async n=>n===pca?{url:'data:image/png;base64,AA'}:n===heat?{figure:figures.heat}:undefined,render:async()=>'data:image/png;base64,BB'}))!;
  expect(page.items.map(i=>[i.letter,i.image])).toEqual([['A','data:image/png;base64,AA'],['B','data:image/png;base64,BB']]);
  expect(await figure1Page([other],{source:async()=>undefined,render:async()=>''})).toBeNull();
 });
});
describe('Figure 1 legend',()=>{
 const scoreNode={...score,instance:{...score.instance!,inputs:{pcs_pc:'PC1',pcs_test:'rank',pcs_corr:'BH'}}};
 const pcaFig:Figure={...figures.pca,layout:{xaxis:{title:{text:'PC1 (41.2%)'}},yaxis:{title:'PC2 (18.5%)'}}};
 const source=async(n:Node)=>({figure:n===pca?pcaFig:figures[roleOf(n)]});
 const render=async()=>'data:image/png;base64,AA';
 it('sits under Figure 1 on page 1: a bold lead, then one paragraph per present panel, from each card\'s settings',async()=>{
  const page=(await figure1Page([...violins,heat,comp,scoreNode,pca],{source,render}))!;
  const legend=page.caption!;expect(legend.lead).toBe('Figure 1.');
  expect(legend.paragraphs.map(p=>p.slice(0,4))).toEqual(['(A) ','(B) ','(C) ','(D) ','(E) ']);
  expect(legend.paragraphs[0]).toContain('PC1 (41.2%)');expect(legend.paragraphs[0]).toContain('PC2 (18.5%)');
  expect(legend.paragraphs[1]).toContain('PC1');expect(legend.paragraphs[1]).toContain('Kruskal-Wallis');expect(legend.paragraphs[1]).toContain('Benjamini-Hochberg');
  expect(legend.paragraphs[2]).toContain('mean share of signal by lipid class');
  expect(legend.paragraphs[3]).toContain('3 most variable lipids');expect(legend.paragraphs[3]).toContain('z-score');
  expect(legend.paragraphs[4]).toContain('PC 16:0_18:1 synthetic');
  const bottom=Math.max(...page.items.map(i=>i.y+i.height));
  expect(legend.y).toBeGreaterThan(bottom);expect(legend.fontSize).toBeGreaterThanOrEqual(7);expect(legend.fontSize).toBeLessThanOrEqual(9);
  const [w,h]=A4;expect(legend.x).toBeGreaterThanOrEqual(28);expect(legend.x+legend.width).toBeLessThanOrEqual(w-28);
  expect(legend.y+legend.lines.length*legend.lineHeight).toBeLessThanOrEqual(h-28);
  // Wrapped to the page width: no line is longer than the legend box (estimated at 0.55 em per character).
  expect(legend.lines.every(l=>l.text.length*legend.fontSize*.55<=legend.width+1)).toBe(true);
 });
 it('re-letters the legend like the panels and shrinks the figure so a long legend still fits on page 1',async()=>{
  const page=(await figure1Page([heat,pca],{source,render}))!;expect(page.caption!.paragraphs.map(p=>p.slice(0,4))).toEqual(['(A) ','(B) ']);
  const many=Array.from({length:4},(_,i)=>({...violins[i],label:`Violin ${i}`}));
  const longTitle=(i:number):Figure=>({...figures.violin,layout:{title:{text:`TG ${50+i}:${i}_synthetic `.repeat(30)}}});
  const long=(await figure1Page([pca,score,comp,heat,...many],{source:async n=>n.id.includes('violin')?{figure:longTitle(many.findIndex(v=>v.id===n.id))}:source(n),render}))!;
  const short=(await figure1Page([pca,score,comp,heat,...many],{source,render}))!;
  const bottom=(p:typeof long)=>Math.max(...p.items.map(i=>i.y+i.height));
  expect(bottom(long)).toBeLessThan(bottom(short));
  const c=long.caption!;expect(c.y+c.lines.length*c.lineHeight).toBeLessThanOrEqual(A4[1]-28);expect(c.y).toBeGreaterThan(bottom(long));
 });
});
