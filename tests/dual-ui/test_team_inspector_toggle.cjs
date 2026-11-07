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
// ux27 re-baseline: the column is hidden by default wherever it is a side column (> 900 px), the choice is
// kept for the browser tab only (sessionStorage), and on Canvas the companion's home is a small box at the
// canvas viewport's bottom-right (left of the shown inspector; at the canvas's right edge when it is
// hidden, the canvas then taking the whole width). Wide, the production-equivalence checks of the resting
// mascot, its home, the inspector's obstacles and the chat dock are replaced by those anchoring checks; at
// 390 px, the hand-placed mascot, the navigation box and the toolbar they are still production's.
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
  // Re-baseline (ux18, approved by the owner 2026-11-05): production plus the ux18 Canvas layer, i.e. the
  // slim zoom pill / minimap cluster and the small companion pinned bottom-right on Canvas. Only its www/team
  // presentation files (canvas.js's restore-only change is left out: this fixture does not load canvas.js).
  execFileSync('git', ['apply', path.join(ROOT, 'tests/dual-ui/ux18_canvas_layer.patch')], {cwd: prodRoot});
  PF = require(path.join(prodRoot, 'tests/dual-ui/fixture_team_overlay_pages.cjs'));
}
// manual: a position the user dragged the mascot to (context_help.js reads it from sessionStorage when it loads).
// preset: sessionStorage entries written just before inspector_toggle.js loads (a reload in the same tab).
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
      for (const [k, v] of Object.entries(p)) sessionStorage.setItem(k, v); }, preset);
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
      check(s.hidden === wide, `${tag}: first open ${wide ? 'hides' : 'keeps'} the inspector (${JSON.stringify(s)})`);
      if (wide && s.hidden) { await clickToggle(a.page); s = await state(a.page); }
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
        const gain = r1(mHidden.width - mShown.width), colRight = gHidden.column[0] + gHidden.column[2];
        check(gain >= gHidden.column[2] - 1 && Math.abs(mHidden.right - colRight) <= 1, `${tag}: canvas ${mShown.width}→${mHidden.width} px does not take the whole width (column right ${colRight})`);
        notes.push(`${tag}: canvas ${r1(mShown.width)} → ${r1(mHidden.width)} px (+${gain} px; nothing reserved)`);
        const top = await b.page.evaluate(() => { const c = document.querySelector('#team-canvas-root .ts-inspector-column').getBoundingClientRect(); const n = document.elementFromPoint(c.left + 20, c.top + 80); return !!n && !!n.closest('.tc-main') && !n.closest('.ts-inspector-column'); });
        check(top, `${tag}: the canvas is not what is under the hidden column's left part`);
        // ux27: hidden, the home and the resting mascot sit at the canvas viewport's bottom-right corner.
        const anchor = await b.page.evaluate(() => {
          const r = n => { const q = n.getBoundingClientRect(); return {left: q.left, top: q.top, right: q.right, bottom: q.bottom}; };
          const scroll = r(document.querySelector('#team-canvas-root .tc-scroll')), main = r(document.querySelector('#team-canvas-root .tc-layout>.tc-main'));
          const home = r(document.querySelector('#team-canvas-root .tc-companion-home')), dock = r(document.getElementById('lipidomic-companion'));
          return {scroll, main, home, dock};
        });
        check(Math.abs(anchor.home.right - anchor.main.right) <= 1 && anchor.dock.right <= anchor.scroll.right + 1 && anchor.scroll.right - anchor.dock.right <= 48 && anchor.dock.left >= anchor.scroll.left,
          `${tag}: hidden, the companion is anchored at the canvas viewport's bottom-right ${JSON.stringify(anchor)}`);
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
        if (wide) {
          // ux27: the mascot keeps production's size, z-index and look; its home is the small box at the
          // live column edge (left of the shown inspector; the canvas's right edge when hidden).
          const m = g.mascot, p = gProd.mascot, colLeft = g.column[0], colRight = g.column[0] + g.column[2];
          check(m.rect && same([m.z, m.size, m.visibility, m.mini], [p.z, p.size, p.visibility, p.mini]), `${tag}: mascot ${name} look ${JSON.stringify(m)} != production ${JSON.stringify(p)}`);
          const edge = name === 'shown' ? colLeft : colRight;
          check(g.home && Math.abs(g.home[0] + g.home[2] - edge) <= 1 && m.rect[0] + m.rect[2] <= edge + 1, `${tag}: home/mascot ${name} at the column edge ${edge} ${JSON.stringify([g.home, m.rect])}`);
          check(g.nav && same(g.nav, gProd.nav) && same(g.column, gProd.column), `${tag}: .tc-navigation / column ${name} ${JSON.stringify([g.nav, g.column])} != production ${JSON.stringify([gProd.nav, gProd.column])}`);
          const n = g.nav, r = m.rect;
          check(!(r[0] < n[0] + n[2] && r[0] + r[2] > n[0] && r[1] < n[1] + n[3] && r[1] + r[3] > n[1]), `${tag}: mascot ${name} over the navigation box ${JSON.stringify([r, n])}`);
          continue;
        }
        check(same(g.mascot, gProd.mascot), `${tag}: mascot ${name} ${JSON.stringify(g.mascot)} != production ${JSON.stringify(gProd.mascot)}`);
        // Hidden (wide), the home narrows to the companion strip around the same centre and keeps its top
        // and bottom: context_help.js centres the mascot in it, companion_assistant.js docks above its top.
        const homeSame = name === 'hidden' && wide ? !!g.home && Math.abs((g.home[0] + g.home[2] / 2) - (gProd.home[0] + gProd.home[2] / 2)) <= 0.5 && g.home[1] === gProd.home[1] && g.home[3] === gProd.home[3] : same(g.home, gProd.home);
        check(homeSame && same(g.column, gProd.column), `${tag}: home/column ${name} ${JSON.stringify([g.home, g.column])} != production ${JSON.stringify([gProd.home, gProd.column])}`);
        check(same(g.obstacles, gProd.obstacles), `${tag}: mascot obstacles ${name} ${JSON.stringify(g.obstacles)} != production ${JSON.stringify(gProd.obstacles)}`);
        check(g.nav && same(g.nav, gProd.nav), `${tag}: .tc-navigation ${name} ${JSON.stringify(g.nav)} != production ${JSON.stringify(gProd.nav)}`);
      }
      // The Draft toolbar no longer offers the Figure-page-only Text / Shapes (ux27), so where it does not
      // wrap it is narrower: its top, height and right edge are production's.
      const tbSame = (a, b) => !!a && !!b && a[1] === b[1] && a[3] === b[3] && Math.abs((a[0] + a[2]) - (b[0] + b[2])) <= 0.5;
      check(tbSame(gShown.toolbar, gProd.toolbar), `${tag}: .tc-toolbar shown ${JSON.stringify(gShown.toolbar)} != production ${JSON.stringify(gProd.toolbar)}`);
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
      // ux27: shown, the chat docks over the column as in production; hidden (the column invisible), it
      // stays inside the window.
      for (const [name, c, g] of [['shown', cShown, gShown], ['hidden', cHidden, gHidden]]) {
        if (!wide) { check(same(c, cProd), `${tag}: chat dock ${name} ${JSON.stringify(c)} != production ${JSON.stringify(cProd)}`); continue; }
        // Shown: production's rect (its max height follows the lower home, so it may be taller).
        if (name === 'shown') { check(c.dockRect && cProd.dockRect && same(c.dockRect.rect, cProd.dockRect.rect) && parseFloat(c.dockRect.maxHeight) >= parseFloat(cProd.dockRect.maxHeight), `${tag}: chat dock shown ${JSON.stringify(c)} != production ${JSON.stringify(cProd)}`); continue; }
        const d = c.dockRect;
        check(d && d.rect[0] >= 0 && d.rect[0] + d.rect[2] <= vp.width + 1, `${tag}: chat dock ${name} ${JSON.stringify(c)} (column ${JSON.stringify(g.column)})`);
      }
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
      // ux27: shown, the mascot rests in its home left of the inspector; hidden, at the canvas's right edge.
      check(inside(gs.mascot.rect) && inHome(gs.mascot.rect, gs.home) && gs.mascot.rect[0] + gs.mascot.rect[2] <= gs.column[0] + 1, `${tag}: shown, the mascot rests left of the inspector ${JSON.stringify([gs.mascot.rect, gs.home, gs.column])}`);
      check(same(gs.nav, gp.nav) && !!gs.toolbar && !!gp.toolbar && gs.toolbar[1] === gp.toolbar[1] && Math.abs((gs.toolbar[0] + gs.toolbar[2]) - (gp.toolbar[0] + gp.toolbar[2])) <= 0.5, `${tag}: shown geometry != production ${JSON.stringify([gs.nav, gs.toolbar, gp.nav, gp.toolbar])}`);
      check(inside(gh.mascot.rect) && inHome(gh.mascot.rect, gh.home), `${tag}: hidden, the mascot rests inside its home ${JSON.stringify([gh.mascot.rect, gh.home])}`);
      // Hidden, the mascot is over the canvas viewport's bottom-right corner (inside it), clear of the navigation box.
      const probe = await cand.page.evaluate(() => {
        const sr = document.querySelector('#team-canvas-root .tc-scroll').getBoundingClientRect(), d = document.getElementById('lipidomic-companion').getBoundingClientRect();
        const n = document.querySelector('#team-canvas-root .tc-navigation').getBoundingClientRect();
        return {scrollRight: Math.round(sr.right), scrollBottom: Math.round(sr.bottom), mascot: [d.left, d.top, d.right, d.bottom].map(Math.round), overNav: d.left < n.right && d.right > n.left && d.top < n.bottom && d.bottom > n.top};
      });
      check(probe.mascot[2] <= probe.scrollRight + 1 && probe.scrollRight - probe.mascot[2] <= 48 && !probe.overNav, `${tag}: hidden, the mascot sits at the canvas viewport's bottom-right ${JSON.stringify(probe)}`);
      check(!cand.errors.length, `${tag}: page errors ${cand.errors.join(' | ')}`);
      await cand.page.close();
    }
    // ux27: hidden, the canvas takes the whole width whatever the chat or a hand-placed mascot does (no
    // extension zone any more: inspector_toggle.js's ts-inspector-extended class no longer changes the layout).
    const toEnd = async page => { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await F.settle(page); };
    const full = page => page.evaluate(() => {
      const m = document.querySelector('#team-canvas-root .tc-layout>.tc-main').getBoundingClientRect(), c = document.querySelector('#team-canvas-root .ts-inspector-column').getBoundingClientRect();
      const panel = document.getElementById('lipidomic-assistant-panel');
      return {mainRight: m.right, colRight: c.right, chat: !!panel && !panel.hidden};
    });
    for (const vp of [{width: 901, height: 800}, {width: 1024, height: 800}, {width: 1280, height: 800}, {width: 1440, height: 800}]) {
      const tag = `${vp.width}x${vp.height}`;
      const {page, errors} = await open(browser, vp, false);
      await toEnd(page);
      check((await state(page)).hidden, `${tag}: starts hidden`);
      let e = await full(page);
      check(Math.abs(e.mainRight - e.colRight) <= 1, `${tag}: chat closed: canvas takes the whole width ${JSON.stringify(e)}`);
      await F.openCompanionChat(page); await F.settle(page);
      e = await full(page);
      check(e.chat && Math.abs(e.mainRight - e.colRight) <= 1, `${tag}: chat open: canvas keeps the whole width ${JSON.stringify(e)}`);
      await page.keyboard.press('Escape'); await F.settle(page);
      e = await full(page);
      check(!e.chat && Math.abs(e.mainRight - e.colRight) <= 1, `${tag}: chat closed again: whole width ${JSON.stringify(e)}`);
      check(!errors.length, `${tag}: page errors ${errors.join(' | ')}`);
      await page.close();
    }
    // The tools drawer opening and closing: the canvas gives the track back while it is open and takes the
    // whole width again when it closes (three cycles).
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900}, false);
      await toEnd(page);
      const cycles = [];
      for (let i = 0; i < 3; i++) {
        await page.locator('#team-canvas-root .ts-analysis-trigger').click(); await F.settle(page);
        const open = await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.contains('ttd-open'));
        await page.evaluate(() => window.TeamToolsDrawer.close()); await F.settle(page);
        const e = await full(page);
        cycles.push([open, Math.abs(e.mainRight - e.colRight) <= 1]);
      }
      check(cycles.every(([o, w]) => o && w), `hidden, open tools, close tools (x3): the canvas ends at the whole width each time ${JSON.stringify(cycles)}`);
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
      // ux27: it opens hidden; show it first (an explicit choice) so the sequence below starts shown.
      check(await hidden(), 'keyboard: first open is hidden at 1440 px');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
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
      check(await page.evaluate(k => sessionStorage.getItem(k), KEY + acct('start@lab.org')) === '1', 'hidden state saved for this account');
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
      await page.evaluate(k => sessionStorage.setItem(k, '1'), KEY + 'anonymous');
      await page.evaluate(() => { document.getElementById('team_library_account').innerHTML = ''; }); await F.settle(page);
      check(await hidden(), 'signed in without a readable address: the default (hidden), not the previous choice');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      const keys = await page.evaluate(k => Object.keys(sessionStorage).filter(x => x.startsWith(k)).sort().map(x => x.slice(k.length) + '=' + sessionStorage.getItem(x)).join(','), KEY);
      check(!(await hidden()) && keys === [acct('start@lab.org') + '=1', 'anonymous=1'].sort().join(','), `signed in without a readable address: a click is saved nowhere (${keys})`);
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      await signIn('Someone@Lab.org', true); await F.settle(page);
      check(await hidden(), 'another account without a saved choice gets the default (hidden at 1440)');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      check(await page.evaluate(k => sessionStorage.getItem(k), KEY + acct('someone@lab.org')) === '0', 'the account key is the hash of the signed-in email');
      check(await page.evaluate(() => Object.keys(sessionStorage).every(k => !/@/.test(k) && !/someone/i.test(k))), 'no email in clear in any storage key');
      await page.evaluate(k => sessionStorage.setItem(k, '0'), KEY + acct('other@lab.org'));
      await signOut(); await F.settle(page);
      check(await hidden(), 'sign-out: the signed-out (anonymous) choice applies again (hidden)');
      await signIn('other@lab.org', true); await F.settle(page);
      check(!(await hidden()), 'a saved choice is restored for its account (other: shown)');
      await page.evaluate(k => sessionStorage.setItem(k, '1'), KEY + acct('other@lab.org'));
      await signIn('Someone@Lab.org', true); await F.settle(page);
      check(!(await hidden()), 'user change without sign-out: someone\'s own choice (shown)');
      await signIn('other@lab.org', true); await F.settle(page);
      check(await hidden(), 'user change back: other\'s own choice (hidden)');
      // ar@lab.org and c0@lab.org share their 32-bit djb2 hash; the 64-bit key keeps them apart.
      check(legacyAcct('ar@lab.org') === legacyAcct('c0@lab.org') && acct('ar@lab.org') !== acct('c0@lab.org') && /^[0-9a-f]{16}$/.test(acct('ar@lab.org')), 'djb2 collision pair has distinct 64-bit keys');
      await page.evaluate(([a, c]) => { sessionStorage.setItem(a, '1'); sessionStorage.setItem(c, '0'); }, [KEY + acct('ar@lab.org'), KEY + acct('c0@lab.org')]);
      await signIn('ar@lab.org', true); await F.settle(page);
      check(await hidden(), 'ar@lab.org: its own choice (hidden)');
      await signIn('c0@lab.org', true); await F.settle(page);
      check(!(await hidden()), 'c0@lab.org (same djb2 hash): its own choice (shown)');
      // 8-hex keys of the earlier build are ignored: a stale one (here shared by the colliding pair) is never
      // read, so neither account inherits it, and an explicit choice is never overridden by it.
      await page.evaluate(([old, a, c]) => { sessionStorage.setItem(old, '1'); sessionStorage.removeItem(a); sessionStorage.removeItem(c); }, [KEY + legacyAcct('ar@lab.org'), KEY + acct('ar@lab.org'), KEY + acct('c0@lab.org')]);
      await page.evaluate(([old, c]) => { sessionStorage.setItem(old, '0'); sessionStorage.removeItem(c); }, [KEY + legacyAcct('ar@lab.org'), KEY + acct('c0@lab.org')]);
      await signIn('ar@lab.org', true); await signIn('c0@lab.org', true); await F.settle(page);
      check(await hidden(), 'c0@lab.org does not inherit the stale shared 8-hex key "0" (default hidden at 1440)');
      await page.evaluate(([old, a]) => { sessionStorage.setItem(old, '1'); sessionStorage.removeItem(a); }, [KEY + legacyAcct('ar@lab.org'), KEY + acct('ar@lab.org')]);
      await signIn('ar@lab.org', true); await F.settle(page);
      check(await hidden(), 'ar@lab.org: no own choice, the default (hidden at 1440)');
      check(await page.evaluate(k => sessionStorage.getItem(k), KEY + legacyAcct('ar@lab.org')) === '1', 'the stale 8-hex key is left alone (never read, moved or deleted)');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      check(await page.evaluate(k => sessionStorage.getItem(k), KEY + acct('ar@lab.org')) === '0', 'explicit shown choice saved under the 64-bit key');
      await signIn('c0@lab.org', true); await signIn('ar@lab.org', true); await F.settle(page);
      check(!(await hidden()), 'explicit "0" re-read after a user change: shown, the stale "1" ignored');
      // Markup without the data attribute (the "Signed in as" text alone) still names the account.
      await page.evaluate(k => sessionStorage.removeItem(k), KEY + acct('third@lab.org'));
      await signIn('third@lab.org', false); await F.settle(page);
      check(await hidden(), 'text-only signed-in markup: third has no saved choice, default hidden at 1440');
      await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
      check(await page.evaluate(k => sessionStorage.getItem(k), KEY + acct('third@lab.org')) === '0', 'text-only signed-in markup: key is the hash of its email');
      await page.evaluate(k => sessionStorage.removeItem(k), KEY + acct('third@lab.org'));
      await signIn('Someone@Lab.org', true); await signIn('third@lab.org', true); await F.settle(page);
      await page.setViewportSize({width: 1200, height: 900}); await F.settle(page);
      check(await hidden(), 'no saved choice: hidden at 1200 px');
      // At <= 900 px the column stacks under the canvas and is always shown: the layout says so too.
      await page.setViewportSize({width: 390, height: 844}); await F.settle(page);
      check(!(await hidden()), 'no saved choice: not collapsed at 390 px (column stacked)');
      await page.setViewportSize({width: 1200, height: 900}); await F.settle(page);
      check(await hidden(), 'no saved choice: hidden again at 1200 px');
      await page.setViewportSize({width: 1440, height: 900}); await F.settle(page);
      check(await hidden(), 'no saved choice: hidden again at 1440 px');
      check(!errors.length, `keyboard page errors ${errors.join(' | ')}`);
      await page.close();
    }
    // A saved explicit choice survives a reload in the same tab (sessionStorage, ux27): "0" loads shown at
    // 1024 and 1440 px (default hidden); a stale 8-hex key for the same account changes nothing.
    for (const [w, value, expectHidden] of [[1024, '0', false], [1440, '0', false]]) {
      const {page} = await open(browser, {width: w, height: 800}, false, null, {[KEY + acct('visit@lab.org')]: value, [KEY + legacyAcct('visit@lab.org')]: value === '0' ? '1' : '0'});
      check((await state(page)).hidden === expectHidden, `saved "${value}" restored on a reload at ${w} px`);
      await page.close();
    }
    // Default on first load (ux27): hidden wherever the column is a side column, shown where it stacks.
    for (const [w, expectHidden] of [[390, false], [901, true], [1279, true], [1280, true], [1440, true]]) {
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
      check(await page.evaluate(k => Object.keys(sessionStorage).filter(x => x.startsWith(k)).length, KEY) === 0, 'edit: showing the column for Edit is not saved as a choice');
      // Hidden again after Edit: the card inspector (forced visible by shell.css) is not measured either, so
      // the mascot returns to the canvas viewport's bottom-right.
      await clickToggle(page); await page.waitForTimeout(400);
      const back = await page.evaluate(() => { const v = n => n && getComputedStyle(n).visibility, s = document.querySelector('#team-canvas-root .tc-scroll').getBoundingClientRect(), d = document.getElementById('lipidomic-companion').getBoundingClientRect(); return {sel: v(document.querySelector('#team-canvas-root .tc-selection-inspector')), gap: Math.round(s.right - d.right)}; });
      check(back.sel !== 'visible' && back.gap >= 0 && back.gap <= 48, `edit, then hide: inspector not measured, mascot at the canvas's right edge ${JSON.stringify(back)}`);
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
      check((await state(page)).hidden, 'throwing storage: default state at 1440 px');
      await clickToggle(page);
      check(!(await state(page)).hidden && !errors.length, `throwing storage: toggle still works ${errors.join(' | ')}`);
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
  console.log(`PASS: ${pass} checks: inspector toggle at ${VIEWPORTS.map(v => v.width).join(', ')} px; hidden by default, whole-width canvas, companion anchored at the canvas viewport's bottom-right (left of the shown inspector), mascot look, navigation box and hand-placed mascot as production ${PRODUCTION}`);
})().catch(e => { console.error(e); process.exit(1); });
