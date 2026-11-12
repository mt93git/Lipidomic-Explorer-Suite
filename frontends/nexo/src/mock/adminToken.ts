// Mock of Admin's GET /admin/api/session-token (docs/integration/admin-identity.md): signed in by default with a synthetic
// token (one constant, which the collab spike's fake PostgREST knows); signed out (401 signed_out) when sessionStorage
// 'nexo-mock-admin' is 'signed-out', as the browser suite sets it, and a client member when it is 'client' (another
// synthetic person, JWT-shaped so the collab sidecar reads its displayName claim: two people in one collab journey), and a
// second lab staff member, Blair Synthetic, when it is 'staff2' (two people on a lab board, not two tabs of one); 'named':
// a third lab staff member with a displayName in the answer and an opaque token without one, as Admin answers in
// production (FIX-PROD-A; FIX-PROD-E: the sidecar asks Admin's nexo_people for that name).
export const mockAdminSignedOutKey = 'nexo-mock-admin';
export const mockAdminToken = { requests: 0 };
// {alg: none} . {sub: …a002, displayName: 'Dr. Lee'} . signature (synthetic; the fake PostgREST vouches for it).
const mockClientToken = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMGEwMDIiLCJkaXNwbGF5TmFtZSI6IkRyLiBMZWUifQ.mock-client';
const mockStaffToken = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMGEwMDQiLCJkaXNwbGF5TmFtZSI6IkJsYWlyIFN5bnRoZXRpYyJ9.mock-staff';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export async function mockAdminTokenFetch(_url: string, init: RequestInit): Promise<Response> {
  init.signal?.throwIfAborted();
  mockAdminToken.requests++;
  let signedOut = false; try { signedOut = sessionStorage.getItem(mockAdminSignedOutKey) === 'signed-out'; } catch { /* no storage: signed in */ }
  if (signedOut) return json(401, { error: 'signed_out' });
  // 'client': a client member (nexo-store-scope.md), who does not see Upload ZIP.
  let who: string | null = null; try { who = sessionStorage.getItem(mockAdminSignedOutKey); } catch { /* no storage: staff */ }
  const member = who === 'client', second = who === 'staff2', named = who === 'named';
  return json(200, { accessToken: member ? mockClientToken : second ? mockStaffToken : named ? 'mock-named-token' : 'mock-admin-token', expiresAt: Math.floor(Date.now() / 1000) + 3600,
    userId: `00000000-0000-4000-8000-00000000a00${member ? 2 : second ? 4 : named ? 5 : 1}`, view: member ? 'client' : 'staff', ...(who === 'named' ? { displayName: 'Robin Synthetic' } : {}),
    // The member's client (mock/entry.ts), named even when nothing is released to it.
    ...(member && { clientNames: ['Fennel Hill group'] }) });
}
