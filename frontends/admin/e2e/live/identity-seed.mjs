#!/usr/bin/env node
// Seed for the identity E2E (e2e/live/identity.spec.ts, docs/admin/admin-identity-e2e.md). It finds, or creates, two
// synthetic client members, one per client, each on the client of a released dataset:
//
//   Alice (simulated client)  alice.sim@admin-staging.test  viewer of the client of the first order
//   Bob (simulated client)    bob.sim@admin-staging.test    viewer of the client of the second order
//
// The two orders are ADMIN_IDENTITY_ORDERS (e.g. ORD078,ORD082: each needs a released, unarchived dataset, and they
// must belong to different clients), or, when unset, the first two released datasets of different clients (oldest
// release first). Users and memberships are created only when missing; each run gives both members a new generated
// password (GoTrue admin API) and writes the passwords, user, client and dataset ids, order codes and versions to the
// file named by ADMIN_IDENTITY_CREDENTIALS (mode 600; keep it out of git, e.g.
// e2e/live/.identity-credentials.local.json, which is git-ignored). Nothing is archived or deleted and no existing row
// is changed: a member that is lab staff, has an archived membership of its client or an active membership of the other
// client, or has a verified TOTP factor, stops the seed with a message.
//
// Environment (never committed):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_IDENTITY_CREDENTIALS
//   optional: ADMIN_IDENTITY_ORDERS, ADMIN_E2E_AUTH_URL / ADMIN_E2E_REST_URL (direct GoTrue / PostgREST URLs when there
//   is no gateway, default <url>/auth/v1 and <url>/rest/v1).
// The service key is used only here. It needs USAGE on schema admin, SELECT on "order", dataset and lab_staff, and
// SELECT, INSERT on client_member. Passwords and keys are never printed.
//
//   ADMIN_IDENTITY_CREDENTIALS=e2e/live/.identity-credentials.local.json ADMIN_IDENTITY_ORDERS=ORD078,ORD082 \
//     node e2e/live/identity-seed.mjs
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";

const env = process.env;
const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_IDENTITY_CREDENTIALS"].filter(name => !env[name]?.trim());
if (missing.length) { console.error(`identity-seed: missing environment: ${missing.join(", ")}`); process.exit(2); }

const members = [
  { key: "alice", email: "alice.sim@admin-staging.test", name: "Alice (simulated client)" },
  { key: "bob", email: "bob.sim@admin-staging.test", name: "Bob (simulated client)" },
];

const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const authUrl = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
const restUrl = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
const service = env.SUPABASE_SERVICE_ROLE_KEY;

function stop(message) { console.error(`identity-seed: ${message}`); process.exit(1); }

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
      ? " (the service role needs USAGE on schema admin, SELECT on \"order\", dataset, lab_staff and SELECT, INSERT on client_member)" : "";
    throw new Error(`${method} ${url.replace(base, "")}: ${res.status} ${detail}${hint}`);
  }
  return data;
}
const auth = (path, init) => call(`${authUrl}${path}`, init);
const rest = (path, init = {}) => call(`${restUrl}/${path}`, {
  ...init, headers: { "Accept-Profile": "admin", "Content-Profile": "admin", Prefer: "return=representation", ...init.headers },
});

// Released, unarchived datasets of unarchived orders, oldest release first: { datasetId, clientId, order, version }.
async function releasedDatasets() {
  const datasets = await rest("dataset?select=id,client_id,order_id,version&status=eq.released&archived_at=is.null&order=released_at.asc.nullslast,created_at.asc");
  if (!datasets.length) return [];
  const orders = await rest(`order?select=id,code&archived_at=is.null&id=in.(${[...new Set(datasets.map(d => d.order_id))].join(",")})`);
  const code = new Map(orders.map(o => [o.id, o.code]));
  return datasets.filter(d => code.has(d.order_id))
    .map(d => ({ datasetId: d.id, clientId: d.client_id, order: code.get(d.order_id), version: d.version }));
}

async function pickDatasets() {
  const released = await releasedDatasets();
  const wanted = env.ADMIN_IDENTITY_ORDERS?.split(",").map(code => code.trim()).filter(Boolean);
  let picked;
  if (wanted?.length) {
    if (wanted.length !== 2) stop(`ADMIN_IDENTITY_ORDERS needs exactly two order codes, got ${wanted.length}`);
    picked = wanted.map(code => released.find(d => d.order === code) ?? stop(`${code} has no released, unarchived dataset`));
    if (picked[0].clientId === picked[1].clientId) stop(`${wanted.join(" and ")} belong to the same client; the run needs two clients`);
  } else {
    const first = released[0];
    const second = first && released.find(d => d.clientId !== first.clientId);
    if (!second) stop("no two released datasets of different clients; release one for a second client or set ADMIN_IDENTITY_ORDERS");
    picked = [first, second];
  }
  return picked;
}

// A generated password: 32 random URL-safe characters plus one of each class, for stacks with a strength policy.
const password = () => `${randomBytes(24).toString("base64url")}Aa1!`;

// GoTrue admin API: the member's account by email, or null.
async function findUser({ email }) {
  for (let page = 1; ; page++) {
    const { users = [] } = await auth(`/admin/users?page=${page}&per_page=200`);
    const found = users.find(user => user.email?.toLowerCase() === email);
    if (found) {
      if ((found.factors ?? []).some(factor => factor.status === "verified")) {
        stop(`${email} has a verified TOTP factor; the identity run signs in with a password only. Remove the factor by hand or use another stack.`);
      }
      return found.id;
    }
    if (users.length < 200) return null;
  }
}

// An existing account must be a client member only: never lab staff, never an active member of the other client, and
// its own membership not archived. Returns whether the membership must be inserted.
async function checkMembership(userId, { email }, clientId, otherClientId) {
  if (!userId) return true;
  const [staff] = await rest(`lab_staff?select=id&user_id=eq.${userId}&archived_at=is.null`);
  if (staff) stop(`${email} is lab staff; the identity run needs a client member only. Fix it by hand.`);
  const rows = await rest(`client_member?select=client_id,archived_at&user_id=eq.${userId}&client_id=in.(${clientId},${otherClientId})`);
  if (rows.some(row => row.client_id === otherClientId && !row.archived_at)) {
    stop(`${email} is an active member of the other client too; the seed never archives rows. Archive that membership by hand.`);
  }
  const own = rows.find(row => row.client_id === clientId);
  if (own?.archived_at) stop(`the membership of ${email} in its client is archived; the seed never restores rows. Restore it by hand.`);
  return !own;
}

// Everything is checked before anything is written, so a stopped seed leaves the accounts and the credentials file as
// they were.
const datasets = await pickDatasets();
const plan = [];
for (const [i, member] of members.entries()) {
  const userId = await findUser(member);
  const join = await checkMembership(userId, member, datasets[i].clientId, datasets[1 - i].clientId);
  plan.push({ member, dataset: datasets[i], userId, join });
}
const credentials = {};
for (const { member, dataset, join, ...found } of plan) {
  const secret = password();
  const profile = { password: secret, email_confirm: true, user_metadata: { display_name: member.name } };
  const userId = found.userId
    ? (await auth(`/admin/users/${found.userId}`, { method: "PUT", body: profile }), found.userId)
    : (await auth("/admin/users", { method: "POST", body: { email: member.email, ...profile } })).id;
  if (join) await rest("client_member", { method: "POST", body: { client_id: dataset.clientId, user_id: userId, role: "viewer" } });
  credentials[member.key] = { email: member.email, password: secret, name: member.name, userId, ...dataset };
}

const file = env.ADMIN_IDENTITY_CREDENTIALS;
writeFileSync(file, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
chmodSync(file, 0o600);

for (const { key } of members) {
  const c = credentials[key];
  console.log(`identity-seed: ${c.name} <${c.email}>: ${c.order} v${c.version}, dataset ${c.datasetId.slice(0, 8)}, client ${c.clientId.slice(0, 8)}, user ${c.userId.slice(0, 8)}`);
}
console.log(`identity-seed: passwords written to ${file} (mode 600)`);
