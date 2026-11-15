#!/usr/bin/env node
'use strict';
// Chart audit b01-dashboard, round 6 (closing round for the heatmap), on the synthetic-only audit API:
//  A. the Data tab of every dashboard card already on nexo-complete-synthetic (legacy nodes with no instance:
//     pca, violin, dist, comp, heat; 38f3fe5e) loads its controls, and which instance id it asks for;
//  B. the heat card's header chrome (Edit, Duplicate) and its "More card actions" menu (Duplicate, Data & settings, Remove) work;
//  C. check 12 "Layout": at 1440x900 and 1024x768, every Inspector tab of the heat card with every <details> open,
//     plus the card chrome: nothing spills, overlaps, escapes its box, or is clipped (ellipsis) without a tooltip.
// Read-only for checkpoints: nothing is saved; the duplicate made in B is removed.
//   NEXO_AUDIT_BASE=http://127.0.0.1:5481 node tests/dual-ui/chart-audit/probe_b01-round6.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = (process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5181').replace(/\/$/, '');
const shots = path.join(root, 'docs/integration/chart-audit/b01-dashboard');
const T = 180000;
const KEYS = ['pca', 'violin', 'dist', 'comp', 'heat'];
const results = [];
const record = (part, status, detail) => { results.push({ part, status, detail }); console.log(`${status} ${part} — ${String(detail).replace(/\s+/g, ' ').slice(0, 1600)}`); };
const rel = f => path.relative(root, f);
async function shot(target, name) { const f = path.join(shots, `${name}.png`); await target.screenshot({ path: f });
  if (fs.statSync(f).size > 400 * 1024 && target.viewportSize) await target.screenshot({ path: f, clip: { x: 0, y: 0, width: 1000, height: 640 } }); return rel(f); }
// Same rules as tests/dual-ui/test_nexo_layout_sweep.cjs inspect() (spill, overlap, escape), plus "clip": an ellipsis-clipped text without a title/tooltip.
function inspectBase({ roots, rules, edge }) {
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
function inspect(arg) {
  const out = inspectBase(arg);
  for (const [where, selector] of arg.roots) for (const host of document.querySelectorAll(selector)) for (const el of [host, ...host.querySelectorAll('*')]) {
    if (!(el instanceof HTMLElement) || el.closest('svg,.js-plotly-plot,canvas,.body,[hidden]')) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && el.textContent.trim() && !el.matches('select,input,textarea,[role=listbox],.picker-list,ul,ol')
      && !(el.title || el.dataset.tip || el.closest('[title],[data-tip]') || el.getAttribute('aria-label')))
      out.push({ where, rule: 'clip', selector: el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map(c => '.' + c).join(''), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) });
  }
  return out;
}
// page.evaluate serializes one function only: ship both as source
const INSPECT = arg => `(${inspectBase})\n;(${inspect.toString().replace('inspectBase(arg)', 'inspectBase0(arg)')})`;
const runInspect = (page, arg) => page.evaluate(([src, a]) => { const inspectBase0 = (0, eval)(src.split('\n;')[0]); const f = (0, eval)(`(function(inspectBase0){ return ${src.split('\n;')[1]}; })`)(inspectBase0); return f(a); }, [INSPECT(), arg]);
const cards = page => page.locator('#world .card').evaluateAll(cs => cs.map(c => ({ id: c.dataset.id, label: c.querySelector('header strong')?.textContent?.trim() || '' })));
async function fit(page) { await page.getByRole('button', { name: 'Fit', exact: true }).first().click(); await page.waitForTimeout(600); }
async function select(page, id) {
  await fit(page);
  await page.locator(`#world .card[data-id="${id}"] header strong`).first().click();
  await page.waitForFunction(sel => document.querySelector(sel)?.classList.contains('selected'), `#world .card[data-id="${id}"]`, { timeout: T });
  await page.waitForTimeout(700);
}
async function openTabs(page) { const tabs = page.getByRole('tablist', { name: 'Canvas tabs' }).getByRole('tab'); return (await tabs.count()) ? tabs : null; }
async function expandAll(page) { for (let i = 0; i < 4; i++) { const n = await page.evaluate(() => { const ds = [...document.querySelectorAll('#inspector details:not([open])')]; ds.forEach(d => { d.open = true; }); return ds.length; }); if (!n) break; await page.waitForTimeout(250); } }

(async () => {
  const browser = await pw.chromium.launch();
  const errors = [], http = [], schemaCalls = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('response', async r => { const u = r.url(); if (!u.includes('/api/')) return; const p = u.replace(/^.*\/api\/v1/, '');
      if (/\/cards\/[^/]+\/schema$/.test(p)) schemaCalls.push(`${r.status()} ${p.replace(/^\/sessions\/[^/]+/, '')}`);
      if (r.status() >= 400) { const b = await r.text().catch(() => ''); http.push(`${r.request().method()} ${p} → ${r.status()} ${b.replace(/\s+/g, ' ').slice(0, 160)}`); console.log(`  http ${r.status()} ${r.request().method()} ${p}`); } });
    await page.goto(`${base}/nexo/?checkpoint=nexo-complete-synthetic`);
    await page.getByRole('button', { name: /^Export figure/ }).first().waitFor({ timeout: T });
    await page.waitForTimeout(2500);
    // find the five dashboard cards (they may sit on another canvas tab)
    const found = {};
    const scan = async () => { for (const c of await cards(page)) for (const k of KEYS) if (!found[k] && c.id.endsWith(`plot_${k}`)) found[k] = { ...c }; };
    await scan();
    const tabs = await openTabs(page);
    if (tabs && KEYS.some(k => !found[k])) for (let i = 0; i < await tabs.count() && KEYS.some(k => !found[k]); i++) { await tabs.nth(i).click(); await page.waitForTimeout(1500); const before = Object.keys(found).length; await scan(); for (const k of KEYS) if (found[k] && !found[k].tab) found[k].tab = i; if (Object.keys(found).length === before) continue; }
    console.log('  dashboard cards on the checkpoint:', JSON.stringify(found));
    // nexo-complete-synthetic opens with no dashboard card (the v0 legacy nodes exist only on the pilot checkpoint):
    // add the missing ones from the Library, as a user does, and check their Data tab the same way
    const LABELS = { pca: 'Principal components', violin: 'Feature distributions', dist: 'Signal distribution', comp: 'Composition overview', heat: 'Abundance heatmap' };
    if (tabs && KEYS.some(k => !found[k])) { await tabs.nth(0).click(); await page.waitForTimeout(1200); }
    for (const k of KEYS) if (!found[k]) {
      const lib = page.getByRole('complementary', { name: 'Library' });
      if (!(await lib.isVisible().catch(() => false))) await page.getByRole('button', { name: '+ Add plot', exact: true }).first().click();
      const ptab = lib.getByRole('tab', { name: 'Plots', exact: true }); if (await ptab.getAttribute('aria-selected', { timeout: T }) !== 'true') await ptab.click();
      await lib.getByRole('searchbox', { name: 'Search plots' }).fill(LABELS[k]);
      const before = (await cards(page)).map(c => c.id);
      await lib.getByRole('button', { name: `Add ${LABELS[k]}`, exact: true }).click({ timeout: T });
      await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before.length, { timeout: T });
      const c = (await cards(page)).find(x => !before.includes(x.id)); found[k] = { ...c, added: true, tab: tabs ? 0 : null };
      await lib.getByRole('searchbox', { name: 'Search plots' }).fill('');
      for (const name of ['Close library', 'Hide library']) { const b = page.getByRole('button', { name, exact: true }); if (await b.isVisible().catch(() => false)) { await b.click(); break; } }
      await page.waitForFunction(sel => document.querySelector(sel + ' .card-status')?.dataset.state === 'current', `#world .card[data-id="${c.id}"]`, { timeout: T }).catch(() => {});
    }
    console.log('  dashboard cards used:', JSON.stringify(found));
    const ONLY = process.env.NEXO_PROBE_ONLY || 'ABC';
    // ---- A. Data tab of every dashboard card ----
    for (const k of ONLY.includes('A') ? KEYS : []) {
      const c = found[k];
      if (!c) { record(`A data-tab ${k}`, 'FAIL', 'no dashboard card for this plot on nexo-complete-synthetic'); continue; }
      try {
        if (c.tab != null && tabs) { await tabs.nth(c.tab).click(); await page.waitForTimeout(1200); }
        const n0 = schemaCalls.length;
        await select(page, c.id);
        const insp = page.locator('#inspector');
        const tab = insp.getByRole('tab', { name: 'Data', exact: true });
        if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
        const panel = insp.getByRole('tabpanel');
        const ok = await panel.locator('select,input:not([type=hidden]),[role=radio],[role=combobox]').first().waitFor({ timeout: 60000 }).then(() => true, () => false);
        const controls = await panel.locator('select,input:not([type=hidden]),[role=combobox]').evaluateAll(xs => xs.filter(x => x.getBoundingClientRect().width > 0).map(x => (x.getAttribute('aria-label') || x.labels?.[0]?.textContent || x.closest('fieldset')?.querySelector('legend')?.textContent || x.name || x.type).replace(/\s+/g, ' ').trim().slice(0, 40)));
        const text = (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 200);
        const f = await shot(insp, `${k}-4-data-tab-legacy`);
        const calls = schemaCalls.slice(n0).join(', ') || 'none (cached)';
        const detail = `${c.added ? 'added from the Library' : 'on the checkpoint'}: card ${c.id} "${c.label}": ${controls.length} controls [${[...new Set(controls)].join(' | ')}]; schema ${calls} (${f})`;
        if (!ok || !controls.length) record(`A data-tab ${k}`, 'FAIL', `no controls loaded: "${text}"; ${detail}`);
        else record(`A data-tab ${k}`, 'PASS', detail);
      } catch (e) { record(`A data-tab ${k}`, 'FAIL', String(e.message).split('\n')[0]); }
    }
    const heat = found.heat;
    if (heat) {
      if (heat.tab != null && tabs) { await tabs.nth(heat.tab).click(); await page.waitForTimeout(1200); }
      const card = page.locator(`#world .card[data-id="${heat.id}"]`);
      const ids = () => page.locator('#world .card').evaluateAll(cs => cs.map(c => c.dataset.id));
      // ---- B. header chrome and the More card actions menu ----
      if (ONLY.includes('B')) try {
        await select(page, heat.id);
        const edit = card.locator('.card-actions').getByRole('button', { name: 'Edit', exact: true });
        const dupBtn = card.locator('.card-actions').getByRole('button', { name: 'Duplicate', exact: true });
        const vis = { edit: await edit.isVisible(), dup: await dupBtn.isVisible(), editOpacity: await edit.evaluate(b => getComputedStyle(b).opacity) };
        // Edit: closes the inspector first, so Edit must open it on the Data/Appearance tabs
        const close = page.getByRole('button', { name: 'Close inspector', exact: true }); if (await close.isVisible().catch(() => false)) await close.click();
        await edit.click();
        const inspOpen = await page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true }).waitFor({ timeout: 15000 }).then(() => true, () => false);
        const before = await ids();
        await dupBtn.click();
        await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before.length, { timeout: 60000 });
        const dup1 = (await ids()).find(x => !before.includes(x));
        const fB = await shot(page, 'heat-9-header-duplicate');
        // menu: Remove the copy, then Duplicate from the menu, Data & settings, Remove
        const menu = async (id, item) => { const c = page.locator(`#world .card[data-id="${id}"]`); await c.getByRole('button', { name: 'More card actions', exact: true }).click(); await c.getByRole('group', { name: 'More card actions' }).getByRole('button', { name: item, exact: true }).click(); };
        await menu(dup1, 'Remove'); await page.waitForFunction(d => !document.querySelector(`#world .card[data-id="${d}"]`), dup1, { timeout: 30000 });
        await select(page, heat.id);
        const before2 = await ids();
        await menu(heat.id, 'Duplicate');
        await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before2.length, { timeout: 60000 });
        const dup2 = (await ids()).find(x => !before2.includes(x));
        await select(page, heat.id);
        await menu(heat.id, 'Data & settings');
        const dataTab = page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true });
        const dataOk = await dataTab.waitFor({ timeout: 15000 }).then(async () => (await dataTab.getAttribute('aria-selected')) === 'true', () => false);
        await menu(dup2, 'Remove'); await page.waitForFunction(d => !document.querySelector(`#world .card[data-id="${d}"]`), dup2, { timeout: 30000 });
        const detail = `header chrome Edit/Duplicate visible when selected ${vis.edit}/${vis.dup} (opacity ${vis.editOpacity}); Edit opens the Inspector: ${inspOpen}; header Duplicate → ${dup1}; menu Duplicate → ${dup2}; menu Data & settings opens the Data tab: ${dataOk}; menu Remove removed both copies (${fB})`;
        record('B card actions heat', vis.edit && vis.dup && inspOpen && dup1 && dup2 && dataOk ? 'PASS' : 'FAIL', detail);
      } catch (e) { record('B card actions heat', 'FAIL', String(e.message).split('\n')[0]); }
      // ---- C. layout at two viewports ----
      for (const [w, h] of ONLY.includes('C') ? [[1440, 900], [1024, 768]] : []) {
        try {
          await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(800);
          await select(page, heat.id);
          const insp = page.locator('#inspector');
          const names = (await insp.getByRole('tab').allTextContents()).map(t => t.trim()).filter(Boolean);
          const off = [];
          for (const t of names) {
            await insp.getByRole('tab', { name: t, exact: true }).click(); await page.waitForTimeout(700); await expandAll(page); await page.waitForTimeout(400);
            for (const o of await runInspect(page, { roots: [['inspector', '#inspector']], rules: ['spill', 'overlap', 'escape'], edge: '#inspector' })) off.push(`${t}: ${o.rule} ${o.selector} "${o.text}"`);
            await shot(insp, `heat-12-layout-${w}-${t.toLowerCase().replace(/\W+/g, '-')}`);
          }
          for (const o of await runInspect(page, { roots: [['card', `#world .card[data-id="${heat.id}"] > :not(.body)`]], rules: ['spill', 'overlap'] })) off.push(`card: ${o.rule} ${o.selector} "${o.text}"`);
          await card.getByRole('button', { name: 'More card actions', exact: true }).click(); await page.waitForTimeout(300);
          for (const o of await runInspect(page, { roots: [['card', `#world .card[data-id="${heat.id}"] .card-menu`]], rules: ['spill', 'overlap'] })) off.push(`card-menu: ${o.rule} ${o.selector} "${o.text}"`);
          const fm = await shot(page, `heat-12-layout-${w}-card`);
          await page.keyboard.press('Escape');
          record(`C layout ${w}x${h}`, off.length ? 'FAIL' : 'PASS', `tabs [${names.join(', ')}] all <details> open, card chrome + menu: ${off.length ? off.join(' || ') : '0 offenders'} (heat-12-layout-${w}-*.png, ${fm})`);
        } catch (e) { await page.screenshot({ path: `/tmp/nexo-audit-b01-downloads/c-fail-${w}.png` }).catch(() => {}); record(`C layout ${w}x${h}`, 'FAIL', String(e.message).split('\n').slice(0, 4).join(' | ')); }
      }
    }
    await context.close();
  } finally { await browser.close(); }
  record('console', errors.length ? 'FAIL' : 'PASS', (errors.length ? errors.slice(0, 5).join(' || ') : '0 console errors') + (http.length ? `; API errors: ${http.slice(0, 5).join(' || ')}` : ''));
  fs.mkdirSync('/tmp/nexo-audit-b01-downloads', { recursive: true });
  fs.writeFileSync('/tmp/nexo-audit-b01-downloads/results-round6-probe.json', JSON.stringify(results, null, 1));
  console.log(`PROBE b01 round 6: ${results.filter(r => r.status === 'PASS').length} PASS, ${results.filter(r => r.status === 'FAIL').length} FAIL`);
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
})().catch(e => { console.error(String(e.message).split('\n')[0]); process.exitCode = 1; });
