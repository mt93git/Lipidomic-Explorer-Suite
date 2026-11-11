// C3: GET /api/v1/sessions/<id>/quality, Team's quality answers for the check.
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./adminToken', async importOriginal => ({ ...await importOriginal<typeof import('./adminToken')>(), adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic-user' }) }));
import { getQuality } from './quality';
afterEach(() => vi.unstubAllGlobals());
const quality = { pca: [{ sample: 'A_1', group: 'A', pc1: 1, pc2: 0, distance: 1, flagged: false }], limit: 3, variance: [60, 20],
  spread: [{ sample: 'A_1', group: 'A', median: 20, q1: 18, q3: 22 }], missing: [{ sample: 'A_1', missing: 2, of: 40 }] };
it('reads the quality of a session', async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(quality))); vi.stubGlobal('fetch', fetch);
  expect(await getQuality('session/1')).toEqual(quality);
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/sessions/session%2F1/quality');
  expect((fetch.mock.calls[0][1] as RequestInit).headers).toEqual({ 'X-Nexo-Admin-Token': 'synthetic-user' });
});
it('fails with the API message', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ message: 'Unknown session.' }), { status: 404 })));
  await expect(getQuality('gone')).rejects.toThrow('Unknown session.');
});
