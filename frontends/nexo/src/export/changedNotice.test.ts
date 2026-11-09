import { expect, it } from 'vitest';
import type { Node } from '../api/types';
import { createExportReceipts } from './changedNotice';
const node: Node = {kind:'plot',id:'a',label:'A',x:0,y:0,width:440,height:330,instance:{source:'plot',inputs:{lipid:'A'}}};
it('warns once an exported plot changes and clears on re-export or undo', () => {
  const r=createExportReceipts(); expect(r.changed(node)).toBe(false); r.exported(node);
  expect(r.changed({...node,x:100,y:100})).toBe(false);
  const edited={...node,instance:{...node.instance!,inputs:{lipid:'B'}}};
  expect(r.changed(edited)).toBe(true); expect(r.changed(node)).toBe(false);
  r.exported(edited); expect(r.changed(edited)).toBe(false);
});
it('tracks each card separately, including presentation and size changes', () => {
  const r=createExportReceipts();r.exported(node);
  expect(r.changed({...node,width:800})).toBe(true);
  expect(r.changed({...node,visual:{plotTitle:'Updated'}})).toBe(true);
  expect(r.changed({...node,id:'copy',width:800})).toBe(false);
});
it('finishing an exported plot is not a change (b03-qc-b: the notice covered the finished plot title)', () => {
  const r=createExportReceipts();r.exported(node);
  expect(r.changed({...node,finished:{url:'blob:snapshot'}} as Node)).toBe(false);
});
