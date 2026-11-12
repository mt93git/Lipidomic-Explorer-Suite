// ENTRY-8: PUT /collab/projects/<id>/decisions, a flagged sample decided on the shared board.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./adminToken', async importOriginal => ({ ...await importOriginal<typeof import('./adminToken')>(), adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic-user' }) }));
import { putDecision } from './decisions';
beforeEach(() => { vi.stubGlobal('location', new URL('https://synthetic.invalid/nexo/')); vi.stubEnv('VITE_COLLAB_URL', 'wss://synthetic.invalid/collab'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('puts the decision to the sidecar with the Admin token', async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ settings: { samples: ['Treated_3'] } }))); vi.stubGlobal('fetch', fetch);
  expect(await putDecision('p-1', { sample: 'Treated_3', choice: 'exclude', reason: 'failed injection' })).toEqual({ samples: ['Treated_3'] });
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('https://synthetic.invalid/collab/projects/p-1/decisions');
  expect(init?.method).toBe('PUT');
  expect(init?.headers).toEqual({ 'X-Nexo-Admin-Token': 'synthetic-user', 'Content-Type': 'application/json' });
  expect(JSON.parse(String(init?.body))).toEqual({ sample: 'Treated_3', choice: 'exclude', reason: 'failed injection' });
});
it('fails with the sidecar\'s reason', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"forbidden_role"}', { status: 403 })));
  await expect(putDecision('p-1', { sample: 'Treated_3', choice: 'keep' })).rejects.toThrow('forbidden_role');
});
