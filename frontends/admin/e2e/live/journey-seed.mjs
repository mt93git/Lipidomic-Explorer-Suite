#!/usr/bin/env node
// Seed for the golden journey (e2e/live/journey.spec.ts, docs/admin/admin-golden-journey.md). Run it before each run.
// It creates, or finds, only the STAFF side that no screen can create:
//
//   Stephania (simulated)  steph.sim@admin-staging.test  lab staff, role owner
//   Paula (simulated)      paula.sim@admin-staging.test  lab staff, role admin   (the pilot's two personas)
//
// It does NOT create the client lab, Dana, Lee, the order, or the run's instrument and panel: the spec makes them through the screens (Request access,
// People, Request an order). It chooses this run's id (<UTC yyyymmdd-hhmm>-<4 hex>), the names derived from it
// (journey-run.mjs) and a password for Dana and Lee, whose accounts the accept-invitation screen creates.
// Each run gives Paula and Stephania a new generated password and a fresh verified TOTP factor (lab staff must pass
// two-step sign-in). Everything goes to ADMIN_JOURNEY_CREDENTIALS (mode 600, git-ignored: e2e/live/.journey-credentials
// *.json). Prints no password, secret or key. The run id in that file is the teardown's retry marker: while it is
// there (a run whose cleanup failed), this seed refuses to run, since new passwords would lock the teardown out.
//
// Environment (never committed): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// ADMIN_JOURNEY_CREDENTIALS; optional ADMIN_E2E_AUTH_URL / ADMIN_E2E_REST_URL as for the pilot seed.
//   ADMIN_JOURNEY_CREDENTIALS=e2e/live/.journey-credentials.local.json node e2e/live/journey-seed.mjs
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { newRunId, RUN_ID, runNames } from "./journey-run.mjs";
import { createSeedKit } from "./seed-kit.mjs";

const env = process.env;
const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_JOURNEY_CREDENTIALS"].filter(name => !env[name]?.trim());
if (missing.length) { console.error(`journey-seed: missing environment: ${missing.join(", ")}`); process.exit(2); }

const personas = {
  steph: { email: "steph.sim@admin-staging.test", name: "Stephania (simulated)", role: "owner" },
  paula: { email: "paula.sim@admin-staging.test", name: "Paula (simulated)", role: "admin" },
};
const runId = newRunId();
const names = runNames(runId);
// The seed resets passwords and factors: only reserved test domains (RFC 2606/6761).
for (const email of [...Object.values(personas).map(p => p.email), names.dana.email, names.lee.email]) {
  if (!/@[^@]+\.(test|invalid|example)$/i.test(email)) { console.error(`journey-seed: ${email} is not on a reserved test domain`); process.exit(2); }
}

const file = env.ADMIN_JOURNEY_CREDENTIALS;
if (existsSync(file)) {
  let earlier = null;
  try { earlier = JSON.parse(readFileSync(file, "utf8")); } catch { /* not JSON: replaced below */ }
  if (RUN_ID.test(earlier?.runId ?? "")) {
    console.error(`journey-seed: ${file} still holds run ${earlier.runId}, whose cleanup has not succeeded. Reseeding would change the passwords its teardown signs in with. Re-run the teardown first (docs/admin/admin-golden-journey.md).`);
    process.exit(1);
  }
}

const kit = createSeedKit(env, "journey-seed");
const credentials = {};
for (const [key, persona] of Object.entries(personas)) {
  const secret = kit.password();
  const userId = await kit.ensureUser(persona, secret);
  await kit.ensureStaff(userId, persona);
  credentials[key] = { email: persona.email, password: secret, name: persona.name, userId };
  // Two-step sign-in is off (Admin 8070cbbe): remove any old TOTP factor, enroll none.
  for (const factor of (await kit.auth(`/admin/users/${userId}/factors`)) ?? []) await kit.auth(`/admin/users/${userId}/factors/${factor.id}`, { method: "DELETE" });
}

writeFileSync(file, `${JSON.stringify({
  runId, ...credentials, clientName: names.clientName, orderTitle: names.orderTitle,
  dana: { ...names.dana, password: kit.password() }, lee: { ...names.lee, password: kit.password() },
}, null, 2)}\n`, { mode: 0o600 });
chmodSync(file, 0o600);

console.log(`journey-seed: ${Object.values(personas).map(p => `${p.name} <${p.email}> (${p.role})`).join(", ")} ready, no TOTP factors`);
console.log(`journey-seed: run ${runId}: the client lab, Dana, Lee, the instrument, the panel and the order are made by the spec through the screens; credentials written to ${file} (mode 600)`);
