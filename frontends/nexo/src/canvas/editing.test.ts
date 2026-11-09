import { it, expect, describe } from 'vitest';
import { dragResult, keyboardNudge, duplicateNode } from './editing';
it('scales drag deltas, snaps and bypasses guides with Alt', () => {
 const n = {x:10,y:20,width:300,height:240};
 expect(dragResult(n,{x:400,y:0},2,[],false)).toEqual({x:210,y:20,guides:[]});
 const others = [{x:210,y:500,width:300,height:240}];
 expect(dragResult(n,{x:198,y:0},1,others,false).x).toBe(210);
 expect(dragResult(n,{x:198,y:0},1,others,true)).toEqual({x:208,y:20,guides:[]});
});
it('keyboard moves and resizes by 10 or Alt 1', () => {
 expect(keyboardNudge('ArrowRight',false,false)).toEqual({dx:10,dy:0,resize:false});
 expect(keyboardNudge('ArrowUp',true,true)).toEqual({dx:0,dy:-1,resize:true});
 expect(keyboardNudge('x',false,false)).toBeNull();
});
it('duplicates source and inputs independently with fresh instance and offset', () => {
 const node = {kind:'plot' as const,id:'results_dashboard-plot_pca',label:'PCA',x:10,y:20,width:300,height:240,instance:{source:'results_dashboard-plot_pca',inputs:{color_by:'Group1'}}};
 const copy = duplicateNode(node);
 expect(copy.id).toMatch(/^tcinstance_[0-9a-f]{12}-plot_pca$/);
 expect(copy.instance?.instanceId).toMatch(/^tcinstance_[0-9a-f]{12}$/);
 expect([copy.x,copy.y]).toEqual([34,44]);
 expect(copy.instance?.inputs).toEqual(node.instance.inputs);
 expect(copy.instance?.inputs).not.toBe(node.instance.inputs);
});

import { zoomShortcut } from './editing';
describe('zoomShortcut', () => {
  const key = (code: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ code, shiftKey: true, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it('maps Shift+1 to fit and Shift+0 to 100 %', () => {
    expect(zoomShortcut(key('Digit1'))).toBe('fit');
    expect(zoomShortcut(key('Digit0'))).toBe('reset');
    expect(zoomShortcut(key('Digit2'))).toBe('selection');
  });
  it('ignores the digits without Shift or with another modifier', () => {
    expect(zoomShortcut(key('Digit1', { shiftKey: false }))).toBeNull();
    expect(zoomShortcut(key('Digit0', { metaKey: true }))).toBeNull();
    expect(zoomShortcut(key('Digit2', { ctrlKey: true }))).toBeNull();
  });
});
