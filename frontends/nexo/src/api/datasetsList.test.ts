// C2: GET /api/v1/datasets, the datasets released to the caller (Start's "Released datasets").
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./adminToken', async importOriginal => ({ ...await importOriginal<typeof import('./adminToken')>(), adminHeaders: async () => ({ 'X-Nexo-Admin-Token': 'synthetic-user' }) }));
import { knownMembersPrepare, listDatasets } from './datasetsList';
import { AdminSignInRequired } from './adminToken';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const row = { adminDatasetId: 'synthetic-ds-1', orderCode: 'ORD900', version: 1, clientId: 'c-1', clientName: 'Synthetic group', releasedAt: '2026-11-10T09:00:00Z', membersPrepare: false };
const answer = (status: number, body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
it('lists the datasets with the admin token', async () => {
  const fetch = answer(200, { datasets: [row] }); vi.stubGlobal('fetch', fetch);
  expect(await listDatasets()).toEqual([row]);
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/datasets');
  expect((fetch.mock.calls[0][1] as RequestInit).headers).toEqual({ 'X-Nexo-Admin-Token': 'synthetic-user' });
});
it('asks to sign in on 401', async () => {
  vi.stubGlobal('fetch', answer(401, { error: 'admin_auth_required' }));
  await expect(listDatasets()).rejects.toBeInstanceOf(AdminSignInRequired);
});
it('fails on any other error', async () => {
  vi.stubGlobal('fetch', answer(502, { error: 'admin_datasets_unavailable' }));
  await expect(listDatasets()).rejects.toThrow('502');
});
it('remembers whether the caller prepares for a client (membersPrepare), with nothing released too', async () => {
  vi.stubGlobal('fetch', answer(200, { datasets: [], membersPrepare: true }));
  expect(await listDatasets()).toEqual([]);
  expect(knownMembersPrepare()).toBe(true);
  vi.stubGlobal('fetch', answer(200, { datasets: [row], membersPrepare: false }));
  await listDatasets(); expect(knownMembersPrepare()).toBe(false);
});
