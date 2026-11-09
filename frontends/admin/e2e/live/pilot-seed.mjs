#!/usr/bin/env node
// Seed for the Admin pilot by simulation (e2e/live/pilot.spec.ts, docs/admin/admin-pilot-simulation.md). Run it before
// each pilot run. It creates, or finds, everything the story needs that no screen can create yet:
//
//   Stephania (simulated)  steph.sim@admin-staging.test  lab staff, role owner
//   Paula (simulated)      paula.sim@admin-staging.test  lab staff, role admin
//   "Pilot Simulation Client (synthetic)"                a synthetic client (kind pi_lab)
//   a fresh order of that client at Request              (New order is still a placeholder screen)
//
// Users and rows are found first and created only when missing. Each run gives both personas a new generated password
// (GoTrue admin API) and writes the passwords, the display names, the client name and the new order code to the file
// named by ADMIN_PILOT_CREDENTIALS (mode 600; keep it out of git, e.g. e2e/live/.pilot-credentials.local.json, which
// is git-ignored). Nothing is archived or deleted. A persona whose lab_staff row is archived or has another role, or
// whose account has a verified TOTP factor, stops the seed: fix it by hand, the seed changes no existing row.
//
// Environment (never committed):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PILOT_CREDENTIALS
//   optional: ADMIN_E2E_AUTH_URL / ADMIN_E2E_REST_URL (direct GoTrue / PostgREST URLs when there is no gateway,
//   default <url>/auth/v1 and <url>/rest/v1).
// The service key is used only here. It needs USAGE on schema admin and SELECT, INSERT on admin.client, lab_staff and
// "order" (the same grants as e2e/live/seed.mjs). Passwords and keys are never printed.
//
//   ADMIN_PILOT_CREDENTIALS=e2e/live/.pilot-credentials.local.json node e2e/live/pilot-seed.mjs
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";

const env = process.env;
const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PILOT_CREDENTIALS"].filter(name => !env[name]?.trim());
if (missing.length) { console.error(`pilot-seed: missing environment: ${missing.join(", ")}`); process.exit(2); }

const personas = {
  steph: { email: "steph.sim@admin-staging.test", name: "Stephania (simulated)", role: "owner" },
  paula: { email: "paula.sim@admin-staging.test", name: "Paula (simulated)", role: "admin" },
};
const CLIENT = "Pilot Simulation Client (synthetic)";

const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const authUrl = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
const restUrl = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
const service = env.SUPABASE_SERVICE_ROLE_KEY;

function stop(message) { console.error(`pilot-seed: ${message}`); process.exit(1); }

async function call(url, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = typeof data === "object" && data ? data.message ?? data.msg ?? data.error_description ?? data.error ?? "" : String(data);
    const hint = res.status === 401 || res.status === 403 || /permission denied/i.test(String(detail))
      ? " (the service role needs USAGE on schema admin and SELECT, INSERT on admin.client, lab_staff, \"order\")" : "";
    throw new Error(`${method} ${url.replace(base, "")}: ${res.status} ${detail}${hint}`);
  }
  return data;
}
const auth = (path, init) => call(`${authUrl}${path}`, init);
const rest = (path, init = {}) => call(`${restUrl}/${path}`, {
  ...init, headers: { "Accept-Profile": "admin", "Content-Profile": "admin", Prefer: "return=representation", ...init.headers },
});

// A generated password: 32 random URL-safe characters plus one of each class, for stacks with a strength policy.
const password = () => `${randomBytes(24).toString("base64url")}Aa1!`;

// GoTrue admin API: find the persona by email (create it when missing) and set its new password and display name.
async function ensureUser({ email, name }, secret) {
  for (let page = 1; ; page++) {
    const { users = [] } = await auth(`/admin/users?page=${page}&per_page=200`);
    const found = users.find(user => user.email?.toLowerCase() === email);
    if (found) {
      if ((found.factors ?? []).some(factor => factor.status === "verified")) {
        stop(`${email} has a verified TOTP factor; the pilot signs in with a password only. Remove the factor by hand or use another stack.`);
      }
      await auth(`/admin/users/${found.id}`, { method: "PUT", body: { password: secret, email_confirm: true, user_metadata: { display_name: name } } });
      return found.id;
    }
    if (users.length < 200) break;
  }
  const created = await auth("/admin/users", { method: "POST", body: { email, password: secret, email_confirm: true, user_metadata: { display_name: name } } });
  return created.id;
}

// admin.lab_staff (user_id is unique): insert when missing; an existing row is used only as it is.
async function ensureStaff(userId, { email, name, role }) {
  const [found] = await rest(`lab_staff?select=role,display_name,archived_at&user_id=eq.${userId}`);
  if (!found) return rest("lab_staff", { method: "POST", body: { user_id: userId, role, display_name: name } });
  if (found.archived_at) stop(`the lab_staff row of ${email} is archived; the seed never restores rows. Restore it by hand.`);
  if (found.role !== role) stop(`the lab_staff row of ${email} has role ${found.role}, not ${role}; the seed never changes rows. Fix it by hand.`);
  if (found.display_name !== name) console.log(`pilot-seed: note: ${email} is shown as "${found.display_name ?? email}" (left unchanged)`);
}

async function ensureClient() {
  const [found] = await rest(`client?select=id,archived_at&name=eq.${encodeURIComponent(CLIENT)}`);
  if (found?.archived_at) stop(`the client "${CLIENT}" is archived; the seed never restores rows. Restore it by hand.`);
  return found ?? (await rest("client", { method: "POST", body: { name: CLIENT, kind: "pi_lab", notes: "Synthetic client of the Admin pilot simulation." } }))[0];
}

const credentials = {};
for (const [key, persona] of Object.entries(personas)) {
  const secret = password();
  const userId = await ensureUser(persona, secret);
  await ensureStaff(userId, persona);
  credentials[key] = { email: persona.email, password: secret, name: persona.name };
}
const client = await ensureClient();
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const [order] = await rest("order", { method: "POST", body: { client_id: client.id, title: `Admin pilot simulation ${stamp}`, expected_samples: 3, matrix: "Synthetic plasma" } });

const file = env.ADMIN_PILOT_CREDENTIALS;
writeFileSync(file, `${JSON.stringify({ ...credentials, clientName: CLIENT, orderCode: order.code }, null, 2)}\n`, { mode: 0o600 });
chmodSync(file, 0o600);

console.log(`pilot-seed: ${Object.values(personas).map(p => `${p.name} <${p.email}> (${p.role})`).join(", ")} ready`);
console.log(`pilot-seed: client "${CLIENT}", new order ${order.code} at Request; passwords and the order code written to ${file} (mode 600)`);
