import { afterEach, expect, it, vi } from 'vitest';
import { onRefused, refusalText, refusedHandler, resyncing, takeRefusal } from './refused';

// The sidecar's stateless answer to a refused update (frontends/nexo-collab/src/admission.mjs).
const refusal = JSON.stringify({ type: 'refused', reason: 'protected', paths: ['meta.session'] });
afterEach(() => { vi.unstubAllGlobals(); });

it('a refused message triggers one resync and a toast', () => {
  const toast = vi.fn(), resync = vi.fn(), refused = refusedHandler({ toast, resync });
  refused(refusal); refused(refusal);
  expect(resync).toHaveBeenCalledOnce();
  expect(toast).toHaveBeenCalledExactlyOnceWith('This change was not applied. Try again.');
});

it('other stateless messages are ignored', () => {
  const toast = vi.fn(), resync = vi.fn(), refused = refusedHandler({ toast, resync });
  refused(JSON.stringify({ type: 'other' })); refused('not json');
  expect(resync).not.toHaveBeenCalled(); expect(toast).not.toHaveBeenCalled();
});

it('the resync reloads the page and the toast is shown after it', () => {
  const stored = new Map<string, string>(), reload = vi.fn();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
  vi.stubGlobal('location', { reload });
  onRefused(refusal);
  expect(reload).toHaveBeenCalledOnce(); expect(resyncing()).toBe(true);
  expect(takeRefusal()).toBe('This change was not applied. Try again.');
  expect(takeRefusal()).toBeNull();
});

it('an intent refusal is not an update refusal: no resync', () => {
  const toast = vi.fn(), resync = vi.fn(), refused = refusedHandler({ toast, resync });
  refused(JSON.stringify({ type: 'refused', intentId: 'a1', reason: 'lab only' }));
  expect(resync).not.toHaveBeenCalled(); expect(toast).not.toHaveBeenCalled();
});

// UX review 2, group 5: one sentence per refusal reason a person can meet, and a general one for the rest.
it.each([
  ['viewer', 'You can only view this board.'],
  ['commenter', 'You can only comment on this board.'],
  ['lab_only', 'Only lab staff can finish a plot, edit a figure or confirm a baseline.'],
  ['owner_only', 'Only the project owner can restore a version.'],
  ['stale', 'The board changed before your change arrived. Check the values and try again.'],
  ['requires_confirmation', 'Confirm the reference group, then try again.'],
  ['token_expired', 'Your Admin sign-in expired. Reload the page to sign in again.'],
  ['engine_unavailable', 'The analysis engine is not available. Try again in a moment.'],
])('a %s refusal reads as its own sentence', (reason, text) => {
  expect(refusalText(reason)).toBe(text);
});

it('any other refusal reads as the general sentence, without its code', () => {
  expect(refusalText('protected')).toBe('This change was not applied. Try again.');
  expect(refusalText(undefined)).toBe('This change was not applied. Try again.');
});
