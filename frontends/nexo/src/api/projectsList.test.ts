// C4: GET /collab/projects, the caller's projects (Start's "Projects").
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./adminToken', async importOriginal => ({ ...await importOriginal<typeof import('./adminToken')>(), adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic-user' }) }));
import { listProjects } from './projectsList';
beforeEach(() => vi.stubGlobal('location', new URL('https://synthetic.invalid/nexo/')));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const project = { projectId: 'p-1', workspace: 'nexo-client-c-1', origin: { kind: 'dataset', id: 'synthetic-ds-1' }, createdBy: { userId: 'u-1', displayName: 'Ada Example' },
  createdAt: '2026-11-09T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z', online: [] };
it('lists the projects from the sidecar over HTTP', async () => {
  vi.stubEnv('VITE_COLLAB_URL', 'wss://synthetic.invalid/collab');
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ projects: [project] }))); vi.stubGlobal('fetch', fetch);
  expect(await listProjects()).toEqual([project]);
  expect(fetch.mock.calls[0][0]).toBe('https://synthetic.invalid/collab/projects');
  expect((fetch.mock.calls[0][1] as RequestInit).headers).toEqual({ 'X-Nexo-Admin-Token': 'synthetic-user' });
});
it('answers null without collab', async () => {
  vi.stubEnv('VITE_COLLAB_URL', ''); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await listProjects()).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('answers null with collab opted out', async () => {
  vi.stubEnv('VITE_COLLAB_URL', 'wss://synthetic.invalid/collab'); vi.stubGlobal('location', new URL('https://synthetic.invalid/nexo/?collab=0'));
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await listProjects()).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('fails when the sidecar refuses', async () => {
  vi.stubEnv('VITE_COLLAB_URL', 'wss://synthetic.invalid/collab');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"admin_unavailable"}', { status: 503 })));
  await expect(listProjects()).rejects.toThrow('503');
});
