'use strict';
// Chart audit, batch b08-structure-grid (docs/integration/nexo-chart-audit-plan.md): the 11-row checklist per plot plus
// check 12 (Layout), in a real browser against the synthetic-only audit API. Needs the batch Vite (vite.audit.config.mjs; round 2: :5287 with
// NEXO_AUDIT_API=http://127.0.0.1:3962, set NEXO_AUDIT_BASE for another port). Plotly plots need frontends/nexo/public/vendor/plotly.min.js (scripts/vendor-plotly.sh).
//   node tests/dual-ui/chart-audit/audit_b08-structure-grid.cjs [outputName ...]
// These plots need the study design (needs: de): the Library's gated row is confirmed as a user does (Animal, independent).
// One page at a time (the API holds two sessions in total). Writes screenshots to docs/integration/chart-audit/b08-structure-grid/.
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5287';
const CP = 'nexo-complete-synthetic', SAVE = 'audit-b08-structure-grid-synthetic', FAMILY = 'structural_grid_tab';
const shots = path.join(root, 'docs/integration/chart-audit/b08-structure-grid');
const T = 180000;
fs.mkdirSync(shots, { recursive: true });

// Per plot: the Library label, how it draws, and one Data control a user changes (with an invalid value when numeric).
// mergedPlot ignores label_type (module renderPlot l.776-): its Data change is Position, which it draws in its subtitle.
// `extra`: Team controls the module builds in renderUI (not in its static markup): they must be in the Inspector too.
const PLOTS = [
  { out: 'heatmapPlot', label: 'Structural grid · selected class heatmap', render: 'png', data: { number: 'Plot Base Text Size:', id: 'textSize', to: '16', bad: '-3' }, extra: ['lipid_class', 'gridLog2fcThresh'] },
  { out: 'dotplotPlot', label: 'Structural grid · selected class dotplot', render: 'png', data: { number: 'Base Dot Size (Dotplot):', id: 'pointSize', to: '10', bad: '-2' }, extra: ['lipid_class', 'gridLog2fcThresh'] },
  { out: 'mergedPlot', label: 'Structural grid · all classes', render: 'png', data: { radio: 'sn-1', id: 'position', to: 'sn1' }, extra: ['gridLog2fcThresh'] },
  { out: 'diffAllPlot', label: 'Structural grid · differential overview', render: 'png', data: { select: 'Map Dot Color to:', id: 'all_color_map', to: 'carbon_lfc', def: 'db_lfc' }, extra: ['gridLog2fcThresh', 'all_size_map', 'all_color_map', 'all_alpha_map', 'hide_non_sig_all_classes'] },
];
// The layout sweep's own in-page checks (spill, overlap, escape), read from it so both apply the same rules.
const sweepSrc = fs.readFileSync(path.join(root, 'tests/dual-ui/test_nexo_layout_sweep.cjs'), 'utf8');
const inspectSrc = sweepSrc.match(/function inspect\(\{ roots, rules, edge \}\) \{[\s\S]*?\n\}\n/)[0];
const inspectIn = (page, arg) => page.evaluate(`(${inspectSrc})(${JSON.stringify(arg)})`);
async function expandAll(page) {
  for (let i = 0; i < 4; i++) {
    const opened = await page.evaluate(() => { const ds = [...document.querySelectorAll('#inspector details:not([open])')]; ds.forEach(d => { d.open = true; }); return ds.length; });
    if (!opened) break; await page.waitForTimeout(250);
  }
}
async function confirmDesign(page, plot) {
  const gate = page.getByRole('button', { name: `Confirm study design… (${plot.label})`, exact: true }).first();
  if (!(await gate.count())) return false;
  await gate.click();
  const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor({ timeout: T });
  await design.getByLabel('Experimental unit').selectOption('Animal');
  await design.getByLabel('Sample relationship').selectOption('independent');
  await design.getByRole('button', { name: 'Confirm study design', exact: true }).click();
  await design.waitFor({ state: 'hidden', timeout: T });
  return true;
}

const results = [];
function report(plot, n, name, status, detail = '') {
  results.push({ plot: plot.out, n, name, status, detail });
  console.log(`${status} ${plot.out} #${n} ${name}${detail ? ' — ' + detail : ''}`);
}
async function check(plot, n, name, fn) {
  try { const r = await fn(); if (r && r.na) report(plot, n, name, 'N/A', r.na); else report(plot, n, name, 'PASS', r || ''); }
  catch (e) { report(plot, n, name, 'FAIL', String(e.message || e).split('\n')[0].slice(0, 300)); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

async function openPage(browser, cp = CP) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(`${m.text().slice(0, 300)} [${(m.location()?.url || '').replace(/sessions\/[^/]+/, 'sessions/…').replace(/^https?:\/\/[^/]+/, '')}]`); });
  page.on('response', r => { if (r.status() >= 400) console.log(`  http ${r.status()} ${r.request().method()} ${r.url().replace(/sessions\/[^/]+/, 'sessions/…').replace(/^https?:\/\/[^/]+/, '')}`); });
  page.cardPaths = new Set();
  page.on('request', r => { const m = r.url().match(/\/api\/v1(\/sessions\/[^/]+\/cards\/[^/]+)\/render/); if (m) page.cardPaths.add(m[1]); });
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(cp)}`);
  await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
  await page.waitForTimeout(2500);
  return page;
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
  return insp.getByLabel(plot.data.number).inputValue();
}

// Round 2 (F1, 2b87f1a0): Team's renderUI "Log2FC Threshold (abs):" (gridLog2fcThresh, numericInput min 0, step 0.1, default 0)
// is a computed control in the Data tab; it filters all four plots. A change redraws, -1 is refused, duplicate/reopen keep it.
// Nexo's splitLabel moves Team's tooltip sentence into help text and drops the colon before it (as for every helped label).
const THRESH = { label: /^Log2FC Threshold \(abs\):?$/, id: 'gridLog2fcThresh', to: '0.5', bad: '-1' };
async function threshValue(page) { await tab(page, 'Data'); return page.locator('#inspector').getByLabel(THRESH.label).inputValue(); }
// The saved ZIP: Team's canvas member must not carry the computed control (Team's validator rejects unknown keys); Nexo's member does.
async function zipMembers(page, saved) {
  const b64 = await page.evaluate(async u => { const r = await fetch(u); const a = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); }, `/api/v1/checkpoints/${saved}/download`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b08-zip-')), zip = path.join(dir, 'cp.zip');
  fs.writeFileSync(zip, Buffer.from(b64, 'base64'));
  const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const read = n => names.includes(n) ? execFileSync('unzip', ['-p', zip, n], { encoding: 'utf8', maxBuffer: 1 << 28 }) : null;
  const out = { names, team: read('team-canvas-v1.json'), nexo: read('nexo-canvas-v1.json') };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

async function audit(browser, plot) {
  let page = await openPage(browser);
  const insp = page.locator('#inspector');
  let id, before, label = `Audit ${plot.out}`, saved = null;
  const errorsAt = page.errors.length;
  try {
    // 1 Draws: add from the Library, it settles and shows the plot at 100 %; zoomed out it still shows it.
    await check(plot, 1, 'draws', async () => {
      // An empty canvas opens the Library by itself: the rail button would toggle it closed.
      if (await page.locator('.library-panel').isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
      await page.locator('button.library-add').first().waitFor({ state: 'attached', timeout: T });
      await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
      // The gated row confirms the design only (Library.tsx DesignDialog): the row then reads Ready and is added.
      page.designConfirmed = await confirmDesign(page, plot);
      await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
      await page.locator(`button.library-add[aria-label="Add ${plot.label}"]`).first().click({ timeout: T });
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length > 0, null, { timeout: T });
      id = (await ids(page))[0];
      await settled(page, id, ['current', 'error', 'failed']);
      const st = await stateOf(page, id);
      ok(st === 'current', `card state ${st}: ${(await card(page, id).innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
      if (await page.locator('.library-panel').isVisible()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click(); // close the Library
      await select(page, id);
      await page.locator('.zoom-pill').getByRole('button', { name: '100%', exact: true }).click().catch(() => {});
      before = await drawn(page, id);
      ok(before, 'nothing drawn');
      ok(!/Couldn.t bring back/.test(await card(page, id).innerText()), 'card says Couldn\'t bring back');
      const s1 = await shot(page, plot, '1-draws');
      for (let i = 0; i < 4; i++) await page.locator('.zoom-pill').getByRole('button', { name: /^(−|-|Zoom out)$/ }).first().click();
      await page.waitForTimeout(1500);
      const zoomed = await card(page, id).evaluate(c => ({ tier: c.dataset.tier, img: [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0), plot: [...c.querySelectorAll('.js-plotly-plot')].some(p => p.data?.length) }));
      const zoom = await page.locator('.zoom-pill').innerText();
      ok(zoomed.img || zoomed.plot, `zoomed out (${zoom.replace(/\s+/g, ' ')}) the card shows nothing (tier ${zoomed.tier})`);
      const s2 = await shot(page, plot, '1-zoomed-out');
      await select(page, id); before = await signature(page, id);
      return `${page.designConfirmed ? 'design confirmed in the Library (Animal, independent); ' : ''}${s1}, ${s2}; zoomed out tier=${zoomed.tier} ${zoomed.img ? 'image' : 'plotly'}`;
    });
    if (!id || (await stateOf(page, id)) !== 'current') return;

    // 2 Matches Team: the card's inputs are the catalog defaults, and what it shows is the module's own render.
    await check(plot, 2, 'matches-team', async () => {
      const cat = await page.evaluate(async () => (await (await fetch('/api/v1/catalog')).json()).outputs);
      const entry = cat.find(e => e.id === `${FAMILY}-${plot.out}`);
      ok(entry && entry.render === plot.render, `catalog render ${entry?.render}`);
      const shown = await dataValue(page, plot);
      const def = entry.defaults[plot.data.id] ?? plot.data.def;
      if (plot.data.number) ok(Number(shown) === Number(def), `inspector ${plot.data.id}=${shown}, catalog default ${def}`);
      else if (plot.data.select) ok(shown === def, `inspector ${plot.data.id}=${shown}, catalog default ${def}`);
      else ok((shown === plot.data.to) === (def === plot.data.to), `inspector ${plot.data.id} ${shown === plot.data.to ? 'is' : 'is not'} ${plot.data.to}, catalog default ${def}`);
      const cardPath = [...page.cardPaths].find(p => p.endsWith(`-${plot.out}`) || p.includes(id.replace(`-${plot.out}`, '')));
      ok(cardPath, 'no render request seen for the card');
      const own = await page.evaluate(async ([p, render]) => {
        const r = await fetch(`/api/v1${p}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ width: 620, height: 680, format: render === 'png' ? 'png' : 'json' }) });
        if (!r.ok) return { status: r.status, text: (await r.text()).slice(0, 200) };
        if (render === 'png') { const b = await r.blob(); const bm = await createImageBitmap(b); return { status: r.status, bytes: b.size, w: bm.width, h: bm.height }; }
        const j = await r.json(); return { status: r.status, traces: (j.figure?.data || []).map(t => t.type + ':' + (t.x || []).length), title: JSON.stringify(j.figure?.layout?.title)?.slice(0, 120) };
      }, [cardPath, plot.render]);
      ok(own.status === 200, `module render ${own.status} ${own.text || ''}`);
      const mine = await card(page, id).evaluate(c => {
        const img = c.querySelector('.body img'); if (img) return { w: img.naturalWidth, h: img.naturalHeight, box: [img.clientWidth, img.clientHeight] };
        const p = c.querySelector('.js-plotly-plot'); return { traces: p.data.map(t => t.type + ':' + (t.x || []).length), title: JSON.stringify(p.layout?.title)?.slice(0, 120) };
      });
      if (plot.render === 'png') { ok(own.w > 0 && mine.w > 0, 'empty image'); return `module render ${own.w}x${own.h} (${own.bytes} B); card image ${mine.w}x${mine.h} shown at ${mine.box.join('x')}`; }
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
      const entry = (await page.evaluate(async () => (await (await fetch('/api/v1/catalog')).json()).outputs)).find(e => e.id === `${FAMILY}-${plot.out}`);
      // Team's markup for the module (catalog `inputs`) against the Inspector; tabs show as their option labels.
      const present = await insp.locator('[role=tabpanel]').evaluate((p, want) => want.filter(w => w.type === 'tabs'
        ? !w.options.every(o => p.innerText.includes(o.label))
        : !p.querySelector(`[id="${w.id}"], [name="${w.id}"], [data-input="${w.id}"], [id^="${w.id}-"], [id$="-${w.id}"]`)).map(w => w.id), entry.inputs);
      const notMarkup = entry.allowedInputs.filter(a => !entry.inputs.some(i => i.id === a));
      // renderUI controls show only for the module tab that builds them; the Data tab lists them all.
      const missingExtra = await insp.locator('[role=tabpanel]').evaluate((p, want) => want.filter(w => !p.querySelector(`[id="${w}"], [name="${w}"], [data-input="${w}"], [id^="${w}-"], [id$="-${w}"]`)), plot.extra || []);
      const actions = (await insp.locator('[role=tabpanel]').getByRole('button').allTextContents()).map(t => t.trim()).filter(t => /Statistic Detail/.test(t));
      let changed;
      if (plot.data.radio) await insp.getByRole('radio', { name: plot.data.radio, exact: true }).check();
      else if (plot.data.select) await insp.getByLabel(plot.data.select, { exact: true }).selectOption(plot.data.to);
      else { const f = insp.getByLabel(plot.data.number); await f.fill(plot.data.to); await f.press('Enter'); await f.blur(); }
      changed = await redrawn(page, id, before);
      const s1 = await shot(page, plot, '4-data-changed');
      let refused = 'no numeric control (N/A)';
      const slider = plot.data.number && await insp.getByLabel(plot.data.number).getAttribute('type') === 'range';
      if (slider) refused = 'slider bounded like Team: an out-of-range value cannot be entered';
      if (plot.data.bad && !slider) {
        const f = insp.getByLabel(plot.data.number);
        await f.fill(plot.data.bad); await f.press('Enter'); await f.blur();
        await page.waitForTimeout(2500);
        const msg = (await page.locator('#inspector [role=alert], #inspector .field-error, #inspector [aria-invalid=true], .toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
        const after = await signature(page, id), st = await stateOf(page, id);
        const s2 = await shot(page, plot, '4-data-invalid');
        refused = `invalid ${plot.data.bad}: state=${st}, redrew=${after !== changed}, message="${msg.slice(0, 160)}" (${s2})`;
        ok(msg.length > 0 || await f.evaluate(e => !e.checkValidity()), `invalid ${plot.data.bad} accepted silently (state ${st}, redrew ${after !== changed})`);
        await f.fill(plot.data.to); await f.press('Enter'); await f.blur(); await page.waitForTimeout(1500);
      }
      before = await signature(page, id);
      let actionNote = 'no Show Statistic Detail action';
      if (actions.length) {
        await insp.getByRole('button', { name: actions[0], exact: true }).first().click();
        const dlg = page.getByRole('dialog').last();
        const seen = await dlg.waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
        const said = seen ? (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 140) : (await page.locator('.toast').allInnerTexts()).join(' | ').slice(0, 140);
        actionNote = `"${actions[0]}" → ${seen ? 'dialog' : 'no dialog'}: "${said}" (${await shot(page, plot, '4-action')})`;
        if (seen) await dlg.getByRole('button', { name: /^Close/ }).first().click().catch(() => page.keyboard.press('Escape'));
      }
      // F1 re-check: the threshold field, a change redraws, -1 refused with a message and nothing sent.
      await select(page, id); await tab(page, 'Data');
      const tf = insp.getByLabel(THRESH.label);
      const tHelp = (await insp.locator(`[id$="-${THRESH.id}"] ~ .field-help`).allInnerTexts()).join(' ').slice(0, 60);
      ok(await tf.count() === 1, `no "${THRESH.label}" field in the Data tab`);
      const t0 = await tf.inputValue(), tAttrs = await tf.evaluate(e => `min=${e.min} step=${e.step}`);
      const beforeT = await signature(page, id);
      await tf.fill(THRESH.to); await tf.blur();
      const firstT = await redrawn(page, id, beforeT);
      // The card may follow its first image with a sharper one: compare -1 against the settled image.
      await page.waitForTimeout(3000); await settled(page, id); const afterT = await signature(page, id);
      const sT = await shot(page, plot, '4-threshold-changed');
      let patches = 0; const countPatch = r => { if (r.method() === 'PATCH' && /\/cards\//.test(r.url())) patches++; };
      page.on('request', countPatch);
      await tf.fill(THRESH.bad); await tf.blur(); await page.waitForTimeout(1500);
      const tMsg = (await insp.locator('.field-error[role=alert]').allInnerTexts()).join(' | ');
      const tInvalid = await tf.getAttribute('aria-invalid'), tSig = await signature(page, id), tSt = await stateOf(page, id);
      const sTb = await shot(page, plot, '4-threshold-invalid', insp);
      page.off('request', countPatch);
      ok(tMsg.length > 0 && tInvalid === 'true', `threshold ${THRESH.bad} accepted silently (aria-invalid ${tInvalid})`);
      ok(patches === 0 && tSig === afterT, `threshold ${THRESH.bad} was sent (${patches} PATCH) or redrew (${afterT} → ${tSig}; first ${firstT})`);
      await tf.fill(THRESH.to); await tf.blur(); await page.waitForTimeout(800);
      ok(await tf.getAttribute('aria-invalid') === null, 'threshold still invalid after a valid value');
      before = await signature(page, id);
      const threshNote = `"${await insp.locator(`label[for$="-${THRESH.id}"]`).innerText()}" (${tAttrs}; help "${tHelp}…") ${t0}→${THRESH.to} redrew (${sT}); ${THRESH.bad} refused: "${tMsg}", aria-invalid, 0 PATCH, no redraw, state ${tSt} (${sTb})`;
      ok(present.length === 0, `allowedInputs without a control: ${present.join(', ')}`);
      ok(missingExtra.length === 0, `Team renderUI controls missing from the Data tab: ${missingExtra.join(', ')}; ${actionNote}`);
      return `${entry.inputs.length} Team controls all present; renderUI controls ${(plot.extra || []).join(', ')} present (allowedInputs not in Team's markup: ${notMarkup.join(', ') || 'none'}); ${plot.data.id}→${plot.data.to} redrew (${s1}); ${refused}; ${actionNote}; ${threshNote}`;
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
        const ed = insp.locator('.plot-editor');
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

    // 6 Statistics: Team has no statistics tab for the structural grid (only the Statistics Console action, check 4).
    await check(plot, 6, 'statistics', async () => {
      await select(page, id); await tab(page, 'Statistics');
      const t = (await insp.locator('[role=tabpanel]').innerText()).replace(/\s+/g, ' ').trim();
      ok(!(await insp.getByRole('button', { name: /Review and confirm/ }).count()), 'statistics offered for a structural grid plot');
      return { na: `Team has no statistics for this plot; tab says "${t.slice(-80)}"` };
    });

    // 7 Export: PNG/SVG/PDF of the card and Team's own downloads.
    await check(plot, 7, 'export', async () => {
      await select(page, id); await tab(page, 'Export');
      const notes = [];
      const png = await download(page, () => insp.getByRole('button', { name: 'Download PNG', exact: true }).click());
      ok(png.bytes.subarray(1, 4).toString() === 'PNG', 'PNG is not a PNG'); notes.push(`PNG ${png.bytes.length} B`);
      const svgB = insp.getByRole('button', { name: 'Download SVG', exact: true });
      if (await svgB.isDisabled()) notes.push(`SVG disabled ("${(await svgB.getAttribute('title')) || (await insp.locator('[role=tabpanel]').innerText()).replace(/\s+/g, ' ').match(/[^.]*SVG[^.]*\./)?.[0] || 'no reason shown'}")`);
      else { const svg = await download(page, () => svgB.click()); ok(/<svg/.test(svg.bytes.toString('utf8', 0, 4000)), 'SVG has no <svg'); notes.push(`SVG ${svg.bytes.length} B`); }
      const more = insp.getByRole('group', { name: 'More downloads from this analysis', exact: true });
      if (await more.count()) {
        for (const b of await more.getByRole('button').allTextContents()) {
          // A Team download that fails (e.g. the module's req() with no BQC replicates) must say so, not hang.
          const f = await download(page, () => more.getByRole('button', { name: b, exact: true }).click(), 60000).catch(async () => {
            const said = (await page.locator('.toast, [role=alert]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
            await shot(page, plot, `7-download-${b}-failed`);
            throw new Error(`Team ${b} produced no file within 60 s; the page said "${said.slice(0, 160)}"`);
          });
          ok(f.bytes.length > 100, `${b} is empty (${f.bytes.length} B)`);
          if (b === 'PDF') ok(f.bytes.subarray(0, 4).toString('latin1') === '%PDF', 'PDF is not a PDF');
          notes.push(`Team ${b} ${f.name} ${f.bytes.length} B`);
        }
      } else notes.push('no Team downloads');
      await insp.getByRole('button', { name: 'More export options…', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Export', exact: true }); await dialog.waitFor();
      const pdfBox = dialog.getByRole('button', { name: 'Download PDF', exact: true });
      if (await pdfBox.count()) { const pdf = await download(page, () => pdfBox.click()); ok(pdf.bytes.subarray(0, 4).toString('latin1') === '%PDF', 'card PDF is not a PDF'); notes.push(`card PDF ${pdf.bytes.length} B`); }
      else notes.push(`dialog buttons: ${(await dialog.getByRole('button').allTextContents()).join('/')}`);
      notes.push(await shot(page, plot, '7-export-dialog'));
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      return notes.join('; ');
    });

    // 8 Finish: a snapshot like the live plot; Edit figure returns to the live plot.
    await check(plot, 8, 'finish', async () => {
      await select(page, id);
      await insp.getByRole('button', { name: 'Finish plot', exact: true }).click();
      await settled(page, id, ['finished']);
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
      const v0 = await dataValue(page, plot), t0 = await threshValue(page);
      await card(page, id).getByRole('button', { name: 'Duplicate', exact: true }).first().click(); // header chrome (cards have no footer)
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 2, null, { timeout: T });
      const dup = (await ids(page)).find(x => x !== id);
      await settled(page, dup); await drawn(page, dup);
      const dupTitle = await card(page, dup).locator('.card-title').textContent();
      await select(page, dup);
      const v1 = await dataValue(page, plot);
      ok(v1 === v0, `duplicate ${plot.data.id}=${v1}, original ${v0}`);
      const t1 = await threshValue(page);
      ok(t1 === t0 && t1 === THRESH.to, `duplicate ${THRESH.id}=${t1}, original ${t0}`);
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
      return `duplicate "${dupTitle}" with ${plot.data.id}=${v1}, ${THRESH.id}=${t1}; remove + Undo brought it back drawn; ${s1}`;
    });

    // 12 Layout: at 1440x900 and 1024x768 every Inspector tab and expandable section, and the card chrome and menu:
    // nothing spills, overlaps or escapes (the layout sweep's rules, on the real API's schema).
    await check(plot, 12, 'layout', async () => {
      const notes = [], bad = [];
      for (const [w, h] of [[1440, 900], [1024, 768]]) {
        await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(600);
        await select(page, id);
        await insp.getByRole('tab').first().waitFor({ timeout: 10000 });
        const tabs = await insp.getByRole('tab').allTextContents();
        for (const t of tabs) {
          await insp.getByRole('tab', { name: t, exact: true }).click(); await page.waitForTimeout(400); await expandAll(page);
          for (const o of await inspectIn(page, { roots: [['inspector', '#inspector']], rules: ['spill', 'overlap', 'escape'], edge: '#inspector' })) bad.push(`${w}x${h} ${t} ${o.rule} ${o.selector} "${o.text}"`);
          if (t === 'Data') notes.push(await shot(page, plot, `12-layout-${w}-data`, insp));
        }
        for (const o of await inspectIn(page, { roots: [['card', `.card[data-id="${id}"] > :not(.body)`]], rules: ['spill', 'overlap'] })) bad.push(`${w}x${h} card ${o.rule} ${o.selector} "${o.text}"`);
        const more = card(page, id).locator('.card-more > button[aria-expanded]');
        if (await more.count()) {
          await more.click(); await page.waitForTimeout(300);
          for (const o of await inspectIn(page, { roots: [['card', `.card[data-id="${id}"] .card-menu`]], rules: ['spill', 'overlap'] })) bad.push(`${w}x${h} card-menu ${o.rule} ${o.selector} "${o.text}"`);
          notes.push(await shot(page, plot, `12-layout-${w}-card`));
          await more.click();
        }
        notes.push(`${w}x${h}: ${tabs.length} tabs (${tabs.join('/')})`);
      }
      await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(600);
      ok(bad.length === 0, `${bad.length} offender(s): ${[...new Set(bad)].slice(0, 6).join(' ; ')}`);
      return `0 offenders; ${notes.join('; ')}`;
    });

    // 10 Save and reopen: the plot comes back with its inputs and appearance.
    let zipNote = "";
    await check(plot, 10, 'save-reopen', async () => {
      page.setDefaultTimeout(15000);
      await select(page, id);
      const v0 = await dataValue(page, plot), t0 = await threshValue(page);
      await page.getByRole('button', { name: 'Export figure ▾', exact: true }).click();
      await page.getByRole('button', { name: 'Save checkpoint…', exact: true }).click();
      const cps = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
      await cps.getByRole('textbox', { name: 'New checkpoint name' }).fill(SAVE);
      await cps.getByRole('button', { name: 'Save current analysis', exact: true }).click();
      await page.locator('.toast', { hasText: `Saved checkpoint ${SAVE}` }).waitFor({ timeout: T });
      saved = new URL(page.url()).searchParams.get('checkpoint');
      ok(/^[a-f0-9]{64}$/.test(saved), `saved id ${saved}`);
      // Saved through Team's ack gate (api_checkpoint_save → api_canvas_validate); the ZIP keeps the threshold out of Team's member.
      const z = await zipMembers(page, saved);
      ok(z.team && !z.team.includes(THRESH.id), `team-canvas-v1.json ${z.team ? 'carries ' + THRESH.id : 'missing'}`);
      ok(z.nexo && new RegExp(`"${THRESH.id}":\\s*${THRESH.to}`).test(z.nexo), `nexo-canvas-v1.json does not keep ${THRESH.id}=${THRESH.to}`);
      zipNote = `ZIP members ${z.names.join(', ')}; Team canvas without ${THRESH.id}, Nexo member ${THRESH.id}=${THRESH.to}`;
      page.auditErrors = page.errors.slice(errorsAt);
      await page.context().close();
      page = await openPage(browser, saved);
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: T });
      const rid = (await ids(page))[0];
      await settled(page, rid); await drawn(page, rid);
      const title = await card(page, rid).locator('.card-title').textContent();
      const bgc = await card(page, rid).evaluate(c => getComputedStyle(c).backgroundColor + '/' + getComputedStyle(c.querySelector('.body')).backgroundColor);
      await select(page, rid);
      const v1 = await dataValue(page, plot), t1 = await threshValue(page);
      const s1 = await shot(page, plot, '10-reopened');
      ok(title === label, `reopened title "${title}"`);
      ok(v1 === v0, `reopened ${plot.data.id}=${v1}, saved ${v0}`);
      ok(t1 === t0 && t1 === THRESH.to, `reopened ${THRESH.id}=${t1}, saved ${t0}`);
      ok(/255, 244, 224/.test(bgc), `reopened background ${bgc}`);
      return `reopened ${saved.slice(0, 12)}…: "${title}", ${plot.data.id}=${v1}, ${THRESH.id}=${t1}, background kept; ${s1}; saved through Team's validator (ack gate, 200); ${zipNote}`;
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
