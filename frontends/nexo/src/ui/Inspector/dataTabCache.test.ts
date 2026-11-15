import { it, expect } from 'vitest';
import { cacheSchema, cachedSchema } from './schemaCache';

// UX review 2, group 2: a Data form cached before another person's change (or a restore) came back with the old values
// when the card was selected again, and its next change sent them back to the engine.
it("a card's inputs restored on the server drop the cached Data forms", async () => {
  (globalThis as { window?: EventTarget }).window ??= new EventTarget();
  await import('./DataTab');
  cacheSchema('s/violin', { controls: [{ id: 'violin_lipid', type: 'select', label: 'Choose a lipid', value: 'PC(16:0/16:1)' }] } as never);
  window.dispatchEvent(new CustomEvent('nexo-inputs-restored', { detail: 'violin-1' }));
  expect(cachedSchema('s/violin')).toBeUndefined();
});
