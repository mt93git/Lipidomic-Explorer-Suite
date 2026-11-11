// Forgotten password (decision 4): the public Forgot password and Reset password pages' rules, their per-IP/per-email
// limit, and the demo's reset links. The live side is auth-service.ts; GoTrue sends the email through its SMTP with
// the template in auth-email/recovery.html (subject "Reset your password"), whose link opens /admin/reset-password.
import { createRateLimiter } from "./access-requests";
import { MIN_PASSWORD } from "./people";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// GoTrue's token hash (hex, optionally "pkce_"-prefixed) or the demo's "example-<uuid>"; anything else is not a link.
const TOKEN_HASH = /^[A-Za-z0-9_-]{16,200}$/;
const HOUR = 3_600_000;

export const RESET_SENT = "If that email has an account, a reset link is on its way. It works once, for one hour.";
export const RESET_DONE = "Password changed. Sign in with your new password.";

export function validateResetEmail(input: string): { email: string } | { error: string } {
  const email = input.trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 254 ? { email } : { error: "Enter a valid email address, like name@example.org." };
}

// The invitation page's rules (people.ts MIN_PASSWORD), checked before the link is spent.
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

export const isTokenHash = (value: unknown): value is string => typeof value === "string" && TOKEN_HASH.test(value);

// 5 requests an hour from one address, 3 a day for one email, both spent before GoTrue is asked (like Request access).
export const resetLimits = {
  ip: createRateLimiter({ max: 5, windowMs: HOUR }),
  email: createRateLimiter({ max: 3, windowMs: 24 * HOUR }),
};
export function takeResetLimit(ip: string, email: string, now = Date.now(), limits = resetLimits) {
  const byIp = limits.ip.take(`ip:${ip}`, now);
  const byEmail = limits.email.take(`email:${email}`, now);
  return byIp && byEmail;
}

// ---------------------------------------------------------------- demo links
// The demo sends no email: the Forgot password page shows the link it would have sent. Each link works once, for one
// hour, in this server process's memory (on globalThis so every route bundle and dev reload shares it).
type DemoLinks = Map<string, number>;
const demoLinks: DemoLinks = ((globalThis as unknown as { __leAdminResetLinks?: DemoLinks }).__leAdminResetLinks ??= new Map());

export function issueDemoResetLink(now = Date.now()): string {
  for (const [token, issued] of demoLinks) if (now - issued >= HOUR) demoLinks.delete(token);
  if (demoLinks.size >= 500) demoLinks.delete(demoLinks.keys().next().value as string);
  const token = `example-${crypto.randomUUID()}`;
  demoLinks.set(token, now);
  return resetPath(token);
}
export function spendDemoResetLink(token: string, now = Date.now()): boolean {
  const issued = demoLinks.get(token);
  demoLinks.delete(token);
  return issued !== undefined && now - issued < HOUR;
}
export const resetPath = (token: string) => `/reset-password?token_hash=${encodeURIComponent(token)}&type=recovery`;
