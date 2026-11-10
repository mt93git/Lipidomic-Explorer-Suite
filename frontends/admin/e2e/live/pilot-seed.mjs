#!/usr/bin/env node
// Seed for the Admin pilot by simulation (e2e/live/pilot.spec.ts, docs/admin/admin-pilot-simulation.md). Run it before
// each pilot run. It creates, or finds, everything the story needs that no screen can create yet:
//
//   Stephania (simulated)  steph.sim@admin-staging.test  lab staff, role owner
//   Paula (simulated)      paula.sim@admin-staging.test  lab staff, role admin
//   "Pilot Simulation Client (synthetic)"                a synthetic client (kind pi_lab)
//   "Pilot Simulation Panel (synthetic)"                 a synthetic panel (global; no Instruments & panels screen yet)
//
// The run's order is created by Paula in New order (pilot.spec.ts step 2); the seed only chooses its title,
// "Admin pilot simulation <UTC minute> · run <8 hex>", which is also the run marker the pilot teardown archives by.
//
// Users and rows are found first and created only when missing. Each run gives both personas a new generated password
// (GoTrue admin API) and a fresh verified TOTP factor (lab staff must pass two-step sign-in, src/lib/two-step.ts; the
// persona's old factors are removed first, as e2e/live/seed.mjs does for the operator). It writes the passwords, TOTP
// secrets, the step each secret was verified in, the display names, the client and panel names and the order title
// to the file named by ADMIN_PILOT_CREDENTIALS (mode 600; keep it out of git, e.g.
// e2e/live/.pilot-credentials.local.json, which is git-ignored). The pilot global teardown withdraws the run dataset
// and archives its batch, aliquots and order; apart from the personas' old factors this seed deletes nothing. A
// persona whose lab_staff row is archived or has another role, or an archived client or panel, stops the seed: fix it
// by hand, the seed changes no existing row.
//
// Environment (never committed):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PILOT_CREDENTIALS
//   optional: ADMIN_E2E_AUTH_URL / ADMIN_E2E_REST_URL (direct GoTrue / PostgREST URLs when there is no gateway,
//   default <url>/auth/v1 and <url>/rest/v1).
// The service key is used only here. It needs USAGE on schema admin and SELECT, INSERT on admin.client, lab_staff and
// panel. The anon key signs each persona in to enroll its factor. Passwords, TOTP secrets and keys are never printed.
//
//   ADMIN_PILOT_CREDENTIALS=e2e/live/.pilot-credentials.local.json node e2e/live/pilot-seed.mjs
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { totp, totpStep } from "./totp.mjs";

const env = process.env;
const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PILOT_CREDENTIALS"].filter(name => !env[name]?.trim());
if (missing.length) { console.error(`pilot-seed: missing environment: ${missing.join(", ")}`); process.exit(2); }

const personas = {
  steph: { email: "steph.sim@admin-staging.test", name: "Stephania (simulated)", role: "owner" },
  paula: { email: "paula.sim@admin-staging.test", name: "Paula (simulated)", role: "admin" },
};
const CLIENT = "Pilot Simulation Client (synthetic)";
const PANEL = "Pilot Simulation Panel (synthetic)";
// The seed resets passwords and factors: only reserved test domains (RFC 2606/6761), as in e2e/live/seed.mjs.
for (const { email } of Object.values(personas)) {
  if (!/@[^@]+\.(test|invalid|example)$/i.test(email)) { console.error(`pilot-seed: ${email} is not on a reserved test domain`); process.exit(2); }
}

const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const authUrl = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
const restUrl = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function stop(message) { console.error(`pilot-seed: ${message}`); process.exit(1); }

async function call(url, { key = service, token, method = "GET", body, headers = {} } = {}) {
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
      ? " (the service role needs USAGE on schema admin and SELECT, INSERT on admin.client, lab_staff, panel)" : "";
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

// A fresh verified TOTP factor for a lab-staff persona (old factors of this test user are removed first), as
// enrollTotp in e2e/live/seed.mjs. Returns the secret and the 30-second step its code was used in.
async function enrollTotp(userId, email, secret) {
  for (const factor of (await auth(`/admin/users/${userId}/factors`)) ?? []) {
    await auth(`/admin/users/${userId}/factors/${factor.id}`, { method: "DELETE" });
  }
  const session = await auth("/token?grant_type=password", { key: anon, method: "POST", body: { email, password: secret } });
  const user = { key: anon, token: session.access_token };
  const factor = await auth("/factors", { ...user, method: "POST", body: { factor_type: "totp", friendly_name: "admin-pilot" } });
  const challenge = await auth(`/factors/${factor.id}/challenge`, { ...user, method: "POST", body: {} });
  const verifiedAt = Date.now();
  await auth(`/factors/${factor.id}/verify`, { ...user, method: "POST", body: { challenge_id: challenge.id, code: totp(factor.totp.secret, verifiedAt) } });
  return { totpSecret: factor.totp.secret, totpStep: totpStep(verifiedAt) };
}

async function ensureClient() {
  const [found] = await rest(`client?select=id,archived_at&name=eq.${encodeURIComponent(CLIENT)}`);
  if (found?.archived_at) stop(`the client "${CLIENT}" is archived; the seed never restores rows. Restore it by hand.`);
  return found ?? (await rest("client", { method: "POST", body: { name: CLIENT, kind: "pi_lab", notes: "Synthetic client of the Admin pilot simulation." } }))[0];
}

// The panel New order and the batch builder choose (admin.panel has no screen yet: phase 2).
async function ensurePanel() {
  const [found] = await rest(`panel?select=id,archived_at&name=eq.${encodeURIComponent(PANEL)}`);
  if (found?.archived_at) stop(`the panel "${PANEL}" is archived; the seed never restores rows. Restore it by hand.`);
  return found ?? (await rest("panel", { method: "POST", body: { name: PANEL, dataset_type: "global", lc_method: "Synthetic LC method (pilot simulation)" } }))[0];
}

const credentials = {};
for (const [key, persona] of Object.entries(personas)) {
  const secret = password();
  const userId = await ensureUser(persona, secret);
  await ensureStaff(userId, persona);
  credentials[key] = { email: persona.email, password: secret, name: persona.name, ...await enrollTotp(userId, persona.email, secret) };
}
await ensureClient();
await ensurePanel();
// Unique per run: the teardown finds this run's order (and through it the batch) by this exact title.
const orderTitle = `Admin pilot simulation ${new Date().toISOString().slice(0, 16).replace("T", " ")} · run ${randomBytes(4).toString("hex")}`;

const file = env.ADMIN_PILOT_CREDENTIALS;
writeFileSync(file, `${JSON.stringify({ ...credentials, clientName: CLIENT, panelName: PANEL, orderTitle }, null, 2)}\n`, { mode: 0o600 });
chmodSync(file, 0o600);

console.log(`pilot-seed: ${Object.values(personas).map(p => `${p.name} <${p.email}> (${p.role})`).join(", ")} ready, TOTP factors verified`);
console.log(`pilot-seed: client "${CLIENT}", panel "${PANEL}" ready; order title "${orderTitle}" (Paula creates it in New order); passwords, TOTP secrets and the title written to ${file} (mode 600)`);
