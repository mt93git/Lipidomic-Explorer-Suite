'use strict';
// Chart audit, batch b02-qc-a (docs/integration/nexo-chart-audit-plan.md): the 11-row checklist per plot, in a real
// browser against the synthetic-only audit API. Needs the batch Vite (NEXO_AUDIT_BASE, default :5182, batches.json, vite.audit.config.mjs with
// NEXO_AUDIT_API=http://127.0.0.1:3961) and the audit API. Plotly plots need frontends/nexo/public/vendor/plotly.min.js (scripts/vendor-plotly.sh).
//   node tests/dual-ui/chart-audit/audit_b02-qc-a.cjs [outputName ...]
// One page at a time (the API holds two sessions in total). Writes screenshots to docs/integration/chart-audit/b02-qc-a/.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5182';
// NEXO_AUDIT_SAVE: a second run in parallel saves under its own name, so one run's cleanup cannot delete the other's
const CP = 'nexo-complete-synthetic', SAVE = process.env.NEXO_AUDIT_SAVE || 'audit-b02-rework-synthetic';
const shots = path.join(root, 'docs/integration/chart-audit/b02-qc-a');
const T = Number(process.env.NEXO_AUDIT_T || 180000);
fs.mkdirSync(shots, { recursive: true });

// Per plot: the Library label, how it draws, and the Data controls a user changes (`bad`: an invalid value for a
// number field). `smart`: the smart-label switch a user turns off so the editable view draws (Team refuses it on).
// Values are the radio/select option values of the catalog (pcaMode: omics|class, R/modules/2_qc_boxplot_module.R:60).
const PLOTS = [
  { out: 'boxplotAfterNorm', label: 'Normalized signal boxplots', render: 'png', data: [{ id: 'mergeReplicatesMode', to: 'merged' }] },
  { out: 'outlierPlot', label: 'Outlier screening', render: 'png', data: [{ id: 'outlierThreshold', to: '3.5', bad: '-4' }, { id: 'outlierScope', to: 'group' }, { id: 'outlierNumShow', to: '10', live: '24' }], fixedHeight: true },
  { out: 'pca2dPlot', label: 'PCA scores · 2D', render: 'png', custom: true, data: [{ id: 'scoreMarkerSize2D', to: '14' }, { id: 'scoreTextSize2D', to: '6' }] },
  { out: 'pca2dVectorPlot', label: 'PCA scores · editable 2D', render: 'plotly', smart: 'smartLabelPCA2D', data: [{ id: 'scoreMarkerSize2D', to: '14' }] },
  { out: 'pca3dPlot', label: 'PCA scores · 3D', render: 'plotly', data: [{ id: 'scoreMarkerSize3D', to: '14' }] },
  { out: 'load2dPlot', label: 'PCA loadings · 2D', render: 'png', data: [{ id: 'pcaMode', to: 'omics', live: 'class' }, { id: 'loadMarkerSize2D', to: '12' }, { id: 'loadTextSize2D', to: '6' }] },
  { out: 'load2dVectorPlot', label: 'PCA loadings · editable 2D', render: 'plotly', smart: 'smartLabelLoad2D', data: [{ id: 'pcaMode', to: 'omics', live: 'class' }, { id: 'loadMarkerSize2D', to: '12' }] },
];
let CATALOG = null;

const results = [];
function report(plot, n, name, status, detail = '') {
  results.push({ plot: plot.out, n, name, status, detail });
  console.log(`${status} ${plot.out} #${n} ${name}${detail ? ' — ' + detail : ''}`);
}
// The page the audit is on (it changes on reopen), so a failing check saves what the user would see and the URL.
let CUR = null;
async function check(plot, n, name, fn) {
  try { const r = await fn(); if (r && r.na) report(plot, n, name, 'N/A', r.na); else report(plot, n, name, 'PASS', r || ''); }
  catch (e) {
    let diag = '';
    if (CUR && !CUR.isClosed()) {
      const f = `${plot.out}-r2-${n}-fail.png`;
      await CUR.screenshot({ path: path.join(shots, f) }).then(() => { diag = ` [${f}, url ${CUR.url().replace(/^.*\/nexo\//, '/nexo/').slice(0, 90)}]`; }).catch(() => {});
    } else diag = ' [page closed]';
    report(plot, n, name, 'FAIL', String(e.message || e).split('\n')[0].slice(0, 1500) + diag + (API_LOG.length ? ` API: ${API_LOG.slice(-2).join(' | ')}` : '') + (ERRORS.length ? ` last console: ${ERRORS.slice(-2).join(' | ').slice(0, 200)}` : ''));
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

// Console errors of every page the audit opens for one plot (all contexts, all pages), so a reopen keeps the earlier ones.
let ERRORS = [], API_LOG = [];
function watch(page, where) {
  page.on('pageerror', e => ERRORS.push(`${where}: ${e.message.slice(0, 300)}`));
  page.on('console', m => { if (m.type() === 'error') ERRORS.push(`${where}: ${m.text().slice(0, 300)} ${m.location()?.url ? '@' + m.location().url.replace(/^.*\/api\/v1/, '/api/v1').slice(0, 120) : ''}`); });
}
async function openPage(browser, cp = CP, viewport = { width: 1440, height: 900 }, where = 'page') {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  context.on('page', p => { if (!p.watched) { p.watched = true; watch(p, where + '+'); } });
  const page = await context.newPage(); CUR = page;
  if (!page.watched) { page.watched = true; watch(page, where); }
  page.cardPaths = new Set(); page.renders = new Map();
  // the API's answer to every card PATCH and to every failing card request (body as sent, answer as received)
  page.on('response', async r => {
    const q = r.request(); if (!/\/api\/v1\/sessions\/[^/]+\/cards\//.test(r.url())) return;
    if (q.method() !== 'PATCH' && r.status() < 400) return;
    const text = await r.text().catch(() => '');
    API_LOG.push(`${q.method()} ${r.url().replace(/^.*\/api\/v1/, '')} → ${r.status()} ${text.replace(/\s+/g, ' ').slice(0, 260)} [sent ${(q.postData() || '').slice(0, 200)}]`);
  });
  page.on('request', r => { const m = r.url().match(/\/api\/v1(\/sessions\/[^/]+\/cards\/[^/]+)\/render/); if (m) { page.cardPaths.add(m[1]); try { page.renders.set(m[1], JSON.parse(r.postData() || '{}')); } catch { /* not JSON */ } } });
  // the previous page's API session can still be held for a moment after its context closes (409 session_lost):
  // a page that does not come up in T is screenshotted and reopened once
  for (let attempt = 1; ; attempt++) {
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(cp)}`);
    // at phone width the toolbar folds Export into its overflow menu: wait for the canvas viewport instead (#world is a
    // zero-size absolute layer, never "visible" to Playwright: that was the round-1 phone timeout)
    try { await (viewport.width < 600 ? page.locator('#viewport') : page.getByRole('button', { name: 'Export figure ▾', exact: true })).waitFor({ timeout: T }); break; }
    catch (e) {
      const f = `open-${where}-${attempt}-fail.png`; await page.screenshot({ path: path.join(shots, f) }).catch(() => {});
      ERRORS.push(`${where}: page did not open on attempt ${attempt} (${f}): ${(await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`);
      if (attempt >= 2) throw e;
    }
  }
  await page.waitForTimeout(2500);
  CUR = page;
  return page;
}
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
const ids = page => page.locator('#world .card').evaluateAll(cs => cs.map(c => c.dataset.id));
const stateOf = (page, id) => card(page, id).locator('.card-status').getAttribute('data-state');
async function settled(page, id, states = ['current']) {
  await page.waitForFunction(([sel, s]) => s.includes(document.querySelector(sel + ' .card-status')?.dataset.state), [`.card[data-id="${id}"]`, states], { timeout: T });
}
async function fit(page) { await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click(); }
// Wave 1: a tab opens fitted to its cards (often < 50 %, plots frozen); the zoom the pill shows, as a user reads it
const zoomPct = page => page.locator('.zoom-pill span').first().innerText().catch(() => '?');
// Wave 1: at Fit a click on the header flies the camera to the card (click to focus); wait until it is selected and
// the flight has ended, or a drag that follows grabs the resize handle where it was mid-flight.
async function select(page, id) {
  await fit(page); await card(page, id).locator('header').click();
  await page.waitForFunction(sel => document.querySelector(sel)?.classList.contains('selected'), `.card[data-id="${id}"]`, { timeout: T });
  await page.waitForTimeout(900);
}
// What the card shows, as a comparable signature: the image src, or the Plotly traces and layout it drew.
function signature(page, id) {
  return card(page, id).evaluate(c => {
    const img = c.querySelector('.body img');
    if (img) return img.complete && img.naturalWidth > 0 ? `img:${img.getAttribute('src')}:${img.naturalWidth}x${img.naturalHeight}` : null;
    const p = c.querySelector('.js-plotly-plot');
    if (p && p.data?.length) return 'plotly:' + JSON.stringify([p.data.map(t => [t.type, t.marker?.size, t.marker?.color, (t.x || []).length, t.name]), p.layout?.title, p._fullLayout?.width, p._fullLayout?.height]);
    return null;
  });
}
async function drawn(page, id) {
  await page.waitForFunction(sel => {
    const c = document.querySelector(sel); if (!c) return false;
    return [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0) || [...c.querySelectorAll('.js-plotly-plot')].some(p => (p.data?.length ?? 0) > 0);
  }, `.card[data-id="${id}"]`, { timeout: T });
  return signature(page, id);
}
async function redrawn(page, id, before) {
  await page.waitForFunction(async ([sel, b]) => {
    const c = document.querySelector(sel); if (!c || c.querySelector('.card-status')?.dataset.state !== 'current') return false;
    if (/Loading figure/.test(c.innerText)) return false;
    const img = c.querySelector('.body img');
    if (img) return img.complete && img.naturalWidth > 0 && `img:${img.getAttribute('src')}:${img.naturalWidth}x${img.naturalHeight}` !== b;
    const p = c.querySelector('.js-plotly-plot');
    return !!(p && p.data?.length) && 'plotly:' + JSON.stringify([p.data.map(t => [t.type, t.marker?.size, t.marker?.color, (t.x || []).length, t.name]), p.layout?.title, p._fullLayout?.width, p._fullLayout?.height]) !== b;
  }, [`.card[data-id="${id}"]`, before], { timeout: T });
  return signature(page, id);
}
// The API path of a card's renders. The instance id (tcinstance_…) is not the card's data-id; the audit keeps one
// card on the canvas while it renders, so the only instance rendered is that card's.
function cardPathOf(page, id) {
  const all = [...page.cardPaths], own = all.filter(p => p.includes(id));
  return own[0] || (all.length === 1 ? all[0] : null);
}
// sha256 of the bytes the card's image shows (fetched from its src, as the browser has it).
const imgHash = (page, id) => card(page, id).evaluate(async c => {
  const img = c.querySelector('.body img'); if (!img) return null;
  const b = await (await fetch(img.src)).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
});
// After a resize: the card is current, not "Loading figure…", and shows new content at the new size: for png a new
// image whose natural size has the aspect of the size Nexo last requested and whose bytes differ; for plotly the
// layout width/height changed.
// fixedHeight: the module sets the image height itself (outlierPlot: max(400, 20 per sample),
// R/modules/2_qc_boxplot_module.R:1144-1154), so only the width follows the card.
let FIXED_HEIGHT = false, LAST_OVER = '', LAST_DRAG = '';
// Round 2: what the card shows BEFORE the drag (image bytes, Plotly layout size). Round 1 measured it after the drag,
// when a live card has already gone frozen→live and emptied its body (canvas.ts:177, cards.ts:357-359): no Plotly div
// ("Cannot read properties of null (reading '_fullLayout')"), or the new image hashed as the "previous" one.
const plotSize = (page, id) => card(page, id).evaluate(c => { const l = c.querySelector('.js-plotly-plot')?._fullLayout; return l ? [l.width, l.height] : null; });
async function preResize(page, id) { return { hash: await imgHash(page, id), size: await plotSize(page, id) }; }
async function resized(page, id, before, pre) {
  const cardPath = () => cardPathOf(page, id);
  const prevHash = before?.startsWith('img:') ? pre.hash : null;
  const prevSize = before?.startsWith('plotly:') ? pre.size : null;
  ok(!before?.startsWith('plotly:') || prevSize, 'no Plotly layout before the drag');
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 >= T) {
      // round 2: say what the card was when it gave up (size of the node, last render asked, what the body shows)
      const d = await card(page, id).evaluate(c => { const i = c.querySelector('.body img'); return { node: [c.offsetWidth, c.offsetHeight], img: i ? [i.naturalWidth, i.naturalHeight] : null, state: c.querySelector('.card-status')?.dataset.state, resizeSize: c.dataset.resizeSize || null }; }).catch(e => String(e));
      ok(false, `no redraw at the new size: ${JSON.stringify(d)}, pointer at the handle hit ${LAST_DRAG}, last render request ${JSON.stringify(page.renders.get(cardPath()) || null)}, hash unchanged=${prevHash ? (await imgHash(page, id)) === prevHash : 'n/a'}`);
    }
    await page.waitForTimeout(700);
    const st = await card(page, id).evaluate(c => ({ state: c.querySelector('.card-status')?.dataset.state, loading: /Loading figure/.test(c.innerText) }));
    if (st.state !== 'current' || st.loading) continue;
    const sig = await signature(page, id); if (!sig) continue;
    if (prevSize) {
      const sz = await plotSize(page, id);
      if (!sz || (sz[0] === prevSize[0] && sz[1] === prevSize[1])) continue;
      return { sig, detail: `plotly layout ${prevSize.join('x')}→${sz.join('x')}` };
    }
    // The target is the card's own size (Nexo asks for exactly the node's width x height): a size the client already
    // holds (the restore step returns to the first size) is drawn from its render cache with no request, so the last
    // request on the wire is not the size on screen.
    const asked = page.renders.get(cardPath()), [w, h] = sig.match(/:(\d+)x(\d+)$/).slice(1).map(Number);
    const req = await card(page, id).evaluate(c => ({ width: c.offsetWidth, height: c.offsetHeight }));
    const cached = !asked || asked.width !== req.width || asked.height !== req.height;
    if (!req.width || (FIXED_HEIGHT ? Math.abs(w - req.width) > 2 && Math.abs(w / req.width - Math.round(w / req.width)) > 0.02 : Math.abs(w / h - req.width / req.height) > 0.02)) continue;
    const hash = await imgHash(page, id); if (hash === prevHash) continue;
    return { sig, detail: `image ${w}x${h}${FIXED_HEIGHT ? ' (height set by the module)' : ''} for card ${req.width}x${req.height}${cached ? ' (client render cache, no request)' : ''}, sha256 ${hash.slice(0, 10)}… ≠ ${prevHash?.slice(0, 10)}…` };
  }
}
async function shot(page, plot, name, target) {
  const file = path.join(shots, `${plot.out}-r2-${name}.png`);
  await (target || page).screenshot({ path: file });
  return path.relative(root, file);
}
async function tab(page, name) { await page.locator('#inspector').getByRole('tab', { name, exact: true }).click(); }
async function download(page, click) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: T }), click()]);
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
}
const entryOf = plot => CATALOG.find(e => e.id === `qc_pca_tab-${plot.out}`);
const inputOf = (plot, id) => entryOf(plot).inputs.find(i => i.id === id);
// The value the Inspector shows for one control. A radio input carries no value attribute in SchemaForm, so the
// checked input's own label is mapped back to its option value through the catalog options.
async function controlValue(page, plot, id) {
  const insp = page.locator('#inspector');
  const inp = inputOf(plot, id);
  if (inp.type === 'radio') {
    const lbl = await insp.locator(`input[type=radio][name="${id}"]`).evaluateAll(es => es.filter(e => e.checked).map(e => e.closest('label').innerText.trim()));
    ok(lbl.length === 1, `${id}: ${lbl.length} checked radios`);
    const opt = inp.options.find(o => o.label === lbl[0]); ok(opt, `${id}: checked label "${lbl[0]}" is not a catalog option`);
    return opt.value;
  }
  const el = insp.locator(`[id="${id}"]`);
  if (inp.type === 'boolean') return String(await el.isChecked());
  return el.inputValue();
}
async function dataValues(page, plot) {
  await tab(page, 'Data');
  const out = {}; for (const d of plot.data) out[d.id] = await controlValue(page, plot, d.id);
  return JSON.stringify(out);
}
async function setControl(page, plot, id, to) {
  const insp = page.locator('#inspector'), inp = inputOf(plot, id);
  if (inp.type === 'radio') { const opt = inp.options.find(o => o.value === to); await insp.locator('label', { has: page.locator(`input[type=radio][name="${id}"]`), hasText: opt.label }).locator('input').check(); return; }
  const el = insp.locator(`[id="${id}"]`);
  if (inp.type === 'select') { await el.selectOption(to); return; }
  if (inp.type === 'boolean') { await el.setChecked(to === 'true'); return; }
  await el.fill(to); await el.press('Enter').catch(() => {}); await el.blur();
}

async function audit(browser, plot) {
  ERRORS = []; API_LOG = []; FIXED_HEIGHT = !!plot.fixedHeight;
  let page = await openPage(browser);
  const insp = () => page.locator('#inspector');
  let id, before, label = `Audit ${plot.out}`, saved = null;
  try {
    // 1 Draws: add from the Library, it settles and shows the plot at 100 %; zoomed out it still shows it.
    // Editable vector views: Team refuses them while smart labels are on; record the refusal, then turn smart labels
    // off in the Data tab as a user would (no default is changed).
    await check(plot, 1, 'draws', async () => {
      const notes = [];
      // wave 2: the rail has no "Plots" toggle; the toolbar's "+ Add plot" opens the Library (Toolbar.tsx:47)
      await page.getByRole('button', { name: '+ Add plot', exact: true }).click();
      await page.locator('button.library-add').first().waitFor({ state: 'attached', timeout: T });
      await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
      await page.locator(`button.library-add[aria-label="Add ${plot.label}"]`).first().click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length > 0, null, { timeout: T });
      id = (await ids(page))[0];
      await settled(page, id, ['current', 'error', 'failed']);
      // close the Library (wave 1: it floats over the left of the canvas) only if it is still open; a toggle click
      // on a Library that already closed would reopen it over the card
      if (await page.getByRole('complementary', { name: 'Library' }).isVisible().catch(() => false)) await page.getByRole('button', { name: 'Close library', exact: true }).click();
      let st = await stateOf(page, id);
      if (st !== 'current' && plot.smart) {
        const msg = (await card(page, id).innerText()).replace(/\s+/g, ' ');
        ok(/disable smart labels/i.test(msg), `card state ${st}: ${msg.slice(0, 200)}`);
        await select(page, id);
        notes.push(`refused on arrival (Team): "${msg.match(/Editable vector view unavailable[^.]*\.[^.]*\./)?.[0] || msg.slice(0, 160)}" ${await shot(page, plot, '1-refusal')}`);
        await tab(page, 'Data');
        // what the Inspector shows vs what the card's live schema says (the render refused, so the instance has it on)
        const shown = await page.locator(`#inspector [id="${plot.smart}"]`).isChecked();
        const schemaVal = await page.evaluate(async ([p, k]) => { const r = await fetch(`/api/v1${p}/schema`); if (!r.ok) return `schema ${r.status}`; const j = await r.json(); const c = (j.controls || []).find(x => x.id === k); return c ? JSON.stringify({ value: c.value, default: c.default }) : 'not in schema'; }, [cardPathOf(page, id), plot.smart]).catch(e => String(e));
        notes.push(`before the change the Inspector shows ${plot.smart} ${shown ? 'on' : 'off'}; card schema ${schemaVal}`);
        if (!shown) {
          // shown off while the module draws repelled labels: the user turns it on and off again, which sends the value
          await page.locator(`#inspector [id="${plot.smart}"]`).setChecked(true);
          await settled(page, id, ['current', 'error', 'failed']).catch(() => {});
          await page.waitForTimeout(1500);
        }
        await setControl(page, plot, plot.smart, 'false');
        await page.waitForTimeout(1500);
        await settled(page, id, ['current', 'error', 'failed']);
        notes.push(`API: ${API_LOG.filter(l => /^PATCH/.test(l)).map(l => l.slice(0, 220)).join(' | ') || 'no PATCH sent'}`);
        st = await stateOf(page, id);
        notes.push(`${plot.smart} turned off in the Data tab → ${st}`);
      }
      ok(st === 'current', `card state ${st}: ${(await card(page, id).innerText()).replace(/\s+/g, ' ').slice(0, 160)} || ${notes.join('; ').slice(0, 900)}`);
      await select(page, id);
      const zFocus = await zoomPct(page);
      await page.locator('.zoom-pill').getByRole('button', { name: '100%', exact: true }).click().catch(() => {});
      before = await drawn(page, id);
      notes.push(`click-to-focus at ${zFocus}, then 100 % reads ${await zoomPct(page)}`);
      ok(before, 'nothing drawn');
      ok(!/Couldn.t bring back/.test(await card(page, id).innerText()), 'card says Couldn\'t bring back');
      const s1 = await shot(page, plot, '1-draws');
      for (let i = 0; i < 4; i++) await page.locator('.zoom-pill').getByRole('button', { name: /^(−|-|Zoom out)$/ }).first().click();
      await page.waitForTimeout(1500);
      const zOut = await zoomPct(page);
      const zoomed = await card(page, id).evaluate(c => ({ tier: c.dataset.tier, img: [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0), plot: [...c.querySelectorAll('.js-plotly-plot')].some(p => p.data?.length) }));
      ok(zoomed.img || zoomed.plot, `zoomed out the card shows nothing (tier ${zoomed.tier})`);
      const s2 = await shot(page, plot, '1-zoomed-out');
      await select(page, id); before = await signature(page, id);
      return `${notes.join('; ')}${notes.length ? '; ' : ''}${s1}, ${s2}; zoomed out to ${zOut} tier=${zoomed.tier} ${zoomed.img ? 'image' : 'plotly'}`;
    });
    if (!id || (await stateOf(page, id)) !== 'current') return;

    // 2 Matches Team: inputs at catalog defaults, and the same content as the module's own render with the same
    // inputs and size (png: sha256 of the bytes; plotly: trace types, counts and x/y rounded to 6 digits).
    await check(plot, 2, 'matches-team', async () => {
      const entry = entryOf(plot);
      ok(entry && entry.render === plot.render, `catalog render ${entry?.render}`);
      await select(page, id); await tab(page, 'Data');
      // `live`: a default the module itself moves once data is loaded (outlierNumShow: updateSliderInput to
      // min(30, samples), R/modules/2_qc_boxplot_module.R:1110); any other value must be the catalog default.
      for (const d of plot.data) { const v = await controlValue(page, plot, d.id), want = d.live ?? entry.defaults[d.id]; ok(String(v) === String(want), `inspector ${d.id}=${v}, expected ${want} (catalog default ${entry.defaults[d.id]})`); }
      if (plot.smart) ok(await controlValue(page, plot, plot.smart) === 'false', `${plot.smart} not off`);
      const cardPath = cardPathOf(page, id);
      ok(cardPath, 'no render request seen for the card');
      const body = page.renders.get(cardPath);
      const own = await page.evaluate(async ([p, b]) => {
        const r = await fetch(`/api/v1${p}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
        if (!r.ok) return { status: r.status, text: (await r.text()).slice(0, 200) };
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('image')) { const a = await r.arrayBuffer(); return { status: r.status, bytes: a.byteLength, sha: [...new Uint8Array(await crypto.subtle.digest('SHA-256', a))].map(x => x.toString(16).padStart(2, '0')).join('') }; }
        const j = await r.json();
        if (j.url || j.image) { const a = await (await fetch(j.url || j.image)).arrayBuffer(); return { status: r.status, bytes: a.byteLength, sha: [...new Uint8Array(await crypto.subtle.digest('SHA-256', a))].map(x => x.toString(16).padStart(2, '0')).join('') }; }
        const fig = j.figure || j; const R = v => Array.isArray(v) ? v.map(R) : typeof v === 'number' ? +v.toPrecision(6) : v;
        // the module's figure drawn by plain Plotly in a bare div of the requested size, outside any card, so its
        // framing (3D scene clipping) can be told apart from the card's container or the canvas zoom
        if (window.Plotly && b.width && b.height) {
          const d = document.createElement('div'); d.id = 'audit-bare'; d.style.cssText = `position:fixed;left:0;top:0;width:${b.width}px;height:${b.height}px;z-index:99999;background:#fff`;
          document.body.append(d);
          await window.Plotly.newPlot(d, fig.data, { ...(fig.layout || {}), width: b.width, height: b.height }, { displayModeBar: false });
          // round 2: staticPlot drew no WebGL scene (pca3dPlot-r1/r2 bare was empty); give the gl scene time to paint
          await new Promise(r => setTimeout(r, 1500));
        }
        return { status: r.status, traces: JSON.stringify((fig.data || []).map(t => [t.type, R(t.x), R(t.y), R(t.z)])), n: (fig.data || []).length, keys: Object.keys(j).slice(0, 8) };
      }, [cardPath, body]);
      ok(own.status === 200, `module render ${own.status} ${own.text || ''}`);
      let bare = '';
      if (await page.locator('#audit-bare').count()) {
        await page.waitForTimeout(800);
        const f = `${plot.out}-r2-2-api-bare.png`;
        await page.locator('#audit-bare').screenshot({ path: path.join(shots, f) });
        // round 2: remove the bare div first; it sits at 0,0 above the card and covered its left part in round 1's capture
        await page.evaluate(() => { const d = document.getElementById('audit-bare'); if (d) { window.Plotly.purge(d); d.remove(); } });
        await page.waitForTimeout(400);
        await shot(page, plot, '2-card-same-size', card(page, id));
        bare = `; module figure in a bare ${body.width}x${body.height} div: ${f}`;
      }
      if (plot.render === 'png') {
        const mine = await imgHash(page, id);
        ok(own.sha, `module render returned no image (${JSON.stringify(own).slice(0, 120)})`);
        ok(own.sha === mine, `bytes differ: module ${own.sha.slice(0, 12)}… vs card ${mine?.slice(0, 12)}…`);
        return `same render body ${JSON.stringify({ width: body.width, height: body.height })}: sha256 ${mine.slice(0, 16)}… identical (${own.bytes} B)`;
      }
      const mine = await card(page, id).evaluate(c => { const R = v => Array.isArray(v) ? v.map(R) : typeof v === 'number' ? +v.toPrecision(6) : v; const p = c.querySelector('.js-plotly-plot'); return JSON.stringify(p.data.map(t => [t.type, R(t.x), R(t.y), R(t.z)])); });
      ok(own.traces === mine, `traces differ (module ${own.traces.length} chars vs card ${mine.length})`);
      return `same ${own.n} traces, types and x/y/z (rounded to 6 significant digits) as the module render with the same body${bare}`;
    });

    // 3 Size: larger, smaller, and the 240x220 minimum: each redraws at the new size, nothing overflows.
    await check(plot, 3, 'size', async () => {
      await select(page, id);
      const handle = card(page, id).locator('.resize-handle');
      // dx/dy in card units (CSS px of the card), converted at the zoom the camera has once click-to-focus has
      // settled: screen px per card px = the card's on-screen width / its offsetWidth. Click-to-focus zooms the camera
      // differently for a large and a minimum card, so screen-pixel drags do not map back to the first size.
      const drag = async (dx, dy) => {
        await page.waitForTimeout(600);
        // click-to-focus can leave a tall card's handle below the viewport: zoom out until the handle is on screen
        for (let i = 0; i < 6; i++) {
          const h = await handle.boundingBox(), vp = await page.evaluate(() => document.querySelector('#viewport').getBoundingClientRect().toJSON());
          if (h && h.y + h.height < vp.bottom - 8 && h.x + h.width < vp.right - 8 && h.y > vp.top) break;
          await page.locator('.zoom-pill').getByRole('button', { name: /^(−|-|Zoom out)$/ }).first().click(); await page.waitForTimeout(700);
        }
        const k = await card(page, id).evaluate(c => c.getBoundingClientRect().width / c.offsetWidth);
        const b = await handle.boundingBox(); ok(b, 'no resize handle');
        // round 2: what the pointer actually lands on at the handle's centre (png cards did not resize in run 3)
        LAST_DRAG = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${String(e.className.baseVal ?? e.className).split(' ')[0]}` : 'nothing'; }, [b.x + b.width / 2, b.y + b.height / 2]);
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2 + dx * k, b.y + b.height / 2 + dy * k, { steps: 8 }); await page.mouse.up();
        return k;
      };
      // round 2: the elements that overflow, with their rects and the body's (in card px), so a FAIL says by how much
      const over = () => card(page, id).evaluate(c => { const b = c.querySelector('.body'); const r = b.getBoundingClientRect(), k = c.getBoundingClientRect().width / c.offsetWidth; const px = q => [q.width, q.height, q.right - r.left, q.bottom - r.top].map(v => Math.round(v / k)); return { body: px(r), out: [...b.querySelectorAll('img,.js-plotly-plot,svg.main-svg')].filter(e => { const q = e.getBoundingClientRect(); return q.right > r.right + 2 || q.bottom > r.bottom + 2; }).map(e => [e.tagName + '.' + String(e.className.baseVal ?? e.className).split(' ')[0], ...px(e.getBoundingClientRect())]) }; });
      const overflow = async () => { const o = await over(); LAST_OVER = JSON.stringify(o); return o.out.length; };
      const node = () => page.evaluate(i => { const c = document.querySelector(`.card[data-id="${i}"]`); return [c.offsetWidth, c.offsetHeight]; }, id);
      const n0 = await node();
      let pre = await preResize(page, id); await drag(160, 60); const big = await resized(page, id, before, pre);
      const n1 = await node(); ok(n1[0] > n0[0] + 50, `card did not grow (${n0}→${n1})`);
      ok(await overflow() === 0, `overflow when larger: ${LAST_OVER}`);
      const s1 = await shot(page, plot, '3-larger');
      await select(page, id); pre = await preResize(page, id); await drag(-330, -260); const small = await resized(page, id, big.sig, pre);
      const n2 = await node(); ok(n2[0] < n1[0] - 100, `card did not shrink (${n1}→${n2})`);
      ok(await overflow() === 0, `overflow when smaller: ${LAST_OVER}`);
      const s2 = await shot(page, plot, '3-smaller');
      await select(page, id); pre = await preResize(page, id); await drag(-2000, -2000); const min = await resized(page, id, small.sig, pre);
      const n3 = await node(); ok(n3[0] === 240 && n3[1] === 220, `minimum card ${n3}, expected 240x220`);
      ok(await overflow() === 0, `overflow at the minimum: ${LAST_OVER}`);
      const s3 = await shot(page, plot, '3-minimum', card(page, id));
      await select(page, id); pre = await preResize(page, id); const k = await drag(n0[0] - n3[0], n0[1] - n3[1]); const back = await resized(page, id, min.sig, pre);
      const n4 = await node(); ok(Math.abs(n4[0] - n0[0]) <= 4 && Math.abs(n4[1] - n0[1]) <= 4, `restore: card ${n4}, first size ${n0} (zoom factor ${k.toFixed(3)})`);
      before = back.sig;
      return `${n0.join('x')}→${n1.join('x')}→${n2.join('x')}→${n3.join('x')} (minimum)→${n4.join('x')} (restored through the handle at zoom factor ${k.toFixed(3)}); larger: ${big.detail}; smaller: ${small.detail}; minimum: ${min.detail}; ${s1}, ${s2}, ${s3}`;
    });

    // 4 Data tab: catalog controls present; each audited control changed redraws; invalid refused; keyboard reach.
    await check(plot, 4, 'data-tab', async () => {
      await select(page, id); await tab(page, 'Data');
      const entry = entryOf(plot);
      const present = await insp().locator('[role=tabpanel]').evaluate((p, want) => want.filter(w => w.type === 'tabs'
        ? !w.options.every(o => p.innerText.includes(o.label))
        : !p.querySelector(`[id="${w.id}"], [name="${w.id}"]`)).map(w => w.id), entry.inputs);
      ok(present.length === 0, `catalog controls missing from the Inspector: ${present.join(', ')}`);
      const notes = [];
      for (const d of plot.data) {
        const from = await controlValue(page, plot, d.id);
        await setControl(page, plot, d.id, d.to);
        const sig = await redrawn(page, id, before);
        ok(String(await controlValue(page, plot, d.id)) === d.to, `${d.id} did not take ${d.to}`);
        notes.push(`${d.id} ${from}→${d.to} redrew (${await shot(page, plot, `4-data-${d.id}`)})`);
        before = sig;
        if (d.bad) {
          await setControl(page, plot, d.id, d.bad); await page.waitForTimeout(2500);
          const msg = (await page.locator('#inspector [role=alert], #inspector .field-error, #inspector [aria-invalid=true], .toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
          const st = await stateOf(page, id);
          ok(msg.length > 0, `invalid ${d.bad} accepted silently (state ${st})`);
          notes.push(`invalid ${d.id}=${d.bad} refused: state=${st}, "${msg.slice(0, 140)}" (${await shot(page, plot, '4-data-invalid')})`);
          await setControl(page, plot, d.id, d.to); await settled(page, id); await page.waitForTimeout(1500);
          before = await signature(page, id);
        }
      }
      // Keyboard: Tab from the Data tab button reaches every audited control.
      await insp().getByRole('tab', { name: 'Data', exact: true }).focus();
      const want = new Set(plot.data.map(d => d.id).concat(plot.smart ? [plot.smart] : []));
      const reached = new Set();
      for (let i = 0; i < 160 && reached.size < want.size; i++) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => { const e = document.activeElement; return e ? e.id || e.name : null; });
        if (want.has(f)) reached.add(f);
      }
      ok(reached.size === want.size, `keyboard did not reach: ${[...want].filter(w => !reached.has(w)).join(', ')}`);
      notes.push(`keyboard (Tab) reaches ${[...reached].join(', ')}`);
      // Round 2 (Astra): wave 2 offers the module's action buttons (schema actionControls, frontends/nexo-api/schema.R:140-145)
      // and the computed per-group colour/shape controls (customCol_/customShape_, schema.R:146-150) in the Data tab.
      const sch = await page.evaluate(async p => { const r = await fetch(`/api/v1${p}/schema`); return r.ok ? r.json() : { status: r.status }; }, cardPathOf(page, id));
      const acts = (sch.actionControls || []).map(a => a.label);
      const panelButtons = await insp().locator('[role=tabpanel] button').allInnerTexts();
      const missingActs = acts.filter(a => !panelButtons.some(b => b.trim() === a.trim()));
      ok(missingActs.length === 0, `module actions missing from the Data tab: ${missingActs.join(', ')}`);
      notes.push(`module actions in the Data tab: ${acts.join(' / ') || 'none in the schema'}`);
      const comp = (sch.controls || []).filter(c => c.computed).map(c => c.id);
      const colours = await insp().locator('input[type=color][aria-label^="Colour for "]').count(), shapes = await insp().locator('select[aria-label^="Shape for "]').count();
      ok(comp.filter(c => /^customCol_/.test(c)).length <= colours, `computed colour controls ${comp.join(',')} vs ${colours} colour inputs shown`);
      notes.push(`computed controls in the schema: ${comp.join(', ') || 'none'}; shown: ${colours} group colour(s), ${shapes} shape select(s)`);
      // `custom`: the per-group colour controls exist only once the user ticks Use custom colors (customColorUI,
      // R/modules/2_qc_boxplot_module.R:808-818): tick it, the group colours appear (computed customCol_*), one changed redraws
      if (plot.custom) {
        const before4 = await signature(page, id);
        await setControl(page, plot, 'useCustomColors', 'true'); await page.waitForTimeout(1500); await settled(page, id);
        const colour = insp().locator('input[type=color][aria-label^="Colour for "]');
        await colour.first().waitFor({ state: 'attached', timeout: T });
        const n = await colour.count(), groups = await colour.evaluateAll(es => es.map(e => e.getAttribute('aria-label')));
        const sch2 = await page.evaluate(async p => { const r = await fetch(`/api/v1${p}/schema`); return r.ok ? r.json() : {}; }, cardPathOf(page, id));
        const cols = (sch2.controls || []).filter(c => c.computed && /^customCol_/.test(c.id)).map(c => c.id);
        ok(n > 0 && cols.length === n, `custom colours: ${n} inputs vs schema ${cols.join(',')}`);
        await colour.first().fill('#00aa00'); await colour.first().dispatchEvent('change'); await colour.first().blur();
        const sigC = await redrawn(page, id, before4);
        notes.push(`Use custom colors on: ${groups.join(' / ')} (schema ${cols.join(', ')}); first group → #00aa00 redrew (${await shot(page, plot, '4-data-custom-colour')})`);
        before = sigC;
      }
      // Dynamic controls the module renders (guided_qc_sample, renderUI): where they appear and whether they work.
      const dyn = await page.evaluate(() => [...document.querySelectorAll('label,select')].filter(e => /Choose a sample/.test(e.textContent || '')).map(e => { const sel = e.tagName === 'SELECT' ? e : document.getElementById(e.htmlFor) || e.parentElement.querySelector('select'); return { where: e.closest('#inspector') ? 'inspector:' + (e.closest('fieldset')?.querySelector('legend')?.textContent || 'no group') : e.closest('.card') ? 'card' : 'page', id: sel?.id, options: sel?.options ? sel.options.length : 0 }; }));
      if (dyn.length) notes.push(`dynamic "Choose a sample (keyboard accessible)": ${JSON.stringify(dyn[0])}`);
      return `${entry.inputs.length} catalog controls present; ${notes.join('; ')}`;
    });

    // 5 Appearance tab.
    await check(plot, 5, 'appearance', async () => {
      await select(page, id); await tab(page, 'Appearance');
      const notes = [];
      const lbl = insp().getByLabel('Label', { exact: true });
      await lbl.fill(label); await lbl.blur();
      await page.waitForFunction(([sel, t]) => document.querySelector(sel + ' .card-title')?.textContent === t, [`.card[data-id="${id}"]`, label], { timeout: 10000 });
      notes.push('Label renames the card');
      const bg = insp().getByLabel('Background', { exact: true });
      await bg.fill('#fff4e0'); await page.waitForTimeout(500);
      const bgc = await card(page, id).evaluate(c => [getComputedStyle(c).backgroundColor, getComputedStyle(c.querySelector('.body')).backgroundColor].join('/'));
      ok(/255, 244, 224/.test(bgc), `background not applied: ${bgc}`);
      notes.push(`card Background → ${bgc}`);
      if (plot.render === 'plotly') {
        // wave 2 nests a details.plot-editor (colour-blind check, ColourBlindCheck.tsx:24) inside the editor div
        const ed = insp().locator('div.plot-editor');
        ok(await ed.count(), 'no plot editor for a Plotly plot');
        await ed.evaluate(e => e.querySelectorAll('details').forEach(d => { d.open = true; }));
        const L = () => card(page, id).evaluate(c => { const p = c.querySelector('.js-plotly-plot'); const l = p._fullLayout; return { title: l.title?.text, size: l.font.size, color: l.font.color, plot: l.plot_bgcolor, scene: l.scene?.bgcolor, legend: l.legend?.x, colors: JSON.stringify(p.data.map(t => t.marker?.color)), names: p.data.map(t => t.name) }; });
        const t = ed.getByLabel('Plot title', { exact: true });
        await t.fill('Audit title'); await t.blur();
        await page.waitForFunction(sel => document.querySelector(sel + ' .js-plotly-plot')?._fullLayout?.title?.text === 'Audit title', `.card[data-id="${id}"]`, { timeout: 10000 });
        // F3 (8c1569b): the chart font size is "Base size" in the Typography section (layout font.size via applyEditor)
        for (const [f, v] of [['Base size', '16'], ['Chart text color', '#aa0000'], ['Plot background', '#f0f0ff']]) { const c = ed.getByLabel(f, { exact: true }); ok(await c.count(), `NO ${f}`); await c.fill(v); await c.blur(); }
        await page.waitForTimeout(1000);
        let l = await L();
        ok(l.size === 16, `font size not on the plot (${l.size})`);
        ok(/aa0000|170, 0, 0/i.test(l.color), `font colour not on the plot (${l.color})`);
        const is3d = await card(page, id).evaluate(c => c.querySelector('.js-plotly-plot').data.some(t => /3d$|mesh|surface/.test(t.type)));
        if (is3d) ok(/f0f0ff|240, 240, 255/i.test(l.scene || ''), `3D scene background not applied (scene.bgcolor ${l.scene})`);
        else ok(/f0f0ff|240, 240, 255/i.test(l.plot || ''), `plot background not applied (${l.plot})`);
        notes.push(`title, font 16 ${l.color}, plot background → ${is3d ? 'scene.bgcolor ' + l.scene : 'plot_bgcolor ' + l.plot}`);
        const pal = ed.getByRole('group', { name: 'Color palette', exact: true }).getByRole('button');
        const nPal = await pal.count(); ok(nPal === 6, `${nPal} palettes, expected 6`);
        const colors = [];
        for (let i = 0; i < nPal; i++) { await pal.nth(i).click(); await page.waitForTimeout(400); colors.push((await L()).colors); }
        ok(new Set(colors).size > 1, 'palettes do not change the plot');
        notes.push(`${nPal} palettes, ${new Set(colors).size} distinct colourings`);
        // Undo/Redo of the editor: undo the last palette, the trace colours go back to the previous palette's.
        const undo = ed.getByRole('button', { name: 'Undo', exact: true }), redo = ed.getByRole('button', { name: 'Redo', exact: true });
        await undo.click(); await page.waitForTimeout(500);
        const undone = (await L()).colors; ok(undone === colors[nPal - 2], `Undo did not restore the previous colours (${undone.slice(0, 60)} vs ${colors[nPal - 2].slice(0, 60)})`);
        await redo.click(); await page.waitForTimeout(500);
        ok((await L()).colors === colors[nPal - 1], 'Redo did not re-apply the last palette');
        notes.push('editor Undo restores the previous palette colours, Redo re-applies');
        const grey = ed.getByLabel('Healthy in grey', { exact: true });
        if (await grey.count()) {
          const names = (await L()).names, healthy = names.findIndex(n => /^healthy/i.test(n || ''));
          const c0 = (await L()).colors; await grey.check(); await page.waitForTimeout(500); const c1 = (await L()).colors;
          if (healthy < 0) { ok(c1 === c0, 'Healthy in grey changed colours with no Healthy group'); notes.push(`Healthy in grey: N/A on this checkpoint (groups ${[...new Set(names)].join('/')}, no Healthy group; colours unchanged)`); }
          else { ok(/7a7a7a/i.test(JSON.stringify(JSON.parse(c1)[healthy])), 'Healthy trace not grey'); notes.push('Healthy trace turns #7A7A7A'); }
          await grey.uncheck();
        }
        const leg = ed.getByRole('group', { name: 'Legend position', exact: true }).getByRole('button', { name: 'Top Left', exact: true });
        if (await leg.count()) { await leg.click(); await page.waitForTimeout(400); l = await L(); ok(l.legend === 0, 'legend position not applied'); notes.push('legend Top Left → x=0'); }
        const grid = ed.getByLabel('Horizontal grid lines', { exact: true });
        notes.push(await grid.count() ? 'grid toggle present' : 'no grid toggle (3D axes carry their own grids)');
        const orient = ed.getByRole('button', { name: 'Change orientation', exact: true });
        notes.push(`orientation ${await orient.isDisabled() ? 'disabled' : 'enabled'}`);
        notes.push(await shot(page, plot, '5-appearance'));
        // Clipping check: scene/plot area inside the plot div.
        const clip = await card(page, id).evaluate(c => { const p = c.querySelector('.js-plotly-plot'), l = p._fullLayout; return { w: l.width, h: l.height, margin: l.margin, scene: l.scene?.domain, div: [p.clientWidth, p.clientHeight] }; });
        notes.push(`layout ${clip.w}x${clip.h} in div ${clip.div.join('x')}, margin ${JSON.stringify(clip.margin)}${clip.scene ? ', scene domain ' + JSON.stringify(clip.scene) : ''}`);
        await ed.getByRole('button', { name: 'Reset presentation', exact: true }).click();
        await ed.getByRole('button', { name: 'Reset all', exact: true }).click();
        await page.waitForTimeout(800);
        ok((await L()).title !== 'Audit title', 'Reset did not restore the title');
        notes.push('Reset restores the title');
      } else {
        notes.push(`image plot: ${await insp().locator('[role=tabpanel] :is(input,select,button)').count()} controls (Label, Background)`);
        notes.push(await shot(page, plot, '5-appearance'));
      }
      await page.getByRole('button', { name: /^↶ Undo$/ }).click(); await page.waitForTimeout(500);
      const undone = await card(page, id).locator('.card-title').textContent();
      await page.getByRole('button', { name: /^↷ Redo$/ }).click(); await page.waitForTimeout(500);
      const redone = await card(page, id).locator('.card-title').textContent();
      notes.push(`canvas Undo → "${undone}", Redo → "${redone}"`);
      if (redone !== label) { await insp().getByLabel('Label', { exact: true }).fill(label); await insp().getByLabel('Label', { exact: true }).blur(); }
      before = await signature(page, id);
      return notes.join('; ');
    });

    // 6 Statistics: the violin workflow is not Team's for QC plots.
    await check(plot, 6, 'statistics', async () => {
      await select(page, id); await tab(page, 'Statistics');
      const t = (await insp().locator('[role=tabpanel]').innerText()).replace(/\s+/g, ' ').trim();
      ok(!(await insp().getByRole('button', { name: /Review and confirm/ }).count()), 'statistics offered for a QC plot');
      return { na: `no violin statistics for this plot; tab says "${t.slice(-80)}"` };
    });

    // 7 Export.
    await check(plot, 7, 'export', async () => {
      await select(page, id); await tab(page, 'Export');
      const notes = [];
      const png = await download(page, () => insp().getByRole('button', { name: 'Download PNG', exact: true }).click());
      ok(png.bytes.subarray(1, 4).toString() === 'PNG', 'PNG is not a PNG'); notes.push(`PNG ${png.bytes.length} B`);
      await page.waitForFunction(() => document.querySelector('#inspector [aria-busy]')?.getAttribute('aria-busy') !== 'true', null, { timeout: T });
      const svgB = insp().getByRole('button', { name: 'Download SVG', exact: true });
      // the reason is the button's title or, since wave 2, the paragraph it points to with aria-describedby (ExportTab.tsx)
      if (await svgB.isDisabled()) { const why = (await svgB.getAttribute('title')) || await svgB.evaluate(b => { const d = b.getAttribute('aria-describedby'); return d ? document.getElementById(d)?.textContent?.trim() || '' : ''; }); ok(why, 'SVG disabled with no reason'); notes.push(`SVG disabled: "${why}"`); }
      else { const svg = await download(page, () => svgB.click()); ok(/<svg/.test(svg.bytes.toString('utf8', 0, 4000)), 'SVG has no <svg'); notes.push(`SVG ${svg.bytes.length} B`); }
      const more = insp().getByRole('group', { name: 'More downloads from this analysis', exact: true });
      if (await more.count()) for (const b of await more.getByRole('button').allTextContents()) {
        await page.waitForFunction(() => document.querySelector('#inspector [aria-busy]')?.getAttribute('aria-busy') !== 'true', null, { timeout: T });
        const f = await download(page, () => more.getByRole('button', { name: b, exact: true }).click());
        ok(f.bytes.length > 100, `${b} is empty`); if (b === 'PDF') ok(f.bytes.subarray(0, 4).toString('latin1') === '%PDF', 'PDF is not a PDF');
        notes.push(`Team ${b} ${f.name} ${f.bytes.length} B`);
      }
      await insp().getByRole('button', { name: 'More export options…', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Export', exact: true }); await dialog.waitFor();
      const pdfBox = dialog.getByRole('button', { name: 'Download PDF', exact: true });
      notes.push(await pdfBox.count() ? 'card PDF offered' : `no card PDF in the dialog (buttons: ${(await dialog.getByRole('button').allTextContents()).join('/')})`);
      notes.push(await shot(page, plot, '7-export-dialog'));
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      return notes.join('; ');
    });

    // 8 Finish.
    await check(plot, 8, 'finish', async () => {
      await select(page, id);
      await insp().getByRole('button', { name: 'Finish plot', exact: true }).click();
      await settled(page, id, ['finished']);
      const snap = await card(page, id).evaluate(c => { const i = c.querySelector('.body img'); return i ? { w: i.naturalWidth, h: i.naturalHeight } : null; });
      ok(snap && snap.w > 0, 'no snapshot image');
      const s1 = await shot(page, plot, '8-finished');
      await insp().getByRole('button', { name: 'Edit figure', exact: true }).click();
      await settled(page, id, ['current']);
      before = await drawn(page, id);
      ok(plot.render === 'png' ? before.startsWith('img:') : before.startsWith('plotly:'), `after Edit figure the card shows ${before.slice(0, 20)}`);
      return `snapshot ${snap.w}x${snap.h}; Edit figure → live ${plot.render}; ${s1}`;
    });

    // 9 Duplicate keeps inputs and appearance; remove + Undo restores.
    await check(plot, 9, 'duplicate-remove-undo', async () => {
      await select(page, id);
      const v0 = await dataValues(page, plot), bg0 = await card(page, id).evaluate(c => getComputedStyle(c).backgroundColor);
      // wave 1 cards have no footer (frontends/nexo/src/cards.ts:3): Duplicate is in the ⋯ menu (cards.ts:150)
      await card(page, id).getByRole('button', { name: 'More card actions' }).click();
      await card(page, id).locator('.card-menu').getByRole('button', { name: 'Duplicate', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 2, null, { timeout: T });
      const dup = (await ids(page)).find(x => x !== id);
      await settled(page, dup); await drawn(page, dup);
      const dupTitle = await card(page, dup).locator('.card-title').textContent();
      const bg1 = await card(page, dup).evaluate(c => getComputedStyle(c).backgroundColor);
      await select(page, dup);
      const v1 = await dataValues(page, plot);
      // `live` controls are moved by the module itself on a new instance (outlierNumShow: the observer at
      // R/modules/2_qc_boxplot_module.R:1107-1111 resets it to min(30, samples) when outlierScores() is first computed)
      const strip = v => { const o = JSON.parse(v); for (const d of plot.data) if (d.live) delete o[d.id]; return JSON.stringify(o); };
      const moved = v1 !== v0 ? ` (module reset: duplicate ${v1} vs original ${v0})` : '';
      ok(strip(v1) === strip(v0), `duplicate ${v1}, original ${v0}`); ok(dupTitle.startsWith(label), `duplicate title "${dupTitle}"`); ok(bg1 === bg0, `duplicate background ${bg1} vs ${bg0}`);
      const s1 = await shot(page, plot, '9-duplicate');
      for (const again of [true, false]) {
        await card(page, dup).getByRole('button', { name: 'More card actions' }).click();
        await card(page, dup).locator('.card-menu').getByRole('button', { name: 'Remove', exact: true }).click();
        if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: /^Remove/ }).click();
        await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: 10000 });
        if (!again) break;
        await page.getByRole('button', { name: /^↶ Undo$/ }).click();
        await page.waitForFunction(d => !!document.querySelector(`.card[data-id="${d}"]`), dup, { timeout: 10000 });
        await settled(page, dup); await drawn(page, dup);
      }
      return `duplicate "${dupTitle}" with ${v1}${moved}, background ${bg1}; remove + Undo brought it back drawn; ${s1}`;
    });

    // 10 Save and reopen (and the phone-width read-only check on the reopened checkpoint).
    await check(plot, 10, 'save-reopen', async () => {
      page.setDefaultTimeout(15000);
      // a failed #9 can leave the duplicate: remove every card but the audited one, so the reopen expects one card
      for (const other of (await ids(page)).filter(x => x !== id)) {
        await card(page, other).getByRole('button', { name: 'More card actions' }).click();
        await card(page, other).locator('.card-menu').getByRole('button', { name: 'Remove', exact: true }).click();
        if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: /^Remove/ }).click();
      }
      await select(page, id);
      const v0 = await dataValues(page, plot);
      await page.getByRole('button', { name: 'Export figure ▾', exact: true }).click();
      await page.getByRole('button', { name: 'Save checkpoint…', exact: true }).click();
      const cps = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
      await cps.getByRole('textbox', { name: 'New checkpoint name' }).fill(SAVE);
      await cps.getByRole('button', { name: 'Save current analysis', exact: true }).click();
      await page.locator('.toast', { hasText: `Saved checkpoint ${SAVE}` }).waitFor({ timeout: T });
      saved = new URL(page.url()).searchParams.get('checkpoint');
      ok(/^[a-f0-9]{64}$/.test(saved), `saved id ${saved}`);
      await page.context().close();
      page = await openPage(browser, saved, undefined, 'reopen');
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: T });
      const rid = (await ids(page))[0];
      await settled(page, rid); await drawn(page, rid);
      const title = await card(page, rid).locator('.card-title').textContent();
      const bgc = await card(page, rid).evaluate(c => getComputedStyle(c).backgroundColor);
      await select(page, rid);
      const v1 = await dataValues(page, plot);
      const s1 = await shot(page, plot, '10-reopened');
      ok(title === label, `reopened title "${title}"`); ok(v1 === v0, `reopened ${v1}, saved ${v0}`); ok(/255, 244, 224/.test(bgc), `reopened background ${bgc}`);
      await page.context().close();
      page = await openPage(browser, saved, { width: 375, height: 812 }, 'phone');
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: T });
      await settled(page, (await ids(page))[0]);
      const phone = await page.evaluate(() => {
        const small = [...document.querySelectorAll('body *')].filter(e => !e.closest('#world .card .body') && e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => [e.tagName + '.' + (e.className || '').toString().split(' ')[0], parseFloat(getComputedStyle(e).fontSize), e.textContent.trim().slice(0, 30)]).filter(x => x[1] < 12);
        return { scrollW: document.documentElement.scrollWidth, small: small.slice(0, 5), n: small.length };
      });
      const s2 = await shot(page, plot, '10-phone');
      ok(phone.scrollW <= 375, `sideways scroll at 375 px (scrollWidth ${phone.scrollW})`);
      ok(phone.n === 0, `${phone.n} chrome text element(s) under 12 px: ${JSON.stringify(phone.small)}`);
      return `reopened ${saved.slice(0, 12)}…: "${title}", ${v1}, background kept; ${s1}; phone 375x812: no sideways scroll, chrome text ≥ 12 px (${s2})`;
    });
  } finally {
    const errs = ERRORS.slice();
    // expected refusals: Team's smart-label 422, and the 400 of the invalid value #4 types on purpose (`bad`)
    const refusal = errs.filter(e => (plot.smart && /422/.test(e)) || (plot.data.some(d => d.bad) && /status of 400/.test(e) && /\/cards\/[^/ ]+\s*$/.test(e)));
    const other = errs.filter(e => !refusal.includes(e));
    report(plot, 11, 'console', other.length ? 'FAIL' : 'PASS', `${errs.length} console error(s) on all pages of this plot${refusal.length ? ` (${refusal.length} = expected refusals: Team's smart-label 422 and/or the 400 of #4's invalid value)` : ''}${errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''}`);
    // cleanup from Node through the API (the page may already be closed): every checkpoint named SAVE, and only those
    try {
      const list = await (await fetch(`${base}/api/v1/checkpoints`)).json();
      for (const c of list.filter(c => c.name === SAVE)) {
        const r = await fetch(`${base}/api/v1/checkpoints/${c.id}`, { method: 'DELETE' });
        console.log(`cleanup: deleted ${SAVE} ${c.id.slice(0, 12)}… (${r.status})`);
      }
    } catch (e) { console.log(`cleanup failed: ${e.message}`); }
    await page.context().close().catch(() => {});
  }
}

(async () => {
  const only = process.argv.slice(2);
  CATALOG = (await (await fetch(`${base}/api/v1/catalog`)).json()).outputs;
  const browser = await pw.chromium.launch();
  // written after every plot, so a run stopped part-way keeps the plots it finished
  const save = () => fs.writeFileSync(path.join(shots, `results-round2-${only.join('_') || 'all'}.json`), JSON.stringify(results, null, 1));
  // plots run in the order given on the command line
  try { for (const plot of only.length ? only.map(o => PLOTS.find(p => p.out === o)).filter(Boolean) : PLOTS) { await audit(browser, plot); save(); } }
  finally { await browser.close(); }
  save();
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`${failed ? 'AUDIT FAIL' : 'AUDIT OK'}: ${results.length} checks, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });
