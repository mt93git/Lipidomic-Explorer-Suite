import { expect, type BrowserContext, type ConsoleMessage, type Locator, type Page, type Route } from "@playwright/test";

// Everything the golden journey knows about Nexo's screens lives here; the spec calls only the functions below. The names
// are Nexo's at commit 0a6748c8 (frontends/nexo/src; its own browser tests tests/dual-ui/test_nexo_dataset.cjs,
// test_nexo_entry_start_check.cjs and test_nexo_collab_real.cjs drive the same flow). The entry flow there (main.tsx):
// sign-in (signed out of Admin only) → Start (a bare link only) → Prepare → Quality check → the board. Admin's
// Open in Nexo link (?dataset=<id>) of a dataset with no project yet opens Prepare directly: no Start screen.
//   ADMIN_JOURNEY_NEXO_PATH  Nexo's path on the same origin as Admin (default /nexo-staging).
export const NEXO_PATH = (process.env.ADMIN_JOURNEY_NEXO_PATH || "/nexo-staging").replace(/\/+$/, "");
export const nexoSlow = { timeout: 180_000 }; // Team prepares the dataset and draws the first plot on the real API
export const NOT_AVAILABLE = "This dataset is not available to Nexo";

// The address Open in Nexo leads to: <nexoPath>/?dataset=<id>.
export const datasetHref = (datasetId: string) => new RegExp(`${NEXO_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\?dataset=${datasetId}$`);

// The Nexo build hard-codes its collaboration endpoint (wss://<public host><nexoPath>/collab, and https:// for REST). When the run's
// origin is a local proxy (ADMIN_PILOT_BASE_URL) those calls would leave it, so they are sent back to the run's origin.
//   ADMIN_JOURNEY_COLLAB_ORIGIN  the origin Nexo hard-codes, e.g. https://lipidomics.experimentalhidalgolab.com; unset = no routing.
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function routeNexoCollab(context: BrowserContext): Promise<void> {
  const collab = process.env.ADMIN_JOURNEY_COLLAB_ORIGIN?.replace(/\/+$/, "");
  if (!collab) return;
  const base = process.env.ADMIN_PILOT_BASE_URL;
  if (!base) throw new Error("ADMIN_JOURNEY_COLLAB_ORIGIN needs ADMIN_PILOT_BASE_URL");
  const from = new URL(collab);
  const to = new URL(base);
  const path = `${NEXO_PATH}/collab`;
  const tail = "(?:[/?#].*)?$";
  const httpTarget = (url: string) => { const u = new URL(url); return `${to.origin}${u.pathname}${u.search}`; };
  const cors = (route: Route) => {
    const request = route.request();
    const origin = request.headers()["origin"] ?? new URL(request.frame().url() || to.origin).origin;
    const headers: Record<string, string> = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" };
    if (request.method() === "OPTIONS") {
      headers["access-control-allow-methods"] = request.headers()["access-control-request-method"] ?? "GET, POST, PUT, PATCH, DELETE, OPTIONS";
      headers["access-control-allow-headers"] = request.headers()["access-control-request-headers"] ?? "*";
      headers["access-control-max-age"] = "600";
    }
    return headers;
  };
  await context.route(new RegExp(`^${escapeRe(from.origin)}${escapeRe(path)}${tail}`), async route => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors(route) });
    const response = await route.fetch({ url: httpTarget(request.url()) });
    const headers = { ...response.headers(), ...cors(route) };
    delete headers["content-encoding"]; // fetch() has decoded the body
    delete headers["content-length"];
    return route.fulfill({ response, headers });
  });
  // routeWebSocket cannot change the server's address, so the page's socket is bridged to one opened here on the run's origin.
  await context.routeWebSocket(new RegExp(`^wss://${escapeRe(from.host)}${escapeRe(path)}${tail}`), page => {
    const u = new URL(page.url());
    const upstream = new WebSocket(`${to.protocol === "https:" ? "wss:" : "ws:"}//${to.host}${u.pathname}${u.search}`);
    upstream.binaryType = "arraybuffer";
    const pending: (string | Buffer)[] = [];
    page.onMessage(message => { if (upstream.readyState === WebSocket.OPEN) upstream.send(message as string | Buffer); else pending.push(message); });
    upstream.addEventListener("open", () => { for (const message of pending.splice(0)) upstream.send(message); });
    upstream.addEventListener("message", event => page.send(typeof event.data === "string" ? event.data : Buffer.from(event.data as ArrayBuffer)));
    const usable = (code: number) => code === 1000 || (code >= 3000 && code <= 4999);
    upstream.addEventListener("close", event => { void page.close({ code: usable(event.code) ? event.code : 1000, reason: event.reason }); });
    page.onClose((code, reason) => { try { upstream.close(code !== undefined && usable(code) ? code : 1000, reason); } catch { /* already closed */ } });
  });
}

// Errors a Nexo page raises on its own, recorded from the moment this is called (the context's pages and toasts).
export type NexoWatch = {
  errors: () => string[];
  toasts: (nexo: Page) => Promise<{ text: string; error: boolean }[]>;
  screens: (nexo: Page) => Promise<string[]>;
};
const expected = ({ text, url }: { text: string; url: string }) =>
  (/status of 404\b/.test(text) && /\/nexo-staging\/collab\/projects\?dataset=[^/]*$/.test(url)) ||
  (/status of 422\b/.test(text) && /\/api\/v1\/datasets\/sessions(\?.*)?$/.test(url));
export async function watchNexo(page: Page): Promise<NexoWatch> {
  const context = page.context();
  const errors: { page: Page | null; text: string; url: string }[] = [];
  // A failed request is reported by the browser as a bare "Failed to load resource: … status of N"; the URL comes from the
  // message's location (Chromium sets it to the resource) or, failing that, the latest response with that status.
  const failed: { status: number; url: string }[] = [];
  context.on("response", response => { if (response.status() >= 400) failed.push({ status: response.status(), url: response.url() }); });
  context.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const status = /status of (\d{3})\b/.exec(text)?.[1];
    const located = message.location().url;
    const url = located || (status ? [...failed].reverse().find(entry => String(entry.status) === status)?.url ?? "" : "");
    errors.push({ page: message.page(), text, url });
  });
  context.on("weberror", error => errors.push({ page: error.page(), text: error.error().message, url: "" }));
  // Nexo's web fonts are a third-party load the journey does not test: answer them locally (as the pilot does).
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  // Toasts leave after a few seconds, so they are recorded as they appear. So are the screens a page went through (each
  // distinct h1 in first-seen order: "Prepare the data", "Quality check"), which are gone once the board shows.
  await context.addInitScript(() => {
    const seen: { text: string; error: boolean }[] = [];
    const screens: string[] = [];
    Object.assign(window, { __journeyToasts: seen, __journeyScreens: screens });
    new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>(".toast").forEach(toast => {
        const text = (toast.textContent ?? "").trim();
        if (toast.dataset.journeySeen === text) return;
        toast.dataset.journeySeen = text;
        seen.push({ text, error: toast.classList.contains("is-error") });
      });
      document.querySelectorAll("h1").forEach(heading => {
        const text = (heading.textContent ?? "").trim().replace(/\s+/g, " ");
        if (text && !screens.includes(text)) screens.push(text);
      });
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  return {
    // Two browser reports of expected statuses are ignored, by status and URL: the first opener's 422 asking for the
    // preparation choices (it opens the Prepare screen), and the 404 unknown_project of the collab lookup before the
    // project exists (main.tsx datasetProject). Nothing else in the flow answers non-2xx at 0a6748c8.
    errors: () => errors.filter(error => !expected(error)).map(error => (error.url ? `${error.text} (${error.url})` : error.text)),
    toasts: nexo => nexo.evaluate(() => (window as unknown as { __journeyToasts?: { text: string; error: boolean }[] }).__journeyToasts ?? []),
    screens: nexo => nexo.evaluate(() => (window as unknown as { __journeyScreens?: string[] }).__journeyScreens ?? []),
  };
}

// Since Nexo 06de5437 the entry titles carry the order and version: "Prepare ORD… · v…", "Quality check · ORD… · v…".
const PREPARE_TITLE = /^Prepare (the data|ORD\d+ · v\d+)$/;
const CHECK_TITLE = /^Quality check( · ORD\d+ · v\d+)?$/;
// Prepare (ui/entry/PrepareScreen.tsx, strings.ts prepareStrings): Admin's link opens it untitled ("Prepare the data");
// every sample a checkbox named by the sample, ticked by default, "<n> of <n> selected"; Team's defaults said as
// "All settings are Team’s defaults." (in the form and in the bottom bar); Team's live preview "<kept> of <total> lipids
// kept". "Prepare and check" (the bar's submit; "Preparing with Team…" while Team prepares) leads to the quality check.
const prepareHeading = (nexo: Page) => nexo.getByRole("heading", { level: 1, name: PREPARE_TITLE });
const prepareButton = (nexo: Page) => nexo.getByRole("button", { name: "Prepare and check", exact: true });
// Quality check (ui/entry/CheckScreen.tsx checkStrings): h1 "Quality check"; once Team answers, the lede "Prepared by Team
// with your choices: <l> lipids, <s> samples." and one verdict heading; "Keep <sample>" per flagged sample; "Open the
// Canvas" (an arrow icon follows, aria-hidden; Nexo's own tests match /^Open the Canvas/).
const checkHeading = (nexo: Page) => nexo.getByRole("heading", { level: 1, name: CHECK_TITLE });
const ENTRY_SCREENS = [PREPARE_TITLE, CHECK_TITLE];

// The first opener (staff) lands on Prepare: every sample ticked, Team's defaults, Team's preview drawn.
export async function expectPrepareScreen(nexo: Page, samples: string[]) {
  await expect(prepareHeading(nexo)).toBeVisible(nexoSlow);
  for (const sample of samples) await expect(nexo.getByRole("checkbox", { name: sample, exact: true })).toBeChecked();
  await expect(nexo.getByText(`${samples.length} of ${samples.length} selected`, { exact: true })).toBeVisible();
  await expect(nexo.getByText("All settings are Team’s defaults.", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(nexo.getByText(/^of [1-9]\d* lipids kept/)).toBeVisible(nexoSlow);
}

// "Prepare and check" as it stands (every sample, Team's defaults); Team prepares, then reads its quality check.
export async function prepareAndCheck(nexo: Page) {
  await prepareButton(nexo).click();
  await expect(checkHeading(nexo)).toBeVisible(nexoSlow);
  await expect(prepareHeading(nexo)).toHaveCount(0);
}

// The quality check of the prepared data: the lede with every sample, a flagged sample kept (Keep, one at a time, as the
// screen offers them), then Team's verdict "Ready for the Canvas" (Team's defaults normalize and estimate missing values).
export async function expectQualityCheck(nexo: Page, sampleCount: number) {
  await expect(checkHeading(nexo)).toBeVisible();
  await expect(nexo.getByText(new RegExp(`^Prepared by Team with your choices: [1-9]\\d* lipids, ${sampleCount} samples\\.$`))).toBeVisible(nexoSlow);
  for (let i = 0; i < sampleCount; i++) {
    const keep = nexo.getByRole("button", { name: /^Keep / });
    if ((await keep.count()) === 0) break;
    const name = ((await keep.first().textContent()) ?? "").trim();
    await keep.first().click();
    await expect(nexo.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(nexo.getByRole("heading", { level: 2, name: "Ready for the Canvas", exact: true })).toBeVisible();
}

// "Open the Canvas": the project is created with these settings and the board opens.
export async function openCanvas(nexo: Page) {
  await nexo.getByRole("button", { name: /^Open the Canvas/ }).click();
  await expect(checkHeading(nexo)).toHaveCount(0, nexoSlow);
}

// The Canvas board of the dataset: tab title "<ORDER> · v1"; the status band's summary "<n> lipids · <s> samples" and
// the chip "Prepared by <name> · settings" (StatusBand.tsx, BoardNotice.tsx noticeStrings.chip; the name is the
// preparer's Admin display name, "Lab staff" or "the lab" without one); the top bar's "from Admin" tag (TopBar.tsx,
// shown while the link carries ?dataset=). No undecided-sample banner: the first opener kept every flagged sample.
// The "Live" pill may read offline in this setup and is not asserted.
const summary = (sampleCount: number) => `[1-9]\\d* lipids? · ${sampleCount} samples`;
export async function expectBoard(nexo: Page, order: string, sampleCount: number) {
  await expect(nexo).toHaveTitle(`${order} · v1`, nexoSlow);
  await expect(nexo.getByText(new RegExp(`^${summary(sampleCount)}$`))).toBeVisible(nexoSlow);
  await expect(nexo.getByRole("button", { name: /^Prepared by \S.* · settings$/ })).toBeVisible(nexoSlow);
  await expect(nexo.getByText("from Admin", { exact: true }).first()).toBeVisible();
  await expect(nexo.getByText(/looks like an outlier and is still undecided$/)).toHaveCount(0);
}

const card = (nexo: Page): Locator => nexo.locator("#world .card"); // canvas state is read from the DOM, as in the pilot
// The plot on the card has drawn: current status and an image, a Plotly graph or an SVG with a size; `image`: only a
// loaded image counts (Team draws PCA scores · 2D as a png, for a later opener too since FIX-JOINER-PNG).
export async function expectPlotDrawn(nexo: Page, { image = false } = {}) {
  await expect(card(nexo)).toHaveCount(1, nexoSlow);
  await expect(card(nexo).locator(".card-status")).toHaveAttribute("data-state", "current", nexoSlow);
  await nexo.waitForFunction(onlyImage => {
    const c = document.querySelector("#world .card");
    if (!c) return false;
    const img = [...c.querySelectorAll("img")].some(i => i.complete && i.naturalWidth > 0);
    if (onlyImage) return img;
    const plot = [...c.querySelectorAll<HTMLElement & { data?: unknown[] }>(".js-plotly-plot")].some(p => (p.data?.length ?? 0) > 0);
    const svg = [...c.querySelectorAll("svg")].some(s => s.getBoundingClientRect().width > 40);
    return img || plot || svg;
  }, image, nexoSlow);
}

// One plot, the way a user adds it: the plot library (a floating panel on a fresh canvas, otherwise the Plots tool), search, press Add; then wait until it draws.
export async function addPcaPlot(nexo: Page) {
  const search = nexo.getByRole("searchbox", { name: "Search plots" });
  if (!(await search.isVisible())) await nexo.getByRole("navigation", { name: "Canvas tools" }).getByRole("button", { name: "Plots", exact: true }).click();
  await search.fill("PCA scores");
  await nexo.getByRole("button", { name: "Add PCA scores · 2D", exact: true }).first().click();
  await expectPlotDrawn(nexo);
}

// A later opener (a client member, a commenter on the board) lands straight on the shared board: no Prepare or Quality
// check screen on the way (the page's headings since it opened), the band "<n> lipids · <s> samples" then "You can
// comment" (StatusBand.tsx, strings.commentRole), the plot the first opener added drawn as an image, no refusal.
export async function expectSharedBoard(nexo: Page, order: string, sampleCount: number, watch: NexoWatch) {
  await expectBoard(nexo, order, sampleCount);
  await expect(nexo.getByRole("status").filter({ hasText: "You can comment" }))
    .toHaveText(new RegExp(`^${summary(sampleCount)}\\s*You can comment`), nexoSlow);
  await expectPlotDrawn(nexo, { image: true });
  await expect(nexo.getByText(NOT_AVAILABLE)).toHaveCount(0);
  expect((await watch.screens(nexo)).filter(screen => ENTRY_SCREENS.some(title => title.test(screen)))).toEqual([]);
  await expect(prepareButton(nexo)).toHaveCount(0);
}

export async function expectNoNexoErrors(nexo: Page, watch: NexoWatch) {
  expect((await watch.toasts(nexo)).filter(toast => toast.error).map(toast => toast.text)).toEqual([]);
  expect(watch.errors()).toEqual([]);
}

// Nexo keeps role=alert nodes that are not errors on screen (a status line, the signed-out notice), some outside an open
// modal. Only what a person can see counts: visible, non-empty alerts; with an aria-modal dialog open, only those inside it.
// Returns each counted alert's text, so a failure says what it was.
export async function nexoAlerts(nexo: Page): Promise<string[]> {
  return nexo.evaluate(() => {
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]')].filter(visible);
    const scope = dialogs.length ? dialogs : [document.body];
    return scope
      .flatMap(root => [...root.querySelectorAll('[role="alert"]:not(#__next-route-announcer__)')])
      .filter(el => visible(el) && (el.textContent ?? "").trim() !== "")
      .map(el => (el.textContent ?? "").trim().replace(/\s+/g, " "));
  });
}

// The same finished-screen check as Admin's settle(), with Nexo's alert rule.
export async function settleNexo(nexo: Page) {
  await expect.poll(() => nexoAlerts(nexo), { message: "visible role=alert text on the Nexo screen" }).toEqual([]);
  await expect(nexo.locator('[aria-busy="true"]')).toHaveCount(0);
  await nexo.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await nexo.evaluate(() => document.fonts.ready);
}
