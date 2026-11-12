import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSignInRequired, adminDisplayName, adminSignInUrl, adminToken, adminHeaders, adminTokenUrl, adminUserId, forgetAdminToken, knownClientNames } from './adminToken';
import { datasetStrings as d } from '../ui/strings';
afterEach(() => { forgetAdminToken(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const now = 1_900_000_000; // unix seconds, synthetic
const issued = (token: string, expiresAt = now + 3600) => json(200, { accessToken: token, expiresAt, userId: '00000000-0000-4000-8000-0000000000aa', view: 'client' });
const at = (seconds: number) => vi.spyOn(Date, 'now').mockReturnValue(seconds * 1000);

describe('adminToken', () => {
  it("keeps the signed-in person's userId from Admin's answer, forgotten with the token", async () => {
    at(now);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(issued('t1')));
    expect(adminUserId()).toBeNull();
    await adminToken();
    expect(adminUserId()).toBe('00000000-0000-4000-8000-0000000000aa');
    forgetAdminToken();
    expect(adminUserId()).toBeNull();
  });
  // FIX-PROD-B 2: Start's empty state names a client member's group before anything is released to it.
  it("keeps the client names Admin gives a client member, forgotten with the token", async () => {
    at(now);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(200, { accessToken: 't1', expiresAt: now + 3600, view: 'client', clientNames: ['Synthetic client group'] })));
    expect(knownClientNames()).toEqual([]);
    await adminToken();
    expect(knownClientNames()).toEqual(['Synthetic client group']);
    forgetAdminToken();
    expect(knownClientNames()).toEqual([]);
  });
  it('knows no client names when Admin gives none or not a list of names', async () => {
    at(now);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(issued('t1')));
    await adminToken();
    expect(knownClientNames()).toEqual([]);
    forgetAdminToken();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(200, { accessToken: 't2', expiresAt: now + 3600, view: 'client', clientNames: 'Synthetic client group' })));
    await adminToken();
    expect(knownClientNames()).toEqual([]);
  });
  it('asks Admin same-origin with credentials and keeps the token until 60 s before it expires', async () => {
    at(now);
    const fetch = vi.fn().mockResolvedValueOnce(issued('t1')).mockResolvedValueOnce(issued('t2', now + 7200));
    vi.stubGlobal('fetch', fetch);
    expect(adminTokenUrl).toBe('/admin/api/session-token');
    await expect(adminToken()).resolves.toBe('t1');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/admin/api/session-token');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    at(now + 3600 - 61);
    await expect(adminToken()).resolves.toBe('t1');
    expect(fetch).toHaveBeenCalledTimes(1);
    at(now + 3600 - 60);
    await expect(adminToken()).resolves.toBe('t2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('remembers signed out for 60 seconds and keeps requiring sign-in', async () => {
    at(now);
    const fetch = vi.fn().mockResolvedValueOnce(json(401, { error: 'signed_out' })).mockResolvedValueOnce(issued('t3'));
    vi.stubGlobal('fetch', fetch);
    const error = await adminToken().catch(e => e);
    expect(error).toBeInstanceOf(AdminSignInRequired);
    expect(error.message).toBe(d.signedOut);
    at(now + 59);
    await expect(adminToken()).rejects.toBeInstanceOf(AdminSignInRequired);
    expect(fetch).toHaveBeenCalledTimes(1);
    at(now + 60);
    await expect(adminToken()).resolves.toBe('t3');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['a 403 (not same-origin)', () => Promise.resolve(json(403, { error: 'forbidden' }))],
    ['a 404 (no Admin on this host)', () => Promise.resolve(new Response('not found', { status: 404 }))],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 200 without a token', () => Promise.resolve(json(200, { userId: 'x' }))]
  ])('proceeds without a token after %s (the API decides)', async (_, answer) => {
    at(now);
    const fetch = vi.fn(answer); vi.stubGlobal('fetch', fetch);
    await expect(adminToken()).resolves.toBeNull();
    at(now + 59);
    await expect(adminToken()).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    at(now + 60);
    await expect(adminToken()).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([401, 404])('forgets a cached no-token answer on request (%s)', async (status) => {
    at(now);
    const fetch = vi.fn().mockResolvedValueOnce(json(status, {})).mockResolvedValueOnce(issued('new'));
    vi.stubGlobal('fetch', fetch);
    if (status === 401) await expect(adminToken()).rejects.toBeInstanceOf(AdminSignInRequired);
    else await expect(adminToken()).resolves.toBeNull();
    forgetAdminToken();
    await expect(adminToken()).resolves.toBe('new');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('lets a cancel through as a cancel', async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => { init.signal?.throwIfAborted(); return Promise.resolve(issued('t')); }));
    await expect(adminToken(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(adminToken()).resolves.toBe('t');
  });
  it('forgets the token on request (an API 401)', async () => {
    at(now);
    const fetch = vi.fn().mockResolvedValueOnce(issued('old')).mockResolvedValueOnce(issued('new'));
    vi.stubGlobal('fetch', fetch);
    await expect(adminToken()).resolves.toBe('old');
    forgetAdminToken();
    await expect(adminToken()).resolves.toBe('new');
  });
});

describe('adminSignInUrl', () => {
  it('links to Admin sign-in with the current Nexo URL as next', () => {
    expect(adminSignInUrl('https://lab.example/nexo/?dataset=11111111-1111-4111-8111-111111111111&x=1'))
      .toBe('/admin/sign-in?next=https%3A%2F%2Flab.example%2Fnexo%2F%3Fdataset%3D11111111-1111-4111-8111-111111111111%26x%3D1');
  });
});

it('uses the dedicated admin header and omits it without a token', async () => {
  at(now);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(issued('synthetic')).mockResolvedValueOnce(json(404, {})));
  expect(await adminHeaders()).toEqual({'X-Nexo-Admin-Token':'synthetic'});
  forgetAdminToken();
  expect(await adminHeaders()).toEqual({});
});

// ENTRY-INT step 4: "Prepared by <name>" on a board this person prepared, named as the sidecar names them (admission.mjs identity).
it('names the signed-in person by the token\'s displayName claim, else as Lab staff or Member', async () => {
  at(now);
  const named = `x.${btoa(JSON.stringify({ displayName: 'Ana Synthetic' })).replace(/=+$/, '')}.y`;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(issued(named)).mockResolvedValueOnce(issued('opaque')));
  expect(adminDisplayName()).toBeNull();
  await adminToken(); expect(adminDisplayName()).toBe('Ana Synthetic');
  forgetAdminToken(); await adminToken(); expect(adminDisplayName()).toBe('Member');
});

// FIX-PROD-A: Admin's answer carries displayName next to the token; the name comes from it, the fallback only without one.
it("names the signed-in person by Admin's displayName, else as today", async () => {
  at(now);
  const answer = (displayName?: string) => json(200, { accessToken: 'opaque', expiresAt: now + 3600, userId: 'u-synthetic', view: 'staff', displayName });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(answer('Robin Synthetic')).mockResolvedValueOnce(answer('')).mockResolvedValueOnce(answer()));
  await adminToken(); expect(adminDisplayName()).toBe('Robin Synthetic');
  forgetAdminToken(); await adminToken(); expect(adminDisplayName()).toBe('Lab staff');
  forgetAdminToken(); await adminToken(); expect(adminDisplayName()).toBe('Lab staff');
});
