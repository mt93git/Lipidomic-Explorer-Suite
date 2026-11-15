import { describe, expect, it, vi } from 'vitest';
import { signIn } from './adminSignIn';

describe('Admin sign in', () => {
  it('maps Admin answers', async () => {
    for (const answer of ['code_required', 'invalid_credentials', 'invalid_code', 'unavailable']) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: answer }), { status: answer === 'unavailable' ? 503 : 401 })));
      expect(await signIn({ email: 'person@example.test', password: 'synthetic' })).toBe(answer);
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 })));
    expect(await signIn({ email: '', password: '' })).toBe('invalid_credentials');
    vi.unstubAllGlobals();
  });
});

it('refreshes the token after success without persisting credentials', async () => {
  const { adminToken, useAdminTokenFetch, forgetAdminToken } = await import('./adminToken');
  forgetAdminToken();
  const tokenFetch = vi.fn(async () => new Response(JSON.stringify({ accessToken: 'synthetic-token', expiresAt: Date.now() / 1000 + 3600 }), { status: 200 }));
  useAdminTokenFetch(tokenFetch);
  await adminToken();
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const storage = { setItem: vi.fn() }; vi.stubGlobal('localStorage', storage);
  expect(await signIn({ email: 'person@example.test', password: 'synthetic', code: '123456' })).toBe('ok');
  await adminToken();
  expect(tokenFetch).toHaveBeenCalledTimes(2);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
  vi.unstubAllGlobals();
});
