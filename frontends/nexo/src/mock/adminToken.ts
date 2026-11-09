// Mock of Admin's GET /admin/api/session-token (docs/integration/admin-identity.md): signed in by default with a synthetic
// token; signed out (401 signed_out) when sessionStorage 'nexo-mock-admin' is 'signed-out', as the browser suite sets it,
// and a client member when it is 'client'.
export const mockAdminSignedOutKey = 'nexo-mock-admin';
export const mockAdminToken = { requests: 0 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export async function mockAdminTokenFetch(_url: string, init: RequestInit): Promise<Response> {
  init.signal?.throwIfAborted();
  mockAdminToken.requests++;
  let signedOut = false; try { signedOut = sessionStorage.getItem(mockAdminSignedOutKey) === 'signed-out'; } catch { /* no storage: signed in */ }
  if (signedOut) return json(401, { error: 'signed_out' });
  // 'client': a client member (nexo-store-scope.md), who does not see Upload ZIP.
  let member = false; try { member = sessionStorage.getItem(mockAdminSignedOutKey) === 'client'; } catch { /* no storage: staff */ }
  return json(200, { accessToken: `mock-admin-token-${mockAdminToken.requests}`, expiresAt: Math.floor(Date.now() / 1000) + 3600, userId: '00000000-0000-4000-8000-00000000a001', view: member ? 'client' : 'staff' });
}
