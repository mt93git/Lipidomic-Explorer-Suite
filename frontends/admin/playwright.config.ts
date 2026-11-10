import { defineConfig, devices } from "@playwright/test";

// E2E runs against the dev server in demo mode (no Supabase env vars), under the app's /admin basePath.
// NEXT_PUBLIC_NEXO_URL defaults to a placeholder so the release spec can assert the Open in Nexo link (Nexo is not
// started); the dev server and the workers inherit it.
// ADMIN_E2E_PILOT=1 (docs/admin/admin-pilot-simulation.md): only e2e/live/pilot.spec.ts, against the deployed origin in
// ADMIN_PILOT_BASE_URL that serves /admin and /nexo-staging; no dev server is started.
// Pilot global teardown withdraws released datasets and archives the run batch, aliquots and order, failed runs included.
// ADMIN_E2E_IDENTITY=1 (docs/admin/admin-identity-e2e.md): the same, with only e2e/live/identity.spec.ts.
// ADMIN_E2E_LIVE=1 (e2e/live/live.spec.ts): after the run, failed or not, e2e/live/teardown.mjs archives the two
// orders e2e/live/seed.mjs created for it.
process.env.NEXT_PUBLIC_NEXO_URL ||= "http://127.0.0.1:3120/nexo";
const live = process.env.ADMIN_E2E_PILOT === "1" ? "live/pilot.spec.ts"
  : process.env.ADMIN_E2E_IDENTITY === "1" ? "live/identity.spec.ts" : undefined;
export default defineConfig({
  testDir: "e2e",
  ...(live ? { testMatch: live } : {}),
  ...(process.env.ADMIN_E2E_PILOT === "1" ? { globalSetup: "./e2e/live/pilot-setup.mjs", globalTeardown: "./e2e/live/pilot-teardown.mjs" }
    : process.env.ADMIN_E2E_LIVE === "1" ? { globalTeardown: "./e2e/live/teardown.mjs" } : {}),
  use: { baseURL: live ? process.env.ADMIN_PILOT_BASE_URL : "http://127.0.0.1:3110/admin" },
  webServer: live ? undefined : { command: "npm run dev -- --port 3110", url: "http://127.0.0.1:3110/admin/sign-in", reuseExistingServer: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
