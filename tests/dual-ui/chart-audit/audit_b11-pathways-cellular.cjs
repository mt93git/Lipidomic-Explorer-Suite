'use strict';
// Chart audit, batch b11-pathways-cellular (docs/integration/nexo-chart-audit-plan.md): the 11-row checklist per plot plus
// row 12 "Layout" (1440x900 and 1024x768, every Inspector tab with every section open: nothing overlaps, spills or
// escapes; the same rules as tests/dual-ui/test_nexo_layout_sweep.cjs), in a real browser against the synthetic-only
// audit API. Same structure, checks and evidence names as audit_b03-qc-b.cjs (built from audit_b10-longitudinal.cjs).
// Needs the batch Vite on :5191 (vite.audit.config.mjs, NEXO_AUDIT_API=http://127.0.0.1:3961).
//   node tests/dual-ui/chart-audit/audit_b11-pathways-cellular.cjs [outputName ...]
// pathwayVisNetwork is Team's visNetwork drawn live with vis-network in the card: its signature is the canvas, and row
// "1b network-pan" drags and wheels inside it (the network view moves, the canvas world and the card do not).
// Controls are found by input id (Team repeats labels). If a card waits for a module action, the script records what
// the card says and presses it from the Data tab (#inspector .module-action), as a user does.
// Cards have no footer: Duplicate is in the header chrome, Remove in the ⋯ menu.
// One page at a time (the API holds two sessions in total). Writes screenshots to docs/integration/chart-audit/b11-pathways-cellular/.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5191';
const CP = 'nexo-complete-synthetic', SAVE = 'audit-b11-pathways-cellular-synthetic';
const shots = path.join(root, 'docs/integration/chart-audit/b11-pathways-cellular');
const T = 180000;
fs.mkdirSync(shots, { recursive: true });

// Per plot: the Library label, how it draws, and one Data control a user changes (with an invalid value when numeric).
const colorMap = { select: true, id: 'node_color_map', to: 'fc' };
const dot = { number: true, id: 'pointSize', to: '6', bad: '-1' };
const PLOTS = [
  { out: 'pathwayPlot', family: 'pathway_tab', label: 'Lipid pathway map', render: 'plotly', data: colorMap },
  { out: 'pathwayVisNetwork', family: 'pathway_tab', label: 'Interactive pathway network', render: 'visnetwork', data: colorMap },
  { out: 'stressPlot', family: 'cellular_org_tab', label: 'Organelle stress proxies', render: 'png', data: dot },
  { out: 'cpiPlot', family: 'cellular_org_tab', label: 'Peroxidation index (CPI)', render: 'png', data: dot },
  { out: 'polarPlot', family: 'cellular_org_tab', label: 'Storage vs structural map', render: 'png', data: dot },
];
const ctl = (page, cid) => page.locator(`#inspector [role=tabpanel] :is([id="${cid}"],[name="${cid}"]):is(input,select,textarea)`).first();


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
  page.on('response', r => { if (r.status() >= 400) console.log(`  http ${r.status()} ${r.request().method()} ${r.url().replace(/sessions\/[^/]+/, 'sessions/…').replace(/^https?:\/\/[^/]+/, '')}`); });
  page.cardPaths = new Set();
  if (process.env.AUDIT_DEBUG) page.on('request', r => { if (/\/api\//.test(r.url()) && r.method() !== 'GET') console.log(`  debug ${new Date().toISOString().slice(11, 23)} ${r.method()} ${r.url().replace(/^.*\/cards\//, '')} ${(r.postData() || '').slice(0, 140)}`); });
  if (process.env.AUDIT_DEBUG) page.on('response', async r => { if (/\/cards\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH') console.log(`  debug ${new Date().toISOString().slice(11, 23)} PATCH reply ${r.status()} node_color_map=${(await r.json().catch(() => ({}))).inputs?.node_color_map}`); });
  page.on('request', r => { const m = r.url().match(/\/api\/v1(\/sessions\/[^/]+\/cards\/[^/]+)\/render/); if (m) page.cardPaths.add(m[1]); });
  // Round 2 (F3): the module's layout input as the API last answered it for a card (PATCH or upload reply).
  page.layout = null;
  page.on('response', async r => { if (!r.ok() || !/\/cards\/[^/]+(\/uploads\/[^/]+)?$/.test(r.url()) || !/PATCH|POST/.test(r.request().method())) return;
    const j = await r.json().catch(() => null); const v = j?.inputs?.position_overrides_json ?? j?.card?.inputs?.position_overrides_json; if (typeof v === 'string') page.layout = v; });
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
    const n = c.querySelector('.body .network canvas');
    if (n) return n.width > 0 ? `net:${n.width}x${n.height}:${n.toDataURL().length}` : null;
    const p = c.querySelector('.js-plotly-plot');
    if (p && p.data?.length) return 'plotly:' + JSON.stringify([p.data.map(t => [t.type, t.marker?.size, t.marker?.color, (t.x || []).length, t.name]), p.layout?.title, p._fullLayout?.width, p._fullLayout?.height]);
    return null;
  });
}
async function drawn(page, id) {
  await page.waitForFunction(sel => {
    const c = document.querySelector(sel); if (!c) return false;
    return [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0) || [...c.querySelectorAll('.body .network canvas')].some(n => n.width > 0) || [...c.querySelectorAll('.js-plotly-plot')].some(p => (p.data?.length ?? 0) > 0);
  }, `.card[data-id="${id}"]`, { timeout: T });
  return signature(page, id);
}
async function redrawn(page, id, before) {
  await page.waitForFunction(async ([sel, b]) => {
    const c = document.querySelector(sel); if (!c || c.querySelector('.card-status')?.dataset.state !== 'current') return false;
    const img = c.querySelector('.body img');
    if (img) return img.complete && img.naturalWidth > 0 && `img:${img.getAttribute('src')}:${img.naturalWidth}x${img.naturalHeight}` !== b;
    const n = c.querySelector('.body .network canvas');
    if (n) return n.width > 0 && `net:${n.width}x${n.height}:${n.toDataURL().length}` !== b;
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
async function settle(page) { await page.waitForTimeout(150); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function expandAll(page) {
  for (let i = 0; i < 4; i++) {
    const opened = await page.evaluate(() => { const ds = [...document.querySelectorAll('#inspector details:not([open])')]; ds.forEach(d => { d.open = true; }); return ds.length; });
    if (!opened) break; await settle(page);
  }
}
// What the card says before Generate Analysis, then the module action from the Data tab; returns the drawn signature.
const isDrawn = (page, id) => card(page, id).evaluate(c => [...c.querySelectorAll('.body img')].some(i => i.complete && i.naturalWidth > 0) || [...c.querySelectorAll('.body .network canvas')].some(n => n.width > 0) || [...c.querySelectorAll('.js-plotly-plot')].some(p => (p.data?.length ?? 0) > 0));
async function generate(page, id) {
  const said = { state: await stateOf(page, id), text: (await card(page, id).locator('.body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 200) };
  if (said.state === 'current' && await isDrawn(page, id)) return { ...said, action: 'none needed' };
  await card(page, id).locator('header').click(); await tab(page, 'Data');
  const b = page.locator('#inspector .module-action').first();
  await b.waitFor({ timeout: 20000 }); said.action = (await b.innerText()).trim(); await b.click();
  await page.waitForFunction(sel => { const c = document.querySelector(sel); return c && c.querySelector('.card-status')?.dataset.state === 'current'; }, `.card[data-id="${id}"]`, { timeout: T });
  await drawn(page, id);
  return said;
}
async function tab(page, name) { await page.locator('#inspector').getByRole('tab', { name, exact: true }).click(); }
async function download(page, click, timeout = T) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout }), click()]);
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
}
// Team's labels can carry an info-icon tooltip, so number fields match on the label's start (substring).
async function dataValue(page, plot) {
  await tab(page, 'Data');
  return ctl(page, plot.data.id).inputValue();
}

async function audit(browser, plot) {
  let page = await openPage(browser);
  let insp = page.locator('#inspector');
  let id, before, label = `Audit ${plot.out}`, saved = null;
  const errorsAt = page.errors.length;
  try {
    // 1 Draws: add from the Library, it settles and shows the plot at 100 %; zoomed out it still shows it.
    await check(plot, 1, 'draws', async () => {
      await page.locator('button.library-add').first().waitFor({ state: 'attached', timeout: T });
      if (!(await page.locator('button.library-add').first().isVisible())) await page.getByRole('button', { name: /^Plots/ }).first().click();
      await page.getByPlaceholder(/Search plots/).first().fill(plot.label);
      const tile = page.locator(`button.library-add[aria-label="Add ${plot.label}"]`).first();
      const lib = { disabled: await tile.isDisabled(), says: (await tile.innerText()).replace(/\s+/g, ' ').trim() };
      ok(!lib.disabled, `Library tile disabled: "${lib.says}"`);
      await shot(page, plot, '1-library');
      await tile.click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length > 0, null, { timeout: T });
      id = (await ids(page))[0];
      await settled(page, id, ['current', 'error', 'failed', 'waiting', 'needs-data']);
      await page.getByRole('button', { name: /^(Close library|Hide library)$/ }).first().click(); // close the Library
      await select(page, id);
      const first = await shot(page, plot, '1-before-generate');
      const said = await generate(page, id);
      page.firstSaid = `at first: state=${said.state} "${said.text.slice(0, 120)}", action: ${said.action} (${first})`;
      await select(page, id);
      await page.locator('.zoom-pill').getByRole('button', { name: '100%', exact: true }).click().catch(() => {});
      before = await drawn(page, id);
      ok(before, 'nothing drawn');
      ok(!/Couldn.t bring back/.test(await card(page, id).innerText()), 'card says Couldn\'t bring back');
      const s1 = await shot(page, plot, '1-draws');
      for (let i = 0; i < 4; i++) await page.locator('.zoom-pill').getByRole('button', { name: /^(−|-|Zoom out)$/ }).first().click();
      await page.waitForTimeout(1500);
      const zoomed = await card(page, id).evaluate(c => ({ tier: c.dataset.tier, img: [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0), plot: [...c.querySelectorAll('.js-plotly-plot')].some(p => p.data?.length), net: [...c.querySelectorAll('.network canvas')].some(n => n.width > 0) }));
      const zoom = await page.locator('.zoom-pill').innerText();
      ok(zoomed.img || zoomed.plot || zoomed.net, `zoomed out (${zoom.replace(/\s+/g, ' ')}) the card shows nothing (tier ${zoomed.tier})`);
      const s2 = await shot(page, plot, '1-zoomed-out');
      await select(page, id); before = await signature(page, id);
      return `${page.firstSaid}; then: ${s1}, ${s2}; zoomed out tier=${zoomed.tier} ${zoomed.img ? 'image' : zoomed.plot ? 'plotly' : 'network'}`;
    });
    if (!id || (await stateOf(page, id)) !== 'current') return;

    // 1b (visNetwork only) Pan and zoom inside the card: a drag pans the network view, its zoom button zooms it; the canvas
    // world and the card do not move. The wheel belongs to the canvas by design (src/network/visData.ts networkOptions:
    // zoomView off, Team's navigation buttons kept); the row records what the wheel does.
    if (plot.render === 'visnetwork') await check(plot, '1b', 'network-pan', async () => {
      await select(page, id);
      const net = card(page, id).locator('.body .network canvas');
      const world = () => page.evaluate(() => { const w = document.querySelector('#world'); return w.style.transform || getComputedStyle(w).transform; });
      const pix = () => net.evaluate(n => n.toDataURL());
      const w0 = await world(), c0 = await card(page, id).boundingBox(), p0 = await pix();
      const b = await net.boundingBox(); ok(b, 'no network canvas');
      const cx = b.x + b.width * 0.3, cy = b.y + b.height * 0.75;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 90, cy - 50, { steps: 10 }); await page.mouse.up();
      await page.waitForTimeout(800);
      const w1 = await world(), c1 = await card(page, id).boundingBox(), p1 = await pix();
      const zoomIn = card(page, id).locator('.vis-navigation .vis-zoomIn');
      ok(await zoomIn.count(), 'no zoom-in navigation button in the network');
      const zb = await zoomIn.boundingBox(); await page.mouse.move(zb.x + zb.width / 2, zb.y + zb.height / 2); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up(); await page.waitForTimeout(800);
      const w2 = await world(), c2 = await card(page, id).boundingBox(), p2 = await pix();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, -300); await page.waitForTimeout(800);
      const w3 = await world(), p3 = await pix();
      await fit(page);
      const s1 = await shot(page, plot, '1b-network-pan');
      const moved = (a, z) => Math.abs(a.x - z.x) > 1 || Math.abs(a.y - z.y) > 1;
      ok(w1 === w0 && !moved(c0, c1), `drag inside the network moved the canvas world (${w0} → ${w1}) or the card (${Math.round(c0.x)},${Math.round(c0.y)} → ${Math.round(c1.x)},${Math.round(c1.y)})`);
      ok(w2 === w0 && !moved(c0, c2), `the network's zoom button moved the canvas world (${w0} → ${w2}) or the card`);
      ok(p1 !== p0, 'drag inside the network did not move the network view');
      ok(p2 !== p1, 'the network zoom-in button did not zoom the network view');
      before = await signature(page, id);
      return `drag 90,-50 inside the network panned it and its zoom-in button zoomed it; world transform "${w0}" and card position unchanged; wheel −300 over it (by design, canvas owns the wheel): world ${w3 === w2 ? 'unchanged' : w2 + ' → ' + w3}, network ${p3 === p2 ? 'unchanged' : 'changed'}; ${s1}`;
    });

    // 2 Matches Team: the card's inputs are the catalog defaults, and what it shows is the module's own render.
    await check(plot, 2, 'matches-team', async () => {
      const cat = await page.evaluate(async () => (await (await fetch('/api/v1/catalog')).json()).outputs);
      const entry = cat.find(e => e.id === `${plot.family}-${plot.out}`);
      ok(entry && entry.render === plot.render, `catalog render ${entry?.render}`);
      const shown = await dataValue(page, plot);
      const def = entry.defaults[plot.data.id] ?? entry.inputs.find(i => i.id === plot.data.id)?.default;
      if (plot.data.select && def === undefined) ok(shown !== '', `inspector ${plot.data.id} empty`);
      else if (plot.data.number) ok(Number(shown) === Number(def), `inspector ${plot.data.id}=${shown}, catalog default ${def}`);
      else if (plot.data.select) ok(shown === def, `inspector ${plot.data.id}=${shown}, catalog default ${def}`);
      else ok((shown === plot.data.to) === (def === plot.data.to), `inspector ${plot.data.id} ${shown === plot.data.to ? 'is' : 'is not'} ${plot.data.to}, catalog default ${def}`);
      const cardPath = [...page.cardPaths].find(p => p.endsWith(`-${plot.out}`) || p.includes(id.replace(`-${plot.out}`, '')));
      ok(cardPath, 'no render request seen for the card');
      const own = await page.evaluate(async ([p, render]) => {
        const r = await fetch(`/api/v1${p}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ width: 620, height: 680, format: render === 'png' ? 'png' : 'json' }) });
        if (r.ok && render === 'visnetwork') { const j = await r.json(); const x = j.figure?.x || j.figure || {}; const len = v => Array.isArray(v) ? v.length : v && typeof v === 'object' ? (Object.values(v)[0] || []).length : 0; return { status: r.status, nodes: len(x.nodes), edges: len(x.edges) }; }
        if (!r.ok) return { status: r.status, text: (await r.text()).slice(0, 200) };
        if (render === 'png') { const b = await r.blob(); const bm = await createImageBitmap(b); return { status: r.status, bytes: b.size, w: bm.width, h: bm.height }; }
        const j = await r.json(); return { status: r.status, traces: (j.figure?.data || []).map(t => t.type + ':' + (t.x || []).length), title: JSON.stringify(j.figure?.layout?.title)?.slice(0, 120) };
      }, [cardPath, plot.render]);
      ok(own.status === 200, `module render ${own.status} ${own.text || ''}`);
      if (plot.render === 'visnetwork') {
        const net = await card(page, id).evaluate(c => { const n = c.querySelector('.body .network canvas'); if (!n) return null; const g = n.getContext('2d').getImageData(0, 0, n.width, n.height).data; let ink = 0; for (let i = 0; i < g.length; i += 16) if (g[i + 3] > 0 && (g[i] < 240 || g[i + 1] < 240 || g[i + 2] < 240)) ink++; return { w: n.width, h: n.height, ink }; });
        ok(net && net.ink > 50, `network canvas blank (${JSON.stringify(net)})`);
        ok(own.nodes > 0, `module render has no nodes (${JSON.stringify(own)})`);
        return `module render ${own.nodes} nodes / ${own.edges} edges; card draws them on a ${net.w}x${net.h} canvas (${net.ink} inked samples)`;
      }
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
      const entry = (await page.evaluate(async () => (await (await fetch('/api/v1/catalog')).json()).outputs)).find(e => e.id === `${plot.family}-${plot.out}`);
      // Team's markup for the module (catalog `inputs`) against the Inspector; tabs show as their option labels.
      const present = await insp.locator('[role=tabpanel]').evaluate((p, want) => want.filter(w => w.hidden ? false : w.type === 'tabs'
        ? !w.options.every(o => p.innerText.includes(o.label))
        : !p.querySelector(`[id="${w.id}"], [name="${w.id}"], [data-input="${w.id}"], [id^="${w.id}-"], [id$="-${w.id}"]`)).map(w => w.id), entry.inputs);
      const notMarkup = entry.allowedInputs.filter(a => !entry.inputs.some(i => i.id === a));
      // Team's run-time controls (renderUI, e.g. the pathway's "Classes to Display") must be offered too.
      const liveMissing = await insp.locator('[role=tabpanel]').evaluate((p, want) => want.filter(w => !p.querySelector(`[id="${w}"], [name="${w}"], [data-input="${w}"], [id^="${w}-"], [id$="-${w}"]`)), notMarkup);
      let changed;
      await expandAll(page);
      const where = await page.locator(`#inspector [role=tabpanel] :is([id="${plot.data.id}"],[name="${plot.data.id}"])`).evaluateAll(es => es.map(e => `${e.tagName.toLowerCase()}:${e.type || ''} visible=${!!e.offsetParent} closed-details=${!!e.closest('details:not([open])')}`));
      ok(await ctl(page, plot.data.id).isVisible(), `${plot.data.id} not visible in the Data tab: ${JSON.stringify(where)}`);
      if (plot.data.select) await ctl(page, plot.data.id).selectOption(plot.data.to);
      else { const f = ctl(page, plot.data.id); await f.fill(plot.data.to); if (await f.getAttribute('type') !== 'range') await f.press('Enter'); await f.blur(); }
      changed = await redrawn(page, id, before);
      const s1 = await shot(page, plot, '4-data-changed');
      let refused = 'no numeric control (N/A)';
      const slider = plot.data.number && await ctl(page, plot.data.id).getAttribute('type') === 'range';
      if (slider) refused = 'slider bounded like Team: an out-of-range value cannot be entered';
      if (plot.data.bad && !slider) {
        const f = ctl(page, plot.data.id);
        await f.fill(plot.data.bad); await f.press('Enter'); await f.blur();
        await page.waitForTimeout(2500);
        const msg = (await page.locator('#inspector [role=alert], #inspector .field-error, #inspector [aria-invalid=true], .toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
        const after = await signature(page, id), st = await stateOf(page, id);
        const s2 = await shot(page, plot, '4-data-invalid');
        refused = `invalid ${plot.data.bad}: state=${st}, redrew=${after !== changed}, message="${msg.slice(0, 160)}" (${s2})`;
        ok(msg.length > 0 || await f.evaluate(e => !e.checkValidity()), `invalid ${plot.data.bad} accepted silently (state ${st}, redrew ${after !== changed})`);
        await f.fill(plot.data.to); await f.press('Enter'); await f.blur(); await page.waitForTimeout(1500);
      }
      const rawIds = (await insp.locator('[role=tabpanel] button').allTextContents()).map(t => t.trim()).filter(t => /^[a-z][A-Za-z0-9]*_[A-Za-z0-9_]+$/.test(t));
      before = await signature(page, id);
      ok(present.length === 0, `allowedInputs without a control: ${present.join(', ')}`);
      ok(liveMissing.length === 0, `Team's run-time controls missing from the Data tab: ${liveMissing.join(', ')} (${s1})`);
      ok(rawIds.length === 0, `buttons named by their input id: ${rawIds.join(', ')} (${s1})`);
      return `${entry.inputs.length} Team controls all present (Team's run-time controls ${notMarkup.join(', ') || 'none'}: all present); ${plot.data.id}→${plot.data.to} redrew (${s1}); ${refused}`;
    });

    // 4b (round 2) F1: Team's hidden *_json layout carriers are not shown; F3: Team's layout JSON download/upload.
    if (plot.family === 'pathway_tab') await check(plot, '4b', 'layout-json', async () => {
      await select(page, id); await tab(page, 'Data'); await expandAll(page);
      const carriers = await insp.locator('[role=tabpanel]').evaluate(p => [...p.querySelectorAll('[id$="_json"],[name$="_json"],[data-input$="_json"]')]
        .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => e.id || e.getAttribute('name') || e.dataset.input));
      ok(carriers.length === 0, `F1: hidden layout carriers shown in the Data tab: ${carriers.join(', ')}`);
      const notes = ['F1: no *_json box in the Data tab'];
      // Download Team's layout file (Export tab, "More downloads from this analysis").
      await tab(page, 'Export');
      const more = insp.getByRole('group', { name: 'More downloads from this analysis', exact: true });
      const file = await download(page, () => more.getByRole('button', { name: 'Download Layout JSON', exact: true }).click(), 60000);
      const layout = JSON.parse(file.bytes.toString('utf8'));
      ok(Array.isArray(layout.active_classes) && layout.active_classes.length > 0, `layout file has no active_classes: ${file.bytes.toString('utf8').slice(0, 120)}`);
      const fresh = JSON.stringify(layout.position_overrides ?? {});
      notes.push(`downloaded ${file.name} ${file.bytes.length} B (${layout.active_classes.length} classes, overrides ${fresh.slice(0, 40)})`);
      // Move a node with Team's Move Node action.
      await tab(page, 'Data'); await expandAll(page);
      const sigBefore = await signature(page, id);
      // "Select Node to Move:" is a long list, so Nexo shows its searchable picker (a listbox of options).
      const node = insp.locator('[role=tabpanel] [id="move_node_select"]').first();
      let nodeName;
      if (await node.evaluate(e => e.tagName === 'SELECT')) { nodeName = await node.evaluate(e => e.options[0]?.value); await node.selectOption(nodeName); }
      else { const opt = node.getByRole('option').first(); nodeName = (await opt.innerText()).trim(); await opt.click(); }
      for (const [cid, v] of [['move_x', '123'], ['move_y', '-45']]) { const f = ctl(page, cid); await f.fill(v); await f.press('Enter'); await f.blur(); }
      await page.waitForTimeout(1500);
      await insp.getByRole('button', { name: 'Move Node', exact: true }).click();
      await page.waitForFunction(() => true);
      const t0 = Date.now(); while (!(page.layout || '').includes('123') && Date.now() - t0 < 60000) await page.waitForTimeout(500);
      ok((page.layout || '').includes('123'), `Move Node did not change the layout input (last ${page.layout})`);
      const moved = await redrawn(page, id, sigBefore);
      notes.push(`Move Node ${nodeName} → (123,-45): layout ${page.layout.slice(0, 60)}, redrew`);
      const s1 = await shot(page, plot, '4b-layout-moved');
      // Upload the downloaded file: the layout comes back.
      const input = insp.locator('[role=tabpanel] input[type=file][id$="-upload_config"]');
      if (!(await input.count())) {
        const cardPath = [...page.cardPaths].find(p => p.includes(id.replace(`-${plot.out}`, ''))) || [...page.cardPaths].pop();
        const served = await page.evaluate(async p => { const r = await fetch(`/api/v1${p}/schema`); return r.ok ? JSON.stringify((await r.json()).uploads) : `HTTP ${r.status}`; }, cardPath);
        const s0 = await shot(page, plot, '4b-layout-no-upload');
        throw new Error(`F3: no "Upload Layout JSON (.json):" field in the Data tab; the API's card schema has uploads=${served} (${notes.join('; ')}; ${s1}, ${s0})`);
      }
      const upLabel = (await insp.locator('[role=tabpanel] label[for$="-upload_config"]').innerText()).trim();
      await input.setInputFiles({ name: file.name, mimeType: 'application/json', buffer: file.bytes });
      const t1 = Date.now(); while ((page.layout || '').includes('123') && Date.now() - t1 < 60000) await page.waitForTimeout(500);
      ok(!(page.layout || '').includes('123'), `upload did not bring the layout back (last ${page.layout})`);
      ok(JSON.stringify(JSON.parse(page.layout || '{}')) === fresh || (fresh === '{}' && /^(\{\}|\[\])$/.test(page.layout)), `layout after upload ${page.layout}, downloaded ${fresh}`);
      const back = await redrawn(page, id, moved);
      notes.push(`"${upLabel}" ${file.name} → layout ${page.layout}, redrew${back === sigBefore ? ' (same drawing as before the move)' : ''}`);
      const s2 = await shot(page, plot, '4b-layout-uploaded');
      // Refusals: not .json, too large.
      const alerts = async () => (await page.locator('#inspector [role=alert], .toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
      await input.setInputFiles({ name: 'layout.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
      await page.locator('#inspector [role=alert], .toast').filter({ hasText: /\.json/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
      const a1 = await alerts(); ok(/json/i.test(a1), `a .csv file was not refused with a message (page says "${a1}")`);
      await input.setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ pad: 'x'.repeat(300 * 1024) })) });
      await page.locator('#inspector [role=alert], .toast').filter({ hasText: /256 KiB|too large|larger/i }).first().waitFor({ timeout: 15000 }).catch(() => {});
      const a2 = await alerts(); ok(/256 KiB|too large|larger/i.test(a2), `a 300 KiB .json was not refused with a message (page says "${a2}")`);
      const s3 = await shot(page, plot, '4b-layout-refused');
      ok(!(page.layout || '').includes('pad'), 'a refused file changed the layout');
      notes.push(`.csv refused: "${a1.slice(0, 80)}"; 300 KiB .json refused: "${a2.slice(-80)}"; ${s1}, ${s2}, ${s3}`);
      before = await signature(page, id);
      return notes.join('; ');
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
        const ed = insp.locator('div.plot-editor');
        ok(await ed.count(), 'no plot editor for a Plotly plot');
        await ed.evaluate(e => e.querySelectorAll('details').forEach(d => { d.open = true; }));
        const plotTitle = () => card(page, id).evaluate(c => { const p = c.querySelector('.js-plotly-plot'); const t = p._fullLayout?.title?.text; return t; });
        const t = ed.getByLabel('Plot title', { exact: true });
        if (await t.count()) { await t.fill('Audit title'); await t.blur(); await page.waitForFunction(sel => document.querySelector(sel + ' .js-plotly-plot')?._fullLayout?.title?.text === 'Audit title', `.card[data-id="${id}"]`, { timeout: 10000 }); notes.push('Plot title on the plot'); }
        else notes.push('NO Plot title field');
        // F3 Typography: the base font size is "Base size" (it was "Chart font size" in earlier rounds).
        for (const [f, v] of [['Chart font size|Base size', '16'], ['Chart text color', '#aa0000'], ['Plot background', '#f0f0ff']]) {
          const c = f.includes('|') ? ed.getByLabel(new RegExp(`^(${f})$`)).first() : ed.getByLabel(f, { exact: true }); if (!(await c.count())) { notes.push(`NO ${f}`); continue; }
          await c.fill(v); await c.blur();
          notes.push(f);
        }
        await page.waitForTimeout(800);
        const lay = await card(page, id).evaluate(c => { const l = c.querySelector('.js-plotly-plot')._fullLayout; return { size: l.font.size, color: l.font.color, plot: l.plot_bgcolor, legend: [l.legend?.x, l.legend?.y], showlegend: l.showlegend, given: JSON.stringify(c.querySelector('.js-plotly-plot').layout.font) }; });
        notes.push(`font ${lay.size} ${lay.color}, plot bg ${lay.plot}`);
        ok(lay.size === 16, `font size not on the plot (${lay.size}; layout.font ${lay.given}; field shows ${await ed.getByLabel(/^(Chart font size|Base size)$/).first().inputValue().catch(() => '?')})`);
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

    // 6 Statistics: the Statistics tab is for violin and group comparison only; these modules' own tests are Data controls.
    await check(plot, 6, 'statistics', async () => {
      await select(page, id); await tab(page, 'Statistics');
      const t = (await insp.locator('[role=tabpanel]').innerText()).replace(/\s+/g, ' ').trim();
      ok(!(await insp.getByRole('button', { name: /Review and confirm/ }).count()), 'statistics offered for a plot Team has no Statistics tab for');
      return { na: `Team has no statistics for this plot; tab says "${t.slice(-80)}"` };
    });

    // 7 Export: PNG/SVG/PDF of the card and Team's own downloads.
    await check(plot, 7, 'export', async () => {
      await select(page, id); await tab(page, 'Export');
      const notes = [];
      const png = await download(page, () => insp.getByRole('button', { name: 'Download PNG', exact: true }).click());
      ok(png.bytes.subarray(1, 4).toString() === 'PNG', 'PNG is not a PNG'); notes.push(`PNG ${png.bytes.length} B`);
      const svgB = insp.getByRole('button', { name: 'Download SVG', exact: true });
      await page.waitForTimeout(1500); // the PNG download leaves the buttons busy for a moment
      const svgWhy = async () => { const d = await svgB.getAttribute('aria-describedby'); return d ? (await page.locator(`[id="${d}"]`).innerText()).trim() : ''; };
      if (await svgB.isDisabled()) notes.push(`SVG disabled ("${(await svgWhy()) || (await svgB.getAttribute('title')) || (await insp.locator('[role=tabpanel]').innerText()).replace(/\s+/g, ' ').match(/[^.]*SVG[^.]*\./)?.[0] || 'no reason shown'}")`);
      else { const svg = await download(page, () => svgB.click()); ok(/<svg/.test(svg.bytes.toString('utf8', 0, 4000)), 'SVG has no <svg'); notes.push(`SVG ${svg.bytes.length} B`); }
      const more = insp.getByRole('group', { name: 'More downloads from this analysis', exact: true });
      if (await more.count()) {
        for (const b of await more.getByRole('button').allTextContents()) {
          // A Team download that fails must say so, not hang.
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
      ok(before.startsWith({ png: 'img:', plotly: 'plotly:', visnetwork: 'net:' }[plot.render]), `after Edit figure the card shows ${before.slice(0, 20)}`);
      return `snapshot ${snap.w}x${snap.h} in a ${Math.round(body.width)}x${Math.round(body.height)} body; Edit figure → live ${plot.render}; ${s1}`;
    });

    // 9 Duplicate keeps inputs and appearance; remove + Undo restores.
    await check(plot, 9, 'duplicate-remove-undo', async () => {
      await select(page, id);
      const v0 = await dataValue(page, plot);
      await card(page, id).locator('header').getByRole('button', { name: 'Duplicate', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 2, null, { timeout: T });
      const dup = (await ids(page)).find(x => x !== id);
      await settled(page, dup, ['current', 'error', 'failed', 'waiting', 'needs-data']);
      const dupFirst = { state: await stateOf(page, dup), drawn: await card(page, dup).evaluate(c => [...c.querySelectorAll('.body img')].some(i => i.complete && i.naturalWidth > 0)) };
      if (dupFirst.state !== 'current' || !dupFirst.drawn) { await shot(page, plot, '9-duplicate-before-generate'); await generate(page, dup); }
      await drawn(page, dup);
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
      return `duplicate "${dupTitle}" with ${plot.data.id}=${v1} (at first: state=${dupFirst.state}, drawn=${dupFirst.drawn}); remove + Undo brought it back drawn; ${s1}`;
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
      page = await openPage(browser, saved); insp = page.locator('#inspector');
      await page.waitForFunction(() => document.querySelectorAll('#world .card').length === 1, null, { timeout: T });
      const rid = (await ids(page))[0];
      await settled(page, rid, ['current', 'error', 'failed', 'waiting', 'needs-data']);
      const reFirst = { state: await stateOf(page, rid), drawn: await card(page, rid).evaluate(c => [...c.querySelectorAll('.body img')].some(i => i.complete && i.naturalWidth > 0)) };
      if (reFirst.state !== 'current' || !reFirst.drawn) { await shot(page, plot, '10-reopened-before-generate'); await generate(page, rid); }
      await drawn(page, rid);
      const title = await card(page, rid).locator('.card-title').textContent();
      const bgc = await card(page, rid).evaluate(c => getComputedStyle(c).backgroundColor + '/' + getComputedStyle(c.querySelector('.body')).backgroundColor);
      await select(page, rid);
      const v1 = await dataValue(page, plot);
      const s1 = await shot(page, plot, '10-reopened');
      ok(title === label, `reopened title "${title}"`);
      ok(v1 === v0, `reopened ${plot.data.id}=${v1}, saved ${v0}`);
      ok(/255, 244, 224/.test(bgc), `reopened background ${bgc}`);
      page.reopened = rid;
      return `reopened ${saved.slice(0, 12)}…: "${title}", ${plot.data.id}=${v1}, background kept (at first: state=${reFirst.state}, drawn=${reFirst.drawn}); ${s1}`;
    });

    // 12 Layout: 1440x900 and 1024x768, every Inspector tab with every section open, and the card chrome.
    await check(plot, 12, 'layout', async () => {
      const rid = page.reopened || id; ok(rid, 'no card');
      const found = [], notes = [];
      for (const [w, h] of [[1440, 900], [1024, 768]]) {
        await page.setViewportSize({ width: w, height: h }); await settle(page);
        await select(page, rid);
        const tabs = await insp.getByRole('tab').allTextContents();
        for (const t of tabs) {
          await tab(page, t); await settle(page); await page.waitForTimeout(250); await expandAll(page);
          const list = await page.evaluate(inspect, { roots: [['inspector', '#inspector']], rules: ['spill', 'overlap', 'escape'], edge: '#inspector' });
          list.forEach(o => found.push(`${w}x${h} ${t} ${o.rule} ${o.selector} "${o.text}"`));
          if (list.length || t === 'Data') notes.push(await shot(page, plot, `12-${w}-${t.toLowerCase()}`, insp));
        }
        const chrome = await page.evaluate(inspect, { roots: [['card', `.card[data-id="${rid}"] > :not(.body)`]], rules: ['spill', 'overlap'] });
        chrome.forEach(o => found.push(`${w}x${h} card ${o.rule} ${o.selector} "${o.text}"`));
        const more = card(page, rid).locator('.card-more > button[aria-expanded]');
        if (await more.count()) {
          await more.click(); await settle(page);
          const menu = await page.evaluate(inspect, { roots: [['card', `.card[data-id="${rid}"] .card-menu`]], rules: ['spill', 'overlap'] });
          menu.forEach(o => found.push(`${w}x${h} card-menu ${o.rule} ${o.selector} "${o.text}"`));
          await more.click();
        }
        const title = await card(page, rid).locator('.card-title').evaluate(e => ({ cut: e.scrollWidth > e.clientWidth + 1, tip: e.getAttribute('title') || e.closest('[title],[data-tip]')?.getAttribute('title') || '' }));
        if (title.cut && !title.tip) found.push(`${w}x${h} card title clipped without a tooltip`);
        notes.push(`${w}x${h}: ${tabs.length} tabs`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      ok(found.length === 0, `${found.length} offender(s): ${found.slice(0, 6).join(' | ')}`);
      return `0 offenders; ${notes.join('; ')}`;
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
