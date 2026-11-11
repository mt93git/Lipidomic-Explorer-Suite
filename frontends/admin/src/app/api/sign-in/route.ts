import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/access-requests";
import { startAppSession } from "@/lib/app-sign-in";
import { getEnvironment } from "@/lib/environment";
import { noStoreJson, sameOriginRequest } from "@/lib/session-token";

// POST <base path>/api/sign-in, JSON {email, password, code?}: Nexo's own sign-in page (same origin) signs in to Admin's
// account with the same authenticate and the same session cookie as Admin's sign-in form, so signed in to one is signed
// in to both. 200 {ok:true}; 401 {error: invalid_credentials | code_required | invalid_code}; 400 missing_fields;
// 503 unavailable (also the demo, which has no accounts); 403 cross_origin, decided before the body is read;
// 429 rate_limited with Retry-After (seconds) after too many failed attempts from this address or for this email.
// The password and code are passed to GoTrue only: never logged, never in an answer.
export const dynamic = "force-dynamic";

type Fields = { email: string; password: string; code: string };

async function fields(request: NextRequest): Promise<Fields | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { email, password, code = "" } = body as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string" || typeof code !== "string") return null;
  if (!email.trim() || !password) return null;
  return { email: email.trim(), password, code: code.trim() };
}

export async function POST(request: NextRequest) {
  if (!sameOriginRequest(request.headers)) return noStoreJson(403, { error: "cross_origin" });
  if (getEnvironment().mock) return noStoreJson(503, { error: "unavailable" });
  const given = await fields(request);
  if (!given) return noStoreJson(400, { error: "missing_fields" });
  const result = await startAppSession(given.email, given.password, given.code, clientIp(request.headers));
  if (result.ok) return noStoreJson(200, { ok: true });
  if (result.reason === "rate_limited") {
    const limited = noStoreJson(429, { error: "rate_limited" });
    limited.headers.set("Retry-After", String(result.retryAfter));
    return limited;
  }
  return noStoreJson(result.reason === "unavailable" ? 503 : 401, { error: result.reason });
}
