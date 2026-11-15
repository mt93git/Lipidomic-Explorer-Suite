// H9 layout sweep: every catalog card's inspector (every tab, every collapsible section) and card chrome, at realistic
// mock sizes, checked by machine for text spill, overlapping controls, sideways escape and console errors.
// NEXO_PLOTLY_JS=... node tests/dual-ui/test_nexo_layout_sweep.cjs   (NEXO_SWEEP_ENGINES=chromium,webkit; NEXO_SWEEP_SHOTS=dir)
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const outputs = require(path.join(nexo, 'src/mock/catalog.json')).outputs, sources = outputs.map(o => o.id);
const only = process.env.NEXO_SWEEP_ONLY?.split(',');
if (only) sources.splice(0, sources.length, ...sources.filter(id => only.some(o => id.includes(o))));
const engines = (process.env.NEXO_SWEEP_ENGINES || 'chromium').split(',');
const shots = process.env.NEXO_SWEEP_SHOTS; // dir for inspector PNGs of offending tabs (every tab with NEXO_SWEEP_SHOTS_ALL=1)
let server;
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: nexo, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
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
const offenders = [], seen = new Set();
function report(viewport, source, tab, list) {
  let n = 0;
  for (const o of list) {
    const line = `${viewport} ${source} ${tab} ${o.rule} ${o.selector} "${o.text.slice(0, 40)}"`;
    if (seen.has(line)) continue; seen.add(line); offenders.push(line); console.log(line); n++;
  }
  return n;
}
// Confirm the study design through the library's gated row, as a user does; the mock then also reports time points
// (__nexoPrefetchMock.timePoints, set before load), so every one of the 59 outputs can be added with its own schema.
async function confirmDesign(page) {
  const panel = page.locator('.library-panel');
  if (await panel.isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
  await page.evaluate(() => document.querySelectorAll('#library-panel-plots details').forEach(d => { d.open = true; }));
  const row = page.locator('#library-panel-plots .library-row', { has: page.locator('strong', { hasText: /^Differential volcano$/ }) });
  await row.getByRole('button', { name: 'Confirm study design… (Differential volcano)', exact: true }).first().click();
  const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
  await design.getByLabel('Experimental unit').selectOption('Animal');
  await design.getByLabel('Sample relationship').selectOption('independent');
  await design.getByRole('button', { name: 'Confirm study design', exact: true }).click();
  await design.waitFor({ state: 'hidden' });
}
async function settle(page) { await page.waitForTimeout(150); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function expandAll(page) {
  for (let i = 0; i < 4; i++) {
    const opened = await page.evaluate(() => { const ds = [...document.querySelectorAll('#inspector details:not([open])')]; ds.forEach(d => { d.open = true; }); return ds.length; });
    if (!opened) break; await settle(page);
  }
}
async function desktop(pw, engine, base, width, height) {
  const viewport = `${engine}:${width}x${height}`;
  const browser = await pw[engine].launch();
  let bad = 0;
  try {
    const context = await browser.newContext({ viewport: { width, height } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    context.on('response', r => { if (r.status() >= 400) console.error(`# http ${r.status()} ${r.url()}`); });
    const page = await context.newPage();
    await page.addInitScript(() => { const t = setInterval(() => { if (window.__nexoPrefetchMock) { window.__nexoPrefetchMock.timePoints = true; clearInterval(t); } }, 5); });
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const inspector = page.locator('#inspector');
    await confirmDesign(page);
    for (const source of sources) {
      errors.length = 0;
      let found = 0;
      try {
        // Gated outputs are added as a user adds them, after the design is confirmed (confirmDesign): pointing another
        // card's instance at them kept that card's controls, so their own Data tab was never checked.
        const id = await page.evaluate(async source => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
          await window.__nexo.handle.addCard(source);
          return window.__nexo.store.get().nodes.find(n => !before.has(n.id))?.id; }, source);
        if (!id) throw new Error('addCard added no node');
        const card = page.locator(`.card[data-id="${id}"]`);
        await page.evaluate(id => window.__nexo.handle.focusNode(id), id);
        await card.locator('header').click();
        await inspector.getByRole('tab').first().waitFor({ timeout: 10000 });
        const tabs = await inspector.getByRole('tab').allTextContents();
        for (const tab of tabs) {
          await inspector.getByRole('tab', { name: tab, exact: true }).click();
          await settle(page); await page.waitForTimeout(250); await expandAll(page);
          found += report(viewport, source, tab, await page.evaluate(inspect, { roots: [['inspector', '#inspector']], rules: ['spill', 'overlap', 'escape'], edge: '#inspector' }));
          if (shots && (found || process.env.NEXO_SWEEP_SHOTS_ALL)) await page.locator('#inspector').screenshot({ path: path.join(shots, `${engine}-${width}-${source}-${tab}.png`) }).catch(() => {});
        }
        // Card chrome: header, badges, footer and the ⋯ menu opened.
        const chrome = [['card', `.card[data-id="${id}"] > :not(.body)`]];
        found += report(viewport, source, 'card', await page.evaluate(inspect, { roots: chrome, rules: ['spill', 'overlap'] }));
        const more = card.locator('.card-more > button[aria-expanded]');
        if (await more.count()) {
          await more.click(); await settle(page);
          found += report(viewport, source, 'card-menu', await page.evaluate(inspect, { roots: [['card', `.card[data-id="${id}"] .card-menu`]], rules: ['spill', 'overlap'] }));
          await more.click();
        }
        // The card's Export dialog (More export options…): its action row must stay inside the dialog (chart audit b12 F3).
        const exportTab = inspector.getByRole('tab', { name: 'Export', exact: true });
        if (await exportTab.count()) {
          await exportTab.click(); await settle(page);
          const open = inspector.getByRole('button', { name: 'More export options…', exact: true });
          if (await open.count()) {
            await open.click(); await page.locator('dialog.export-dialog[open]').waitFor({ timeout: 10000 }); await settle(page);
            found += report(viewport, source, 'export-dialog', await page.evaluate(inspect, { roots: [['dialog', 'dialog.export-dialog']], rules: ['spill', 'overlap', 'escape'], edge: 'dialog.export-dialog' }));
            // A button's label must not be drawn in its own background colour (the primary Download PNG was white on white).
            found += report(viewport, source, 'export-dialog', await page.evaluate(() => [...document.querySelectorAll('dialog.export-dialog button')].filter(b => { const cs = getComputedStyle(b); return b.textContent.trim() && cs.color === cs.backgroundColor; }).map(b => ({ where: 'dialog', rule: 'invisible-label', selector: 'dialog.export-dialog button' + (b.className ? '.' + b.className : ''), text: b.textContent.trim() }))));
            await page.locator('dialog.export-dialog').getByRole('button', { name: 'Close', exact: true }).click();
          }
        }
        await page.evaluate(id => { window.__nexo.handle.focusNode(id); }, id);
        await page.evaluate(() => window.__nexo.handle.removeSelection());
      } catch (e) { found += report(viewport, source, '-', [{ rule: 'error', selector: 'sweep', text: String(e.message).split('\n')[0] }]); }
      await settle(page);
      errors.forEach(e => console.error(`# console ${viewport} ${source}: ${e}`));
      found += report(viewport, source, '-', errors.map(e => ({ rule: 'console', selector: 'console', text: e })));
      if (!found) console.log(`PASS ${viewport} ${source}`);
      bad += found;
    }
    await context.close();
  } finally { await browser.close(); }
  return bad;
}
async function phone(pw, engine, base) {
  const viewport = `${engine}:390x844`;
  const browser = await pw[engine].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    await page.waitForFunction(() => document.querySelectorAll('.card .body > *').length >= 2);
    const roots = [['topbar', '.topbar'], ['card', '.card > :not(.body)'], ['inspector', '#inspector'], ['sheet', '[role=dialog]']];
    let found = report(viewport, 'phone', 'open', await page.evaluate(inspect, { roots, rules: ['spill', 'escape'] }));
    const first = page.locator('.card header').first();
    await first.tap().catch(() => {}); await settle(page); await page.waitForTimeout(300);
    found += report(viewport, 'phone', 'card-tapped', await page.evaluate(inspect, { roots, rules: ['spill', 'escape'] }));
    const sheet = page.locator('#inspector');
    for (const tab of await sheet.getByRole('tab').allTextContents()) {
      await sheet.getByRole('tab', { name: tab, exact: true }).tap(); await settle(page); await expandAll(page);
      found += report(viewport, 'phone', tab, await page.evaluate(inspect, { roots, rules: ['spill', 'escape'] }));
    }
    found += report(viewport, 'phone', '-', errors.map(e => ({ rule: 'console', selector: 'console', text: e })));
    if (!found) console.log(`PASS ${viewport} phone`);
    await context.close();
    return found;
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP sweep Playwright: ${e.message}`); return; } throw e; }
  run('sh', ['scripts/vendor-plotly.sh']);
  // NEXO_SWEEP_OUTDIR (e.g. node_modules/.sweep-dist) builds and serves apart from dist/, so a sweep can run beside another suite.
  const outDir = process.env.NEXO_SWEEP_OUTDIR ? ['--outDir', process.env.NEXO_SWEEP_OUTDIR] : [];
  run('npm', ['run', 'build', '--', ...outDir], { VITE_API_MOCK: '1' });
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort', ...outDir], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  if (shots) require('node:fs').mkdirSync(shots, { recursive: true });
  for (const engine of engines) {
    for (const [w, h] of [[1440, 900], [1024, 768]]) await desktop(pw, engine, base, w, h);
    await phone(pw, engine, base);
  }
  console.log(`SUMMARY offenders=${offenders.length} sources=${sources.length} engines=${engines.join(',')}`);
  if (offenders.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
