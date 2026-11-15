import { expect, it } from 'vitest';
import { conditionVisible, analysisReducer } from './analysisDraft';
import { diffInputs } from './forms/schemaForm';
import { analysisGeneration, invalidateAnalysis } from '../analysisGeneration';
it('evaluates string and boolean conditions; unknown expressions stay visible', () => {
 expect(conditionVisible("input.mode == 'direct'", {mode:'direct'})).toBe(true);
 expect(conditionVisible("input.mode == 'direct'", {mode:'interaction'})).toBe(false);
 expect(conditionVisible('input.on == true', {on:true})).toBe(true);
 expect(conditionVisible('input.on == false', {on:true})).toBe(false);
 expect(conditionVisible('input.on == false', {on:false})).toBe(true);
 expect(conditionVisible('input.on > 2', {})).toBe(true);
 expect(conditionVisible(null, {})).toBe(true);
});
it('diffs only changed settings and compares ranges by value', () => {
 expect(diffInputs({range:[1,3], cutoff:1}, {range:[1,3],cutoff:2})).toEqual({cutoff:2});
});
it('discards to applied values and applies a new baseline', () => {
 const initial={applied:{cutoff:1},draft:{cutoff:1}};
 const changed=analysisReducer(initial,{type:'change',inputs:{cutoff:2}});
 expect(analysisReducer(changed,{type:'discard'})).toEqual(initial);
 expect(analysisReducer(changed,{type:'apply',inputs:{cutoff:2}})).toEqual({applied:{cutoff:2},draft:{cutoff:2}});
});
it('invalidates only the applied session generation', () => {
 const before=analysisGeneration('a');invalidateAnalysis('a');
 expect(analysisGeneration('a')).toBe(before+1);expect(analysisGeneration('b')).toBe(0);
});
