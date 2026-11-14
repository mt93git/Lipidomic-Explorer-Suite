import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { resultsForBatch } from "./pilot-results.mjs";
import { totp, totpStep } from "./totp.mjs";

// Admin pilot by simulation (docs/admin/admin-pilot-simulation.md): two synthetic personas run the whole release flow
// through the screens, against the deployed Admin staging stack and the Nexo staging API. Skipped unless
// ADMIN_E2E_PILOT=1. Then playwright.config.ts runs only this spec, against ADMIN_PILOT_BASE_URL (one origin serving
// /admin and /nexo-staging), and starts no dev server. Run e2e/live/pilot-seed.mjs first; it writes the personas'
// passwords, their TOTP secrets, the synthetic client and panel and this run's order title to the file named by
// ADMIN_PILOT_CREDENTIALS, which this spec reads. Paula creates the order with that title in New order and carries it
// through the batch builder and batch run; the global teardown archives what the run created, found by that title.
// Lab staff pass the two-step code at sign-in (src/lib/two-step.ts), as in e2e/live/live.spec.ts.
//   ADMIN_E2E_PILOT=1 ADMIN_PILOT_BASE_URL=https://… ADMIN_PILOT_CREDENTIALS=e2e/live/.pilot-credentials.local.json \
//     npx playwright test
// Optional ADMIN_PILOT_NEXO_USER / ADMIN_PILOT_NEXO_PASSWORD: the nginx password in front of Nexo, if it asks for one.
// A full-page screenshot of each step goes to e2e/live/pilot-evidence/ (git-ignored), with the batch's two CSVs and the
// results TXT the run uploaded.
const env = process.env;
test.skip(env.ADMIN_E2E_PILOT !== "1", "Admin pilot by simulation: set ADMIN_E2E_PILOT=1, ADMIN_PILOT_BASE_URL and ADMIN_PILOT_CREDENTIALS");
test.describe.configure({ mode: "serial" });
if (env.ADMIN_PILOT_NEXO_USER) test.use({ httpCredentials: { username: env.ADMIN_PILOT_NEXO_USER, password: env.ADMIN_PILOT_NEXO_PASSWORD ?? "" } });

// Lab staff carry a TOTP secret and the 30-second step its code was last used in; client personas would have none.
type Persona = { email: string; password: string; name: string; totpSecret?: string; totpStep?: number };
type PilotRun = { steph: Persona; paula: Persona; clientName: string; panelName: string; orderTitle: string };
function pilotRun(): PilotRun {
  if (!env.ADMIN_PILOT_BASE_URL) throw new Error("Set ADMIN_PILOT_BASE_URL to the origin that serves /admin and /nexo-staging");
  const file = env.ADMIN_PILOT_CREDENTIALS;
  if (!file || !existsSync(file)) throw new Error(`Run node e2e/live/pilot-seed.mjs first with ADMIN_PILOT_CREDENTIALS set (no ${file ?? "file named"})`);
  const run = JSON.parse(readFileSync(file, "utf8")) as PilotRun;
  for (const persona of [run.steph, run.paula]) {
    if (!persona?.totpSecret) throw new Error(`Run node e2e/live/pilot-seed.mjs again: ${persona?.email ?? "a persona"} has no TOTP secret`);
  }
  // This seed's title (the teardown's run marker); a file without it is from an older seed or an archived run.
  if (!run.orderTitle || !run.panelName) throw new Error("Run node e2e/live/pilot-seed.mjs again: the file names no order title or panel for this run");
  return run;
}

const slow = { timeout: 60_000 };
const nexoSlow = { timeout: 180_000 }; // Team prepares the dataset and draws the first plot on the real API
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const evidence = join(__dirname, "pilot-evidence");
// The synthetic SCIEX export's injections S1, S2, S3 are registered with those FullNames, in two groups. The batch
// names them by sample code, so the run uploads the export renamed to its batch (e2e/live/pilot-results.mjs).
const sciexTxt = join(__dirname, "../../../../packages/admin-ingest/test/fixtures/sciex-synthetic.txt");
const metadataSheet = [
  "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm",
  "S1\tControl\tWildType\t1\tP01\t0h",
  "S2\tControl\tWildType\t2\tP02\t0h",
  "S3\tTreated\tWildType\t1\tP03\t24h",
].join("\n");
const samples = ["S1", "S2", "S3"];
// Team's control defaults, as the Prepare dataset dialog must prefill them (docs/integration/admin-nexo-open.md).
const teamDefaults = { minDetectionPct: "0", detectionScope: "global", normalizationMethod: "median" };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (text: string) => new RegExp(`\\b${escape(text)}\\b`);
async function shot(page: Page, name: string) {
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, name), fullPage: true });
}

// The step each persona's code was last used in, this run: the seed's enrollment step, then each sign-in's.
const usedStep = new Map<string, number>();
async function signIn(page: Page, persona: Persona) {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Email").fill(persona.email);
  await page.getByLabel("Password").fill(persona.password);
  if (persona.totpSecret) {
    // GoTrue may refuse a code already used: wait for the next 30-second step if needed.
    const used = usedStep.get(persona.email) ?? persona.totpStep ?? -1;
    while (totpStep() <= used) await page.waitForTimeout(1_000);
    const now = Date.now();
    usedStep.set(persona.email, totpStep(now));
    await page.getByLabel("Two-step code").fill(totp(persona.totpSecret, now));
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Lab staff land on the global pipeline.
  await expect(page).toHaveURL(/\/admin\/pipeline$/, slow);
}

// What step 2 creates through the screens, for the later steps (serial: one worker, in story order).
let orderCode = "";
let batchName = "";
const runOrder = () => {
  if (!orderCode) throw new Error("No order: step 2 did not create it in New order");
  return orderCode;
};
let datasetId = "";
const datasetPage = () => {
  if (!datasetId) throw new Error("No dataset: the build step did not run or failed");
  return `/admin/release/${datasetId}`;
};

test("1 · Stephania (Owner) sets the release policy: Paula and Stephania, 2 signatures", async ({ page }) => {
  test.setTimeout(180_000);
  const { steph, paula } = pilotRun();
  await signIn(page, steph);
  await page.goto("/admin/release-policy");
  await expect(page.getByRole("heading", { level: 1, name: "Release policy" })).toBeVisible(slow);
  const signers = page.getByRole("group", { name: "Eligible signers" });
  const box = (persona: Persona, role: string) => signers.getByRole("checkbox", { name: new RegExp(`^${escape(persona.name)}\\s*·\\s*${role}$`) });
  for (const other of await signers.getByRole("checkbox").all()) await other.uncheck();
  await box(paula, "Admin").check();
  await box(steph, "Owner").check();
  await page.getByRole("spinbutton", { name: "Required signatures" }).fill("2");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page).toHaveURL(/\/admin\/release-policy\?saved=1$/, slow);
  await expect(page.getByRole("status")).toContainText("Release policy saved.");
  await expect(page.getByRole("heading", { level: 2, name: "2 signatures required" })).toBeVisible();
  // The form starts from the saved policy: exactly the two personas.
  await expect(box(paula, "Admin")).toBeChecked();
  await expect(box(steph, "Owner")).toBeChecked();
  await expect(signers.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await shot(page, "01-policy.png");
});

test("2 · Paula (Admin) creates the order, receives and registers it, plans and runs its batch, accepts the results and builds dataset v1", async ({ page }) => {
  test.setTimeout(600_000);
  const { paula, clientName, panelName, orderTitle } = pilotRun();
  await signIn(page, paula);
  const status = (text: string) => page.getByRole("status").filter({ hasText: text });

  await test.step("New order: the order of this run, at Request", async () => {
    await page.goto("/admin/new-order");
    await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible(slow);
    await page.getByLabel("Client", { exact: true }).selectOption({ label: clientName });
    await page.getByLabel("Panel", { exact: true }).selectOption({ label: panelName });
    await page.getByLabel("Title", { exact: true }).fill(orderTitle);
    await page.getByLabel("Matrix", { exact: true }).fill("Plasma");
    await page.getByLabel("Expected samples", { exact: true }).fill(String(samples.length));
    await page.getByLabel("Billing reference", { exact: true }).fill("PILOT-SYN-0001");
    await page.getByLabel("Notes", { exact: true }).fill("Synthetic order of the Admin pilot simulation.");
    await page.getByRole("button", { name: "Create order" }).click();
    await expect(page).toHaveURL(/\/admin\/new-order\?created=ORD\d{3,}$/, slow);
    orderCode = new URL(page.url()).searchParams.get("created")!;
    test.info().annotations.push({ type: "order", description: orderCode });
    await expect(status(`Order ${orderCode} created.`)).toBeVisible(slow);
    await shot(page, "02-new-order.png");
    await status(`Order ${orderCode} created.`).getByRole("link", { name: "Receive shipment →" }).click();
  });

  await test.step("Receive shipment and Sample registry: codes ORDnnn-S001…003", async () => {
    await expect(page).toHaveURL(new RegExp(`/admin/receive-shipment\\?order=${orderCode}$`), slow);
    await expect(page.getByRole("heading", { level: 1, name: "Receive shipment" })).toBeVisible(slow);
    await page.getByLabel("Carrier").fill("FedEx");
    await page.getByLabel("Tracking number").fill("SIM 0001");
    await page.getByRole("radio", { name: /^Intact and cold/ }).check();
    await page.getByLabel("Boxes").fill("1");
    await shot(page, "03-receive-shipment.png");
    await page.getByRole("button", { name: "Record arrival" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/sample-registry\\?order=${orderCode}&received=`), slow);

    await page.getByLabel("Paste from Excel").fill(metadataSheet);
    await page.getByRole("button", { name: "Add rows" }).click();
    await page.getByRole("button", { name: "Save 3 valid rows" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/sample-registry\\?order=${orderCode}&saved=3$`), slow);
    const registered = page.getByRole("table", { name: "Registered samples" });
    for (const n of ["001", "002", "003"]) await expect(registered.getByText(`${orderCode}-S${n}`, { exact: true })).toBeVisible(slow);
    await shot(page, "04-sample-registry.png");
  });

  const codes = ["001", "002", "003"].map(n => `${orderCode}-S${n}`);
  await test.step("Batch builder: this order's samples, preview, save", async () => {
    await page.goto("/admin/batch-builder");
    await expect(page.getByRole("heading", { level: 1, name: "Batch builder" })).toBeVisible(slow);
    // Staging may list other orders' registered samples: select only this order's, through its own link.
    await page.getByRole("link", { name: `Select all of ${orderCode}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/batch-builder\\?order=${orderCode}$`), slow);
    const picker = page.getByRole("region", { name: "Choose the samples" });
    const own = picker.getByRole("group", { name: new RegExp(`^${orderCode} · `) });
    for (const name of samples) await expect(own.getByRole("checkbox", { name: new RegExp(`^${name}\\b`) })).toBeChecked(slow);
    await expect(picker.getByRole("checkbox", { checked: true })).toHaveCount(samples.length);
    await page.getByLabel("Panel", { exact: true }).selectOption({ label: panelName });
    await page.getByLabel("Blanks at start").fill("1");
    await page.getByLabel("Pooled QC every").fill("0"); // with "Pooled QC at the end" (default): one QC, as in the export
    await page.getByLabel("Seed").fill(`pilot-${orderCode}`);
    await page.getByRole("button", { name: "Preview sequence" }).click();

    await expect(page.getByRole("heading", { level: 2, name: /^5 injections · / })).toBeVisible(slow);
    const preview = page.getByRole("table", { name: "Sequence preview" });
    await expect(preview.getByRole("row")).toHaveCount(6); // header, 1 blank, 3 samples, 1 QC at the end
    for (const code of codes) await expect(preview.getByRole("cell", { name: code, exact: true })).toBeVisible();
    // FullName is shown beside the code for people, never as the injection name.
    for (const name of samples) await expect(preview.getByRole("cell", { name: new RegExp(`^${escape(name)} · `) })).toBeVisible();
    await shot(page, "05-batch-preview.png");

    await page.getByRole("button", { name: "Save planned batch" }).click();
    await expect(page).toHaveURL(/\/admin\/batch-run\/B\d{4}-\d{3,}\?saved=1$/, slow);
    batchName = new URL(page.url()).pathname.split("/").at(-1)!;
    test.info().annotations.push({ type: "batch", description: batchName });
    await expect(status(`Batch ${batchName} saved as planned.`)).toBeVisible(slow);
    await expect(page.getByRole("button", { name: "Mark acquired" })).toBeDisabled();
    await shot(page, "06-batch-saved.png");
  });

  // The sequence names the injections by sample code; the bench sheet keeps FullName beside each code.
  let sequence = "";
  let benchSheet = "";
  await test.step("Batch run: download the sequence CSV, mark exported, mark acquired", async () => {
    const download = async (name: string) => {
      const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name, exact: true }).click()]);
      const text = readFileSync((await file.path())!, "utf8");
      mkdirSync(evidence, { recursive: true });
      writeFileSync(join(evidence, file.suggestedFilename()), text);
      return { filename: file.suggestedFilename(), text };
    };
    const seq = await download("Download sequence CSV");
    expect(seq.filename).toBe(`${batchName}-sequence.csv`);
    const lines = seq.text.split("\r\n");
    expect(lines[0]).toBe("seq,sample_type,sample_name,client_id,aliquot_id,plate,vial");
    expect(lines).toHaveLength(7); // header, five injections, trailing CRLF
    for (const code of codes) expect(lines.filter(line => line.includes(`,Unknown,${code},`))).toHaveLength(1);
    const bench = await download("Download bench sheet CSV");
    expect(bench.filename).toBe(`${batchName}-bench-sheet.csv`);
    [sequence, benchSheet] = [seq.text, bench.text];

    await page.getByRole("button", { name: "Mark exported" }).click();
    await expect(page).toHaveURL(/\?exported=1$/, slow);
    await expect(status("Sequence exported.")).toBeVisible(slow);
    await expect(page.getByRole("button", { name: "Mark exported" })).toHaveCount(0);
    await page.getByRole("button", { name: "Mark acquired" }).click();
    await expect(page).toHaveURL(/\?acquired=1$/, slow);
    await expect(status("Batch acquired.")).toBeVisible(slow);
    await shot(page, "07-batch-acquired.png");
    await status("Batch acquired.").getByRole("link", { name: "Ingest results →" }).click();
  });

  await test.step("Ingest results: the export as SCIEX OS names it after this batch", async () => {
    const { text, unknownNames } = resultsForBatch({ fixture: readFileSync(sciexTxt, "utf8"), sequence, benchSheet });
    expect([...unknownNames].sort()).toEqual(codes);
    const results = join(evidence, `${orderCode}-results.txt`);
    mkdirSync(evidence, { recursive: true });
    writeFileSync(results, text);
    await expect(page.getByRole("heading", { level: 1, name: "Ingest results" })).toBeVisible(slow);
    await page.getByRole("combobox", { name: "Order", exact: true }).selectOption({ label: `${orderCode} · acquired` });
    await page.getByLabel("SCIEX OS results TXT").setInputFiles(results);
    await page.getByLabel("SCIEX OS version").fill("3.4.5 (synthetic)");
    await page.getByLabel("Processing method").fill("Synthetic pilot processing method");
    await page.getByRole("button", { name: "Parse file" }).click();
    const summary = page.getByRole("region", { name: "Parse summary" });
    await expect(summary).toBeVisible(slow);
    await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    await shot(page, "08-ingest-results.png");
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: `Results accepted for ${orderCode}. The order is now Processed` })).toBeVisible(slow);
  });

  await test.step("Release: build dataset v1 (the build matches the codes to the registry)", async () => {
    await page.goto("/admin/release");
    await expect(page.getByRole("heading", { level: 1, name: "Release" })).toBeVisible(slow);
    await page.getByRole("row", { name: word(orderCode) }).getByRole("button", { name: "Build dataset v1" }).click();
    await expect(page).toHaveURL(/\/admin\/release\/[0-9a-f-]{36}\?built=1$/, slow);
    await expect(page.getByRole("heading", { level: 1, name: `${orderCode} · Dataset v1` })).toBeVisible(slow);
    datasetId = new URL(page.url()).pathname.split("/").at(-1)!;
    const files = page.getByRole("table", { name: "Files of this version" });
    await expect(files.getByText(/^[0-9a-f]{64}$/)).toHaveCount(3);
    await expect(page.getByText("0 of 2 required signatures")).toBeVisible();
    await shot(page, "09-dataset-built.png");
  });
});

test("3 · Paula signs (Prepared); one more signature by someone else is needed and she cannot release", async ({ page }) => {
  test.setTimeout(180_000);
  const { paula } = pilotRun();
  await signIn(page, paula);
  await page.goto(datasetPage());
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("prepared");
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Prepared from the synthetic export (pilot simulation).");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page).toHaveURL(/\?signed=1$/, slow);
  await expect(page.getByText("1 of 2 required signatures")).toBeVisible(slow);
  await expect(page.getByRole("list", { name: "Signatures" })).toContainText(`${paula.name} · Prepared`);
  await expect(page.getByText("1 more signature by a different eligible person before this version can be released.")).toBeVisible();
  await expect(page.getByRole("region", { name: /^Your turn/ })).toContainText("You already signed. Waiting for a second signer.");
  await expect(page.getByRole("button", { name: "Sign", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Release dataset" })).toHaveCount(0);
  await shot(page, "10-paula-signed.png");
});

test("4 · Stephania signs (Approved) and releases; the order is Released with its Team project", async ({ page }) => {
  test.setTimeout(240_000);
  const { steph } = pilotRun();
  const orderCode = runOrder();
  await signIn(page, steph);
  await page.goto(datasetPage());
  await expect(page.getByText("1 of 2 required signatures")).toBeVisible(slow);
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("approved");
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Approved for release (pilot simulation).");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page).toHaveURL(/\?signed=1$/, slow);
  await expect(page.getByText("2 of 2 required signatures")).toBeVisible(slow);
  await expect(page.getByRole("list", { name: "Signatures" })).toContainText(`${steph.name} · Approved`);
  await expect(page.getByRole("button", { name: "Release dataset" })).toBeEnabled();
  await shot(page, "11-steph-signed.png");

  await page.getByRole("button", { name: "Release dataset" }).click();
  await expect(page).toHaveURL(/\?released=1$/, slow);
  await expect(page.getByRole("status")).toContainText(`Dataset v1 released. ${orderCode} is now Released`, slow);
  const project = page.getByRole("region", { name: "Team project" });
  await expect(project.getByText(UUID)).toBeVisible();
  await expect(project.getByRole("link", { name: "Open in Nexo" })).toHaveAttribute("href", new RegExp(`/\\?dataset=${datasetId}$`));
  await shot(page, "12-released.png");

  await page.goto(`/admin/orders/${orderCode}`);
  await expect(page.getByRole("heading", { level: 1, name: orderCode })).toBeVisible(slow);
  await expect(page.getByRole("heading", { level: 2, name: "Release complete" })).toBeVisible();
  await shot(page, "13-order-released.png");
});

test("5 · Stephania opens the release in Nexo, confirms Team's defaults and adds a plot that draws", async ({ page }) => {
  test.setTimeout(600_000);
  const { steph } = pilotRun();
  const orderCode = runOrder();
  // Console errors and error toasts of every page in this context (Nexo opens in a new tab). Toasts leave after a few
  // seconds, so they are recorded as they appear.
  const errors: { page: Page | null; text: string }[] = [];
  page.context().on("console", (message: ConsoleMessage) => { if (message.type() === "error") errors.push({ page: message.page(), text: message.text() }); });
  // Nexo's web fonts are a third-party load the pilot does not test; answer it locally so a flaky network to Google
  // Fonts is not reported as a Nexo error (seen on staging runs from the coordinator's Mac: ERR_SOCKET_NOT_CONNECTED).
  await page.context().route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  page.context().on("weberror", error => errors.push({ page: error.page(), text: error.error().message }));
  await page.context().addInitScript(() => {
    const seen: { text: string; error: boolean }[] = [];
    (window as unknown as { __pilotToasts: typeof seen }).__pilotToasts = seen;
    new MutationObserver(() => document.querySelectorAll<HTMLElement>(".toast").forEach(toast => {
      const text = (toast.textContent ?? "").trim();
      if (toast.dataset.pilotSeen === text) return;
      toast.dataset.pilotSeen = text;
      seen.push({ text, error: toast.classList.contains("is-error") });
    })).observe(document, { childList: true, subtree: true, characterData: true });
  });

  await signIn(page, steph);
  await page.goto(datasetPage());
  const link = page.getByRole("region", { name: "Team project" }).getByRole("link", { name: "Open in Nexo" });
  await expect(link).toHaveAttribute("href", new RegExp(`/\\?dataset=${datasetId}$`), slow);
  const opened = page.waitForEvent("popup");
  await link.click();
  const nexo = await opened;

  // The first call answers 422 preparation_choices_required: the Prepare dataset dialog, every sample ticked, Team's defaults.
  const dialog = nexo.getByRole("dialog", { name: "Prepare dataset", exact: true });
  await expect(dialog).toBeVisible(nexoSlow);
  for (const sample of samples) await expect(dialog.getByLabel(sample, { exact: true })).toBeChecked();
  await expect(dialog.getByText(`${samples.length} of ${samples.length} samples selected`, { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Minimum detection (%)", { exact: true })).toHaveValue(teamDefaults.minDetectionPct);
  await expect(dialog.getByLabel("Detection across", { exact: true })).toHaveValue(teamDefaults.detectionScope);
  await expect(dialog.getByLabel("Normalization", { exact: true })).toHaveValue(teamDefaults.normalizationMethod);
  await expect(dialog.getByLabel("Drop lipids not detected in any sample", { exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel("Impute missing values (QRILC)", { exact: true })).toBeChecked();
  await expect(dialog.getByLabel("For each file, impute all-NA lipids to 0", { exact: true })).toBeChecked();
  await expect(dialog.getByLabel("Final cleanup: impute any remaining NAs to 0", { exact: true })).toBeChecked();
  await shot(nexo, "14-nexo-prepare.png");

  await dialog.getByRole("button", { name: "Open dataset", exact: true }).click();
  await expect(dialog).toBeHidden(nexoSlow);
  await expect(nexo).toHaveTitle(`${orderCode} · v1`, nexoSlow);
  const counts = nexo.getByText(new RegExp(`^[1-9]\\d* lipids? · ${samples.length} samples$`));
  await expect(counts).toBeVisible(nexoSlow);
  await shot(nexo, "15-nexo-canvas.png");

  // One plot, the way a user adds it: Plots in the canvas tools, search the library, press Add.
  // A fresh dataset canvas opens with the plot library already shown (a floating panel); open it only when it is not,
  // since the Plots tool toggles it.
  const search = nexo.getByRole("searchbox", { name: "Search plots" });
  if (!(await search.isVisible())) await nexo.getByRole("navigation", { name: "Canvas tools" }).getByRole("button", { name: "Plots", exact: true }).click();
  await search.fill("PCA scores");
  await nexo.getByRole("button", { name: "Add PCA scores · 2D", exact: true }).first().click();
  const card = nexo.locator("#world .card"); // canvas state is read from the DOM, as in tests/dual-ui/pilot/pilot_figure1.cjs
  await expect(card).toHaveCount(1, nexoSlow);
  await expect(card.locator(".card-status")).toHaveAttribute("data-state", "current", nexoSlow);
  await nexo.waitForFunction(() => {
    const c = document.querySelector("#world .card");
    if (!c) return false;
    const img = [...c.querySelectorAll("img")].some(i => i.complete && i.naturalWidth > 0);
    const plot = [...c.querySelectorAll<HTMLElement & { data?: unknown[] }>(".js-plotly-plot")].some(p => (p.data?.length ?? 0) > 0);
    const svg = [...c.querySelectorAll("svg")].some(s => s.getBoundingClientRect().width > 40);
    return img || plot || svg;
  }, undefined, nexoSlow);
  await shot(nexo, "16-nexo-plot.png");

  const toasts = await nexo.evaluate(() => (window as unknown as { __pilotToasts?: { text: string; error: boolean }[] }).__pilotToasts ?? []);
  expect(toasts.filter(toast => toast.error).map(toast => toast.text)).toEqual([]);
  // The only expected console error in Nexo is the browser's report of the first call's 422.
  const nexoErrors = errors.filter(error => error.page === nexo).map(error => error.text);
  const expected422 = nexoErrors.filter(text => /status of 422\b/.test(text));
  expect(nexoErrors.filter(text => !expected422.includes(text))).toEqual([]);
  expect(expected422.length).toBeLessThanOrEqual(1);
});

test("6 · Datasets lists v1 as Released with both signers", async ({ page }) => {
  test.setTimeout(180_000);
  const { steph, paula } = pilotRun();
  const orderCode = runOrder();
  await signIn(page, steph);
  await page.goto(`/admin/datasets?order=${orderCode}`);
  const row = page.getByRole("table", { name: "Dataset versions" }).getByRole("row", { name: word(orderCode) });
  await expect(row).toHaveCount(1, slow);
  await expect(row).toContainText("v1");
  await expect(row).toContainText("released");
  await expect(row).toContainText(`${paula.name} · Prepared`);
  await expect(row).toContainText(`${steph.name} · Approved`);
  await expect(row.getByRole("link", { name: "Open in Nexo" })).toHaveAttribute("href", new RegExp(`/\\?dataset=${datasetId}$`));
  await shot(page, "17-datasets.png");
});

test("7 · the audit log lists the release with Stephania as actor, and both signatures", async ({ page }) => {
  test.setTimeout(180_000);
  const { steph, paula } = pilotRun();
  const orderCode = runOrder();
  await signIn(page, steph);
  // The order filter covers the order and its shipments, samples, result files, datasets and signatures; a pilot order
  // has far fewer than 50 events, so the release is on the first page.
  await page.goto(`/admin/audit-log?order=${orderCode}`);
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible(slow);
  const events = page.getByRole("table", { name: "Audit events" });
  const event = (summary: string) => events.getByRole("row").filter({ hasText: new RegExp(escape(summary)) });
  const who = (summary: string) => event(summary).getByRole("cell").nth(1);
  const released = event(`Dataset ${orderCode} v1 released`);
  await expect(released).toHaveCount(1, slow);
  await expect(who(`Dataset ${orderCode} v1 released`)).toHaveText(steph.name);
  await expect(who(`Signature added to ${orderCode} v1 (Approved)`)).toHaveText(steph.name);
  await expect(who(`Signature added to ${orderCode} v1 (Prepared)`)).toHaveText(paula.name);
  // Paula created the order in New order, and her batch moved it to Acquired (create_batch / mark_batch_acquired).
  await expect(who(`Order ${orderCode} created`)).toHaveText(paula.name);
  await expect(who(`Order ${orderCode} moved to Acquired`)).toHaveText(paula.name);
  // The row expands to the changed fields only (before → after), never the whole row.
  await released.getByText(`Dataset ${orderCode} v1 released`, { exact: true }).click();
  const changes = released.getByRole("group");
  await expect(changes).toContainText("built → released");
  await expect(changes).not.toContainText("{");
  await shot(page, "18-audit-log.png");
});
