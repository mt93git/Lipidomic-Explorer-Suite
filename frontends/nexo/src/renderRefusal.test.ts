// NEXO-P9 1: a card whose render answers 422 "The plot inputs are unavailable for this session." (module-trait when the
// correlation network has nothing to draw) was asked ~40 times and showed "Couldn't bring back …". A 4xx is the server's
// answer for that render, not a transient failure: asked once per render key, and shown as the server's note.
import { expect, it, vi } from 'vitest';
import { refusalMessage, renderOnce, UNAVAILABLE_INPUTS } from './runNeeds';
const failure = (status: number, note = false) => Object.assign(new Error(status === 422 ? UNAVAILABLE_INPUTS : `Request failed (${status})`), {status, ...(note ? {note: true} : {})});

it('4xx render is not retried and becomes a note', async () => {
  const refused = new Map<string, unknown>(), render = vi.fn(() => Promise.reject(failure(422, true)));
  const first = await renderOnce(refused, 'k', render).catch(e => e), second = await renderOnce(refused, 'k', render).catch(e => e);
  expect(render).toHaveBeenCalledTimes(1);
  expect(second).toBe(first);
  expect(refusalMessage(first)).toBe(UNAVAILABLE_INPUTS);
});
it('a 5xx render is asked again', async () => {
  const refused = new Map<string, unknown>(), render = vi.fn(() => Promise.reject(failure(500)));
  await renderOnce(refused, 'k', render).catch(() => undefined); await renderOnce(refused, 'k', render).catch(() => undefined);
  expect(render).toHaveBeenCalledTimes(2);
});
