import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSignInRequired, adminSignInUrl, adminToken, adminTokenUrl, forgetAdminToken } from './adminToken';
import { datasetStrings as d } from '../ui/strings';
afterEach(() => { forgetAdminToken(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const now = 1_900_000_000; // unix seconds, synthetic
const issued = (token: string, expiresAt = now + 3600) => json(200, { accessToken: token, expiresAt, userId: '00000000-0000-4000-8000-0000000000aa', view: 'client' });
const at = (seconds: number) => vi.spyOn(Date, 'now').mockReturnValue(seconds * 1000);

describe('adminToken', () => {
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
  it('says the person must sign in to Admin on 401, and caches nothing', async () => {
    at(now);
    const fetch = vi.fn().mockResolvedValueOnce(json(401, { error: 'signed_out' })).mockResolvedValueOnce(issued('t3'));
    vi.stubGlobal('fetch', fetch);
    const error = await adminToken().catch(e => e);
    expect(error).toBeInstanceOf(AdminSignInRequired);
    expect(error.message).toBe(d.signedOut);
    await expect(adminToken()).resolves.toBe('t3');
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
  });
  it('lets a cancel through as a cancel', async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => { init.signal?.throwIfAborted(); return Promise.resolve(issued('t')); }));
    await expect(adminToken(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
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
