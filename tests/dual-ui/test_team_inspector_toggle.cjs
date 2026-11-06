// Run with: node tests/dual-ui/test_team_inspector_toggle.cjs
// UX3/insp: the Team Canvas inspector column can be hidden and shown (a button in the left rail, shortcut I;
// www/team/js/inspector_toggle.js + www/team/css/inspector_toggle.css). The companion is frozen at
// production d814775: at 1280, 1440, 1920 and 390 px the resting mascot #lipidomic-companion (rect,
// z-index, computed size), its .tc-companion-home, the inspector column's rect, the rectangles the mascot
// avoids (.tc-navigation included) and the open chat's docking rect are the same with the column shown,
// hidden, and in production; so is the mascot's place when the user has put it by hand next to the
// navigation box. Production is the same fixture page built from eed4451's own files (www/team,
// R/frontends/team wiring, the fixture itself; `git archive`), so this branch's other changes (pointer mode,
// canvas_viewport.js) are measured too. Hidden, the canvas takes the column's width, and the resting mascot
// covers no control.
// Also: aria, keyboard, shortcut (ignored while typing, on buttons, in Plotly, selectize, comboboxes, list
// boxes and menus, and with a modifier), Edit on a card shows a hidden column and focuses its tabs,
// per-account persistence read from the real signed-in markup (project_library.R),
// default hidden from 901 to 1279 px (at <= 900 the column stacks and stays shown), storage failures, the drawer case and the guided pages untouched.
// Fixtures: tests/dual-ui/fixture_team_overlay_pages.cjs (real Team CSS/JS in wiring order).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {chromium} = require('../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');
const MASCOT_EXCEPTIONS = require('./mascot_exceptions.cjs');

// 901 and 1024: the column starts hidden there (901-1279 px), the headline case.
const VIEWPORTS = [{width: 901, height: 800}, {width: 1024, height: 768}, {width: 1280, height: 800}, {width: 1440, height: 900}, {width: 1920, height: 1080}, {width: 390, height: 844}];
const NEW = /inspector_toggle\.(js|css)$/;
const PRODUCTION = 'eed4451';
const ROOT = path.resolve(__dirname, '../..');
const KEY = 'team-canvas-inspector-hidden:';
// The key holds a 64-bit hash of the lower-cased email (djb2 and FNV-1a, 32 bits each: 16 hex), never the
// address (inspector_toggle.js). The 8-hex djb2 key of earlier builds is read once and moved.
const hex8 = h => ('0000000' + (h >>> 0).toString(16)).slice(-8);
const djb2 = e => { let h = 5381; for (const c of e) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h; };
const fnv1a = e => { let h = 0x811c9dc5; for (const c of e) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const acct = e => hex8(djb2(e)) + hex8(fnv1a(e));
const legacyAcct = e => hex8(djb2(e));
const FROZEN = ['www/team/css/context_help.css', 'www/team/js/context_help.js', 'www/team/css/companion_assistant.css',
  'www/team/js/companion_assistant.js', 'www/team/css/companion_guidance.css', 'www/team/js/companion_guidance.js',
  'www/team/js/companion_guidance_data.js', 'www/team/js/companion_workspace.js', 'www/team/css/mascot_refine.css',
  'www/team/js/companion_art.js'];

let pass = 0; const fails = [], notes = [];
const check = (cond, msg) => { if (cond) pass++; else fails.push(msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Production: eed4451's www/team, R/frontends/team (the asset wiring) and tests/dual-ui (this fixture as it
// was), extracted to a temporary directory. The fixture resolves everything against cwd, so the production
// page is built with cwd there; pages are built one at a time.
let prodRoot = null, PF = null;
function extractProduction() {
  prodRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-inspector-prod-'));
  const tar = execFileSync('git', ['archive', '--format=tar', PRODUCTION, '--', 'www/team', 'R/frontends/team', 'tests/dual-ui'], {cwd: ROOT, maxBuffer: 512 * 1024 * 1024});
  execFileSync('tar', ['-x', '-C', prodRoot], {input: tar});
  PF = require(path.join(prodRoot, 'tests/dual-ui/fixture_team_overlay_pages.cjs'));
}
// manual: a position the user dragged the mascot to (context_help.js reads it from sessionStorage when it loads).
// preset: localStorage entries written just before inspector_toggle.js loads (a later visit's storage).
// applike: the fixture's <main> padding and workspace header push the layout 60 px below the viewport,
// so the mascot is clamped off its home; one rule ends the layout at the viewport's bottom, as in the app.
const APP_LIKE = '#team-canvas-root.ts-shell .tc-layout{height:calc(100dvh - 108px)!important;min-height:0!important}';
async function open(browser, viewport, production, manual, preset, applike, init) {
  const page = await browser.newPage({viewport});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (manual || preset || init) { const orig = page.addScriptTag.bind(page); page.addScriptTag = async o => {
    if (init && o && o.path && /inspector_toggle\.js$/.test(o.path)) await page.evaluate(init);
    if (manual && o && o.path && /context_help\.js$/.test(o.path)) await page.evaluate(m => sessionStorage.setItem('lipidomic-companion-position', JSON.stringify(m)), manual);
    if (preset && o && o.path && /inspector_toggle\.js$/.test(o.path)) await page.evaluate(p => {
      const box = document.createElement('div'); box.id = 'team_library_account'; box.innerHTML = '<p data-team-account="visit@lab.org">Signed in as visit@lab.org</p>'; document.querySelector('main').prepend(box);
      for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v); }, preset);
    return orig(o); }; }
  const fx = production ? PF : F;
  if (production) process.chdir(prodRoot);
  try {
    await fx.install(page);
    await fx.setupWorkspace(page, {companion: 'default'});
    if (applike) { await page.addStyleTag({content: APP_LIKE}); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await fx.settle(page); }
  } finally { process.chdir(ROOT); }
  return {page, errors};
}
const r1 = v => Math.round(v * 10) / 10;
// Everything the frozen mascot reads or shows (context_help.js:199-205, companion_assistant.js:157-161).
const geometry = page => page.evaluate(() => {
  const rect = s => { const n = document.querySelector(s); if (!n || !n.getClientRects().length) return null; const b = n.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(v => Math.round(v * 10) / 10); };
  const dock = document.getElementById('lipidomic-companion'), cs = dock && getComputedStyle(dock);
  return {
    mascot: {rect: rect('#lipidomic-companion'), z: cs && cs.zIndex, size: cs && [cs.width, cs.height], visibility: cs && cs.visibility, mini: !!dock && dock.classList.contains('is-mini')},
    home: rect('#team-canvas-root .tc-companion-home'), column: rect('#team-canvas-root .ts-inspector-column'),
    nav: rect('#team-canvas-root .tc-navigation'),
    obstacles: ['.tc-selection-inspector', '.ts-inspector-empty', '.tc-navigation', '.tc-catalog', '.ts-rail', '.tc-settings-dock'].map(s => rect('#team-canvas-root ' + s)),
    toolbar: rect('#team-canvas-root .tc-toolbar')
  };
});
const mainRect = page => page.evaluate(() => { const b = document.querySelector('#team-canvas-root .tc-layout>.tc-main').getBoundingClientRect(); return {left: b.left, right: b.right, width: b.width}; });
async function chat(page) {
  const used = await F.openCompanionChat(page);
  const dockRect = await page.evaluate(() => { const p = document.getElementById('lipidomic-assistant-panel'); if (!p || p.hidden) return null; const b = p.getBoundingClientRect(); return {rect: [b.left, b.top, b.width].map(v => Math.round(v)), maxHeight: p.style.maxHeight, z: getComputedStyle(p).zIndex}; });
  return {used, dockRect};
}
const state = page => page.evaluate(() => {
  const t = document.querySelector('#team-canvas-root .ts-inspector-toggle'), layout = document.querySelector('#team-canvas-root .tc-layout');
  const col = document.querySelector('#team-canvas-root .ts-inspector-column');
  return {exists: !!t, shown: !!t && t.getClientRects().length > 0, hidden: layout.classList.contains('ts-inspector-collapsed'), expanded: t && t.getAttribute('aria-expanded'),
    label: t && t.getAttribute('aria-label'), controls: t && t.getAttribute('aria-controls'), controlsColumn: !!t && document.getElementById(t.getAttribute('aria-controls')) === col,
    inert: !!col.inert, focusOnToggle: document.activeElement === t};
});
// Controls under the resting mascot: the first element under it at each sample point (the dock excluded).
const coveredByMascot = page => page.evaluate(() => {
  const dock = document.getElementById('lipidomic-companion');
  if (!dock || dock.hidden || getComputedStyle(dock).visibility === 'hidden') return [];
  const r = dock.getBoundingClientRect(), hits = new Set();
  for (let x = r.left + 2; x < r.right - 1; x += 6) for (let y = r.top + 2; y < r.bottom - 1; y += 6) {
    const under = document.elementsFromPoint(x, y).find(n => !dock.contains(n) && n !== document.documentElement && n !== document.body);
    const c = under && under.closest('button,input,select,textarea,a[href],[role="button"],summary,[contenteditable="true"],[role="tab"],[role="menuitem"]');
    if (c) hits.add((c.className || c.tagName) + '');
  }
  const t = document.querySelector('#team-canvas-root .ts-inspector-toggle');
  if (t && t.getClientRects().length) { const q = t.getBoundingClientRect(); if (q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) hits.add('ts-inspector-toggle (rect overlap)'); }
  return [...hits];
});
async function clickToggle(page) { await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page); }
const blur = page => page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });

(async () => {
  // Frozen mascot files are byte-identical to production d814775 (and eed4451), except Wave 5's approved exceptions in
  // three files (mascot_exceptions.cjs): with those taken back out the remainder must still be byte-identical.
  for (const ref of ['d814775', PRODUCTION]) {
    const differ = FROZEN.filter(f => !MASCOT_EXCEPTIONS.frozenMatches(f, ref));
    check(differ.length === 0, `frozen mascot files differ from ${ref} beyond the approved exceptions: ${differ.join(', ')}`);
    const leaks = MASCOT_EXCEPTIONS.negativeControl(ref);
    check(leaks.length === 0, `negative control versus ${ref}: a one-character change outside the approved exceptions must fail: ${leaks.join('; ')}`);
  }
  // Wired for the Team workspace only (the guided pages and Classic never load it).
  const wired = F.wired().filter(a => NEW.test(a.rel));
  check(wired.length === 2 && wired.every(a => a.only === 'workspace'), `inspector_toggle assets wired for the workspace only: ${JSON.stringify(wired)}`);
  // Every selector is scoped under #team-canvas-root.ts-shell.
  const css = fs.readFileSync(path.resolve('www/team/css/inspector_toggle.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = css.replace(/@media[^{]*\{/g, '').split('}').map(b => b.split('{')[0].trim()).filter(Boolean).flatMap(s => s.split(','));
  check(selectors.length && selectors.every(s => s.trim().startsWith('#team-canvas-root.ts-shell ')), 'inspector_toggle.css: a selector is not scoped under #team-canvas-root.ts-shell');

  extractProduction();
  check(!fs.existsSync(path.join(prodRoot, 'www/team/js/pointer_mode.js')) && !fs.existsSync(path.join(prodRoot, 'www/team/js/inspector_toggle.js')), `production tree ${PRODUCTION} has neither pointer_mode.js nor inspector_toggle.js`);
  const browser = await chromium.launch({headless: true});
  try {
    for (const vp of VIEWPORTS) {
      const tag = `${vp.width}x${vp.height}`, wide = vp.width > 900;
      // Production (no toggle files) and the shown/hidden states, each on a fresh page; the chat is opened last.
      const prod = await open(browser, vp, true);
      check(!(await state(prod.page)).exists && !(await prod.page.locator('.tc-pointer-mode').count()), `${tag}: production page has no toggle and no pointer mode`);
      const gProd = await geometry(prod.page), cProd = await chat(prod.page);
      await prod.page.close();

      const a = await open(browser, vp, false);
      let s = await state(a.page);
      check(s.exists && s.shown === wide, `${tag}: toggle ${wide ? 'shown' : 'not offered (column stacks under the canvas)'} (${JSON.stringify(s)})`);
      if (wide && s.hidden) { await clickToggle(a.page); s = await state(a.page); } // 1280 starts shown; kept generic
      check(!s.hidden && s.expanded === 'true' && s.label === 'Hide inspector' && s.controlsColumn && !s.inert, `${tag}: shown state aria ${JSON.stringify(s)}`);
      const gShown = await geometry(a.page), mShown = await mainRect(a.page), cShown = await chat(a.page);
      await a.page.close();

      const b = await open(browser, vp, false);
      // Hidden arm: click only when the column is shown (it starts hidden from 901 to 1279 px).
      if (wide && !(await state(b.page)).hidden) await clickToggle(b.page);
      else await b.page.evaluate(() => { document.querySelector('#team-canvas-root .tc-layout').classList.add('ts-inspector-collapsed'); window.dispatchEvent(new Event('resize')); });
      await F.settle(b.page);
      s = await state(b.page);
      if (wide) check(s.hidden && s.expanded === 'false' && s.label === 'Show inspector' && s.controlsColumn && s.inert, `${tag}: hidden state aria ${JSON.stringify(s)}`);
      else check(!s.inert, `${tag}: column stays usable where it stacks under the canvas`);
      const gHidden = await geometry(b.page), mHidden = await mainRect(b.page);
      const covered = await coveredByMascot(b.page);
      check(!covered.length, `${tag}: resting mascot covers ${covered.join(', ')} with the inspector hidden`);
      if (wide) {
        // The canvas takes the column's track up to the reserved companion strip (the narrowed home), and
        // is what is under the column's left part.
        const gain = r1(mHidden.width - mShown.width), homeLeft = gHidden.home[0];
        check(gain > 40 && Math.abs(mHidden.right - homeLeft) <= 1, `${tag}: canvas ${mShown.width}→${mHidden.width} px does not reach the companion strip at ${homeLeft}`);
        notes.push(`${tag}: canvas ${r1(mShown.width)} → ${r1(mHidden.width)} px (+${gain} px; companion strip ${gHidden.home[2]} px kept)`);
        const top = await b.page.evaluate(() => { const c = document.querySelector('#team-canvas-root .ts-inspector-column').getBoundingClientRect(); const n = document.elementFromPoint(c.left + 20, c.top + 80); return !!n && !!n.closest('.tc-main') && !n.closest('.ts-inspector-column'); });
        check(top, `${tag}: the canvas is not what is under the hidden column's left part`);
        // Pan a card's footer to the canvas's bottom-right corner: the mascot's home stays outside the
        // canvas viewport, so no card (or its buttons) can be under it.
        const pan = await b.page.evaluate(() => {
          const scroll = document.querySelector('#team-canvas-root .tc-scroll'), node = document.querySelector('#team-canvas-root .tc-node[data-plot-id="p2"]') || document.querySelector('#team-canvas-root .tc-node');
          const foot = node.querySelector('.tc-card-actions, .tc-card-foot') || node;
          const view = () => { const r = scroll.getBoundingClientRect(); return {left: r.left, top: r.top, right: r.left + scroll.clientWidth, bottom: r.top + scroll.clientHeight}; };
          let v = view(), f = foot.getBoundingClientRect();
          scroll.scrollLeft += f.right - v.right + 4; scroll.scrollTop += f.bottom - v.bottom + 4;
          v = view(); f = foot.getBoundingClientRect();
          const h = document.querySelector('#team-canvas-root .tc-companion-home').getBoundingClientRect(), sr = scroll.getBoundingClientRect();
          const meets = (a, q) => a.left < q.right && a.right > q.left && a.top < q.bottom && a.bottom > q.top;
          // Sampled inside the viewport (the fixture's layout ends below it).
          const under = document.elementsFromPoint(h.left + h.width / 2, Math.min(h.bottom, innerHeight) - 40).some(n => n.closest && n.closest('.tc-node'));
          return {footAtCorner: Math.abs(f.right - v.right) <= 8 && Math.abs(f.bottom - v.bottom) <= 8, homeMeetsCanvas: meets(h, sr), cardUnderHome: under,
            home: [h.left, h.top, h.right, h.bottom].map(Math.round), canvas: [sr.left, sr.top, sr.right, sr.bottom].map(Math.round), foot: [f.left, f.top, f.right, f.bottom].map(Math.round)};
        });
        check(pan.footAtCorner && !pan.homeMeetsCanvas && !pan.cardUnderHome, `${tag}: card footer panned to the bottom-right corner ${JSON.stringify(pan)}`);
        // Collapsed: the toolbar is centred on the wider canvas, so it moves; that is the one difference from
        // production this new state is allowed (accepted by design: production has no collapsed state). It
        // is still a rectangle the mascot avoids (context_help.js lists .tc-toolbar), and the mascot's
        // default place is production's (checked below).
        const tb = await b.page.evaluate(() => { const t = document.querySelector('#team-canvas-root .tc-toolbar'), d = document.getElementById('lipidomic-companion'); if (!t || !t.getClientRects().length) return null; const q = t.getBoundingClientRect(), r = d.getBoundingClientRect(); return {listed: t.matches('.tc-catalog,.tc-selection-inspector,.tc-navigation,.tc-settings-dock,.ts-rail,.tc-toolbar,.ts-inspector-empty') && getComputedStyle(t).visibility !== 'hidden', meetsMascot: q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top}; });
        check(tb && tb.listed && !tb.meetsMascot, `${tag}: collapsed toolbar is not an obstacle the mascot clears ${JSON.stringify(tb)}`);
        notes.push(`${tag}: collapsed toolbar ${JSON.stringify(gShown.toolbar)} -> ${JSON.stringify(gHidden.toolbar)} (allowed difference)`);
      } else notes.push(`${tag}: no toggle (column stacked under the canvas); geometry unchanged`);
      const cHidden = await chat(b.page);
      check(!b.errors.length && !a.errors.length && !prod.errors.length, `${tag}: page errors ${[...prod.errors, ...a.errors, ...b.errors].join(' | ')}`);
      await b.page.close();

      for (const [name, g] of [['shown', gShown], ['hidden', gHidden]]) {
        check(same(g.mascot, gProd.mascot), `${tag}: mascot ${name} ${JSON.stringify(g.mascot)} != production ${JSON.stringify(gProd.mascot)}`);
        // Hidden (wide), the home narrows to the companion strip around the same centre and keeps its top
        // and bottom: context_help.js centres the mascot in it, companion_assistant.js docks above its top.
        const homeSame = name === 'hidden' && wide ? !!g.home && Math.abs((g.home[0] + g.home[2] / 2) - (gProd.home[0] + gProd.home[2] / 2)) <= 0.5 && g.home[1] === gProd.home[1] && g.home[3] === gProd.home[3] : same(g.home, gProd.home);
        check(homeSame && same(g.column, gProd.column), `${tag}: home/column ${name} ${JSON.stringify([g.home, g.column])} != production ${JSON.stringify([gProd.home, gProd.column])}`);
        check(same(g.obstacles, gProd.obstacles), `${tag}: mascot obstacles ${name} ${JSON.stringify(g.obstacles)} != production ${JSON.stringify(gProd.obstacles)}`);
        check(g.nav && same(g.nav, gProd.nav), `${tag}: .tc-navigation ${name} ${JSON.stringify(g.nav)} != production ${JSON.stringify(gProd.nav)}`);
      }
      check(same(gShown.toolbar, gProd.toolbar), `${tag}: .tc-toolbar shown ${JSON.stringify(gShown.toolbar)} != production ${JSON.stringify(gProd.toolbar)}`);
      // The mascot put by hand next to the navigation box (just above it; right of it, bottom-aligned):
      // the same place as in production, with the column shown and hidden.
      if (gProd.nav && gProd.mascot.rect) {
        const [nl, nt, nw, nh] = gProd.nav, [, , mw, mh] = gProd.mascot.rect;
        for (const [where, manual] of [['above the navigation', {x: nl, y: nt - mh - 12}], ['right of the navigation', {x: nl + nw + 12, y: nt + nh - mh}]]) {
          const pm = await open(browser, vp, true, manual), gm = await geometry(pm.page); await pm.page.close();
          const sm = await open(browser, vp, false, manual);
          if (wide && (await state(sm.page)).hidden) await clickToggle(sm.page);
          const gs = await geometry(sm.page);
          if (wide && !(await state(sm.page)).hidden) await clickToggle(sm.page);
          const gh = await geometry(sm.page); await sm.page.close();
          check(gm.mascot.rect, `${tag}: production mascot ${where} not shown`);
          check(same(gs.mascot, gm.mascot) && same(gs.nav, gm.nav), `${tag}: mascot put ${where} ${JSON.stringify([gs.mascot, gs.nav])} != production ${JSON.stringify([gm.mascot, gm.nav])}`);
          check(same(gh.mascot, gm.mascot) && same(gh.nav, gm.nav), `${tag}: mascot put ${where}, column hidden ${JSON.stringify([gh.mascot, gh.nav])} != production ${JSON.stringify([gm.mascot, gm.nav])}`);
          notes.push(`${tag}: mascot put ${where} ${JSON.stringify(manual)} -> ${JSON.stringify(gm.mascot.rect)} in production and here`);
        }
      }
      check(gProd.mascot.rect && gProd.mascot.visibility === 'visible', `${tag}: production mascot is shown (${JSON.stringify(gProd.mascot)})`);
      for (const [name, c] of [['shown', cShown], ['hidden', cHidden]]) check(same(c, cProd), `${tag}: chat dock ${name} ${JSON.stringify(c)} != production ${JSON.stringify(cProd)}`);
    }

    // The toggle is in the rail (a rectangle the mascot avoids, its size as in production): a mascot put by
    // hand on the toggle, shown or hidden, is moved off it, as the frozen avoidance does for the rail.
    for (const collapse of [false, true]) {
      const probe = await open(browser, {width: 1440, height: 900}, false);
      const t = await probe.page.evaluate(() => { const b = document.querySelector('#team-canvas-root .ts-inspector-toggle'); const r = b.getBoundingClientRect(); return {inRail: !!b.closest('.tc-layout>.ts-rail'), x: r.left, y: r.top}; });
      await probe.page.close();
      check(t.inRail, 'the inspector toggle is in the rail');
      const {page} = await open(browser, {width: 1440, height: 900}, false, {x: t.x, y: t.y});
      if (collapse) await clickToggle(page);
      const hit = await page.evaluate(() => { const q = document.querySelector('#team-canvas-root .ts-inspector-toggle').getBoundingClientRect(), d = document.getElementById('lipidomic-companion'), r = d.getBoundingClientRect(); return getComputedStyle(d).visibility !== 'hidden' && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; });
      check(!hit, `mascot put by hand on the toggle covers it (${collapse ? 'hidden' : 'shown'})`);
      await page.close();
    }
    // App-like geometry (the layout ends at the viewport's bottom): the mascot rests in its home there, as in
    // the app. Shown and hidden, its rect equals production's and lies inside the viewport; hidden, a card
    // footer panned under the mascot's own rect never puts a card under it.
    for (const vp of [{width: 901, height: 800}, {width: 1024, height: 768}, {width: 1280, height: 800}, {width: 1440, height: 900}, {width: 1920, height: 1080}]) {
      const tag = `app-like ${vp.width}x${vp.height}`;
      const prod = await open(browser, vp, true, null, null, true), gp = await geometry(prod.page); await prod.page.close();
      const cand = await open(browser, vp, false, null, null, true);
      if ((await state(cand.page)).hidden) await clickToggle(cand.page);
      const gs = await geometry(cand.page);
      await clickToggle(cand.page);
      const gh = await geometry(cand.page);
      const inside = r => !!r && r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= vp.width && r[1] + r[3] <= vp.height;
      const inHome = (r, h) => !!r && !!h && r[0] >= h[0] - 0.5 && r[0] + r[2] <= h[0] + h[2] + 0.5 && r[1] >= h[1] - 0.5 && r[1] + r[3] <= h[1] + h[3] + 0.5;
      check(inside(gp.mascot.rect) && inHome(gp.mascot.rect, gp.home), `${tag}: production mascot rests in its home inside the viewport ${JSON.stringify([gp.mascot.rect, gp.home])}`);
      check(same(gs.mascot, gp.mascot) && same(gh.mascot, gp.mascot), `${tag}: mascot shown/hidden ${JSON.stringify([gs.mascot.rect, gh.mascot.rect])} != production ${JSON.stringify(gp.mascot.rect)}`);
      check(same(gs.nav, gp.nav) && same(gs.obstacles, gp.obstacles) && same(gs.toolbar, gp.toolbar) && same(gs.home, gp.home), `${tag}: shown geometry != production`);
      check(inHome(gh.mascot.rect, gh.home), `${tag}: hidden, the mascot rests inside the companion strip ${JSON.stringify([gh.mascot.rect, gh.home])}`);
      const probe = await cand.page.evaluate(() => {
        const scroll = document.querySelector('#team-canvas-root .tc-scroll'), d = document.getElementById('lipidomic-companion').getBoundingClientRect();
        const node = document.querySelector('#team-canvas-root .tc-node[data-plot-id="p2"]'), foot = node.querySelector('.tc-card-actions, .tc-card-foot') || node;
        // Pan the footer's right end toward the mascot's centre (as far as the canvas lets it go).
        let f = foot.getBoundingClientRect(); scroll.scrollLeft += f.right - (d.left + d.width / 2); scroll.scrollTop += f.bottom - (d.top + d.height / 2);
        f = foot.getBoundingClientRect(); const sr = scroll.getBoundingClientRect();
        const hits = [];
        for (let x = d.left + 4; x < d.right - 2; x += 8) for (let y = d.top + 4; y < Math.min(d.bottom, innerHeight) - 2; y += 8) if (document.elementsFromPoint(x, y).some(n => n.closest && n.closest('.tc-node'))) hits.push([Math.round(x), Math.round(y)]);
        return {hits: hits.length, footRight: Math.round(f.right), canvasRight: Math.round(sr.right), mascotLeft: Math.round(d.left), meets: d.left < sr.right && d.right > sr.left && d.top < sr.bottom && d.bottom > sr.top};
      });
      check(!probe.hits && !probe.meets, `${tag}: hidden, a card panned toward the mascot is never under it ${JSON.stringify(probe)}`);
      check(!cand.errors.length, `${tag}: page errors ${cand.errors.join(' | ')}`);
      await cand.page.close();
    }
    // The extension into the column holds only while the chat is closed and the mascot's current rect is
    // clear of it (inspector_toggle.js). The page is scrolled to its end, so the layout's bottom is the
    // viewport's (as in the app, where the layout fills the window under the top bar).
    const toEnd = async page => { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await F.settle(page); };
    const ext = page => page.evaluate(() => {
      const q = s => { const n = document.querySelector(s); if (!n || !n.getClientRects().length) return null; const b = n.getBoundingClientRect(); return {left: b.left, top: b.top, right: b.right, bottom: b.bottom}; };
      const layout = document.querySelector('#team-canvas-root .tc-layout'), panel = document.getElementById('lipidomic-assistant-panel');
      return {extended: layout.classList.contains('ts-inspector-extended'), collapsed: layout.classList.contains('ts-inspector-collapsed'), main: q('#team-canvas-root .tc-layout>.tc-main'),
        scroll: q('#team-canvas-root .tc-scroll'), column: q('#team-canvas-root .ts-inspector-column'), home: q('#team-canvas-root .tc-companion-home'), mascot: q('#lipidomic-companion'),
        chat: panel && !panel.hidden ? q('#lipidomic-assistant-panel') : null};
    });
    const meets = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const panToCorner = page => page.evaluate(() => {
      const scroll = document.querySelector('#team-canvas-root .tc-scroll'), node = document.querySelector('#team-canvas-root .tc-node[data-plot-id="p2"]');
      const foot = node.querySelector('.tc-card-actions, .tc-card-foot') || node;
      const v = () => { const r = scroll.getBoundingClientRect(); return {right: r.left + scroll.clientWidth, bottom: r.top + scroll.clientHeight}; };
      let f = foot.getBoundingClientRect(), w = v(); scroll.scrollLeft += f.right - w.right + 4; scroll.scrollTop += f.bottom - w.bottom + 4;
      f = foot.getBoundingClientRect(); w = v();
      const d = document.getElementById('lipidomic-companion').getBoundingClientRect();
      const under = [[d.left + d.width / 2, d.top + d.height / 2], [d.left + 6, d.bottom - 6], [d.left + 6, d.top + 6]].some(([x, y]) => document.elementsFromPoint(x, y).some(n => n.closest && n.closest('.tc-node')));
      return {atCorner: Math.abs(f.right - w.right) <= 8 && Math.abs(f.bottom - w.bottom) <= 8, cardUnderMascot: under};
    });
    for (const vp of [{width: 901, height: 800}, {width: 1024, height: 800}, {width: 1280, height: 800}, {width: 1440, height: 800}]) {
      const tag = `${vp.width}x${vp.height}`;
      const {page, errors} = await open(browser, vp, false);
      await toEnd(page);
      if (!(await state(page)).hidden) await clickToggle(page);
      let e = await ext(page);
      check(e.collapsed && e.extended && Math.abs(e.main.right - e.home.left) <= 1 && !meets(e.mascot, {left: e.column.left, right: e.home.left, top: e.column.top, bottom: e.column.bottom}), `${tag}: chat closed, mascot at home: canvas extended to the strip ${JSON.stringify(e)}`);
      await F.openCompanionChat(page); await F.settle(page);
      e = await ext(page);
      check(e.chat && !e.extended && e.main.right <= e.column.left + 1 && !meets(e.chat, e.scroll) && !meets(e.chat, e.main), `${tag}: chat open while collapsed: chat and canvas do not meet ${JSON.stringify(e)}`);
      await page.keyboard.press('Escape'); await F.settle(page);
      e = await ext(page);
      check(!e.chat && e.extended, `${tag}: chat closed again: canvas extended again ${JSON.stringify(e)}`);
      // The mascot put by hand inside the extension zone (over the home's left part, clear of the inspector).
      const manual = {x: Math.round(e.column.left + 10), y: Math.round(e.home.top + 5)};
      check(!errors.length, `${tag}: page errors ${errors.join(' | ')}`);
      await page.close();
      const m = await open(browser, vp, false, manual);
      await toEnd(m.page);
      if (!(await state(m.page)).hidden) await clickToggle(m.page);
      e = await ext(m.page);
      check(meets(e.mascot, {left: e.column.left, right: e.column.left + 1 + (e.column.right - e.column.left - 1 - 136) / 2, top: e.column.top, bottom: e.column.bottom}), `${tag}: hand-placed mascot is inside the extension zone ${JSON.stringify([manual, e.mascot])}`);
      check(!e.extended && e.main.right <= e.column.left + 1 && !meets(e.mascot, e.scroll), `${tag}: mascot in the extension zone: canvas not extended, mascot clear of it ${JSON.stringify(e)}`);
      const pan = await panToCorner(m.page);
      check(pan.atCorner && !pan.cardUnderMascot, `${tag}: card footer panned to the corner is not under the hand-placed mascot ${JSON.stringify(pan)}`);
      // The mascot moved away (its grip, keyboard): the canvas extends again.
      await m.page.locator('#lipidomic-companion .companion-grip').focus();
      for (let i = 0; i < 5; i++) await m.page.keyboard.press('Shift+ArrowLeft');
      await F.settle(m.page);
      e = await ext(m.page);
      const zoneNow = {left: e.column.left, right: e.column.left + 1 + (e.column.right - e.column.left - 1 - 136) / 2, top: e.column.top, bottom: e.column.bottom};
      check(meets(e.mascot, zoneNow) ? !e.extended : e.extended, `${tag}: mascot moved: extension follows its rect ${JSON.stringify(e)}`);
      check(!m.errors.length, `${tag}: page errors ${m.errors.join(' | ')}`);
      await m.page.close();
    }
    // Anti-flap with delayed feedback: a model mascot is moved into the extension zone whenever the canvas
    // extends and out of it whenever it retracts, each time after a delay. The slow model's transitions
    // before the freeze come 600 ms and 2500 ms apart, longer than the former 2 s window, so a time-window
    // guard oscillates forever here; the count bound must stop after two reversals at production's track and
    // stay there. A script's synthetic pointerup / keyup on the mascot keeps the freeze; a user action (a
    // real pointer released on the mascot) re-enables the extension.
    const runModel = (page, delays, ms) => page.evaluate(([delays, ms]) => new Promise(done => {
      const layout = document.querySelector('#team-canvas-root .tc-layout'), fake = document.getElementById('lipidomic-companion'), col = document.querySelector('#team-canvas-root .ts-inspector-column');
      let step = 0, last = layout.classList.contains('ts-inspector-extended'); const log = [last], at = [];
      const t0 = performance.now();
      const place = ext => { const c = col.getBoundingClientRect(); if (ext) { fake.style.left = (c.left + 4) + 'px'; fake.style.top = (c.top + 40) + 'px'; } else { fake.style.left = '20px'; fake.style.top = '20px'; } };
      const feedback = ext => { const d = delays[Math.min(step, delays.length - 1)]; step++; setTimeout(() => place(ext), d); };
      const mo = new MutationObserver(() => { const ext = layout.classList.contains('ts-inspector-extended'); if (ext === last) return; last = ext; log.push(ext); at.push(Math.round(performance.now() - t0)); feedback(ext); });
      mo.observe(layout, {attributes: true, attributeFilter: ['class']});
      feedback(last);
      setTimeout(() => {
        // Is the model mascot clear of the zone at the end (so an unguarded toggle would extend again)?
        mo.disconnect();  // the model stops here; the user's later action is judged on its own
        const c = col.getBoundingClientRect(), r = fake.getBoundingClientRect();
        done({log, at, extended: layout.classList.contains('ts-inspector-extended'), clear: r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom});
      }, ms);
    }), [delays, ms]);
    const isExtended = page => page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-extended'));
    const fakeDock = page => page.evaluate(() => {
      const real = document.getElementById('lipidomic-companion'); if (real) real.remove();
      const fake = document.createElement('div'); fake.id = 'lipidomic-companion'; fake.style.cssText = 'position:fixed;width:60px;height:60px;left:20px;top:20px;z-index:2000;background:#cde';
      document.body.appendChild(fake);
    });
    for (const [name, delays, ms] of [['slow', [600, 2500, 2500, 2500, 2500], 11000], ['fast', [16, 16, 16, 16, 16], 2500]]) {
      const {page, errors} = await open(browser, {width: 1440, height: 900}, false);
      await toEnd(page);
      await fakeDock(page);
      await clickToggle(page);
      const model = await runModel(page, delays, ms);
      notes.push(`anti-flap ${name} model: ${JSON.stringify(model)}`);
      // log[0] is the state right after the toggle (extended); every later entry is a reversal it caused.
      const reversals = model.log.length - 1;
      check(model.log[0] === true && reversals >= 1 && reversals <= 2 && !model.extended, `${name} delayed feedback converges within 2 reversals at production's track ${JSON.stringify(model)}`);
      check(model.clear, `${name}: the next reversal was asked (model mascot clear of the zone) and refused ${JSON.stringify(model)}`);
      if (name === 'slow') check(model.at[0] >= 550, `slow: the first reversal came after the 600 ms feedback ${JSON.stringify(model.at)}`);
      const still = await page.evaluate(() => new Promise(r => setTimeout(() => r(document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-extended')), 3000)));
      check(!still, `${name} frozen: no further flip without a user action`);
      // Synthetic events on the mascot (not the user) keep the freeze.
      await page.evaluate(() => { const f = document.getElementById('lipidomic-companion'); f.dispatchEvent(new PointerEvent('pointerup', {bubbles: true})); f.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true, key: 'ArrowLeft'})); window.dispatchEvent(new Event('resize')); });
      await F.settle(page); await page.waitForTimeout(150);
      check(!(await isExtended(page)), `${name}: synthetic pointerup / keyup on the mascot and a synthetic resize keep the freeze`);
      // The user releases a pointer on the model mascot (already out of the way): the extension comes back.
      await page.mouse.click(40, 40); await F.settle(page);
      check(await isExtended(page), `${name}: a user action (pointer released on the mascot) re-enables the extension`);
      check(!errors.length, `flap page errors ${errors.join(' | ')}`);
      await page.close();
    }
    // The tools drawer opening and closing is a user action, not layout feedback: two drawer cycles with
    // the column hidden (real mascot, clear of the zone at 1440) end extended and unlocked.
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900}, false);
      await toEnd(page);
      await clickToggle(page);
      const before = await isExtended(page);
      const cycles = [];
      for (let i = 0; i < 3; i++) {
        await page.locator('#team-canvas-root .ts-analysis-trigger').click(); await F.settle(page);
        const open = await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.contains('ttd-open')) && !(await isExtended(page));
        await page.evaluate(() => window.TeamToolsDrawer.close()); await F.settle(page);
        cycles.push([open, await isExtended(page)]);
      }
      check(before && cycles.every(([o, e]) => o && e), `hide, open tools, close tools (x3): the canvas ends extended each time, not locked ${JSON.stringify({before, cycles})}`);
      check(!errors.length, `drawer-cycle page errors ${errors.join(' | ')}`);
      await page.close();
    }
    // Dock replacements: the toggle keeps one dock observer, bound to the current dock; a replaced dock
    // (kept by the companion) is unobserved, so its mutations trigger nothing.
    {
      const instrument = () => {
        const Native = window.MutationObserver; window.__mo = [];
        window.MutationObserver = class extends Native {
          constructor(cb) { const rec = {targets: new Set(), ever: new Set(), calls: 0}; super((...a) => { rec.calls++; return cb(...a); }); this.__rec = rec; window.__mo.push(rec); }
          observe(t, o) { this.__rec.targets.add(t); this.__rec.ever.add(t); return super.observe(t, o); }
          disconnect() { this.__rec.targets.clear(); return super.disconnect(); }
        };
      };
      const {page, errors} = await open(browser, {width: 1440, height: 900}, false, null, null, false, instrument);
      await toEnd(page);
      const res = await page.evaluate(async () => {
        const tick = () => new Promise(r => setTimeout(r, 30));
        const make = n => { const d = document.createElement('div'); d.id = 'lipidomic-companion'; d.dataset.it = n; d.style.cssText = 'position:fixed;width:60px;height:60px;left:20px;top:20px'; return d; };
        const A = make('A'), B = make('B');
        for (let i = 0; i < 6; i++) { const cur = document.getElementById('lipidomic-companion'); if (cur) cur.remove(); document.body.appendChild(i % 2 ? B : A); await tick(); }
        const docks = new Set([A, B]);
        const onDocks = window.__mo.filter(r => [...r.ever].some(t => docks.has(t)));
        const active = onDocks.filter(r => [...r.targets].some(t => docks.has(t)));
        const current = document.getElementById('lipidomic-companion');
        const old = current === A ? B : A;
        onDocks.forEach(r => { r.calls = 0; });
        old.style.left = '300px'; old.className = 'x'; old.hidden = true; await tick();
        const oldCalls = onDocks.reduce((n, r) => n + r.calls, 0);
        current.style.left = '30px'; await tick();
        const curCalls = onDocks.reduce((n, r) => n + r.calls, 0) - oldCalls;
        return {observers: onDocks.length, active: active.length, activeOnCurrent: active.length === 1 && active[0].targets.has(current) && active[0].targets.size === 1, oldCalls, curCalls};
      });
      check(res.active === 1 && res.activeOnCurrent, `dock replaced 6 times: exactly 1 active dock observer, on the current dock ${JSON.stringify(res)}`);
      check(res.oldCalls === 0 && res.curCalls >= 1, `a replaced dock's mutations trigger nothing; the current dock's do ${JSON.stringify(res)}`);
      check(!errors.length, `dock-replace page errors ${errors.join(' | ')}`);
      await page.close();
    }
    // Rail order in the real shell (shell.css, pointer_mode and the toggle loaded): DOM order (Tab order)
    // and visual order are the same: panel buttons, Select, Move, the inspector toggle.
    {
      const {page} = await open(browser, {width: 1440, height: 900}, false);
      const order = await page.evaluate(() => {
        const rail = document.querySelector('#team-canvas-root .tc-layout>.ts-rail');
        const focusables = [...rail.querySelectorAll('button')].filter(b => b.getClientRects().length);
        const name = b => b.classList.contains('tc-pointer-select') ? 'select' : b.classList.contains('tc-pointer-hand') ? 'move' : b.classList.contains('ts-inspector-toggle') ? 'toggle' : 'panel';
        const byTop = [...focusables].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        return {dom: focusables.map(name), visual: byTop.map(name)};
      });
      const expected = order.dom.filter(n => n === 'panel').concat(['select', 'move', 'toggle']);
      check(same(order.dom, expected) && same(order.visual, expected), `rail DOM and visual order ${JSON.stringify(order)}`);
      // Tab from the last panel button: Select, Move, the toggle.
      await page.locator('#team-canvas-root .ts-rail > .ts-rail-item').last().focus();
      const tabs = [];
      for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); tabs.push(await page.evaluate(() => { const a = document.activeElement; return a.classList.contains('tc-pointer-select') ? 'select' : a.classList.contains('tc-pointer-hand') ? 'move' : a.classList.contains('ts-inspector-toggle') ? 'toggle' : a.className; })); }
      check(same(tabs, ['select', 'move', 'toggle']), `Tab order from the last panel button ${JSON.stringify(tabs)}`);
      await page.close();
    }
    // Keyboard, shortcut, focus, drawer, persistence (1440 x 900).
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900}, false);
      const hidden = async () => (await state(page)).hidden;
      // Signed in as start@lab.org (the signed-in markup project_library.R renders), so choices are saved.
      await page.evaluate(() => { const box = document.createElement('div'); box.id = 'team_library_account'; box.className = 'shiny-html-output'; box.innerHTML = '<p data-team-account="start@lab.org">Signed in as start@lab.org</p><button id="team_library_logout" type="button">Sign out and clear this session</button>'; document.querySelector('main').prepend(box); });
      await F.settle(page);
      await page.locator('#team-canvas-root .ts-inspector-toggle').focus();
      await page.keyboard.press('Enter'); await F.settle(page);
      check(await hidden(), 'Enter on the toggle hides the inspector');
      check((await state(page)).focusOnToggle, 'focus stays on the toggle');
      await page.keyboard.press('Space'); await F.settle(page);
      check(!(await hidden()), 'Space on the toggle shows the inspector');
      await blur(page);
      await page.keyboard.press('i'); await F.settle(page);
      check(await hidden(), 'shortcut I hides the inspector');
      await page.keyboard.press('Shift+I'); await F.settle(page);
      check(await hidden(), 'Shift+I is not the shortcut');
      await page.keyboard.press('i'); await F.settle(page);
      check(!(await hidden()), 'shortcut I shows it again');
      for (const mod of ['Control', 'Meta', 'Alt', 'Shift']) { await page.keyboard.press(mod + '+i'); await F.settle(page); check(!(await hidden()), `${mod}+I is not the shortcut`); }
      // Ignored while typing and on buttons, like the other canvas shortcuts (canvas.js:1909).
      await page.evaluate(() => {
        const box = document.createElement('div'); box.id = 'it-fields';
        box.innerHTML = '<input id="it-input"><textarea id="it-textarea"></textarea><select id="it-select"><option>a</option><option>i</option></select><div id="it-ce" contenteditable="true">x</div><div id="it-tb" role="textbox" tabindex="0">x</div><button type="button" id="it-button">b</button>' +
          '<div class="js-plotly-plot" id="it-plotly" tabindex="0"><div class="modebar-container"><div class="modebar"><a role="button" id="it-modebar" tabindex="0">zoom</a></div></div></div>' +
          '<div class="selectize-control"><div class="selectize-input"><div id="it-selectize" tabindex="0">pick</div></div></div><div role="combobox" id="it-combobox" tabindex="0">c</div>' +
          '<div role="listbox" id="it-listbox" tabindex="0"><div role="option" id="it-option" tabindex="0">o</div></div><div role="menu" id="it-menu" tabindex="0"><div role="menuitem" id="it-menuitem" tabindex="0">m</div><div role="menuitemcheckbox" id="it-menuitemcheckbox" tabindex="0">k</div></div>';
        document.querySelector('#team-canvas-root .tc-main').appendChild(box);
      });
      for (const id of ['it-input', 'it-textarea', 'it-select', 'it-ce', 'it-tb', 'it-button', 'it-plotly', 'it-modebar', 'it-selectize', 'it-combobox', 'it-listbox', 'it-option', 'it-menu', 'it-menuitem', 'it-menuitemcheckbox', 'ts-toolbar-button']) {
        if (id === 'ts-toolbar-button') await page.locator('#team-canvas-root .ts-tools .ts-tool').first().focus(); else await page.locator('#' + id).focus();
        await page.keyboard.press('i'); await F.settle(page);
        check(!(await hidden()), `shortcut I ignored in #${id}`);
      }
      await page.evaluate(() => document.getElementById('it-fields').remove());
      // Hiding the column while focus is inside it hands focus to the toggle.
      await page.evaluate(() => { const d = document.createElement('div'); d.id = 'it-col'; d.tabIndex = 0; d.textContent = 'x'; document.querySelector('#team-canvas-root .ts-inspector-empty').appendChild(d); d.focus(); });
      await page.keyboard.press('i'); await F.settle(page);
      const st = await state(page);
      check(st.hidden && st.inert && st.focusOnToggle, `focus inside the column moves to the toggle when it hides ${JSON.stringify(st)}`);
      await page.evaluate(() => document.getElementById('it-col').remove());
      // The real Analysis tools drawer (tools_drawer.js), opened from the toolbar while the column is hidden,
      // docks over column 4: the canvas gives the track back, the toggle steps aside, and the covered
      // inspector is inert; Tab and Shift+Tab go through the drawer and never land on a covered control.
      await page.evaluate(() => { const b = document.createElement('button'); b.type = 'button'; b.id = 'it-covered'; b.textContent = 'covered'; document.querySelector('#team-canvas-root .ts-inspector-empty').appendChild(b); });
      await page.locator('#team-canvas-root .ts-analysis-trigger').click(); await F.settle(page);
      const drawer = await page.evaluate(() => { const m = document.querySelector('#team-canvas-root .tc-layout>.tc-main').getBoundingClientRect(), c = document.querySelector('#team-canvas-root .ts-inspector-column'), d = document.querySelector('#team-canvas-root .tc-layout>.ttd-drawer.ttd-docked'); return {open: !!window.TeamToolsDrawer && window.TeamToolsDrawer.isOpen(), docked: !!d && !d.hidden, drawerInColumn: !!d && c.contains(d), mainRight: m.right, colLeft: c.getBoundingClientRect().left, inert: c.inert, toggle: document.querySelector('#team-canvas-root .ts-inspector-toggle').getClientRects().length}; });
      check(drawer.open && drawer.docked && !drawer.drawerInColumn && drawer.mainRight <= drawer.colLeft + 1 && drawer.inert && !drawer.toggle, `drawer open: docked over column 4, canvas in column 3, no toggle, covered inspector inert ${JSON.stringify(drawer)}`);
      const walk = await page.evaluate(() => { const d = document.querySelector('#team-canvas-root .ttd-drawer'); const f = d.querySelector('button,a[href],input,select,[tabindex]:not([tabindex="-1"])'); if (f) f.focus(); return !!f && d.contains(document.activeElement); });
      check(walk, 'drawer open: its first control takes focus');
      const seen = {inColumn: [], inDrawer: 0};
      for (const key of [...Array(40).fill('Tab'), ...Array(40).fill('Shift+Tab')]) {
        await page.keyboard.press(key);
        const at = await page.evaluate(() => { const a = document.activeElement, c = document.querySelector('#team-canvas-root .ts-inspector-column'), d = document.querySelector('#team-canvas-root .ttd-drawer'); return {col: !!a && c.contains(a) ? (a.id || a.className || a.tagName) : null, drawer: !!a && !!d && d.contains(a)}; });
        if (at.col) seen.inColumn.push(at.col); if (at.drawer) seen.inDrawer++;
      }
      check(!seen.inColumn.length && seen.inDrawer > 2, `drawer open: Tab / Shift+Tab never reach a covered inspector control ${JSON.stringify(seen)}`);
      await page.evaluate(() => window.TeamToolsDrawer.close()); await F.settle(page);
      const after = await page.evaluate(() => ({ttd: document.querySelector('#team-canvas-root .tc-layout').classList.contains('ttd-open'), inert: document.querySelector('#team-canvas-root .ts-inspector-column').inert}));
      check(!after.ttd && after.inert === (await state(page)).hidden, `drawer closed: the column is inert only if hidden ${JSON.stringify(after)}`);
      await page.evaluate(() => document.getElementById('it-covered').remove());
      // Persistence: per account, read from the signed-in markup project_library.R renders in
      // #team_library_account ("Signed in as <email>" + Sign out; the email field is gone), read back when
      // Shiny re-renders it or data-team-authenticated changes.
      check(await page.evaluate(k => localStorage.getItem(k), KEY + acct('start@lab.org')) === '1', 'hidden state saved for this account');
      const signIn = (address, tagged) => page.evaluate(([a, t]) => {
        let box = document.getElementById('team_library_account');
        if (!box) { box = document.createElement('div'); box.id = 'team_library_account'; box.className = 'shiny-html-output'; document.querySelector('main').prepend(box); }
        box.innerHTML = `<p${t ? ` data-team-account="${a}"` : ''}>Signed in as ${a}</p><button id="team_library_logout" type="button" class="btn btn-default action-button">Sign out and clear this session</button>`;
        document.body.dataset.teamAuthenticated = 'true';
      }, [address, tagged]);
      const signOut = () => page.evaluate(() => {
        document.body.dataset.teamAuthenticated = 'false';
        document.getElementById('team_library_account').innerHTML = '<div class="team-login-card"><input id="team_library_email" class="form-control"><input id="team_library_password" type="password"><button id="team_library_login" type="button">Sign in</button></div>';
      });
      // Signed in, no address readable (the account paragraph not rendered yet): no key at all. The signed-out
      // ('anonymous', hidden) and start@lab.org (hidden) choices are neither read nor overwritten; the width
      // default applies (shown at 1440).
      await page.evaluate(k => localStorage.setItem(k, '1'), KEY + 'anonymous');
      await page.evaluate(() => { document.getElementById('team_library_account').innerHTML = ''; }); await F.settle(page);
      check(!(await hidden()), 'signed in without a readable address: width default (shown), not the anonymous or previous choice');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      const keys = await page.evaluate(k => Object.keys(localStorage).filter(x => x.startsWith(k)).sort().map(x => x.slice(k.length) + '=' + localStorage.getItem(x)).join(','), KEY);
      check(await hidden() && keys === [acct('start@lab.org') + '=1', 'anonymous=1'].sort().join(','), `signed in without a readable address: a click is saved nowhere (${keys})`);
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      await signIn('Someone@Lab.org', true); await F.settle(page);
      check(!(await hidden()), 'another account without a saved choice gets the default (shown at 1440)');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      check(await page.evaluate(k => localStorage.getItem(k), KEY + acct('someone@lab.org')) === '0', 'the account key is the hash of the signed-in email');
      check(await page.evaluate(() => Object.keys(localStorage).every(k => !/@/.test(k) && !/someone/i.test(k))), 'no email in clear in any storage key');
      await page.evaluate(k => localStorage.setItem(k, '0'), KEY + acct('other@lab.org'));
      await signOut(); await F.settle(page);
      check(await hidden(), 'sign-out: the signed-out (anonymous) choice applies again (hidden)');
      await signIn('other@lab.org', true); await F.settle(page);
      check(!(await hidden()), 'a saved choice is restored for its account (other: shown)');
      await page.evaluate(k => localStorage.setItem(k, '1'), KEY + acct('other@lab.org'));
      await signIn('Someone@Lab.org', true); await F.settle(page);
      check(!(await hidden()), 'user change without sign-out: someone\'s own choice (shown)');
      await signIn('other@lab.org', true); await F.settle(page);
      check(await hidden(), 'user change back: other\'s own choice (hidden)');
      // ar@lab.org and c0@lab.org share their 32-bit djb2 hash; the 64-bit key keeps them apart.
      check(legacyAcct('ar@lab.org') === legacyAcct('c0@lab.org') && acct('ar@lab.org') !== acct('c0@lab.org') && /^[0-9a-f]{16}$/.test(acct('ar@lab.org')), 'djb2 collision pair has distinct 64-bit keys');
      await page.evaluate(([a, c]) => { localStorage.setItem(a, '1'); localStorage.setItem(c, '0'); }, [KEY + acct('ar@lab.org'), KEY + acct('c0@lab.org')]);
      await signIn('ar@lab.org', true); await F.settle(page);
      check(await hidden(), 'ar@lab.org: its own choice (hidden)');
      await signIn('c0@lab.org', true); await F.settle(page);
      check(!(await hidden()), 'c0@lab.org (same djb2 hash): its own choice (shown)');
      // 8-hex keys of the earlier build are ignored: a stale one (here shared by the colliding pair) is never
      // read, so neither account inherits it, and an explicit choice is never overridden by it.
      await page.evaluate(([old, a, c]) => { localStorage.setItem(old, '1'); localStorage.removeItem(a); localStorage.removeItem(c); }, [KEY + legacyAcct('ar@lab.org'), KEY + acct('ar@lab.org'), KEY + acct('c0@lab.org')]);
      await signIn('c0@lab.org', true); await F.settle(page);
      check(!(await hidden()), 'c0@lab.org does not inherit the stale shared 8-hex key (default shown at 1440)');
      await signIn('ar@lab.org', true); await F.settle(page);
      check(!(await hidden()), 'ar@lab.org does not read the stale 8-hex key either (default shown at 1440)');
      check(await page.evaluate(k => localStorage.getItem(k), KEY + legacyAcct('ar@lab.org')) === '1', 'the stale 8-hex key is left alone (never read, moved or deleted)');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      check(await page.evaluate(k => localStorage.getItem(k), KEY + acct('ar@lab.org')) === '0', 'explicit shown choice saved under the 64-bit key');
      await signIn('c0@lab.org', true); await signIn('ar@lab.org', true); await F.settle(page);
      check(!(await hidden()), 'explicit "0" re-read after a user change: shown, the stale "1" ignored');
      // Markup without the data attribute (the "Signed in as" text alone) still names the account.
      await page.evaluate(k => localStorage.removeItem(k), KEY + acct('third@lab.org'));
      await signIn('third@lab.org', false); await F.settle(page);
      check(!(await hidden()), 'text-only signed-in markup: third has no saved choice, default shown at 1440');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      check(await page.evaluate(k => localStorage.getItem(k), KEY + acct('third@lab.org')) === '0', 'text-only signed-in markup: key is the hash of its email');
      await page.evaluate(k => localStorage.removeItem(k), KEY + acct('third@lab.org'));
      await signIn('Someone@Lab.org', true); await signIn('third@lab.org', true); await F.settle(page);
      await page.setViewportSize({width: 1200, height: 900}); await F.settle(page);
      check(await hidden(), 'no saved choice: hidden at 1200 px');
      // At <= 900 px the column stacks under the canvas and is always shown: the layout says so too.
      await page.setViewportSize({width: 390, height: 844}); await F.settle(page);
      check(!(await hidden()), 'no saved choice: not collapsed at 390 px (column stacked)');
      await page.setViewportSize({width: 1200, height: 900}); await F.settle(page);
      check(await hidden(), 'no saved choice: hidden again at 1200 px');
      await page.setViewportSize({width: 1440, height: 900}); await F.settle(page);
      check(!(await hidden()), 'no saved choice: shown again at 1440 px');
      check(!errors.length, `keyboard page errors ${errors.join(' | ')}`);
      await page.close();
    }
    // A saved explicit choice survives a new visit (a reload rebuilds the page with this storage): "0" at
    // 1024 px (default hidden) loads shown, "1" at 1440 px (default shown) loads hidden; a stale 8-hex key
    // for the same account changes nothing.
    for (const [w, value, expectHidden] of [[1024, '0', false], [1440, '1', true]]) {
      const {page} = await open(browser, {width: w, height: 800}, false, null, {[KEY + acct('visit@lab.org')]: value, [KEY + legacyAcct('visit@lab.org')]: value === '0' ? '1' : '0'});
      check((await state(page)).hidden === expectHidden, `saved "${value}" restored on a new visit at ${w} px`);
      await page.close();
    }
    // Default below 1280 px and at 1280 px, on first load.
    for (const [w, expectHidden] of [[390, false], [901, true], [1279, true], [1280, false]]) {
      const {page} = await open(browser, {width: w, height: 800}, false);
      check((await state(page)).hidden === expectHidden, `first load at ${w} px: ${expectHidden ? 'hidden' : 'shown'}`);
      await page.close();
    }
    // Edit on a card while the column is hidden (default at 1200 px): the column is shown (not remembered),
    // is not inert, and focus lands on the inspector's tab (card_frame.js), not in an inert column.
    {
      const {page, errors} = await open(browser, {width: 1200, height: 900}, false);
      check((await state(page)).hidden, 'edit: column starts hidden at 1200 px');
      const edit = page.locator('#team-canvas-root .tc-node .tc-card-edit').first();
      check(await edit.count() === 1, 'edit: the card has its Edit button (card_frame.js)');
      await edit.focus(); await page.keyboard.press('Enter'); await F.settle(page);
      const st = await state(page);
      const focus = await page.evaluate(() => { const a = document.activeElement, col = document.querySelector('#team-canvas-root .ts-inspector-column'); return {inColumn: !!a && col.contains(a), tab: !!a && a.matches('.tc-inspector-tab, .tc-inspector-header button, .tc-inspector-locked button'), inertAncestor: !!a && !!a.closest('[inert]'), opacity: getComputedStyle(col).opacity}; });
      check(!st.hidden && !st.inert && st.expanded === 'true', `edit: hidden column shown ${JSON.stringify(st)}`);
      check(focus.inColumn && focus.tab && !focus.inertAncestor && focus.opacity === '1', `edit: focus on the inspector tab ${JSON.stringify(focus)}`);
      check(await page.evaluate(k => Object.keys(localStorage).filter(x => x.startsWith(k)).length, KEY) === 0, 'edit: showing the column for Edit is not saved as a choice');
      check(!errors.length, `edit page errors ${errors.join(' | ')}`);
      await page.close();
    }
    // FigA: in Move (pointer_mode.js) a pointer click on Edit is a pan that never reaches the card, so it
    // opens nothing either (a keyboard Enter on Edit still does, above).
    {
      const {page, errors} = await open(browser, {width: 1200, height: 900}, false);
      check((await state(page)).hidden, 'edit in Move: column starts hidden at 1200 px');
      await page.evaluate(() => window.TeamCanvasPointerMode.setMode('hand'));
      const edit = page.locator('#team-canvas-root .tc-node .tc-card-edit').first();
      const box = await edit.boundingBox();
      check(!!box, 'edit in Move: the Edit button is on screen');
      if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await F.settle(page); }
      const st = await state(page);
      check(st.hidden && st.inert && st.expanded === 'false', `edit in Move: a pointer click shows nothing ${JSON.stringify(st)}`);
      check(!errors.length, `edit in Move page errors ${errors.join(' | ')}`);
      await page.close();
    }
    // Storage that throws (private mode, quota): the toggle still works.
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900}, false);
      // Only this feature's keys throw, so the other Team scripts keep their storage.
      await page.evaluate(k => {
        const g = Storage.prototype.getItem, s = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) { if (String(key).startsWith(k)) throw new Error('denied'); return g.call(this, key); };
        Storage.prototype.setItem = function (key, v) { if (String(key).startsWith(k)) throw new Error('denied'); return s.call(this, key, v); };
        const box = document.createElement('div'); box.id = 'team_library_account';
        box.innerHTML = '<p data-team-account="private@lab.org">Signed in as private@lab.org</p><button id="team_library_logout" type="button">Sign out and clear this session</button>';
        document.querySelector('main').prepend(box);
      }, KEY);
      await F.settle(page);
      check(!(await state(page)).hidden, 'throwing storage: default state at 1440 px');
      await clickToggle(page);
      check((await state(page)).hidden && !errors.length, `throwing storage: toggle still works ${errors.join(' | ')}`);
      await page.close();
    }
    // Guided pages: not wired there; even loaded by mistake, nothing mounts and the companion does not move.
    for (const kind of ['results', 'quality-pending']) {
      const page = await browser.newPage({viewport: {width: 1440, height: 900}});
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await F.install(page);
      await F.setupGuided(page, kind, {companion: 'default'});
      check(!F.assets('guided', 'js').some(r => NEW.test(r)) && !F.assets('guided', 'css').some(r => NEW.test(r)), `guided/${kind}: inspector_toggle not loaded`);
      const before = await page.evaluate(() => { const n = document.getElementById('lipidomic-companion'); return n ? JSON.stringify(n.getBoundingClientRect()) : null; });
      await page.addStyleTag({path: path.resolve('www/team/css/inspector_toggle.css')});
      await page.addScriptTag({path: path.resolve('www/team/js/inspector_toggle.js')});
      await page.keyboard.press('i'); await F.settle(page);
      const after = await page.evaluate(() => { const n = document.getElementById('lipidomic-companion'); return n ? JSON.stringify(n.getBoundingClientRect()) : null; });
      check(!(await page.locator('.ts-inspector-toggle').count()) && before === after && !errors.length, `guided/${kind}: untouched (${errors.join(' | ')})`);
      await page.close();
    }
  } finally { await browser.close(); if (prodRoot && path.basename(prodRoot).startsWith('team-inspector-prod-') && prodRoot.startsWith(os.tmpdir())) fs.rmSync(prodRoot, {recursive: true, force: true}); }
  notes.forEach(n => console.log('  ' + n));
  if (fails.length) { console.log(fails.join('\n')); console.log(`FAIL: ${fails.length} failed, ${pass} passed`); process.exit(1); }
  console.log(`PASS: ${pass} checks: inspector toggle at ${VIEWPORTS.map(v => v.width).join(', ')} px; mascot (default and put by hand), home, obstacles, navigation box and chat dock identical shown / hidden / production ${PRODUCTION}`);
})().catch(e => { console.error(e); process.exit(1); });
