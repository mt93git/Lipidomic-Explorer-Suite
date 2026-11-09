#!/usr/bin/env node
// Seed for the staging E2E (e2e/live/live.spec.ts). Run it before each live E2E run: it creates or refreshes the
// two throwaway test users, enrolls a TOTP factor for the operator, and creates two fresh orders at Request.
//
//   Operator  (ADMIN_E2E_OPERATOR_EMAIL)  lab staff, role operator, TOTP factor verified
//   Client    (ADMIN_E2E_CLIENT_EMAIL)    requester of "E2E Live Client B" only
//   orderCode     a new order of "E2E Live Client A" at Request: the operator receives and registers it;
//                 the client must not see it
//   ownOrderCode  a new order of "E2E Live Client B": the client's own order (positive control)
//
// Everything comes from the environment (never committed):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   ADMIN_E2E_OPERATOR_EMAIL, ADMIN_E2E_OPERATOR_PASSWORD, ADMIN_E2E_CLIENT_EMAIL, ADMIN_E2E_CLIENT_PASSWORD
//   optional: ADMIN_E2E_AUTH_URL / ADMIN_E2E_REST_URL (direct GoTrue / PostgREST URLs when there is no gateway,
//   default <url>/auth/v1 and <url>/rest/v1), ADMIN_E2E_TOTP=0 (skip the factor if the stack has no TOTP).
// The service key is used only here, for GoTrue's admin API and for the admin-schema rows (it needs SELECT and
// INSERT on admin.client, client_member, lab_staff and "order"; the script says so if it is missing).
// Output: the two order codes on stdout; the codes and the TOTP secret in e2e/live/.seed.local.json (mode 600,
// git-ignored), which the spec reads. Passwords and keys are never printed or written.
//
//   node e2e/live/seed.mjs
import { chmodSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { totp, totpStep } from "./totp.mjs";

const env = process.env;
const need = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_E2E_OPERATOR_EMAIL", "ADMIN_E2E_OPERATOR_PASSWORD", "ADMIN_E2E_CLIENT_EMAIL", "ADMIN_E2E_CLIENT_PASSWORD"];
const missing = need.filter(name => !env[name]?.trim());
if (missing.length) { console.error(`seed: missing environment: ${missing.join(", ")}`); process.exit(2); }

// The seed resets passwords and factors: refuse anything but reserved test domains (RFC 2606/6761).
for (const name of ["ADMIN_E2E_OPERATOR_EMAIL", "ADMIN_E2E_CLIENT_EMAIL"]) {
  if (!/@[^@]+\.(test|invalid|example)$/i.test(env[name])) {
    console.error(`seed: ${name} must use a reserved test domain (.test, .invalid or .example); real accounts are never touched`);
    process.exit(2);
  }
}

const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const authUrl = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
const restUrl = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const seedFile = fileURLToPath(new URL("./.seed.local.json", import.meta.url));

async function call(url, { key, token, method = "GET", body, headers = {} }) {
  const res = await fetch(url, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = typeof data === "object" && data ? data.message ?? data.msg ?? data.error_description ?? data.error ?? "" : String(data);
    const hint = res.status === 401 || res.status === 403 || /permission denied/i.test(String(detail))
      ? " (the service role needs USAGE on schema admin and SELECT, INSERT on admin.client, client_member, lab_staff, \"order\")" : "";
    throw new Error(`${method} ${url.replace(base, "")}: ${res.status} ${detail}${hint}`);
  }
  return data;
}
const auth = (path, init = {}) => call(`${authUrl}${path}`, { key: service, ...init });
const rest = (path, init = {}) => call(`${restUrl}/${path}`, {
  key: service, ...init, headers: { "Accept-Profile": "admin", "Content-Profile": "admin", Prefer: "return=representation", ...init.headers },
});

// GoTrue admin API: create the user, or reset the password of the existing test user.
async function ensureUser(email, password) {
  for (let page = 1; ; page++) {
    const { users = [] } = await auth(`/admin/users?page=${page}&per_page=200`);
    const found = users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      await auth(`/admin/users/${found.id}`, { method: "PUT", body: { password, email_confirm: true } });
      return found.id;
    }
    if (users.length < 200) break;
  }
  const created = await auth("/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  return created.id;
}

async function ensureRow(table, query, row) {
  const found = await rest(`${table}?select=*&${query}`);
  if (found.length) return found[0];
  return (await rest(table, { method: "POST", body: row }))[0];
}

// A fresh verified TOTP factor for the operator (old factors of this test user are removed first).
async function enrollTotp(userId, email, password) {
  for (const factor of (await auth(`/admin/users/${userId}/factors`)) ?? []) {
    await auth(`/admin/users/${userId}/factors/${factor.id}`, { method: "DELETE" });
  }
  const session = await call(`${authUrl}/token?grant_type=password`, { key: anon, method: "POST", body: { email, password } });
  const user = { key: anon, token: session.access_token };
  const factor = await call(`${authUrl}/factors`, { ...user, method: "POST", body: { factor_type: "totp", friendly_name: "admin-e2e" } });
  const challenge = await call(`${authUrl}/factors/${factor.id}/challenge`, { ...user, method: "POST", body: {} });
  const verifiedAt = Date.now();
  await call(`${authUrl}/factors/${factor.id}/verify`, { ...user, method: "POST", body: { challenge_id: challenge.id, code: totp(factor.totp.secret, verifiedAt) } });
  return { totpSecret: factor.totp.secret, totpStep: totpStep(verifiedAt) };
}

const operatorId = await ensureUser(env.ADMIN_E2E_OPERATOR_EMAIL, env.ADMIN_E2E_OPERATOR_PASSWORD);
const clientUserId = await ensureUser(env.ADMIN_E2E_CLIENT_EMAIL, env.ADMIN_E2E_CLIENT_PASSWORD);

const clientA = await ensureRow("client", `name=eq.${encodeURIComponent("E2E Live Client A")}`, { name: "E2E Live Client A", kind: "pi_lab" });
const clientB = await ensureRow("client", `name=eq.${encodeURIComponent("E2E Live Client B")}`, { name: "E2E Live Client B", kind: "company" });
await ensureRow("lab_staff", `user_id=eq.${operatorId}&archived_at=is.null`, { user_id: operatorId, role: "operator", display_name: "E2E Operator" });
await ensureRow("client_member", `user_id=eq.${clientUserId}&client_id=eq.${clientB.id}&archived_at=is.null`, { client_id: clientB.id, user_id: clientUserId, role: "requester" });

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const [order] = await rest("order", { method: "POST", body: { client_id: clientA.id, title: `E2E live ${stamp}`, expected_samples: 3, matrix: "Synthetic plasma" } });
const [own] = await rest("order", { method: "POST", body: { client_id: clientB.id, title: `E2E live own ${stamp}`, expected_samples: 1 } });

const factor = env.ADMIN_E2E_TOTP === "0" ? {} : await enrollTotp(operatorId, env.ADMIN_E2E_OPERATOR_EMAIL, env.ADMIN_E2E_OPERATOR_PASSWORD);
writeFileSync(seedFile, `${JSON.stringify({ orderCode: order.code, ownOrderCode: own.code, ...factor }, null, 2)}\n`, { mode: 0o600 });
chmodSync(seedFile, 0o600);

console.log(`seed: operator and client users ready; orders ${order.code} (Client A, at Request) and ${own.code} (Client B)`);
console.log(`seed: ${factor.totpSecret ? "TOTP factor verified for the operator; " : ""}details for the spec in e2e/live/.seed.local.json`);
