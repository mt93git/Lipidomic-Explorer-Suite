import { adminBase } from './adminBase';
import { datasetStrings as d } from '../ui/strings';
// The signed-in Admin user's access token (docs/integration/admin-identity.md, steps 2 and 3). Admin's cookie is scoped to
// /admin, so Nexo asks Admin's same-origin route for the token and sends it in the dedicated header on dataset opens.
export const adminTokenUrl: string = import.meta.env.VITE_ADMIN_TOKEN_URL ?? `${adminBase}/api/session-token`;
/** Admin's sign-in page, coming back to `current` (the Nexo URL the person was on) once signed in. */
export const adminSignInUrl = (current: string) => `${adminBase}/sign-in?next=${encodeURIComponent(current)}`;
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
// Remember missing tokens for one minute, preserving Admin's signed-out response.
let noToken: { until: number; signedOut: boolean } | null = null;
let cached: { token: string; expiresAt: number } | null = null;
// Admin's view with the last token it gave (null signed out or never asked): read by the start page and the checkpoint
// dialog after their calls, so knowing it costs no extra request.
let lastView: AdminView | null = null, lastUserId: string | null = null, lastName: string | null = null, lastClients: string[] = [];
export const forgetAdminToken = () => { cached = null; noToken = null; lastView = null; lastUserId = null; lastName = null; lastClients = []; };
/** The token to send, or null when Admin gave none for a reason other than "signed out" (403, not there, network):
 *  the request then goes without one and the API decides. Throws AdminSignInRequired on 401; a cancel stays a cancel. */
export async function adminToken(signal?: AbortSignal): Promise<string | null> {
  if (cached && Date.now() < (cached.expiresAt - margin) * 1000) return cached.token;
  if (noToken && Date.now() < noToken.until) {
    if (noToken.signedOut) throw new AdminSignInRequired();
    return null;
  }
  noToken = null;
  cached = null;
  let response: Response;
  try { response = await (tokenFetch ?? fetch)(adminTokenUrl, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal }); }
  catch (e) { if (signal?.aborted || (e as Error)?.name === 'AbortError') throw e; noToken = { until: Date.now() + 60_000, signedOut: false }; return null; }
  if (!response.ok) noToken = { until: Date.now() + 60_000, signedOut: response.status === 401 };
  if (response.status === 401) { lastView = null; lastUserId = null; throw new AdminSignInRequired(); }
  if (!response.ok) return null;
  const value = await response.json().catch(e => { if (signal?.aborted || (e as Error)?.name === 'AbortError') throw e; return null; }) as { accessToken?: unknown; expiresAt?: unknown; userId?: unknown; view?: unknown; displayName?: unknown; clientNames?: unknown } | null;
  if (typeof value?.accessToken !== 'string' || !value.accessToken || typeof value.expiresAt !== 'number') {
    noToken = { until: Date.now() + 60_000, signedOut: false };
    return null;
  }
  cached = { token: value.accessToken, expiresAt: value.expiresAt };
  lastView = value.view === 'staff' || value.view === 'client' ? value.view : null;
  lastUserId = typeof value.userId === 'string' ? value.userId : null;
  lastName = typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName : claimedName(value.accessToken);
  lastClients = Array.isArray(value.clientNames) ? value.clientNames.filter((n): n is string => typeof n === 'string' && !!n.trim()) : [];
  return cached.token;
}
// Checkpoint calls (nexo-store-scope.md) go as today when Admin says signed out: the API decides (401 once the store is
// scoped, then the caller asks to sign in). A cancel stays a cancel.
/** The admin token header for an API call, or none without a token. */
export async function adminHeaders(signal?: AbortSignal, requireSignIn = false): Promise<Record<string, string>> {
  const token = await adminToken(signal).catch(e => { if (!requireSignIn && e instanceof AdminSignInRequired) return null; throw e; });
  return token ? { 'X-Nexo-Admin-Token': token } : {};
}
/** Admin's view of the signed-in person with the last token; null signed out, without Admin on this host or not asked yet
 *  (Nexo then shows what it shows today). */
export const knownAdminView = (): AdminView | null => lastView;
// The token's displayName claim, as the sidecar reads it (nexo-collab/src/admission.mjs identity); null without one.
function claimedName(token: string): string | null {
  try { const name = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).displayName; return typeof name === 'string' && name.trim() ? name : null; }
  catch { return null; }
}
/** The signed-in person's name: Admin's displayName with the token, else the token's claim, else "Lab staff" or
 *  "Member"; null signed out or not asked yet. */
export const adminDisplayName = (): string | null => lastName ?? (lastView === 'staff' ? 'Lab staff' : lastView === 'client' ? 'Member' : null);
/** The names of a client member's clients (Admin's clientNames), so Start names the group before anything is released. */
export const knownClientNames = (): string[] => lastClients;
/** The signed-in person's Admin userId with the last token (collab comments: Mentions and own 👍); null when not known. */
export const adminUserId = (): string | null => lastUserId;
/** Admin answered the token request (a token, signed out, or none): before that, adminUserId is null for everyone. */
export const adminAnswered = (): boolean => cached !== null || noToken !== null;
