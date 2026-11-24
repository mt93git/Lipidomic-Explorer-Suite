import {describe,expect,it} from 'vitest';
import type {Node} from '../api';
import type {Figure} from '../editor/applyEditor';
import {A4} from './a4Pdf';
import {figure1Figure} from './figure1';
import {reportBodyLayout} from './report';
// Staging review, report export: panel A's two legend columns overlapped (long group labels such as
// "Ecoli_Live (n = 7)" ran under the second column's markers) and squeezed the PCA; body cards came out about half the
// page wide. Synthetic labels and cards.
// The Plotly legend-column plan these tests covered was replaced on 2026-11-24 by legends the page draws itself
// (pcaPanel.test.ts, squarePanels.test.ts check their columns never overlap).
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
