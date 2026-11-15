// The Data tab's card schemas, kept per "<session>/<instance>" so reopening the tab does not wait for the server.
// The Data tab remounts from here (another Inspector tab and back, another card and back), so a change the server
// confirmed is written into the cached values (chart audit round 2: a stale value was shown and sent back).
import type { CardSchema } from '../../api';
export const schemaCache = new Map<string, CardSchema>();
export const cachedSchema = (key: string): CardSchema | undefined => schemaCache.get(key);
export const cacheSchema = (key: string, schema: CardSchema): void => { schemaCache.set(key, schema); };
export function cacheInputs(key: string, inputs: Record<string, unknown>): void {
  const schema = schemaCache.get(key);
  if (!schema) return;
  schemaCache.set(key, {...schema, controls: schema.controls.map(c => c.id in inputs ? {...c, value: inputs[c.id]} as typeof c : c)});
}
