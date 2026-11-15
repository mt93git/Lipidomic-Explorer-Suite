import "server-only";
import { cookies } from "next/headers";
import { clientCookie, preferenceCookieOptions, signedOutCookie, viewCookie } from "./auth-cookies";
import { authenticate, endAppSession, type SignInResult } from "./auth-service";
import { createAdminClient } from "./supabase/server";

// Starting and ending an Admin session, shared by the sign-in form's actions (src/app/actions.ts) and Nexo's same-origin
// API (POST <base path>/api/sign-in and /api/sign-out), so both set and clear exactly the same cookies.

// ---------------------------------------------------------------- the failed-attempt limit

// Failed sign-ins (a wrong email or password, a refused two-step code) per key in a fixed window, in this server
// process's memory, like the Forgot password and Request access limits. Only failures count; a success clears that
// email's count. blockedFor answers the seconds left in a full window (0 when not limited).
export type FailureLimiter = {
  blockedFor: (key: string, now?: number) => number;
  fail: (key: string, now?: number) => void;
  clear: (key: string) => void;
  reset: () => void;
};
export function createFailureLimiter({ max, windowMs, maxKeys = 5000 }: { max: number; windowMs: number; maxKeys?: number }): FailureLimiter {
  const failures = new Map<string, { start: number; count: number }>();
  return {
    blockedFor(key, now = Date.now()) {
      const entry = failures.get(key);
      if (!entry || now - entry.start >= windowMs || entry.count < max) return 0;
      return Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000));
    },
    fail(key, now = Date.now()) {
      const entry = failures.get(key);
      if (entry && now - entry.start < windowMs) { entry.count += 1; return; }
      if (!entry && failures.size >= maxKeys) {
        for (const [old, value] of failures) if (now - value.start >= windowMs) failures.delete(old);
        if (failures.size >= maxKeys) failures.delete(failures.keys().next().value as string);
      }
      failures.set(key, { start: now, count: 1 });
    },
    clear: key => { failures.delete(key); },
    reset: () => failures.clear(),
  };
}
const FIFTEEN_MINUTES = 15 * 60_000;
// 10 failures per 15 minutes from one address, 5 per 15 minutes for one email (lower-cased).
export const signInLimits = {
  ip: createFailureLimiter({ max: 10, windowMs: FIFTEEN_MINUTES }),
  email: createFailureLimiter({ max: 5, windowMs: FIFTEEN_MINUTES }),
};
export const rateLimitedMessage = "Too many sign-in attempts. Wait a few minutes and try again, or reset your password.";
const countedFailures = new Set(["invalid_credentials", "invalid_code"]);

export type AppSignInResult = SignInResult | { ok: false; error: string; reason: "rate_limited"; retryAfter: number };

// Live mode only (the demo has no accounts). ip is the caller's address (clientIp). A limited attempt never reaches
// GoTrue. The session cookie is written by the cookie-backed client; on success the previous account's client
// preference is discarded before this account's memberships are resolved.
export async function startAppSession(email: string, password: string, code: string, ip: string, now = Date.now(), limits = signInLimits): Promise<AppSignInResult> {
  const ipKey = `ip:${ip}`;
  const emailKey = `email:${email.trim().toLowerCase()}`;
  const retryAfter = Math.max(limits.ip.blockedFor(ipKey, now), limits.email.blockedFor(emailKey, now));
  if (retryAfter) return { ok: false, error: rateLimitedMessage, reason: "rate_limited", retryAfter };
  const client = await createAdminClient();
  if (!client) return { ok: false, error: "Sign-in is unavailable. Please try again.", reason: "unavailable" };
  try {
    const result = await authenticate(client, email, password, code);
    if (!result.ok) {
      if (countedFailures.has(result.reason)) {
        limits.ip.fail(ipKey, now);
        limits.email.fail(emailKey, now);
      }
      return result;
    }
  } catch {
    return { ok: false, error: "The sign-in service is unavailable. Please try again.", reason: "unavailable" };
  }
  limits.email.clear(emailKey);
  (await cookies()).set(clientCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  return { ok: true };
}

// Ends the session on this browser (GoTrue's local scope) and marks the demo signed out, with no client or view left.
// false when GoTrue could not end a live session: it may still be active, and nothing else is changed.
export async function endSignedInSession(mock: boolean): Promise<boolean> {
  if (!mock) {
    const client = await createAdminClient();
    if (client) {
      const { error } = await endAppSession(client);
      if (error) return false;
    }
  }
  const store = await cookies();
  store.set(signedOutCookie, "1", preferenceCookieOptions);
  store.set(clientCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  store.set(viewCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  return true;
}
