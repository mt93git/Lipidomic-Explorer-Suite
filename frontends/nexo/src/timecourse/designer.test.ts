import { describe, expect, it } from 'vitest';
import { addCohort, bucketsOf, isBucketControl, moveItem, removeItem, reorderItem } from './designer';
import type { SchemaControl } from '../api/types';

const options = ['SS1', 'SS2', 'PC1', 'PC2'].map(v => ({value: v, label: v}));
const controls = [
  {id: 'case_bucket_case_111', type: 'bucket', label: 'Timecourse 1', options, default: ['SS1', 'SS2'], computed: true},
  {id: 'case_bucket_case_222', type: 'bucket', label: 'Timecourse 2', options, default: ['PC1'], value: ['PC1', 'PC2'], computed: true},
  {id: 'plotHeight', type: 'number', label: 'Plot Height'},
] as unknown as SchemaControl[];

describe('time-course designer model (b10 F4)', () => {
  it('reads buckets in schema order, the live value before the rendered default, and the source cohorts', () => {
    expect(controls.filter(isBucketControl).map(c => c.id)).toEqual(['case_bucket_case_111', 'case_bucket_case_222']);
    const d = bucketsOf(controls, {});
    expect(d.source).toEqual(['SS1', 'SS2', 'PC1', 'PC2']);
    expect(d.buckets).toEqual([{id: 'case_bucket_case_111', label: 'Timecourse 1', items: ['SS1', 'SS2']}, {id: 'case_bucket_case_222', label: 'Timecourse 2', items: ['PC1', 'PC2']}]);
    expect(bucketsOf(controls, {case_bucket_case_111: ['SS2']}).buckets[0].items).toEqual(['SS2']);
  });
  it('moves an item to another bucket (removed from its own, appended to the target), as a drag would', () => {
    const {buckets} = bucketsOf(controls, {});
    expect(moveItem(buckets, 'case_bucket_case_111', 0, 'case_bucket_case_222')).toEqual({case_bucket_case_111: ['SS2'], case_bucket_case_222: ['PC1', 'PC2', 'SS1']});
    // An item the target already holds: no duplicate, nothing sent.
    expect(moveItem(bucketsOf(controls, {case_bucket_case_222: ['SS1']}).buckets, 'case_bucket_case_111', 0, 'case_bucket_case_222')).toEqual({});
    expect(moveItem(buckets, 'case_bucket_case_111', 0, 'case_bucket_case_111')).toEqual({});
  });
  it('adds a source cohort as a copy (the source bucket clones) and refuses duplicates', () => {
    const {buckets} = bucketsOf(controls, {});
    expect(addCohort(buckets, 'PC2', 'case_bucket_case_111')).toEqual({case_bucket_case_111: ['SS1', 'SS2', 'PC2']});
    expect(addCohort(buckets, 'SS1', 'case_bucket_case_111')).toEqual({});
  });
  it('removes one item and reorders within a bucket', () => {
    const {buckets} = bucketsOf(controls, {});
    expect(removeItem(buckets, 'case_bucket_case_222', 1)).toEqual({case_bucket_case_222: ['PC1']});
    expect(removeItem(buckets, 'case_bucket_case_222', 5)).toEqual({});
    expect(reorderItem(buckets, 'case_bucket_case_111', 1, -1)).toEqual({case_bucket_case_111: ['SS2', 'SS1']});
    expect(reorderItem(buckets, 'case_bucket_case_111', 0, -1)).toEqual({});
  });
  it('never mutates the buckets it was given', () => {
    const {buckets} = bucketsOf(controls, {}), copy = structuredClone(buckets);
    moveItem(buckets, 'case_bucket_case_111', 0, 'case_bucket_case_222'); removeItem(buckets, 'case_bucket_case_111', 0);
    expect(buckets).toEqual(copy);
  });
});
describe('designer re-sends press Generate Analysis', () => {
  it('only when buckets are among the inputs', async () => {
    const { designerActions } = await import('./designer');
    expect(designerActions({case_bucket_case_1: ['A']})).toEqual(['submit_longitudinal_btn']);
    expect(designerActions({customCol_A: '#000000'})).toEqual([]);
  });
});
