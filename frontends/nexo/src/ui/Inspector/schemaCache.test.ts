import { it, expect } from 'vitest';
import { cachedSchema, cacheSchema, cacheInputs } from './schemaCache';

// Chart audit round 2 (b11 pathwayVisNetwork): the Data tab remounts from a schema cached when it was first read.
// A change the server confirmed (PATCH reply) was never written back, so after Appearance → Data the form showed the
// old value and its next submit sent it back to the server (node_color_map fc → sat_zscore).
it('a confirmed PATCH updates the cached schema values the Data tab remounts from', () => {
  cacheSchema('s/i', { controls: [{ id: 'node_color_map', type: 'select', label: 'Map Node Color to', value: 'sat_zscore' },
    { id: 'move_x', type: 'number', label: 'X Position:', value: 0 }], actions: [], tabs: {} } as never);
  cacheInputs('s/i', { node_color_map: 'fc', move_x: 123, unknown_input: 1 });
  const controls = cachedSchema('s/i')!.controls as { id: string; value: unknown }[];
  expect(controls.map(c => [c.id, c.value])).toEqual([['node_color_map', 'fc'], ['move_x', 123]]);
});

it('inputs for a card whose schema is not cached change nothing', () => {
  cacheInputs('s/other', { node_color_map: 'fc' });
  expect(cachedSchema('s/other')).toBeUndefined();
});
