import { datasetStrings as d } from '../ui/strings';
// The signed-in Admin user's access token (docs/integration/admin-identity.md, steps 2 and 3). Admin's cookie is scoped to
// /admin, so Nexo asks Admin's same-origin route for the token and sends it as a Bearer header on dataset opens.
export const adminTokenUrl: string = import.meta.env.VITE_ADMIN_TOKEN_URL ?? '/admin/api/session-token';
/** Admin's sign-in page, coming back to `current` (the Nexo URL the person was on) once signed in. */
export const adminSignInUrl = (current: string) => `/admin/sign-in?next=${encodeURIComponent(current)}`;
/** Admin says the person is signed out (its 401), or the API refused the token (its 401 admin_auth_required). */
export class AdminSignInRequired extends Error {
  readonly code = 'admin_sign_in_required';
  constructor(message: string = d.signedOut) { super(message); this.name = 'AdminSignInRequired'; }
}
/** Lab staff or a client member, as Admin says with the token (docs/integration/nexo-store-scope.md). */
export type AdminView = 'staff' | 'client';
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
// Mock mode answers from src/mock/adminToken.ts; otherwise the browser's fetch (read per call, so tests can stub it).
let tokenFetch: Fetch | undefined;
export const useAdminTokenFetch = (fetcher: Fetch) => { tokenFetch = fetcher; };
// Kept until 60 s before it expires, so a request never leaves with a token about to lapse.
const margin = 60;
let cached: { token: string; expiresAt: number } | null = null;
// Admin's view with the last token it gave (null signed out or never asked): read by the start page and the checkpoint
// dialog after their calls, so knowing it costs no extra request.
let lastView: AdminView | null = null;
export const forgetAdminToken = () => { cached = null; lastView = null; };
/** The token to send, or null when Admin gave none for a reason other than "signed out" (403, not there, network):
 *  the request then goes without one and the API decides. Throws AdminSignInRequired on 401; a cancel stays a cancel. */
export async function adminToken(signal?: AbortSignal): Promise<string | null> {
  if (cached && Date.now() < (cached.expiresAt - margin) * 1000) return cached.token;
  cached = null;
  let response: Response;
  try { response = await (tokenFetch ?? fetch)(adminTokenUrl, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal }); }
  catch (e) { if (signal?.aborted || (e as Error)?.name === 'AbortError') throw e; return null; }
  if (response.status === 401) { lastView = null; throw new AdminSignInRequired(); }
  if (!response.ok) return null;
  const value = await response.json().catch(() => null) as { accessToken?: unknown; expiresAt?: unknown; view?: unknown } | null;
  if (typeof value?.accessToken !== 'string' || !value.accessToken || typeof value.expiresAt !== 'number') return null;
  cached = { token: value.accessToken, expiresAt: value.expiresAt };
  lastView = value.view === 'staff' || value.view === 'client' ? value.view : null;
  return cached.token;
}
// Checkpoint calls (nexo-store-scope.md) go as today when Admin says signed out: the API decides (401 once the store is
// scoped, then the caller asks to sign in). A cancel stays a cancel.
/** The Authorization header for a checkpoint call, or none without a token. */
export async function adminHeaders(signal?: AbortSignal): Promise<Record<string, string>> {
  const token = await adminToken(signal).catch(e => { if (e instanceof AdminSignInRequired) return null; throw e; });
  return token ? { Authorization: `Bearer ${token}` } : {};
}
/** Admin's view of the signed-in person with the last token; null signed out, without Admin on this host or not asked yet
 *  (Nexo then shows what it shows today). */
export const knownAdminView = (): AdminView | null => lastView;
