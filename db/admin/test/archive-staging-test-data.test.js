// The one-off staging cleanup (archive-staging-test-data.mjs): its target guard and what it would archive.
// Pure functions only; the script itself is never run against a stack from here. Synthetic data only.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { assertStagingTarget, plan } from './archive-staging-test-data.mjs';

describe('target guard', () => {
  const staging = 'https://admin-staging.example.test';
  test('runs only against the staging gateway named in env', () => {
    expect(() => assertStagingTarget(staging, staging)).not.toThrow();
    expect(() => assertStagingTarget(`${staging}/`, staging)).not.toThrow();
  });
  test('refuses another origin, a missing staging gateway and a missing target', () => {
    expect(() => assertStagingTarget('https://admin.example.test', staging)).toThrow(/not the staging gateway/);
    expect(() => assertStagingTarget(`${staging}.evil.test`, staging)).toThrow(/not the staging gateway/);
    expect(() => assertStagingTarget(staging, '')).toThrow(/ADMIN_STAGING_GATEWAY_URL/);
    expect(() => assertStagingTarget(staging, undefined)).toThrow(/ADMIN_STAGING_GATEWAY_URL/);
    expect(() => assertStagingTarget('', staging)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
  test('never prints credentials embedded in a URL', () => {
    expect(() => assertStagingTarget('https://user:secret@admin.example.test', staging)).toThrow(/^(?!.*secret).*$/s);
  });
});

describe('plan', () => {
  const clients = [
    { id: 'c-run-a', name: 'itmw1a2b3c Client A' }, { id: 'c-run-b', name: 'itmw1a2b3c Client B' },
    { id: 'c-live-a', name: 'E2E Live Client A' }, { id: 'c-live-b', name: 'E2E Live Client B' },
    { id: 'c-real', name: 'Cedar Lab' }, { id: 'c-near', name: 'itmw1a2b3c Client C' }, { id: 'c-pilot', name: 'Pilot Simulation Client (synthetic)' },
  ];
  const orders = [
    { id: 'o1', code: 'ORD101', title: 'itmw1a2b3c order A', client_id: 'c-run-a' },
    { id: 'o2', code: 'ORD102', title: 'anything', client_id: 'c-run-b' },
    { id: 'o3', code: 'ORD103', title: 'E2E live 2026-11-09 10:15', client_id: 'c-live-a' },
    { id: 'o4', code: 'ORD104', title: 'E2E live own 2026-11-09 10:15', client_id: 'c-live-b' },
    { id: 'o5', code: 'ORD105', title: 'Lipid panel', client_id: 'c-live-a' }, // not a seeded title: kept
    { id: 'o6', code: 'ORD106', title: 'E2E live 2026-11-09 10:15', client_id: 'c-real' }, // a real client: kept
    { id: 'o7', code: 'ORD107', title: 'Pilot order', client_id: 'c-pilot' },
  ];
  const datasets = [
    { id: 'd1', order_id: 'o1', status: 'released', version: 1 },
    { id: 'd2', order_id: 'o1', status: 'built', version: 2 },
    { id: 'd3', order_id: 'o2', status: 'built', version: 1 },
    { id: 'd4', order_id: 'o6', status: 'released', version: 1 },
  ];
  test('takes the run clients and their orders, and only the seeded orders of the fixed E2E Live clients', () => {
    const p = plan({ clients, orders, datasets });
    expect(p.archiveClients.map(c => c.id)).toEqual(['c-run-a', 'c-run-b']);
    expect(p.archiveOrders.map(o => o.code)).toEqual(['ORD101', 'ORD102', 'ORD103', 'ORD104']);
  });
  test('withdraws released versions (0008: never archived through the columns) and archives the others', () => {
    const p = plan({ clients, orders, datasets });
    expect(p.withdraw.map(d => d.id)).toEqual(['d1']);
    expect(p.archiveDatasets.map(d => d.id)).toEqual(['d2', 'd3']);
  });
  test('nothing to do without matching names', () => {
    expect(plan({ clients: [{ id: 'c', name: 'Cedar Lab' }], orders: [{ id: 'o', code: 'ORD1', title: 'x', client_id: 'c' }], datasets: [] }))
      .toEqual({ withdraw: [], archiveDatasets: [], archiveOrders: [], archiveClients: [] });
  });
});

describe('optional leftover user retirement', () => {
  const env = { ADMIN_STAGING_GATEWAY_URL: 'https://staging.example.test', NEXT_PUBLIC_SUPABASE_URL: 'https://staging.example.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', ADMIN_CLEANUP_EMAIL: 'owner@example.test', ADMIN_CLEANUP_PASSWORD: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'fake-service' };
  const json = body => new Response(JSON.stringify(body), { status: 200 });
  async function setup() {
    const { main } = await import('./archive-staging-test-data.mjs');
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/token')) return json({ access_token: 'owner-token' });
      if (path.endsWith('/admin/users')) return json({ users: [{ id: 'u1', email: 'itabc123-operator@example.test' }, { id: 'real', email: 'steph.sim@admin-staging.test' }] });
      if (init?.method === 'PUT') return json({});
      return json([]);
    });
    return { main, fetch };
  }
  afterEach(() => vi.restoreAllMocks());
  test('dry run lists only the matching users and makes no retirement writes', async () => {
    const { main, fetch } = await setup();
    await main(env, ['--retire-users']);
    expect(fetch.mock.calls.filter(([, init]) => ['PATCH', 'PUT', 'DELETE'].includes(init?.method))).toEqual([]);
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/admin/users?page=1&per_page=200'))).toBe(true);
  });
  test('apply archives admin rows with the owner token and bans only matching GoTrue users with the service key', async () => {
    const { main, fetch } = await setup();
    await main(env, ['--apply', '--retire-users']);
    const writes = fetch.mock.calls.filter(([, init]) => ['PATCH', 'PUT'].includes(init?.method));
    expect(writes.map(([url]) => new URL(url).pathname)).toEqual(['/rest/v1/client_member', '/rest/v1/lab_staff', '/auth/v1/admin/users/u1']);
    for (const [url, init] of writes.slice(0, 2)) {
      expect(String(url)).toContain('user_id=in.(u1)&archived_at=is.null');
      expect(init.headers.Authorization).toBe('Bearer owner-token');
      expect(init.headers.apikey).toBe('anon');
      expect(JSON.parse(init.body)).toMatchObject({ archived_at: expect.any(String), archived_reason: expect.any(String) });
    }
    expect(writes[2][1].headers.Authorization).toBe('Bearer fake-service');
    expect(JSON.parse(writes[2][1].body)).toEqual({ ban_duration: '876000h' });
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });
  test('keeps an Owner unbanned when RLS hides a targeted membership from PATCH results', async () => {
    const { main, fetch } = await setup();
    const original = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, init) => {
      if (String(url).includes('/lab_staff?') && init?.method !== 'PATCH') return json([{ id: 'owner-membership' }]);
      return original(url, init);
    });
    await expect(main(env, ['--apply', '--retire-users'])).rejects.toThrow(/retirement failed/);
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
  test('without the option does not read GoTrue admin users or require the service key', async () => {
    const { main, fetch } = await setup();
    await main({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, []);
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/admin/users'))).toBe(false);
  });
  test('requires the service key only for opt-in retirement, before any request', async () => {
    const { main, fetch } = await setup();
    await expect(main({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, ['--retire-users'])).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(fetch).not.toHaveBeenCalled();
  });
  test('paginates GoTrue users and never selects near-matching users for retirement', async () => {
    const { main, fetch } = await setup();
    const original = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, init) => {
      if (String(url).includes('/admin/users?page=1')) return json({ users: Array.from({ length: 200 }, (_, i) => ({ id: `real-${i}`, email: `owner${i}@example.test` })) });
      return original(url, init);
    });
    await main(env, ['--retire-users', '--apply']);
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/admin/users?page=2&per_page=200'))).toBe(true);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([url]) => new URL(url).pathname)).toEqual(['/auth/v1/admin/users/u1']);
  });
  test('refuses a different target before any request, even with retirement enabled', async () => {
    const { main, fetch } = await setup();
    await expect(main({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://other.example.test' }, ['--apply', '--retire-users'])).rejects.toThrow(/not the staging gateway/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
