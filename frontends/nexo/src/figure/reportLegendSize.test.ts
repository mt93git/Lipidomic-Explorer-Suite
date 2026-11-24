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
 // Review 2026-11-24: two cards per page (pages 2 onward), each at the content width in half the page.
 it('gives every card the content width and fills each page with two of them',()=>{
  const cards=[card('a',640,560),card('b',640,560),card('c',520,420),card('d',800,400),card('e',600,300),card('f',640,480)];
  const pages=reportBodyLayout(cards);expect(pages.map(p=>p.items.length)).toEqual([2,2,2]);
  for(const p of pages){for(const i of p.items){expect(i.width).toBeCloseTo(W);expect(i.x).toBeCloseTo(34);expect(i.y+i.height).toBeLessThanOrEqual(A4[1]-34+1e-9);}
   const used=Math.max(...p.items.map(i=>i.y+i.height))-34;expect(used).toBeCloseTo(avail);}
 });
 it('puts tall cards two to a page too, one above the other',()=>{
  const pages=reportBodyLayout([card('t1',300,900),card('t2',300,900),card('heat',460,1100)]);
  expect(pages.map(p=>p.items.map(i=>i.node!.id))).toEqual([['t1','t2'],['heat']]);
  const [a,b]=pages[0].items;expect(b.y).toBeGreaterThanOrEqual(a.y+a.height);expect(a.width).toBeCloseTo(W);
 });
});
it('shortens the composition y title so it fits a short panel',()=>{
 const comp:Figure={data:[{type:'bar',name:'PC',x:['A'],y:[1]}],layout:{yaxis:{title:{text:'Mean share of selected signal (%)'}}}};
 expect(figure1Figure('comp',comp,new Map(),['A'],{width:257,height:160}).layout.yaxis.title.text).toBe('Mean share (%)');
});
