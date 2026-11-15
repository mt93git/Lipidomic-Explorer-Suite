'use strict';
// Chart audit, batch b05-heatmaps (docs/integration/nexo-chart-audit-plan.md): the 11-row checklist per plot plus
// check 12 (Layout), in a real browser against the synthetic-only audit API. Follows audit_b03-qc-b.cjs. Needs the
// batch Vite on :5185 (vite.audit.config.mjs, NEXO_AUDIT_API=http://127.0.0.1:3962) and the API on 127.0.0.1:3962.
// The filtered heatmaps need the differential expression (catalog needs "de"), so the study design is confirmed through
// the Library dialog (unit Animal, independent) as test_nexo_layout_sweep.cjs does. Batch-specific checks: the large
// heatmap cards (1000x1100) must be sharp at 100 % (image pixels >= displayed pixels x devicePixelRatio), and the
// "significant" filters (Analysis settings > Differential Expression thresholds for the filtered heatmaps; the violin's
// "Differential Expression Filtered Lipids" scope and significance bars) must change the plot as in Team.
//   node tests/dual-ui/chart-audit/audit_b05-heatmaps.cjs [outputName ...]
// One page at a time (the API holds two sessions in total). Writes screenshots to docs/integration/chart-audit/b05-heatmaps/.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5185';
const CP = 'nexo-complete-synthetic', SAVE = 'audit-b05-heatmaps-synthetic';
const shots = path.join(root, 'docs/integration/chart-audit/b05-heatmaps');
const T = 180000;
fs.mkdirSync(shots, { recursive: true });

// Per plot: the Library label, how it draws, and one Data control a user changes (with an invalid value when numeric).
const PLOTS = [
  { src: 'heatmap_barchart_tab', out: 'heatmapPlot', label: 'Average signal heatmap', render: 'png', sharp: true, data: { check: 'Hide Row Names', id: 'hideHeatmapRowNames', to: 'true' } },
  { src: 'heatmap_barchart_tab', out: 'heatmapSDPlot', label: 'Signal variability heatmap', render: 'png', sharp: true, data: { check: 'Show Grid', id: 'showHeatmapGrid', to: 'true' } },
  { src: 'heatmap_barchart_tab', out: 'filteredHeatmapPlot', label: 'Filtered average heatmap', render: 'png', sharp: true, gated: true, deFilter: true, data: { check: 'Hide Row Names', id: 'hideHeatmapRowNames', to: 'true' } },
  { src: 'heatmap_barchart_tab', out: 'filteredHeatmapSDPlot', label: 'Filtered variability heatmap', render: 'png', sharp: true, gated: true, deFilter: true, data: { check: 'Show Grid', id: 'showHeatmapGrid', to: 'true' } },
  { src: 'heatmap_barchart_tab', out: 'violin_plot_render', label: 'Selected-feature distributions', render: 'png', sigStats: true, data: { number: 'Significance Alpha Threshold', id: 'violin_sig_threshold', to: '0.01', bad: '-3' },
    sigScope: 'Differential Expression Filtered Lipids (Menu 3 DE)' },
];

// In-page checks. roots: [[name, selector]]; rules: subset of spill/overlap/escape; edge: selector whose right edge bounds controls.
function inspect({ roots, rules, edge }) {
  const shown = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]') ? r : null; };
  const name = el => { const part = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 2).map(c => '.' + c).join('');
    const chain = []; for (let e = el; e && chain.length < 3 && e !== document.body; e = e.parentElement) { chain.unshift(part(e)); if (e.id) break; }
    return chain.join('>'); };
  const text = el => (el.getAttribute('aria-label') || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  // The part of an element left visible by its clipping ancestors (scrolled-out list rows are not on screen).
  const clipped = el => { let r = el.getBoundingClientRect(), b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let a = el.parentElement; a; a = a.parentElement) { const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = a.getBoundingClientRect();
        b = { l: Math.max(b.l, q.left), t: Math.max(b.t, q.top), r: Math.min(b.r, q.right), b: Math.min(b.b, q.bottom) }; } }
    return b.r - b.l > 0 && b.b - b.t > 0 ? b : null; };
  const out = [];
  const edgeEl = edge && document.querySelector(edge), edgeRight = edgeEl ? edgeEl.getBoundingClientRect().right : innerWidth;
  for (const [where, selector] of roots) for (const host of document.querySelectorAll(selector)) {
    if (!shown(host)) continue;
    const all = [host, ...host.querySelectorAll('*')].filter(el => el instanceof HTMLElement && !el.closest('svg,.js-plotly-plot,canvas,.body') && shown(el));
    if (rules.includes('spill')) {
      // Boxes (clientWidth > 0) whose content runs past them unclipped and that hold text; an inline span's spill is
      // carried by its box, so the deepest such box is reported (not every ancestor of it).
      const spilling = all.filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.textContent.trim());
      for (const el of spilling) if (!spilling.some(d => d !== el && el.contains(d))) out.push({ where, rule: 'spill', selector: name(el), text: text(el) });
    }
    const controls = all.filter(el => el.matches('input:not([type=hidden]),select,textarea,button,[role=tab]') || (el.matches('label') && (el.control || el.querySelector('input,select,textarea'))));
    if (rules.includes('overlap')) {
      const boxes = controls.map(el => [el, clipped(el)]).filter(([, b]) => b);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const [a, p] = boxes[i], [b, q] = boxes[j];
        if (a.contains(b) || b.contains(a) || a.control === b || b.control === a) continue;
        const w = Math.min(p.r, q.r) - Math.max(p.l, q.l), h = Math.min(p.b, q.b) - Math.max(p.t, q.t);
        if (w > 2 && h > 2) out.push({ where, rule: 'overlap', selector: name(a) + ' x ' + name(b), text: text(a) + ' | ' + text(b) });
      }
    }
    if (rules.includes('escape')) {
      // Canvas cards pan off screen by design: a card's chrome must stay inside its own card.
      const bound = where === 'card' ? host.closest('.card').getBoundingClientRect().right : edgeRight;
      for (const el of controls) if (el.getBoundingClientRect().right > bound + 1) out.push({ where, rule: 'escape', selector: name(el), text: text(el) });
      if (where === 'inspector' && host.scrollWidth > host.clientWidth + 1) out.push({ where, rule: 'escape', selector: name(host) + ' scrolls sideways', text: `${host.scrollWidth}>${host.clientWidth}` });
    }
  }
  return out;
}

const results = [];
function report(plot, n, name, status, detail = '') {
  results.push({ plot: plot.out, n, name, status, detail });
  console.log(`${status} ${plot.out} #${n} ${name}${detail ? ' — ' + detail : ''}`);
}
async function check(plot, n, name, fn) {
  try { const r = await fn(); if (r && r.na) report(plot, n, name, 'N/A', r.na); else report(plot, n, name, 'PASS', r || ''); }
  catch (e) { report(plot, n, name, 'FAIL', String(e.message || e).split('\n')[0].slice(0, 300)); console.log('  call log: ' + String(e.message || e).split('\n').slice(1, 14).join(' / ').slice(0, 1200)); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

async function openPage(browser, cp = CP) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400) console.log(`  http ${new Date().toISOString().slice(11, 19)} ${r.status()} ${r.request().method()} ${r.url().replace(/sessions\/[^/]+/, 'sessions/…').replace(/^https?:\/\/[^/]+/, '')}`); });
  // A reload of the app (Vite reload, session_lost reopening, autosave) shows up here with the time it happened.
  page.on('framenavigated', f => { if (f === page.mainFrame()) console.log(`  navigated ${new Date().toISOString().slice(11, 19)} ${f.url().replace(/^https?:\/\/[^/]+/, '')}`); });
  page.cardPaths = new Set();
  page.on('request', r => { const m = r.url().match(/\/api\/v1(\/sessions\/[^/]+\/cards\/[^/]+)\/render/); if (m) page.cardPaths.add(m[1]); });
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(cp)}`);
  await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
  await page.waitForTimeout(2500);
  return page;
}
// Confirm the study design through the library's gated row, as a user does (test_nexo_layout_sweep.cjs confirmDesign).
async function confirmDesign(page, label = 'Differential volcano') {
  let btn = page.locator('.library-panel').getByRole('button', { name: `Confirm study design… (${label})`, exact: true }).first();
  if (!(await btn.count())) btn = page.locator('.library-panel').getByRole('button', { name: 'Confirm study design… (Differential volcano)', exact: true }).first();
  if (!(await btn.count())) return 'already confirmed';
  await btn.click();
  const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
  await design.getByLabel('Experimental unit').selectOption('Animal');
  await design.getByLabel('Sample relationship').selectOption('independent');
  await design.getByRole('button', { name: 'Confirm study design', exact: true }).click();
  await design.waitFor({ state: 'hidden', timeout: T });
  return 'confirmed (Animal, independent)';
}
// Group comparison: the card asks to confirm the reference group before it computes (cards.ts confirmPrompt).
async function confirmBaseline(page, id) {
  const b = card(page, id).getByRole('button', { name: 'Confirm reference group', exact: true });
  try { await b.waitFor({ timeout: 20000 }); } catch { return false; }
  await page.waitForFunction(sel => !document.querySelector(sel)?.disabled, `.card[data-id="${id}"] .gc-confirm button`, { timeout: T });
  await b.click();
  await b.waitFor({ state: 'detached', timeout: T });
  return true;
}
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
const ids = page => page.locator('#world .card').evaluateAll(cs => cs.map(c => c.dataset.id));
const stateOf = (page, id) => card(page, id).locator('.card-status').getAttribute('data-state');
async function settled(page, id, states = ['current']) {
  await page.waitForFunction(([sel, s]) => s.includes(document.querySelector(sel + ' .card-status')?.dataset.state), [`.card[data-id="${id}"]`, states], { timeout: T });
}
async function fit(page) { await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click(); }
async function select(page, id) { await fit(page); await card(page, id).locator('header').click(); }
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
    const img = c.querySelector('.body img');
    if (img) return img.complete && img.naturalWidth > 0 && `img:${img.getAttribute('src')}:${img.naturalWidth}x${img.naturalHeight}` !== b;
    const p = c.querySelector('.js-plotly-plot');
    return !!(p && p.data?.length) && 'plotly:' + JSON.stringify([p.data.map(t => [t.type, t.marker?.size, t.marker?.color, (t.x || []).length, t.name]), p.layout?.title, p._fullLayout?.width, p._fullLayout?.height]) !== b;
  }, [`.card[data-id="${id}"]`, before], { timeout: T });
  return signature(page, id);
}
async function shot(page, plot, name, target) {
  const file = path.join(shots, `${plot.out}-${name}.png`);
  await (target || page).screenshot({ path: file });
  return path.relative(root, file);
}
async function tab(page, name) { await page.locator('#inspector').getByRole('tab', { name, exact: true }).click(); }
async function download(page, click, timeout = T) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout }), click()]);
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
}
// Team's labels can carry an info-icon tooltip, so number fields match on the label's start (substring).
async function dataValue(page, plot) {
  await tab(page, 'Data');
  const insp = page.locator('#inspector');
  if (plot.data.radio) return (await insp.getByRole('radio', { name: plot.data.radio, exact: true }).isChecked()) ? plot.data.to : 'other';
  if (plot.data.select) return insp.getByLabel(plot.data.select, { exact: true }).inputValue();
  if (plot.data.check) return String(await insp.getByLabel(plot.data.check, { exact: true }).isChecked());
  return insp.getByLabel(plot.data.number).inputValue();
}

// Analysis settings > Differential Expression: make a threshold stricter, Apply, the filtered heatmap redraws (fewer
// significant lipids, or Team's own "No lipids passed significance filters."); then restore the old value.
async function deThreshold(page, plot, id, before) {
  await page.locator('[data-analysis-trigger]').click();
  const sheet = page.locator('dialog.analysis-sheet'); await sheet.waitFor({ timeout: T });
  const sec = sheet.locator('details', { has: page.locator('summary', { hasText: /^Differential Expression$/ }) });
  await sec.locator('input,select').first().waitFor({ timeout: T });
  const fields = await sec.locator('input[type=number], input[type=range]').evaluateAll(es => es.map(e => ({ id: e.id || e.name, label: (e.labels?.[0]?.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 60), value: e.value, min: e.min, max: e.max, type: e.type })));
  const pick = fields.find(f => /p.?val|adj|fdr|alpha|signific/i.test(f.label + ' ' + f.id)) || fields[0];
  ok(pick, `no numeric threshold in Differential Expression: ${(await sec.innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
  const field = sec.locator(`[id="${pick.id}"], [name="${pick.id}"]`).first();
  const strict = String(Math.max(Number(pick.min) || 0, Number(pick.value) / 50));
  const setTo = async v => { if (pick.type === 'range') await field.evaluate((e, x) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, x); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v); else { await field.fill(v); await field.blur(); } };
  await setTo(strict);
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  await page.waitForFunction(() => !document.querySelector('dialog.analysis-sheet [aria-busy=true]'), null, { timeout: T });
  const shotSheet = await shot(page, plot, '4-de-settings');
  await sheet.locator('header').getByRole('button', { name: /^(Close|Close Analysis settings|×)$/ }).click(); await sheet.waitFor({ state: 'hidden', timeout: 10000 });
  let after, said = '';
  try { after = await redrawn(page, id, before); } catch (e) { said = (await card(page, id).innerText()).replace(/\s+/g, ' ').slice(0, 160); throw new Error(`DE ${pick.label || pick.id} ${pick.value}→${strict}: filtered heatmap did not redraw ("${said}") (${shotSheet})`); }
  const s1 = await shot(page, plot, '4-significant');
  const txt = (await card(page, id).innerText()).replace(/\s+/g, ' ').slice(0, 120);
  // restore
  await page.locator('[data-analysis-trigger]').click(); await sheet.waitFor({ timeout: T });
  await sec.locator('input,select').first().waitFor({ timeout: T });
  await setTo(pick.value);
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  await page.waitForFunction(() => !document.querySelector('dialog.analysis-sheet [aria-busy=true]'), null, { timeout: T });
  await sheet.locator('header').getByRole('button', { name: /^(Close|Close Analysis settings|×)$/ }).click(); await sheet.waitFor({ state: 'hidden', timeout: 10000 });
  await redrawn(page, id, after);
  return `DE threshold "${pick.label || pick.id}" ${pick.value}→${strict} (Analysis settings, ${shotSheet}) redrew the filtered heatmap${txt ? ` (card text "${txt}")` : ''} (${s1}); restored ${pick.value} and redrew; DE fields seen: ${fields.map(f => f.label || f.id).join(' / ').slice(0, 200)}`;
}

async function audit(browser, plot) {
  let page = await openPage(browser);
  const insp = page.locator('#inspector');
  let id, before, label = `Audit ${plot.out}`, saved = null, design = 'not gated', gcConfirmed = false;
  const errorsAt = page.errors.length;
  try {
    // 1 Draws: add from the Library, it settles and shows the plot at 100 %; zoomed out it still shows it.
    await check(plot, 1, 'draws', async () => {
      // The Library may already be open: open it from the rail only when hidden (a second click would close it).
      if (await page.locator('.library-panel').isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
      await page.locator('.library-panel button.library-add').first().waitFor({ timeout: T });
      await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
      design = await confirmDesign(page, plot.label); // filtered heatmaps need the DE result; the others are confirmed too, as a user may have
      await page.locator(`button.library-add[aria-label="Add ${plot.label}"]`).first().click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length > 0, null, { timeout: T });
      id = (await ids(page))[0];
      if (plot.stats) { await settled(page, id, ['current', 'error', 'failed', 'stale', 'pending', 'draft']).catch(() => {}); gcConfirmed = await confirmBaseline(page, id); }
      await settled(page, id, ['current', 'error', 'failed']);
      const st = await stateOf(page, id);
      ok(st === 'current', `card state ${st}: ${(await card(page, id).innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
      const close = page.getByRole('button', { name: /^(Close library|Hide library)$/ }).first();
      if (await close.isVisible()) await close.click(); // close the Library (confirming on the card may already have replaced it)
      await select(page, id);
      await page.locator('.zoom-pill').getByRole('button', { name: '100%', exact: true }).click().catch(() => {});
      before = await drawn(page, id);
      ok(before, 'nothing drawn');
      ok(!/Couldn.t bring back/.test(await card(page, id).innerText()), 'card says Couldn\'t bring back');
      const s1 = await shot(page, plot, '1-draws');
      let sharp = '';
      if (plot.sharp) {
        const px = await card(page, id).evaluate(c => { const i = c.querySelector('.body img'); const r = i.getBoundingClientRect();
          // object-fit: contain — the drawn picture is the image scaled into its box
          const k = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight);
          return { nw: i.naturalWidth, nh: i.naturalHeight, bw: Math.round(r.width), bh: Math.round(r.height), dw: Math.round(i.naturalWidth * k), dh: Math.round(i.naturalHeight * k), dpr: devicePixelRatio, zoom: document.querySelector('.zoom-pill')?.innerText.replace(/\s+/g, ' ') }; });
        const ratio = px.nw / (px.dw * px.dpr);
        await card(page, id).locator('.body').screenshot({ path: path.join(shots, `${plot.out}-1-sharp-100.png`) }).catch(() => {});
        sharp = `; sharp at 100 %: image ${px.nw}x${px.nh} drawn at ${px.dw}x${px.dh} in a ${px.bw}x${px.bh} box (dpr ${px.dpr}, zoom ${px.zoom}) → ${ratio.toFixed(2)} image px per screen px (${path.relative(root, shots)}/${plot.out}-1-sharp-100.png)`;
        ok(ratio >= 0.98, `blurry at 100 %: image ${px.nw}x${px.nh} drawn at ${px.dw}x${px.dh} (dpr ${px.dpr}) = ${ratio.toFixed(2)} image px per screen px`);
      }
      for (let i = 0; i < 4; i++) await page.locator('.zoom-pill').getByRole('button', { name: /^(−|-|Zoom out)$/ }).first().click();
      await page.waitForTimeout(1500);
      const zoomed = await card(page, id).evaluate(c => ({ tier: c.dataset.tier, img: [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0), plot: [...c.querySelectorAll('.js-plotly-plot')].some(p => p.data?.length) }));
      const zoom = await page.locator('.zoom-pill').innerText();
      ok(zoomed.img || zoomed.plot, `zoomed out (${zoom.replace(/\s+/g, ' ')}) the card shows nothing (tier ${zoomed.tier})`);
      const s2 = await shot(page, plot, '1-zoomed-out');
      await select(page, id); before = await signature(page, id);
      return `${s1}, ${s2}; zoomed out tier=${zoomed.tier} ${zoomed.img ? 'image' : 'plotly'}; study design ${design}${sharp}`;
    });
    if (!id || (await stateOf(page, id)) !== 'current') return;

    // 2 Matches Team: the card's inputs are the catalog defaults, and what it shows is the module's own render.
    await check(plot, 2, 'matches-team', async () => {
      const cat = await page.evaluate(async () => (await (await fetch('/api/v1/catalog')).json()).outputs);
      const entry = cat.find(e => e.id === `${plot.src}-${plot.out}`);
      ok(entry && entry.render === (plot.catalogRender || plot.render), `catalog render ${entry?.render}`);
      const shown = await dataValue(page, plot);
      const def = entry.defaults[plot.data.id];
      if (plot.data.number) ok(Number(shown) === Number(def), `inspector ${plot.data.id}=${shown}, catalog default ${def}`);
      else if (plot.data.select) ok(shown === def, `inspector ${plot.data.id}=${shown}, catalog default ${def}`);
      else if (plot.data.check) ok(shown === String(def), `inspector ${plot.data.id}=${shown}, catalog default ${def}`);
      else ok((shown === plot.data.to) === (def === plot.data.to), `inspector ${plot.data.id} ${shown === plot.data.to ? 'is' : 'is not'} ${plot.data.to}, catalog default ${def}`);
      const cardPath = [...page.cardPaths].find(p => p.endsWith(`-${plot.out}`) || p.includes(id.replace(`-${plot.out}`, '')));
      ok(cardPath, 'no render request seen for the card');
      const own = await page.evaluate(async ([p, render]) => {
        const r = await fetch(`/api/v1${p}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ width: 620, height: 680, format: render === 'png' ? 'png' : 'json' }) });
        if (!r.ok) return { status: r.status, text: (await r.text()).slice(0, 200) };
        if (render === 'png') { const b = await r.blob(); const bm = await createImageBitmap(b); return { status: r.status, bytes: b.size, w: bm.width, h: bm.height }; }
        const j = await r.json(); if (!j.figure?.data) return { status: r.status, message: Object.keys(j.figure || {}).join(','), rows: Array.isArray(j.figure?.rows) ? j.figure.rows.length : Object.keys(j.figure?.rows || {}).length, groups: j.figure?.groups };
        return { status: r.status, traces: (j.figure?.data || []).map(t => t.type + ':' + (t.x || []).length), title: JSON.stringify(j.figure?.layout?.title)?.slice(0, 120) };
      }, [cardPath, plot.render]);
      ok(own.status === 200, `module render ${own.status} ${own.text || ''}`);
      const mine = await card(page, id).evaluate(c => {
        const img = c.querySelector('.body img'); if (img) return { w: img.naturalWidth, h: img.naturalHeight, box: [img.clientWidth, img.clientHeight] };
        const p = c.querySelector('.js-plotly-plot'); return { traces: p.data.map(t => t.type + ':' + (t.x || []).length), title: JSON.stringify(p.layout?.title)?.slice(0, 120) };
      });
      if (plot.render === 'png') { ok(own.w > 0 && mine.w > 0, 'empty image'); return `module render ${own.w}x${own.h} (${own.bytes} B); card image ${mine.w}x${mine.h} shown at ${mine.box.join('x')}`; }
      if (own.message) { ok(mine.traces.length > 0, 'card drew no traces from the module message'); return `module answers its comparison message (${own.message}; ${own.rows} rows, groups ${JSON.stringify(own.groups)}); card draws ${mine.traces.length} traces (${[...new Set(mine.traces.map(t => t.split(':')[0]))].join(',')}) from it`; }
      ok(JSON.stringify(own.traces) === JSON.stringify(mine.traces), `traces differ: module ${own.traces} vs card ${mine.traces}`);
      return `same ${mine.traces.length} traces as the module render (${[...new Set(mine.traces.map(t => t.split(':')[0]))].join(',')}); title ${mine.title}`;
    });

    // 3 Size: larger and smaller, it redraws at the new size and nothing overflows the card.
    await check(plot, 3, 'size', async () => {
      await select(page, id);
      const handle = card(page, id).locator('.resize-handle');
      const drag = async (dx, dy) => {
        const b = await handle.boundingBox(); ok(b, 'no resize handle');
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 }); await page.mouse.up();
      };
      const box0 = await card(page, id).boundingBox();
      await drag(160, 60); const big = await redrawn(page, id, before);
      const box1 = await card(page, id).boundingBox();
      ok(box1.width > box0.width + 50, `card did not grow (${box0.width}→${box1.width})`);
      const s1 = await shot(page, plot, '3-larger');
      await select(page, id); await drag(-330, -260); const small = await redrawn(page, id, big);
      const box2 = await card(page, id).boundingBox();
      ok(box2.width < box1.width - 100, `card did not shrink (${box1.width}→${box2.width})`);
      const over = await card(page, id).evaluate(c => { const b = c.querySelector('.body'); const r = b.getBoundingClientRect(); return [...b.querySelectorAll('img,.js-plotly-plot,svg.main-svg')].filter(e => { const q = e.getBoundingClientRect(); return q.right > r.right + 2 || q.bottom > r.bottom + 2; }).length; });
      ok(over === 0, `${over} element(s) overflow the card body`);
      const s2 = await shot(page, plot, '3-smaller');
      before = small;
      return `${Math.round(box0.width)}→${Math.round(box1.width)}→${Math.round(box2.width)} px wide, redrawn each time; ${s1}, ${s2}`;
    });

    // 4 Data tab: Team's controls are all there; a change redraws; an invalid value is refused with a message.
    await check(plot, 4, 'data-tab', async () => {
      await select(page, id); await tab(page, 'Data');
      const entry = (await page.evaluate(async () => (await (await fetch('/api/v1/catalog')).json()).outputs)).find(e => e.id === `${plot.src}-${plot.out}`);
      // Team's markup for the module (catalog `inputs`) against the Inspector; tabs show as their option labels.
      const present = await insp.locator('[role=tabpanel]').evaluate((p, want) => want.filter(w => w.type === 'tabs'
        ? !w.options.every(o => p.innerText.includes(o.label))
        : !p.querySelector(`[id="${w.id}"], [name="${w.id}"], [data-input="${w.id}"], [id^="${w.id}-"], [id$="-${w.id}"]`)).map(w => w.id), entry.inputs);
      const notMarkup = entry.allowedInputs.filter(a => !entry.inputs.some(i => i.id === a));
      let changed;
      if (plot.data.radio) await insp.getByRole('radio', { name: plot.data.radio, exact: true }).check();
      else if (plot.data.select) await insp.getByLabel(plot.data.select, { exact: true }).selectOption(plot.data.to);
      else if (plot.data.check) await insp.getByLabel(plot.data.check, { exact: true }).setChecked(plot.data.to === 'true');
      else { const f = insp.getByLabel(plot.data.number); await f.fill(plot.data.to); await f.press('Enter'); await f.blur(); }
      changed = await redrawn(page, id, before);
      const s1 = await shot(page, plot, '4-data-changed');
      let refused = 'no numeric control (N/A)';
      const slider = plot.data.number && await insp.getByLabel(plot.data.number).getAttribute('type') === 'range';
      if (slider) refused = 'slider bounded like Team: an out-of-range value cannot be entered';
      if (plot.data.bad && !slider) {
        const f = insp.getByLabel(plot.data.number);
        await f.fill(plot.data.bad); await f.press('Enter'); await f.blur();
        // The refusal comes back from the API (PATCH 400); wait up to 10 s for it to be shown.
        const t0 = Date.now(); let msg = '';
        while (Date.now() - t0 < 10000) { msg = (await page.locator('#inspector [role=alert], #inspector .field-error, #inspector [aria-invalid=true], .toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' '); if (msg) break; await page.waitForTimeout(250); }
        if (msg) msg += ` (shown ${((Date.now() - t0) / 1000).toFixed(1)} s after the value)`;
        const after = await signature(page, id), st = await stateOf(page, id);
        const s2 = await shot(page, plot, '4-data-invalid');
        // What the field shows once the value is refused, and after the last good value is typed again (round 2: #9
        // read the catalog default 0.05 although 0.01 had been restored).
        const shown = await f.inputValue();
        refused = `invalid ${plot.data.bad}: state=${st}, redrew=${after !== changed}, message="${msg.slice(0, 160)}", field then shows "${shown}" (${s2})`;
        ok(msg.length > 0 || await f.evaluate(e => !e.checkValidity()), `invalid ${plot.data.bad} accepted silently (state ${st}, redrew ${after !== changed})`);
        await f.fill(plot.data.to); await f.press('Enter'); await f.blur(); await page.waitForTimeout(1500);
        await settled(page, id).catch(() => {});
        const kept = await f.inputValue();
        refused += `; ${plot.data.to} typed again → field shows "${kept}"`;
        await select(page, id); await tab(page, 'Data');
        refused += `, after re-selecting the card "${await insp.getByLabel(plot.data.number).inputValue()}"`;
      }
      before = await signature(page, id);
      // The "significant" filters, as in Team: the filtered heatmaps keep the lipids that pass the Differential Expression
      // thresholds (Team's global sidebar, Nexo's Analysis settings); the violin can take its lipids from that DE list.
      let sig = '';
      if (plot.deFilter) sig = '; ' + await deThreshold(page, plot, id, before);
      if (plot.sigScope) {
        await tab(page, 'Data');
        await insp.getByRole('radio', { name: plot.sigScope, exact: true }).check();
        const after = await redrawn(page, id, before);
        sig = `; scope "${plot.sigScope}" redrew (${await shot(page, plot, '4-significant')})`;
        await insp.getByRole('radio', { name: 'Current Heatmap View (Active Lipids)', exact: true }).check();
        before = await redrawn(page, id, after);
      }
      before = await signature(page, id);
      ok(present.length === 0, `allowedInputs without a control: ${present.join(', ')}`);
      return `${entry.inputs.length} Team controls all present (allowedInputs not in Team's markup: ${notMarkup.join(', ') || 'none'}); ${plot.data.id}→${plot.data.to} redrew (${s1}); ${refused}${sig}`;
    });

    // 5 Appearance tab.
    await check(plot, 5, 'appearance', async () => {
      await select(page, id); await tab(page, 'Appearance');
      const notes = [];
      const lbl = insp.getByLabel('Label', { exact: true });
      await lbl.fill(label); await lbl.blur();
      await page.waitForFunction(([sel, t]) => document.querySelector(sel + ' .card-title')?.textContent === t, [`.card[data-id="${id}"]`, label], { timeout: 10000 });
      notes.push('Label renames the card');
      const bg = insp.getByLabel('Background', { exact: true });
      await bg.fill('#fff4e0');
      await page.waitForTimeout(500);
      const bgc = await card(page, id).evaluate(c => [getComputedStyle(c).backgroundColor, getComputedStyle(c.querySelector('.body')).backgroundColor].join('/'));
      ok(/255, 244, 224/.test(bgc), `background not applied: ${bgc}`);
      notes.push(`Background → ${bgc}`);
      if (plot.render === 'plotly') {
        const ed = insp.locator('.plot-editor').first();
        ok(await ed.count(), 'no plot editor for a Plotly plot');
        await ed.evaluate(e => e.querySelectorAll('details').forEach(d => { d.open = true; }));
        const plotTitle = () => card(page, id).evaluate(c => { const p = c.querySelector('.js-plotly-plot'); const t = p._fullLayout?.title?.text; return t; });
        const t = ed.getByLabel('Plot title', { exact: true });
        if (await t.count()) { await t.fill('Audit title'); await t.blur(); await page.waitForFunction(sel => document.querySelector(sel + ' .js-plotly-plot')?._fullLayout?.title?.text === 'Audit title', `.card[data-id="${id}"]`, { timeout: 10000 }); notes.push('Plot title on the plot'); }
        else notes.push('NO Plot title field');
        for (const [f, v] of [['Chart font size', '16'], ['Chart text color', '#aa0000'], ['Plot background', '#f0f0ff']]) {
          const c = ed.getByLabel(f, { exact: true }); if (!(await c.count())) { notes.push(`NO ${f}`); continue; }
          await c.fill(v); await c.blur();
          notes.push(f);
        }
        await page.waitForTimeout(800);
        const lay = await card(page, id).evaluate(c => { const l = c.querySelector('.js-plotly-plot')._fullLayout; return { size: l.font.size, color: l.font.color, plot: l.plot_bgcolor, legend: [l.legend?.x, l.legend?.y], showlegend: l.showlegend }; });
        notes.push(`font ${lay.size} ${lay.color}, plot bg ${lay.plot}`);
        ok(lay.size === 16, `font size not on the plot (${lay.size})`);
        const pal = ed.getByRole('group', { name: 'Color palette', exact: true }).getByRole('button');
        const nPal = await pal.count();
        if (nPal) {
          const colors = [];
          for (let i = 0; i < nPal; i++) { await pal.nth(i).click(); await page.waitForTimeout(300); colors.push(await card(page, id).evaluate(c => JSON.stringify(c.querySelector('.js-plotly-plot').data.map(t => t.marker?.color)).slice(0, 80))); }
          notes.push(`${nPal} palettes, ${new Set(colors).size} distinct colourings`);
          ok(nPal === 6, `${nPal} palettes, expected 6`);
          ok(new Set(colors).size > 1, 'palettes do not change the plot');
          const grey = ed.getByLabel('Healthy in grey', { exact: true });
          if (await grey.count()) { await grey.check(); notes.push('Healthy in grey present'); }
        } else notes.push(`palette: "${(await ed.locator('details', { hasText: 'Color palette' }).innerText()).replace(/\s+/g, ' ').slice(0, 120)}"`);
        const leg = ed.getByRole('group', { name: 'Legend position', exact: true }).getByRole('button', { name: 'Top Left', exact: true });
        if (await leg.count()) { await leg.click(); await page.waitForTimeout(400); const l = await card(page, id).evaluate(c => c.querySelector('.js-plotly-plot')._fullLayout.legend); notes.push(`legend Top Left → x=${l?.x}`); ok(l && l.x === 0, 'legend position not applied'); }
        const grid = ed.getByLabel('Horizontal grid lines', { exact: true });
        if (await grid.count()) { await grid.setChecked(!(await grid.isChecked())); notes.push('grid toggle'); } else notes.push('NO grid toggle');
        const orient = ed.getByRole('button', { name: 'Change orientation', exact: true });
        notes.push(`orientation ${await orient.isDisabled() ? 'disabled (not supported for this plot)' : 'enabled'}`);
        const undo = ed.getByRole('button', { name: 'Undo', exact: true }), redo = ed.getByRole('button', { name: 'Redo', exact: true });
        await undo.click(); await page.waitForTimeout(300); ok(!(await redo.isDisabled()), 'Redo not available after Undo'); await redo.click(); notes.push('Undo/Redo');
        const s1 = await shot(page, plot, '5-appearance');
        await ed.getByRole('button', { name: 'Reset presentation', exact: true }).click();
        await ed.getByRole('button', { name: 'Reset all', exact: true }).click();
        await page.waitForTimeout(800);
        const reset = await plotTitle();
        ok(reset !== 'Audit title', 'Reset did not restore the title');
        notes.push(`Reset → title "${String(reset).slice(0, 50)}"; ${s1}`);
      } else {
        const extra = await insp.locator('[role=tabpanel] :is(input,select,button)').count();
        notes.push(`image plot: ${extra} controls (Label, Background) — no plot-level controls that would silently do nothing`);
        notes.push(await shot(page, plot, '5-appearance'));
      }
      // Toolbar Undo/Redo of the Label rename (canvas history).
      await page.getByRole('button', { name: /^↶ Undo$/ }).click();
      await page.waitForTimeout(500);
      const undone = await card(page, id).locator('.card-title').textContent();
      await page.getByRole('button', { name: /^↷ Redo$/ }).click();
      await page.waitForTimeout(500);
      const redone = await card(page, id).locator('.card-title').textContent();
      notes.push(`canvas Undo → "${undone}", Redo → "${redone}"`);
      if (redone !== label) { await insp.getByLabel('Label', { exact: true }).fill(label); await insp.getByLabel('Label', { exact: true }).blur(); }
      before = await signature(page, id);
      return notes.join('; ');
    });

    // 6 Statistics: only the group comparison has statistics in Team (baseline confirmation, results, CSV).
    await check(plot, 6, 'statistics', async () => {
      await select(page, id); await tab(page, 'Statistics');
      const panel = insp.locator('[role=tabpanel]');
      const t = (await panel.innerText()).replace(/\s+/g, ' ').trim();
      if (plot.sigStats) {
        // Team's Violin View draws its own pairwise Welch t-tests against a baseline group (module controls
        // show_violin_sig / violin_sig_display_type / violin_sig_threshold): in Nexo these are Data controls.
        await tab(page, 'Data');
        const bars = insp.getByLabel('Show Significance Bars', { exact: false }).first();
        const was = await bars.isChecked();
        await bars.setChecked(!was); const a = await redrawn(page, id, before);
        const s0 = await shot(page, plot, '6-statistics-bars-off');
        await bars.setChecked(was); const b = await redrawn(page, id, a);
        await insp.getByRole('radio', { name: 'Numeric p-values', exact: true }).check(); const c = await redrawn(page, id, b);
        const s1 = await shot(page, plot, '6-statistics');
        await insp.getByRole('radio', { name: 'Significance Stars (*, **, ***)', exact: true }).check(); before = await redrawn(page, id, c);
        const base = await insp.getByLabel('Baseline Reference Group', { exact: false }).first().evaluate(e => e.tagName === 'SELECT' ? [...e.options].map(o => o.text).join('/') : e.value).catch(() => 'not found');
        return `Statistics tab: "${t.slice(-80)}"; Team's significance is in the Data tab: bars ${was}→${!was} redrew (${s0}), back, "Numeric p-values" redrew (${s1}), back to stars; baseline group options: ${base}`;
      }
      if (!plot.stats) {
        ok(!(await insp.getByRole('button', { name: /Review and confirm/ }).count()), 'statistics offered for a plot without statistics in Team');
        return { na: `Team has no statistics for this plot; tab says "${t.slice(-80)}"` };
      }
      ok(gcConfirmed, 'the card never asked to confirm the reference group');
      const sec = insp.getByRole('region', { name: 'Group comparison', exact: true });
      await sec.getByRole('table', { name: 'Group comparison results', exact: true }).waitFor({ timeout: T });
      const rows = await sec.locator('table tbody tr').count();
      const first = (await sec.locator('table tbody tr').first().innerText()).replace(/\s+/g, ' ');
      ok(rows > 0, 'no result rows');
      const csv = await download(page, () => sec.getByRole('button', { name: 'Comparison CSV', exact: true }).click());
      const lines = csv.bytes.toString('utf8').trim().split('\n');
      ok(lines.length > 1, `CSV has ${lines.length} line(s)`);
      await sec.locator('details summary', { hasText: 'Full statistical report' }).click();
      const rep = (await sec.locator('pre.gc-report').innerText()).split('\n').slice(0, 3).join(' / ');
      const s1 = await shot(page, plot, '6-statistics');
      return `reference group confirmed on the card; ${rows} result rows (first: "${first.slice(0, 80)}"); CSV ${csv.name} ${lines.length} lines, header "${lines[0].slice(0, 100)}"; report "${rep.slice(0, 120)}"; ${s1}`;
    });

    // 7 Export: PNG/SVG/PDF of the card and Team's own downloads.
    await check(plot, 7, 'export', async () => {
      await select(page, id); await tab(page, 'Export');
      const notes = [], failedDl = [];
      const png = await download(page, () => insp.getByRole('button', { name: 'Download PNG', exact: true }).click());
      ok(png.bytes.subarray(1, 4).toString() === 'PNG', 'PNG is not a PNG'); notes.push(`PNG ${png.bytes.length} B`);
      const svgB = insp.getByRole('button', { name: 'Download SVG', exact: true });
      if (await svgB.isDisabled()) notes.push(`SVG disabled ("${(await svgB.getAttribute('title')) || (await insp.locator('[role=tabpanel]').innerText()).replace(/\s+/g, ' ').match(/[^.]*SVG[^.]*\./)?.[0] || 'no reason shown'}")`);
      else { const svg = await download(page, () => svgB.click()); ok(/<svg/.test(svg.bytes.toString('utf8', 0, 4000)), 'SVG has no <svg'); notes.push(`SVG ${svg.bytes.length} B`); }
      const more = insp.getByRole('group', { name: 'More downloads from this analysis', exact: true });
      await more.waitFor({ timeout: 20000 }).catch(() => {}); // the group loads after the tab (round 1: read too early)
      if (await more.count()) {
        const names = await more.getByRole('button').allTextContents();
        const repeated = names.filter((n, i) => names.indexOf(n) !== i);
        if (repeated.length) notes.push(`SAME LABEL on several downloads: ${[...new Set(repeated)].join(', ')}`);
        for (const [i, b] of names.entries()) try {
          // By position: two of Team's downloads may carry the same label. A failing one must say so, not hang.
          // A failure toast lasts 9 s, so the page is read from the click on for the whole wait, not after it.
          const seen = new Set(); let watching = true;
          const watch = (async () => { const t0 = Date.now(); while (watching && Date.now() - t0 < 62000) {
            for (const t of await page.locator('.toast, [role=alert]').allInnerTexts().catch(() => [])) { const x = t.replace(/\s+/g, ' ').trim(); if (x && !seen.has(x)) { seen.add(x); seen[x] = ((Date.now() - t0) / 1000).toFixed(1); if (/fail|could not|error/i.test(x)) await shot(page, plot, `7-download-${i}-toast`).catch(() => {}); } }
            await page.waitForTimeout(300); } })();
          console.log(`  click ${new Date().toISOString().slice(11, 19)} Team ${b}`);
          const f = await download(page, () => more.getByRole('button').nth(i).click(), 60000).catch(async e => {
            await watch; await shot(page, plot, `7-download-${i}-failed`);
            const said = [...seen].map(x => `${x} (at ${seen[x]} s)`).join(' | ');
            throw new Error(`Team ${b} (#${i}) produced no file within 60 s; from the click on the page said "${said.slice(0, 220) || 'nothing'}"; ${String(e.message).split('\n')[0]}`);
          });
          watching = false; await watch;
          console.log(`  download ${new Date().toISOString().slice(11, 19)} Team ${b} ok`);
          ok(f.bytes.length > 100, `${b} is empty (${f.bytes.length} B)`);
          if (b === 'PDF') ok(f.bytes.subarray(0, 4).toString('latin1') === '%PDF', 'PDF is not a PDF');
          notes.push(`Team ${b} ${f.name} ${f.bytes.length} B`);
        } catch (e) { failedDl.push(String(e.message).split('\n')[0]); } // try every download, then fail with all of them
      } else notes.push('no Team downloads');
      await insp.getByRole('button', { name: 'More export options…', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Export', exact: true }); await dialog.waitFor();
      const pdfBox = dialog.getByRole('button', { name: 'Download PDF', exact: true });
      if (await pdfBox.count()) { const pdf = await download(page, () => pdfBox.click()); ok(pdf.bytes.subarray(0, 4).toString('latin1') === '%PDF', 'card PDF is not a PDF'); notes.push(`card PDF ${pdf.bytes.length} B`); }
      else notes.push(`dialog buttons: ${(await dialog.getByRole('button').allTextContents()).join('/')}`);
      notes.push(await shot(page, plot, '7-export-dialog'));
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      if (failedDl.length) throw new Error(`${failedDl.join(' ;; ')} [rest: ${notes.join('; ')}]`);
      return notes.join('; ');
    });

    // 8 Finish: a snapshot like the live plot; Edit figure returns to the live plot.
    await check(plot, 8, 'finish', async () => {
      await select(page, id);
      await insp.getByRole('button', { name: 'Finish plot', exact: true }).click();
      await settled(page, id, ['finished']).catch(async e => {
        const st = await stateOf(page, id), txt = (await card(page, id).locator('.card-status').innerText()).replace(/\s+/g, ' ');
        const said = (await page.locator('.toast, [role=alert], [role=dialog]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
        const f = await shot(page, plot, '8-finish-failed');
        throw new Error(`not finished after 180 s: state=${st} "${txt}", page said "${said.slice(0, 200)}" (${f}); ${String(e.message).split('\n')[0]}`);
      });
      const snap = await card(page, id).evaluate(c => { const i = c.querySelector('.body img'); return i ? { w: i.naturalWidth, h: i.naturalHeight, box: [i.clientWidth, i.clientHeight] } : null; });
      const body = await card(page, id).locator('.body').boundingBox();
      ok(snap && snap.w > 0, 'no snapshot image');
      const s1 = await shot(page, plot, '8-finished');
      await insp.getByRole('button', { name: 'Edit figure', exact: true }).click();
      await settled(page, id, ['current']);
      before = await drawn(page, id);
      ok(plot.render === 'png' ? before.startsWith('img:') : before.startsWith('plotly:'), `after Edit figure the card shows ${before.slice(0, 20)}`);
      return `snapshot ${snap.w}x${snap.h} in a ${Math.round(body.width)}x${Math.round(body.height)} body; Edit figure → live ${plot.render}; ${s1}`;
    });

    // 9 Duplicate keeps inputs and appearance; remove + Undo restores.
    await check(plot, 9, 'duplicate-remove-undo', async () => {
      await select(page, id);
      const v0 = await dataValue(page, plot);
      await card(page, id).locator('header').getByRole('button', { name: 'Duplicate', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 2, null, { timeout: T });
      const dup = (await ids(page)).find(x => x !== id);
      await settled(page, dup); await drawn(page, dup);
      const dupTitle = await card(page, dup).locator('.card-title').textContent();
      await select(page, dup);
      const v1 = await dataValue(page, plot);
      ok(v1 === v0, `duplicate ${plot.data.id}=${v1}, original ${v0}`);
      ok(dupTitle.startsWith(label), `duplicate title "${dupTitle}"`);
      const s1 = await shot(page, plot, '9-duplicate');
      await card(page, dup).getByRole('button', { name: 'More card actions' }).click();
      await card(page, dup).locator('.card-menu').getByRole('button', { name: 'Remove', exact: true }).click();
      const confirm = page.getByRole('button', { name: /^Remove( plot)?$/ }).filter({ hasNot: page.locator('.card-menu') });
      if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: /^Remove/ }).click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: 10000 });
      await page.getByRole('button', { name: /^↶ Undo$/ }).click();
      await page.waitForFunction(d => !!document.querySelector(`.card[data-id="${d}"]`), dup, { timeout: 10000 });
      await settled(page, dup); await drawn(page, dup);
      // Leave one card for the save check.
      await card(page, dup).getByRole('button', { name: 'More card actions' }).click();
      await card(page, dup).locator('.card-menu').getByRole('button', { name: 'Remove', exact: true }).click();
      if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: /^Remove/ }).click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: 10000 });
      void confirm;
      return `duplicate "${dupTitle}" with ${plot.data.id}=${v1}; remove + Undo brought it back drawn; ${s1}`;
    });

    // 10 Save and reopen: the plot comes back with its inputs and appearance.
    await check(plot, 10, 'save-reopen', async () => {
      page.setDefaultTimeout(15000);
      await select(page, id);
      const v0 = await dataValue(page, plot);
      await page.getByRole('button', { name: 'Export figure ▾', exact: true }).click();
      await page.getByRole('button', { name: 'Save checkpoint…', exact: true }).click();
      const cps = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
      await cps.getByRole('textbox', { name: 'New checkpoint name' }).fill(SAVE);
      await cps.getByRole('button', { name: 'Save current analysis', exact: true }).click();
      await page.locator('.toast', { hasText: `Saved checkpoint ${SAVE}` }).waitFor({ timeout: T });
      saved = new URL(page.url()).searchParams.get('checkpoint');
      ok(/^[a-f0-9]{64}$/.test(saved), `saved id ${saved}`);
      page.auditErrors = page.errors.slice(errorsAt);
      await page.context().close();
      page = await openPage(browser, saved);
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: T });
      const rid = (await ids(page))[0];
      if (plot.stats) await settled(page, rid, ['current', 'error', 'failed']).catch(() => {});
      ok(!(await card(page, rid).locator('.gc-confirm').count()), 'reopened group comparison asks to confirm the reference group again');
      await settled(page, rid); await drawn(page, rid);
      const title = await card(page, rid).locator('.card-title').textContent();
      const bgc = await card(page, rid).evaluate(c => getComputedStyle(c).backgroundColor + '/' + getComputedStyle(c.querySelector('.body')).backgroundColor);
      await select(page, rid);
      const v1 = await dataValue(page, plot);
      const s1 = await shot(page, plot, '10-reopened');
      ok(title === label, `reopened title "${title}"`);
      ok(v1 === v0, `reopened ${plot.data.id}=${v1}, saved ${v0}`);
      ok(/255, 244, 224/.test(bgc), `reopened background ${bgc}`);
      return `reopened ${saved.slice(0, 12)}…: "${title}", ${plot.data.id}=${v1}, background kept; ${s1}`;
    });
    // 12 Layout: at 1440x900 and 1024x768, every Inspector tab with every section open: nothing overlaps, spills or
    // escapes the Inspector (rules of test_nexo_layout_sweep.cjs); the card chrome stays inside the card; sliders stay
    // inside the Inspector.
    await check(plot, 12, 'layout', async () => {
      const rid = (await ids(page))[0], insp = page.locator('#inspector'); // the page may be the reopened one (check 10)
      const found = [], notes = [];
      for (const [w, h] of [[1440, 900], [1024, 768]]) {
        await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(600);
        await select(page, rid);
        const tabs = await insp.getByRole('tab').allTextContents();
        let sliders = 0;
        for (const tb of tabs) {
          await tab(page, tb); await page.waitForTimeout(400);
          for (let i = 0; i < 4; i++) { const n = await page.evaluate(() => { const ds = [...document.querySelectorAll('#inspector details:not([open])')]; ds.forEach(d => { d.open = true; }); return ds.length; }); if (!n) break; await page.waitForTimeout(200); }
          const off = await page.evaluate(inspect, { roots: [['inspector', '#inspector']], rules: ['spill', 'overlap', 'escape'], edge: '#inspector' });
          const sl = await page.evaluate(() => { const e = document.querySelector('#inspector').getBoundingClientRect(); const r = [...document.querySelectorAll('#inspector input[type=range]')].filter(x => x.getBoundingClientRect().width > 0);
            return { n: r.length, out: r.filter(x => { const q = x.getBoundingClientRect(); return q.left < e.left - 1 || q.right > e.right + 1; }).map(x => x.id || x.getAttribute('aria-label') || x.name) }; });
          sliders += sl.n;
          for (const s of sl.out) off.push({ rule: 'slider-outside', selector: s, text: '' });
          for (const o of off) found.push(`${w}x${h} ${tb} ${o.rule} ${o.selector} "${o.text}"`);
          await insp.screenshot({ path: path.join(shots, `${plot.out}-12-layout-${w}-${tb.replace(/\W+/g, '')}.png`) });
        }
        const chrome = await page.evaluate(inspect, { roots: [['card', `.card[data-id="${rid}"] > :not(.body)`]], rules: ['spill', 'overlap', 'escape'] });
        for (const o of chrome) found.push(`${w}x${h} card ${o.rule} ${o.selector} "${o.text}"`);
        notes.push(`${w}x${h}: tabs ${tabs.join('/')}, ${sliders} sliders`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      ok(found.length === 0, `${found.length} offender(s): ${found.slice(0, 6).join(' ; ')}`);
      return `0 offenders; ${notes.join('; ')}; ${path.relative(root, shots)}/${plot.out}-12-layout-<width>-<tab>.png`;
    });
  } finally {
    const errs = (page.auditErrors || []).concat(page.auditErrors ? page.errors : page.errors.slice(errorsAt));
    report(plot, 11, 'console', errs.length ? 'FAIL' : 'PASS', errs.length ? errs.slice(0, 4).join(' | ') : '0 console errors');
    if (saved) {
      const status = await page.evaluate(async u => (await fetch(u, { method: 'DELETE' })).status, `/api/v1/checkpoints/${saved}`).catch(e => String(e));
      console.log(`cleanup: deleted ${SAVE} ${saved.slice(0, 12)}… (${status})`);
    }
    await page.context().close().catch(() => {});
  }
}

(async () => {
  const only = process.argv.slice(2);
  const browser = await pw.chromium.launch();
  try { for (const plot of PLOTS.filter(p => !only.length || only.includes(p.out))) await audit(browser, plot); }
  finally { await browser.close(); }
  fs.writeFileSync(path.join(shots, `results-${only.join('_') || 'all'}.json`), JSON.stringify(results, null, 1));
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`${failed ? 'AUDIT FAIL' : 'AUDIT OK'}: ${results.length} checks, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });
