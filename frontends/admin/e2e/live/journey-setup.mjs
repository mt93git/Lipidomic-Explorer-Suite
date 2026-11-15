// Playwright global setup of the golden journey (ADMIN_E2E_JOURNEY=1), in the coordinator process the teardown shares.
// 1. Captures this run's id from the credential file (the teardown's marker, as pilot-setup.mjs does for the order).
// 2. Clears the last run's screenshots and steps.json (Playwright clears its own videos folder).
// 3. Records what the run is about to change, once per seed: the current release policy and the shipping text, read with
//    Stephania's token (never the service key). The teardown puts them back. If that read fails the run stops here,
//    before anything has been changed.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evidenceDir, RUN_ID } from "./journey-run.mjs";

export default async function setup() {
  const env = process.env;
  delete env.ADMIN_JOURNEY_RUN_ID;
  if (env.ADMIN_E2E_JOURNEY !== "1") return;
  const file = env.ADMIN_JOURNEY_CREDENTIALS;
  if (!file || !existsSync(file)) return;
  const run = JSON.parse(readFileSync(file, "utf8"));
  if (!RUN_ID.test(run.runId ?? "")) return;
  env.ADMIN_JOURNEY_RUN_ID = run.runId;
  for (const part of ["desktop", "mobile", "files"]) rmSync(join(evidenceDir, part), { recursive: true, force: true });
  rmSync(join(evidenceDir, "steps.json"), { force: true });
  if ("previousPolicy" in run && "previousShipping" in run) return;

  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const auth = (env.ADMIN_E2E_AUTH_URL || `${base}/auth/v1`).replace(/\/+$/, "");
  const rest = (env.ADMIN_E2E_REST_URL || `${base}/rest/v1`).replace(/\/+$/, "");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const get = async (url, init) => {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`journey setup: ${init.method ?? "GET"} ${new URL(url).pathname}: ${res.status}`); // status only
    return res.json();
  };
  const session = await get(`${auth}/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: run.steph.email, password: run.steph.password }),
  });
  if (!session?.access_token) throw new Error("journey setup: sign-in returned no token");
  const headers = { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Accept-Profile": "admin" };
  const [policy] = await get(`${rest}/release_policy?select=eligible_signers,required_signatures&archived_at=is.null`, { headers });
  const [shipping] = await get(`${rest}/shipping_instructions?select=body&archived_at=is.null`, { headers });
  const current = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, `${JSON.stringify({
    ...current,
    previousPolicy: policy ? { eligible_signers: policy.eligible_signers, required_signatures: policy.required_signatures } : null,
    previousShipping: shipping?.body ?? null,
  }, null, 2)}\n`, { mode: 0o600 });
}
