import { describe, it, expect } from 'vitest';
import { controlsByGroup, coerceValue, diffInputs, splitLabel, isRangePair } from './schemaForm';
describe('schema forms', () => {
  it('groups in schema order', () => expect(Object.keys(controlsByGroup([{id:'a',type:'text',label:'A'},{id:'b',type:'text',label:'B',group:'Data'}]))).toEqual(['','Data']));
  it('coerces number', () => expect(coerceValue({id:'n',label:'N',type:'number'}, '3')).toBe(3));
  it('coerces range', () => expect(coerceValue({id:'n',label:'N',type:'range'}, '0.5')).toBe(.5));
  it('coerces boolean', () => expect(coerceValue({id:'b',label:'B',type:'boolean'}, 'false')).toBe(false));
  it('coerces multiselect', () => expect(coerceValue({id:'m',label:'M',type:'multiselect'}, 'a')).toEqual(['a']));
  it('diffs structured inputs', () => expect(diffInputs({a:[1],b:2},{a:[1],b:3})).toEqual({b:3}));
});
it('splitLabel keeps short labels and moves the help sentence out of long ones', () => {
  expect(splitLabel('Lipid')).toEqual(['Lipid', '']);
  // The real API schema has controls without a label (null): never throw (H8 live check).
  expect(splitLabel(null)).toEqual(['', '']);
  expect(splitLabel(undefined)).toEqual(['', '']);
  expect(splitLabel('Activate Column Annotation Adds color-coded bands above the heatmap')).toEqual(['Activate Column Annotation', 'Adds color-coded bands above the heatmap']);
  expect(splitLabel('Cluster rows. Reorders lipids by similarity.')).toEqual(['Cluster rows', 'Reorders lipids by similarity.']);
  expect(splitLabel('Scale: per row')).toEqual(['Scale', 'per row']);
});
describe('two-ended range sliders (Team sliderInput with value = c(lo, hi))', () => {
  const range = { id: 'gran_nC1', type: 'range', label: 'Chain Length Range', default: [16, 18], min: 10, max: 30 } as never;
  it('is recognised and keeps both ends as numbers', () => {
    expect(isRangePair(range)).toBe(true);
    expect(isRangePair({ id: 'n', type: 'range', default: 5 } as never)).toBe(false);
    expect(coerceValue(range, ['14', 20])).toEqual([14, 20]);
    expect(coerceValue(range, [22, 14])).toEqual([14, 22]);
  });
});
// Pilot round 2 (2026-11-08): Team builds some controls only once a checkbox is ticked (the 2D PCA's per-group colours
// after "Override sample colors", R/modules/2_qc_boxplot_module.R:809-818). The Data tab must re-read the schema
// after such a change, or the new controls never appear.
it('re-reads the schema after a checkbox or a choice, not after a plain value', async () => {
  const { schemaRefreshNeeded } = await import('./schemaForm') as unknown as { schemaRefreshNeeded?: (controls: import('../../api').SchemaControl[], patch: import('../../api').Inputs) => boolean };
  expect(typeof schemaRefreshNeeded).toBe('function');
  const controls: import('../../api').SchemaControl[] = [{id:'useCustomColors',type:'boolean',label:'Override sample colors in this QC tab?'}, {id:'dot',type:'number',label:'Dot size'},
    {id:'grouping',type:'select',label:'Grouping',options:[{value:'a',label:'a'},{value:'b',label:'b'}]}];
  expect(schemaRefreshNeeded!(controls, {useCustomColors:true})).toBe(true);
  expect(schemaRefreshNeeded!(controls, {grouping:'b'})).toBe(true);
  expect(schemaRefreshNeeded!(controls, {dot:3})).toBe(false);
});
