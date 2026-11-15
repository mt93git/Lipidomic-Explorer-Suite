// Playwright global teardown of the live staging E2E (ADMIN_E2E_LIVE=1, e2e/live/live.spec.ts). Runs after every
// run, failed ones included: it archives the two orders e2e/live/seed.mjs created for this run (archived_at and
// archived_reason; nothing is ever deleted) and drops their codes from the seed file, so each run leaves no live
// orders behind and a rerun needs a fresh seed. The fixed fixtures (the two test users, "E2E Live Client A/B" and
// their memberships) stay for the next run. It signs in as the test operator with their password (lab staff may
// archive orders under RLS); no service key is used. Tokens and passwords are never printed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ARCHIVED_REASON = "E2E live run finished";

async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = typeof data === "object" && data ? data.message ?? data.msg ?? data.error_description ?? data.error ?? "" : String(data);
    throw new Error(`live teardown: ${init.method} ${new URL(url).pathname}: ${res.status} ${detail}`);
  }
  return data;
}

export default async function teardown() {
  const env = process.env;
  if (env.ADMIN_E2E_LIVE !== "1") return;
  const seedFile = env.ADMIN_E2E_SEED_FILE || fileURLToPath(new URL("./.seed.local.json", import.meta.url));
  if (!existsSync(seedFile)) return;
  const seed = JSON.parse(readFileSync(seedFile, "utf8"));
  const codes = [seed.orderCode, seed.ownOrderCode].filter(code => /^ORD\d{3,}$/.test(code ?? ""));
  if (!codes.length) return;

  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const authUrl = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
  const restUrl = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const session = await call(`${authUrl}/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.ADMIN_E2E_OPERATOR_EMAIL, password: env.ADMIN_E2E_OPERATOR_PASSWORD }),
  });
  const archived = await call(`${restUrl}/order?code=in.(${codes.join(",")})&archived_at=is.null`, {
    method: "PATCH",
    headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Accept-Profile": "admin", "Content-Profile": "admin",
      "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ archived_at: new Date().toISOString(), archived_reason: ARCHIVED_REASON }),
  });
  delete seed.orderCode;
  delete seed.ownOrderCode;
  writeFileSync(seedFile, `${JSON.stringify(seed, null, 2)}\n`, { mode: 0o600 });
  console.log(`live teardown: archived ${Array.isArray(archived) ? archived.map(row => row.code).join(", ") || "nothing (already archived)" : codes.join(", ")}`);
}
