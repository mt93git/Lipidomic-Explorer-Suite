// Browser check for the global overview: history (back/forward/reload) and screenshots at 1440x900 and 390x844.
// Needs a running `next start` (BASE) and playwright-core (PLAYWRIGHT_CORE = path to its index.mjs) with a
// Chromium executable (CHROME). Writes PNGs into OUT. Example:
//   BASE=http://127.0.0.1:3107/admin OUT=verification CHROME=... PLAYWRIGHT_CORE=... node scripts/browser-check.mjs
import assert from "node:assert/strict";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const base = process.env.BASE ?? "http://127.0.0.1:3107/admin";
const out = process.env.OUT ?? "verification";
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const results = [];
const search = page => new URL(page.url()).search;
const cards = page => page.locator("[aria-label='Order pipeline'] article").evaluateAll(list => list.map(el => el.getAttribute("aria-label")).sort());

async function shoot(page, name, { fullPage = false } = {}) {
  const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  await page.screenshot({ path: `${out}/${name}`, fullPage });
  results.push({ name, url: page.url().replace(base, ""), scrollWidth, clientWidth, horizontalPageScroll: scrollWidth > clientWidth });
}
async function visit(viewport, path, before) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  if (before) await before(page);
  return { page, context };
}

// 1. History: scope link (push), tile (replace), top-bar search (push), back, forward, reload.
{
  const { page, context } = await visit(desktop, "/pipeline");
  await page.click("details.scope summary");
  await page.getByRole("group", { name: "Client scope" }).getByRole("link", { name: "Example Cedar" }).click();
  await page.waitForURL(/client=example-cedar/);
  assert.equal(search(page), "?client=example-cedar");
  assert.deepEqual(await cards(page), ["ORD042", "ORD044", "ORD047", "ORD057"]);
  await page.getByRole("button", { name: /^Blocked at a gate/ }).click();
  await page.waitForURL(/focus=blocked/);
  assert.equal(search(page), "?client=example-cedar&focus=blocked");
  await page.getByRole("searchbox", { name: "Search orders", exact: true }).fill("pilot run");
  await page.getByRole("searchbox", { name: "Search orders", exact: true }).press("Enter");
  await page.waitForURL(/q=pilot/);
  assert.equal(search(page), "?client=example-cedar&focus=blocked&q=pilot+run");
  await page.getByRole("button", { name: "Remove filter: Search: “pilot run”" }).waitFor();
  await page.goBack();
  await page.waitForURL(url => !url.search.includes("q="));
  assert.equal(search(page), "?client=example-cedar&focus=blocked");
  await page.getByRole("button", { name: "Remove filter: Search: “pilot run”" }).waitFor({ state: "detached" });
  assert.equal(await page.getByRole("button", { name: /^Blocked at a gate/ }).getAttribute("aria-pressed"), "true");
  assert.match(await page.locator("details.scope > summary").innerText(), /Example Cedar/);
  await page.goForward();
  await page.waitForURL(/q=pilot/);
  await page.getByRole("button", { name: "Remove filter: Search: “pilot run”" }).waitFor();
  assert.equal(await page.getByRole("searchbox", { name: "Search orders in the overview" }).inputValue(), "pilot run");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(search(page), "?client=example-cedar&focus=blocked&q=pilot+run");
  await page.getByRole("button", { name: "Remove filter: Search: “pilot run”" }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Blocked at a gate/ }).getAttribute("aria-pressed"), "true");
  assert.match(await page.locator("details.scope > summary").innerText(), /Example Cedar/);
  assert.match(await page.locator(".eyebrow").innerText(), /Lab work \/ Example Cedar/i);
  await page.goBack();
  await page.waitForURL(url => !url.search.includes("q="));
  await page.goBack();
  await page.waitForURL(url => !url.search.includes("client="));
  assert.equal(search(page), "");
  assert.match(await page.locator("details.scope > summary").innerText(), /All clients/);
  assert.equal((await cards(page)).length, 18);
  results.push({ name: "history back/forward/reload", url: "ok", scrollWidth: 0, clientWidth: 0, horizontalPageScroll: false });
  await context.close();
}

// 2. Typing a multiword search in the overview keeps spaces.
{
  const { page, context } = await visit(desktop, "/pipeline");
  const box = page.getByRole("searchbox", { name: "Search orders in the overview" });
  await box.pressSequentially("shared run ", { delay: 20 });
  await page.waitForURL(/q=shared\+run\+/);
  assert.equal(await box.inputValue(), "shared run ");
  assert.deepEqual(await cards(page), ["ORD053"]);
  await shoot(page, "overview-search-typing-1440.png");
  await context.close();
}

// 3. Screenshots.
for (const [name, path, before] of [
  ["overview-all-clients-1440.png", "/pipeline"],
  ["overview-two-clients-ready-1440.png", "/pipeline?client=example-cedar&client=example-harbor&focus=ready"],
  ["overview-by-client-1440.png", "/pipeline?group=client&client=example-atlas&client=example-meridian"],
  ["overview-released-week-1440.png", "/pipeline?focus=released", async page => { await page.locator("details.menu", { hasText: "Panel" }).locator("summary").click(); }],
  ["overview-empty-1440.png", "/pipeline?q=nonexistent"],
  ["overview-commas-1440.png", "/pipeline?panel=PC%2C+PE&owner=Doe%2C+Jane&q=a%2C+b"],
  ["overview-scope-menu-1440.png", "/pipeline?client=example-cedar", async page => { await page.click("details.scope summary"); await page.waitForTimeout(150); }],
  ["overview-tile-click-1440.png", "/pipeline", async page => {
    await page.getByRole("button", { name: /^Blocked at a gate/ }).click();
    await page.getByRole("group", { name: "Filter by client" }).getByRole("button", { name: /Example Atlas/ }).click();
    await page.waitForTimeout(300);
  }],
  ["overview-owner-menu-end-1440.png", "/pipeline", async page => { await page.locator("details.menu", { hasText: "Owner" }).locator("summary").click(); await page.waitForTimeout(150); }],
]) {
  const { page, context } = await visit(desktop, path, before);
  await shoot(page, name);
  await context.close();
}
for (const [name, path, before] of [
  ["overview-all-clients-390.png", "/pipeline"],
  ["overview-atlas-390.png", "/pipeline?client=example-atlas&focus=blocked"],
  ["overview-by-client-390.png", "/pipeline?group=client"],
  ["overview-long-chip-390.png", `/pipeline?panel=${encodeURIComponent("A very long panel name that keeps going and going until it no longer fits the phone screen at all")}&q=${encodeURIComponent("x".repeat(120))}`],
  ["overview-owner-menu-390.png", "/pipeline", async page => {
    const menu = page.locator("details.menu", { hasText: "Owner" });
    await menu.locator("summary").click();
    await page.waitForTimeout(150);
    const box = await menu.locator(".menu-list").boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `owner menu inside viewport: ${JSON.stringify(box)}`);
    results.push({ name: "owner menu box at 390", url: JSON.stringify(box), scrollWidth: 0, clientWidth: 0, horizontalPageScroll: false });
    await menu.locator(".menu-list").scrollIntoViewIfNeeded();
  }],
]) {
  const { page, context } = await visit(phone, path, before);
  await shoot(page, name, { fullPage: !name.includes("menu") });
  await context.close();
}
await browser.close();
console.table(results);
assert.ok(results.every(result => !result.horizontalPageScroll), "no page scrolls sideways");
console.log("BROWSER_CHECK_OK");
