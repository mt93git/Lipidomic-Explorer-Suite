'use strict';
// Chart audit, batch b01-dashboard: the 11-row checklist of docs/integration/nexo-chart-audit-plan.md, per plot,
// in Chromium 1440x900 against the synthetic-only audit API (Vite on :5181 proxies /api to 127.0.0.1:3961).
//   node tests/dual-ui/chart-audit/audit_b01-dashboard.cjs [pca,violin,dist,comp,heat]
// Env: NEXO_AUDIT_CHECKS (e.g. 4,9: only those checks after 1), NEXO_AUDIT_BASE (default http://127.0.0.1:5181), NEXO_AUDIT_SHOTS (default docs/integration/chart-audit/b01-dashboard).
// Acts only through what a user sees (roles, labels, visible text); the DOM, data-id and API responses are read for state only.
// Prints one PASS/FAIL/N/A line per plot and check; exit code 1 if any FAIL.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = (process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5181').replace(/\/$/, '');
const shots = path.resolve(root, process.env.NEXO_AUDIT_SHOTS || 'docs/integration/chart-audit/b01-dashboard');
const dl = '/tmp/nexo-audit-b01-downloads';
const CHECKPOINT = 'nexo-complete-synthetic', SAVE_AS = 'audit-b01-dashboard-synthetic';
const T = 180000;
// Team's "Data & settings" drawer for a dashboard card: color_by plus the plot's own keys (www/team/js/canvas.js:405-409)
const TEAM_KEYS = { pca: ['color_by', 'pca_transform', 'pca_scale'], violin: ['color_by', 'violin_lipid'], dist: ['color_by'], comp: ['color_by'], heat: ['color_by', 'top_n'] };
const PLOTS = {
  pca: { source: 'results_dashboard-plot_pca', label: 'Principal components' },
  violin: { source: 'results_dashboard-plot_violin', label: 'Feature distributions' },
  dist: { source: 'results_dashboard-plot_dist', label: 'Signal distribution' },
  comp: { source: 'results_dashboard-plot_comp', label: 'Composition overview' },
  heat: { source: 'results_dashboard-plot_heat', label: 'Abundance heatmap' },
};
const wanted = (process.argv[2] || Object.keys(PLOTS).join(',')).split(',').map(s => s.trim()).filter(Boolean);
const results = [];
function record(plot, check, status, detail) {
  results.push({ plot, check, status, detail });
  console.log(`${status} ${plot} ${check}${detail ? ' — ' + String(detail).replace(/\s+/g, ' ').slice(0, 2400) : ''}`);
}

// ---------- page helpers (pattern of tests/dual-ui/pilot/pilot_figure1.cjs) ----------
const cardFor = (page, id) => page.locator(`#world .card[data-id="${id}"]`);
const ids = page => page.locator('#world .card').evaluateAll(cs => cs.map(c => c.dataset.id));
const inspector = page => page.locator('#inspector');
async function settled(page, id, states = ['current']) {
  await page.waitForFunction(([sel, ok]) => ok.includes(document.querySelector(sel + ' .card-status')?.dataset.state), [`#world .card[data-id="${id}"]`, states], { timeout: T });
}
async function drawn(page, id, kind = 'any') {
  await page.waitForFunction(([sel, kind]) => {
    const c = document.querySelector(sel); if (!c) return false;
    const img = [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0);
    const plot = [...c.querySelectorAll('.js-plotly-plot')].some(p => (p.data?.length ?? 0) > 0);
    return kind === 'plot' ? plot : kind === 'img' ? img : img || plot;
  }, [`#world .card[data-id="${id}"]`, kind], { timeout: T });
}
const gd = (page, id, fn) => cardFor(page, id).evaluate((c, src) => { const p = c.querySelector('.js-plotly-plot'); return p ? (0, eval)(src)(p) : null; }, `(${fn})`);
const signature = (page, id) => cardFor(page, id).evaluate(c => JSON.stringify([
  [...c.querySelectorAll('img')].map(i => i.getAttribute('src')?.slice(-80)),
  [...c.querySelectorAll('.js-plotly-plot')].map(p => JSON.stringify((p.data || []).map(t => [t.name, t.type, t.x?.length, t.y?.length, JSON.stringify(t.y?.slice?.(0, 3) ?? null), JSON.stringify(t.z?.[0]?.slice?.(0, 3) ?? null), JSON.stringify(t.x?.slice?.(0, 3) ?? null)])))])).catch(() => '');
// the API may send Team's packed distribution payload ({teamRepeat, n}); count its points as Team unpacks them
const traceSummary = data => (data || []).map(t => ({ type: t.type || 'scatter', name: t.name ?? null, n: Array.isArray(t.x) ? t.x.length : Array.isArray(t.y) ? t.y.length : Array.isArray(t.z) ? t.z.length : Number.isSafeInteger(t.x?.n) ? t.x.n : 0 }));
async function waitRedraw(page, id, before, timeout = 90000) {
  await page.waitForFunction(([sel, b]) => {
    const c = document.querySelector(sel); if (!c) return false;
    const now = JSON.stringify([[...c.querySelectorAll('img')].map(i => i.getAttribute('src')?.slice(-80)),
      [...c.querySelectorAll('.js-plotly-plot')].map(p => JSON.stringify((p.data || []).map(t => [t.name, t.type, t.x?.length, t.y?.length, JSON.stringify(t.y?.slice?.(0, 3) ?? null), JSON.stringify(t.z?.[0]?.slice?.(0, 3) ?? null), JSON.stringify(t.x?.slice?.(0, 3) ?? null)])))]);
    return now !== b && c.querySelector('.card-status')?.dataset.state === 'current';
  }, [`#world .card[data-id="${id}"]`, before], { timeout });
}
async function fit(page) { await page.getByRole('button', { name: 'Fit', exact: true }).click(); await page.waitForTimeout(400); }
const zoomPct = page => page.locator('.zoom-pill span').first().innerText().catch(() => '?');
// Wave 1: a tab opens fitted to its cards (often < 50 %, plots frozen); a plain click on a card there flies the camera to it (click to focus) and makes it live
async function focusCard(page, id) {
  await fit(page);
  await cardFor(page, id).locator('header strong').first().click();
  await page.waitForFunction(sel => document.querySelector(sel)?.classList.contains('selected'), `#world .card[data-id="${id}"]`, { timeout: T });
  await page.waitForTimeout(800);
  await drawn(page, id, 'plot');
  return zoomPct(page);
}
async function hundred(page) { await page.getByRole('button', { name: '100%', exact: true }).last().click(); await page.waitForTimeout(400); }
async function selectCard(page, id) {
  // the header must sit inside the visible canvas (not under the tabs/status band or the side panels)
  const box = await cardFor(page, id).locator('header').boundingBox();
  const area = await page.locator('.canvas-body').first().boundingBox();
  if (!box || !area || box.x < area.x || box.y < area.y || box.x + 60 > area.x + area.width || box.y + 30 > area.y + area.height) await fit(page);
  await cardFor(page, id).locator('header strong').first().click();
  await page.waitForFunction(sel => document.querySelector(sel)?.classList.contains('selected'), `#world .card[data-id="${id}"]`, { timeout: T });
}
async function inspectorTab(page, name) {
  const tab = inspector(page).getByRole('tab', { name, exact: true });
  if (!(await tab.count())) return false;
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  return true;
}
async function openPlots(page) {
  const panel = page.getByRole('complementary', { name: 'Library' });
  if (!(await panel.isVisible().catch(() => false))) await page.getByRole('navigation', { name: 'Canvas tools' }).getByRole('button', { name: 'Plots', exact: true }).click();
  const tab = panel.getByRole('tab', { name: 'Plots', exact: true });
  if (await tab.getAttribute('aria-selected', { timeout: T }) !== 'true') await tab.click();
  return panel;
}
async function closeLibrary(page) {
  for (const name of ['Close library', 'Hide library']) { const b = page.getByRole('button', { name, exact: true }); if (await b.isVisible().catch(() => false)) { await b.click(); return; } }
}
async function addPlot(page, label) {
  const panel = await openPlots(page);
  await panel.getByRole('searchbox', { name: 'Search plots' }).fill(label);
  const before = await ids(page);
  await panel.getByRole('button', { name: `Add ${label}`, exact: true }).click({ timeout: T });
  await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before.length, { timeout: T });
  const id = (await ids(page)).find(x => !before.includes(x));
  if (!id) throw new Error(`no new card for ${label}`);
  await panel.getByRole('searchbox', { name: 'Search plots' }).fill('');
  return id;
}
async function cardMenu(page, id, item) {
  await cardFor(page, id).getByRole('button', { name: 'More card actions', exact: true }).click();
  await cardFor(page, id).getByRole('group', { name: 'More card actions' }).getByRole('button', { name: item, exact: true }).click();
}
async function download(page, act) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: T }), act()]);
  const file = path.join(dl, d.suggestedFilename()); await d.saveAs(file);
  return { name: d.suggestedFilename(), size: fs.statSync(file).size, head: fs.readFileSync(file).subarray(0, 8).toString('latin1') };
}
async function shot(page, name, id) {
  const file = path.join(shots, `${name}.png`);
  if (id) await cardFor(page, id).screenshot({ path: file }).catch(() => page.screenshot({ path: file }));
  else await page.screenshot({ path: file });
  // keep evidence <= 400 KB: fall back to a JPEG-like smaller viewport screenshot is not PNG; shrink by clipping instead
  if (fs.statSync(file).size > 400 * 1024) await page.screenshot({ path: file, scale: 'css', clip: { x: 0, y: 0, width: 1100, height: 700 } });
  return path.relative(root, file);
}
async function waitShell(page) { await page.getByRole('button', { name: 'Export figure ▾', exact: true }).or(page.getByRole('button', { name: /^Export figure/ })).first().waitFor({ timeout: T }); }
async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  const api = { renders: [], schemas: [] };
  page.on('response', async r => {
    const u = r.url();
    if (r.status() >= 400 && u.includes('/api/')) { const body = await r.text().catch(() => ''); errors.http = errors.http || []; errors.http.push(`${r.request().method()} ${u.replace(/^.*\/api\/v1/, '')} → ${r.status()} ${body.replace(/\s+/g, ' ').slice(0, 200)}`); console.log(`  http ${r.status()} ${r.request().method()} ${u.replace(/^.*\/api\/v1/, '')} ${body.replace(/\s+/g, ' ').slice(0, 200)}`); }
    try {
      if (/\/cards\/[^/]+\/render$/.test(u) && r.request().method() === 'POST' && r.ok()) api.renders.push({ url: u, body: await r.json() });
      else if (/\/cards\/[^/]+(\/schema)?$/.test(u) && r.request().method() === 'GET' && r.ok()) api.schemas.push({ url: u, body: await r.json() });
    } catch {}
  });
  return { context, page, errors, api };
}
async function openCheckpoint(page, id) {
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(id)}`);
  await waitShell(page);
  await page.waitForTimeout(1500);
}

// ---------- the checklist ----------
async function auditPlot(browser, key) {
  const { source, label } = PLOTS[key];
  let { context, page, errors, api } = await newPage(browser);
  const only = (process.env.NEXO_AUDIT_CHECKS || '').split(',').filter(Boolean);
  const run = async (check, fn) => {
    if (only.length && check !== '1-draws' && !only.some(n => check.startsWith(n + '-'))) { console.log(`SKIP ${key} ${check}`); return; }
    try { const r = await fn(); if (r && r.status) record(key, check, r.status, r.detail); else record(key, check, 'PASS', r); }
    catch (e) { record(key, check, 'FAIL', String(e && e.message || e).split('\n').slice(0, 10).join(' | ')); }
  };
  let id = null; const memo = {};
  try {
    await openCheckpoint(page, CHECKPOINT);
    await run('1-draws', async () => {
      id = await addPlot(page, label);
      await closeLibrary(page);
      await settled(page, id); await drawn(page, id, 'plot');
      const bad = await cardFor(page, id).innerText();
      if (/Couldn.t bring back|error/i.test(bad.replace(/Error bars?/gi, ''))) throw new Error(`card text: ${bad.slice(0, 200)}`);
      await hundred(page); await drawn(page, id, 'plot');
      const z100 = await zoomPct(page);
      const s100 = await shot(page, `${key}-1-draws-100`, id);
      for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await page.waitForTimeout(1500);
      const zOut = await zoomPct(page);
      await drawn(page, id, 'any');
      const zoomed = await cardFor(page, id).evaluate(c => ({ img: [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0), plot: !!c.querySelector('.js-plotly-plot') }));
      const s41 = await shot(page, `${key}-1-draws-zoomed-out`);
      await hundred(page);
      await drawn(page, id, 'plot');
      if (!zoomed.img && !zoomed.plot) throw new Error('nothing drawn when zoomed out');
      return `card ${id} current at ${z100} (${s100}); zoomed out to ${zOut}: ${zoomed.img ? 'image' : 'live plot'} (${s41})`;
    });
    if (!id) throw new Error('no card: later checks impossible');
    await run('2-matches-team', async () => {
      const render = [...api.renders].reverse().find(r => r.body?.figure?.data);
      if (!render) throw new Error('no /render response with a Plotly figure was seen');
      const fromApi = traceSummary(render.body.figure.data);
      const onCard = await gd(page, id, p => (p.data || []).map(t => ({ type: t.type || 'scatter', name: t.name ?? null, n: Array.isArray(t.x) ? t.x.length : Array.isArray(t.y) ? t.y.length : Array.isArray(t.z) ? t.z.length : 0 })));
      const geom = await cardFor(page, id).evaluate(c => { const b = c.querySelector('.body').getBoundingClientRect(), p = c.querySelector('.js-plotly-plot .main-svg')?.getBoundingClientRect(); return { body: [Math.round(b.width), Math.round(b.height)], svg: p ? [Math.round(p.width), Math.round(p.height)] : null, overflowX: p ? Math.round(p.right - b.right) : null, overflowY: p ? Math.round(p.bottom - b.bottom) : null }; });
      const title = await gd(page, id, p => p.layout?.title?.text ?? p.layout?.title ?? null);
      const shotFile = await shot(page, `${key}-2-matches-team`, id);
      const same = JSON.stringify(fromApi) === JSON.stringify(onCard);
      const problems = [];
      if (!same) problems.push(`traces differ: API ${JSON.stringify(fromApi).slice(0, 300)} vs card ${JSON.stringify(onCard).slice(0, 300)}`);
      if (!geom.svg) problems.push('no plot svg');
      else if (geom.overflowX > 2 || geom.overflowY > 2) problems.push(`plot overflows the card body by ${geom.overflowX}×${geom.overflowY}px`);
      if (!onCard.some(t => t.n > 0)) problems.push('every trace is empty');
      if (problems.length) throw new Error(problems.join('; '));
      return `${onCard.length} trace(s) identical to the module's /render output (${onCard.map(t => `${t.type}:${t.name ?? '-'}:${t.n}`).slice(0, 6).join(', ')}${onCard.length > 6 ? ', …' : ''}); title "${title ?? ''}"; plot ${geom.svg.join('×')} in body ${geom.body.join('×')} (${shotFile})`;
    });
    await run('3-size', async () => {
      const zFocus = await focusCard(page, id);
      const size = () => gd(page, id, p => [Math.round(p._fullLayout?.width), Math.round(p._fullLayout?.height)]);
      const s0 = await size();
      const handle = cardFor(page, id).getByLabel('Resize card');
      const drag = async (dx, dy) => { const b = await handle.boundingBox(); if (!b) throw new Error('resize handle not visible'); const x = b.x + b.width / 2, y = b.y + b.height / 2; await page.mouse.move(x, y); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(x + dx * i / 8, y + dy * i / 8); await page.mouse.up(); };
      await drag(-160, -120);
      await page.waitForFunction(([sel, w]) => { const p = document.querySelector(sel + ' .js-plotly-plot'); return p && Math.round(p._fullLayout?.width) < w - 40; }, [`#world .card[data-id="${id}"]`, s0[0]], { timeout: 30000 });
      await page.waitForTimeout(1200);
      const s1 = await size();
      const small = await shot(page, `${key}-3-size-smaller`, id);
      const over1 = await cardFor(page, id).evaluate(c => { const b = c.getBoundingClientRect(); return [...c.querySelectorAll('.js-plotly-plot .main-svg')].some(s => s.getBoundingClientRect().right > b.right + 2 || s.getBoundingClientRect().bottom > b.bottom + 2); });
      await drag(300, 220);
      await page.waitForFunction(([sel, w]) => { const p = document.querySelector(sel + ' .js-plotly-plot'); return p && Math.round(p._fullLayout?.width) > w + 100; }, [`#world .card[data-id="${id}"]`, s1[0]], { timeout: 30000 });
      await page.waitForTimeout(1200);
      const s2 = await size();
      const large = await shot(page, `${key}-3-size-larger`, id);
      const over2 = await cardFor(page, id).evaluate(c => { const b = c.getBoundingClientRect(); return [...c.querySelectorAll('.js-plotly-plot .main-svg')].some(s => s.getBoundingClientRect().right > b.right + 2 || s.getBoundingClientRect().bottom > b.bottom + 2); });
      if (over1 || over2) throw new Error(`plot overflows the card (smaller ${over1}, larger ${over2})`);
      // the Size section of Appearance: typed px, then a journal width; the plot redraws at that card size
      await hundred(page); await selectCard(page, id);
      if (!(await inspectorTab(page, 'Appearance'))) throw new Error('no Appearance tab for the Size section');
      // F1/F2: the section is "Size & position" (details) with mm|px units; fields are labelled "Width (px)" in px
      const sizeBox = inspector(page).locator('details.size-section');
      await sizeBox.waitFor({ timeout: T });
      await sizeBox.getByRole('group', { name: 'Units', exact: true }).getByRole('button', { name: 'px', exact: true }).click();
      const typed = async (label, v) => { const f = sizeBox.getByLabel(label, { exact: true }); await f.fill(String(v)); await f.press('Enter'); };
      await typed('Width (px)', 560); await typed('Height (px)', 480);
      // the card is 560x480; the plot fills its body (480 minus the header; wave 1 cards have no footer, so no fixed 400)
      const typedOk = await page.waitForFunction(sel => { const c = document.querySelector(sel), p = c?.querySelector('.js-plotly-plot'), body = c?.querySelector('.body'); return p && body && Math.abs(c.offsetWidth - 560) <= 2 && Math.abs(c.offsetHeight - 480) <= 2 && Math.round(p._fullLayout?.width) === 560 && Math.abs(Math.round(p._fullLayout?.height) - body.clientHeight) <= 2; }, `#world .card[data-id="${id}"]`, { timeout: 30000 }).then(() => true, () => false);
      const sTyped = await size();
      // F1/F2: the journal chips are "<journal> 1-col <mm>" (cardSize.ts journalChips); Nature 1-col = 89 mm = 336 px
      await sizeBox.getByRole('button', { name: /^Nature 1-col/ }).click();
      const presetOk = await page.waitForFunction(sel => { const p = document.querySelector(sel + ' .js-plotly-plot'); return p && Math.round(p._fullLayout?.width) === 336; }, `#world .card[data-id="${id}"]`, { timeout: 30000 }).then(() => true, () => false);
      await page.waitForTimeout(800);
      const sPreset = await size();
      const sizeShot = await shot(page, `${key}-3-size-section`);
      const over3 = await cardFor(page, id).evaluate(c => { const b = c.getBoundingClientRect(); return [...c.querySelectorAll('.js-plotly-plot .main-svg')].some(s => s.getBoundingClientRect().right > b.right + 2 || s.getBoundingClientRect().bottom > b.bottom + 2); });
      // back to a working size for the later checks
      await typed('Width (px)', s0[0]); await typed('Height (px)', s0[1] + 80);
      await page.waitForFunction(([sel, w]) => { const p = document.querySelector(sel + ' .js-plotly-plot'); return p && Math.round(p._fullLayout?.width) === w; }, [`#world .card[data-id="${id}"]`, s0[0]], { timeout: 30000 }).catch(() => {});
      const sizeDetail = `Size section: typed 560×480 → plot ${sTyped.join('×')} ${typedOk ? 'ok' : 'NOT APPLIED'}; Nature 1-col (89 mm) → plot ${sPreset.join('×')} ${presetOk ? 'ok' : 'NOT APPLIED'}${over3 ? '; OVERFLOW at 336 px' : ''} (${sizeShot})`;
      if (!typedOk || !presetOk || over3) throw new Error(sizeDetail);
      return `click-to-focus at ${zFocus}; drag: plot ${s0.join('×')} → smaller ${s1.join('×')} (${small}) → larger ${s2.join('×')} (${large}); no overflow; ${sizeDetail}`;
    });
    await hundred(page);
    await run('4-data-tab', async () => {
      await selectCard(page, id);
      if (!(await inspectorTab(page, 'Data'))) throw new Error('no Data tab');
      const panel = inspector(page).getByRole('tabpanel');
      await panel.locator('select,input,[role=radio]').first().or(panel.getByText('This figure has no data controls.')).first().waitFor({ timeout: T });
      const schema = [...api.schemas].reverse().find(s => Array.isArray(s.body?.controls) && s.url.includes(encodeURIComponent(id.replace(/-plot_\w+$/, ''))));
      const schemaControls = (schema?.body?.controls || []).filter(c => c.visible !== false);
      const visible = await panel.locator('select,input:not([type=hidden]),textarea').evaluateAll(xs => xs.filter(x => x.getBoundingClientRect().width > 0).map(x => ({ tag: x.tagName.toLowerCase(), type: x.type, name: x.name, label: (x.getAttribute('aria-label') || x.labels?.[0]?.textContent || x.closest('fieldset')?.querySelector('legend')?.textContent || '').trim(), value: x.type === 'radio' || x.type === 'checkbox' ? x.checked : x.value, disabled: x.disabled })));
      memo.schemaLabels = schemaControls.map(c => `${c.id}:${c.type}:${c.label ?? ''}`);
      const shotFile = await shot(page, `${key}-4-data-tab`);
      // the module's own buttons (Team's drawer shows them): each must be a visible button in the Data tab
      const actionControls = schema?.body?.actionControls || [];
      const actionButtons = [];
      for (const a of actionControls) actionButtons.push(`${a.label}: ${await panel.getByRole('button', { name: a.label, exact: true }).isVisible().catch(() => false) ? 'shown' : 'MISSING'}`);
      memo.actions = actionControls.length ? actionButtons.join('; ') : 'none in the schema';
      const short = l => String(l || '').split(':')[0].trim();
      const missing = schemaControls.filter(c => TEAM_KEYS[key].includes(c.id)).filter(c => !visible.some(v => v.label && short(c.label).startsWith(v.label)) && !visible.some(v => v.name === c.id) && !visible.some(v => v.label === short(c.label)));
      const changes = [], nochange = [];
      // selects: pick another option, wait for the plot to redraw
      for (const s of await panel.locator('select').all()) {
        if (!(await s.isVisible()) || !(await s.isEnabled())) continue;
        const lab = await s.evaluate(e => (e.getAttribute('aria-label') || e.labels?.[0]?.textContent || '').trim());
        const opts = await s.locator('option').evaluateAll(os => os.filter(o => !o.disabled && o.value).map(o => ({ label: o.textContent.trim(), value: o.value, selected: o.selected })));
        const other = opts.find(o => !o.selected); if (!other) continue;
        const before = await signature(page, id);
        await s.selectOption({ value: other.value });
        const redrew = await waitRedraw(page, id, before, 60000).then(() => true, () => false);
        (redrew ? changes : nochange).push(`${lab}: → ${other.label}`);
        console.log(`  data ${key}: ${lab} → ${other.label}: ${redrew ? 'redrew' : 'NO REDRAW'}`);
      }
      for (const group of await panel.getByRole('radiogroup').all()) {
        const radios = group.getByRole('radio'); const n = await radios.count();
        for (let i = 0; i < n; i++) { const r = radios.nth(i); if (await r.isChecked() || !(await r.isEnabled())) continue;
          const lab = (await r.evaluate(e => e.labels?.[0]?.textContent || e.value)).trim();
          const before = await signature(page, id); await r.check();
          const redrew = await waitRedraw(page, id, before, 60000).then(() => true, () => false);
          (redrew ? changes : nochange).push(`radio → ${lab}`); break; }
      }
      // numbers: a valid change, then an invalid one that must be refused with a message
      let invalid = 'no number control';
      for (const n of await panel.locator('input[type=number]').all()) {
        if (!(await n.isVisible()) || !(await n.isEnabled())) continue;
        const lab = await n.evaluate(e => (e.getAttribute('aria-label') || e.labels?.[0]?.textContent || '').trim());
        const [min, max, step, v] = await n.evaluate(e => [e.min, e.max, e.step, e.value]);
        const next = String(Math.min(Number(max || 1e9), Number(v) + Number(step || 1) * 2));
        const before = await signature(page, id); await n.fill(next); await n.press('Tab');
        const redrew = await waitRedraw(page, id, before, 60000).then(() => true, () => false);
        (redrew ? changes : nochange).push(`${lab}: ${v} → ${next}`);
        if (max) { const sig = await signature(page, id); await n.fill(String(Number(max) * 10)); await n.press('Tab'); await page.waitForTimeout(2500);
          const msg = (await panel.getByRole('alert').allInnerTexts().catch(() => [])).join(' ').trim() || (await n.evaluate(e => e.validationMessage));
          const sig2 = await signature(page, id); const val = await n.inputValue();
          invalid = `${lab} = ${Number(max) * 10}: ${msg ? `message "${msg.slice(0, 120)}"` : 'no message'}; plot ${sig2 === sig ? 'unchanged' : 'CHANGED'}; field now ${val}`;
          if (!msg) memo.invalidSilent = invalid;
          await n.fill(next); await n.press('Tab'); await page.waitForTimeout(800); }
        break;
      }
      await shot(page, `${key}-4-data-tab-changed`, id);
      const detail = `${visible.length} visible controls [${visible.map(v => v.label || v.name).filter(Boolean).join(' | ').slice(0, 300)}]; schema ${schemaControls.length} [${memo.schemaLabels.join(', ').slice(0, 300)}]; redrew: ${changes.join('; ') || 'none'}; no redraw: ${nochange.join('; ') || 'none'}; invalid: ${invalid}; module buttons: ${memo.actions} (${shotFile})`;
      if (/MISSING/.test(memo.actions)) throw new Error(`module buttons missing in the Data tab: ${memo.actions}; ${detail}`);
      if (missing.length) throw new Error(`schema controls missing in the Inspector: ${missing.map(c => c.label).join(', ')}; ${detail}`);
      if (nochange.length) throw new Error(`controls that do not redraw this plot: ${nochange.join('; ')}; ${detail}`);
      if (!changes.length && visible.length) throw new Error(`no control redrew the plot; ${detail}`);
      if (memo.invalidSilent) return { status: 'FAIL', detail: `invalid value refused without a message; ${detail}` };
      return detail;
    });
    await run('5-appearance', async () => {
      await selectCard(page, id);
      if (!(await inspectorTab(page, 'Appearance'))) throw new Error('no Appearance tab');
      const panel = inspector(page).getByRole('tabpanel');
      const sec = async name => { const s = panel.locator('summary', { hasText: new RegExp(`^${name}$`) }); if (!(await s.count())) return false; const open = await s.evaluate(e => e.parentElement.open); if (!open) await s.click(); return true; };
      const lay = fn => gd(page, id, fn);
      const waitLay = async (fn, what) => { const ok = await page.waitForFunction(([sel, src]) => { const p = document.querySelector(sel + ' .js-plotly-plot'); return p && (0, eval)(src)(p); }, [`#world .card[data-id="${id}"]`, `(${fn})`], { timeout: 20000 }).then(() => true, () => false); if (!ok) fails.push(what); else oks.push(what); };
      const oks = [], fails = [], na = [];
      const setField = async (name, value) => { const f = panel.getByLabel(name, { exact: true }); if (!(await f.count())) return false; await f.first().fill(String(value)); await f.first().press('Tab'); return true; };
      await sec('Title and fonts');
      if (await setField('Plot title', 'Audit title b01')) await waitLay(p => (p.layout?.title?.text ?? p.layout?.title) === 'Audit title b01', 'title'); else na.push('title field');
      if (await setField('Chart font size', '16')) await waitLay(p => p.layout?.font?.size === 16, 'font size'); else na.push('font size');
      if (await setField('Chart text color', '#aa0000')) await waitLay(p => String(p.layout?.font?.color).toLowerCase() === '#aa0000', 'font colour'); else na.push('font colour field');
      if (await sec('Horizontal axis')) {
        if (await setField('Title text', 'Audit X')) await waitLay(p => (p.layout?.xaxis?.title?.text ?? p.layout?.xaxis?.title) === 'Audit X', 'x axis title'); else na.push('x axis title field');
        const grid = panel.locator('details', { has: page.locator('summary', { hasText: /^Horizontal axis$/ }) }).getByLabel('Showgrid', { exact: true });
        if (await grid.count()) { const was = await lay(p => p._fullLayout?.xaxis?.showgrid); await grid.first().setChecked(!was); await waitLay(new Function('p', `return p._fullLayout?.xaxis?.showgrid === ${!was}`), 'x grid'); } else na.push('x grid toggle');
      } else na.push('Horizontal axis section');
      if (await sec('Vertical axis')) {
        const f = panel.locator('details', { has: page.locator('summary', { hasText: /^Vertical axis$/ }) }).getByLabel('Title text', { exact: true });
        if (await f.count()) { await f.fill('Audit Y'); await f.press('Tab'); await waitLay(p => (p.layout?.yaxis?.title?.text ?? p.layout?.yaxis?.title) === 'Audit Y', 'y axis title'); } else na.push('y axis title field');
      } else na.push('Vertical axis section');
      if (await sec('Chart background')) { if (await setField('Plot background', '#f0f0ff')) await waitLay(p => String(p._fullLayout?.plot_bgcolor).replace(/\s/g, '').toLowerCase() === 'rgb(240,240,255)' || String(p.layout?.plot_bgcolor).toLowerCase() === '#f0f0ff', 'plot background'); }
      else na.push('background section');
      // palettes: all six
      if (await sec('Color palette')) {
        const group = panel.getByRole('group', { name: 'Color palette' });
        if (await group.count()) {
          for (const name of ['Lab', 'Okabe–Ito', 'Nature (NPG)', 'Viridis', 'Pastel', 'Gelato Days']) {
            const before = JSON.stringify(await lay(p => (p.data || []).map(t => [t.marker?.color ?? null, t.fillcolor ?? null, t.line?.color ?? null])));
            await group.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) }).click();
            const changed = await page.waitForFunction(([sel, b]) => { const p = document.querySelector(sel + ' .js-plotly-plot'); return p && JSON.stringify((p.data || []).map(t => [t.marker?.color ?? null, t.fillcolor ?? null, t.line?.color ?? null])) !== b; }, [`#world .card[data-id="${id}"]`, before], { timeout: 10000 }).then(() => true, () => false);
            // Team recolours only series named in layout.meta.teamConditions (www/team/js/plot_editor.js:169)
            const conditionSeries = await lay(p => { const c = p.layout?.meta?.teamConditions; const list = c == null ? null : [].concat(c); return list == null || (p.data || []).some(t => list.includes(t.meta?.teamCondition || t.legendgroup || t.name)); });
            (changed ? oks : conditionSeries ? fails : na).push(changed || conditionSeries ? `palette ${name}` : `palette ${name} (Team behaviour: no series is a study condition, Team recolours none)`);
          }
          const grey = panel.getByLabel('Healthy in grey', { exact: true });
          if (await grey.count()) { const before = JSON.stringify(await lay(p => (p.data || []).map(t => t.marker?.color ?? t.fillcolor))); await grey.click(); await page.waitForTimeout(1500); const after = JSON.stringify(await lay(p => (p.data || []).map(t => t.marker?.color ?? t.fillcolor)));
            const hasHealthy = /(^|"|,)healthy/i.test(JSON.stringify(await lay(p => (p.data || []).map(t => t.name))));
            if (after !== before) oks.push('Healthy in grey'); else if (!hasHealthy) na.push('Healthy in grey (no Healthy/Control group on this plot)'); else fails.push('Healthy in grey'); await grey.click(); await page.waitForTimeout(800); }
        } else na.push(`palette: "${(await panel.locator('details', { has: page.locator('summary', { hasText: /^Color palette$/ }) }).innerText()).replace(/\s+/g, ' ').slice(0, 140)}"`);
      } else na.push('palette section');
      memo.appearanceShot = await shot(page, `${key}-5-appearance`);
      if (await sec('Legend')) {
        const group = panel.getByRole('group', { name: 'Legend position' });
        const showsLegend = await lay(p => p._fullLayout?.showlegend);
        await group.getByRole('button', { name: 'Bottom Left', exact: true }).click();
        if (showsLegend) await waitLay(p => p.layout?.legend?.x === 0 && p.layout?.legend?.y === 0, 'legend position'); else na.push('legend position (this plot shows no legend)');
      } else na.push('legend section');
      const orient = panel.getByRole('button', { name: 'Change orientation', exact: true });
      if (await orient.isEnabled()) { const before = await signature(page, id); await orient.click(); const ok = await page.waitForFunction(([sel, b]) => { const c = document.querySelector(sel); const p = c?.querySelector('.js-plotly-plot'); return p && JSON.stringify((p.data || []).map(t => [t.orientation ?? null, JSON.stringify(t.x?.slice?.(0, 3) ?? null), JSON.stringify(t.y?.slice?.(0, 3) ?? null)])) !== b; }, [`#world .card[data-id="${id}"]`, JSON.stringify(await lay(p => (p.data || []).map(t => [t.orientation ?? null, JSON.stringify(t.x?.slice?.(0, 3) ?? null), JSON.stringify(t.y?.slice?.(0, 3) ?? null)])))], { timeout: 10000 }).then(() => true, () => false); (ok ? oks : fails).push('orientation'); if (ok) { await orient.click(); await page.waitForTimeout(800); } }
      else na.push('orientation (disabled for this plot)');
      // Undo / Redo / Reset of presentation (the editor's own toolbar)
      const undo = panel.getByRole('button', { name: 'Undo', exact: true }), redo = panel.getByRole('button', { name: 'Redo', exact: true });
      await setField('Plot title', 'Audit title undo');
      await waitLay(p => (p.layout?.title?.text ?? p.layout?.title) === 'Audit title undo', 'title before undo');
      await undo.click(); await waitLay(p => (p.layout?.title?.text ?? p.layout?.title) === 'Audit title b01', 'Undo');
      await redo.click(); await waitLay(p => (p.layout?.title?.text ?? p.layout?.title) === 'Audit title undo', 'Redo');
      const original = memo.originalTitle;
      await panel.getByRole('button', { name: 'Reset presentation', exact: true }).click();
      await panel.getByRole('group', { name: 'Confirm presentation reset' }).getByRole('button', { name: 'Reset all', exact: true }).click();
      await waitLay(p => (p.layout?.title?.text ?? p.layout?.title ?? '') !== 'Audit title undo' && p.layout?.font?.size !== 16, 'Reset');
      // presets at the top of Appearance: Nexo, Publication, back to Team original (the plot as Team draws it)
      const presets = panel.getByRole('group', { name: 'Presentation preset', exact: true });
      if (await presets.count()) {
        const teamLook = JSON.stringify(await lay(p => [p.layout?.font?.family ?? null, p.layout?.font?.color ?? null, (p.data || []).map(t => t.marker?.color ?? t.fillcolor ?? null)]));
        const pressed = async name => (await presets.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')) === 'true';
        await presets.getByRole('button', { name: 'Nexo', exact: true }).click();
        await waitLay(p => p.layout?.font?.family === 'system-ui' && p.layout?.font?.color === '#141b24', 'preset Nexo');
        if (!(await pressed('Nexo'))) fails.push('preset Nexo not shown as pressed');
        memo.nexoShot = await shot(page, `${key}-5-preset-nexo`, id);
        await presets.getByRole('button', { name: 'Publication', exact: true }).click();
        await page.waitForTimeout(1500);
        const pubLook = JSON.stringify(await lay(p => [p.layout?.font?.family ?? null, p.layout?.font?.color ?? null, (p.data || []).map(t => t.marker?.color ?? t.fillcolor ?? null)]));
        (await pressed('Publication') && pubLook !== teamLook ? oks : fails).push('preset Publication');
        await presets.getByRole('button', { name: 'Team original', exact: true }).click();
        await page.waitForFunction(([sel, b]) => { const p = document.querySelector(sel + ' .js-plotly-plot'); return p && JSON.stringify([p.layout?.font?.family ?? null, p.layout?.font?.color ?? null, (p.data || []).map(t => t.marker?.color ?? t.fillcolor ?? null)]) === b; }, [`#world .card[data-id="${id}"]`, teamLook], { timeout: 20000 }).then(() => oks.push('preset Team original restores Team look'), () => fails.push('preset Team original does not restore Team look'));
        if (!(await pressed('Team original'))) fails.push('Team original not shown as pressed');
      } else fails.push('no Presentation preset group');
      // set the appearance kept for checks 8-10
      await sec('Title and fonts'); await setField('Plot title', `Audit ${key}`); await waitLay(new Function('p', `return (p.layout?.title?.text ?? p.layout?.title) === 'Audit ${key}'`), 'title kept for 8-10');
      memo.title = `Audit ${key}`;
      const detail = `ok: ${oks.join(', ')}; not offered: ${na.join(', ') || 'none'}${fails.length ? `; FAILED: ${fails.join(', ')}` : ''} (${memo.appearanceShot}${memo.nexoShot ? ', ' + memo.nexoShot : ''})`;
      if (fails.length) throw new Error(detail);
      return detail;
    });
    await run('6-statistics', async () => {
      await selectCard(page, id);
      const has = await inspectorTab(page, 'Statistics');
      if (key !== 'violin') {
        const text = has ? (await inspector(page).getByRole('tabpanel').innerText()).replace(/\s+/g, ' ').slice(0, 160) : 'no Statistics tab';
        return { status: 'N/A', detail: `Team has no statistics for this plot; Inspector: "${text}"` };
      }
      if (!has) throw new Error('no Statistics tab on the violin');
      const panel = inspector(page).getByRole('region', { name: 'Violin statistics' });
      await panel.waitFor({ timeout: T }); await page.waitForTimeout(3000);
      if (await panel.locator('fieldset:disabled').count()) { const text = (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 600); const f = await shot(page, `${key}-6-statistics`); if (/no synthetic samples/i.test(text)) return { status: 'N/A', detail: `Team's statistics policy blocks synthetic samples (the audit checkpoint is synthetic): "${text.slice(0, 220)}" (${f})` }; throw new Error(`analysis fieldset disabled: "${text}" (${f})`); }
      await panel.getByLabel('Test', { exact: true }).selectOption({ label: 'Wilcoxon rank-sum (Mann-Whitney)' });
      await panel.getByLabel('Multiple-testing correction', { exact: true }).selectOption({ label: 'Benjamini-Hochberg (FDR, q)' });
      await panel.getByRole('button', { name: 'Review and confirm…', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm and compute', exact: true }).click({ timeout: T });
      const table = panel.getByRole('table', { name: 'Results for the displayed lipid' });
      await table.locator('tbody tr').first().waitFor({ timeout: T });
      const rows = (await table.locator('tbody tr').allInnerTexts()).map(r => r.replace(/\s+/g, ' '));
      const csv = await download(page, () => panel.getByRole('button', { name: 'Statistics CSV', exact: true }).click());
      const shotFile = await shot(page, `${key}-6-statistics`);
      if (!/\.csv$/.test(csv.name) || csv.size < 20) throw new Error(`CSV ${csv.name} ${csv.size} B`);
      return `Wilcoxon + BH confirmed; ${rows.length} row(s) "${rows[0].slice(0, 100)}"; ${csv.name} ${csv.size} B (${shotFile})`;
    });
    await run('7-export', async () => {
      await selectCard(page, id);
      await inspectorTab(page, 'Export');
      const panel = inspector(page).getByRole('tabpanel');
      const got = [];
      const png = await download(page, () => panel.getByRole('button', { name: 'Download PNG', exact: true }).click());
      got.push(`${png.name} ${png.size} B`); if (png.size < 1000 || !png.head.includes('PNG')) throw new Error(`PNG ${png.name} ${png.size} B`);
      const svgB = panel.getByRole('button', { name: 'Download SVG', exact: true });
      // the tab is busy until the PNG save finishes: wait for that before reading the SVG button
      await page.waitForFunction(b => !b.disabled || !!b.title, await svgB.elementHandle(), { timeout: 10000 }).catch(() => {});
      if (await svgB.isEnabled()) { const svg = await download(page, () => svgB.click()); got.push(`${svg.name} ${svg.size} B`); if (svg.size < 1000) throw new Error(`SVG ${svg.size} B`); } else { got.push('SVG disabled: ' + await svgB.getAttribute('title')); if (await cardFor(page, id).locator('.js-plotly-plot').count()) memo.svgStale = true; }
      // PDF of the card, as Team offers next to PNG/SVG (www/team/js/plot_exports.js)
      const pdfB = panel.getByRole('button', { name: 'Download PDF', exact: true });
      if (await pdfB.count()) { const pdf = await download(page, () => pdfB.click()); got.push(`${pdf.name} ${pdf.size} B`); if (pdf.size < 1000 || !pdf.head.startsWith('%PDF')) throw new Error(`PDF ${pdf.name} ${pdf.size} B ${pdf.head}`); }
      else memo.noPdf = true;
      await panel.getByRole('button', { name: 'More export options…', exact: true }).click();
      const dialog = page.getByRole('dialog').last(); await dialog.waitFor({ timeout: T });
      const dialogPdf = dialog.getByRole('button', { name: 'Download PDF', exact: true });
      if (await dialogPdf.count()) { const pdf = await download(page, () => dialogPdf.click()); got.push(`dialog: ${pdf.name} ${pdf.size} B`); if (!pdf.head.startsWith('%PDF')) throw new Error(`dialog PDF ${pdf.head}`); }
      const pdfBox = dialog.getByLabel('PDF', { exact: true });
      if (await pdfBox.count()) {
        for (const f of ['SVG', 'PNG', 'TIFF', 'Data (CSV)', 'R script']) { const b = dialog.getByLabel(f, { exact: true }); if (await b.count() && await b.isEnabled() && await b.isChecked()) await b.setChecked(false); }
        if (!(await pdfBox.isChecked())) await pdfBox.setChecked(true);
        const go = dialog.getByRole('button', { name: /^Download/ }).first();
        const pdf = await download(page, () => go.click()); got.push(`dialog: ${pdf.name} ${pdf.size} B`);
        if (pdf.size < 1000) throw new Error(`PDF ${pdf.size} B`);
      } else if (!(await dialogPdf.count())) got.push('dialog offers no PDF');
      await dialog.getByRole('button', { name: 'Close', exact: true }).click().catch(() => page.keyboard.press('Escape'));
      const more = panel.getByRole('group', { name: 'More downloads from this analysis', exact: true });
      if (await more.count()) for (const b of await more.getByRole('button').all()) { const lab = (await b.innerText()).trim(); const f = await download(page, () => b.click()); got.push(`"${lab}" → ${f.name} ${f.size} B`); if (f.size < 10) throw new Error(`${lab} empty`); }
      else got.push('no "More downloads" group');
      const shotFile = await shot(page, `${key}-7-export`);
      if (memo.svgStale) throw new Error(`Download SVG disabled while the card shows a live plot; ${got.join('; ')} (${shotFile})`);
      if (memo.noPdf) throw new Error(`no PDF of the card (Team offers one); ${got.join('; ')} (${shotFile})`);
      return `${got.join('; ')} (${shotFile})`;
    });
    await run('8-finish', async () => {
      await selectCard(page, id);
      await inspector(page).getByRole('button', { name: 'Finish plot', exact: true }).click();
      await settled(page, id, ['finished']); await drawn(page, id, 'img');
      const snap = await shot(page, `${key}-8-finished`, id);
      const box = await cardFor(page, id).evaluate(c => { const i = c.querySelector('img'); return i ? [i.naturalWidth, i.naturalHeight, Math.round(i.getBoundingClientRect().width), Math.round(i.getBoundingClientRect().height)] : null; });
      await fit(page); await cardFor(page, id).getByRole('button', { name: 'Edit', exact: true }).click();
      const editFig = inspector(page).getByRole('button', { name: 'Edit figure', exact: true });
      if (await editFig.isVisible().catch(() => false)) await editFig.click();
      await settled(page, id, ['current']); await drawn(page, id, 'plot');
      const title = await gd(page, id, p => p.layout?.title?.text ?? p.layout?.title);
      if (title !== memo.title) throw new Error(`live plot after Edit has title "${title}", expected "${memo.title}"`);
      return `finished snapshot ${box?.join('×')} (${snap}); Edit returns to the live plot titled "${title}"`;
    });
    await run('9-duplicate-remove-undo', async () => {
      await fit(page); await selectCard(page, id);
      const before = await ids(page);
      await cardFor(page, id).getByRole('button', { name: 'Duplicate', exact: true }).click();
      await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before.length, { timeout: T });
      const dup = (await ids(page)).find(x => !before.includes(x));
      await settled(page, dup); await drawn(page, dup, 'plot');
      // the new copy is selected and must sit on top: its header is what the user sees and clicks
      const onTop = await cardFor(page, dup).locator('header strong').first().evaluate(h => { const r = h.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && h.closest('.card').contains(hit); });
      const dupShot = await shot(page, `${key}-9-duplicate-placed`);
      if (!onTop) throw new Error(`the new copy is hidden under the original: its header is covered right after Duplicate (${dupShot})`);
      const read = async c => { await selectCard(page, c); await inspectorTab(page, 'Data'); const p = inspector(page).getByRole('tabpanel'); await p.locator('select,input').first().waitFor({ timeout: T }).catch(() => {});
        return JSON.stringify(await p.locator('select,input:not([type=hidden])').evaluateAll(xs => xs.map(x => x.type === 'radio' || x.type === 'checkbox' ? x.checked : x.value))); };
      // the copy sits 24 px below and right of the original: read it first (selecting the original raises it over the copy)
      const b = await read(dup), a = await read(id);
      const ta = await gd(page, id, p => p.layout?.title?.text ?? p.layout?.title), tb = await gd(page, dup, p => p.layout?.title?.text ?? p.layout?.title);
      const shotFile = await shot(page, `${key}-9-duplicate`);
      const problems = [];
      if (a !== b) problems.push(`inputs differ: ${a} vs ${b}`);
      if (ta !== tb) problems.push(`title "${ta}" vs "${tb}"`);
      await cardMenu(page, dup, 'Remove');
      await page.waitForFunction(d => !document.querySelector(`#world .card[data-id="${d}"]`), dup, { timeout: T });
      await page.getByRole('button', { name: /Undo$/ }).first().click();
      const back = await page.waitForFunction(d => !!document.querySelector(`#world .card[data-id="${d}"]`), dup, { timeout: 30000 }).then(() => true, () => false);
      if (!back) problems.push('Undo did not bring the removed duplicate back');
      else { await settled(page, dup, ['current']).catch(() => problems.push('restored duplicate not current')); await drawn(page, dup, 'plot').catch(() => problems.push('restored duplicate not drawn'));
        const tc = await gd(page, dup, p => p.layout?.title?.text ?? p.layout?.title); if (tc !== ta) problems.push(`restored duplicate title "${tc}"`); }
      if (back) { await cardMenu(page, dup, 'Remove'); await page.waitForFunction(d => !document.querySelector(`#world .card[data-id="${d}"]`), dup, { timeout: T }); }
      if (problems.length) throw new Error(problems.join('; '));
      return `duplicate ${dup} has the same inputs and title "${tb}" (${shotFile}); Remove + Undo restored it with its title`;
    });
    await run('10-save-reopen', async () => {
      await selectCard(page, id); await inspectorTab(page, 'Data');
      const p0 = inspector(page).getByRole('tabpanel'); await p0.locator('select,input').first().waitFor({ timeout: T }).catch(() => {});
      const inputs = JSON.stringify(await p0.locator('select,input:not([type=hidden])').evaluateAll(xs => xs.map(x => x.type === 'radio' || x.type === 'checkbox' ? x.checked : x.value)));
      // replace an earlier audit save of this batch (only this batch's own checkpoint is ever deleted)
      await page.evaluate(async name => { const list = await (await fetch('/api/v1/checkpoints')).json(); for (const c of list) if (c.name === name) await fetch(`/api/v1/checkpoints/${encodeURIComponent(c.id)}`, { method: 'DELETE' }); }, SAVE_AS);
      await page.getByRole('button', { name: /^Export figure/ }).first().click();
      await page.getByRole('button', { name: 'Save checkpoint…', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Checkpoints', exact: true }); await dialog.waitFor({ timeout: T });
      await dialog.getByRole('textbox', { name: 'New checkpoint name' }).fill(SAVE_AS);
      await dialog.getByRole('button', { name: 'Save current analysis', exact: true }).click();
      await page.locator('.toast', { hasText: `Saved checkpoint ${SAVE_AS}` }).waitFor({ timeout: T });
      const saved = new URL(page.url()).searchParams.get('checkpoint');
      if (await dialog.isVisible().catch(() => false)) await page.keyboard.press('Escape');
      memo.errors = errors.slice(); memo.http = errors.http || []; await context.close(); // one API session at a time
      ({ context, page, errors, api } = await newPage(browser));
      await openCheckpoint(page, saved);
      await page.waitForFunction(d => !!document.querySelector(`#world .card[data-id="${d}"]`), id, { timeout: T });
      await settled(page, id, ['current']); await drawn(page, id, 'plot');
      const title = await gd(page, id, p => p.layout?.title?.text ?? p.layout?.title);
      await selectCard(page, id); await inspectorTab(page, 'Data');
      const p1 = inspector(page).getByRole('tabpanel'); await p1.locator('select,input').first().waitFor({ timeout: T }).catch(() => {});
      const again = JSON.stringify(await p1.locator('select,input:not([type=hidden])').evaluateAll(xs => xs.map(x => x.type === 'radio' || x.type === 'checkbox' ? x.checked : x.value)));
      const shotFile = await shot(page, `${key}-10-reopened`, id);
      const problems = [];
      if (title !== memo.title) problems.push(`title "${title}" ≠ "${memo.title}"`);
      if (again !== inputs) problems.push(`inputs ${again} ≠ ${inputs}`);
      // the audit's own checkpoint is deleted; nothing else
      const status = await page.evaluate(async c => (await fetch(`/api/v1/checkpoints/${encodeURIComponent(c)}`, { method: 'DELETE' })).status, saved);
      if (problems.length) throw new Error(problems.join('; '));
      return `saved ${SAVE_AS} (${saved.slice(0, 12)}…), reopened in a new page: title "${title}" and inputs identical (${shotFile}); deleted it (HTTP ${status})`;
    });
    // tidy: leave the synthetic canvas as found
    await openCheckpoint(page, CHECKPOINT).catch(() => {});
    if (id && await cardFor(page, id).count()) await cardMenu(page, id, 'Remove').catch(() => {});
    await page.waitForTimeout(2500);
  } catch (e) { record(key, 'aborted', 'FAIL', e.message); }
  finally {
    const all = [...(memo.errors || []), ...errors];
    const http = [...(memo.http || []), ...(errors.http || [])];
    record(key, '11-console', all.length ? 'FAIL' : 'PASS', (all.length ? all.slice(0, 5).join(' || ') : '0 console errors') + (http.length ? `; API errors: ${http.slice(0, 5).join(' || ')}` : ''));
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(shots, { recursive: true }); fs.mkdirSync(dl, { recursive: true });
  const browser = await pw.chromium.launch();
  try { for (const key of wanted) await auditPlot(browser, key); }
  finally { await browser.close(); }
  fs.writeFileSync(path.join(dl, `results-${wanted.join('_')}.json`), JSON.stringify(results, null, 1));
  console.log('---');
  console.log(`AUDIT b01-dashboard: ${results.filter(r => r.status === 'PASS').length} PASS, ${results.filter(r => r.status === 'FAIL').length} FAIL, ${results.filter(r => r.status === 'N/A').length} N/A`);
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
