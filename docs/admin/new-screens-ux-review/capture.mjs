// Screenshot capture for the UX review of the four new Admin screens: Storage, Instruments & panels, QC review and
// Notifications (lab view and client view). Demo mode, synthetic data only.
// Start the Admin dev server without Supabase variables (the example workspace):
//   cd frontends/admin && NEXT_PUBLIC_NEXO_URL=http://127.0.0.1:3120/nexo NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1 npm run dev -- --port 3110
// then, from frontends/admin:
//   node ../../docs/admin/new-screens-ux-review/capture.mjs              the review's shots  -> screenshots/
//   PASS=after node ../../docs/admin/new-screens-ux-review/capture.mjs   after the fixes     -> after/
// BASE=<origin>/admin points at another port; ONLY=storage,qc,notifications,instruments,context walks some parts.
// Writes <scene>-<1440|390>.png (s = Storage, q = QC review, n = Notifications, i = Instruments & panels, x = context)
// and prints the measurements quoted in review.html: sideways overflow, tables that scroll inside their frame and the
// columns they hide, controls under 36 and 24 px on the phone, text under 4.5:1, where the focus and the page are
// after a click. One browser context: the demo records live per browser cookie, so every run starts from a fresh demo
// store and the lab and client views of the run share it. The walk ends by archiving every example panel and
// instrument and by emptying the boxes (the empty states), which only changes this browser's demo store.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
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
const AFTER = process.env.PASS === "after";
const out = path.join(here, AFTER ? "after" : "screenshots");
const parts = new Set((process.env.ONLY ?? "storage,qc,notifications,instruments,context").split(",").map(item => item.trim()));
mkdirSync(out, { recursive: true });
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const slow = { timeout: 90_000 };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, reducedMotion: "reduce" });
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
  const buffer = await page.screenshot(options);
  writeFileSync(path.join(out, file), sharp ? await sharp(buffer).png({ palette: true, colours: 256, effort: 8 }).toBuffer() : buffer);
}

// What a person meets at this width, measured in the page body (main):
//   overflow    sideways overflow of the page itself
//   scrollers   frames that scroll sideways inside the page: their width, their content's width, whether the keyboard
//               can reach them, and the column headers that start beyond the visible edge
//   short       controls under 36 px tall (an Admin button is 39) and, apart, under 24 px (WCAG 2.2 AA 2.5.8);
//               what a closed <details> holds is not counted
//   low         text under 4.5:1 against the background painted behind it (disabled controls apart)
//   smallest    the smallest text
const audit = () => page.evaluate(() => {
  const root = document.querySelector("main") ?? document.body;
  const parse = value => { const n = (value.match(/[\d.]+/g) ?? []).map(Number); return { r: n[0] ?? 0, g: n[1] ?? 0, b: n[2] ?? 0, a: n[3] ?? 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const luminance = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const background = element => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) { const c = parse(getComputedStyle(node).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a === 1) break; } }
    return layers.reverse().reduce((under, layer) => over(layer, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const ratio = (color, element) => { const bg = background(element); const a = luminance(over(color, bg)); const b = luminance(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const label = element => (element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || element.tagName).trim().replace(/\s+/g, " ").slice(0, 40);

  let smallest = 99;
  const low = new Map();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!node.textContent.trim() || !element || !element.getClientRects().length || !element.checkVisibility() || element.closest(".sr-only")) continue;
    const style = getComputedStyle(element);
    const size = parseFloat(style.fontSize);
    smallest = Math.min(smallest, size);
    const value = ratio(parse(style.color), element);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (value < (large ? 3 : 4.5)) {
      const key = `${element.closest(":disabled") ? "disabled " : ""}${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]} ${style.color}`;
      if (!low.has(key)) low.set(key, { what: key, text: node.textContent.trim().slice(0, 30), size, ratio: Math.round(value * 100) / 100 });
    }
  }
  for (const input of root.querySelectorAll("input[placeholder]")) {
    if (!input.getClientRects().length || !input.checkVisibility() || input.value) continue;
    const value = ratio(parse(getComputedStyle(input, "::placeholder").color), input);
    if (value < 4.5 && !low.has("placeholder")) low.set("placeholder", { what: "input::placeholder", text: input.placeholder.slice(0, 30), size: parseFloat(getComputedStyle(input).fontSize), ratio: Math.round(value * 100) / 100 });
  }
  const controls = [...root.querySelectorAll("a, button, select, input:not([type=hidden]), summary")].filter(element => element.checkVisibility())
    .map(element => { const box = element.getBoundingClientRect(); return { text: label(element), width: Math.round(box.width), height: Math.round(box.height) }; })
    .filter(item => item.height > 0);
  const group = list => { const seen = new Map(); for (const item of list) { const key = `${item.text.replace(/ORD\d+(-S\d+)?(-A\d+)?/g, "CODE")} ${item.width}x${item.height}`; seen.set(key, (seen.get(key) ?? 0) + 1); } return [...seen].map(([key, count]) => count > 1 ? `${key} (x${count})` : key); };
  const scrollers = [...root.querySelectorAll("*")].filter(element => element.scrollWidth > element.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(element).overflowX)).map(element => {
    const edge = element.getBoundingClientRect().right;
    return {
      label: element.getAttribute("aria-label") ?? element.querySelector("table")?.getAttribute("aria-label") ?? element.className, visible: element.clientWidth, content: element.scrollWidth,
      keyboard: element.tabIndex >= 0 || !!element.querySelector("a, button, input, select, summary"),
      hidden: [...element.querySelectorAll("th")].filter(th => th.getBoundingClientRect().left >= edge - 8).map(th => th.textContent.trim() || "(actions)"),
      cut: [...element.querySelectorAll("th")].filter(th => { const box = th.getBoundingClientRect(); return box.left < edge - 8 && box.right > edge + 1; }).map(th => th.textContent.trim() || "(actions)"),
    };
  });
  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, height: document.documentElement.scrollHeight, smallest,
    short: group(controls.filter(item => item.height < 36)), tiny: group(controls.filter(item => item.height < 24)), low: [...low.values()], scrollers,
  };
});
const measured = {};
async function shot(name, viewport = DESKTOP, options = {}) {
  await page.setViewportSize(viewport);
  // The Next.js dev indicator is not part of the app. Scroll to the top first, as a person arriving on the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  if (!options.keepScroll) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const file = `${name}-${viewport.width}.png`;
  const seen = await audit();
  const sideways = !options.clip && seen.overflow > 0;
  await save(file, options.clip ? { clip: options.clip } : sideways ? { fullPage: true, clip: { x: 0, y: 0, width: viewport.width, height: seen.height } } : { fullPage: true });
  taken.push({ file, overflow: seen.overflow, height: seen.height, smallest: seen.smallest });
  measured[`${name}-${viewport.width}`] = viewport === PHONE
    ? { height: seen.height, overflow: seen.overflow, scrollers: seen.scrollers, short: seen.short, tiny: seen.tiny, low: seen.low }
    : { height: seen.height, overflow: seen.overflow, scrollers: seen.scrollers, low: seen.low };
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
const alert = text => page.getByRole("main").getByRole("alert").filter({ hasText: text });
// Where the person is after a click: how far the page is scrolled, whether the element they need is on the screen, and
// what has the focus.
const where = selector => page.evaluate(wanted => {
  const element = document.querySelector(wanted);
  const box = element?.getBoundingClientRect();
  const active = document.activeElement;
  return {
    scrollY: Math.round(scrollY), top: box ? Math.round(box.top) : null, onScreen: !!box && box.top >= -1 && box.top < innerHeight - 40,
    focus: !active || active === document.body ? "page body" : `${active.tagName.toLowerCase()}${active.getAttribute("role") ? `[role=${active.getAttribute("role")}]` : ""} "${(active.getAttribute("aria-label") || active.getAttribute("name") || active.textContent || "").trim().slice(0, 40)}"`,
  };
}, selector);
// The first tab stops after an element, as a keyboard user meets them.
async function tabStops(from, count) {
  await page.locator(from).first().focus();
  const stops = [];
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => { const a = document.activeElement; return `${a.tagName.toLowerCase()} "${(a.getAttribute("aria-label") || a.getAttribute("name") || a.textContent || "").trim().slice(0, 30)}"`; }));
  }
  return stops;
}

async function enterLab() {
  await go("/sign-in");
  await page.getByRole("button", { name: "Enter example workspace" }).click();
  await page.waitForURL(/\/admin\/pipeline$/, slow);
  await settle();
}
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

await enterLab();

// ================================================================ Storage

if (parts.has("storage")) {
  facts.storage = {};
  const aliquotForm = name => page.getByRole("form", { name });
  const submit = async (name, fields, button) => {
    const form = aliquotForm(name);
    for (const [label, value] of Object.entries(fields)) await form.getByRole("textbox", { name: label, exact: true }).fill(value);
    await form.getByRole("button", { name: button }).click();
  };

  // s01 · With data: two boxes, six aliquots waiting for one
  await go("/storage");
  await heading(1, "Storage").waitFor(slow);
  await both("s01-storage");

  // s02 · One box open
  await page.getByRole("list", { name: "Boxes" }).getByRole("link", { name: /F1-R1-B02/ }).click();
  await page.getByRole("table", { name: "Positions in box F1-R1-B02" }).waitFor(slow);
  await both("s02-box-open");

  // s03 · Place: the form opens from the bottom table. Measured on the phone: where the page is after the tap.
  await page.setViewportSize(PHONE);
  const waiting = page.getByRole("table", { name: "Aliquots waiting for a box" });
  await waiting.getByRole("link", { name: "Place ORD044-S004-A1", exact: true }).click();
  await page.getByRole("region", { name: "Place ORD044-S004-A1" }).waitFor(slow);
  await settle();
  facts.storage.afterTapPlace390 = await where("#act");
  facts.storage.formTabOrder = await tabStops("#act input[name=box]", 3);
  await page.setViewportSize(DESKTOP);
  await both("s03-place-form");

  // s04 · Refused: the position is taken. The typed values stay.
  await page.setViewportSize(PHONE);
  await submit("Place ORD044-S004-A1", { Box: "F1-R1-B02", Position: "A1" }, "Place");
  await aliquotForm("Place ORD044-S004-A1").getByRole("alert").waitFor(slow);
  facts.storage.afterRefusal390 = { ...(await where("#act [role=alert]")), boxKept: await aliquotForm("Place ORD044-S004-A1").getByRole("textbox", { name: "Box", exact: true }).inputValue() };
  await page.setViewportSize(DESKTOP);
  await both("s04-place-refused");

  // s05 · Placed
  await page.setViewportSize(PHONE);
  await submit("Place ORD044-S004-A1", { Position: "A4" }, "Place");
  await status("ORD044-S004-A1 placed in box F1-R1-B02, position A4.").waitFor(slow);
  await settle();
  facts.storage.afterPlaced390 = await where("main [role=status]");
  await page.setViewportSize(DESKTOP);
  await both("s05-placed");

  // s06, s07 · Move to a new box
  await page.getByRole("table", { name: "Positions in box F1-R1-B02" }).getByRole("link", { name: "Move ORD044-S004-A1", exact: true }).click();
  await page.getByRole("region", { name: "Move ORD044-S004-A1" }).waitFor(slow);
  await both("s06-move-form");
  await submit("Move ORD044-S004-A1", { "New box": "F1-R1-B03", Position: "A1" }, "Move");
  await status("ORD044-S004-A1 moved to box F1-R1-B03, position A1.").waitFor(slow);
  await both("s07-moved");

  // s08, s09 · Remove with a reason: the box is empty again
  await page.getByRole("table", { name: "Positions in box F1-R1-B03" }).getByRole("link", { name: "Remove ORD044-S004-A1", exact: true }).click();
  await page.getByRole("region", { name: "Remove ORD044-S004-A1" }).waitFor(slow);
  await both("s08-remove-form");
  await submit("Remove ORD044-S004-A1", { Reason: "Synthetic: used up in batch B2026-032" }, "Remove");
  await status("ORD044-S004-A1 removed from storage.").waitFor(slow);
  await both("s09-removed");

  // s10, s11 · Search: found, and nothing found
  const search = page.getByRole("search", { name: "Find an aliquot" });
  await go("/storage");
  await search.getByRole("searchbox", { name: "Sample or aliquot code" }).fill("ord046-s002");
  await search.getByRole("button", { name: "Search" }).click();
  await page.getByRole("table", { name: "Aliquots matching ord046-s002" }).waitFor(slow);
  await both("s10-search-found");
  await go("/storage?q=ORD04");
  await both("s10-search-many");
  await go("/storage?q=ORD099");
  await both("s11-search-none");

  // s12 · A form that no longer applies: Place for an aliquot that is already in a box (an old tab, a shared link)
  await go("/storage?act=place&aliquot=ORD046-S001-A1#act");
  await page.getByRole("region", { name: "Place ORD046-S001-A1" }).waitFor(slow);
  await both("s12-place-already-placed");

  // s13 · Nothing waits for a box: every waiting aliquot placed in F1-R1-B03
  await go("/storage");
  const waitingCodes = await page.getByRole("table", { name: "Aliquots waiting for a box" }).locator("tbody tr td:first-child").allInnerTexts();
  for (const [index, code] of waitingCodes.entries()) {
    await go(`/storage?act=place&aliquot=${code.trim()}#act`);
    await submit(`Place ${code.trim()}`, { Box: "F1-R1-B03", Position: `B${index + 1}` }, "Place");
    await status(`${code.trim()} placed in box F1-R1-B03`).waitFor(slow);
  }
  await go("/storage?box=F1-R1-B03");
  await both("s13-none-waiting");

  // s14 · Empty: every aliquot removed, so no box is listed and everything waits for one
  const boxes = await page.getByRole("list", { name: "Boxes" }).getByRole("link").locator(".mono").allInnerTexts();
  for (const box of boxes) {
    await go(`/storage?box=${box}`);
    const codes = await page.getByRole("table", { name: `Positions in box ${box}` }).locator("tbody tr td:nth-child(2)").allInnerTexts();
    for (const code of codes) {
      await go(`/storage?act=remove&aliquot=${code.trim()}#act`);
      await submit(`Remove ${code.trim()}`, { Reason: "Synthetic: left the freezer" }, "Remove");
      await status(`${code.trim()} removed from storage.`).waitFor(slow);
    }
  }
  await go("/storage");
  await both("s14-empty");
}

// ================================================================ QC review

if (parts.has("qc")) {
  facts.qc = {};
  const sampleRow = code => page.getByRole("table", { name: "Samples of ORD053" }).getByRole("row").filter({ hasText: code });
  const decide = async (code, summary, reason, button) => {
    const row = sampleRow(code);
    if (!(await row.getByRole("textbox", { name: "Reason" }).isVisible())) await row.locator("summary", { hasText: summary }).click();
    await row.getByRole("textbox", { name: "Reason" }).fill(reason);
    await row.getByRole("button", { name: button }).click();
  };

  // q01 · The orders at Processed or QC reviewed
  await go("/qc-review");
  await heading(1, "QC review").waitFor(slow);
  facts.qc.listOrderIsLink = await page.getByRole("table", { name: "Orders at Processed or QC reviewed" }).getByRole("link", { name: "ORD053", exact: true }).count();
  await both("q01-orders");

  // q02 · One order, nothing decided yet
  await page.getByRole("table", { name: "Orders at Processed or QC reviewed" }).getByRole("link", { name: "Open ORD053" }).click();
  await heading(1, "QC review · ORD053").waitFor(slow);
  await both("q02-order");

  // q03 · Exclude: the reason field opens in the row; a blank reason is refused
  await sampleRow("ORD053-S002").locator("summary", { hasText: "Exclude" }).click();
  await both("q03-exclude-open");
  await decide("ORD053-S002", "Exclude", "   ", "Exclude sample");
  await sampleRow("ORD053-S002").getByRole("alert").waitFor(slow);
  await settle();
  facts.qc.reasonAfterRefusal = await sampleRow("ORD053-S002").locator("input[name=reason]").inputValue();
  await both("q03-exclude-refused");

  // q04 · Excluded. A second one, far down the list, on the phone: where the page is afterwards.
  await decide("ORD053-S002", "Exclude", "Haemolysed synthetic tube", "Exclude sample");
  await status("Exclusion recorded.").waitFor(slow);
  await page.setViewportSize(PHONE);
  await sampleRow("ORD053-S015").scrollIntoViewIfNeeded();
  await decide("ORD053-S015", "Exclude", "Failed injection (synthetic)", "Exclude sample");
  await page.getByRole("heading", { level: 2, name: "22 samples · 2 excluded" }).waitFor(slow);
  await settle();
  facts.qc.afterExclude390 = { ...(await where("main [role=status]")), rowTop: await sampleRow("ORD053-S015").evaluate(row => Math.round(row.getBoundingClientRect().top + scrollY)), bannerNamesSample: /S015/.test(await page.getByRole("status").first().innerText()) };
  await page.setViewportSize(DESKTOP);
  await both("q04-excluded");

  // q05 · Withdraw one exclusion, with its reason
  await sampleRow("ORD053-S015").locator("summary", { hasText: "Withdraw" }).click();
  await both("q05-withdraw-open");
  await decide("ORD053-S015", "Withdraw", "Re-read the injection log: it ran", "Withdraw exclusion");
  await status("Exclusion withdrawn.").waitFor(slow);
  await both("q05-withdrawn");

  // q06, q07 · Mark QC reviewed, behind its confirm
  const step = page.getByRole("region", { name: "QC reviewed" });
  await step.locator("summary", { hasText: "Mark QC reviewed" }).click();
  await both("q06-mark-confirm");
  await step.getByRole("button", { name: "Yes, mark QC reviewed" }).click();
  await status("ORD053 is QC reviewed.").waitFor(slow);
  await both("q07-reviewed");

  // q08 · Closed: the dataset is built in Release, QC review reads only
  await go("/release");
  await page.getByRole("row", { name: /ORD053/ }).getByRole("button", { name: "Build dataset v1" }).click();
  await page.waitForURL(/\/admin\/release\/[0-9a-f-]{36}\?built=1$/, slow);
  await go("/qc-review?order=ORD053");
  await page.getByText(/ORD053 is Excel built; its QC decisions are closed/).waitFor(slow);
  await both("q08-closed");

  // q09 · An order code that is not there
  await go("/qc-review?order=ORD999");
  await both("q09-not-found");

  // q10 · Empty: every other order's dataset built too, so nothing is left to review
  try {
    for (const code of ["ORD048", "ORD049", "ORD056"]) {
      await go("/release");
      await page.getByRole("row", { name: new RegExp(code) }).getByRole("button", { name: "Build dataset v1" }).click({ timeout: 20_000 });
      await page.waitForURL(/\/admin\/release\/[0-9a-f-]{36}\?built=1$/, { timeout: 60_000 });
    }
    await go("/qc-review");
    await both("q10-empty");
  } catch (error) {
    facts.qc.emptyNotReached = String(error.message).split("\n")[0];
  }
}

// ================================================================ Notifications

if (parts.has("notifications")) {
  facts.notifications = {};
  const switchOf = label => page.getByRole("form", { name: label });
  const openNotifications = async () => {
    await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Notifications" }).click();
    await heading(1, "Notifications").waitFor(slow);
    await settle();
  };

  // n01 · Lab view, first visit: both emails on, no email in the log
  await go("/notifications");
  await heading(1, "Notifications").waitFor(slow);
  await both("n01-lab-first");

  // n02 · Switched off
  await switchOf("Someone requests access").getByRole("button", { name: "Turn off" }).click();
  await status("Someone requests access: off.").waitFor(slow);
  facts.notifications.afterTurnOff = await where("main [role=status]");
  await both("n02-lab-switched-off");

  // Someone asks for access on the public page: one log row per lab Owner, Admin and Operator.
  await go("/request-access");
  await page.getByLabel("Full name").fill("Noa Example");
  await page.getByLabel("Work email").fill("noa@alder.example.test");
  await page.getByLabel("Organisation or lab").fill("Example Alder");
  await page.getByLabel("Type").selectOption("pi_lab");
  await page.getByRole("button", { name: "Send request" }).click();
  await heading(1, "Request received.").waitFor(slow);
  await go("/pipeline");

  // n03 · Client view (Requester at Example Cedar): the client's two emails, no log
  await asClient();
  await openNotifications();
  facts.notifications.clientText = (await page.getByRole("main").innerText()).replace(/\s+/g, " ").trim();
  await both("n03-client-first");

  // n04 · The client turns one off
  await switchOf("A dataset is released").getByRole("button", { name: "Turn off" }).click();
  await status("A dataset is released: off.").waitFor(slow);
  await both("n04-client-switched-off");

  // n05 · The same person as a Viewer of another client (Example Harbor): the same switches, the same states
  await asClient(/Example Harbor/);
  await openNotifications();
  facts.notifications.viewer = {
    role: (await page.locator(".user-role").innerText()).trim(), switches: await page.getByRole("main").getByRole("form").count(),
    requestSwitchShown: await switchOf("My order request is answered").count(),
    releasedIsOffHereToo: await switchOf("A dataset is released").getByText("Off", { exact: true }).count(),
    mayRequestOrders: await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Request an order" }).count(),
    logShown: await page.getByRole("region", { name: "Recent sends" }).count(),
  };
  await both("n05-client-viewer");

  // The client (as Requester at Example Cedar) requests an order; the lab accepts it. Two more events in the log.
  await asClient();
  await go("/client/request-order");
  await page.getByLabel("Title", { exact: true }).fill("Synthetic serum lipidome · pilot");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.waitForURL(/\/admin\/client\/home\?requested=ORD\d{3,}$/, slow);
  const code = new URL(page.url()).searchParams.get("requested");
  await asLab();
  await go(`/orders/${code}`);
  await page.getByRole("button", { name: "Accept request" }).click();
  await status("Request accepted.").waitFor(slow);

  // n06 · Lab view: the send log with three kinds of event; every row skipped in the example workspace
  await go("/notifications");
  await page.getByRole("table", { name: "Recent sends" }).waitFor(slow);
  facts.notifications.logRows = await page.getByRole("table", { name: "Recent sends" }).locator("tbody tr").count();
  facts.notifications.logErrors = [...new Set(await page.getByRole("table", { name: "Recent sends" }).locator("tbody tr td:last-child").allInnerTexts())];
  await both("n06-lab-log");

  // n07 · Switched on again
  await switchOf("Someone requests access").getByRole("button", { name: "Turn on" }).click();
  await status("Someone requests access: on.").waitFor(slow);
  await both("n07-lab-switched-on");
}

// ================================================================ Instruments & panels

if (parts.has("instruments")) {
  facts.instruments = {};
  const region = name => page.getByRole("region", { name, exact: true });
  const done = text => status(text).waitFor(slow);

  // i01 · With data: two instruments, four panels, both New forms open
  await go("/instruments-panels");
  await heading(1, "Instruments & panels").waitFor(slow);
  await both("i01-instruments-panels");

  // i02 · Add an instrument
  const newInstrument = region("New instrument");
  await newInstrument.getByLabel("Instrument name", { exact: true }).fill("Synthetic Orbitrap 2");
  await newInstrument.getByLabel("Model", { exact: true }).fill("Orbitrap (synthetic)");
  await newInstrument.getByLabel("Serial number", { exact: true }).fill("SYN-0003");
  await newInstrument.getByRole("button", { name: "Add instrument", exact: true }).click();
  await done("Instrument added.");
  await both("i02-instrument-added");

  // i03 · Add a panel on it
  const fillPanel = async name => {
    const form = region("New panel");
    await form.getByLabel("Panel name", { exact: true }).fill(name);
    await form.getByLabel("Instrument", { exact: true }).selectOption({ label: "Synthetic Orbitrap 2" });
    await form.getByLabel("LC method", { exact: true }).fill("C18, 12 min");
    await form.getByLabel("ISTD kits", { exact: true }).fill("Synthetic kit M, Synthetic kit N");
    await form.getByLabel("Dataset type", { exact: true }).selectOption("mediators");
    return form;
  };
  await (await fillPanel("Synthetic oxylipins")).getByRole("button", { name: "Add panel", exact: true }).click();
  await done("Panel added.");
  await both("i03-panel-added");

  // i04 · Refused: a panel with a name that exists. Measured: what is left of the typed form.
  const duplicate = await fillPanel("Panel A · broad lipidome");
  await duplicate.getByRole("button", { name: "Add panel", exact: true }).click();
  await duplicate.getByRole("alert").waitFor(slow);
  await settle();
  facts.instruments.afterRefusal = {
    message: await duplicate.getByRole("alert").innerText(),
    nameKept: await duplicate.getByLabel("Panel name", { exact: true }).inputValue(), methodKept: await duplicate.getByLabel("LC method", { exact: true }).inputValue(),
    kitsKept: await duplicate.getByLabel("ISTD kits", { exact: true }).inputValue(), typeKept: await duplicate.getByLabel("Dataset type", { exact: true }).inputValue(),
    // The confirmation of the panel added before is still on the page, above the refusal.
    earlierConfirmation: await page.getByRole("main").getByRole("status").allInnerTexts(),
  };
  await both("i04-panel-refused-duplicate");

  // i05 · Refused: the demo Operator is not a lab Owner or Admin
  await go("/instruments-panels");
  await region("New instrument").getByLabel("Instrument name", { exact: true }).fill("Synthetic QTRAP 3");
  await region("New instrument").getByLabel("Act as (demo)").selectOption("example-staff");
  await region("New instrument").getByRole("button", { name: "Add instrument", exact: true }).click();
  await region("New instrument").getByRole("alert").waitFor(slow);
  await settle();
  facts.instruments.operatorRefusal = { message: await region("New instrument").getByRole("alert").innerText(), nameKept: await region("New instrument").getByLabel("Instrument name", { exact: true }).inputValue() };
  await both("i05-instrument-refused-operator");

  // i06 · Edit a panel that orders use: its dataset type is fixed. Measured on the phone: where the page is after the tap.
  await go("/instruments-panels");
  await page.setViewportSize(PHONE);
  await page.getByRole("link", { name: "Edit Panel A · broad lipidome", exact: true }).click();
  await region("Edit Panel A · broad lipidome").waitFor(slow);
  await settle();
  facts.instruments.afterTapEdit390 = await where("#panel-form");
  await page.setViewportSize(DESKTOP);
  await both("i06-panel-edit-fixed-type");

  // i07 · Save an edit
  await go("/instruments-panels");
  await page.getByRole("link", { name: "Edit Synthetic oxylipins", exact: true }).click();
  await region("Edit Synthetic oxylipins").getByLabel("LC method", { exact: true }).fill("C18, 14 min");
  await region("Edit Synthetic oxylipins").getByRole("button", { name: "Save panel", exact: true }).click();
  await done("Panel saved.");
  await both("i07-panel-saved");

  // i08 · Archive refused before it is tried: the instrument still has active panels
  await page.getByRole("link", { name: "Edit Demo QQQ 1", exact: true }).click();
  await region("Edit Demo QQQ 1").waitFor(slow);
  facts.instruments.blockedArchiveControls = await region("Edit Demo QQQ 1").locator("div").filter({ has: page.getByRole("heading", { name: "Archive instrument" }) }).last().locator("input:not([type=hidden]), select, button").count();
  await both("i08-instrument-archive-blocked");

  // i09, i10 · Archive the new panel with a reason; show archived
  const archive = async (kind, name, reason) => {
    await page.getByRole("table", { name: kind === "panel" ? "Panels" : "Instruments" }).getByRole("link", { name: `Edit ${name}`, exact: true }).click();
    const edit = region(`Edit ${name}`);
    await edit.getByLabel("Reason", { exact: true }).fill(reason);
    await edit.getByRole("button", { name: `Archive ${kind}`, exact: true }).click();
    await done(kind === "panel" ? "Panel archived." : "Instrument archived.");
    await settle();
  };
  await go("/instruments-panels");
  await archive("panel", "Synthetic oxylipins", "Synthetic: method retired");
  await both("i09-panel-archived");
  await page.getByRole("link", { name: /^Show archived/ }).click();
  await page.getByRole("link", { name: "Hide archived" }).waitFor(slow);
  await both("i10-archived-shown");

  // i11 · Empty: every panel archived, then every instrument
  await go("/instruments-panels");
  for (const kind of ["panel", "instrument"]) {
    const names = await page.getByRole("table", { name: kind === "panel" ? "Panels" : "Instruments" }).locator("tbody tr td:first-child a").allInnerTexts();
    for (const name of names) await archive(kind, name.trim(), "Synthetic: lab closed for the example");
  }
  await go("/instruments-panels");
  facts.instruments.emptyStates = await page.getByRole("main").locator(".empty-state").allInnerTexts();
  await both("i11-empty");
  await go("/new-order");
  facts.instruments.newOrderPanelsWhenNoneActive = await page.getByLabel("Panel", { exact: true }).locator("option").allInnerTexts().catch(() => "no Panel control");
}

// ================================================================ Context: the sidebar, the phone's navigation, a sample

if (parts.has("context")) {
  facts.context = {};
  await go("/qc-review");
  facts.context.sidebar = await page.getByRole("navigation", { name: "Admin navigation" }).evaluate(nav => [...nav.querySelectorAll(".nav-heading, .nav-link")].map(node => node.classList.contains("nav-heading") ? `[${node.textContent.trim()}]` : node.textContent.trim()));
  facts.context.comingNext = await page.locator(".nav-coming").count();
  await settle();
  await shot("x-sidebar", DESKTOP, { clip: { x: 0, y: 72, width: 214, height: 828 } });
  // The phone's navigation is one row that scrolls sideways: where the current screen's link is when the page opens.
  for (const url of ["/storage", "/qc-review", "/instruments-panels", "/notifications"]) {
    await page.setViewportSize(PHONE);
    await go(url);
    facts.context[`phoneNav ${url}`] = await page.evaluate(() => {
      const strip = document.querySelector(".sidebar");
      const current = strip.querySelector("[aria-current=page]").getBoundingClientRect();
      return { stripWidth: strip.clientWidth, contentWidth: strip.scrollWidth, scrolledTo: Math.round(strip.scrollLeft), currentLinkLeft: Math.round(current.left), currentLinkOnScreen: current.left >= 0 && current.right <= innerWidth };
    });
    if (url === "/notifications") await shot("x-phone-nav", PHONE, { clip: { x: 0, y: 0, width: 390, height: 330 } });
  }
  await page.setViewportSize(DESKTOP);
  // The client view never reaches the lab's screens.
  await asClient();
  facts.context.clientOpens = {};
  for (const url of ["/storage", "/qc-review", "/instruments-panels"]) { await go(url); facts.context.clientOpens[url] = page.url().replace(BASE, ""); }
  await asLab();
  // A sample's page lists its aliquots: what it says about where they are. The example workspace has a page for the
  // samples registered in this browser only (the aliquots of the Storage example have none), so two synthetic samples
  // of ORD043 are registered first.
  await go("/sample-registry?order=ORD043");
  await page.getByLabel("Paste from Excel").fill([
    "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm\tClient sample ID\tMatrix\tVolume",
    "Ctrl_1\tControl\tWildType\t1\tP01\t0h\tTUBE-17\tPlasma\t50", "Trt_1\tTreated\tWildType\t1\tP03\t24h\tTUBE-18\tPlasma\t45",
  ].join("\n"));
  await page.getByRole("button", { name: "Add rows" }).click();
  await page.getByRole("button", { name: "Register 2 samples" }).click();
  await page.waitForURL(/sample-registry\?order=ORD043&saved=2$/, slow);
  await page.getByRole("table", { name: "Registered samples" }).getByRole("link", { name: "ORD043-S001" }).click();
  await page.waitForURL(/\/admin\/samples\/ORD043-S001$/, slow);
  await settle();
  facts.context.samplePage = page.url().replace(BASE, "");
  facts.context.sampleAliquots = await page.getByRole("region", { name: "Aliquots" }).innerText().then(text => text.replace(/\s+/g, " ").trim()).catch(() => "no Aliquots section");
  facts.context.sampleAliquotColumns = await page.getByRole("table", { name: "Aliquots" }).locator("th").allInnerTexts().catch(() => "no Aliquots table");
  facts.context.linksToStorage = await page.getByRole("main").locator("a[href*='/storage']").count();
  await both("x-sample-aliquots");
}

await browser.close();
const overflowing = taken.filter(item => item.overflow > 0).map(item => `${item.file} (+${item.overflow}px)`);
console.log(JSON.stringify({ pass: AFTER ? "after" : "review", shots: taken.length, overflowing, smallestText: Math.min(...taken.map(item => item.smallest)), facts }, null, 2));
console.log(JSON.stringify(measured));
