// The store per client (docs/integration/nexo-store-scope.md): every checkpoint call carries the signed-in Admin user's
// token; an API 401 admin_auth_required asks to sign in to Admin. Signed out of Admin or without Admin on the host, the
// calls go as today (no header) and the API decides. Synthetic tokens and ids only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCheckpoints, getCardSchema, validateCanvas, openSession, saveCheckpoint, uploadCheckpoint, deleteCheckpoint, checkpointDownload, knownAdminView, AdminSignInRequired } from '../api';
import { forgetAdminToken, useAdminTokenFetch } from './adminToken';
import { datasetStrings as d } from '../ui/strings';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const signedIn = (view: 'staff' | 'client') => vi.fn(async () => json(200, { accessToken: `synthetic-${view}`, expiresAt: Math.floor(Date.now() / 1000) + 3600, userId: '00000000-0000-4000-8000-0000000000aa', view }));
const record = { id: 'a'.repeat(64), name: 'saved', sizeBytes: 10, sha256: 'a'.repeat(64), createdAt: '2026-11-08T00:00:00Z', source: 'store' };
const authorization = (init: RequestInit | undefined) => new Headers(init?.headers).get('X-Nexo-Admin-Token');
let api: ReturnType<typeof vi.fn>;
beforeEach(() => { api = vi.fn(async (url: string) => url.endsWith('/download') ? new Response(new Blob([new Uint8Array([80, 75])]), { status: 200 }) : json(200, url.endsWith('/checkpoints') ? [record] : { ...record, sessionId: 's1', ok: true })); vi.stubGlobal('fetch', api); });
afterEach(() => { forgetAdminToken(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('checkpoint calls carry the Admin token', () => {
  const calls: [string, () => Promise<unknown>, string][] = [
    ['session schema', () => getCardSchema('s1', 'card'), '/api/v1/sessions/s1/cards/card/schema'],
    ['canvas validate', () => validateCanvas('s1', 't', {}), '/api/v1/sessions/s1/canvas/validate'],
    ['list', () => listCheckpoints(), '/api/v1/checkpoints'],
    ['restore', () => openSession('a'.repeat(64)), '/api/v1/sessions'],
    ['save (autosave included)', () => saveCheckpoint('s1', 'autosave', { token: 't', state: {} }), '/api/v1/sessions/s1/checkpoints'],
    ['upload', () => uploadCheckpoint(new File([new Uint8Array([80, 75])], 'team.zip'), 'team'), '/api/v1/checkpoints'],
    ['delete', () => deleteCheckpoint('a'.repeat(64)), `/api/v1/checkpoints/${'a'.repeat(64)}`],
    ['download', () => checkpointDownload('a'.repeat(64)), `/api/v1/checkpoints/${'a'.repeat(64)}/download`]
  ];
  it.each(calls)('%s sends X-Nexo-Admin-Token', async (_, run, url) => {
    useAdminTokenFetch(signedIn('client'));
    await run();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][0]).toBe(url);
    expect(authorization(api.mock.calls[0][1])).toBe('synthetic-client');
  });
  it.each(calls)('%s goes without a token when Admin says signed out (today\'s behaviour; the API decides)', async (_, run) => {
    useAdminTokenFetch(vi.fn(async () => json(401, { error: 'signed_out' })));
    await run();
    for (const [, init] of api.mock.calls) expect(authorization(init)).toBeNull();
  });
  it('downloads with a token through the API (a blob link); without one it stays the plain link', async () => {
    useAdminTokenFetch(signedIn('staff'));
    expect(await checkpointDownload('a'.repeat(64))).toMatch(/^blob:/);
    forgetAdminToken(); api.mockClear();
    useAdminTokenFetch(vi.fn(async () => new Response('not found', { status: 404 })));
    expect(await checkpointDownload('a'.repeat(64))).toBe(`/api/v1/checkpoints/${'a'.repeat(64)}/download`);
    expect(api).not.toHaveBeenCalled();
  });
});

describe('a refused token', () => {
  it('turns the API 401 admin_auth_required into "Sign in to Admin" and forgets the token', async () => {
    const tokens = signedIn('client'); useAdminTokenFetch(tokens);
    api.mockResolvedValueOnce(json(401, { error: 'admin_auth_required', message: 'admin_auth_required' }));
    const error = await listCheckpoints().catch(e => e);
    expect(error).toBeInstanceOf(AdminSignInRequired);
    expect(error.message).toBe(d.signedOutCheckpoints);
    await listCheckpoints();
    expect(tokens).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['save', () => saveCheckpoint('s1', 'named', { token: 't', state: {} })],
    ['upload', () => uploadCheckpoint(new File([new Uint8Array([80, 75])], 'team.zip'), 'team')],
    ['download', () => checkpointDownload('a'.repeat(64))]
  ])('%s: the same sign-in answer', async (_, run) => {
    useAdminTokenFetch(signedIn('client'));
    api.mockResolvedValueOnce(json(401, { error: 'admin_auth_required', message: 'admin_auth_required' }));
    await expect(run()).rejects.toBeInstanceOf(AdminSignInRequired);
  });
  it('keeps a staff-only refusal as the API says it', async () => {
    useAdminTokenFetch(signedIn('client'));
    api.mockResolvedValueOnce(json(403, { error: 'staff_only', message: 'Uploads are for lab staff.' }));
    await expect(uploadCheckpoint(new File([new Uint8Array([80, 75])], 'team.zip'), 'team')).rejects.toThrow('Uploads are for lab staff.');
  });
});

describe('knownAdminView', () => {
  it('is the view Admin gave with the token of the last checkpoint call, asked no extra time', async () => {
    const tokens = signedIn('client'); useAdminTokenFetch(tokens);
    expect(knownAdminView()).toBeNull();
    await listCheckpoints();
    expect(knownAdminView()).toBe('client');
    expect(tokens).toHaveBeenCalledTimes(1);
    forgetAdminToken(); useAdminTokenFetch(signedIn('staff'));
    await listCheckpoints();
    expect(knownAdminView()).toBe('staff');
  });
  it('is null signed out or without Admin on the host', async () => {
    useAdminTokenFetch(signedIn('client')); await listCheckpoints(); forgetAdminToken();
    useAdminTokenFetch(vi.fn(async () => json(401, { error: 'signed_out' })));
    await listCheckpoints();
    expect(knownAdminView()).toBeNull();
    useAdminTokenFetch(vi.fn(async () => new Response('not found', { status: 404 })));
    await listCheckpoints();
    expect(knownAdminView()).toBeNull();
  });
});
