import {describe,it,expect} from 'vitest';
import {stagedAfter,canConfirm,canDiscard} from './StatisticsTab';
import {DEFAULT_SETTINGS} from '../../statistics/settings';
describe('statistics staging',()=>{
 it('keeps effect valid for the chosen test',()=>expect(stagedAfter({...DEFAULT_SETTINGS,effect:'hedges_g'},{test:'wilcoxon'}).effect).toBe('cliffs_delta'));
 it('requires policy, comparisons and changed settings',()=>{
 const staged={...DEFAULT_SETTINGS,comparisons:[{a:'Control',b:'Case'}]};
 expect(canConfirm(staged,null,{allowed:true})).toBe(true);
 expect(canConfirm(staged,staged,{allowed:true})).toBe(false);
 expect(canConfirm(staged,null,{allowed:false})).toBe(false);
 expect(canConfirm(DEFAULT_SETTINGS,null,{allowed:true})).toBe(false);
 });
});

it('discards only an analysis draft that differs from its baseline', () => {
 const baseline={...DEFAULT_SETTINGS,comparisons:[{a:'Control',b:'Case'}]};
 expect(canDiscard(baseline,baseline)).toBe(false);
 expect(canDiscard({...baseline,test:'wilcoxon'},baseline)).toBe(true);
});
