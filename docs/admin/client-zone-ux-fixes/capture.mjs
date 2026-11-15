// Screenshots after the client zone UX review's top 10 fixes, in demo mode with synthetic data only. The same walk as
// ../client-zone-ux-review/capture.mjs (the same scenes in the same order, so the demo store reaches the same states),
// saving only the scenes the ten fixes change, plus the contact for clients set by the lab before the walk starts and,
// at the end of the People scenes, the invited person accepting so People lists them by name.
// Start the Admin dev server with the environment gate for clients' Open in Nexo on, so the per-client switch decides:
//   cd frontends/admin && NEXT_PUBLIC_NEXO_URL=http://127.0.0.1:3120/nexo NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1 npm run dev -- --port 3110
// then, from frontends/admin:
//   node ../../docs/admin/client-zone-ux-fixes/capture.mjs
// BASE=<origin>/admin points at another port. Writes screenshots/<scene>-<1440|390>.png next to this file and prints
// the measurements (page width of the lab pages at 390, where Deliverables starts, the client's header).
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = path.resolve(here, "../../../frontends/admin");
const require = createRequire(path.join(admin, "package.json"));
const { chromium } = require("playwright");
// Optional: palette PNGs keep the folder small. Without sharp the captures are saved as Chromium wrote them.
let sharp = null;
try { sharp = require("sharp"); } catch { /* full-colour PNGs */ }

const BASE = process.env.BASE ?? "http://127.0.0.1:3110/admin";
const out = path.join(here, "screenshots");
// The scenes the ten fixes change (review.html, "Los 10 primeros"); every other scene is walked but not saved.
const WANTED = new Set([
  "c01-sign-in", "c02-request-access-form", "c02-request-access-sent", "c02-request-access-pending", "c03-choose-client",
  "c04-client-home", "c04-client-home-menu-open", "x-client-header", "c06-order-in-analysis", "c06-order-released-no-files-nexo-off",
  "c06-order-waiting", "c08-order-of-another-client", "l01-pipeline-notice", "l04-shipping-saved", "l02-order-request-accepted",
  "l03-people-access-requests", "l03-people-declined", "l03-people-invitation-link", "l03-people-member-named",
  "l06-order-deliverables-empty", "x-lab-order-first-screen", "l06-order-deliverables-shown",
  "c04-client-home-after-answers", "c06-order-accepted-shipping-text", "c06-order-declined", "c06-order-released-files-nexo-off",
  "c04-client-home-nexo-on", "c06-order-released-files-nexo-on",
]);
mkdirSync(out, { recursive: true });
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const slow = { timeout: 90_000 };
const CONTACT = "Write to lab@example.test or call +1 555 0100, Monday to Friday, 9:00 to 17:00.";
const SHIPPING = "Ship on dry ice, Monday to Wednesday only, to the Example Lab receiving desk, 1 Example Way.\nEmail the tracking number to lab@example.test the day you ship.";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Synthetic study report for the demo\n%%EOF\n");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, reducedMotion: "reduce", acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(90_000);
const taken = [];
const facts = {};

async function settle() {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(250);
}
async function save(file, options) {
  const target = path.join(out, file);
  const buffer = await page.screenshot(options);
  writeFileSync(target, sharp ? await sharp(buffer).png({ palette: true, colours: 256, effort: 8 }).toBuffer() : buffer);
}
// What a person meets at this width: sideways overflow, page height, the smallest text in the page body and the
// controls shorter than 40 px (phone only).
const audit = () => page.evaluate(() => {
  const root = document.querySelector("main") ?? document.body;
  let smallest = 99;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!node.textContent.trim() || !element || !element.getClientRects().length) continue;
    smallest = Math.min(smallest, parseFloat(getComputedStyle(element).fontSize));
  }
  const short = [...root.querySelectorAll("a, button, select, input:not([type=hidden]), summary")]
    .map(element => ({ text: (element.textContent || element.getAttribute("aria-label") || element.tagName).trim().slice(0, 30), height: Math.round(element.getBoundingClientRect().height) }))
    .filter(item => item.height > 0 && item.height < 40);
  return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, height: document.documentElement.scrollHeight, smallest, short };
});
async function shot(name, viewport = DESKTOP, options = {}) {
  await page.setViewportSize(viewport);
  // The Next.js dev indicator is not part of the app. Scroll to the top first: a full-page capture taken while the
  // page is scrolled paints the fixed, off-screen "Skip to content" link at the scroll offset (the review's x-skip-link-*).
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  if (!options.keepScroll) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const file = `${name}-${viewport.width}.png`;
  const seen = await audit();
  if (!WANTED.has(name)) return seen;
  const fullPage = options.fullPage ?? true;
  // A page that overflows sideways would be captured at the width a person sees first; the overflow is reported in the
  // list printed at the end (after fix 1 it should be empty).
  const sideways = fullPage && seen.overflow > 0;
  await save(file, options.clip ? { clip: options.clip, fullPage: options.clipPage ?? false } : sideways ? { fullPage: true, clip: { x: 0, y: 0, width: viewport.width, height: seen.height } } : { fullPage });
  taken.push({ file, overflow: seen.overflow, height: seen.height, smallest: seen.smallest, short: viewport === PHONE ? seen.short.length : undefined });
  console.log("shot", file, `overflow=${seen.overflow}`, `height=${seen.height}`);
  return seen;
}
async function both(name) {
  await settle();
  await shot(name, DESKTOP);
  const phone = await shot(name, PHONE);
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(150);
  return phone;
}
async function go(url) { await page.goto(`${BASE}${url}`); await settle(); }
const heading = (level, name) => page.getByRole("heading", { level, name });
const status = text => page.getByRole("status").filter({ hasText: text });

async function asClient(name = /Example Cedar/) {
  if (!/\/admin\/choose-client$/.test(page.url())) {
    await page.getByRole("form", { name: "Example view" }).getByRole("button", { name: "Client" }).click();
    await page.waitForURL(/\/admin\/(choose-client|client\/home)$/, slow);
    if (!/choose-client$/.test(page.url())) await go("/choose-client");
  }
  await page.getByRole("button", { name }).click();
  await page.waitForURL(/\/admin\/client\/home$/, slow);
  await settle();
}
async function asLab() {
  await page.getByRole("form", { name: "Example view" }).getByRole("button", { name: "Lab staff" }).click();
  await page.waitForURL(/\/admin\/pipeline$/, slow);
  await settle();
}
async function requestOrder({ panel, title, matrix, samples, notes }, capture) {
  await go("/client/request-order");
  if (panel) await page.getByLabel("Panel", { exact: true }).selectOption({ label: panel });
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Matrix", { exact: true }).fill(matrix);
  await page.getByLabel("Expected samples", { exact: true }).fill(samples);
  await page.getByLabel("Notes", { exact: true }).fill(notes);
  if (capture) await both(capture);
  await page.getByRole("button", { name: "Send request" }).click();
  await page.waitForURL(/\/admin\/client\/home\?requested=ORD\d{3,}$/, slow);
  await settle();
  return new URL(page.url()).searchParams.get("requested");
}

// ================================================================ Client side

// c01 · Sign in
await go("/sign-in");
await heading(1, "Welcome back.").waitFor(slow);
await both("c01-sign-in");

// The lab sets its contact for clients (fix 8) before anyone asks for access; this browser's demo store keeps it.
await page.getByRole("button", { name: "Enter example workspace" }).click();
await page.waitForURL(/\/admin\/pipeline$/, slow);
await go("/shipping-instructions");
await page.getByLabel("Contact clients read").fill(CONTACT);
await page.getByRole("button", { name: "Save contact" }).click();
await status("Contact for clients saved.").waitFor(slow);
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForURL(/\/admin\/sign-in$/, slow);

// c02 · Request access: the form, its errors, sent, already pending
await page.getByRole("link", { name: "Request access →" }).click();
await heading(1, "Request access.").waitFor(slow);
await both("c02-request-access-form");
await page.getByRole("button", { name: "Send request" }).click();
await page.getByRole("alert").filter({ hasText: "fields need attention" }).waitFor(slow);
await both("c02-request-access-errors");
// One wrong field: an address the form does not take.
await go("/request-access");
await page.getByLabel("Full name").fill("Ada Example");
await page.getByLabel("Work email").fill("ada@birch");
await page.getByLabel("Organisation or lab").fill("Example Birch");
await page.getByRole("button", { name: "Send request" }).click();
await page.getByRole("alert").first().waitFor(slow);
await both("c02-request-access-error-email");
await go("/request-access");
const fillAccess = async email => {
  await page.getByLabel("Full name").fill("Ada Example");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Organisation or lab").fill("Example Birch");
  await page.getByLabel("Type").selectOption("company");
  await page.getByLabel("What would you like to measure?").fill("About 30 serum samples on the broad lipidome panel, from February.");
};
await fillAccess("ada@birch.example.test");
await both("c02-request-access-filled");
await page.getByRole("button", { name: "Send request" }).click();
await heading(1, "Request received.").waitFor(slow);
await both("c02-request-access-sent");
await go("/request-access");
await fillAccess("ADA@birch.example.test");
await page.getByRole("button", { name: "Send request" }).click();
await heading(1, "Request already received.").waitFor(slow);
await both("c02-request-access-pending");

// c03 · Choose client (the example client user: Requester at Example Cedar, Viewer at Example Harbor)
await go("/sign-in");
await page.getByRole("button", { name: "Enter as an example client" }).click();
await page.waitForURL(/\/admin\/choose-client$/, slow);
await both("c03-choose-client");

// c04 · Client home, as it starts
await asClient();
await heading(1, "Your orders").waitFor(slow);
await both("c04-client-home");
// The client header (fix 6): no search box; its height on a phone; then the phone Menu opened.
const topbar = await page.locator("header.topbar").boundingBox();
facts.clientHeader = { searchBoxes: await page.locator("#global-search").count(), desktopHeight: Math.round(topbar.height) };
await shot("x-client-header", DESKTOP, { clip: { x: 0, y: 0, width: 1440, height: Math.ceil(topbar.height) } });
await page.setViewportSize(PHONE);
await page.waitForTimeout(200);
const phoneBar = await page.locator("header.topbar").boundingBox();
facts.clientHeader.phoneHeight = Math.round(phoneBar.height);
await shot("x-client-header", PHONE, { clip: { x: 0, y: 0, width: 390, height: Math.ceil(phoneBar.height) } });
await page.getByRole("button", { name: "Menu" }).click();
await page.waitForTimeout(200);
await shot("c04-client-home-menu-open", PHONE, { fullPage: false });
await page.getByRole("button", { name: "Menu" }).click();
await page.setViewportSize(DESKTOP);

// c06 · The client's order, states that exist in the example data
await go("/orders/ORD042");
await heading(2, "Send your samples").waitFor(slow);
await both("c06-order-accepted-no-shipping-text");
await go("/orders/ORD044");
await heading(2, "In analysis").waitFor(slow);
await both("c06-order-in-analysis");
await go("/orders/ORD040");
await heading(2, "Released").waitFor(slow);
await both("c06-order-released-no-files-nexo-off");

// c05 · Request an order: the form, its errors, filled, sent
await go("/client/request-order");
await heading(1, "Request an order").waitFor(slow);
await both("c05-request-order-form");
await page.getByLabel("Expected samples", { exact: true }).fill("-3");
await page.getByRole("button", { name: "Send request" }).click();
await page.getByRole("alert").first().waitFor(slow);
await both("c05-request-order-errors");
const first = await requestOrder({ panel: "Panel A · broad lipidome", title: "Plasma lipidome · diet study", matrix: "Plasma", samples: "24",
  notes: "Two diets, 12 animals each, EDTA plasma, 50 µL per tube. We can ship the week of Nov 16." }, "c05-request-order-filled");
await status(`Request ${first} sent.`).waitFor(slow);
await both("c05-request-order-sent");

// c06 · Waiting for the lab
await page.getByRole("region", { name: "Orders" }).getByRole("link", { name: first }).first().click();
await heading(2, "Waiting for the lab").waitFor(slow);
await both("c06-order-waiting");
// A second request, for the lab to decline.
const second = await requestOrder({ title: "Custom MRM list · pilot", matrix: "Tissue", samples: "8", notes: "Twelve oxylipins on our own transition list." });
facts.orders = { accepted: first, declined: second };

// c08 · What a client meets outside their own orders, and as a Viewer
await go("/orders/ORD041"); // Example Atlas
await heading(1, "Page not found").waitFor(slow);
await both("c08-order-of-another-client");
await go("/choose-client");
await asClient(/Example Harbor/);
await both("c04-client-home-viewer");
await go("/client/request-order");
await both("c05-request-order-viewer");
await go("/choose-client");
await asClient();

// ================================================================ Lab side

// l01 · Pipeline notice for client requests
await asLab();
await page.getByRole("status", { name: "Client requests" }).waitFor(slow);
await both("l01-pipeline-notice");
await shot("l01-pipeline-notice-fold", DESKTOP, { fullPage: false });
await shot("l01-pipeline-notice-fold", PHONE, { fullPage: false });
// Fix 1: with access requests waiting, the lab pages are as wide as the phone (the review measured 1327 px).
const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
facts.labPhoneWidth = {};
await page.setViewportSize(PHONE);
for (const url of ["/pipeline", "/people", "/orders/ORD040", "/shipping-instructions", "/clients"]) {
  await go(url);
  facts.labPhoneWidth[url] = await pageWidth();
}
await page.setViewportSize(DESKTOP);
await go("/pipeline");

// l04 · Shipping instructions: not set, then saved
await go("/shipping-instructions");
await heading(1, "Shipping instructions").waitFor(slow);
await both("l04-shipping-not-set");
await page.getByLabel("Instructions clients read").fill(SHIPPING);
await page.getByRole("button", { name: "Save instructions" }).click();
await status("Shipping instructions saved.").waitFor(slow);
await both("l04-shipping-saved");

// l02 · Order detail: accept or decline a client request
await go("/pipeline");
await page.getByRole("status", { name: "Client requests" }).getByRole("link", { name: `Review ${first} →` }).click();
await heading(2, "Accept this request?").waitFor(slow);
await both("l02-order-request-panel");
await page.getByRole("button", { name: "Accept request" }).click();
await page.waitForURL(new RegExp(`/admin/orders/${first}\\?answered=accepted$`), slow);
await status("Request accepted.").waitFor(slow);
await both("l02-order-request-accepted");
await go(`/orders/${second}`);
await heading(2, "Accept this request?").waitFor(slow);
await page.getByRole("button", { name: "Decline request" }).click();
await page.getByText("Write the reason. The client reads it on the order.").waitFor(slow);
await both("l02-order-decline-no-reason");
await page.getByLabel("Or decline, with a reason").fill("The custom MRM list needs a method we cannot run before March. Write to us and we will plan it.");
await page.getByRole("button", { name: "Decline request" }).click();
await page.waitForURL(new RegExp(`/admin/pipeline\\?declined=${second}$`), slow);
await status(`Request ${second} declined.`).waitFor(slow);
await both("l02-pipeline-request-declined");

// The lab records the arrival of ORD042, so the client has an order at "Samples received" (not a reviewed scene).
await go("/receive-shipment?order=ORD042");
await page.getByLabel("Carrier").fill("FedEx");
await page.getByLabel("Tracking number").fill("7489 0000 0001");
await page.getByRole("radio", { name: /^Intact and cold/ }).check();
await page.getByLabel("Boxes").fill("1");
await page.getByRole("button", { name: "Record arrival" }).click();
await page.waitForURL(/\/sample-registry\?order=ORD042&received=/, slow);

// l03 · People: access requests, the approve dialog, the link, decline
await go("/pipeline");
const nav = page.getByRole("navigation", { name: "Admin navigation" });
await nav.getByRole("link", { name: /^People/ }).click();
await heading(1, "People").waitFor(slow);
const requests = page.getByRole("region", { name: "Access requests" });
await requests.getByText("3 waiting").waitFor(slow);
await both("l03-people-access-requests");
const robin = requests.getByRole("row").filter({ hasText: "robin@larch.example.test" });
await robin.getByRole("button", { name: "Review Robin Example" }).click();
await requests.getByRole("form", { name: "Approve Robin Example" }).waitFor(slow);
await both("l03-people-approve-new-client");
// On a phone the approve form lives inside the table's sideways scroll: how much of it is off the screen.
await page.setViewportSize(PHONE); await page.waitForTimeout(200);
facts.approveFormOnPhone = await requests.getByRole("form", { name: "Approve Robin Example" }).evaluate(form => {
  const box = form.getBoundingClientRect();
  return { formWidth: Math.round(box.width), viewport: innerWidth, offScreen: Math.max(0, Math.round(box.right - innerWidth)) };
});
await page.setViewportSize(DESKTOP);
await robin.getByRole("button", { name: /Reviewing/ }).click();
const kai = requests.getByRole("row").filter({ hasText: "kai@cedar.example.test" });
await kai.getByRole("button", { name: "Review Kai Sample" }).click();
const approveKai = requests.getByRole("form", { name: "Approve Kai Sample" });
await approveKai.waitFor(slow);
await both("l03-people-approve-existing-client");
await approveKai.getByRole("button", { name: "Decline…" }).click();
const decline = requests.getByRole("form", { name: "Decline Kai Sample" });
await decline.getByLabel("Reason").fill("Asked the PI first: Example Cedar adds its own people through the lab.");
await both("l03-people-decline");
await decline.getByRole("button", { name: "Decline request" }).click();
await status("declined.").waitFor(slow);
await both("l03-people-declined");
const ada = requests.getByRole("row").filter({ hasText: "ada@birch.example.test" });
await ada.getByRole("button", { name: "Review Ada Example" }).click();
const approveAda = requests.getByRole("form", { name: "Approve Ada Example" });
await approveAda.getByRole("button", { name: "Approve and create invitation link" }).click();
const linkNotice = requests.getByRole("status").filter({ hasText: "Invitation link for ada@birch.example.test" });
await linkNotice.waitFor(slow);
const invitation = await linkNotice.getByLabel("Invitation link").inputValue();
await both("l03-people-invitation-link");
// The other end of the link (existed before F1-F4): where the person sets a password.
await page.goto(invitation);
await heading(1, /^Join as /).waitFor(slow);
await both("c02-invitation-page");
// Fix 4: Ada sets a password and joins; People names her as she wrote it on Request access.
await page.getByLabel("Password", { exact: true }).fill("a synthetic passphrase");
await page.getByLabel("Repeat password").fill("a synthetic passphrase");
await page.getByRole("button", { name: "Set password and join" }).click();
await page.getByText("Your account is ready.").waitFor(slow);
await go("/people");
await page.getByRole("table", { name: "People" }).getByRole("cell", { name: /^Ada Example/ }).waitFor(slow);
await both("l03-people-member-named");
// With every request answered: the empty state.
await go("/people");
const robinAgain = requests.getByRole("row").filter({ hasText: "robin@larch.example.test" });
await robinAgain.getByRole("button", { name: "Review Robin Example" }).click();
await requests.getByRole("form", { name: "Approve Robin Example" }).getByRole("button", { name: "Decline…" }).click();
await requests.getByRole("form", { name: "Decline Robin Example" }).getByLabel("Reason").fill("Synthetic: capacity is full until spring.");
await requests.getByRole("form", { name: "Decline Robin Example" }).getByRole("button", { name: "Decline request" }).click();
await status("declined.").waitFor(slow);
await go("/people");
await requests.getByText("No access requests are waiting.").waitFor(slow);
await both("l03-people-no-requests");

// l05 · Clients: the per-client Nexo switch, off
await go("/clients/example-cedar");
await heading(1, "Example Cedar").waitFor(slow);
await both("l05-client-nexo-off");

// l06 · Deliverables on the lab's order: empty, added (hidden), shown, retired, a refused file
await go("/orders/ORD040");
const section = page.getByRole("region", { name: "Deliverables" });
await section.waitFor(slow);
const whereIs = async () => page.evaluate(() => {
  const top = document.querySelector("#deliverables").getBoundingClientRect().top + scrollY;
  return { sectionTop: Math.round(top), pageHeight: document.documentElement.scrollHeight, viewport: innerHeight, screensDown: +(top / innerHeight).toFixed(1) };
});
facts.deliverables = { ORD040: { desktop: await whereIs() } };
await both("l06-order-deliverables-empty");
await shot("x-lab-order-first-screen", DESKTOP, { fullPage: false });
await page.setViewportSize(PHONE); await page.waitForTimeout(200);
facts.deliverables.ORD040.phone = await whereIs();
await page.setViewportSize(DESKTOP);
// The same measure on an order in the middle of the pipeline and on an accepted request.
for (const code of ["ORD044", first]) {
  await go(`/orders/${code}`);
  await page.locator("#deliverables").waitFor(slow);
  facts.deliverables[code] = { desktop: await whereIs() };
  await page.setViewportSize(PHONE); await page.waitForTimeout(200);
  facts.deliverables[code].phone = await whereIs();
  await page.setViewportSize(DESKTOP);
}
await go("/orders/ORD040");
async function addFile(title, kind, file) {
  const form = page.getByRole("form", { name: "Add a deliverable" });
  await form.getByLabel("Title", { exact: true }).fill(title);
  await form.getByLabel("Kind", { exact: true }).selectOption(kind);
  await form.getByLabel("File", { exact: true }).setInputFiles(file);
  await form.getByRole("button", { name: "Add file" }).click();
  await page.waitForURL(/\/admin\/orders\/ORD040\?deliverable=[a-z-]+#deliverables$/, slow);
  await settle();
}
await addFile("Study report", "report", { name: "Study report.pdf", mimeType: "application/pdf", buffer: PDF });
facts.afterAdd = await page.evaluate(() => ({ scrollY: Math.round(scrollY), noticeVisible: (() => { const n = document.querySelector("#deliverables [role=status]"); if (!n) return false; const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })() }));
await both("l06-order-deliverables-added-hidden");
await addFile("Figure 1 · lipid classes", "figure", { name: "figure-1.png", mimeType: "image/png", buffer: PNG });
const rows = section.getByRole("list", { name: "Deliverables" }).getByRole("listitem");
await rows.filter({ hasText: "Study report" }).getByRole("button", { name: "Show to client" }).click();
await status("The client now sees this file.").waitFor(slow);
await both("l06-order-deliverables-shown");
const figure = rows.filter({ hasText: "Figure 1" });
await figure.getByLabel("Reason for retiring Figure 1 · lipid classes").fill("Synthetic: wrong colour scale, replaced by figure 2.");
await figure.getByRole("button", { name: "Retire" }).click();
await figure.getByText(/^Retired /).first().waitFor(slow);
await settle();
await both("l06-order-deliverables-retired");
await addFile("Raw notes", "other", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("synthetic notes") });
await page.getByRole("alert").filter({ hasText: "Nothing was added" }).waitFor(slow);
await both("l06-order-deliverables-refused-file");

// ================================================================ Client side, after the lab's answers

await asClient();
await both("c04-client-home-after-answers");
await go(`/orders/${first}`);
await heading(2, "Send your samples").waitFor(slow);
await page.getByRole("note", { name: "Shipping instructions" }).waitFor(slow);
await both("c06-order-accepted-shipping-text");
await go(`/orders/${second}`);
await heading(2, "Declined by the lab").waitFor(slow);
await both("c06-order-declined");
await go("/orders/ORD042");
await heading(2, "Samples received").waitFor(slow);
await both("c06-order-received");
await go("/orders/ORD040");
await heading(2, "Released").waitFor(slow);
await page.getByRole("list", { name: "Your files" }).waitFor(slow);
await both("c06-order-released-files-nexo-off");

// c07 · File download: the browser saves the file; the page does not change
const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download Study report" }).click()]);
const saved = readFileSync(await download.path());
facts.download = { suggestedFilename: download.suggestedFilename(), bytes: saved.length, sameBytes: saved.equals(PDF), urlAfter: page.url().replace(BASE, "") };
await both("c07-file-download");

// l05 / c06 · The lab turns Nexo on for Example Cedar; the client's released order and home follow
await asLab();
await go("/clients/example-cedar");
const nexo = page.getByRole("region", { name: "Nexo access" });
await nexo.getByLabel("Act as (demo)").selectOption("example-owner");
await nexo.getByRole("button", { name: "Turn Nexo access on" }).click();
await status("Nexo access turned on for Example Cedar.").waitFor(slow);
await both("l05-client-nexo-on");
await asClient();
await page.getByRole("region", { name: "Datasets" }).getByRole("link", { name: "Open in Nexo" }).first().waitFor(slow);
await both("c04-client-home-nexo-on");
await go("/orders/ORD040");
await page.getByRole("link", { name: "Open in Nexo" }).waitFor(slow);
await both("c06-order-released-files-nexo-on");

await browser.close();
const overflowing = taken.filter(item => item.overflow > 0).map(item => `${item.file} (+${item.overflow}px)`);
console.log(JSON.stringify({ shots: taken.length, overflowing, smallestText: Math.min(...taken.map(item => item.smallest)), facts }, null, 2));
console.log(taken.map(item => `${item.file}\t${item.height}px\tsmallest ${item.smallest}px${item.short === undefined ? "" : `\t${item.short} controls under 40px`}`).join("\n"));
