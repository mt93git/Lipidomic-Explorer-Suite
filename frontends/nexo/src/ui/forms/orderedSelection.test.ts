import { describe, expect, it } from 'vitest';
import { moveOrderedItem } from './orderedSelection';
import { coerceValue, diffInputs, isOrderedMultiSelect } from './schemaForm';

describe('ordered multi-select', () => {
  it('moves without mutating, and ignores invalid moves', () => {
    const original = ['condition', 'time', 'sex'];
    expect(moveOrderedItem(original, 1, 0)).toEqual(['time', 'condition', 'sex']);
    expect(moveOrderedItem(original, 0, 2)).toEqual(['time', 'sex', 'condition']);
    expect(moveOrderedItem(original, 0, -1)).toEqual(original);
    expect(moveOrderedItem(original, 3, 0)).toEqual(original);
    expect(original).toEqual(['condition', 'time', 'sex']);
  });
  it('detects Team labels and selectize drag_drop metadata only on multi-selects', () => {
    const c = { id: 'group', type: 'multiselect' as const, label: 'Primary Grouping (Order matters)' };
    expect(isOrderedMultiSelect(c)).toBe(true);
    expect(isOrderedMultiSelect({...c, label: 'Grouping', selectize: {plugins: ['drag_drop']}})).toBe(true);
    expect(isOrderedMultiSelect({...c, label: 'Grouping', plugins: ['drag_drop']})).toBe(true);
    expect(isOrderedMultiSelect({...c, label: 'Grouping'})).toBe(false);
    expect(isOrderedMultiSelect({...c, type: 'select', multiple: false})).toBe(false);
  });
  it('serializes the user hierarchy into a patch without sorting', () => {
    const c = {id: 'group', type: 'multiselect' as const, label: 'Grouping'};
    const next = coerceValue(c, moveOrderedItem(['condition', 'time'], 1, 0));
    expect(JSON.stringify(diffInputs({group: ['condition', 'time']}, {group: next})))
      .toBe('{"group":["time","condition"]}');
    expect(coerceValue(c, [])).toEqual([]);
  });
});
