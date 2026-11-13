import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Cookie, type Locator, type Page } from "@playwright/test";
import { evidenceDir, RUN_ID, SHIPPING_TEXT } from "./journey-run.mjs";
import { resultsForBatch } from "./pilot-results.mjs";
import { totp, totpStep } from "./totp.mjs";

// The golden journey (docs/admin/admin-golden-journey.md): one fictional client lab, all synthetic, walks the lab
// platform's whole cycle through the screens: Request access, the lab's approval, the invitation, a colleague, an order
// request and its acceptance, receipt, samples, batch, results, dataset v1, two signatures, the client reading the
// release. Every step ends on a clean screen and is captured at 1440x900 and 390x844 (journey-evidence/desktop|mobile),
// with steps.json for the help manual; Playwright records a video per test. Skipped unless ADMIN_E2E_JOURNEY=1; then
// playwright.config.ts runs only this spec against ADMIN_PILOT_BASE_URL. Run e2e/live/journey-seed.mjs first.
//   ADMIN_E2E_JOURNEY=1 ADMIN_PILOT_BASE_URL=https://… ADMIN_JOURNEY_BASE_PATH=/admin-staging \
//     ADMIN_JOURNEY_CREDENTIALS=e2e/live/.journey-credentials.local.json npx playwright test
// The run's client lab, people and order are made here by the screens, never by the seed. The app sends no email for
// invitations or access requests: the links are read from the page. The global teardown archives what the run made.
const env = process.env;
test.skip(env.ADMIN_E2E_JOURNEY !== "1", "Golden journey: set ADMIN_E2E_JOURNEY=1, ADMIN_PILOT_BASE_URL and ADMIN_JOURNEY_CREDENTIALS");
test.describe.configure({ mode: "serial" });

// Admin's base path is a build-time setting (src/lib/base-path.ts): /admin on production, /admin-staging on staging.
const BASE_PATH = (env.ADMIN_JOURNEY_BASE_PATH || "/admin").replace(/\/+$/, "");
const at = (path: string) => `${BASE_PATH}${path}`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const onPath = (path: string) => new RegExp(`${escape(BASE_PATH)}${path}`);
const word = (text: string) => new RegExp(`\\b${escape(text)}\\b`);

type Persona = { email: string; password: string; name: string; totpSecret?: string; totpStep?: number };
type JourneyRun = { runId: string; steph: Persona; paula: Persona; dana: Persona; lee: Persona; clientName: string; panelName: string; orderTitle: string };
function journeyRun(): JourneyRun {
  if (!env.ADMIN_PILOT_BASE_URL) throw new Error("Set ADMIN_PILOT_BASE_URL to the origin that serves Admin");
  const file = env.ADMIN_JOURNEY_CREDENTIALS;
  if (!file || !existsSync(file)) throw new Error(`Run node e2e/live/journey-seed.mjs first with ADMIN_JOURNEY_CREDENTIALS set (no ${file ?? "file named"})`);
  const run = JSON.parse(readFileSync(file, "utf8")) as JourneyRun;
  for (const persona of [run.steph, run.paula]) {
    if (!persona?.password) throw new Error(`Run node e2e/live/journey-seed.mjs again: ${persona?.email ?? "a persona"} has no password`);
  }
  if (!RUN_ID.test(run.runId ?? "") || !run.clientName || !run.dana?.password || !run.lee?.password) {
    throw new Error("Run node e2e/live/journey-seed.mjs again: the file names no run, or an archived run");
  }
  return run;
}

const slow = { timeout: 60_000 };
const sciexTxt = join(__dirname, "../../../../packages/admin-ingest/test/fixtures/sciex-synthetic.txt");
const metadataSheet = [
  "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm",
  "S1\tControl\tWildType\t1\tP01\t0h",
  "S2\tControl\tWildType\t2\tP02\t0h",
  "S3\tTreated\tWildType\t1\tP03\t24h",
].join("\n");
const samples = ["S1", "S2", "S3"];

// ---------------------------------------------------------------- captures

type Area = "lab" | "client" | "analysis";
type StepInfo = { title: string; actor: string; area: Area };
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const recorded: { n: number; slug: string; title: string; actor: string; area: Area; url_path: string }[] = [];
// Invitation links, passwords and two-step codes are never in a screenshot: Playwright paints these boxes over them.
const secrets = (page: Page) => [page.locator('input[type="password"], input[name="code"], input[autocomplete="one-time-code"], input[readonly][id$="-link"]')];

// The screen is finished: nothing pending, no error banner, fonts and requests settled. Next's route announcer is the
// one role=alert that is always there.
async function settle(page: Page) {
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
}
// url_path for the manual: the app path without the base path, with no query and no invitation token.
const appPath = (page: Page) => {
  const path = new URL(page.url()).pathname;
  return (path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path).replace(/^\/invite\/[^/]+/, "/invite/<token>");
};

// <nn>-<slug>.png at desktop width, then the same page at 390x844 (resized, captured, resized back). One call, one step.
async function shot(page: Page, slug: string, info: StepInfo, extraMask: Locator[] = []) {
  await settle(page);
  const n = recorded.length + 1;
  const name = `${String(n).padStart(2, "0")}-${slug}.png`;
  const mask = [...secrets(page), ...extraMask];
  await page.setViewportSize(DESKTOP);
  for (const [folder, size] of [["desktop", DESKTOP], ["mobile", PHONE]] as const) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400); // the layout answers the new width
    await page.evaluate(() => document.fonts.ready);
    mkdirSync(join(evidenceDir, folder), { recursive: true });
    await page.screenshot({ path: join(evidenceDir, folder, name), fullPage: true, mask });
  }
  await page.setViewportSize(DESKTOP);
  recorded.push({ n, slug, ...info, url_path: appPath(page) });
  writeFileSync(join(evidenceDir, "steps.json"), `${JSON.stringify(recorded, null, 2)}\n`);
}
const lab = (title: string, actor = "Paula (simulated)", area: Area = "lab"): StepInfo => ({ title, actor, area });
const analysis = (title: string, actor = "Paula (simulated)"): StepInfo => lab(title, actor, "analysis");
const client = (title: string, actor = "Dana Reyes (simulated)"): StepInfo => lab(title, actor, "client");

test.beforeEach(async ({ page }) => {
  // The video records what is on screen: show an invitation link and a two-step code as dots there too (the screenshots
  // paint them over).
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = 'input[readonly][id$="-link"], input[name="code"] { -webkit-text-security: disc; }';
      document.head.append(style);
    });
  });
});

// ---------------------------------------------------------------- sign-in

// The step each lab persona's code was last used in; a code is refused twice in one 30-second step. A persona who has
// signed in once reuses that session's cookies in later tests (no second wait for the next step, no second sign-in).
const usedStep = new Map<string, number>();
const sessions = new Map<string, Cookie[]>();
type Landing = "staff" | "client";
const landings: Record<Landing, { path: string; url: RegExp }> = {
  staff: { path: "/pipeline", url: onPath("/pipeline$") },
  client: { path: "/client/home", url: onPath("/client/home$") },
};
async function signIn(page: Page, persona: Persona, landing: Landing, options: { here?: boolean; capture?: [string, StepInfo] } = {}) {
  const target = landings[landing];
  const earlier = sessions.get(persona.email);
  if (earlier && !options.capture) {
    await page.context().addCookies(earlier);
    await page.goto(at(target.path));
    if (target.url.test(page.url())) return;
    await page.context().clearCookies();
  }
  if (!options.here) await page.goto(at("/sign-in"));
  await page.getByLabel("Email").fill(persona.email);
  await page.getByLabel("Password").fill(persona.password);
  if (persona.totpSecret && await page.getByLabel("Two-step code").count()) {
    const used = usedStep.get(persona.email) ?? persona.totpStep ?? -1;
    while (totpStep() <= used) await page.waitForTimeout(1_000);
    const now = Date.now();
    usedStep.set(persona.email, totpStep(now));
    await page.getByLabel("Two-step code").fill(totp(persona.totpSecret, now));
  }
  if (options.capture) await shot(page, ...options.capture);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(target.url, slow);
  sessions.set(persona.email, await page.context().cookies());
}

// ---------------------------------------------------------------- what the screens hand on, in story order
let reference = "";
let danaInvite = ""; // an app path with its single-use token: never logged, never an annotation
let leeInvite = "";
let orderCode = "";
let batchName = "";
let datasetId = "";
const runOrder = () => {
  if (!orderCode) throw new Error("No order: the request step did not run or failed");
  return orderCode;
};
const deliverableTitle = "Synthetic lipid summary (golden journey)";

// The invitation link a lab screen shows once, read from its read-only field as an app path (the origin may differ).
async function readLink(page: Page, field: string) {
  const input = page.locator(field);
  await expect(input).toBeVisible(slow);
  const link = new URL(await input.inputValue(), "http://placeholder.invalid");
  expect(link.pathname).toMatch(new RegExp(`^${escape(BASE_PATH)}/invite/[^/]+$`));
  return `${link.pathname}${link.search}`;
}

// A new person opens an invitation, sets a password and signs in; ends on their client home.
async function acceptAndSignIn(page: Page, link: string, persona: Persona, who: string, prefix: string) {
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: /^Join as / })).toBeVisible(slow);
  await shot(page, `${prefix}-invitation`, client(`${who} opens the invitation link`, persona.name));
  await page.getByLabel("Password", { exact: true }).fill(persona.password);
  await page.getByLabel("Repeat password", { exact: true }).fill(persona.password);
  await page.getByRole("button", { name: "Set password and join" }).click();
  await expect(page.getByRole("status")).toContainText("Your account is ready.", slow);
  await shot(page, `${prefix}-account-ready`, client(`${who} sets a password: the account is ready`, persona.name));
  await page.getByRole("link", { name: "Sign in →" }).click();
  await expect(page).toHaveURL(onPath("/sign-in"), slow);
  await signIn(page, persona, "client", { here: true, capture: [`${prefix}-sign-in`, client(`${who} signs in (no two-step code for a client)`, persona.name)] });
}

// ================================================================ 1 · the client asks for access

test("1 · Dana (a new client's contact) asks for access on the public form", async ({ page }) => {
  test.setTimeout(120_000);
  const { dana, clientName } = journeyRun();
  await page.goto(at("/request-access"));
  await expect(page.getByRole("heading", { level: 1, name: "Request access." })).toBeVisible(slow);
  await page.getByLabel("Full name", { exact: true }).fill(dana.name);
  await page.getByLabel("Work email", { exact: true }).fill(dana.email);
  await page.getByLabel("Organisation or lab", { exact: true }).fill(clientName);
  await page.getByLabel("Type", { exact: true }).selectOption("pi_lab");
  await page.getByLabel("What would you like to measure?", { exact: true }).fill("Synthetic request: plasma lipidomics for a small pilot study (golden journey).");
  await shot(page, "request-access-form", client("Dana fills in the Request access form"));
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Request received." })).toBeVisible(slow);
  await expect(page.getByRole("status")).toContainText("The lab has your request.");
  reference = (await page.locator("span.mono").first().textContent())?.trim() ?? "";
  await shot(page, "request-access-sent", client("The request is sent: the reference and what happens next"));
});

// ================================================================ 2 · the lab approves

test("2 · Paula approves the request into a new client lab, as Client admin, and gets the invitation link", async ({ page }) => {
  test.setTimeout(240_000);
  const { paula, dana, clientName } = journeyRun();
  await signIn(page, paula, "staff");
  await page.goto(at("/people"));
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible(slow);
  const requests = page.getByRole("region", { name: "Access requests" });
  const row = requests.getByRole("row").filter({ hasText: dana.email });
  await expect(row).toHaveCount(1, slow);
  if (reference) await expect(row).toContainText(reference);
  await row.getByRole("button", { name: /^Review/ }).click();
  const form = requests.getByRole("form", { name: `Approve ${dana.name}` });
  await expect(form).toBeVisible();
  // Nobody matches this organisation: a new client, named as the requester wrote it, with the first person a Client admin.
  await expect(form.getByRole("radio", { name: /A new client/ })).toBeChecked();
  await expect(form.getByLabel("Client name")).toHaveValue(clientName);
  await expect(form.getByLabel("Role")).toHaveValue("client_admin");
  await shot(page, "access-request-listed", lab("The request waits in People → Access requests; Paula opens its review"));

  await form.getByRole("button", { name: "Approve and create invitation link" }).click();
  danaInvite = await readLink(page, "#access-link");
  await expect(requests.getByRole("status")).toContainText(`Invitation link for ${dana.email}`);
  await shot(page, "invitation-link-shown", lab("Approved: the invitation link is shown once (masked here)"));
});

// ================================================================ 3 · Dana accepts

test("3 · Dana opens the link, sets her password and reaches the client portal", async ({ page }) => {
  test.setTimeout(180_000);
  const { dana, clientName } = journeyRun();
  await acceptAndSignIn(page, danaInvite, dana, "Dana", "dana");
  await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible(slow);
  await expect(page.getByText(`Client portal / ${clientName}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Request an order" })).toBeVisible(); // a Client admin may request orders
  await shot(page, "dana-client-home", client("Dana lands in the client portal: no orders yet"));
});

// ================================================================ 4 · the lab invites a colleague

test("4 · Paula invites Lee, Dana's colleague, as a Requester", async ({ page }) => {
  test.setTimeout(180_000);
  const { paula, lee, clientName, dana } = journeyRun();
  await signIn(page, paula, "staff");
  await page.goto(at("/people"));
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible(slow);
  // Dana is now a member of the new client lab.
  await expect(page.getByRole("table", { name: "People" }).getByRole("row").filter({ hasText: dana.email })).toContainText(clientName, slow);
  const invite = page.getByRole("region", { name: "Invite" });
  await invite.getByLabel("Email", { exact: true }).fill(lee.email);
  await invite.getByLabel("Role", { exact: true }).selectOption("client:requester");
  await invite.getByLabel("Client", { exact: true }).selectOption({ label: clientName });
  await invite.getByRole("button", { name: "Create invitation link" }).click();
  leeInvite = await readLink(page, "#invite-link");
  await expect(page.getByRole("table", { name: "Pending invitations" }).getByRole("row").filter({ hasText: lee.email })).toBeVisible(slow);
  await shot(page, "invite-lee", lab("Paula invites Lee: the link is shown once (masked) and listed under Pending invitations"));
});

test("5 · Lee accepts his invitation, signs in and sees the same client lab", async ({ page }) => {
  test.setTimeout(180_000);
  const { lee, clientName } = journeyRun();
  await acceptAndSignIn(page, leeInvite, lee, "Lee", "lee");
  await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible(slow);
  await expect(page.getByText(`Client portal / ${clientName}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Request an order" })).toBeVisible(); // a Requester may too
  await shot(page, "lee-client-home", client("Lee's client portal home", lee.name));
});

// ================================================================ 5 · an order is requested and accepted

test("6 · Dana requests an order", async ({ page }) => {
  test.setTimeout(180_000);
  const { dana, orderTitle } = journeyRun();
  await signIn(page, dana, "client");
  await page.getByRole("link", { name: "+ Request an order" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Request an order" })).toBeVisible(slow);
  await page.getByLabel("Title", { exact: true }).fill(orderTitle);
  await page.getByLabel("Matrix", { exact: true }).fill("Plasma");
  await page.getByLabel("Expected samples", { exact: true }).fill(String(samples.length));
  await page.getByLabel("Billing reference", { exact: true }).fill("JOURNEY-SYN-0001");
  await page.getByLabel("Notes", { exact: true }).fill("Synthetic order of the golden journey.");
  await shot(page, "request-order-form", client("Dana fills in the order request (Panel: let the lab advise)"));
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page).toHaveURL(onPath("/client/home\\?requested=ORD\\d{3,}$"), slow);
  orderCode = new URL(page.url()).searchParams.get("requested")!;
  test.info().annotations.push({ type: "order", description: orderCode });
  await expect(page.getByRole("status").filter({ hasText: `Request ${orderCode} sent.` })).toBeVisible(slow);
  await expect(page.getByText("Waiting for the lab").first()).toBeVisible();
  await shot(page, "request-sent", client("The request is sent: it shows as waiting for the lab"));
});

test("7 · Paula sets the shipping instructions if the lab has none, then reviews and accepts the request", async ({ page }) => {
  test.setTimeout(240_000);
  const { paula, panelName } = journeyRun();
  const code = runOrder();
  await signIn(page, paula, "staff");

  await page.goto(at("/shipping-instructions"));
  await expect(page.getByRole("heading", { level: 1, name: "Shipping instructions" })).toBeVisible(slow);
  // One text for every client. The lab's own is never overwritten; with none, the synthetic text goes in (the teardown clears it).
  if (await page.getByRole("heading", { level: 2, name: "Not set" }).first().isVisible()) {
    await page.getByLabel("Instructions clients read").fill(SHIPPING_TEXT);
    await page.getByRole("button", { name: "Save instructions" }).click();
    await expect(page).toHaveURL(onPath("/shipping-instructions\\?saved=1$"), slow);
    await expect(page.getByRole("status")).toContainText("Shipping instructions saved.");
  }
  await shot(page, "shipping-instructions", lab("The lab's one shipping text, shown to every client once a request is accepted"));

  await page.goto(at(`/orders/${code}`));
  await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible(slow);
  const review = page.getByRole("region", { name: "Accept this request?" });
  await expect(review).toBeVisible(slow);
  await review.getByLabel("Panel", { exact: true }).selectOption({ label: panelName });
  await shot(page, "request-review", lab("Paula reviews the client's request and agrees the panel"));
  await review.getByRole("button", { name: "Accept request" }).click();
  await expect(page).toHaveURL(onPath(`/orders/${code}\\?answered=accepted$`), slow);
  await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible();
  await expect(page.getByRole("region", { name: "Accept this request?" })).toHaveCount(0);
  await shot(page, "request-accepted", lab("The request is accepted: the order is now open for the shipment"));
});

test("8 · Dana sees the accepted order with the shipping instructions", async ({ page }) => {
  test.setTimeout(180_000);
  const { dana } = journeyRun();
  const code = runOrder();
  await signIn(page, dana, "client");
  await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible(slow);
  await expect(page.getByRole("link", { name: code, exact: true })).toBeVisible(slow);
  await expect(page.getByText("Send your samples").first()).toBeVisible();
  await shot(page, "client-home-accepted", client("Dana's home: the order is accepted, waiting for her samples"));
  await page.goto(at(`/orders/${code}`));
  await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible(slow);
  await expect(page.getByRole("heading", { level: 2, name: "Send your samples" })).toBeVisible();
  // The lab's own text, or the synthetic one when the lab had none (step 7).
  await expect(page.getByRole("note", { name: "Shipping instructions" })).toBeVisible();
  await shot(page, "client-order-accepted", client("The accepted order: step 2, with the lab's shipping instructions"));
});

// ================================================================ 6 · the lab's work, as the pilot

test("9 · Paula receives the shipment, registers the samples, plans and runs the batch, accepts the results and builds dataset v1", async ({ page }) => {
  test.setTimeout(600_000);
  const { paula, panelName } = journeyRun();
  const code = runOrder();
  await signIn(page, paula, "staff");
  const status = (text: string) => page.getByRole("status").filter({ hasText: text });
  mkdirSync(join(evidenceDir, "files"), { recursive: true });

  await test.step("Receive shipment and Sample registry: codes ORDnnn-S001…003", async () => {
    await page.goto(at(`/receive-shipment?order=${code}`));
    await expect(page.getByRole("heading", { level: 1, name: "Receive shipment" })).toBeVisible(slow);
    await page.getByLabel("Carrier").fill("FedEx");
    await page.getByLabel("Tracking number").fill("SIM 0001");
    await page.getByRole("radio", { name: /^Intact and cold/ }).check();
    await page.getByLabel("Boxes").fill("1");
    await shot(page, "receive-shipment", lab("Paula records the shipment's arrival"));
    await page.getByRole("button", { name: "Record arrival" }).click();
    await expect(page).toHaveURL(onPath(`/sample-registry\\?order=${code}&received=`), slow);

    await page.getByLabel("Paste from Excel").fill(metadataSheet);
    await page.getByRole("button", { name: "Add rows" }).click();
    await page.getByRole("button", { name: "Register 3 samples" }).click();
    await expect(page).toHaveURL(onPath(`/sample-registry\\?order=${code}&saved=3$`), slow);
    const registered = page.getByRole("table", { name: "Registered samples" });
    for (const n of ["001", "002", "003"]) await expect(registered.getByText(`${code}-S${n}`, { exact: true })).toBeVisible(slow);
    await shot(page, "sample-registry", analysis("The three samples are registered with their codes"));
  });

  // PHASE B: Storage placement goes here (after the samples are registered, before the batch is planned).

  const codes = ["001", "002", "003"].map(n => `${code}-S${n}`);
  await test.step("Batch builder: this order's samples, preview, save", async () => {
    await page.goto(at("/batch-builder"));
    await expect(page.getByRole("heading", { level: 1, name: "Batch builder" })).toBeVisible(slow);
    await page.getByRole("link", { name: `Select all of ${code}`, exact: true }).click();
    await expect(page).toHaveURL(onPath(`/batch-builder\\?order=${code}$`), slow);
    const picker = page.getByRole("region", { name: "Choose the samples" });
    const own = picker.getByRole("group", { name: new RegExp(`^${code} · `) });
    for (const name of samples) await expect(own.getByRole("checkbox", { name: new RegExp(`^${name}\\b`) })).toBeChecked(slow);
    await expect(picker.getByRole("checkbox", { checked: true })).toHaveCount(samples.length);
    await page.getByLabel("Panel", { exact: true }).selectOption({ label: panelName });
    await page.getByLabel("Blanks at start").fill("1");
    await page.getByLabel("Pooled QC every").fill("0"); // with "Pooled QC at the end" (default): one QC, as in the export
    await page.getByLabel("Seed").fill(`journey-${code}`);
    await page.getByRole("button", { name: "Preview sequence" }).click();
    await expect(page.getByRole("heading", { level: 2, name: /^5 injections · / })).toBeVisible(slow);
    const preview = page.getByRole("table", { name: "Sequence preview" });
    await expect(preview.getByRole("row")).toHaveCount(6);
    for (const name of codes) await expect(preview.getByRole("cell", { name, exact: true })).toBeVisible();
    await shot(page, "batch-preview", analysis("Batch builder: the sequence preview (blank, samples, pooled QC)"));
    await page.getByRole("button", { name: "Save planned batch" }).click();
    await expect(page).toHaveURL(onPath("/batch-run/B\\d{4}-\\d{3,}\\?saved=1$"), slow);
    batchName = new URL(page.url()).pathname.split("/").at(-1)!;
    test.info().annotations.push({ type: "batch", description: batchName });
    await expect(status(`Batch ${batchName} saved as planned.`)).toBeVisible(slow);
    await shot(page, "batch-saved", analysis("The batch is saved as planned"));
  });

  let sequence = "";
  let benchSheet = "";
  await test.step("Batch run: export the CSVs, mark exported, mark acquired", async () => {
    const download = async (name: string) => {
      const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name, exact: true }).click()]);
      const text = readFileSync((await file.path())!, "utf8");
      writeFileSync(join(evidenceDir, "files", file.suggestedFilename()), text);
      return { filename: file.suggestedFilename(), text };
    };
    const seq = await download("Download sequence CSV");
    expect(seq.filename).toBe(`${batchName}-sequence.csv`);
    const bench = await download("Download bench sheet CSV");
    expect(bench.filename).toBe(`${batchName}-bench-sheet.csv`);
    [sequence, benchSheet] = [seq.text, bench.text];
    for (const name of codes) expect(sequence.split("\r\n").filter(line => line.includes(`,Unknown,${name},`))).toHaveLength(1);

    await page.getByRole("button", { name: "Mark exported" }).click();
    await expect(page).toHaveURL(/\?exported=1$/, slow);
    await expect(status("Sequence exported.")).toBeVisible(slow);
    await shot(page, "batch-exported", analysis("The sequence and bench sheet are exported"));
    await page.getByRole("button", { name: "Mark acquired" }).click();
    await expect(page).toHaveURL(/\?acquired=1$/, slow);
    await expect(status("Batch acquired.")).toBeVisible(slow);
    await shot(page, "batch-acquired", analysis("The batch is acquired"));
    await status("Batch acquired.").getByRole("link", { name: "Ingest results →" }).click();
  });

  await test.step("Ingest results: the export as SCIEX OS names it after this batch", async () => {
    const { text, unknownNames } = resultsForBatch({ fixture: readFileSync(sciexTxt, "utf8"), sequence, benchSheet });
    expect([...unknownNames].sort()).toEqual(codes);
    const results = join(evidenceDir, "files", `${code}-results.txt`);
    writeFileSync(results, text);
    await expect(page.getByRole("heading", { level: 1, name: "Ingest results" })).toBeVisible(slow);
    await page.getByRole("combobox", { name: "Order", exact: true }).selectOption({ label: `${code} · acquired` });
    await page.getByLabel("SCIEX OS results TXT").setInputFiles(results);
    await page.getByLabel("SCIEX OS version").fill("3.4.5 (synthetic)");
    await page.getByLabel("Processing method").fill("Synthetic journey processing method");
    await page.getByRole("button", { name: "Parse file" }).click();
    const summary = page.getByRole("region", { name: "Parse summary" });
    await expect(summary).toBeVisible(slow);
    await expect(summary.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    await shot(page, "ingest-parsed", analysis("Ingest results: the parse summary, ready to accept"));
    await summary.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(status(`Results accepted for ${code}. The order is now Processed`)).toBeVisible(slow);
    await shot(page, "ingest-accepted", analysis("The results are accepted: the order is Processed"));
  });

  // PHASE B: QC review goes here (after the results are ingested, before the dataset is built).

  await test.step("Release: build dataset v1", async () => {
    await page.goto(at("/release"));
    await expect(page.getByRole("heading", { level: 1, name: "Release" })).toBeVisible(slow);
    await page.getByRole("row", { name: word(code) }).getByRole("button", { name: "Build dataset v1" }).click();
    await expect(page).toHaveURL(onPath("/release/[0-9a-f-]{36}\\?built=1$"), slow);
    await expect(page.getByRole("heading", { level: 1, name: `${code} · Dataset v1` })).toBeVisible(slow);
    datasetId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(page.getByRole("table", { name: "Files of this version" }).getByText(/^[0-9a-f]{64}$/)).toHaveCount(3);
    await shot(page, "dataset-built", analysis("Dataset v1 is built: its files and checksums, no signatures yet"));
  });
});

// ================================================================ 7 · release with two signatures

test("10 · Stephania (Owner) sets the release policy: Paula and Stephania, 2 signatures", async ({ page }) => {
  test.setTimeout(180_000);
  const { steph, paula } = journeyRun();
  await signIn(page, steph, "staff");
  await page.goto(at("/release-policy"));
  await expect(page.getByRole("heading", { level: 1, name: "Release policy" })).toBeVisible(slow);
  const signers = page.getByRole("group", { name: "Eligible signers" });
  const box = (persona: Persona, role: string) => signers.getByRole("checkbox", { name: new RegExp(`^${escape(persona.name)}\\s*·\\s*${role}$`) });
  for (const other of await signers.getByRole("checkbox").all()) await other.uncheck();
  await box(paula, "Admin").check();
  await box(steph, "Owner").check();
  await page.getByRole("spinbutton", { name: "Required signatures" }).fill("2");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page).toHaveURL(onPath("/release-policy\\?saved=1$"), slow);
  await expect(page.getByRole("status")).toContainText("Release policy saved.");
  await expect(page.getByRole("heading", { level: 2, name: "2 signatures required" })).toBeVisible();
  await expect(signers.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await shot(page, "release-policy", lab("The Owner sets who may sign a release and how many signatures it needs", steph.name));
});

test("11 · Paula signs Prepared; a second person is needed", async ({ page }) => {
  test.setTimeout(180_000);
  const { paula } = journeyRun();
  await signIn(page, paula, "staff");
  await page.goto(at(`/release/${datasetId}`));
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("prepared");
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Prepared from the synthetic export (golden journey).");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page).toHaveURL(/\?signed=1$/, slow);
  await expect(page.getByText("1 of 2 required signatures")).toBeVisible(slow);
  await expect(page.getByRole("list", { name: "Signatures" })).toContainText(`${paula.name} · Prepared`);
  await expect(page.getByRole("button", { name: "Release dataset" })).toHaveCount(0);
  await shot(page, "signed-prepared", analysis("Paula signs Prepared: 1 of 2 signatures, a different person must sign next"));
});

test("12 · Stephania signs Approved and releases dataset v1", async ({ page }) => {
  test.setTimeout(240_000);
  const { steph } = journeyRun();
  const code = runOrder();
  await signIn(page, steph, "staff");
  await page.goto(at(`/release/${datasetId}`));
  await expect(page.getByText("1 of 2 required signatures")).toBeVisible(slow);
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("approved");
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Approved for release (golden journey).");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page).toHaveURL(/\?signed=1$/, slow);
  await expect(page.getByText("2 of 2 required signatures")).toBeVisible(slow);
  await expect(page.getByRole("button", { name: "Release dataset" })).toBeEnabled();
  await shot(page, "signed-approved", analysis("Stephania signs Approved: 2 of 2, ready to release", steph.name));
  await page.getByRole("button", { name: "Release dataset" }).click();
  await expect(page).toHaveURL(/\?released=1$/, slow);
  await expect(page.getByRole("status")).toContainText(`Dataset v1 released. ${code} is now Released`, slow);
  await shot(page, "released", analysis("Dataset v1 is released", steph.name));
  await page.goto(at(`/orders/${code}`));
  await expect(page.getByRole("heading", { level: 2, name: "Release complete" })).toBeVisible(slow);
  await shot(page, "order-released", analysis("The order reads Release complete", steph.name));
});

test("13 · Paula adds a file for the client and shows it", async ({ page }) => {
  test.setTimeout(180_000);
  const { paula } = journeyRun();
  const code = runOrder();
  await signIn(page, paula, "staff");
  await page.goto(at(`/orders/${code}`));
  const section = page.getByRole("region", { name: "Deliverables" });
  await expect(section).toBeVisible(slow);
  const add = section.getByRole("form", { name: "Add a deliverable" });
  await add.getByLabel("Title", { exact: true }).fill(deliverableTitle);
  await add.getByLabel("File", { exact: true }).setInputFiles({ name: "journey-lipid-summary.csv", mimeType: "text/csv", buffer: Buffer.from("lipid,class,mean\nPC 34:1,PC,1.0\nTG 52:2,TG,2.5\n") });
  await add.getByLabel("Show to the client now").check();
  await shot(page, "deliverable-form", lab("The Deliverables section: a file for the client, shown now"));
  await add.getByRole("button", { name: "Add file" }).click();
  await expect(page).toHaveURL(onPath(`/orders/${code}\\?deliverable=added-visible`), slow);
  await expect(page.getByRole("status").filter({ hasText: "File added and shown to the client." })).toBeVisible();
  await shot(page, "deliverable-added", lab("The file is added and shown to the client"));
});

// ================================================================ 9 · the client sees the dataset

test("14 · Dana signs in and sees the released order, its dataset and its files", async ({ page }) => {
  test.setTimeout(180_000);
  const { dana } = journeyRun();
  const code = runOrder();
  await signIn(page, dana, "client");
  await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible(slow);
  const datasets = page.getByRole("region", { name: "Datasets" });
  await expect(datasets.getByText(/Dataset v1/)).toBeVisible(slow);
  await expect(datasets.getByText(code, { exact: true })).toBeVisible();
  await shot(page, "client-home-released", client("Dana's home: the dataset is released to her"));
  await page.goto(at(`/orders/${code}`));
  await expect(page.getByRole("heading", { level: 2, name: "Released" })).toBeVisible(slow);
  await expect(page.getByRole("link", { name: `Download ${deliverableTitle}` })).toBeVisible();
  await shot(page, "client-order-released", client("The released order: dataset v1 and the files to download"));
});

// PHASE C: the lab turns Nexo on for the client (Clients → the client's Nexo switch), then Dana opens the dataset in Nexo.
