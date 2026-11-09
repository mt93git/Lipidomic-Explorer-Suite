/** Phase 1 view-only mode: phones (and ?mode=view links) can look, pan, zoom, inspect and export, never edit. */
export type ReadOnlyReason = 'device' | 'link' | null;
export interface ModeEnvironment { search: string; width: number; coarse: boolean }
const PHONE_WIDTH = 480;
export function decideMode({ search, width, coarse }: ModeEnvironment): { readOnly: boolean; reason: ReadOnlyReason } {
  const mode = new URLSearchParams(search).get('mode');
  if (mode === 'edit') return { readOnly: false, reason: null };
  if (mode === 'view') return { readOnly: true, reason: 'link' };
  return width <= PHONE_WIDTH && coarse ? { readOnly: true, reason: 'device' } : { readOnly: false, reason: null };
}
// Decided once per page load: rotating a phone must not turn editing on halfway through.
let decision = decideMode({ search: '', width: Infinity, coarse: false });
export function initReadOnly(env: ModeEnvironment = { search: location.search, width: innerWidth, coarse: matchMedia('(pointer: coarse)').matches }) {
  decision = decideMode(env);
}
export function isReadOnly(): boolean { return decision.readOnly; }
export function readOnlyReason(): ReadOnlyReason { return decision.reason; }
