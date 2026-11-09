import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { totp, totpStep } from "./totp.mjs";

// Live mode end to end against staging (GoTrue + PostgREST + Postgres with RLS). Skipped unless ADMIN_E2E_LIVE=1
// and the Supabase settings and test users' credentials are in the environment (never committed). Run
// `node e2e/live/seed.mjs` first with the same environment, then, with no demo server on port 3110:
//   ADMIN_E2E_LIVE=1 npx playwright test e2e/live
// The dev server Playwright starts inherits NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY, so it runs in live mode.
const env = process.env;
const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ADMIN_E2E_OPERATOR_EMAIL", "ADMIN_E2E_OPERATOR_PASSWORD", "ADMIN_E2E_CLIENT_EMAIL", "ADMIN_E2E_CLIENT_PASSWORD"];
test.skip(env.ADMIN_E2E_LIVE !== "1" || required.some(name => !env[name]), "Live staging E2E: set ADMIN_E2E_LIVE=1, the Supabase settings and the test users' credentials");
test.describe.configure({ mode: "serial" });

type Seed = { orderCode: string; ownOrderCode: string; totpSecret?: string; totpStep?: number };
const seedFile = env.ADMIN_E2E_SEED_FILE ?? join(__dirname, ".seed.local.json");
function seed(): Seed {
  if (!existsSync(seedFile)) throw new Error(`Run node e2e/live/seed.mjs first (no ${seedFile})`);
  return JSON.parse(readFileSync(seedFile, "utf8")) as Seed;
}

const slow = { timeout: 60_000 };
const metadataSheet = [
  "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm",
  "E2E_Ctrl_1\tControl\tWildType\t1\tP01\t0h",
  "E2E_Ctrl_2\tControl\tWildType\t2\tP02\t0h",
  "E2E_Trt_1\tTreated\tWildType\t1\tP03\t24h",
].join("\n");

async function signIn(page: Page, email: string, password: string, totpSecret?: string) {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  if (totpSecret) {
    // GoTrue may refuse a code already used at enrollment: wait for the next 30-second step if needed.
    const used = seed().totpStep;
    while (totpStep() === used) await page.waitForTimeout(1_000);
    await page.getByLabel("Two-step code").fill(totp(totpSecret));
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("an operator signs in with TOTP, receives a shipment, registers samples and sees the order at Registered", async ({ page }) => {
  test.setTimeout(300_000);
  const { orderCode, totpSecret } = seed();
  await signIn(page, env.ADMIN_E2E_OPERATOR_EMAIL!, env.ADMIN_E2E_OPERATOR_PASSWORD!, totpSecret);
  // Lab staff land on the global pipeline, read from the database through their own token.
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
  await expect(page.getByRole("region", { name: "Request", exact: true }).getByRole("article", { name: orderCode })).toBeVisible(slow);

  await page.goto(`/admin/receive-shipment?order=${orderCode}`);
  await expect(page.getByRole("heading", { level: 1, name: "Receive shipment" })).toBeVisible(slow);
  await page.getByLabel("Carrier").fill("FedEx");
  await page.getByLabel("Tracking number").fill("E2E 0001");
  await page.getByRole("radio", { name: /^Intact and cold/ }).check();
  await page.getByLabel("Boxes").fill("1");
  await page.getByRole("button", { name: "Record arrival" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/sample-registry\\?order=${orderCode}&received=`), slow);

  await page.getByLabel("Paste from Excel").fill(metadataSheet);
  await page.getByRole("button", { name: "Add rows" }).click();
  await page.getByRole("button", { name: "Register 3 samples" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/sample-registry\\?order=${orderCode}&saved=3$`), slow);
  const registered = page.getByRole("table", { name: "Registered samples" });
  for (const n of ["001", "002", "003"]) await expect(registered.getByText(`${orderCode}-S${n}`, { exact: true })).toBeVisible(slow);

  await page.goto("/admin/pipeline");
  await expect(page.getByRole("region", { name: "Registered", exact: true }).getByRole("article", { name: orderCode })).toBeVisible(slow);
  await expect(page.getByRole("region", { name: "Request", exact: true }).getByRole("article", { name: orderCode })).toHaveCount(0);

  await page.goto(`/admin/orders/${orderCode}`);
  await expect(page.getByRole("heading", { level: 1, name: orderCode })).toBeVisible(slow);
  await expect(page.getByText("3 samples registered with metadata")).toBeVisible();
});

test("a client user signs in and does not see another client's order", async ({ page }) => {
  test.setTimeout(180_000);
  const { orderCode, ownOrderCode } = seed();
  await signIn(page, env.ADMIN_E2E_CLIENT_EMAIL!, env.ADMIN_E2E_CLIENT_PASSWORD!);
  // One membership: no client choice, the client home; the lab's global pipeline is not theirs.
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);
  await page.goto("/admin/pipeline");
  await expect(page).toHaveURL(/\/admin\/client\/home$/, slow);

  // Positive control: their own order opens.
  await page.goto(`/admin/orders/${ownOrderCode}`);
  await expect(page.getByRole("heading", { level: 1, name: ownOrderCode })).toBeVisible(slow);
  // Another client's order: RLS returns no row, so the page does not exist for them. (The workspace streams
  // behind loading.tsx, so Next may already have sent 200; the not-found page is the assertion.)
  await page.goto(`/admin/orders/${orderCode}`);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible(slow);
  await expect(page.getByText(orderCode)).toHaveCount(0);
});
