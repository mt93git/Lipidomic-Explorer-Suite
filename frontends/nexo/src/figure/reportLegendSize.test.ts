import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {figure1Figure,legendPlan} from './figure1';
import {reportBodyLayout} from './report';
// Staging review, report export: panel A's two legend columns overlapped (long group labels such as
// "Ecoli_Live (n = 7)" ran under the second column's markers) and squeezed the PCA; body cards came out about half the
// page wide. Synthetic labels and cards.
const labels=['Ecoli_Live (n = 7)','Ecoli_Heat (n = 7)','Saureus_Live (n = 6)','Saureus_Heat (n = 6)','Zymosan_Opsonized (n = 8)','Zymosan_Plain (n = 8)','Beads_IgG (n = 7)','Beads_Plain (n = 7)','Medium_Control (n = 9)','LPS_Primed (n = 7)'];
const text=(label:string,font:number)=>label.length*font*.55;
describe('Figure 1 legend columns',()=>{
 const sizes=[{width:257,height:190},{width:257,height:120},{width:200,height:300},{width:400,height:150}];
 it('sizes every column from its longest label so columns never overlap, and keeps the plot at least 55% of the panel',()=>{
  for(const size of sizes){
   const plan=legendPlan(labels,size),panel=size.width*96/72;
   expect(plan.plotWidthPx).toBeGreaterThanOrEqual(.55*panel);
   expect(plan.columns.flatMap(c=>c.labels).sort()).toEqual([...labels].sort());
   if(plan.mode==='right'){
    plan.columns.forEach((c,k)=>{expect(c.widthPx).toBeGreaterThanOrEqual(Math.max(...c.labels.map(l=>text(l,plan.font)))+30);
     if(k)expect(c.offsetPx).toBeGreaterThanOrEqual(plan.columns[k-1].offsetPx+plan.columns[k-1].widthPx);});
    expect(plan.marginRightPx).toBeGreaterThanOrEqual(plan.columns.reduce((s,c)=>s+c.widthPx,0));
   } else {
    // Below the plot: one horizontal legend whose entries are as wide as the longest label.
    expect(plan.entryWidthPx).toBeGreaterThanOrEqual(Math.max(...labels.map(l=>text(l,plan.font)))+30);
   }
  }
 });
 it('draws panel A with that plan: legend x positions apart by at least each column width',()=>{
  const colours=new Map(labels.map((l,i)=>[l,`#${String(i).repeat(6).slice(0,6)}`]));
  const pca:Figure={data:labels.map((g,i)=>({type:'scatter',mode:'markers',name:g,x:[i],y:[i],marker:{color:colours.get(g)}})),layout:{}};
  for(const size of sizes){
   const a=figure1Figure('pca',pca,colours,labels,size),plan=legendPlan(labels,size);
   expect(a.data.filter(t=>t.showlegend!==false).map(t=>t.name)).toEqual(labels);
   if(plan.mode==='right'){
    expect(a.layout.margin.r).toBeGreaterThanOrEqual(plan.marginRightPx);
    plan.columns.forEach((c,k)=>{const key=k?`legend${k+1}`:'legend';expect(a.layout[key].x).toBeCloseTo(1+c.offsetPx/plan.plotWidthPx);expect(a.data.filter(t=>(t.legend??'legend')===key).map(t=>t.name)).toEqual(c.labels);});
   } else {
    expect(a.layout.legend).toMatchObject({orientation:'h',yanchor:'top',entrywidthmode:'pixels'});expect(a.layout.legend.y).toBeLessThan(0);
    expect(a.data.every(t=>(t.legend??'legend')==='legend')).toBe(true);
   }
  }
 });
});
describe('report body cards fill the content width',()=>{
 const W=A4[0]-68,avail=A4[1]-68;
 const card=(id:string,w:number,h:number):Node=>({id,kind:'plot',label:id,x:0,y:0,width:w,height:h});
 it('scales each card to the content width (at least 70% when shrunk to fit), stacking as many as fit',()=>{
  const cards=[card('a',640,560),card('b',640,560),card('c',520,420),card('d',800,400),card('e',600,300),card('f',640,480)];
  const pages=reportBodyLayout(cards);
  for(const p of pages)for(const i of p.items){expect(i.width).toBeGreaterThanOrEqual(.7*W-1e-9);expect(i.x).toBeGreaterThanOrEqual(34-1e-9);expect(i.y+i.height).toBeLessThanOrEqual(A4[1]-34+1e-9);
   const n=cards.find(c=>c.id===i.node!.id)!;expect((i.height-16)/i.width).toBeCloseTo(n.height/n.width);}
  expect(pages.flatMap(p=>p.items).filter(i=>Math.abs(i.width-W)<1e-6).length).toBeGreaterThanOrEqual(4);
  // No page ends with more than a third empty when the next card would have fitted at 70% of the width.
  pages.slice(0,-1).forEach((p,k)=>{const used=Math.max(...p.items.map(i=>i.y+i.height))-34,free=avail-used-14,next=pages[k+1].items[0].node!;
   const at70=16+.7*W*next.height/next.width;expect(free>avail/3&&at70<=free).toBe(false);});
 });
 it('puts two narrow (tall) cards side by side, and a tall but wide card alone at full height',()=>{
  const pages=reportBodyLayout([card('t1',300,900),card('t2',300,900),card('heat',460,1100)]);
  expect(pages.map(p=>p.items.map(i=>i.node!.id))).toEqual([['t1','t2'],['heat']]);
  const [l,r]=pages[0].items;expect(l.y).toBe(r.y);expect(r.x).toBeGreaterThanOrEqual(l.x+l.width);expect(l.width).toBeLessThanOrEqual((W-12)/2+1e-9);
  const h=pages[1].items[0];expect(h.height).toBeCloseTo(avail);expect(h.x+h.width/2).toBeCloseTo(A4[0]/2);
 });
});
it('shortens the composition y title so it fits a short panel',()=>{
 const comp:Figure={data:[{type:'bar',name:'PC',x:['A'],y:[1]}],layout:{yaxis:{title:{text:'Mean share of selected signal (%)'}}}};
 expect(figure1Figure('comp',comp,new Map(),['A'],{width:257,height:160}).layout.yaxis.title.text).toBe('Mean share (%)');
});
