'use strict';
// Chart audit, batch b07-structure (docs/integration/nexo-chart-audit-plan.md): the 11-row checklist per plot plus
// check 12 "Layout", in a real browser against the synthetic-only audit API. Same structure, checks and evidence names
// as audit_b03-qc-b.cjs. Needs the batch Vite on :5187 (vite.audit.config.mjs) and the API on 127.0.0.1:3961.
//   node tests/dual-ui/chart-audit/audit_b07-structure.cjs [outputName ...]
// One page at a time (the API holds two sessions in total). Writes screenshots to docs/integration/chart-audit/b07-structure/.
// Differences from b03: the structural plots that need a differential design are added after "Confirm study design…"
// (as a user does in the Library); several plots only draw after the module's own Data-tab actions ("Initiate
// Structural Analysis", "Load Species Plot"), which the script clicks like a user and proves the card redraws; cards
// have no footer, so Duplicate is the header button; Team labels repeat ("Text Size:" twice), so controls are found by id.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5187';
const CP = 'nexo-complete-synthetic', SAVE = 'audit-b07-structure-synthetic', FAMILY = 'structural_tab';
const shots = path.join(root, 'docs/integration/chart-audit/b07-structure');
const T = 180000;
fs.mkdirSync(shots, { recursive: true });

// Per plot: the Library label, how it draws, the module actions a user runs first, and one Data control a user
// changes (by id; `to: '*'` = the first other choice; `bad` = an invalid value for a numeric field).
const RUN = 'Initiate Structural Analysis';
const PLOTS = [
  { out: 'summaryPlot', label: 'Structural remodeling shifts', render: 'png', actions: [RUN], data: { kind: 'number', id: 'textSize', to: '14', bad: '2' } },
  { out: 'speciesPlotPlot', label: 'Species structural features', render: 'png', actions: [RUN, 'Load Species Plot'], data: { kind: 'radio', id: 'classLabelFormat', to: '*' } },
  { out: 'networkPlot', label: 'Correlation network', render: 'png', actions: [RUN], network: true, designVia: 'Structural remodeling shifts', data: { kind: 'select', id: 'networkLayout', to: '*' } },
  { out: 'propPlotPlot', label: 'Acyl chain proportions', render: 'png', actions: [], data: { kind: 'boolean', id: 'prop_enable_donut', to: 'true' } },
  { out: 'diffAcylPlot', label: 'Acyl chain remodeling', render: 'png', actions: [], data: { kind: 'number', id: 'diff_p_cutoff', to: '0.1', bad: '2' } },
];

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
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text().slice(0, 300)); });
  page.on('response', async r => { if (r.status() >= 400) console.log(`  http ${r.status()} ${r.request().method()} ${r.url().replace(/sessions\/[^/]+/, 'sessions/…').replace(/^https?:\/\/[^/]+/, '')}${r.status() >= 500 ? ' ' + (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) : ''}`); });
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
async function select(page, id) { await fit(page); await card(page, id).locator('header .card-title').click(); }
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
// Controls by id: Team repeats labels across sub-tabs ("Text Size:", "Violin Dot Size:").
const field = (page, plot) => page.locator(`#inspector [role=tabpanel] [id="${plot.data.id}"]`);
async function dataValue(page, plot) {
  await tab(page, 'Data');
  const insp = page.locator('#inspector');
  await insp.locator('.schema-form').waitFor({ timeout: T });
  if (plot.data.kind === 'radio') return insp.locator(`input[type=radio][name="${plot.data.id}"]`).evaluateAll(rs => rs.find(r => r.checked)?.value ?? '');
  if (plot.data.kind === 'boolean') return String(await field(page, plot).isChecked());
  return field(page, plot).inputValue();
}
// '*' = the first choice other than the current one.
async function target(page, plot) {
  if (plot.data.to !== '*') return plot.data.to;
  const cur = await dataValue(page, plot);
  const opts = plot.data.kind === 'radio'
    ? await page.locator(`#inspector input[type=radio][name="${plot.data.id}"]`).evaluateAll(rs => rs.map(r => r.value))
    : await field(page, plot).evaluate(s => [...s.options].map(o => o.value));
  const to = opts.find(o => o !== cur); ok(to !== undefined, `${plot.data.id} has no other choice (${opts.join('/')})`);
  plot.data.to = to; return to;
}
async function setData(page, plot, value) {
  const insp = page.locator('#inspector');
  if (plot.data.kind === 'radio') await insp.locator(`input[type=radio][name="${plot.data.id}"][value="${value}"]`).check();
  else if (plot.data.kind === 'select') await field(page, plot).selectOption(value);
  else if (plot.data.kind === 'boolean') await field(page, plot).setChecked(value === 'true');
  else { const f = field(page, plot); await f.fill(value); await f.press('Enter'); await f.blur(); }
}
// Library: the gated rows open Team's Review step ("Confirm study design…") first, as a user does.
async function addFromLibrary(page, plot) {
  // The Library may already be open (the Plots rail button toggles it): open it only when hidden, then search.
  if (!(await page.locator('.library-panel').isVisible())) await page.getByRole('button', { name: /^Plots/ }).first().click();
  await page.locator('button.library-add').first().waitFor({ state: 'attached', timeout: T });
  const find = async () => { await page.getByRole('searchbox', { name: 'Search plots', exact: true }).fill(plot.label); await page.waitForTimeout(500); };
  await find();
  // Team gates the correlation network on a confirmed independent design; an API without the catalog gate
  // (needs "de", fixed in frontends/nexo-api/catalog.R) offers no step for it, so confirm through a gated row.
  if (plot.designVia && !(await page.locator(`button.library-add[aria-label="Confirm study design… (${plot.label})"]`).count())) {
    await page.getByRole('searchbox', { name: 'Search plots', exact: true }).fill(plot.designVia); await page.waitForTimeout(500);
  }
  const gate = page.locator(`button.library-add[aria-label="Confirm study design… (${plot.designVia && !(await page.locator(`button.library-add[aria-label="Confirm study design… (${plot.label})"]`).count()) ? plot.designVia : plot.label})"]`).first();
  let note = 'added from the Library';
  if (await gate.count()) {
    await gate.click();
    const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
    await design.getByLabel('Experimental unit').selectOption('Animal');
    await design.getByLabel('Sample relationship').selectOption('independent');
    await design.getByRole('button', { name: 'Confirm study design', exact: true }).click();
    await design.waitFor({ state: 'hidden', timeout: T });
    note = 'study design confirmed (Animal, independent), then added from the Library';
    await find();
  }
  await page.locator(`button.library-add[aria-label="Add ${plot.label}"]`).first().click({ timeout: T });
  return note;
}
// The module's own actions in the Data tab (Team's buttons), clicked like a user; returns what each did.
async function runActions(page, plot, id) {
  const notes = [];
  for (const a of plot.actions) {
    await select(page, id); await tab(page, 'Data');
    const b = page.locator('#inspector .module-action', { hasText: a }).first();
    await b.waitFor({ timeout: 30000 }).catch(() => {});
    ok(await b.count(), `module action "${a}" not in the Data tab (actions: ${(await page.locator('#inspector .module-action').allTextContents()).join(' / ') || 'none'})`);
    const before = await signature(page, id);
    await b.click();
    // The first action turns Team's "Click 'Initiate…'" placeholder into the plot: it must redraw. A later action
    // (e.g. "Load Species Plot" after the analysis already drew the species plot) may give back the same image.
    const first = a === plot.actions[0];
    const after = await redrawn(page, id, before).catch(() => null);
    if (!after) await settled(page, id, ['current', 'error', 'failed']);
    const st = await stateOf(page, id);
    const file = await shot(page, plot, `1-action-${plot.actions.indexOf(a) + 1}`);
    notes.push(`"${a}" → ${after ? 'card redrew' : `same image, state ${st}`} (${file})`);
    ok(after || (!first && st === 'current'), `"${a}" did not redraw the card (state ${st})`);
  }
  return notes;
}

// Check 12: at 1440x900 and 1024x768, every Inspector tab with every <details> open: nothing spills out of the
// inspector, nothing is clipped without a tooltip, no two sibling controls overlap, the card header pieces do not overlap.
async function layout(page, plot, id) {
  const notes = [], bad = [];
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(600);
    await select(page, id);
    const tabs = await page.locator('#inspector [role=tab]').allTextContents();
    for (const t of tabs) {
      await tab(page, t.trim()); await page.waitForTimeout(500);
      await page.locator('#inspector').evaluate(e => e.querySelectorAll('details').forEach(d => { d.open = true; }));
      await page.waitForTimeout(300);
      const found = await page.locator('#inspector').evaluate(insp => {
        const out = [], box = insp.getBoundingClientRect();
        const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const name = e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''} "${(e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40)}"`;
        const els = [...insp.querySelectorAll('label, button, input, select, textarea, legend, summary, .choice-list, .segmented, .field-help, h2, h3, p, small')].filter(vis);
        for (const e of els) {
          const r = e.getBoundingClientRect();
          if (r.right > box.right + 1 || r.left < box.left - 1) out.push(`spills out of the inspector: ${name(e)} (${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(box.left)}–${Math.round(box.right)})`);
          const s = getComputedStyle(e);
          if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && /hidden|clip/.test(s.overflowX + s.overflow) && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && !e.title && !e.dataset.tip && !e.closest('[title]')) out.push(`clipped without tooltip: ${name(e)}`);
        }
        // Siblings in the same row/field must not overlap.
        for (const p of insp.querySelectorAll('.field, .choice-list, .segmented, .selection-actions, .range-pair, fieldset, .plot-editor details, [role=tabpanel] > *')) {
          const kids = [...p.children].filter(vis);
          for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
            const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
            const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ix > 2 && iy > 2 && getComputedStyle(kids[i]).position !== 'absolute' && getComputedStyle(kids[j]).position !== 'absolute') out.push(`overlap: ${name(kids[i])} × ${name(kids[j])}`);
          }
        }
        return [...new Set(out)];
      });
      for (const f of found) bad.push(`${w}x${h} ${t.trim()}: ${f}`);
      const file = await shot(page, plot, `12-layout-${w}-${t.trim().toLowerCase()}`, page.locator('#inspector'));
      notes.push(file);
    }
    // The card header: status, title, Edit/Duplicate/⋯ must not overlap or spill out of the card.
    const head = await card(page, id).evaluate(c => {
      const h = c.querySelector('header'), hb = h.getBoundingClientRect(), out = [];
      const parts = [...h.querySelectorAll('.card-status, .card-title, .card-actions > button, .card-more > button')].filter(e => e.getBoundingClientRect().width > 0);
      for (const e of parts) { const r = e.getBoundingClientRect(); if (r.right > hb.right + 1 || r.left < hb.left - 1) out.push(`header part spills: ${e.className || e.getAttribute('aria-label')}`); }
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i].getBoundingClientRect(), b = parts[j].getBoundingClientRect();
        if (parts[i].contains(parts[j]) || parts[j].contains(parts[i])) continue;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push(`header overlap: ${parts[i].className || parts[i].getAttribute('aria-label')} × ${parts[j].className || parts[j].getAttribute('aria-label')}`);
      }
      const t = h.querySelector('.card-title');
      if (t && t.scrollWidth > t.clientWidth + 1 && !t.title && !t.dataset.tip) out.push('card title clipped without tooltip');
      return out;
    });
    for (const f of head) bad.push(`${w}x${h} card header: ${f}`);
    notes.push(await shot(page, plot, `12-layout-${w}-card`, card(page, id)));
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(400);
  ok(bad.length === 0, `${bad.length} layout offender(s): ${bad.slice(0, 6).join(' | ')}`);
  return `2 sizes × ${notes.length / 2 - 1} Inspector tabs, every <details> open, 0 offenders; ${notes.filter(n => /-(data|card)\.png$/.test(n)).join(', ')}`;
}

async function audit(browser, plot) {
  let page = await openPage(browser);
  const insp = page.locator('#inspector');
  let id, before, label = `Audit ${plot.out}`, saved = null;
  const errorsAt = page.errors.length;
  try {
    // 1 Draws: add from the Library, run the module's actions, it shows the plot at 100 %; zoomed out it still shows it.
    await check(plot, 1, 'draws', async () => {
      const how = await addFromLibrary(page, plot);
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length > 0, null, { timeout: T });
      id = (await ids(page))[0];
      await settled(page, id, ['current', 'error', 'failed']);
      const st = await stateOf(page, id);
      ok(st === 'current', `card state ${st}: ${(await card(page, id).innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
      await page.getByRole('button', { name: /^(Close library|Hide library)$/ }).first().click().catch(() => {});
      await select(page, id);
      await page.locator('.zoom-pill').getByRole('button', { name: '100%', exact: true }).click().catch(() => {});
      before = await drawn(page, id);
      const s0 = await shot(page, plot, '1-before-actions');
      const acted = await runActions(page, plot, id);
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
      return `${how}; ${acted.join('; ') || 'no module action needed'}; ${s0} → ${s1}, ${s2}; zoomed out tier=${zoomed.tier} ${zoomed.img ? 'image' : 'plotly'}`;
    });
    if (!id || (await stateOf(page, id)) !== 'current') return;

    // 2 Matches Team: the card's inputs are the catalog defaults, and what it shows is the module's own render.
    await check(plot, 2, 'matches-team', async () => {
      const cat = await page.evaluate(async () => (await (await fetch('/api/v1/catalog')).json()).outputs);
      const entry = cat.find(e => e.id === `${FAMILY}-${plot.out}`);
      ok(entry && entry.render === plot.render, `catalog render ${entry?.render}`);
      const shown = await dataValue(page, plot);
      const def = entry.defaults[plot.data.id];
      if (def !== undefined) ok(plot.data.kind === 'number' ? Number(shown) === Number(def) : String(shown) === String(def), `inspector ${plot.data.id}=${shown}, catalog default ${def}`);
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
      ok(own.w > 0 && mine.w > 0, 'empty image');
      return `module render ${own.w}x${own.h} (${own.bytes} B); card image ${mine.w}x${mine.h} shown at ${mine.box.join('x')}; ${plot.data.id}=${shown} (catalog default ${def})`;
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
      let net = '';
      if (plot.network) {
        // A network inside a card: wheel and drag on the card body must move the canvas camera (one owner), never an
        // inner pan/zoom fighting it.
        await select(page, id);
        const cam = () => page.evaluate(() => getComputedStyle(document.querySelector('#world')).transform);
        const zoomTxt = async () => (await page.locator('.zoom-pill').innerText()).replace(/\s+/g, ' ');
        const bb = await card(page, id).locator('.body').boundingBox();
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        const c0 = await cam(), z0 = await zoomTxt();
        await page.mouse.wheel(0, 200); await page.waitForTimeout(600);
        const c1 = await cam();
        await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); await page.waitForTimeout(600);
        const c2 = await cam(), z2 = await zoomTxt();
        const inner = await card(page, id).evaluate(c => ({ canvas: c.querySelectorAll('.body canvas').length, vis: c.querySelectorAll('.vis-network').length, transformed: [...c.querySelectorAll('.body img')].some(i => getComputedStyle(i).transform !== 'none') }));
        const sig = await signature(page, id);
        ok(c1 !== c0, 'wheel over the network card did not move the canvas camera');
        ok(c2 !== c1 && z2 !== z0, `Ctrl+wheel over the network card did not zoom the canvas (${z0} → ${z2})`);
        ok(!inner.vis && !inner.canvas && !inner.transformed, `the card has its own pan/zoom (${JSON.stringify(inner)})`);
        // Zooming the canvas may fetch the image again at the new scale (a new src); it must still be drawn and contained.
        ok(sig && sig.startsWith('img:'), `after the wheel the card shows ${sig}`);
        const fitIn = await card(page, id).evaluate(c => { const b = c.querySelector('.body').getBoundingClientRect(), i = c.querySelector('.body img').getBoundingClientRect(); return i.right <= b.right + 2 && i.bottom <= b.bottom + 2; });
        ok(fitIn, 'after the wheel the image overflows the card body');
        net = `; network: wheel over the card pans the canvas camera, Ctrl+wheel zooms it (${z0} → ${z2}); the PNG has no inner pan/zoom (${JSON.stringify(inner)})`;
        await fit(page);
      }
      return `${Math.round(box0.width)}→${Math.round(box1.width)}→${Math.round(box2.width)} px wide, redrawn each time; ${s1}, ${s2}${net}`;
    });

    // 4 Data tab: Team's controls are all there; a change redraws; an invalid value is refused with a message.
    await check(plot, 4, 'data-tab', async () => {
      await select(page, id); await tab(page, 'Data');
      await insp.locator('.schema-form').waitFor({ timeout: T });
      const entry = (await page.evaluate(async () => (await (await fetch('/api/v1/catalog')).json()).outputs)).find(e => e.id === `${FAMILY}-${plot.out}`);
      const present = await insp.locator('[role=tabpanel]').evaluate((p, want) => want.filter(w => w.type === 'tabs'
        ? !w.options.every(o => p.innerText.includes(o.label))
        : !p.querySelector(`[id="${w.id}"], [name="${w.id}"], [data-input="${w.id}"], [id^="${w.id}-"], [id$="-${w.id}"]`)).map(w => w.id), entry.inputs);
      const notMarkup = entry.allowedInputs.filter(a => !entry.inputs.some(i => i.id === a));
      const actions = await insp.locator('.module-action').allTextContents();
      const to = await target(page, plot);
      await setData(page, plot, to);
      const changed = await redrawn(page, id, before);
      const s1 = await shot(page, plot, '4-data-changed');
      let refused = 'no numeric control (N/A)';
      if (plot.data.bad) {
        const f = field(page, plot);
        await f.fill(plot.data.bad); await f.press('Enter'); await f.blur();
        await page.waitForTimeout(2500);
        const msg = (await page.locator('#inspector [role=alert], #inspector .field-error, #inspector [aria-invalid=true], .toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
        const after = await signature(page, id), st = await stateOf(page, id);
        const s2 = await shot(page, plot, '4-data-invalid');
        refused = `invalid ${plot.data.bad}: state=${st}, redrew=${after !== changed}, message="${msg.slice(0, 160)}" (${s2})`;
        ok(msg.length > 0 || await f.evaluate(e => !e.checkValidity()), `invalid ${plot.data.bad} accepted silently (state ${st}, redrew ${after !== changed})`);
        await f.fill(plot.data.to); await f.press('Enter'); await f.blur(); await page.waitForTimeout(2500);
        await settled(page, id, ['current', 'error', 'failed']);
      }
      before = await signature(page, id);
      ok(present.length === 0, `allowedInputs without a control: ${present.join(', ')}`);
      return `${entry.inputs.length} Team controls all present (allowedInputs not in Team's markup: ${notMarkup.join(', ') || 'none'}); module actions: ${actions.join(' / ') || 'none'}; ${plot.data.id}→${to} redrew (${s1}); ${refused}`;
    });

    // 5 Appearance tab (image plots: Label, Background, Size; nothing Plotly-only that would silently do nothing).
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
      // Plotly-only controls (the colour-blind preview also uses .plot-editor and is valid for images).
      ok(!(await insp.getByLabel('Plot title', { exact: true }).count()) && !(await insp.getByRole('group', { name: 'Color palette', exact: true }).count()), 'Plotly-only controls (Plot title / Color palette) offered for an image plot');
      const extra = await insp.locator('[role=tabpanel] :is(input,select,button)').count();
      notes.push(`image plot: ${extra} controls (Label, Background, Size) — no plot-level controls that would silently do nothing`);
      notes.push(await shot(page, plot, '5-appearance'));
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

    // 6 Statistics: the structural plots have no Nexo statistics workflow (Team's "Show Statistic Detail" is a
    // module action in the Data tab, checked in #4); the tab must say so and offer no review.
    await check(plot, 6, 'statistics', async () => {
      await select(page, id); await tab(page, 'Statistics');
      const t = (await insp.locator('[role=tabpanel]').innerText()).replace(/\s+/g, ' ').trim();
      ok(!(await insp.getByRole('button', { name: /Review and confirm/ }).count()), 'statistics review offered for a structural plot');
      return { na: `no Nexo statistics workflow for this plot; tab says "${t.slice(-80)}"` };
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
          const f = await download(page, () => more.getByRole('button', { name: b, exact: true }).click(), 60000).catch(async () => {
            const said = (await page.locator('.toast, [role=alert]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
            await shot(page, plot, `7-download-${b.replace(/\W+/g, '_')}-failed`);
            throw new Error(`Team ${b} produced no file within 60 s; the page said "${said.slice(0, 160)}"`);
          });
          ok(f.bytes.length > 100, `${b} is empty (${f.bytes.length} B)`);
          if (/PDF/.test(b)) ok(f.bytes.subarray(0, 4).toString('latin1') === '%PDF', `${b} is not a PDF`);
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
      const notice = await card(page, id).locator('.card-export-notice').isVisible();
      ok(!notice, 'finished card shows "Plot changed — export again."');
      const s1 = await shot(page, plot, '8-finished');
      await insp.getByRole('button', { name: 'Edit figure', exact: true }).click();
      await settled(page, id, ['current']);
      before = await drawn(page, id);
      ok(before.startsWith('img:'), `after Edit figure the card shows ${before.slice(0, 20)}`);
      return `snapshot ${snap.w}x${snap.h} in a ${Math.round(body.width)}x${Math.round(body.height)} body; Edit figure → live ${plot.render}; ${s1}`;
    });

    // 9 Duplicate keeps inputs and appearance; remove + Undo restores.
    await check(plot, 9, 'duplicate-remove-undo', async () => {
      await select(page, id);
      const v0 = await dataValue(page, plot);
      await card(page, id).locator('header .card-actions').getByRole('button', { name: 'Duplicate', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 2, null, { timeout: T });
      const dup = (await ids(page)).find(x => x !== id);
      await settled(page, dup); await drawn(page, dup);
      const dupTitle = await card(page, dup).locator('.card-title').textContent();
      const dupBg = await card(page, dup).evaluate(c => getComputedStyle(c).backgroundColor);
      await select(page, dup);
      const v1 = await dataValue(page, plot);
      ok(v1 === v0, `duplicate ${plot.data.id}=${v1}, original ${v0}`);
      ok(dupTitle.startsWith(label), `duplicate title "${dupTitle}"`);
      ok(/255, 244, 224/.test(dupBg), `duplicate background ${dupBg}`);
      const s1 = await shot(page, plot, '9-duplicate');
      const remove = async () => {
        await card(page, dup).getByRole('button', { name: 'More card actions' }).first().click();
        await card(page, dup).locator('.card-menu').getByRole('button', { name: 'Remove', exact: true }).click();
        if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: /^Remove/ }).click();
        await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: 10000 });
      };
      await remove();
      await page.getByRole('button', { name: /^↶ Undo$/ }).click();
      await page.waitForFunction(d => !!document.querySelector(`.card[data-id="${d}"]`), dup, { timeout: 10000 });
      await settled(page, dup); await drawn(page, dup);
      await remove(); // leave one card for the save check
      return `duplicate "${dupTitle}" with ${plot.data.id}=${v1}, background kept; remove + Undo brought it back drawn; ${s1}`;
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
      page.setDefaultTimeout(30000);
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: T });
      const rid = (await ids(page))[0];
      await settled(page, rid); await drawn(page, rid);
      const title = await card(page, rid).locator('.card-title').textContent();
      const bgc = await card(page, rid).evaluate(c => getComputedStyle(c).backgroundColor + '/' + getComputedStyle(c.querySelector('.body')).backgroundColor);
      await select(page, rid);
      const v1 = await dataValue(page, plot);
      const s1 = await shot(page, plot, '10-reopened');
      ok(title === label, `reopened title "${title}"`);
      ok(v1 === v0, `reopened ${plot.data.id}=${v1}, saved ${v0}`);
      ok(/255, 244, 224/.test(bgc), `reopened background ${bgc}`);
      id = rid;
      return `reopened ${saved.slice(0, 12)}…: "${title}", ${plot.data.id}=${v1}, background kept; ${s1}`;
    });

    // 12 Layout at two window sizes (on the reopened page when #10 ran).
    await check(plot, 12, 'layout', () => layout(page, plot, id));
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
