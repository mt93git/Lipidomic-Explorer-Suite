import { mockAdminSignedOutKey } from './adminToken';
export async function mockAdminSignInFetch(url: string, init: RequestInit): Promise<Response> {
  if (url.endsWith('/sign-out')) { sessionStorage.setItem(mockAdminSignedOutKey, 'signed-out'); return new Response(null, { status: 204 }); }
  const body = JSON.parse(String(init.body)) as { email: string; password: string; code?: string };
  const error = !body.email || !body.password ? 'invalid_credentials' : body.email.startsWith('code') && !body.code ? 'code_required' : body.code === '000000' ? 'invalid_code' : null;
  if (error) return new Response(JSON.stringify({ error }), { status: 401 });
  sessionStorage.removeItem(mockAdminSignedOutKey);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
