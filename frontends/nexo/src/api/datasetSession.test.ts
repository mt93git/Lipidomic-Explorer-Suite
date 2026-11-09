import { afterEach, describe, expect, it, vi } from 'vitest';
import { interpretDatasetResponse } from './datasetSession';
import { openDatasetSession } from '../api';
import { AdminSignInRequired, forgetAdminToken } from './adminToken';
import { datasetStrings as d } from '../ui/strings';
afterEach(() => vi.unstubAllGlobals());

const id = '11111111-1111-4111-8111-111111111111';
const choices = { error: 'unprocessable', reason: 'preparation_choices_required', message: 'Team asks for these preparation choices: samples',
  missing: [{ name: 'samples', label: 'Samples', kind: 'samples', choices: ['A', 'B'], teamControlDefault: ['A', 'B'] }], availableSamples: ['A', 'B'] };
const design = { allowed: false, unit: null, type: null, confirmed: false };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('interpretDatasetResponse', () => {
  it('turns the 422 preparation_choices_required body into the choices to ask', () => {
    expect(interpretDatasetResponse(422, choices)).toEqual({ status: 'choices', choices });
  });
  it('returns the opened session on 200', () => {
    const session = { sessionId: 's', design, dataset: { orderCode: 'ORD041', version: 1 } };
    expect(interpretDatasetResponse(200, session)).toEqual({ status: 'ready', session });
  });
  it.each([
    [404, { error: 'dataset_not_found', message: 'No released dataset has this id.' }, d.notFound],
    [502, { error: 'dataset_integrity_failed', message: 'The workbook digest differs.' }, d.integrityFailed],
    [503, { error: 'admin_datasets_unavailable', message: 'Admin datasets are not configured.' }, d.unavailable]
  ])('says clearly what a %i means', (status, body, message) => {
    expect(() => interpretDatasetResponse(status, body)).toThrow(message);
  });
  it('passes Team\'s refusal through on another 422', () => {
    expect(() => interpretDatasetResponse(422, { error: 'unprocessable', message: 'Fewer than two lipids pass detection.' })).toThrow('Fewer than two lipids pass detection.');
  });
  it('turns a 401 into the sign-in request', () => {
    expect(() => interpretDatasetResponse(401, { error: 'admin_auth_required', message: 'x' })).toThrow(AdminSignInRequired);
  });
  it('falls back to the status when the body has no message', () => {
    expect(() => interpretDatasetResponse(500, {})).toThrow('Request failed (500)');
  });
});

// Admin's token route and the API's POST, answered by URL: the token answer is fixed, the POST answers are taken in order.
const tokenUrl = '/admin/api/session-token';
const signedIn = () => json(200, { accessToken: 'synthetic-token', expiresAt: Math.floor(Date.now() / 1000) + 3600, userId: '00000000-0000-4000-8000-0000000000aa', view: 'staff' });
function routes(token: () => Response | Promise<Response>, ...posts: (Response | (() => Response))[]) {
  return vi.fn((url: string, _init?: RequestInit) => url === tokenUrl ? Promise.resolve().then(token) : (() => { const next = posts.shift(); if (!next) throw new Error(`unexpected ${url}`); return Promise.resolve(typeof next === 'function' ? next() : next); })());
}
const posts = (fetch: ReturnType<typeof routes>) => fetch.mock.calls.filter(c => c[0] !== tokenUrl) as unknown as [string, RequestInit][];
const tokens = (fetch: ReturnType<typeof routes>) => fetch.mock.calls.filter(c => c[0] === tokenUrl).length;

describe('openDatasetSession', () => {
  afterEach(() => forgetAdminToken());
  it('asks with the dataset id alone, then resubmits the same body plus settings', async () => {
    const fetch = routes(signedIn, json(422, choices), json(200, { sessionId: 'next', design, dataset: { orderCode: 'ORD041', version: 1 } }));
    vi.stubGlobal('fetch', fetch);
    await expect(openDatasetSession(id)).resolves.toEqual({ status: 'choices', choices });
    expect(posts(fetch)[0][0]).toBe('/api/v1/datasets/sessions');
    expect(posts(fetch)[0][1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(posts(fetch)[0][1].body as string)).toStrictEqual({ adminDatasetId: id });
    const settings = { samples: ['A'], minDetectionPct: 0 };
    await expect(openDatasetSession(id, settings)).resolves.toMatchObject({ status: 'ready', session: { sessionId: 'next', dataset: { orderCode: 'ORD041' } } });
    expect(JSON.parse(posts(fetch)[1][1].body as string)).toStrictEqual({ adminDatasetId: id, settings });
  });
  it('sends the Admin token as a Bearer header and asks Admin once while it is fresh', async () => {
    const fetch = routes(signedIn, json(422, choices), json(200, { sessionId: 'next', design }));
    vi.stubGlobal('fetch', fetch);
    await openDatasetSession(id); await openDatasetSession(id, { samples: ['A'] });
    expect(fetch.mock.calls[0][0]).toBe(tokenUrl);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin' });
    for (const [, init] of posts(fetch)) expect(init.headers).toStrictEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-token' });
    expect(tokens(fetch)).toBe(1);
  });
  it('asks the person to sign in to Admin when Admin says signed out, without asking the API', async () => {
    const fetch = routes(() => json(401, { error: 'signed_out' }));
    vi.stubGlobal('fetch', fetch);
    const error = await openDatasetSession(id).catch(e => e);
    expect(error).toBeInstanceOf(AdminSignInRequired);
    expect(error.message).toBe(d.signedOut);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('asks the person to sign in on the API\'s 401, forgets the token and does not retry', async () => {
    const fetch = routes(signedIn, json(401, { error: 'admin_auth_required', message: 'Sign in to Admin.' }), json(422, choices));
    vi.stubGlobal('fetch', fetch);
    await expect(openDatasetSession(id)).rejects.toBeInstanceOf(AdminSignInRequired);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(openDatasetSession(id)).resolves.toMatchObject({ status: 'choices' });
    expect(tokens(fetch)).toBe(2);
  });
  it.each([
    ['403', () => json(403, { error: 'forbidden' })],
    ['network error', () => Promise.reject(new TypeError('Failed to fetch'))]
  ])('opens without a token after a token %s (the API decides)', async (_, token) => {
    const fetch = routes(token, json(422, choices));
    vi.stubGlobal('fetch', fetch);
    await expect(openDatasetSession(id)).resolves.toMatchObject({ status: 'choices' });
    expect(posts(fetch)[0][1].headers).toStrictEqual({ 'Content-Type': 'application/json' });
  });
  it('explains an HTML 502 as a temporary availability failure', async () => {
    const fetch = routes(signedIn, new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    vi.stubGlobal('fetch', fetch);
    await expect(openDatasetSession(id)).rejects.toThrow(d.unavailable);
    expect(posts(fetch)).toHaveLength(1);
  });
  it('does not retry a 503 admin_datasets_unavailable as a busy engine', async () => {
    const fetch = routes(signedIn, json(503, { error: 'admin_datasets_unavailable', message: 'x' }));
    vi.stubGlobal('fetch', fetch);
    await expect(openDatasetSession(id)).rejects.toThrow(d.unavailable);
    expect(posts(fetch)).toHaveLength(1);
  });
  it('retries a busy 503 like every other engine route, with the same token', async () => {
    const fetch = routes(signedIn, json(503, { error: 'busy', message: 'The engine is busy.' }), json(200, { sessionId: 'later', design }));
    vi.stubGlobal('fetch', fetch);
    await expect(openDatasetSession(id, { samples: ['A'] })).resolves.toMatchObject({ status: 'ready', session: { sessionId: 'later' } });
    expect(posts(fetch)).toHaveLength(2);
    expect(tokens(fetch)).toBe(1);
  });
  it('does not send a request cancelled while queued', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const controller = new AbortController(); controller.abort();
    await expect(openDatasetSession(id, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
