// Run with: node tests/dual-ui/test_team_step_backdrop.cjs
//   Screenshots go to $W3D_SHOTS (default <tmpdir>/w3d-shots).
//   --without-backdrop runs the same checks with step_backdrop.css left out; it must fail.
//   Optional live pass: W3D_APP_URL=http://127.0.0.1:PORT also runs the checks against a running Team app
//   (LIPIDOMIC_INTERFACE=team, LIPIDOMIC_TEAM_WORKSPACE=1, LIPIDOMIC_PROJECT_LIBRARY=1). The live pass flips the
//   client-side auth flag only (no sign-in, nothing sent to the identity service) and drives the pre-Canvas screens.
// W3D: illustrated backdrop on the pre-Canvas Team steps (start, Data matrix, Data metadata, Review, loading).
// Fixtures in fixtures/team_step_backdrop/ are the visible DOM of the running app (scripts and the companion
// removed), styled with the app's compiled vendor CSS (vendor.css) and the real www/team/css files in ui.R order. Per step, at 1440x900 and 390x844 with
// reduced motion, the test checks:
//   - the layer is present (fixed body::before, pointer-events:none, z-index from --z-backdrop) and visibly
//     changes the page (share of viewport pixels it changes), and is absent without step_backdrop.css;
//   - every visible control's centre (scrolled into view) hits that control;
//   - WCAG contrast >= 4.5:1 for every text run painted directly over the backdrop (and the loading dialog
//     text), against the darkest and the lightest rendered pixel under its line boxes, text hidden;
//   - no horizontal scroll, and no layout shift (control rects and page height identical with the layer off).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

const ROOT = path.resolve(__dirname, '../..');
const WWW = path.join(ROOT, 'www');
const FIX = path.join(__dirname, 'fixtures/team_step_backdrop');
const OUT = process.env.W3D_SHOTS || path.join(os.tmpdir(), 'w3d-shots');
const ORIGIN = 'http://w3d.test';
const WITHOUT = process.argv.includes('--without-backdrop');

// Team CSS in document order in workspace mode: ui.R's head, then the sheets the body UI includes
// (guided_workflow.R, canvas.R); classic-only sheets dropped. includeCSS inlines the files, so relative url()s
// resolve against the page, exactly as here.
const uiR = ['R/frontends/team/ui.R', 'R/frontends/team/guided_workflow.R', 'R/frontends/team/canvas.R'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const SHEETS = [...uiR.matchAll(/includeCSS\(["']www\/team\/css\/([a-z0-9_]+\.css)["']\)/g)].map(m => m[1])
  .filter((f, i, a) => a.indexOf(f) === i && !['pending_changes_bar.css', 'experiment_cards.css'].includes(f));
assert.ok(SHEETS.includes('step_backdrop.css'), 'ui.R registers step_backdrop.css');
const readCss = f => fs.readFileSync(path.join(WWW, 'team/css', f), 'utf8').replace(/@import url\([^)]*\);?/g, '');
const css = withBackdrop => SHEETS.filter(f => (withBackdrop && !WITHOUT) || f !== 'step_backdrop.css')
  .map(f => `<style data-sheet="${f}">${readCss(f)}</style>`).join('\n');
// vendor.css: the compiled shiny, bootstrap 5.3.1, bslib, selectize and ionRangeSlider CSS the app serves (urls
// dropped); bslib's fillable page also inlines html{height:100%}.
const VENDOR = fs.readFileSync(path.join(FIX, 'vendor.css'), 'utf8');
const page = (name, withBackdrop) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style data-sheet="vendor">${VENDOR}</style><style data-sheet="bslib-fill">html { height: 100%; }</style>${css(withBackdrop)}</head>\n${fs.readFileSync(path.join(FIX, name + '.html'), 'utf8')}</html>`;
const STEPS = [
  { name: 'start', fixture: 'start', screen: 'data-choice' },
  { name: 'data', fixture: 'data', screen: 'data-matrix' },
  { name: 'metadata', fixture: 'metadata', screen: 'data-metadata' },
  { name: 'review', fixture: 'review', screen: 'review-single' },
  { name: 'loading', fixture: 'review', screen: 'review-single', busy: true },
];
const VIEWPORTS = [[1440, 900], [390, 844]];

// ---- in-page probes ---------------------------------------------------------------------------------------
const probe = () => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.right + scrollX > 0 && r.bottom + scrollY > 0 && e.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) && !e.closest('[inert],[aria-hidden=true],details:not([open]) > :not(summary)'); };
  const dialog = document.querySelector('dialog[open]');
  const all = [...document.querySelectorAll('button,a[href],input:not([type=hidden]):not([tabindex="-1"][readonly]),select,textarea,summary,label.btn,[role=button],.irs-handle')].filter(vis);
  // With the loading dialog open, the dialog itself (and any control in it) must take the hit.
  const scope = (dialog ? [dialog, ...all.filter(e => dialog.contains(e))] : all).filter(e => !e.disabled); // disabled controls take no input
  const rects = all.map(e => { const r = e.getBoundingClientRect(); return [e.tagName, Math.round(r.x + scrollX), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)].join(':'); });
  const misses = [];
  for (const e of scope) {
    if (!dialog) e.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const ok = hit && (e === hit || e.contains(hit) || (e.labels && [...e.labels].some(l => l.contains(hit))) || (hit.tagName === 'LABEL' && hit.control === e));
    if (!ok) misses.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${(e.textContent || e.value || '').trim().slice(0, 24)}" -> ${hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') + '.' + String(hit.className).split(' ')[0] : 'nothing'}`);
  }
  window.scrollTo(0, 0);
  const bg = getComputedStyle(document.body, '::before'), layout = document.querySelector('.bslib-sidebar-layout');
  return {
    misses, count: scope.length, rects,
    hscroll: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
    pseudo: { content: bg.content, image: bg.backgroundImage, position: bg.position, pe: bg.pointerEvents, z: bg.zIndex, anim: bg.animationName, layer: getComputedStyle(document.documentElement).getPropertyValue('--z-backdrop').trim() },
    height: document.documentElement.scrollHeight,
    layoutArt: layout ? getComputedStyle(layout).backgroundImage : 'none',
  };
};

// Text runs painted directly over the backdrop: no opaque background colour between the text and <body>
// (background images such as the start screen's data-matrix art count as illustration, so they are measured). Line boxes
// come from Range.getClientRects (the glyph area, not the element box), sampled where the text is on top. The loading dialog's text is included.
const collectText = () => {
  const out = [], dialog = document.querySelector('dialog[open]');
  const opaqueBetween = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); const m = s.backgroundColor.match(/[\d.]+/g); if (m && (m[3] === undefined || +m[3] > 0.5) && s.backgroundImage === 'none') return true; } return false; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode, e = n.parentElement;
    if (!n.nodeValue.trim() || !e || /^(SCRIPT|STYLE|OPTION)$/.test(e.tagName)) continue;
    const inDialog = dialog && dialog.contains(e);
    if (dialog && !inDialog) continue; // the page behind a modal is inert and blurred
    if (!inDialog && (opaqueBetween(e) || e.closest('#lipidomic-companion,.lipid-help-panel'))) continue;
    const s = getComputedStyle(e);
    if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) || e.closest(':disabled,[aria-disabled=true],[aria-hidden=true]')) continue;
    let clipped = false; for (let a = e; a && a !== document.body; a = a.parentElement) { const st = getComputedStyle(a), r = a.getBoundingClientRect(); if (st.overflow !== 'visible' && (r.width < 2 || r.height < 2)) { clipped = true; break; } }
    if (clipped) continue; // zero-size clipped boxes (sizers, visually-hidden text) paint nothing
    const range = document.createRange(); range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter(r => r.width >= 2 && r.height >= 6 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
    // Sample the line boxes every 2px and keep only points where this text is on top (anything floating over
    // it, such as the live mobile step pill, is not the backdrop).
    const pts = [];
    for (const r of rects) for (let y = Math.ceil(r.top); y < r.bottom && y < innerHeight; y += 2) for (let x = Math.ceil(Math.max(0, r.left)); x < r.right && x < innerWidth; x += 2) {
      const hit = document.elementFromPoint(x, y); if (hit && (hit === e || e.contains(hit) || hit.contains(e))) pts.push(x, y);
    }
    if (!pts.length) continue;
    const m = s.color.match(/[\d.]+/g).map(Number);
    out.push({ t: n.nodeValue.trim().slice(0, 32), c: m.slice(0, 3), a: m[3] === undefined ? 1 : m[3], pts });
  }
  return out;
};

const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

// Screenshots are decoded and measured in the page (fast), never shipped back as raw pixels.
const shot = async pg => (await pg.screenshot()).toString('base64');
const IN_PAGE = `window.__w3dDecode = async b64 => { const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const cv = new OffscreenCanvas(img.width, img.height), cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); return { w: img.width, h: img.height, d: cx.getImageData(0, 0, img.width, img.height).data }; };`;

async function contrast(pg, items) {
  const hide = await pg.addStyleTag({ content: '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}' });
  await pg.waitForTimeout(50);
  const b64 = await shot(pg);
  await hide.evaluate(n => n.remove());
  await pg.evaluate(IN_PAGE);
  const px = await pg.evaluate(async ({ b64, items }) => {
    const { w, h, d } = await window.__w3dDecode(b64);
    const L = (r, g, b) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    return items.map(it => {
      let lo = null, hi = null, ll = 9, hl = -1;
      for (let k = 0; k < it.pts.length; k += 2) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = it.pts[k] + dx, y = it.pts[k + 1] + dy; if (x >= w || y >= h) continue;
        const i = (y * w + x) * 4, l = L(d[i], d[i + 1], d[i + 2]);
        if (l < ll) { ll = l; lo = [d[i], d[i + 1], d[i + 2]]; } if (l > hl) { hl = l; hi = [d[i], d[i + 1], d[i + 2]]; }
      }
      return lo && { lo, hi };
    });
  }, { b64, items });
  return items.map((it, i) => {
    if (!px[i]) return null;
    const { lo, hi } = px[i];
    const fg = it.a < 1 ? it.c.map((v, k) => v * it.a + lo[k] * (1 - it.a)) : it.c; // translucent text, worst case
    return { t: it.t, ratio: Math.min(ratio(fg, lo), ratio(fg, hi)), lo, hi };
  }).filter(Boolean);
}

// Share of viewport pixels that the layer visibly changes (sum of |dRGB| > 12), layer on vs off.
async function changedShare(pg, a64, b64) {
  await pg.evaluate(IN_PAGE);
  return pg.evaluate(async ({ a64, b64 }) => {
    const a = await window.__w3dDecode(a64), b = await window.__w3dDecode(b64); let n = 0, sum = 0;
    for (let i = 0; i < a.d.length; i += 4) { const dd = Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]); sum += dd; if (dd > 12) n++; }
    return { share: n / (a.d.length / 4), mean: sum / (a.d.length / 4) };
  }, { a64, b64 });
}

// ---- drivers ------------------------------------------------------------------------------------------------
async function fixtureDriver(browser, step, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const pg = await ctx.newPage();
  let withBackdrop = true;
  await pg.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) return route.abort(); // fixtures are offline
    if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: page(step.fixture, withBackdrop) });
    const f = path.join(WWW, decodeURIComponent(u.pathname));
    if (f.startsWith(WWW + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ path: f });
    return route.fulfill({ status: 404, body: '' });
  });
  const load = async on => {
    withBackdrop = on;
    await pg.goto(ORIGIN + '/', { waitUntil: 'load' });
    if (step.busy) await pg.evaluate(() => { const d = document.createElement('dialog'); d.id = 'team-foreground'; d.innerHTML = '<span class="team-foreground-spinner" aria-hidden="true"></span><h2 id="team-foreground-title">Preparing your data…</h2><p id="team-foreground-detail" role="status">Please wait. You can continue as soon as this finishes.</p>'; document.body.appendChild(d); d.showModal(); document.getElementById('team-workspace')?.setAttribute('aria-busy', 'true'); });
    await pg.evaluate(() => document.fonts && document.fonts.ready); await pg.waitForTimeout(100);
  };
  await load(true);
  return { ctx, pg, load };
}

async function liveDriver(browser, step, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const pg = await ctx.newPage();
  await pg.goto(process.env.W3D_APP_URL, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => window.Shiny?.shinyapp?.isConnected() && window.TeamWorkspace, null, { timeout: 90000 });
  await pg.waitForTimeout(2500);
  // Client-side only: mark the shell signed in and drop the sign-in form, as the signed-in library renders.
  await pg.evaluate(() => { Shiny.shinyapp.dispatchMessage(JSON.stringify({ custom: { 'team-auth-state': { authenticated: true } } })); document.querySelectorAll('.team-library-login').forEach(n => n.remove()); document.documentElement.classList.remove('ts-gate'); });
  await pg.waitForTimeout(600);
  if (step.screen !== 'data-choice') { await pg.evaluate(() => document.querySelector('[data-tw-choice=matrix]').click()); await pg.waitForTimeout(600); }
  if (step.screen === 'data-metadata') { await pg.evaluate(() => { document.getElementById('guide_experiment_summary').textContent = 'Abundance matrix loaded'; }); await pg.waitForTimeout(200); await pg.evaluate(() => TeamWorkspace.next()); await pg.waitForTimeout(600); }
  if (step.screen === 'review-single') { await pg.evaluate(() => { document.body.dataset.guideStep = '3'; const a = document.querySelector('a[data-value=Preparation]'); if (a && window.bootstrap) bootstrap.Tab.getOrCreateInstance(a).show(); }); await pg.waitForTimeout(1200); }
  if (step.busy) { await pg.evaluate(() => TeamBusy.begin('Preparing your data…')); await pg.waitForTimeout(400); }
  const load = async on => { await pg.evaluate(on => { document.querySelectorAll('style').forEach(s => { if (s.textContent.includes('Pre-Canvas illustrated backdrop')) s.disabled = !on; }); }, on && !WITHOUT); await pg.waitForTimeout(250); };
  return { ctx, pg, load };
}

async function runStep(browser, step, w, h, live) {
  const tag = `${live ? 'live ' : ''}${step.name}@${w}`;
  const { ctx, pg, load } = await (live ? liveDriver : fixtureDriver)(browser, step, w, h);
  try {
    assert.equal(await pg.evaluate(() => document.body.dataset.twScreen), step.screen, `${tag}: on screen ${step.screen}`);
    await load(false);
    const off = await pg.evaluate(probe); const offPx = await shot(pg);
    assert.ok(off.pseudo.content === 'none' || off.pseudo.image === 'none', `${tag}: no layer without step_backdrop.css`);
    await load(true);
    const on = await pg.evaluate(probe); const onPx = await shot(pg);
    // 1. present and visible
    assert.match(on.pseudo.image, /team\/img\/step-backdrop(-portrait)?\.svg/, `${tag}: backdrop layer present`);
    assert.equal(on.pseudo.position, 'fixed', `${tag}: fixed layer`);
    assert.equal(on.pseudo.pe, 'none', `${tag}: pointer-events none`);
    assert.equal(on.pseudo.z, on.pseudo.layer, `${tag}: z-index comes from --z-backdrop`);
    assert.ok(Number(on.pseudo.z) < 0, `${tag}: behind content (z=${on.pseudo.z})`);
    assert.equal(on.pseudo.anim, 'none', `${tag}: static under reduced motion`);
    const vis = await changedShare(pg, onPx, offPx);
    if (step.screen === 'data-choice') assert.match(on.layoutArt, /data-matrix/, `${tag}: start screen keeps its data-matrix illustration above the layer`);
    else assert.ok(vis.share >= 0.03, `${tag}: backdrop visibly changes the page (${(vis.share * 100).toFixed(1)}% of pixels)`);
    // 2. controls
    assert.ok(on.count > 0, `${tag}: controls found`);
    if (live) { // the live page has the companion and its tips, which may cover a control with or without the layer
      assert.deepEqual(on.misses, off.misses, `${tag}: the layer changes no hit-test result`);
      assert.ok(!on.misses.some(m => /-> (body|html)\b/.test(m)), `${tag}: no control centre lands on the page background`);
    } else assert.deepEqual(on.misses, [], `${tag}: every control centre hits its control`);
    // 3. no overflow, no shift
    assert.equal(on.hscroll, false, `${tag}: no horizontal scroll`);
    assert.deepEqual(on.rects, off.rects, `${tag}: no layout shift (control rects identical with the layer off)`);
    assert.equal(on.height, off.height, `${tag}: page height unchanged`);
    // 4. contrast of the text over the backdrop
    fs.mkdirSync(OUT, { recursive: true });
    await pg.screenshot({ path: path.join(OUT, `${live ? 'live_' : ''}${step.name}_${w}.png`) });
    // The companion and its tips float over the page (frozen, outside this change); hide them while measuring
    // the text against the backdrop. Text still covered by other overlays is skipped by collectText.
    // The programmatic focus ring on the screen title is transient and drawn over its neighbour; blur it first.
    const quiet = await pg.addStyleTag({ content: '#lipidomic-companion,.cg-tip,.lipid-help-panel{visibility:hidden!important}' });
    await pg.evaluate(() => { if (!document.querySelector('dialog[open]')) document.activeElement?.blur?.(); });
    const ratios = await contrast(pg, await pg.evaluate(collectText));
    await quiet.evaluate(n => n.remove());
    assert.ok(ratios.length > 0, `${tag}: text over the backdrop found`);
    const worst = ratios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    assert.ok(worst.ratio >= 4.5, `${tag}: text contrast ${worst.ratio.toFixed(2)} < 4.5 ("${worst.t}" over rgb(${worst.lo}) .. rgb(${worst.hi}))`);
    return { tag, controls: on.count, coveredByOverlay: on.misses.length, textRuns: ratios.length, minContrast: +worst.ratio.toFixed(2), worstText: worst.t, changedPx: (vis.share * 100).toFixed(1) + '%', hscroll: on.hscroll };
  } finally { await ctx.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const live of process.env.W3D_APP_URL ? [false, true] : [false])
      for (const step of STEPS) for (const [w, h] of VIEWPORTS) report.push(await runStep(browser, step, w, h, live));
    // Canvas and signed-out screens get no layer; the stylesheet and art never target the companion or animate.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const pg = await ctx.newPage();
    await pg.setContent(`<html><head><style>${readCss('qw_layers.css')}${readCss('step_backdrop.css')}</style></head><body class="team-workspace-app" data-team-authenticated="true" data-tw-screen="canvas"></body></html>`);
    assert.equal(await pg.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage), 'none', 'canvas screen has no backdrop');
    await pg.evaluate(() => { document.body.dataset.twScreen = 'data-matrix'; document.body.dataset.guideAnalysis = 'true'; });
    assert.equal(await pg.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage), 'none', 'analysis tool pages have no backdrop');
    await pg.evaluate(() => { document.body.dataset.guideAnalysis = 'false'; document.body.dataset.teamAuthenticated = 'false'; });
    assert.equal(await pg.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage), 'none', 'signed-out screens keep the sign-in art only');
    await ctx.close();
    const rules = readCss('step_backdrop.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/companion|mascot|lipidomic-help|ctx-help|context-help/i.test(rules), 'backdrop css does not target the companion');
    for (const f of ['step-backdrop.svg', 'step-backdrop-portrait.svg']) assert.ok(!/<animate|@keyframes|animation|<script|href="http/i.test(fs.readFileSync(path.join(WWW, 'team/img', f), 'utf8')), `${f} is static and self-contained`);
    console.table(report);
    console.log(`PASS step backdrop: present, controls reachable, contrast >= 4.5, no overflow or shift on start, Data, metadata, Review and loading at 1440 and 390 (${report.length} step/viewport runs). Screenshots: ${OUT}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
