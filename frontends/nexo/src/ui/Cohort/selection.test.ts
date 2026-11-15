import { describe, expect, it } from 'vitest';
import { applyPayload, groupByClass, invert, selectAll, setClass, toggle } from './selection';
const available = [
 {lipid:'PC(16:0/18:1)',class:'PC'},{lipid:'PC(18:0/20:4)',class:'PC'},
 {lipid:'TG(52:2)',class:'TG'},{lipid:'TG(54:3)',class:'TG'},{lipid:'Cer(d18:1/16:0)',class:'Cer'}];
describe('targeted cohort selection', () => {
 it('groups by class and searches lipid names and classes', () => {
  expect(groupByClass(available,'').map(g=>[g.class,g.lipids.length])).toEqual([['Cer',1],['PC',2],['TG',2]]);
  expect(groupByClass(available,'18:0').map(g=>g.lipids)).toEqual([['PC(18:0/20:4)']]);
  expect(groupByClass(available,' tg ').map(g=>g.class)).toEqual(['TG']);
 });
 it('selects a class, toggles a lipid, and clears a class', () => {
  let s = setClass(new Set(), ['TG(52:2)','TG(54:3)'], true);
  expect([...s].sort()).toEqual(['TG(52:2)','TG(54:3)']);
  s = toggle(s,'TG(52:2)'); expect([...s]).toEqual(['TG(54:3)']);
  s = setClass(s, ['TG(52:2)','TG(54:3)'], false); expect(s.size).toBe(0);
 });
 it('select all and invert act on the visible lipids only', () => {
  const visible = groupByClass(available,'PC').flatMap(g=>g.lipids);
  const s = selectAll(new Set(['TG(52:2)']), visible);
  expect(s.size).toBe(3);
  expect([...invert(new Set(['PC(16:0/18:1)','TG(52:2)']), visible)].sort()).toEqual(['PC(18:0/20:4)','TG(52:2)']);
 });
 it('sends the selection in the available order, unknown names dropped', () => {
  expect(applyPayload(new Set(['TG(54:3)','PC(16:0/18:1)','Gone']), available)).toEqual(['PC(16:0/18:1)','TG(54:3)']);
  expect(applyPayload(new Set(), available)).toEqual([]);
 });
});
