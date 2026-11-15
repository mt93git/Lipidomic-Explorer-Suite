// Screenshot capture for the 2026-11-09 UX sweep of the Admin back office (demo mode, synthetic data only).
// Run from frontends/admin with the dev server on :3110:
//   node ../../docs/admin/ux-sweep-20261109/capture.mjs
// Writes screenshots/current-*.png next to this file. One browser context (the demo store is per cookie), the
// viewport is switched between 1440×900 and 390×844.
//   PREFIX=after node ../../docs/admin/ux-sweep-20261109/capture.mjs      writes after-*.png (the same flow)
//   ONLY=pipeline,release,...                                             writes only those shots (names without viewport)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = path.resolve(here, "../../../frontends/admin");
const require = createRequire(path.join(admin, "package.json"));
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://127.0.0.1:3110/admin";
const PREFIX = process.env.PREFIX ?? "current";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map(name => name.trim())) : null;
const out = path.join(here, "screenshots");
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const slow = { timeout: 60_000 };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const taken = [];

async function settle() {
  await page.waitForLoadState("networkidle", slow).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(250);
}
async function shot(name, { viewport = DESKTOP, fullPage = true } = {}) {
  if (ONLY && !ONLY.has(name)) return;
  await page.setViewportSize(viewport);
  // Hide the Next.js dev badge (dev-only) and reset the scroll: a full-page capture otherwise paints the
  // off-screen fixed "Skip to content" link at the scroll offset, which is an artefact of the capture, not the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const file = `${PREFIX}-${name}-${viewport.width}.png`;
  await page.screenshot({ path: path.join(out, file), fullPage });
  taken.push(file);
  console.log("shot", file);
}
async function both(name, url) {
  if (url) { await page.goto(`${BASE}${url}`); await settle(); }
  await shot(name);
  await shot(name, { viewport: PHONE });
  await page.setViewportSize(DESKTOP);
}
async function go(url) { await page.goto(`${BASE}${url}`); await settle(); }

// Sign-in
await go("/sign-in");
await both("sign-in");
await page.getByRole("button", { name: "Enter example workspace" }).click();
await page.waitForURL(/\/admin\/pipeline$/, slow);
await settle();

// Pipeline (staff home)
await both("pipeline");
await page.getByRole("button", { name: /Blocked at a gate/ }).click();
await settle();
await shot("pipeline-focus-blocked");
await go("/pipeline?client=example-cedar&focus=ready&group=client");
await shot("pipeline-by-client");
await go("/pipeline?focus=released");
await shot("pipeline-released-week");
await go("/pipeline?q=nothing-here-zzz&stage=in-batch&panel=Panel%20C%20%C2%B7%20sterols%20%26%20CE");
await shot("pipeline-empty");
await go("/pipeline");
await page.setViewportSize(PHONE);
await page.waitForTimeout(200);
await page.locator("details.menu", { hasText: "Stage" }).locator("summary").click();
await page.waitForTimeout(200);
await shot("pipeline-stage-menu", { viewport: PHONE, fullPage: false });
await page.setViewportSize(DESKTOP);
await go("/pipeline");
await shot("pipeline-fold", { fullPage: false });

// Top bar: collapsed on both viewports, and the opened Menu at 390 (finding 10, the phone top bar)
await go("/pipeline");
await both("topbar");
await page.setViewportSize(PHONE);
await page.getByRole("button", { name: "Menu" }).click();
await page.waitForTimeout(200);
await shot("topbar-menu", { viewport: PHONE, fullPage: false });
await page.setViewportSize(DESKTOP);

// Keyboard focus ring (topbar + sidebar)
await go("/pipeline");
for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
await page.waitForTimeout(150);
await shot("focus-ring", { fullPage: false });

// Order detail: blocked, released, client view later
await both("order-detail-blocked", "/orders/ORD041");
await go("/orders/ORD040");
await shot("order-detail-released");

// Placeholders: New order (sidebar entry, linked from the pipeline "+ New order")
await go("/new-order");
await shot("new-order-placeholder");

// Receive shipment
await both("receive-shipment", "/receive-shipment");
await page.getByLabel("Order", { exact: true }).selectOption({ label: "ORD042 · Example Cedar · Example lipid panel · feasibility" });
await page.waitForURL(/order=ORD042/, slow);
await settle();
await page.getByLabel("Carrier").fill("FedEx");
await page.getByLabel("Tracking number").fill("7489 0000 0001");
await page.getByRole("radio", { name: /^Intact and cold/ }).check();
await page.getByLabel("Boxes").fill("1");
await page.getByLabel("Notes").fill("Dry ice present on arrival.");
await shot("receive-shipment-filled");
// Server-side validation: strip the browser checks and submit an incomplete form.
await go("/receive-shipment?order=ORD052");
await page.evaluate(() => { document.querySelectorAll("form.record-form [required]").forEach(el => el.removeAttribute("required")); document.querySelector("form.record-form")?.setAttribute("novalidate", ""); });
await page.getByLabel("Boxes").fill("-2");
await page.getByRole("button", { name: "Record arrival" }).click();
await page.waitForTimeout(1500);
await settle();
await shot("receive-shipment-errors");
// Happy path to the registry
await go("/receive-shipment?order=ORD042");
await page.getByLabel("Carrier").fill("FedEx");
await page.getByLabel("Tracking number").fill("7489 0000 0001");
await page.getByRole("radio", { name: /^Intact and cold/ }).check();
await page.getByLabel("Boxes").fill("1");
await page.getByLabel("Notes").fill("Dry ice present on arrival.");
await page.getByRole("button", { name: "Record arrival" }).click();
await page.waitForURL(/\/sample-registry\?order=ORD042&received=/, slow);
await settle();
await shot("sample-registry-received");

// Sample registry: choose, paste, errors, long names, saved
await go("/sample-registry");
await shot("sample-registry-choose");
await go("/sample-registry?order=ORD042");
const sheet = [
  "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm",
  "Ctrl_1\tControl\tWildType\t1\tP01\t0h",
  "Ctrl_1\tControl\tWildType\t2\tP02\t0h",
  "\tTreated\tWildType\t1\tP03\t24h",
  "Patient_Cohort_A_Baseline_Visit_01_Plasma_Aliquot_Replicate_0001_Extra_Long_Identifier\tTreated_Long_Group_Name_For_Testing\tWildType\t1\tP04\t24h",
].join("\n");
await page.getByLabel("Paste from Excel").fill(sheet);
await page.getByRole("button", { name: "Add rows" }).click();
await settle();
await shot("sample-registry-errors");
await shot("sample-registry-errors", { viewport: PHONE });
await page.setViewportSize(DESKTOP);
await page.getByLabel("Row 2 FullName").fill("Ctrl_2");
await page.getByLabel("Row 3 FullName").fill("Trt_1");
await page.getByLabel("Row 4 FullName").fill("Trt_2");
await settle();
await shot("sample-registry-pasted");
await page.getByRole("button", { name: /Register 4 samples/ }).click();
await page.waitForURL(/saved=4$/, slow);
await settle();
await both("sample-registry-saved");

// Ingest results
await both("ingest-results", "/ingest-results");
await page.getByRole("combobox", { name: "Order", exact: true }).selectOption({ label: "ORD041 · registered" }, slow);
const source = readFileSync(path.join(admin, "e2e/fixtures/sciex-synthetic.txt"), "utf8");
const flagged = source.split("\n").map((line, i) => { if (i < 2 || !line) return line; const cells = line.split("\t"); cells[4] = "1"; return cells.join("\t"); }).join("\n");
await page.getByLabel("SCIEX OS results TXT").setInputFiles({ name: "synthetic-blank.txt", mimeType: "text/plain", buffer: Buffer.from(flagged) });
await page.getByLabel("SCIEX OS version").fill("3.1.0");
await page.getByRole("button", { name: "Parse file" }).click();
await page.getByText(/Blank injection\(s\).*sample-like detection/).waitFor(slow);
await settle();
await shot("ingest-results-summary");
await page.getByLabel("Override reason").fill("Reviewed synthetic blank; approved for demonstration.");
await page.getByRole("button", { name: "Accept", exact: true }).click();
await page.getByRole("status").filter({ hasText: "Processed" }).waitFor(slow);
await settle();
await shot("ingest-results-accepted");

// Name dictionary
await go("/name-dictionary");
await both("name-dictionary");

// Release: list, build, sign, release, withdraw
await both("release", "/release");
await page.getByRole("row", { name: /ORD048/ }).getByRole("button", { name: "Build dataset v1" }).click();
await page.waitForURL(/\/release\/[0-9a-f-]{36}\?built=1$/, slow);
await settle();
await both("release-dataset-built");
const datasetUrl = page.url();
await page.getByRole("combobox", { name: /^Sign as/ }).selectOption({ label: "Demo Reviewer A · Admin" });
await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("reviewed");
await page.getByRole("textbox", { name: "Note (optional)" }).fill("Reviewed the synthetic export.");
await page.getByRole("button", { name: "Sign", exact: true }).click();
await page.waitForURL(/\?signed=1$/, slow);
await settle();
await shot("release-dataset-signed-1of2");
await page.getByRole("combobox", { name: /^Sign as/ }).selectOption({ label: "Demo Reviewer B · Admin" });
await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("approved");
await page.getByRole("button", { name: "Sign", exact: true }).click();
await page.getByText("2 of 2 required signatures").waitFor(slow);
await settle();
await page.getByRole("combobox", { name: /^Release as/ }).selectOption({ label: "Demo Reviewer B · Admin" });
await page.getByRole("button", { name: "Release dataset" }).click();
await page.waitForURL(/\?released=1$/, slow);
await settle();
await shot("release-dataset-released");
await page.getByRole("textbox", { name: "Reason" }).fill("Synthetic: wrong metadata.");
await page.getByRole("button", { name: "Withdraw" }).click();
await page.waitForURL(/\?withdrawn=1$/, slow);
await settle();
await shot("release-dataset-withdrawn");

// Release policy, datasets
await both("release-policy", "/release-policy");
await both("datasets", "/datasets");

// Audit log
await both("audit-log", "/audit-log");
await go("/audit-log?entity=dataset&order=ORD048");
await page.getByText(/Dataset ORD048 v1 released/).first().click();
await page.waitForTimeout(200);
await shot("audit-log-filtered-expanded");
await go("/audit-log?order=ORD041");
await shot("audit-log-empty");

// Client view
await page.goto(`${BASE}/pipeline`); await settle();
await page.getByRole("button", { name: "Client", exact: true }).click();
await page.waitForURL(/\/admin\/(choose-client|client\/home)$/, slow);
await settle();
await both("choose-client");
await page.getByRole("button", { name: /Example Atlas/ }).click();
await page.waitForURL(/\/admin\/client\/home$/, slow);
await settle();
await shot("client-home");
await go("/client/order");
await shot("client-order-placeholder");
await both("client-order-detail", "/orders/ORD041");

console.log(JSON.stringify({ taken, datasetUrl }, null, 2));
await browser.close();
