import { expect, it } from 'vitest';
import { needsStudyDesign, enlargedHeatmap } from './cardActions';
import type { Node, CatalogEntry } from '../api/types';
const node: Node = {kind:'plot',id:'copy-volcano',label:'Volcano',x:0,y:0,width:440,height:330,instance:{source:'volcano'}};
const catalog = [{id:'volcano',output:'volcano',needs:'de'}] as CatalogEntry[];
it('offers study design only for a gated differential plot', () => {
  expect(needsStudyDesign(node,catalog)).toBe(true);
  expect(needsStudyDesign(node,catalog,{allowed:true,confirmed:true,type:'independent',unit:'Animal'})).toBe(false);
  expect(needsStudyDesign({...node,kind:'illustration'},catalog)).toBe(false);
  expect(needsStudyDesign({...node,instance:undefined,id:'other'},catalog)).toBe(false);
});
it('enlarges heatmaps to Team’s readable minimum without shrinking larger cards', () => {
  expect(enlargedHeatmap(node)).toEqual({width:1000,height:1100});
  expect(enlargedHeatmap({...node,width:1500,height:1400})).toEqual({width:1500,height:1400});
});
