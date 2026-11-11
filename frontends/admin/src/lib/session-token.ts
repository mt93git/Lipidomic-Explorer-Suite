import type { View } from "./models";
import { withBasePath } from "./base-path";

// GET <base path>/api/session-token (docs/integration/admin-identity.md). Nexo, served from the same origin, cannot read
// Admin's base-path-scoped cookie, so it asks this endpoint for the signed-in user's GoTrue access token and sends it as
// `Authorization: Bearer` to its own API, which checks it through admin.nexo_dataset_for_caller (0010).
// The route's path as the middleware sees it: without the basePath once Next applies it, with it otherwise.
export const isSessionTokenPath = (pathname: string) => pathname === "/api/session-token" || pathname === withBasePath("/api/session-token");
// The same-origin API routes Nexo calls, whose answers are exactly Cache-Control: no-store (the proxy keeps it so):
// this one, and POST /api/sign-in and /api/sign-out (Nexo's own sign-in page).
const noStorePaths = ["/api/session-token", "/api/sign-in", "/api/sign-out"];
export const isNoStoreApiPath = (pathname: string) => noStorePaths.some(path => pathname === path || pathname === withBasePath(path));

// clientNames: for a client member, the names of the clients they are an active member of (Nexo's Start copy);
// [] for lab staff.
export type SessionToken = { accessToken: string; expiresAt: number; userId: string; view: View; displayName: string | null; clientNames: string[] };

// Same origin only. A browser's Sec-Fetch-Site is authoritative when present: only "same-origin" passes ("same-site",
// "cross-site" and "none", a typed or bookmarked URL, do not). Without it (an older browser or a non-browser client),
// the request passes when it has no Origin or the app's own: the Origin's host must equal the host the request was
// addressed to (X-Forwarded-Host from the proxy, else Host), the comparison Next.js makes for Server Actions.
export function sameOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = headers.get("origin");
  if (origin === null) return true;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false; // "null" (an opaque origin) or anything unparseable
  }
}

// The subject (sub) of a JWT's payload, without verifying it: only to check that the stored access token is the user
// getAppSession verified with Auth (reading session.user from getSession on the server is what Supabase warns against).
export function tokenSubject(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const sub = claims && typeof claims === "object" ? (claims as { sub?: unknown }).sub : undefined;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

// Every answer is private to one person and short-lived: never stored by a browser or a proxy.
export const noStoreJson = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const answer = noStoreJson;

// 403 is decided before the session is read, so a cross-origin request neither refreshes it nor touches a token.
// A failure to read the session is 503, not 401: Nexo must not send someone to sign in again because Admin is down.
export async function sessionTokenResponse(headers: Headers, load: () => Promise<SessionToken | null>): Promise<Response> {
  if (!sameOriginRequest(headers)) return answer(403, { error: "cross_origin" });
  let token: SessionToken | null;
  try {
    token = await load();
  } catch {
    return answer(503, { error: "unavailable" });
  }
  if (!token) return answer(401, { error: "signed_out" });
  return answer(200, { accessToken: token.accessToken, expiresAt: token.expiresAt, userId: token.userId, view: token.view, displayName: token.displayName, clientNames: token.clientNames });
}
