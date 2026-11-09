'use strict';
// Simulated pilot: two personas do real Figure 1 work end to end and leave a log a person can judge.
// A real pilot with users is not possible; this is its stand-in, not a pass/fail suite like test_nexo_*.cjs.
//   node tests/dual-ui/pilot/pilot_figure1.cjs                       # MOCK: builds and serves the mock build
//   NEXO_LIVE_BASE=http://localhost:5173 node tests/dual-ui/pilot/pilot_figure1.cjs   # LIVE: app /nexo/, API /api/v1
// NEXO_LIVE_CHECKPOINT (live, default nexo-complete-synthetic; must contain "synthetic"), NEXO_LIVE_USER/PASS (nginx),
// NEXO_PILOT_OUT (default /tmp/nexo-pilot), NEXO_LIVE_ENGINES (default chromium).
// Personas act only through what a user sees (roles, labels, visible text); data-id and the DOM are read for state only.
// Every step is logged to <out>/pilot-log.json with a screenshot; a failed step does not stop the run.
// Round 2 (H9): Paula works on a Retina screen (device scale 2; screenshots stay at CSS size). After the save she
// downloads the checkpoint ZIP to <out>/pilot-saved.zip (per engine: pilot-saved-<engine>.zip) for
// tests/dual-ui/pilot/pilot_team_roundtrip.R, which reads the counts logged at step 11b.
// Phase 1 close: 4b/7c set a group colour in Team's session palette (rail Palettes; logged as metrics.sessionPalette, which
// pilot_team_roundtrip.R (vi) checks in Team's state.json and after Team's restore); step 7 drags a thumbnail by its body.
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const live = process.env.NEXO_LIVE_BASE;
const out = process.env.NEXO_PILOT_OUT || '/tmp/nexo-pilot';
const engines = (process.env.NEXO_LIVE_ENGINES || 'chromium').split(',').map(s => s.trim()).filter(Boolean);
const mockCheckpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0];
const checkpoint = live ? (process.env.NEXO_LIVE_CHECKPOINT || 'nexo-complete-synthetic') : mockCheckpoint.id;
const checkpointName = live ? checkpoint : mockCheckpoint.name;
if (live && !/synthetic/.test(checkpoint)) { console.error(`Refusing: ${checkpoint} is not a synthetic checkpoint; the pilot writes to the checkpoint workspace`); process.exit(2); }
const T = live ? 180000 : 20000; // wait for one thing (a cold render on the real API can take tens of seconds)
const SLOW = live ? 60 : 20; // a step slower than this (seconds) is friction
const MAX_CLICKS = 6;
const TITLE = 'Figure 1b · lipid distribution';
let server;

// ---------- the log ----------
const log = [];
let current = null; // the step being run: its counters live here
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
// Run one step: time it, count clicks, collect console errors and error toasts, screenshot, never throw.
async function step(ctx, id, action, expected, fn) {
  const { page, persona, engine } = ctx;
  current = { clicks: 0, friction: [], notes: [], metrics: {} };
  const consoleStart = ctx.errors.length;
  await page.evaluate(() => { window.__pilotToasts = []; }).catch(() => {});
  const t0 = Date.now();
  let ok = true, observed = '';
  try { observed = (await fn()) || 'done'; }
  catch (e) { ok = false; observed = String(e && e.message || e).split('\n').slice(0, 3).join(' | ').slice(0, 600); }
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  const toasts = await page.evaluate(() => window.__pilotToasts || []).catch(() => []);
  const errorToasts = toasts.filter(t => t.error).map(t => t.text);
  const friction = [...current.friction];
  if (seconds > SLOW) friction.push(`took ${seconds} s (> ${SLOW} s)`);
  if (current.clicks > MAX_CLICKS) friction.push(`${current.clicks} clicks (> ${MAX_CLICKS})`);
  if (errorToasts.length) friction.push(`error toast: ${errorToasts.join(' / ').slice(0, 200)}`);
  const screenshot = `${engine}-${persona.toLowerCase()}-${String(id).padStart(2, '0')}-${slug(action)}.png`;
  await page.screenshot({ path: path.join(out, screenshot), scale: 'css' }).catch(() => {});
  const entry = { engine, persona, step: id, action, expected, observed: [observed, ...current.notes].join(' · '), ok, seconds, clicks: current.clicks,
    screenshot, consoleErrors: ctx.errors.slice(consoleStart), toasts: toasts.map(t => t.text), friction: friction.length > 0, frictionReasons: friction,
    ...(Object.keys(current.metrics).length ? { metrics: current.metrics } : {}) };
  log.push(entry);
  fs.writeFileSync(path.join(out, 'pilot-log.json'), JSON.stringify(log, null, 2));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${engine} ${persona}: ${action}${ok ? '' : ' — ' + entry.observed}${friction.length ? ` [friction: ${friction.join('; ')}]` : ''}`);
  current = null;
  return ok;
}
const note = s => current?.notes.push(s);
const friction = s => current?.friction.push(s);

// ---------- acting as a user ----------
async function click(loc, opts = {}) { if (current) current.clicks++; await loc.click({ timeout: T, ...opts }); }
async function choose(select, label) { if (current) current.clicks++; await select.selectOption({ label }, { timeout: T }); }
async function type(input, text) { if (current) current.clicks++; await input.fill(String(text), { timeout: T }); await input.press('Tab'); }
async function drag(page, from, dx, dy) { // a real mouse drag, from the centre of a visible element
  if (current) current.clicks++;
  const box = await from.boundingBox(); if (!box) throw new Error('nothing to drag: element not visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + dx * i / 8, y + dy * i / 8);
  await page.mouse.up();
}
async function download(page, act) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: T }), act()]);
  const file = path.join(out, `${current ? 'dl-' : ''}${d.suggestedFilename()}`);
  await d.saveAs(file);
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(file), file };
}
// ---------- reading state (DOM only, so it works in mock and live) ----------
const cardFor = (page, id) => page.locator(`#world .card[data-id="${id}"]`);
const ids = page => page.locator('#world .card').evaluateAll(cs => cs.map(c => c.dataset.id));
const cardState = (page, id) => cardFor(page, id).locator('.card-status').getAttribute('data-state', { timeout: 2000 }).catch(() => null);
async function settled(page, id, states = ['current']) {
  await page.waitForFunction(([sel, ok]) => ok.includes(document.querySelector(sel + ' .card-status')?.dataset.state), [`#world .card[data-id="${id}"]`, states], { timeout: T });
}
async function drawn(page, id) {
  await page.waitForFunction(sel => {
    const c = document.querySelector(sel); if (!c) return false;
    const img = [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0);
    const plot = [...c.querySelectorAll('.js-plotly-plot')].some(p => (p.data?.length ?? 0) > 0);
    const network = [...c.querySelectorAll('.network canvas')].some(n => n.width > 0);
    const svg = [...c.querySelectorAll('svg')].some(s => s.getBoundingClientRect().width > 40);
    return img || plot || network || svg;
  }, `#world .card[data-id="${id}"]`, { timeout: T });
}
// What the card shows right now, to tell a redraw: image sources and Plotly traces.
const drawing = (page, id) => cardFor(page, id).evaluate(c => JSON.stringify([
  [...c.querySelectorAll('img')].map(i => i.getAttribute('src')?.slice(-120)),
  [...c.querySelectorAll('.js-plotly-plot')].map(p => JSON.stringify((p.data || []).map(t => [t.name, t.x?.length, t.y?.slice?.(0, 5), t.marker?.color])))
])).catch(() => '');
const boxOf = async (page, id) => { const b = await cardFor(page, id).boundingBox(); return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
const plotLayout = (page, id) => cardFor(page, id).evaluate(c => { const p = c.querySelector('.js-plotly-plot'); return p ? { title: p.layout?.title?.text ?? p.layout?.title ?? null, font: p.layout?.font?.size ?? null, colors: (p.data || []).map(t => t.fillcolor || t.marker?.color || t.line?.color).filter(x => typeof x === 'string') } : null; }).catch(() => null);

// The instance id a card's API routes use: the node id is <instanceId>-<output> (api.ts createCard).
const instanceOf = id => id.slice(0, id.lastIndexOf('-'));
// Pixels of one colour (±12 per channel) in the card's image, or in its Plotly trace colours: what the eye checks.
const colourIn = (page, id, hex) => cardFor(page, id).evaluate(async (c, hex) => {
  const want = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const img = [...c.querySelectorAll('img')].find(i => i.complete && i.naturalWidth > 0);
  if (img) {
    try {
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && Math.abs(d[i] - want[0]) <= 12 && Math.abs(d[i + 1] - want[1]) <= 12 && Math.abs(d[i + 2] - want[2]) <= 12) n++;
      return { kind: 'image', pixels: n, of: cv.width * cv.height };
    } catch (e) { return { kind: 'image', error: String(e.message || e) }; }
  }
  const p = c.querySelector('.js-plotly-plot');
  if (p) { const all = JSON.stringify((p.data || []).map(t => [t.marker?.color, t.line?.color, t.fillcolor])).toLowerCase(); return { kind: 'plotly', pixels: all.includes(hex.toLowerCase()) ? 1 : 0, of: 1 }; }
  return null;
}, hex).catch(e => ({ error: String(e.message || e) }));
// The image a card shows: natural size, CSS size (before the camera's scale) and compressed bytes per pixel.
const imageOf = (page, id) => cardFor(page, id).evaluate(async c => {
  const img = [...c.querySelectorAll('img')].find(i => i.complete && i.naturalWidth > 0); if (!img) return null;
  let bytes = null; try { bytes = (await (await fetch(img.src)).blob()).size; } catch {}
  return { natural: [img.naturalWidth, img.naturalHeight], css: [img.offsetWidth, img.offsetHeight], bytes, bpp: bytes && Math.round(bytes / (img.naturalWidth * img.naturalHeight) * 1000) / 1000 };
}).catch(() => null);
const cardMessage = (page, id) => cardFor(page, id).locator('.body.message').first().innerText({ timeout: 500 }).then(t => t.replace(/\s+/g, ' ').trim(), () => '');
let addClickedAt = 0;
// Click on "Add …" to the drawn plot (H9 warm worker: the first render should no longer wait ~2 s), plus, live, what
// the API said it spent on the create and the first render (Server-Timing).
async function drawnTimed(page, id, net) {
  await settled(page, id); await drawn(page, id);
  const s = Math.round((Date.now() - addClickedAt) / 100) / 10;
  if (current) current.metrics.clickToDrawnSeconds = s;
  note(`click→drawn ${s} s`);
  if (net) {
    const inst = instanceOf(id);
    const create = net.responses.find(r => r.t >= addClickedAt && r.method === 'POST' && /\/cards$/.test(r.path) && r.instance === inst);
    const render = net.responses.find(r => r.t >= addClickedAt && /\/render$/.test(r.path) && r.path.includes(`/cards/${encodeURIComponent(inst)}/`));
    if (create && current) current.metrics.createServerTiming = create.timing;
    if (render && current) current.metrics.firstRenderServerTiming = render.timing;
    if (render?.timing) note(`first render ${render.timing.replace(/;desc="?([^",]*)"?/g, ':$1').slice(0, 160)}`);
  }
  return s;
}
// What the camera shows (the zoom pill's percentage).
const zoomPercent = page => page.locator('.zoom-pill span').first().innerText().then(t => Number(t.replace(/\D/g, '')), () => NaN);
const C1 = '#aa3300', C2 = '#0055aa'; // Paula's group colour (step 4b), then the edit made while the session is lost (7c)
const SAVED_ZIP = 'pilot-saved.zip';
function zipEntries(bytes) { // name -> content of a ZIP (stored or deflated)
  const out = {}; let i = bytes.length - 22;
  while (i > 0 && bytes.readUInt32LE(i) !== 0x06054b50) i--;
  if (i <= 0) return out;
  let p = bytes.readUInt32LE(i + 16); const n = bytes.readUInt16LE(i + 10);
  for (let k = 0; k < n && bytes.readUInt32LE(p) === 0x02014b50; k++) {
    const method = bytes.readUInt16LE(p + 10), size = bytes.readUInt32LE(p + 20), len = bytes.readUInt16LE(p + 28), extra = bytes.readUInt16LE(p + 30), comment = bytes.readUInt16LE(p + 32), at = bytes.readUInt32LE(p + 42);
    const name = bytes.subarray(p + 46, p + 46 + len).toString('utf8');
    const start = at + 30 + bytes.readUInt16LE(at + 26) + bytes.readUInt16LE(at + 28), data = bytes.subarray(start, start + size);
    try { out[name] = method === 0 ? Buffer.from(data) : method === 8 ? zlib.inflateRawSync(data) : null; } catch { out[name] = null; }
    p += 46 + len + extra + comment;
  }
  return out;
}
// The counts pilot_team_roundtrip.R prints, with the same rules: nodes; tabs in canvas.tabs.tabs (0 without a tabs
// member); plots with a finished snapshot (an illustration always carries one); nodes with saved statistics;
// illustrations; texts on the Figure page.
function canvasCounts(canvas) {
  const nodes = canvas?.nodes ?? [];
  return { nodes: nodes.length, tabs: canvas?.tabs?.tabs?.length ?? 0, finished: nodes.filter(n => (n.kind ?? 'plot') === 'plot' && n.finished != null).length,
    statistics: nodes.filter(n => n.statistics != null).length, illustrations: nodes.filter(n => n.kind === 'illustration').length,
    texts: (canvas?.document?.items ?? []).filter(i => i.type === 'text').length };
}

// The study design dialog: an animal/participant unit and independent samples, as Paula answers it.
async function confirmDesign(page) {
  const dialog = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await dialog.waitFor({ timeout: T });
  const picked = [];
  for (const [label, prefer] of [['Experimental unit', /animal|participant|subject/i], ['Sample relationship', /^independent$/i]]) {
    const select = dialog.getByLabel(label);
    const options = (await select.locator('option').evaluateAll(os => os.filter(o => !o.disabled && o.value).map(o => o.textContent.trim())));
    const choice = options.find(o => prefer.test(o)) ?? options[0];
    if (!choice) throw new Error(`no choice offered for ${label}`);
    await choose(select, choice); picked.push(`${label}=${choice}`);
  }
  await click(dialog.getByRole('button', { name: 'Confirm study design', exact: true }));
  await dialog.waitFor({ state: 'hidden', timeout: T });
  confirmDesign.last = { unit: picked[0].split('=')[1], type: picked[1].split('=')[1] };
  return picked;
}

// ---------- the shell ----------
const inspector = page => page.locator('#inspector');
// A card is out of reach when its header is off screen or under the Inspector (clicking a card focuses the camera on
// it, so its neighbours can end up there); a user then presses Fit.
async function fitIfHidden(page, id) {
  const box = await cardFor(page, id).locator('header').boundingBox(), view = page.viewportSize();
  const side = await inspector(page).boundingBox().catch(() => null);
  const right = side && side.width > 0 && side.x > view.width / 2 ? side.x : view.width;
  const top = (await page.locator('#viewport').boundingBox().catch(() => null))?.y ?? 60; // under the toolbar and its hint band
  if (!box || box.x < 0 || box.y < top || box.x + 60 > right || box.y + 30 > view.height) {
    await click(page.getByRole('button', { name: 'Fit', exact: true }));
    return `Fit pressed (title was at ${box ? `${Math.round(box.x)},${Math.round(box.y)}` : 'nowhere'}), zoom now ${await zoomPercent(page)} %`;
  }
  return 'in view';
}
// Clicking a card glides the camera to it: wait until the world stops moving before reading positions.
async function cameraStill(page) {
  let last = '', same = 0; // three equal readings 120 ms apart: a glide may start a frame or two after the click
  for (let i = 0; i < 40 && same < 3; i++) {
    const now = await page.locator('#world').evaluate(w => getComputedStyle(w).transform).catch(() => '');
    same = now === last ? same + 1 : 0; last = now; await page.waitForTimeout(120);
  }
}
async function selectCard(page, id) {
  await cameraStill(page);
  const fitted = await fitIfHidden(page, id);
  await cameraStill(page);
  const title = cardFor(page, id).locator('header strong').first();
  // Far out (a tall card can push Fit to ~14 %) cards are thumbnails whose header is a few pixels tall and drawn
  // under the thumbnail image: a user clicks the thumbnail, the camera glides to the card, then the title is reachable.
  const head = await title.boundingBox().catch(() => null);
  if (head && head.height < 8) {
    const body = await cardFor(page, id).boundingBox();
    // Click where the thumbnail is seen: hovering the board's lower-left corner shows the minimap over it (a click
    // there recentres the camera), so try the centre, then other points of the card, after the pointer is there.
    const spots = body ? [[.5, .5], [.5, .15], [.85, .15], [.85, .5], [.15, .15], [.5, .85], [.85, .85]].map(([fx, fy]) => [body.x + body.width * fx, body.y + body.height * fy]) : [];
    for (const [x, y] of spots) {
      await page.mouse.move(x, y); await page.waitForTimeout(150);
      const mine = await page.evaluate(([x, y, sel]) => !!document.elementFromPoint(x, y)?.closest(sel), [x, y, `#world .card[data-id="${id}"]`]);
      if (!mine) continue;
      await page.mouse.click(x, y); if (current) current.clicks++; await cameraStill(page); break;
    }
  }
  await click(title, { timeout: live ? T : 8000 }).catch(async e => {
    // Say what covers the card's title, for the log.
    const box = await title.boundingBox().catch(() => null);
    const over = box && await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}"` : 'nothing'; }, [box.x + box.width / 2, box.y + box.height / 2]);
    throw new Error(`cannot click the title of ${id}: ${box ? `at ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}, covered by ${over}` : 'not visible'}; ${fitted}; zoom at failure ${await zoomPercent(page)} % (${e.message.split('\n')[0]})`);
  });
  await page.waitForFunction(sel => document.querySelector(sel)?.classList.contains('selected'), `#world .card[data-id="${id}"]`, { timeout: T });
  await cameraStill(page);
}
async function inspectorTab(page, name) {
  const tab = inspector(page).getByRole('tab', { name, exact: true });
  if (await tab.getAttribute('aria-selected', { timeout: T }) !== 'true') await click(tab);
}
async function openPlots(page) {
  const panel = page.getByRole('complementary', { name: 'Library' });
  if (!(await panel.isVisible().catch(() => false))) await click(page.getByRole('navigation', { name: 'Canvas tools' }).getByRole('button', { name: 'Plots', exact: true }));
  const tab = panel.getByRole('tab', { name: 'Plots', exact: true });
  if (await tab.getAttribute('aria-selected', { timeout: T }) !== 'true') await click(tab);
  return panel;
}
async function closeLibrary(page) {
  const close = page.getByRole('button', { name: 'Close library', exact: true });
  if (await close.isVisible().catch(() => false)) await click(close);
}
// Add a plot the way a user would: search the library, press its + button.
async function addPlot(page, label, search = label) {
  const panel = await openPlots(page);
  await type(panel.getByRole('searchbox', { name: 'Search plots' }), search);
  const before = await ids(page);
  const add = panel.getByRole('button', { name: `Add ${label}`, exact: true });
  await add.waitFor({ timeout: T });
  addClickedAt = Date.now();
  await click(add);
  await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before.length, { timeout: T });
  const id = (await ids(page)).find(x => !before.includes(x));
  if (!id) throw new Error(`no new card for ${label}`);
  return id;
}
async function menu(page, trigger, item) {
  await click(page.getByRole('button', { name: trigger, exact: true }).first());
  await click(page.getByRole('button', { name: item, exact: true }).first());
}
async function waitShell(page) { await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T }); }
// Record toasts as they appear (they leave after a few seconds).
const toastRecorder = () => {
  window.__pilotToasts = [];
  new MutationObserver(() => document.querySelectorAll('.toast').forEach(t => {
    const text = t.textContent.replace(/[×]$/, '').trim();
    if (t.dataset.pilotSeen === text) return; t.dataset.pilotSeen = text;
    (window.__pilotToasts = window.__pilotToasts || []).push({ text, error: t.classList.contains('is-error') });
  })).observe(document, { childList: true, subtree: true, characterData: true }); // init scripts run before <html> exists
};
// Open a checkpoint from the start screen; the URL is the fallback, and that is friction.
async function openFromStart(page, base, name, id) {
  await page.goto(`${base}/nexo/`);
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entry = page.getByRole('button', { name: new RegExp(`^${esc}\\b`) }).first();
  try { await entry.waitFor({ timeout: T }); await click(entry); }
  catch (e) {
    friction(`checkpoint "${name}" not offered on the start screen; opened by URL`);
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(id)}`);
  }
  await waitShell(page);
}
function zipNames(bytes) { // file names in a ZIP's central directory
  const names = []; let i = bytes.length - 22;
  while (i > 0 && bytes.readUInt32LE(i) !== 0x06054b50) i--;
  if (i <= 0) return names;
  let p = bytes.readUInt32LE(i + 16); const n = bytes.readUInt16LE(i + 10);
  for (let k = 0; k < n && bytes.readUInt32LE(p) === 0x02014b50; k++) {
    const len = bytes.readUInt16LE(p + 28), extra = bytes.readUInt16LE(p + 30), comment = bytes.readUInt16LE(p + 32);
    names.push(bytes.subarray(p + 46, p + 46 + len).toString('utf8')); p += 46 + len + extra + comment;
  }
  return names;
}

async function newContext(browser, opts) {
  const auth = process.env.NEXO_LIVE_USER ? { httpCredentials: { username: process.env.NEXO_LIVE_USER, password: process.env.NEXO_LIVE_PASS ?? '' } } : {};
  const context = await browser.newContext({ acceptDownloads: true, ...auth, ...opts });
  await context.addInitScript(toastRecorder);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  // Live only (the mock makes no requests): the session ids this page uses, render bodies (dpr) and Server-Timing.
  const net = { requests: [], responses: [], replays: [] };
  page.on('request', r => {
    const m = r.url().match(/\/api\/v1\/sessions\/([^/?#]+)/); if (!m) return;
    net.requests.push({ t: Date.now(), method: r.method(), session: decodeURIComponent(m[1]), path: new URL(r.url()).pathname, body: /\/render$/.test(r.url()) ? r.postData() : undefined });
  });
  page.on('response', async r => {
    const u = new URL(r.url()); if (!u.pathname.startsWith('/api/v1/sessions')) return;
    const entry = { t: Date.now(), method: r.request().method(), status: r.status(), path: u.pathname, timing: r.headers()['server-timing'] ?? null };
    if (entry.method === 'POST' && /\/cards$/.test(u.pathname)) entry.instance = await r.json().then(j => j.instanceId, () => null);
    if (/\/replay$/.test(u.pathname)) net.replays.push({ path: u.pathname, status: r.status(), body: await r.json().catch(() => null) });
    net.responses.push(entry);
  });
  // The session this page works on now: the one its latest card request went to.
  net.current = () => [...net.requests].reverse().find(q => /\/cards\//.test(q.path))?.session ?? net.requests.at(-1)?.session ?? null;
  return { context, page, errors, net };
}

// ---------- Persona 1: Paula, postdoc, redoes Figure 1, mouse and keyboard, 1440x900 ----------
async function paula(browser, engine, base) {
  // A MacBook: Retina (device scale 2). Screenshots are taken at CSS size.
  const { context, page, errors, net } = await newContext(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const ctx = { page, errors, engine, persona: 'Paula' };
  const netLive = live ? net : null;
  const a = {}; // the cards Paula added
  const memo = { saved: null, savedName: null, expect: {} };

  await step(ctx, 1, 'Open the checkpoint from the start screen', `The canvas of "${checkpointName}" opens and its cards settle`, async () => {
    await openFromStart(page, base, checkpointName, checkpoint);
    const initial = await ids(page);
    for (const id of initial) await settled(page, id, ['current', 'finished', 'finished-stale']);
    return `opened ${new URL(page.url()).search}; ${initial.length} cards settled`;
  });

  await step(ctx, 2, 'Confirm the study design if asked', 'The differential plots unlock, or nothing is asked', async () => {
    const panel = await openPlots(page);
    await type(panel.getByRole('searchbox', { name: 'Search plots' }), 'volcano');
    const ask = panel.getByRole('button', { name: 'Confirm study design… (Differential volcano)', exact: true });
    const add = panel.getByRole('button', { name: 'Add Differential volcano', exact: true });
    // The library fills in after the search; wait until the row shows either its gate or its Add button.
    await ask.or(add).first().waitFor({ timeout: T });
    if (!(await ask.isVisible().catch(() => false))) return 'not asked: the design is already confirmed';
    await click(ask);
    const picked = await confirmDesign(page);
    memo.expect.design = confirmDesign.last; // Steph is offered it on reopen (step 12)
    await panel.getByRole('button', { name: 'Add Differential volcano', exact: true }).waitFor({ timeout: T });
    return `confirmed ${picked.join(', ')}; Differential volcano can be added`;
  });

  const wanted = [['3a', 'pca', 'PCA scores · 2D', 'PCA scores'], ['3b', 'violin', 'Feature distributions', 'Feature distributions'], ['3c', 'volcano', 'Differential volcano', 'volcano'], ['3d', 'comp', 'Composition · unfiltered', 'Composition']];
  for (const [id, key, label, search] of wanted) {
    await step(ctx, id, `Add "${label}" from the library and wait for it to draw`, 'A new card appears and draws its plot; the time from the click to the drawn plot is logged', async () => {
      a[key] = await addPlot(page, label, search);
      const s = await drawnTimed(page, a[key], netLive);
      return `card ${a[key]} drawn ${s} s after the click`;
    });
  }

  // H9 violin height (chart audit b05 F5): the Selected-feature distributions card is Team's plot height + 38 px of chrome.
  await step(ctx, '3e', 'Add "Selected-feature distributions"; its card is as tall as Team\'s plot height', 'Card height = Plot Height (px) shown in the Data tab + 38 px (capped at 4000); the image is drawn at that height', async () => {
    a.tall = await addPlot(page, 'Selected-feature distributions', 'Selected-feature');
    const s = await drawnTimed(page, a.tall, netLive);
    await selectCard(page, a.tall); await inspectorTab(page, 'Data');
    const slider = inspector(page).locator('input#violin_zoom_pct');
    await slider.waitFor({ timeout: T });
    // The printed value is Team's input; the native range snaps an off-step default (2340) to its step on screen.
    const plotHeight = Number((await inspector(page).locator('output[for="violin_zoom_pct"]').innerText({ timeout: T })).trim());
    const shown = Number(await slider.inputValue());
    const height = await cardFor(page, a.tall).evaluate(c => c.offsetHeight);
    const want = Math.min(plotHeight + 38, 4000);
    const img = await imageOf(page, a.tall);
    if (current) Object.assign(current.metrics, { plotHeight, cardHeight: height, image: img?.natural ?? null });
    if (!Number.isFinite(plotHeight) || plotHeight < 300) throw new Error(`no Plot Height in the Data tab (${plotHeight})`);
    if (shown !== plotHeight) note(`the slider handle sits at ${shown}, the printed value is ${plotHeight} (README: Team's off-step default snaps on screen until moved)`);
    if (height !== want) throw new Error(`card ${height} px tall, Team's plot height ${plotHeight} + 38 = ${want}`);
    const dpr = img ? Math.round(img.natural[1] / Math.min(plotHeight, 3962)) : null;
    if (img && ![1, 2].includes(dpr)) throw new Error(`image ${img.natural.join('×')} is not drawn at the plot height ${plotHeight}`);
    return `Plot Height ${plotHeight} px → card ${height} px (= +38); image ${img ? img.natural.join('×') + ` (dpr ${dpr})` : 'not read'}; drawn ${s} s after the click`;
  });
  await closeLibrary(page);

  await step(ctx, 4, 'Change a data input of the PCA (inspector, Data tab)', 'The PCA card redraws with the new input', async () => {
    if (!a.pca) throw new Error('no PCA card (step 3a failed)');
    await selectCard(page, a.pca); await inspectorTab(page, 'Data');
    const panel = inspector(page).getByRole('tabpanel');
    const selects = panel.getByRole('combobox');
    let target = null;
    for (const s of await selects.all()) {
      if (!(await s.isEnabled()) || !(await s.isVisible())) continue;
      const opts = await s.locator('option').evaluateAll(os => os.filter(o => !o.disabled).map(o => ({ label: o.textContent.trim(), selected: o.selected })));
      const other = opts.find(o => !o.selected);
      if (opts.length > 1 && other) { target = { s, label: await s.getAttribute('aria-label') || await s.evaluate(e => e.labels?.[0]?.textContent?.trim() || e.id), to: other.label, from: opts.find(o => o.selected)?.label }; break; }
    }
    // The mock schema serves Data controls for violins only; the live run covers the PCA's real inputs.
    if (!target && !live) return 'skipped in the mock: the mock PCA offers no select with a second choice (src/mock/schema.ts); the live run covers this step';
    if (!target) throw new Error('the PCA Data tab offers no input with a second choice: ' + (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 200));
    if (!target.label) friction('the changed Data input has no visible label');
    const before = await drawing(page, a.pca);
    await choose(target.s, target.to);
    await page.waitForFunction(([sel, b]) => {
      const c = document.querySelector(sel); if (!c) return false;
      const now = JSON.stringify([[...c.querySelectorAll('img')].map(i => i.getAttribute('src')?.slice(-120)), [...c.querySelectorAll('.js-plotly-plot')].map(p => JSON.stringify((p.data || []).map(t => [t.name, t.x?.length, t.y?.slice?.(0, 5), t.marker?.color])))]);
      return now !== b && c.querySelector('.card-status')?.dataset.state === 'current';
    }, [`#world .card[data-id="${a.pca}"]`, before], { timeout: T });
    await drawn(page, a.pca);
    return `${target.label}: ${target.from} → ${target.to}; card redrew`;
  });

  // Pilot F1 (phase 1 close): a canvas copy's per-group pickers never reach its plot in Team either; group colours are
  // Team's session palette (data hub "Colors & palettes"), which Nexo opens from the rail's Palettes. One change there
  // redraws the PCA and every other group-coloured card on the board.
  await step(ctx, '4b', 'Change the Control group\'s colour in the session palette (rail Palettes)', `The session palette opens with Team's palettes; the PCA (and the other group-coloured cards on the board) redraw with ${C1}`, async () => {
    if (!a.pca) throw new Error('no PCA card (step 3a failed)');
    const others = (await ids(page)).filter(id => id !== a.pca), before = await drawing(page, a.pca), drawnBefore = {};
    for (const id of others) drawnBefore[id] = await drawing(page, id);
    await click(page.getByRole('navigation', { name: 'Canvas tools' }).getByRole('button', { name: 'Palettes', exact: true }));
    const panel = page.getByRole('dialog', { name: 'Colors & palettes', exact: true });
    const group1 = panel.getByRole('group', { name: 'Sample groups (Group 1)', exact: true });
    await group1.waitFor({ timeout: T });
    const palettes = await panel.getByRole('group', { name: 'Choose a palette', exact: true }).getByRole('button').evaluateAll(bs => bs.map(b => b.querySelector('.session-palette-name')?.textContent));
    const groups = await group1.locator('input[type=color]').evaluateAll(xs => xs.map(x => x.getAttribute('aria-label').replace(/^Colour for /, '')));
    const group = groups.includes('Control') ? 'Control' : groups[0];
    if (!group) throw new Error('the session palette lists no Group 1 colour');
    if (group !== 'Control') note(`no Control group in this checkpoint: ${group} is used`);
    const label = `Colour for ${group}`;
    await type(group1.getByLabel(label, { exact: true }), C1);
    await page.waitForFunction(([sel, b]) => {
      const c = document.querySelector(sel); if (!c) return false;
      const now = JSON.stringify([[...c.querySelectorAll('img')].map(i => i.getAttribute('src')?.slice(-120)), [...c.querySelectorAll('.js-plotly-plot')].map(p => JSON.stringify((p.data || []).map(t => [t.name, t.x?.length, t.y?.slice?.(0, 5), t.marker?.color])))]);
      return now !== b && c.querySelector('.card-status')?.dataset.state === 'current';
    }, [`#world .card[data-id="${a.pca}"]`, before], { timeout: T });
    await drawn(page, a.pca);
    const seen = await colourIn(page, a.pca, C1);
    if (!seen || !(seen.pixels > 0)) throw new Error(`the PCA redrew but shows no ${C1}: ${JSON.stringify(seen)}`);
    // The other cards: which redrew, and which show the colour (cards off screen or frozen may redraw later).
    await page.waitForTimeout(live ? 3000 : 800);
    const redrawn = [], showing = [];
    for (const id of others) { if ((await drawing(page, id)) !== drawnBefore[id]) redrawn.push(id); const c = await colourIn(page, id, C1); if (c?.pixels > 0) showing.push(id); }
    await click(panel.getByRole('button', { name: 'Close Colors & palettes', exact: true }));
    memo.expect.colour = { card: a.pca, label, group, context: 'Group1', value: C1 };
    if (current) current.metrics.sessionPalette = { context: 'Group1', group, color: C1 };
    return `palettes: ${palettes.join(', ')}; ${label} → ${C1}; the PCA redrew and shows it (${seen.pixels} px of ${seen.of}); other cards redrawn ${redrawn.length}/${others.length}, showing ${C1}: ${showing.length}`;
  });

  // H9 module actions (chart audit b07 F3): the structural summary draws only after "Initiate Structural Analysis".
  await step(ctx, '4c', 'Add the structural summary and press "Initiate Structural Analysis" in the Data tab', 'The card first shows Team\'s placeholder, then draws the analysis', async () => {
    a.struct = await addPlot(page, 'Structural remodeling shifts', 'Structural remodeling');
    const s = await drawnTimed(page, a.struct, netLive);
    const placeholder = await imageOf(page, a.struct);
    const mockLabel = () => live ? null : page.evaluate(i => window.__nexoMock?.labels?.[i] ?? null, instanceOf(a.struct));
    const shownBefore = await mockLabel();
    await selectCard(page, a.struct); await inspectorTab(page, 'Data');
    const press = inspector(page).getByRole('button', { name: 'Initiate Structural Analysis', exact: true });
    const before = await drawing(page, a.struct);
    await click(press);
    await page.waitForFunction(([sel, b]) => {
      const c = document.querySelector(sel); if (!c) return false;
      const now = JSON.stringify([[...c.querySelectorAll('img')].map(i => i.getAttribute('src')?.slice(-120)), [...c.querySelectorAll('.js-plotly-plot')].map(p => JSON.stringify((p.data || []).map(t => [t.name, t.x?.length, t.y?.slice?.(0, 5), t.marker?.color])))]);
      return now !== b && c.querySelector('.card-status')?.dataset.state === 'current';
    }, [`#world .card[data-id="${a.struct}"]`, before], { timeout: T });
    await drawn(page, a.struct);
    const msg = await cardMessage(page, a.struct);
    if (msg) throw new Error(`the card shows a message after Initiate: "${msg.slice(0, 160)}"`);
    const analysed = await imageOf(page, a.struct), shownAfter = await mockLabel();
    if (!live && /Initiate Structural Analysis/.test(shownAfter ?? '')) throw new Error(`the mock still draws Team's placeholder: "${shownAfter}"`);
    memo.expect.struct = { card: a.struct, placeholderBpp: placeholder?.bpp ?? null, analysedBpp: analysed?.bpp ?? null };
    if (current) Object.assign(current.metrics, { placeholder, analysed });
    return `added (${s} s to the placeholder${shownBefore ? ` "${shownBefore.slice(0, 60)}"` : ''}); after Initiate the card drew the analysis` +
      (live ? ` (image ${placeholder?.bpp} → ${analysed?.bpp} bytes per pixel)` : ` ("${shownAfter}")`);
  });

  // H9 heatmap significance: Team's note under "Show" says why Significant only is unavailable (h9/heat-significance).
  await step(ctx, '4d', 'Add the heatmap and read the "Significant only" status note', 'Disabled: the note gives Team\'s reason. Allowed: choosing it shows Team\'s "Showing N significant lipids" note', async () => {
    a.heat = await addPlot(page, 'Abundance heatmap', 'Abundance heatmap');
    const s = await drawnTimed(page, a.heat, netLive);
    await selectCard(page, a.heat); await inspectorTab(page, 'Data');
    const significant = inspector(page).getByRole('radio', { name: 'Significant only', exact: true });
    await significant.waitFor({ timeout: T });
    const status = inspector(page).locator('#heat_significance-status');
    if (await significant.isDisabled()) {
      const text = (await status.innerText({ timeout: T })).trim();
      const described = await significant.getAttribute('aria-describedby');
      if (!/^Significant only is unavailable\. \S/.test(text)) throw new Error(`disabled, but the note does not give Team's reason: "${text.slice(0, 160)}"`);
      if (await status.getAttribute('role') !== 'status' || described !== 'heat_significance-status') throw new Error(`the note is not the option's status (role ${await status.getAttribute('role')}, aria-describedby ${described})`);
      return `"Significant only" disabled; the note reads Team's reason: "${text.slice(0, 200)}"; card drawn ${s} s after the click`;
    }
    note('Significant only is allowed here (step 2 confirmed an independent design): the disabled case is not reached in this run');
    const before = await drawing(page, a.heat);
    await click(significant);
    await page.waitForFunction(() => /^Showing \d+ significant lipids?: \S/.test(document.querySelector('#heat_significance-status')?.textContent?.trim() ?? '') ||
      /^No lipid in this heatmap passes/.test(document.querySelector('#heat_significance-status')?.textContent?.trim() ?? ''), null, { timeout: T });
    await settled(page, a.heat); await drawn(page, a.heat);
    const text = (await status.innerText()).trim(), changed = (await drawing(page, a.heat)) !== before;
    if (await status.getAttribute('data-allowed') !== 'true') throw new Error(`the note says allowed=${await status.getAttribute('data-allowed')}`);
    return `"Significant only" allowed; chosen, the note reads "${text.slice(0, 160)}"; card ${changed ? 'redrew' : 'kept its drawing'}; drawn ${s} s after the click`;
  });

  // H9 FLA index picker: Team's sel_<category> checkbox groups (fla_tab), computed controls in Nexo's member.
  await step(ctx, '4e', 'Add the FLA ratio distributions and add one index in a sel_<category> picker', 'The card redraws with the added index', async () => {
    a.fla = await addPlot(page, 'Functional ratio distributions', 'Functional ratio distributions');
    const s = await drawnTimed(page, a.fla, netLive);
    await selectCard(page, a.fla); await inspectorTab(page, 'Data');
    const panel = inspector(page).getByRole('tabpanel');
    // Nexo's "Indices to Plot" fieldset: one group per category (ComputedControls.tsx).
    const pickers = panel.locator('fieldset.computed-indices [role=group][aria-label]');
    await pickers.first().locator('input[type=checkbox]').first().waitFor({ timeout: T });
    let target = null;
    for (const g of await pickers.all()) {
      for (const box of await g.locator('label').all()) {
        const input = box.locator('input[type=checkbox]');
        if (await input.count() && !(await input.isChecked()) && await input.isEnabled()) { target = { group: await g.getAttribute('aria-label'), label: (await box.innerText()).trim(), input }; break; }
      }
      if (target) break;
    }
    if (!target) throw new Error('no unticked index in the FLA pickers: ' + (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 200));
    const before = await drawing(page, a.fla);
    if (current) current.clicks++;
    await target.input.check({ timeout: T });
    await page.waitForFunction(([sel, b]) => {
      const c = document.querySelector(sel); if (!c) return false;
      const now = JSON.stringify([[...c.querySelectorAll('img')].map(i => i.getAttribute('src')?.slice(-120)), [...c.querySelectorAll('.js-plotly-plot')].map(p => JSON.stringify((p.data || []).map(t => [t.name, t.x?.length, t.y?.slice?.(0, 5), t.marker?.color])))]);
      return now !== b && c.querySelector('.card-status')?.dataset.state === 'current';
    }, [`#world .card[data-id="${a.fla}"]`, before], { timeout: T });
    await drawn(page, a.fla);
    const label = live ? null : await page.evaluate(i => window.__nexoMock?.labels?.[i] ?? null, instanceOf(a.fla));
    if (label && !label.includes(target.label)) throw new Error(`the mock drawing does not list ${target.label}: "${label}"`);
    memo.expect.fla = { card: a.fla, group: target.group, label: target.label };
    return `${target.group}: ticked ${target.label}; the card redrew${label ? ` ("${label.slice(0, 120)}")` : ''}; first drawn ${s} s after the click`;
  });

  await step(ctx, 5, 'Restyle the violin (Appearance: title, Okabe–Ito palette, font size)', 'The violin shows the new title, Okabe–Ito colours and the larger font', async () => {
    if (!a.violin) throw new Error('no violin card (step 3b failed)');
    await selectCard(page, a.violin); await inspectorTab(page, 'Appearance');
    const panel = inspector(page).getByRole('tabpanel');
    // H9 F3: "Typography" (open by default) replaced "Title and fonts"; its base size is the chart font size (font.size).
    const typography = panel.locator('details.typography');
    if (!(await typography.evaluate(d => d.open, { timeout: T }))) await click(typography.locator('summary').first());
    await type(panel.getByLabel('Plot title', { exact: true }), TITLE);
    await type(typography.getByLabel('Base size', { exact: true }), '14');
    await click(panel.locator('summary', { hasText: /^Color palette$/ }));
    const okabe = panel.getByRole('group', { name: 'Color palette' }).getByRole('button', { name: 'Okabe–Ito', exact: true });
    await click(okabe);
    if (await okabe.getAttribute('aria-pressed') !== 'true') throw new Error('Okabe–Ito is not marked as chosen');
    // Choosing a palette only marks it; the plot changes on "Apply palette".
    const apply = panel.getByRole('button', { name: 'Apply palette', exact: true });
    if (await apply.isVisible().catch(() => false)) { note('the palette needs a separate "Apply palette" press (the chosen swatch already looks selected)'); await click(apply); }
    // Read title, font and colours in the same frame they are checked (zoomed out, a card can freeze to an image right
    // after), and wait for all three: the palette can land a render after the title.
    const okabeColors = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000'].map(c => c.toLowerCase());
    const read = ([sel, title, okabe]) => {
      const p = document.querySelector(sel + ' .js-plotly-plot'); if (!p) return null;
      const rgb = c => { const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? '#' + m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('') : c.toLowerCase(); };
      const colors = (p.data || []).map(d => d.fillcolor || d.marker?.color || d.line?.color).filter(x => typeof x === 'string');
      return { title: p.layout?.title?.text ?? p.layout?.title, font: p.layout?.font?.size, colors, okabe: colors.map(rgb).some(c => okabe.includes(c)), ok: (p.layout?.title?.text ?? p.layout?.title) === title && p.layout?.font?.size === 14 };
    };
    const args = [`#world .card[data-id="${a.violin}"]`, TITLE, okabeColors];
    const lay = await page.waitForFunction(([sel, title, okabe, src]) => { const r = (0, eval)(src)([sel, title, okabe]); return r && r.ok && r.okabe && r; }, [...args, `(${read})`], { timeout: live ? T : 10000 })
      .then(h => h.jsonValue(), async () => page.evaluate(([sel, title, okabe, src]) => (0, eval)(src)([sel, title, okabe]), [...args, `(${read})`]));
    if (!lay) throw new Error('the violin has no live plot to read');
    if (!lay.ok) throw new Error(`title/font not applied: "${lay.title}", ${lay.font}`);
    if (!lay.okabe) throw new Error(`plot colours are not Okabe–Ito after Apply palette: ${lay.colors.slice(0, 4).join(', ')}`);
    memo.expect.violinTitle = TITLE;
    return `title "${lay.title}", font ${lay.font}, colours ${lay.colors.slice(0, 3).join(', ')}`;
  });

  await step(ctx, 6, 'Violin statistics: Wilcoxon + BH, review, confirm; results table; download CSV', 'Results table has rows; a CSV with a header downloads', async () => {
    if (!a.violin) throw new Error('no violin card (step 3b failed)');
    await selectCard(page, a.violin); await inspectorTab(page, 'Statistics');
    const panel = inspector(page).getByRole('region', { name: 'Violin statistics' });
    await choose(panel.getByLabel('Test', { exact: true }), 'Wilcoxon rank-sum (Mann-Whitney)');
    await choose(panel.getByLabel('Multiple-testing correction', { exact: true }), 'Benjamini-Hochberg (FDR, q)');
    await click(panel.getByRole('button', { name: 'Review and confirm…', exact: true }));
    const confirm = page.getByRole('button', { name: 'Confirm and compute', exact: true });
    const review = (await page.getByRole('group', { name: 'Confirm statistical analysis' }).or(page.getByRole('dialog', { name: 'Confirm statistical analysis' })).or(page.getByRole('region', { name: 'Confirm statistical analysis' })).first().innerText({ timeout: T }).catch(() => '')).replace(/\s+/g, ' ');
    if (!/Wilcoxon/i.test(review) || !/Benjamini|BH|FDR/i.test(review)) note(`review text does not name both choices: "${review.slice(0, 160)}"`);
    await click(confirm);
    const table = panel.getByRole('table', { name: 'Results for the displayed lipid' });
    await table.locator('tbody tr').first().waitFor({ timeout: T });
    const rows = (await table.locator('tbody tr').allInnerTexts()).map(r => r.replace(/\s+/g, ' '));
    await cardFor(page, a.violin).locator('header .card-stats').filter({ hasText: /^Statistics$/ }).waitFor({ timeout: T });
    const csvButton = panel.getByRole('button', { name: 'Statistics CSV', exact: true });
    const csv = await download(page, () => click(csvButton));
    const head = csv.bytes.toString('utf8').split(/\r?\n/)[0];
    if (!/\.csv$/.test(csv.name) || !head.includes(',')) throw new Error(`statistics CSV looks wrong: ${csv.name} "${head.slice(0, 80)}"`);
    const lines = csv.bytes.toString('utf8').trim().split(/\r?\n/).length;
    return `${rows.length} result row(s): "${rows[0].slice(0, 100)}"; ${csv.name} ${lines} lines`;
  });

  await step(ctx, 7, 'Resize and arrange (real drag, Tidy up), undo and redo once', 'The card grows, Tidy up moves cards, Undo restores and Redo re-applies', async () => {
    if (!a.violin || !a.comp) throw new Error('needs the violin and composition cards (step 3)');
    await click(page.getByRole('button', { name: 'Fit', exact: true }));
    await selectCard(page, a.violin);
    const b0 = await boxOf(page, a.violin);
    const handle = cardFor(page, a.violin).getByLabel('Resize card');
    if (!(await handle.isVisible().catch(() => false))) friction('the resize handle is not visible');
    await drag(page, handle, 90, 60);
    const b1 = await boxOf(page, a.violin);
    if (!(b1.w > b0.w + 20 && b1.h > b0.h + 15)) throw new Error(`resize did not grow the card: ${b0.w}×${b0.h} → ${b1.w}×${b1.h}`);
    // Growing the violin pushes overlapping cards (settle, animated): let the canvas come to rest before the next drag.
    await page.waitForTimeout(600);
    await fitIfHidden(page, a.comp);
    await page.waitForTimeout(400);
    const c0 = await boxOf(page, a.comp);
    // Pilot F2: far out (< 20 %) a card is a thumbnail whose header is hidden; a user drags the thumbnail itself.
    const thumb = await cardFor(page, a.comp).evaluate(c => c.classList.contains('card-thumb')).catch(() => false);
    if (thumb) note(`at ${await zoomPercent(page)} % the composition card is a thumbnail: dragged by its body`);
    await drag(page, thumb ? cardFor(page, a.comp).locator('.body').first() : cardFor(page, a.comp).locator('header strong').first(), -120, 80);
    const c1 = await boxOf(page, a.comp);
    if (Math.abs(c1.x - c0.x) < 40 && Math.abs(c1.y - c0.y) < 40) throw new Error(`dragging the ${thumb ? 'thumbnail' : 'header'} did not move the card: ${JSON.stringify(c0)} → ${JSON.stringify(c1)}`);
    const all = async () => JSON.stringify(await Promise.all((await ids(page)).map(id => boxOf(page, id))));
    // The drop pushes overlapping cards (settle, animated) and a press on a thumbnail may glide the camera: read the
    // layout only once both have come to rest, as after the resize above.
    await page.waitForTimeout(600); await cameraStill(page);
    const beforeTidy = await all();
    const tidy = page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'Tidy up', exact: true });
    if (await tidy.isVisible().catch(() => false)) await click(tidy);
    else { friction('Tidy up is inside the ⋯ menu'); await menu(page, 'Canvas tools', 'Tidy up'); }
    await page.waitForTimeout(800); await cameraStill(page);
    const afterTidy = await all();
    if (afterTidy === beforeTidy) throw new Error('Tidy up moved nothing');
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(800); await cameraStill(page);
    const undone = await all();
    if (undone !== beforeTidy) throw new Error('Ctrl/⌘+Z did not restore the layout before Tidy up');
    await click(page.getByRole('button', { name: '↷ Redo', exact: true }));
    await page.waitForTimeout(800);
    if (await all() !== afterTidy) throw new Error('Redo did not re-apply Tidy up');
    return `violin ${b0.w}×${b0.h} → ${b1.w}×${b1.h}; composition moved; Tidy up, ⌘/Ctrl+Z, Redo all round-tripped`;
  });

  // H9 retina-timing: a live PNG card at >= 100 % on a Retina screen asks the API for dpr 2 (retina.ts renderDpr).
  await step(ctx, '7b', 'Zoom in to 150 % or more with the zoom controls and look at the PCA', 'The PCA image is drawn at about twice its CSS width (dpr 2)', async () => {
    if (!a.pca) throw new Error('no PCA card (step 3a failed)');
    await selectCard(page, a.pca); // clicking a card focuses the camera on it
    const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
    for (let i = 0; i < 10 && !((await zoomPercent(page)) >= 150); i++) { await click(zoomIn); await page.waitForTimeout(150); }
    const z = await zoomPercent(page);
    if (!(z >= 150)) throw new Error(`the zoom controls stopped at ${z} %`);
    const sel = `#world .card[data-id="${a.pca}"]`;
    const sharp = await page.waitForFunction(sel => { const i = document.querySelector(sel + ' img'); return !!i && i.complete && i.offsetWidth > 0 && i.naturalWidth >= 1.8 * i.offsetWidth; }, sel, { timeout: live ? T : 10000 }).then(() => true, () => false);
    const img = await imageOf(page, a.pca), ratio = img ? Math.round(img.natural[0] / img.css[0] * 100) / 100 : null;
    // Every pixel ratio this card's renders asked for (the 2x image may come from the image cache, asked earlier).
    const asked = [...new Set(live
      ? net.requests.filter(q => q.body && q.path.includes(`/cards/${encodeURIComponent(instanceOf(a.pca))}/render`)).map(q => { try { return JSON.parse(q.body).dpr ?? 1; } catch { return '?'; } })
      : await page.evaluate(i => (window.__nexoMock?.pngRenders ?? []).filter(r => r.instance === i).map(r => r.dpr), instanceOf(a.pca)))].join(', ');
    if (current) Object.assign(current.metrics, { zoomPercent: z, image: img, ratio, dprAsked: asked ?? null });
    await click(page.getByRole('button', { name: 'Fit', exact: true }));
    if (!sharp) throw new Error(`at ${z} % the PCA image is ${img ? img.natural.join('×') : 'missing'} for ${img ? img.css.join('×') : '?'} CSS px (ratio ${ratio}); its renders asked dpr ${asked}`);
    return `${z} %: PCA image ${img.natural.join('×')} for ${img.css.join('×')} CSS px (×${ratio}); ${live ? 'its render requests' : 'its mock renders'} asked dpr ${asked}`;
  });

  // H9 session reopen: the API loses the session (here deleted, as an eviction or restart would); the next edit
  // reopens the checkpoint, puts back the cards and their inputs, and keeps the edit.
  await step(ctx, '7c', 'The API loses the session; Paula changes the group colour again in the session palette', `The app reconnects by itself, the PCA shows ${C2}, the earlier edits are kept, no error stays`, async () => {
    if (!a.pca || !memo.expect.colour) throw new Error('needs the session palette colour of step 4b');
    await click(page.getByRole('navigation', { name: 'Canvas tools' }).getByRole('button', { name: 'Palettes', exact: true }));
    const palettePanel = page.getByRole('dialog', { name: 'Colors & palettes', exact: true });
    const colour = palettePanel.getByRole('group', { name: 'Sample groups (Group 1)', exact: true }).getByLabel(memo.expect.colour.label, { exact: true });
    await colour.waitFor({ timeout: T });
    const kept = (await colour.inputValue()).toLowerCase();
    if (kept !== memo.expect.colour.value.toLowerCase()) note(`the session palette shows ${kept} for ${memo.expect.colour.group}, not ${memo.expect.colour.value}`);
    let lost;
    if (live) {
      lost = net.current();
      if (!lost) throw new Error('no session id seen in this page\'s requests');
      // Only the session this page is using, found in its own requests.
      const status = await page.evaluate(async u => (await fetch(u, { method: 'DELETE' })).status, `${base}/api/v1/sessions/${encodeURIComponent(lost)}`);
      note(`DELETE this page's session ${lost.slice(0, 8)}…: HTTP ${status}`);
      if (status !== 200) throw new Error(`could not delete the page's session: HTTP ${status}`);
    } else {
      // No network in the mock: its eviction knob drops the session as the API does (409 session_lost on the next route).
      lost = await page.evaluate(() => { const m = window.__nexoPrefetchMock, opens = m.session.opens; m.evict(409); return opens; });
      note('mock: session dropped with the mock\'s evict(409), the API\'s eviction answer');
    }
    await type(colour, C2);
    await page.waitForFunction(t => (window.__pilotToasts || []).some(x => x.text.startsWith(t)), 'Analysis reconnected.', { timeout: T });
    const problems = [], deadline = Date.now() + T;
    let seen = null;
    while (Date.now() < deadline) { seen = await colourIn(page, a.pca, C2); if (seen?.pixels > 0) break; await page.waitForTimeout(500); }
    if (!(seen?.pixels > 0)) problems.push(`the PCA does not show ${C2}: ${JSON.stringify(seen)}`);
    if (seen?.pixels > 0) { memo.expect.colour.value = C2; if (current) current.metrics.sessionPalette = { context: memo.expect.colour.context, group: memo.expect.colour.group, color: C2 }; } // what the card now shows, whatever else fails below
    if (await palettePanel.isVisible().catch(() => false)) await click(palettePanel.getByRole('button', { name: 'Close Colors & palettes', exact: true }));
    // Live: the requests now go to a new session id. Mock: the app keeps its id and maps it (session.ts alias), so count opens.
    const now = live ? net.current() : await page.evaluate(() => window.__nexoPrefetchMock.session.opens);
    if (live && (!now || now === lost)) problems.push(`still on the lost session (${String(now).slice(0, 8)})`);
    if (!live && now !== lost + 1) problems.push(`${now - lost} session reopen(s), not one`);
    // Earlier edits: the violin title (step 5), the FLA pick (4e), the structural card drawn after Initiate (4c).
    const lay = a.violin ? await plotLayout(page, a.violin) : null;
    if (lay && lay.title !== TITLE) problems.push(`violin title "${lay.title}"`);
    if (memo.expect.struct) {
      await settled(page, a.struct).then(() => drawn(page, a.struct)).catch(() => problems.push('structural card not drawn after the reconnect'));
      const msg = await cardMessage(page, a.struct); if (msg) problems.push(`structural card says "${msg.slice(0, 120)}"`);
      const shown = live ? null : await page.evaluate(i => window.__nexoMock?.labels?.[i] ?? null, instanceOf(a.struct));
      if (shown && /Initiate Structural Analysis/.test(shown)) problems.push('structural card back to Team\'s placeholder');
    }
    if (memo.expect.fla) {
      await selectCard(page, a.fla); await inspectorTab(page, 'Data');
      const box = inspector(page).locator('fieldset.computed-indices').getByRole('group', { name: memo.expect.fla.group, exact: true }).getByRole('checkbox', { name: memo.expect.fla.label, exact: true });
      if (!(await box.isChecked({ timeout: T }).catch(() => false))) problems.push(`FLA ${memo.expect.fla.label} no longer ticked`);
    }
    await page.waitForTimeout(3000);
    const lingering = await page.locator('.toast.is-error').count(), alert = await page.locator('.session-lost').count();
    if (lingering) problems.push(`${lingering} error toast(s) still shown`);
    if (alert) problems.push('the "session lost" alert is shown');
    const said = (await page.evaluate(() => window.__pilotToasts || [])).map(t => t.text).filter(t => /connect/i.test(t));
    if (problems.length) throw new Error(problems.join('; '));
    return `toasts: ${said.join(' → ')}; PCA shows ${C2} (${seen.pixels} px); ${live ? `session ${String(lost).slice(0, 8)}… → ${String(now).slice(0, 8)}…` : 'one reopen'}; violin title, FLA pick and structural drawing kept; no error left`;
  });

  await step(ctx, 8, 'Add an illustration and a text', 'An illustration card on the canvas; a text on the Figure page', async () => {
    const rail = page.getByRole('navigation', { name: 'Canvas tools' });
    await click(rail.getByRole('button', { name: 'Illustrations', exact: true }));
    const panel = page.getByRole('complementary', { name: 'Library' });
    await type(panel.getByRole('searchbox', { name: 'Search illustrations' }), 'vial');
    const before = await ids(page);
    await click(panel.getByRole('button', { name: 'Add Serum / plasma vial', exact: true }));
    await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before.length, { timeout: T });
    a.art = (await ids(page)).find(x => !before.includes(x));
    await drawn(page, a.art);
    await closeLibrary(page);
    await click(rail.getByRole('button', { name: 'Text & shapes', exact: true }));
    const figure = page.getByRole('region', { name: 'Figure page controls' });
    const items = () => page.locator('#figure-layer [data-figure-item]').count();
    // The page draws its items over a few frames after it opens: count once they stop arriving.
    let n0 = await items();
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); const n = await items(); if (n === n0) break; n0 = n; }
    await click(figure.getByRole('button', { name: 'Add text', exact: true }));
    const text = figure.getByRole('textbox', { name: 'Text', exact: true });
    const fullToast = page.locator('.toast', { hasText: 'No free space is left on the page' });
    await text.or(fullToast).first().waitFor({ timeout: live ? T : 5000 }).catch(() => {});
    const added = await text.isVisible().catch(() => false)
      && await page.waitForFunction(n => document.querySelectorAll('#figure-layer [data-figure-item]').length > n, n0, { timeout: live ? T : 5000 }).then(() => true, () => false);
    if (!added) {
      // A full page refuses new text with Team's own message (canvas_preview.js: "No free space is left on the page…").
      const full = await page.locator('.toast', { hasText: 'No free space is left on the page' }).count();
      if (!full) throw new Error(`"Add text" added nothing to the Figure page (${n0} items before and after)`);
      friction(`the page is full (${n0} items): "Add text" refuses with Team's message; the user must move or resize an item first`);
      await click(page.getByRole('button', { name: '← Draft', exact: true }));
      return `illustration ${a.art}; text refused on a full page (${n0} items), as in Team`;
    }
    await type(text, 'Figure 1 · synthetic cohort');
    // The page wraps text into one SVG line per row, so compare the layer's text with all whitespace removed.
    await page.waitForFunction(t => (document.querySelector('#figure-layer')?.textContent ?? '').replace(/\s+/g, '').includes(t.replace(/\s+/g, '')), 'Figure 1 · synthetic cohort', { timeout: T });
    memo.expect.text = 'Figure 1 · synthetic cohort';
    await click(page.getByRole('button', { name: '← Draft', exact: true }));
    return `illustration ${a.art}; text "Figure 1 · synthetic cohort" on the Figure page`;
  });

  await step(ctx, 9, 'Finish PCA, violin and volcano; open Figure page, paper Letter, layout Figure 1', 'Three cards finished; the Figure page shows them on Letter in the Figure 1 layout', async () => {
    const finished = [];
    const toDraft = page.getByRole('button', { name: '← Draft', exact: true });
    if (await toDraft.isVisible().catch(() => false)) await click(toDraft);
    for (const key of ['pca', 'violin', 'volcano']) {
      if (!a[key]) { note(`no ${key} card to finish`); continue; }
      const t0 = Date.now();
      await selectCard(page, a[key]);
      const t1 = Date.now();
      await click(inspector(page).getByRole('button', { name: 'Finish plot', exact: true }));
      await settled(page, a[key], ['finished']); finished.push(key);
      note(`${key}: select ${((t1 - t0) / 1000).toFixed(1)} s, finish ${((Date.now() - t1) / 1000).toFixed(1)} s`);
    }
    if (finished.length < 3) throw new Error(`finished only ${finished.join(', ')}`);
    await click(page.getByRole('button', { name: 'Figure page →', exact: true }));
    await page.locator('#figure-layer .figure-sheet').first().waitFor({ timeout: T });
    const controls = page.getByRole('region', { name: 'Figure page controls' });
    await click(controls.getByRole('tab', { name: 'Page', exact: true }));
    const tp = Date.now();
    await choose(controls.getByLabel('Paper', { exact: true }), 'Letter');
    const layout = controls.getByLabel('Layout', { exact: true });
    const layouts = await layout.locator('option').allTextContents();
    const fig1 = layouts.find(o => /figure\s*1/i.test(o));
    if (!fig1) throw new Error(`no Figure 1 layout among ${layouts.join(', ')}`);
    if (fig1 !== 'Figure 1') friction(`layout options are internal names: ${layouts.join(', ')}`);
    await choose(layout, fig1);
    note(`page settings ${((Date.now() - tp) / 1000).toFixed(1)} s`);
    const chosenLayout = await layout.inputValue(); // read it now: the Plots tab below unmounts the Page controls
    if (memo.expect.text && !(await page.evaluate(t => (document.querySelector('#figure-layer')?.textContent ?? '').replace(/\s+/g, '').includes(t.replace(/\s+/g, '')), memo.expect.text)))
      { const said = await page.locator('.figure-hidden-note').textContent({ timeout: 3000 }).catch(() => '');
        if (said) note(`the page says: "${said}"`);
        else friction('the Figure 1 template hides the text added in step 8 without saying so (it is kept; the Free layout shows it)'); }
    await click(controls.getByRole('tab', { name: /^Plots · / }));
    const pending = await page.locator('.figure-pending').first().textContent({ timeout: 5000 }).catch(() => '');
    memo.expect.paper = 'letter'; memo.expect.layout = chosenLayout;
    return `finished ${finished.join(', ')}; Letter, layout "${fig1}"; ${pending || 'no pending count shown'}`;
  });

  await step(ctx, 10, 'Export the figure (Export dialog, Nature preset, SVG and PDF) and one "More downloads" file of an unfinished card', 'A bundle with SVG and PDF; a module download from the composition card', async () => {
    if (await page.getByRole('button', { name: '← Draft', exact: true }).isVisible().catch(() => false)) await click(page.getByRole('button', { name: '← Draft', exact: true }));
    await menu(page, 'Export figure ▾', 'Publication export…');
    const dialog = page.getByRole('dialog', { name: 'Export', exact: true }); await dialog.waitFor({ timeout: T });
    const preset = dialog.getByLabel('Journal preset', { exact: true });
    await preset.waitFor({ timeout: T }).catch(async e => { await page.keyboard.press('Escape'); throw new Error(`the Export dialog never loaded its presets: ${e.message.split('\n')[0]}`); });
    const presets = await preset.locator('option').allTextContents();
    const nature = presets.find(o => /^nature/i.test(o.trim()));
    if (!nature) { await page.keyboard.press('Escape'); throw new Error(`no Nature preset among ${presets.join(', ')}`); }
    await choose(preset, nature);
    const formats = [];
    for (const f of ['SVG', 'PDF', 'PNG', 'TIFF', 'R script', 'Data (CSV)']) {
      const box = dialog.getByLabel(f, { exact: true });
      if (!(await box.count())) continue;
      // Steph review step 10 (checklist item 3): the CSV and R script members are part of the bundle she checks.
      const want = ['SVG', 'PDF', 'R script', 'Data (CSV)'].includes(f);
      if (await box.isDisabled()) { if (await box.isChecked()) formats.push(f + '(locked)'); continue; }
      if (want !== await box.isChecked()) { if (current) current.clicks++; await box.setChecked(want); }
      if (want) formats.push(f);
    }
    const bundle = await download(page, () => click(dialog.getByRole('button', { name: 'Download bundle', exact: true })));
    // The mock server answers with an empty placeholder ZIP; there the request (mock-only hook) says what was asked for.
    const names = live ? zipNames(bundle.bytes) : ((await page.evaluate(() => window.__nexoExportMock?.last?.formats).catch(() => null)) || []).map(f => `requested.${f}`);
    await click(dialog.getByRole('button', { name: 'Close', exact: true }));
    const hasSvg = names.some(n => /\.svg$/i.test(n)), hasPdf = names.some(n => /\.pdf$/i.test(n));
    if (!a.comp) throw new Error('no composition card (step 3d failed)');
    await selectCard(page, a.comp); await inspectorTab(page, 'Export');
    const more = inspector(page).getByRole('group', { name: 'More downloads from this analysis', exact: true });
    const first = more.getByRole('button').first();
    const label = (await first.textContent({ timeout: T })).trim();
    const extra = await download(page, () => click(first));
    if (!hasSvg || !hasPdf) throw new Error(`bundle ${bundle.name} (${formats.join('+')}) lacks ${!hasSvg ? 'SVG ' : ''}${!hasPdf ? 'PDF' : ''}: ${names.join(', ') || 'empty ZIP'}`);
    const hasCsv = names.some(n => /\.csv$|[.]csv\b|requested\.csv/i.test(n)), hasR = names.some(n => /\.R$|requested\.r(script)?$/i.test(n));
    if (!hasCsv || !hasR) note(`bundle members lack ${!hasCsv ? 'CSV ' : ''}${!hasR ? 'R script' : ''} (ticked: ${formats.join('+')})`);
    if (current) current.metrics.bundle = { name: bundle.name, bytes: bundle.bytes.length, formats, members: names };
    return `preset "${nature}"; bundle ${bundle.name} (${formats.join('+')}) [${names.join(', ')}]; composition "${label}" → ${extra.name} ${extra.bytes.length} B`;
  });

  // Steph review step 10 (her ranked change 8): export the composed page itself, not one panel's bundle. The Figure
  // page's own Export PDF / Export SVG (figure/exportPage.ts); each file is kept as <out>/<engine>-figure-page.<ext>.
  await step(ctx, '10b', 'Export the composed Figure page as PDF and as SVG (Page tab)', 'Non-empty PDF and SVG at the page size; the SVG holds every panel the page shows', async () => {
    await click(page.getByRole('button', { name: 'Figure page →', exact: true }));
    await page.locator('#figure-layer .figure-sheet').first().waitFor({ timeout: T });
    const controls = page.getByRole('region', { name: 'Figure page controls' });
    await click(controls.getByRole('tab', { name: 'Page', exact: true }));
    // What the page shows: sheets, slots, and the slots holding a finished plot or illustration (an image or an SVG).
    const shown = await page.evaluate(() => { const sheets = [...document.querySelectorAll('#figure-layer .figure-sheet')];
      const slots = sheets.flatMap(s => [...s.querySelectorAll('svg[data-figure-item]')]);
      return { sheets: sheets.length, slots: slots.length, panels: slots.filter(g => g.querySelector(':scope > image, :scope > svg')).length }; });
    const keep = (file, ext) => { const to = path.join(out, `${engine}-figure-page.${ext}`); fs.copyFileSync(file.file, to); return path.basename(to); };
    const pdf = await download(page, () => click(controls.getByRole('button', { name: 'Export PDF', exact: true })));
    const svg = await download(page, () => click(controls.getByRole('button', { name: 'Export SVG', exact: true })));
    const mm = pt => Math.round(pt * 25.4 / 72 * 10) / 10;
    // SVG: the root size in pt, and the panels it holds (slots with an embedded image or plot SVG), read by a browser parser.
    const inSvg = await page.evaluate(text => { const d = new DOMParser().parseFromString(text, 'image/svg+xml'), root = d.documentElement;
      const slots = [...root.querySelectorAll('svg[data-figure-item]')];
      return { root: root.localName, width: parseFloat(root.getAttribute('width')), height: parseFloat(root.getAttribute('height')), slots: slots.length,
        panels: slots.filter(g => g.querySelector(':scope > image, :scope > svg')).length, images: root.querySelectorAll('image').length,
        error: d.querySelector('parsererror')?.textContent ?? null }; }, svg.bytes.toString('utf8'));
    // PDF: pages and MediaBox from the object dictionaries (jsPDF compresses streams only); each page is one image.
    const text = pdf.bytes.toString('latin1'), boxes = [...text.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [+m[3] - +m[1], +m[4] - +m[2]]);
    const inPdf = { header: text.slice(0, 5), pages: (text.match(/\/Type\s*\/Page(?!s)/g) || []).length, images: (text.match(/\/Subtype\s*\/Image/g) || []).length, size: boxes[0] ?? null };
    const files = { pdf: keep(pdf, 'pdf'), svg: keep(svg, 'svg') };
    if (current) current.metrics.pageExport = { shown, pdf: { file: files.pdf, name: pdf.name, bytes: pdf.bytes.length, ...inPdf, mm: inPdf.size?.map(mm) },
      svg: { file: files.svg, name: svg.name, bytes: svg.bytes.length, ...inSvg, mm: [mm(inSvg.width), mm(inSvg.height)] } };
    const problems = [];
    if (!pdf.bytes.length || inPdf.header !== '%PDF-') problems.push(`PDF ${pdf.name} is empty or not a PDF (${pdf.bytes.length} B)`);
    if (!svg.bytes.length || inSvg.root !== 'svg' || inSvg.error) problems.push(`SVG ${svg.name} is empty or not an SVG (${svg.bytes.length} B${inSvg.error ? ', ' + inSvg.error.slice(0, 80) : ''})`);
    if (inPdf.pages < shown.sheets) problems.push(`PDF has ${inPdf.pages} page(s) for ${shown.sheets} on screen`);
    if (inPdf.images < inPdf.pages) problems.push(`PDF has ${inPdf.images} image(s) for ${inPdf.pages} page(s)`);
    if (inSvg.panels < shown.panels) problems.push(`SVG holds ${inSvg.panels} panel(s); the page shows ${shown.panels}`);
    if (inSvg.slots < shown.slots) problems.push(`SVG has ${inSvg.slots} slot(s); the page shows ${shown.slots}`);
    if (inPdf.size && (Math.abs(inPdf.size[0] - inSvg.width) > 0.5 || Math.abs(inPdf.size[1] - inSvg.height) > 0.5)) problems.push(`PDF page ${inPdf.size.join('×')} pt, SVG ${inSvg.width}×${inSvg.height} pt`);
    await click(page.getByRole('button', { name: '← Draft', exact: true }));
    if (problems.length) throw new Error(problems.join('; '));
    return `page shows ${shown.panels} of ${shown.slots} panels filled on ${shown.sheets} sheet(s); ` +
      `PDF ${pdf.name} → ${files.pdf} ${pdf.bytes.length} B, ${inPdf.pages} page(s), ${inPdf.size?.join(' × ')} pt (${inPdf.size?.map(mm).join(' × ')} mm), ${inPdf.images} page image(s); ` +
      `SVG ${svg.name} → ${files.svg} ${svg.bytes.length} B, ${inSvg.width} × ${inSvg.height} pt (${mm(inSvg.width)} × ${mm(inSvg.height)} mm), ${inSvg.panels} panel(s) of ${inSvg.slots} slots, ${inSvg.images} embedded image(s)`;
  });

  await step(ctx, 11, 'Save a checkpoint named pilot-sim-<timestamp>', 'A toast confirms the save and the URL points at the new checkpoint', async () => {
    const label = `pilot-sim-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}-${engine}`;
    await menu(page, 'Export figure ▾', 'Save checkpoint…');
    const dialog = page.getByRole('dialog', { name: 'Checkpoints', exact: true }); await dialog.waitFor({ timeout: T });
    await type(dialog.getByRole('textbox', { name: 'New checkpoint name' }), label);
    await click(dialog.getByRole('button', { name: 'Save current analysis', exact: true }));
    const saved = page.locator('.toast', { hasText: `Saved checkpoint ${label}` });
    const refused = dialog.getByRole('alert').filter({ hasText: /\S/ });
    await saved.or(refused).first().waitFor({ timeout: T });
    if (!(await saved.isVisible().catch(() => false))) throw new Error(`save refused: "${(await refused.first().innerText()).trim()}"`);
    memo.saved = new URL(page.url()).searchParams.get('checkpoint'); memo.savedName = label;
    if (!memo.saved) throw new Error('the URL does not name the saved checkpoint');
    if (await dialog.isVisible().catch(() => false)) await page.keyboard.press('Escape');
    // What Steph should find: read from the screen Paula leaves.
    memo.expect.cards = (await ids(page)).sort();
    memo.expect.finished = [];
    for (const id of memo.expect.cards) if ((await cardState(page, id)) === 'finished') memo.expect.finished.push(id);
    memo.expect.violin = a.violin; memo.expect.art = a.art;
    // What the screen says she saved, compared with the downloaded ZIP in 11b.
    const tabs = await page.getByRole('tablist', { name: 'Canvas tabs', exact: true }).getByRole('tab').count().catch(() => 0);
    const statistics = await page.locator('#world .card header .card-stats').evaluateAll(xs => xs.filter(x => x.textContent.trim() === 'Statistics').length);
    memo.screen = { cards: memo.expect.cards.length, finished: memo.expect.finished.length, statistics, tabs };
    if (current) current.metrics.screen = memo.screen;
    if (!live) memo.mockStore = await page.evaluate(() => sessionStorage.getItem('nexo-mock-checkpoints-v1'));
    return `saved "${label}" as ${memo.saved.slice(0, 12)}…; ${memo.expect.cards.length} cards, ${memo.expect.finished.length} finished`;
  });

  await step(ctx, '11b', 'Download the saved checkpoint ZIP from the Checkpoints dialog', 'A ZIP downloads; its Team canvas holds the cards, finished plots and statistics on screen; Team\'s state keeps the session colour; Nexo\'s member keeps the pressed action and the FLA pick', async () => {
    if (!memo.saved) throw new Error('nothing saved (step 11 failed)');
    await menu(page, 'Export figure ▾', 'Save checkpoint…');
    const dialog = page.getByRole('dialog', { name: 'Checkpoints', exact: true }); await dialog.waitFor({ timeout: T });
    const row = dialog.locator('article', { hasText: memo.savedName }).first();
    const dl = await download(page, () => click(row.getByRole('button', { name: 'Download', exact: true })));
    await page.keyboard.press('Escape');
    const file = path.join(out, engines.length > 1 ? `pilot-saved-${engine}.zip` : SAVED_ZIP);
    fs.writeFileSync(file, dl.bytes); fs.unlinkSync(dl.file);
    if (engines.length > 1 && engine === engines[0]) fs.writeFileSync(path.join(out, SAVED_ZIP), dl.bytes);
    const sha256 = crypto.createHash('sha256').update(dl.bytes).digest('hex');
    const entries = zipEntries(dl.bytes), names = Object.keys(entries);
    const member = n => { const k = names.find(x => x.split('/').pop() === n); return k && entries[k] ? JSON.parse(entries[k].toString('utf8')) : null; };
    const canvas = member('team-canvas-v1.json'), nexo = member('nexo-canvas-v1.json'), team = member('state.json');
    if (!canvas) throw new Error(`${dl.name} (${dl.bytes.length} B) has no readable team-canvas-v1.json: ${names.join(', ') || 'not a ZIP'}`);
    const counts = canvasCounts(canvas), problems = [];
    if (memo.screen) for (const [k, z] of [['cards', 'nodes'], ['finished', 'finished'], ['statistics', 'statistics']]) if (counts[z] !== memo.screen[k]) problems.push(`${z}: ${counts[z]} in the ZIP, ${memo.screen[k]} on screen`);
    if (memo.screen && counts.tabs && counts.tabs !== memo.screen.tabs) problems.push(`tabs: ${counts.tabs} in the ZIP, ${memo.screen.tabs} on screen`);
    const own = id => nexo?.nodes?.[id] ?? {};
    // Pilot F1: the session palette is Team's, saved as Team saves it (state.json color_shape; the mock archive writes the same member).
    if (memo.expect.colour) { const k = `${memo.expect.colour.context}::${memo.expect.colour.group}`, got = team?.color_shape?.custom_colors?.[k];
      if (String(got ?? '').toLowerCase() !== memo.expect.colour.value.toLowerCase() || team?.color_shape?.useCustomColors !== true) problems.push(`Team's state.json color_shape has ${k} = ${got ?? 'nothing'}, not ${memo.expect.colour.value}`); }
    if (memo.expect.struct && !(own(memo.expect.struct.card).actions ?? []).includes('runAnalysis')) problems.push('Nexo\'s member lacks the pressed "Initiate Structural Analysis" (runAnalysis)');
    if (memo.expect.fla && !Object.entries(own(memo.expect.fla.card).inputs ?? {}).some(([k, v]) => /^sel_/.test(k) && Array.isArray(v) && v.some(x => x === memo.expect.fla.label || String(x).startsWith(memo.expect.fla.label)))) problems.push(`Nexo's member lacks the FLA pick ${memo.expect.fla.label}`);
    memo.zip = { file, sha256, counts };
    if (current) current.metrics.saved = { zip: path.basename(file), sha256, bytes: dl.bytes.length, members: names, counts, screen: memo.screen ?? null };
    if (!live) note('mock: this is the mock\'s canvas-only archive (src/mock/archive.ts: team-canvas-v1.json + nexo-canvas-v1.json, no Team session); pilot_team_roundtrip.R needs the ZIP of a live run');
    if (problems.length) throw new Error(problems.join('; '));
    return `${path.basename(file)} ${dl.bytes.length} B sha256 ${sha256}; members ${names.join(', ')}; counts ${JSON.stringify(counts)}`;
  });
  await context.close();
  return memo;
}

// ---------- Persona 2: Steph, PI who reviews ----------
async function steph(browser, engine, base, memo) {
  if (!memo.saved) {
    for (const [id, action] of [[12, 'Reopen the saved checkpoint in a new context'], [13, 'Open it on a phone: view only and legible']])
      await step({ page: { evaluate: async () => [], screenshot: async () => {} }, errors: [], engine, persona: 'Steph' }, id, action, 'Paula saved a checkpoint', async () => { throw new Error('impossible to continue: Paula saved no checkpoint (step 11)'); });
    return;
  }
  // The mock keeps saved checkpoints in the tab's sessionStorage; the new context gets the same store a server would keep.
  const bridge = ctx => !live && memo.mockStore && ctx.context.addInitScript(v => { if (!sessionStorage.getItem('nexo-mock-checkpoints-v1')) sessionStorage.setItem('nexo-mock-checkpoints-v1', v); }, memo.mockStore);
  const desk = await newContext(browser, { viewport: { width: 1440, height: 900 } });
  await bridge(desk);
  const ctx = { ...desk, engine, persona: 'Steph' }, page = desk.page, e = memo.expect;
  await step(ctx, 12, 'Reopen the saved checkpoint in a new context and check what came back', 'Cards, violin style, statistics, finished plots, illustration, text and Figure page settings are restored', async () => {
    await openFromStart(page, base, memo.savedName, memo.saved);
    await page.waitForFunction(n => document.querySelectorAll('#world .card').length >= n, e.cards.length, { timeout: T });
    const problems = [];
    // Steph review rows 2/12: Paula's confirmed design travels in Nexo's member. Production's restore (live) re-applies
    // the archived design inputs, so the session comes back confirmed; when it does not (the mock), the dialog opens at once, prefilled with Paula's design and saying so: Steph confirms it with one click.
    // Opening by itself leaves the save pill clean.
    const pillNow = async () => ((await page.locator('.save-pill').textContent({ timeout: 5000 }).catch(() => '')) ?? '').trim();
    const designDialog = page.getByRole('dialog', { name: 'Confirm study design', exact: true });
    if (e.design && await designDialog.waitFor({ timeout: live ? 30000 : 10000 }).then(() => true, () => false)) {
      const got = [await designDialog.getByLabel('Experimental unit').inputValue(), await designDialog.getByLabel('Sample relationship').inputValue()];
      const said = /Saved with this design by the author; confirm to enable differential plots/.test(await designDialog.textContent());
      if (got[0] !== e.design.unit || got[1] !== e.design.type) problems.push(`design dialog prefilled ${got.join('/')}, Paula confirmed ${e.design.unit}/${e.design.type}`);
      if (!said) problems.push('the design dialog does not say the design was saved by the author');
      const opened = await pillNow();
      if (/Unsaved/.test(opened)) problems.push(`the reopened checkpoint already says "${opened}"`);
      await click(designDialog.getByRole('button', { name: 'Confirm study design', exact: true }));
      await designDialog.waitFor({ state: 'hidden', timeout: T });
      note(`design dialog on reopen, prefilled ${got.join('/')}, confirmed with one click; pill on open "${opened}"`);
    } else if (e.design) {
      // Production's restore (the live API) re-applies the archived design inputs, so the session comes back already
      // confirmed and nothing needs asking: then the differential plots must be addable without the design gate.
      const panel = await openPlots(page);
      await type(panel.getByRole('searchbox', { name: 'Search plots' }), 'volcano');
      const ask = panel.getByRole('button', { name: 'Confirm study design… (Differential volcano)', exact: true });
      const add = panel.getByRole('button', { name: 'Add Differential volcano', exact: true });
      await ask.or(add).first().waitFor({ timeout: T }).catch(() => {});
      if (await add.isVisible().catch(() => false)) note('design restored with the checkpoint (already confirmed): nothing asked, Differential volcano can be added');
      else problems.push('the reopened checkpoint neither offered Paula\'s saved design nor restored it');
      await type(panel.getByRole('searchbox', { name: 'Search plots' }), '');
      await closeLibrary(page);
    }
    const now = (await ids(page)).sort();
    if (JSON.stringify(now) !== JSON.stringify(e.cards)) problems.push(`cards differ: missing ${e.cards.filter(x => !now.includes(x)).join(',') || '-'}, extra ${now.filter(x => !e.cards.includes(x)).join(',') || '-'}`);
    for (const id of e.finished) { const st = await cardState(page, id); if (st !== 'finished') problems.push(`${id} is ${st}, not finished`); }
    if (e.violin && now.includes(e.violin)) {
      if (e.finished.includes(e.violin)) await drawn(page, e.violin).catch(() => problems.push('violin snapshot not drawn'));
      else await settled(page, e.violin).then(() => drawn(page, e.violin)).catch(() => problems.push('violin not drawn'));
      const lay = await plotLayout(page, e.violin);
      const img = await cardFor(page, e.violin).locator('img').count();
      if (lay && lay.title !== e.violinTitle) problems.push(`violin title "${lay.title}"`);
      if (!lay && !img) problems.push('violin shows neither a plot nor a snapshot');
      if (!lay) note('violin is a finished snapshot image; its title is checked through the inspector');
      // A state check: textContent (innerText is "" while Steph's fitted view shows the violin as a thumbnail, header hidden).
      const stats = (await cardFor(page, e.violin).locator('header .card-stats').textContent({ timeout: 5000 }).catch(() => '')) ?? '';
      if (!/^Statistics$/.test(stats.trim())) problems.push(`violin statistics marker "${stats}"`);
    }
    if (e.art && !now.includes(e.art)) problems.push('illustration missing');
    // Round 2: what 4b, 4c and 4e left. Read from the screen (pixels, the Data tab); nothing is pressed or changed.
    if (e.colour && now.includes(e.colour.card)) {
      await drawn(page, e.colour.card).catch(() => {});
      const seen = await colourIn(page, e.colour.card, e.colour.value);
      if (!(seen?.pixels > 0)) problems.push(`the PCA does not show Paula's ${e.colour.value}: ${JSON.stringify(seen)}`);
      else note(`PCA shows ${e.colour.value} (${seen.pixels} px)`);
    }
    if (e.struct && now.includes(e.struct.card)) {
      // Team never restores the design approval from an archive (R/modules/1_shared_data_module.R:5906-5910): a reopened
      // differential card asks for it. Steph answers as Paula did, from the card's own "Study design" button.
      const gate = cardFor(page, e.struct.card).getByRole('button', { name: 'Study design', exact: true });
      if (await gate.isVisible({ timeout: 3000 }).catch(() => false)) {
        await fitIfHidden(page, e.struct.card); await click(gate);
        note(`design asked again on reopen (Team: approval is session-local): ${(await confirmDesign(page)).join(', ')}`);
      }
      await settled(page, e.struct.card, ['current', 'finished', 'finished-stale']).then(() => drawn(page, e.struct.card)).catch(() => problems.push('structural card not drawn'));
      const msg = await cardMessage(page, e.struct.card); if (msg) problems.push(`structural card says "${msg.slice(0, 120)}"`);
      if (!live) {
        const shown = await page.evaluate(i => window.__nexoMock?.labels?.[i] ?? null, instanceOf(e.struct.card));
        if (!shown || /Initiate Structural Analysis/.test(shown)) problems.push(`structural card shows Team's placeholder ("${shown}"), not the analysis`);
      } else {
        const failed = desk.net.replays.filter(r => r.path.includes(encodeURIComponent(instanceOf(e.struct.card))) && (r.status >= 400 || (r.body?.failed ?? []).length));
        if (failed.length) problems.push(`replay of the structural card failed: ${JSON.stringify(failed).slice(0, 160)}`);
        const img = await imageOf(page, e.struct.card);
        note(`structural image ${img?.bpp} bytes per pixel (Paula: placeholder ${e.struct.placeholderBpp}, analysis ${e.struct.analysedBpp}); replay calls ${desk.net.replays.length}`);
      }
      await selectCard(page, e.struct.card); await inspectorTab(page, 'Data');
      const replayNote = await inspector(page).locator('.replay-failed').count();
      if (replayNote) problems.push(`the Data tab says: "${(await inspector(page).locator('.replay-failed').innerText()).slice(0, 160)}"`);
    }
    if (e.fla && now.includes(e.fla.card)) {
      await selectCard(page, e.fla.card); await inspectorTab(page, 'Data');
      const box = inspector(page).locator('fieldset.computed-indices').getByRole('group', { name: e.fla.group, exact: true }).getByRole('checkbox', { name: e.fla.label, exact: true });
      if (!(await box.isChecked({ timeout: T }).catch(() => false))) problems.push(`FLA ${e.fla.group}: ${e.fla.label} not ticked`);
      else note(`FLA ${e.fla.label} ticked`);
    }
    await click(page.getByRole('button', { name: 'Figure page →', exact: true }));
    await page.locator('#figure-layer .figure-sheet').first().waitFor({ timeout: T });
    const controls = page.getByRole('region', { name: 'Figure page controls' });
    await click(controls.getByRole('tab', { name: 'Page', exact: true }));
    const paper = await controls.getByLabel('Paper', { exact: true }).inputValue().catch(() => '?');
    const layout = await controls.getByLabel('Layout', { exact: true }).inputValue().catch(() => '?');
    const onPage = t => page.evaluate(t => (document.querySelector('#figure-layer')?.textContent ?? '').replace(/\s+/g, '').includes(t.replace(/\s+/g, '')), t);
    if (e.text && !(await onPage(e.text))) {
      // The Figure 1 template (Team's) shows its fixed panels only; free text lives on the Free layout. Look there, then undo.
      if (layout === 'figure1') {
        await choose(controls.getByLabel('Layout', { exact: true }), 'Free');
        await page.waitForTimeout(400);
        if (!(await onPage(e.text))) problems.push(`text "${e.text}" not on the Free layout either`);
        else note('text kept: the Figure 1 template hides free text, the Free layout shows it');
        await page.keyboard.press('ControlOrMeta+z');
      } else problems.push(`text "${e.text}" not on the Figure page`);
    }
    if (paper !== e.paper) problems.push(`paper ${paper}`);
    if (layout !== e.layout) problems.push(`layout ${layout}`);
    // Steph only looked (the Free layout above is undone): nothing is left unsaved.
    await page.waitForTimeout(500); const pillEnd = await pillNow();
    if (/Unsaved/.test(pillEnd)) problems.push(`after only looking, the pill says "${pillEnd}"`); else note(`pill at the end: "${pillEnd}"`);
    if (problems.length) throw new Error(problems.join('; '));
    return `${now.length} cards, ${e.finished.length} finished, violin title + statistics, illustration, text, ${paper}/${layout}` +
      `${e.colour ? ', PCA colour' : ''}${e.struct ? ', structural drawn without pressing Initiate' : ''}${e.fla ? ', FLA pick' : ''}`;
  });
  await desk.context.close();

  const phone = await newContext(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await bridge(phone);
  const pctx = { ...phone, engine, persona: 'Steph' }, ppage = phone.page;
  await step(pctx, 13, 'Open it on a phone (375×812): view only and legible', 'A view-only notice, no enabled editing control, text at a readable size and no sideways scrolling', async () => {
    await ppage.goto(`${base}/nexo/`);
    const esc = memo.savedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entry = ppage.getByRole('button', { name: new RegExp(`^${esc}\\b`) }).first();
    try { await entry.waitFor({ timeout: T }); if (current) current.clicks++; await entry.tap(); }
    catch { friction('saved checkpoint not offered on the phone start screen; opened by URL'); await ppage.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(memo.saved)}`); }
    await ppage.waitForFunction(n => document.querySelectorAll('#world .card').length >= n, e.cards.length, { timeout: T });
    const problems = [];
    const notice = await ppage.getByText('View only on this device', { exact: false }).first().isVisible().catch(() => false);
    if (!notice) problems.push('no view-only notice');
    const editing = ['+ Add plot', 'Tidy up', '↶ Undo', '↷ Redo', 'Finish plot', 'Edit', 'Duplicate', 'Plots', 'Illustrations', 'Text & shapes', 'Add canvas tab', 'Save checkpoint…'];
    const enabled = [];
    for (const name of editing) for (const b of await ppage.getByRole('button', { name, exact: true }).all()) if (await b.isVisible() && await b.isEnabled()) { enabled.push(name); break; }
    const handles = await ppage.locator('#world .resize-handle').evaluateAll(hs => hs.filter(h => getComputedStyle(h).display !== 'none' && h.getBoundingClientRect().width > 0).length);
    if (handles) enabled.push(`${handles} resize handle(s)`);
    // Inspect a card: its settings must be read-only. Tap the violin (its title, or the card itself when the overview
    // shows cards as labels), else the first card that is on screen.
    if (e.violin) {
      const reachable = await ppage.evaluate(ids => { for (const id of ids) for (const sel of [' header strong', '']) {
        const t = document.querySelector(`#world .card[data-id="${id}"]${sel}`); if (!t) continue;
        const r = t.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (r.width > 0 && x > 0 && y > 0 && x < innerWidth && y < innerHeight && t.contains(document.elementFromPoint(x, y))) return { id, sel, x, y };
      } return null; }, [e.violin, ...e.cards.filter(id => id !== e.violin && id.startsWith('tcinstance_')), ...e.cards.filter(id => id !== e.violin && !id.startsWith('tcinstance_'))]);
      let tapped = false;
      if (reachable) { if (current) current.clicks++; tapped = await ppage.touchscreen.tap(reachable.x, reachable.y).then(() => true, () => false); }
      if (tapped) await ppage.waitForFunction(id => document.querySelector(`#world .card[data-id="${id}"]`)?.classList.contains('selected'), reachable.id, { timeout: 5000 }).catch(() => { tapped = false; });
      if (reachable) reachable.toString = () => reachable.id;
      if (!tapped) note(`no card could be selected by a tap on the phone overview${reachable ? ` (tapped ${reachable.id})` : ''}: the inspector read-only check did not run`);
      else note(`tapped ${reachable.id === e.violin ? 'the violin' : reachable.id} (${reachable.sel ? 'its title' : 'the card'}) to read its inspector`);
      const fields = await ppage.locator('#inspector').locator('input:not([type=hidden]),select,textarea').evaluateAll(xs => xs.filter(x => !x.disabled && !x.readOnly && x.getBoundingClientRect().width > 0 && !x.closest('fieldset[disabled]')).map(x => x.getAttribute('aria-label') || x.labels?.[0]?.textContent?.trim() || x.name || x.type));
      if (fields.length) enabled.push(`inspector fields: ${fields.slice(0, 6).join(', ')}`);
    }
    if (enabled.length) problems.push(`editing controls enabled: ${enabled.join(', ')}`);
    const legibility = await ppage.evaluate(() => {
      const small = new Set();
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('svg,.js-plotly-plot,canvas')) continue;
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || el.closest('[hidden],[aria-hidden="true"]')) continue;
        const px = parseFloat(st.fontSize); if (px < 12) small.add(`${el.textContent.trim().slice(0, 24)} (${px}px)`);
      }
      return { overflow: document.documentElement.scrollWidth - innerWidth, small: [...small].slice(0, 6) };
    });
    if (legibility.overflow > 1) problems.push(`page scrolls sideways by ${legibility.overflow}px`);
    if (legibility.small.length) problems.push(`text under 12 px: ${legibility.small.join('; ')}`);
    if (problems.length) throw new Error(problems.join('; '));
    return 'view-only notice shown; no editing control enabled; text ≥ 12 px; no sideways scroll';
  });
  await phone.context.close();
}

// ---------- the run ----------
async function cleanup(browser, base, memo) {
  if (!live || !memo?.saved) return;
  const { context, page } = await newContext(browser, {});
  try {
    await page.goto(`${base}/nexo/`);
    const status = await page.evaluate(async u => (await fetch(u, { method: 'DELETE' })).status, `${base}/api/v1/checkpoints/${encodeURIComponent(memo.saved)}`);
    console.log(`cleanup: deleted the pilot's own checkpoint ${memo.savedName} (${memo.saved.slice(0, 12)}…): HTTP ${status}`);
  } catch (e) { console.log(`cleanup: could not delete ${memo.saved}: ${e.message}`); }
  finally { await context.close(); }
}
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: nexo, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function mockBase() {
  const p = await freePort();
  run('sh', ['scripts/vendor-plotly.sh']);
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1' });
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`, deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) return base; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const base = live ? live.replace(/\/$/, '') : await mockBase();
  console.log(`PILOT ${live ? 'LIVE' : 'MOCK'} ${base} checkpoint=${checkpoint} engines=${engines.join(',')} out=${out}`);
  const pw = require(require.resolve('playwright', { paths: [ci] }));
  for (const engine of engines) {
    const browser = await pw[engine].launch();
    let memo = null;
    try { memo = await paula(browser, engine, base); await steph(browser, engine, base, memo); }
    finally { await cleanup(browser, base, memo); await browser.close(); }
  }
  console.log('---');
  for (const s of log) console.log(s.ok ? `PASS ${s.step}` : `FAIL ${s.step} ${s.observed}`);
  const failed = log.filter(s => !s.ok).length, rough = log.filter(s => s.friction).length;
  console.log(`PILOT ok=${log.length - failed} failed=${failed} friction=${rough}`);
  console.log(`log: ${path.join(out, 'pilot-log.json')}`);
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
