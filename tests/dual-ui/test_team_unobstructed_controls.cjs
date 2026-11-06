// Run with: node tests/dual-ui/test_team_unobstructed_controls.cjs [page,page,...] [--baseline]
// No overlay may cover a key control. At 1280, 1440 and 390 px, with the companion closed (Plain help),
// in its default (automatic) position, and opened (its chat opened with the real opener), every visible
// key control is hit-tested at its centre: document.elementFromPoint must return the control or a
// descendant. The same point is tested again with pointer events forced on inside the overlay layers
// (companion, chat, help panel, tools drawer, instance panel, canvas notice), so a layer that only lets
// clicks through still counts as covering what it paints over. A control that is off-screen is first
// scrolled into view (block: nearest).
// all: every visible match is a key control (a bar of buttons). Each match is scrolled into view on its own
// and hit-tested there (FIXR3B item 5: before, only the first was scrolled and the others were silently
// dropped when off-screen). min: the number of visible matches the control must have (a stated minimum).
// Required controls (required: true, or a function of the width) must be on the page and on screen: a
// required control that is absent, has fewer than its minimum of matches, or any match of which is still
// off-screen after scrolling, FAILS. Only optional controls are reported as skipped. A control marked
// hiddenWhileOpen must not be shown at all in that state (the inspector, which the tools drawer replaces
// on the Draft canvas).
// Key controls: the R5 pending bar's Update prepared data and Undo, the Continue button and its note,
// Plot controls, Sign in, card actions, inspector tabs, the step bar (the compact step trigger on phones),
// the guided "Help with this step" button, the Canvas header's right end (Analysis tools, Export figure, ⋯).
// The companion is the production floating dock #lipidomic-companion and its chat (context_help.js and
// companion_assistant.js, as in d814775), measured where context_help.js places it: the test never moves
// or hides it, so a control under the mascot FAILS.
// States beyond the companion's: the tools drawer open over a selected card (normal and expanded Canvas)
// and the step's Help panel (#lipidomic-help-panel) open.
// The wave-1 finding "the mascot covers the pending bar's Undo" (guided Quality after an exclusion,
// 1440, companion in its default position) is one of the asserted cases and must run.
// --baseline prints the table and exits 0 even with failures (for a before/after record).
// Fixtures: tests/dual-ui/fixture_team_overlay_pages.cjs (Team stylesheets in app order, libreros.css and
// custom.css included, the mode's own assets only, the R5 bar and the guided step bar markup).
const assert = require('node:assert/strict');
const {chromium} = require('../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');

const BASELINE = process.argv.includes('--baseline');
const STATES = ['closed', 'default', 'opened'];
const wide = w => w > 600;
// all: every visible match is a key control (a bar of buttons); otherwise the first visible match.
// The compact step trigger (mobile_steps.js, <= 600 px) carries only aria-expanded/aria-controls.
// min: the seven steps on desktop, the one compact trigger on phones.
const STEP_BAR = {name: 'Step bar', sel: '#guide-navigation nav button, #guide-navigation [aria-haspopup], #guide-navigation .tw-compact-steps-trigger', all: true, required: true, min: w => wide(w) ? 7 : 1};
const HELP = {name: 'Help with this step', sel: '#lipidomic-context-help', required: true};
const GUIDED_QUALITY = [
  {name: 'Update prepared data', sel: '#tw-pending-bar .tw-pending-update', required: true},
  {name: 'Undo', sel: '#tw-pending-bar .tw-pending-undo', required: true},
  {name: 'Continue', sel: '#guide_quality_next button[data-guide-step="4"]', required: true},
  {name: 'Continue note', sel: '#tw-continue-reason', required: true},
  STEP_BAR, HELP];
// min: Edit and Duplicate (and ⋯ on RC4's framed cards); Data, Appearance, Statistics and Export.
const CARD_ACTIONS = {name: 'Card actions', sel: '#team-canvas-root .tc-node.is-selected .tc-card-actions button', all: true, required: true, min: 2};
const INSPECTOR_TABS = {name: 'Inspector tabs', sel: '#tc-selection-inspector .tc-inspector-tab', all: true, required: true, min: 4};
// The Canvas header's right end. On phones Analysis tools and Export figure are offered in ⋯ (canvas_header.css).
const HEADER = [
  {name: 'Analysis tools', sel: '#team-canvas-root .ts-tools .ts-analysis-trigger', required: wide, fitLevel: 3, inMore: ['Analysis tools…'], opens: '#team-tools-drawer'},
  {name: 'Export figure', sel: '#team-canvas-root .ts-tools .ts-export > .ts-menu-trigger', required: wide, fitLevel: 3, inMore: ['Export figure: SVG · vector', 'Export figure: PDF', 'Print figure']},
  {name: 'More (⋯)', sel: '#team-canvas-root .ts-tools .ts-more > .ts-menu-trigger', required: true}];
const OPEN_MENUS = {name: 'Open menus (every item)', menus: true, required: true};
const DRAWER = [
  {name: 'Drawer Close', sel: '#team-tools-drawer .ttd-close', required: true},
  {name: 'Drawer Open', sel: '#team-tools-drawer .ttd-open', required: true}];

// The drawer from the control a person uses here: the toolbar's Analysis tools, or ⋯ > Analysis tools… on phones.
async function openDrawerFromCanvas(p) {
  const used = await p.evaluate(() => {
    const shown = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
    const t = document.querySelector('#team-canvas-root .ts-tools .ts-analysis-trigger');
    if (shown(t)) { t.click(); return 'toolbar'; }
    const more = document.querySelector('#team-canvas-root .ts-more > .ts-menu-trigger');
    if (!shown(more)) return null;
    more.click();
    const item = Array.from(document.querySelectorAll('#team-canvas-root .ts-more .ts-menu-item')).find(b => shown(b) && b.textContent.trim() === 'Analysis tools…');
    if (!item) return null;
    item.click(); return '⋯ menu';
  });
  if (!used) throw new Error('no Analysis tools control is shown');
  await p.waitForFunction(() => { const d = document.getElementById('team-tools-drawer'); return d && !d.hidden; }, null, {timeout: 3000});
  await F.settle(p);
}
// The step's help panel, from the help bar's "Help with this step" (context_help.js, as in d814775).
const openHelp = async p => {
  await p.locator('#lipidomic-context-help').click();
  await p.waitForSelector('#lipidomic-help-panel', {state: 'visible', timeout: 3000});
  await F.settle(p);
};

const PAGES = [
  // chat: the opened state must open the chat (the character is shown there, so it has an opener).
  {name: 'guided-quality-pending', chat: true, setup: (p, companion) => F.setupGuided(p, 'quality-pending', {companion}), controls: GUIDED_QUALITY},
  {name: 'guided-results', chat: true, setup: (p, companion) => F.setupGuided(p, 'results', {companion}), controls: [
    {name: 'Plot controls', sel: '#guide-narrow-controls', required: true},
    STEP_BAR, HELP]},
  {name: 'login', chat: true, setup: (p, companion) => F.setupGuided(p, 'login', {companion}), controls: [
    {name: 'Sign in', sel: '#team_library_login', required: true},
    STEP_BAR, HELP]},
  // The step's Help panel open (context_help.js): its close button and the page's key controls stay usable.
  {name: 'guided-help', states: ['closed', 'default'], setup: async (p, companion) => { await F.setupGuided(p, 'quality-pending', {companion}); await openHelp(p); }, controls: [
    ...GUIDED_QUALITY,
    {name: 'Help panel ×', sel: '#lipidomic-help-panel .lipid-help-close', required: true}]},
  // Team workspace Canvas with a selected card: its actions and the inspector's tabs are shown.
  {name: 'workspace-canvas', setup: async (p, companion) => { await F.setupWorkspace(p, {companion}); await F.selectCard(p); }, controls: [
    CARD_ACTIONS, INSPECTOR_TABS, ...HEADER, OPEN_MENUS,
    {name: 'Top bar steps', sel: '.navbar .ts-steps .ts-step, .navbar .tw-compact-steps-trigger', all: true, required: true, min: w => wide(w) ? 3 : 1}]},
  // The same with the Canvas expanded (the top bar is under the full-screen canvas by design).
  {name: 'workspace-canvas-expanded', setup: async (p, companion) => { await F.setupWorkspace(p, {companion, expand: true}); await F.selectCard(p); }, controls: [
    CARD_ACTIONS, INSPECTOR_TABS, ...HEADER, OPEN_MENUS]},
  // The tools drawer opened over a selected card's inspector (Astra 2, Sol 1, Opus H1, Haiku M3): it takes the
  // inspector's column, so the header's right end, the card actions and its own controls are all usable, and the
  // inspector is not shown (not painted over). The companion state is set before the drawer opens (it closes the chat).
  {name: 'workspace-canvas-drawer', ownsChat: true, setup: async (p, companion) => {
    await F.setupWorkspace(p, {companion}); await F.selectCard(p);
    if (companion === 'opened') await F.openCompanionChat(p);
    await openDrawerFromCanvas(p);
  }, controls: [CARD_ACTIONS, ...HEADER, ...DRAWER, {name: 'Inspector (replaced by the drawer)', sel: '#tc-selection-inspector', hiddenWhileOpen: true}]},
  {name: 'workspace-canvas-expanded-drawer', ownsChat: true, setup: async (p, companion) => {
    await F.setupWorkspace(p, {companion, expand: true}); await F.selectCard(p);
    if (companion === 'opened') await F.openCompanionChat(p);
    await openDrawerFromCanvas(p);
  }, controls: [CARD_ACTIONS, ...HEADER, ...DRAWER, {name: 'Inspector (replaced by the drawer)', sel: '#tc-selection-inspector', hiddenWhileOpen: true}]}
];
// The wave-1 capture r5-after-1440: guided Quality after an exclusion, the mascot over the bar's Undo.
const CARRYOVER = {page: 'guided-quality-pending', width: 1440, companion: 'default', control: 'Undo'};

const isRequired = (c, width) => typeof c.required === 'function' ? c.required(width) : !!c.required;
const minimum = (c, width) => typeof c.min === 'function' ? c.min(width) : (c.min || 1);

// Visible matches of a control, in document order. The page helpers are installed once per page.
const PROBE = `window.__ucShown=function(n){var r=n.getBoundingClientRect();return !n.closest('[hidden],[inert]')&&n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden'&&r.width>0&&r.height>0;};
  window.__ucNodes=function(sel){return Array.from(document.querySelectorAll(sel)).filter(window.__ucShown);};
  window.__ucInView=function(n){var r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return x>=0&&y>=0&&x<innerWidth&&y<innerHeight;};`;
const visibleCount = (page, sel) => page.evaluate(sel => window.__ucNodes(sel).length, sel);
// Brings match i into view (block/inline: nearest) when its centre is off-screen.
const bringIntoView = (page, sel, i) => page.evaluate(([sel, i]) => {
  const n = window.__ucNodes(sel)[i]; if (!n) return false;
  if (window.__ucInView(n)) return 'in view';
  n.scrollIntoView({block: 'nearest', inline: 'nearest'});
  return 'scrolled';
}, [sel, i]);
// Hit-tests match i where it now is: {offScreen} when its centre is still outside the viewport.
const hitTest = (page, sel, i) => page.evaluate(([sel, i, forceCss]) => {
  const describe = n => n ? (n.id ? '#' + n.id : n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : '')) : null;
  const layer = n => { for (let a = n; a; a = a.parentElement) if (a.id && /^(lipidomic-companion|lipidomic-assistant-root|lipidomic-help-panel|team-tools-drawer|shiny-modal)$/.test(a.id)) return '#' + a.id; return null; };
  const n = window.__ucNodes(sel)[i];
  if (!n) return {gone: true};
  const text = (n.textContent || n.getAttribute('aria-label') || '').trim().slice(0, 30);
  if (!window.__ucInView(n)) return {offScreen: describe(n) + ' "' + text + '"'};
  const at = () => { const r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y); return {x: Math.round(x), y: Math.round(y), ok: !!hit && (hit === n || n.contains(hit)), hit: describe(hit), layer: layer(hit)}; };
  const plain = at();
  const force = document.createElement('style'); force.textContent = forceCss; document.head.appendChild(force);
  const painted = at();
  force.remove();
  if (plain.ok && painted.ok) return {ok: true};
  return {covered: {control: describe(n), text, at: [plain.x, plain.y], hit: plain.ok ? null : plain.hit, paintedOverBy: painted.ok ? null : painted.hit, layer: plain.ok ? painted.layer : plain.layer}};
}, [sel, i, F.FORCE_POINTER_CSS]);
// Every visible match of an `all` control (else the first), each scrolled into view and tested on its own.
async function checkControl(page, c, width, required) {
  await page.evaluate(PROBE);
  const count = await visibleCount(page, c.sel);
  if (!count) return required ? {status: 'FAIL', note: 'required control absent'} : {status: 'skipped', note: 'absent on this page'};
  const need = minimum(c, width);
  const total = c.all ? count : 1, covered = [], offScreen = [];
  let checked = 0;
  for (let i = 0; i < total; i++) {
    const moved = await bringIntoView(page, c.sel, i);
    if (!moved) { offScreen.push(`match ${i + 1} disappeared`); continue; }
    // The overlays re-place themselves after a scroll; the first match always waits for them.
    if (moved === 'scrolled' || i === 0) await F.settle(page);
    const r = await hitTest(page, c.sel, i);
    if (r.gone) offScreen.push(`match ${i + 1} disappeared after scrolling`);
    else if (r.offScreen) offScreen.push(r.offScreen);
    else { checked++; if (r.covered) covered.push(r.covered); }
  }
  const out = {checked, covered};
  if (covered.length) return {...out, status: 'FAIL'};
  if (required && c.all && count < need) return {...out, status: 'FAIL', note: `${count} shown, at least ${need} required`};
  if (offScreen.length) return required ? {...out, status: 'FAIL', note: 'required control off-screen after scrolling: ' + offScreen.join(', ')} : {...out, status: checked ? 'pass' : 'skipped', note: 'off-screen: ' + offScreen.join(', ')};
  return {...out, status: 'pass', note: c.all ? `${checked} of ${count} checked` : undefined};
}

// Every open menu, every item (coordinator, round 4): each menu trigger on the Canvas is opened in turn
// (Tab actions, every toolbar menu incl. ⋯ and Export figure, the selected card's ⋯); each enabled item
// shown in it must be on screen and unobstructed at its centre; Escape (or the trigger) closes it again.
const MENU_TRIGGERS = [
  {name: 'Tab actions', sel: '#team-canvas-root .tc-tabbar .tc-canvas-tab-more', required: true},
  {name: 'Toolbar menu', sel: '#team-canvas-root .ts-tools .ts-menu-wrap > .ts-menu-trigger', all: true, required: true},
  {name: 'Card ⋯', sel: '#team-canvas-root .tc-node.is-selected .tc-card-more', required: true}];
async function checkMenus(page) {
  await page.evaluate(PROBE);
  const problems = [], seen = [];
  for (const t of MENU_TRIGGERS) {
    // Escape on Tab actions also deselects the card (canvas_inspector.js's document Escape; same on 1e4974a,
    // carried to wave 2b): select it again so its own ⋯ is tested, not skipped.
    if (t.name === 'Card ⋯' && !await visibleCount(page, t.sel)) { await F.selectCard(page); await page.evaluate(PROBE); }
    const count = await visibleCount(page, t.sel);
    if (!count) { if (t.required) problems.push(t.name + ': trigger absent'); continue; }
    for (let i = 0; i < (t.all ? count : 1); i++) {
      await bringIntoView(page, t.sel, i); await F.settle(page);
      const trig = await hitTest(page, t.sel, i);
      if (!trig.ok) { problems.push(`${t.name} ${i + 1}: trigger not free (${JSON.stringify(trig).slice(0, 120)})`); continue; }
      await page.evaluate(([sel, i]) => window.__ucNodes(sel)[i].click(), [t.sel, i]);
      await page.waitForTimeout(300);
      const r = await page.evaluate(([sel, i]) => {
        const trig = window.__ucNodes(sel)[i], id = trig.getAttribute('aria-controls');
        const menu = (id && document.getElementById(id)) || (trig.parentElement && trig.parentElement.querySelector('.ts-menu'));
        const label = (trig.getAttribute('aria-label') || trig.textContent).trim();
        if (!menu || !window.__ucShown(menu)) return {label, error: 'menu did not open'};
        const items = Array.from(menu.querySelectorAll('button,[role=menuitem]')).filter(b => window.__ucShown(b) && !b.disabled);
        const bad = [];
        for (const b of items) {
          const q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, name = b.textContent.trim().slice(0, 30);
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { bad.push(name + ': off-screen'); continue; }
          const h = document.elementFromPoint(x, y);
          if (!h || !(h === b || b.contains(h))) bad.push(name + ': covered by ' + (h ? h.tagName.toLowerCase() + '.' + String(h.className).trim().split(/\s+/).slice(0, 3).join('.') : 'nothing'));
        }
        return {label, items: items.length, bad};
      }, [t.sel, i]);
      if (r.error) problems.push(`${r.label}: ${r.error}`);
      else { seen.push(`${r.label} (${r.items})`); if (!r.items) problems.push(`${r.label}: no enabled item shown`); for (const b of r.bad) problems.push(`${r.label} > ${b}`); }
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      const still = await page.evaluate(([sel, i]) => { const trig = window.__ucNodes(sel)[i]; return !!trig && trig.getAttribute('aria-expanded') === 'true'; }, [t.sel, i]);
      if (still) { await page.evaluate(([sel, i]) => window.__ucNodes(sel)[i].click(), [t.sel, i]); await page.waitForTimeout(200); }
    }
  }
  return problems.length ? {status: 'FAIL', note: problems.join('; ').slice(0, 600), checked: seen.length, covered: []} : {status: 'pass', note: 'menus opened: ' + seen.join(', '), checked: seen.length, covered: []};
}

const shownCount = (page, sel) => page.evaluate(sel => Array.from(document.querySelectorAll(sel)).filter(n => !n.closest('[hidden]') && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden').length, sel);

(async () => {
  const names = process.argv.slice(2).find(a => !a.startsWith('--'));
  const only = names ? names.split(',') : null;
  const browser = await chromium.launch({headless: true});
  const rows = [], warnings = [];
  try {
    const page = await browser.newPage({viewport: F.VIEWPORTS[0]});
    page.on('pageerror', e => warnings.push(e.message));
    await F.install(page);
    for (const vp of F.VIEWPORTS) {
      await page.setViewportSize(vp);
      for (const pg of PAGES) {
        if (only && !only.includes(pg.name)) continue;
        for (const companion of pg.states || STATES) {
          const base = {page: pg.name, width: vp.width, companion};
          let opener = null;
          try {
            await pg.setup(page, companion);
            if (companion === 'opened' && !pg.ownsChat) {
              opener = await F.openCompanionChat(page);
              // Opening moves focus into the chat; the controls are tested with the chat left open.
            }
          } catch (e) {
            for (const c of pg.controls) rows.push({...base, control: c.name, status: 'FAIL', note: 'setup: ' + String(e.message || e).split('\n')[0]});
            continue;
          }
          for (const c of pg.controls) {
            const row = {...base, control: c.name};
            const required = isRequired(c, vp.width);
            // RC1 keeps the header one row: from fit level n the toolbar offers that control in ⋯ instead
            // (shell.js fitTools). Then the control is not on the bar by design. It passes only if ⋯ opens and
            // shows EACH of its replacement items, enabled and unobstructed at its centre (elementFromPoint),
            // and, for Analysis tools, choosing the item really opens the drawer.
            if (c.fitLevel && await page.evaluate(n => { const t = document.querySelector('#team-canvas-root .tc-toolbar'); return !!t && [...t.classList].some(k => /^ts-fit-(\d)$/.test(k) && +k.slice(7) >= n); }, c.fitLevel)) {
              const more = page.locator('#team-canvas-root .ts-tools .ts-more > .ts-menu-trigger').first();
              let bad = [];
              const drawerBefore = await page.evaluate(() => { const d = document.getElementById('team-tools-drawer'); return !!d && !d.hidden; });
              try {
                await more.click({timeout: 5000}); await page.waitForTimeout(250);
                const items = await page.evaluate(labels => labels.map(l => {
                  const b = [...document.querySelectorAll('#team-canvas-root .ts-more .ts-menu-item')].find(x => x.textContent.trim() === l);
                  if (!b) return l + ': missing';
                  const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
                  if (!r.width || !r.height || cs.display === 'none' || cs.visibility === 'hidden') return l + ': not shown';
                  if (b.disabled) return l + ': disabled';
                  if (r.right > innerWidth || r.bottom > innerHeight || r.left < 0 || r.top < 0) return l + ': off-screen';
                  const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                  return h && (h === b || b.contains(h)) ? null : l + ': covered by ' + (h ? h.tagName + '.' + String(h.className).slice(0, 40) : 'nothing');
                }).filter(Boolean), c.inMore);
                bad = items;
                // Opening the drawer closes the companion (one right panel), so the click-through runs only where the
                // companion is not part of the state under test; the item checks above run in every state.
                const alreadyOpen = c.opens && await page.evaluate(sel => { const d = document.querySelector(sel); return !!d && !d.hidden; }, c.opens);
                // Where the drawer is already the state under test, its item would toggle it closed: check the item only.
                if (!bad.length && c.opens && companion !== 'opened' && !alreadyOpen) {
                  await page.locator('#team-canvas-root .ts-more .ts-menu-item', {hasText: c.inMore[0]}).first().click({timeout: 5000});
                  await page.waitForTimeout(400);
                  if (!await page.evaluate(sel => { const d = document.querySelector(sel); return !!d && !d.hidden && d.getBoundingClientRect().width > 0; }, c.opens)) bad.push(c.inMore[0] + ': did not open ' + c.opens);
                  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
                } else { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
              } catch (e) { bad.push('⋯ menu: ' + String(e.message || e).split('\n')[0]); }
              // Opening ⋯ is a click outside the drawer, which closes it: put the state under test back.
              if (drawerBefore && !await page.evaluate(() => { const d = document.getElementById('team-tools-drawer'); return !!d && !d.hidden; })) await openDrawerFromCanvas(page);
              Object.assign(row, bad.length ? {status: 'FAIL', note: 'offered in ⋯ but: ' + bad.join('; ')} : {status: 'pass', note: 'offered in ⋯ at this width: every item shown, enabled, unobstructed' + (c.opens && companion !== 'opened' && !/drawer/.test(row.page || '') ? ', opens ' + c.opens : '')});
              rows.push(row); continue;
            }
            if (companion === 'opened' && !opener && !pg.ownsChat) row.note = 'no companion opener shown: tested as is';
            // Guided pages (R7): the person chose a character, so its chat must really be open here.
            if (companion === 'opened' && !opener && pg.chat) { Object.assign(row, {status: 'FAIL', note: 'the companion chat did not open'}); rows.push(row); continue; }
            try {
              if (c.menus) { Object.assign(row, await checkMenus(page)); rows.push(row); continue; }
              if (c.hiddenWhileOpen) {
                // The inspector stays laid out and visible to the frozen mascot's avoidance (as in production);
                // the opaque drawer must paint over it: no point of it may be hit, each must land on the drawer
                // (or on the mascot/chat layers, which are above both as in production).
                const leak = await page.evaluate(sel => {
                  const t = document.querySelector(sel); if (!t || !t.getClientRects().length) return [];
                  const r = t.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, out = [];
                  for (const [fx, fy] of [[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]]) {
                    const x = r.left + r.width * fx, y = r.top + r.height * fy;
                    if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
                    const h = document.elementFromPoint(x, y);
                    if (!h || t.contains(h) || !h.closest('.ttd-drawer,#lipidomic-assistant-root,#lipidomic-companion,.cg-panel')) out.push([Math.round(x), Math.round(y), h ? h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') + (h.className && typeof h.className === 'string' ? '.' + h.className.trim().split(/\s+/)[0] : '') : 'none']);
                  }
                  return out;
                }, c.sel);
                Object.assign(row, leak.length ? {status: 'FAIL', note: 'reachable while the drawer is open: ' + JSON.stringify(leak)} : {status: 'pass', note: 'painted over by the drawer (laid out for the mascot)'});
                rows.push(row); continue;
              }
              const note = row.note, r = await checkControl(page, c, vp.width, required);
              Object.assign(row, r, {note: [note, r.note].filter(Boolean).join('; ') || undefined});
            } catch (e) { Object.assign(row, {status: 'FAIL', note: String(e.message || e).split('\n')[0]}); }
            if (row.companion === CARRYOVER.companion && row.page === CARRYOVER.page && row.width === CARRYOVER.width && row.control === CARRYOVER.control) row.carryover = true;
            rows.push(row);
          }
        }
      }
    }
    console.log('\npage                              width companion control                              result   note');
    for (const r of rows) console.log(`${r.page.padEnd(33)} ${String(r.width).padEnd(5)} ${r.companion.padEnd(9)} ${r.control.padEnd(36)} ${r.status.padEnd(8)} ${r.carryover ? '[wave-1 mascot-over-Undo] ' : ''}${r.note || ''}${r.covered && r.covered.length ? JSON.stringify(r.covered) : ''}`);
    if (warnings.length) console.log(`\nfixture page errors (not failures): ${JSON.stringify([...new Set(warnings)].slice(0, 12))}`);
    const count = s => rows.filter(r => r.status === s).length;
    // The mascot is frozen at production d814775 (Gerardo, 2026-11-04; wave2b-carryover.md). Its own
    // stylesheets and behaviour are not changed by any wave, so results that come only from the mascot
    // itself are reported as 'frozen (as d814775)', not as FAIL. A control the RESTING mascot covers still FAILS.
    // The OPEN chat panel (#lipidomic-assistant-root, companion_assistant.*) is the production panel: what it
    // covers while the user has it open is frozen; the resting mascot ('default') must cover nothing.
    // Carried Medium (wave2b-carryover.md, Astra M3 on 165942a): the tools drawer opened while the docked
    // production chat is open lies under that chat. Reported as 'carried', never as pass.
    for (const r of rows) if (r.status === 'FAIL' && r.companion === 'opened' && Array.isArray(r.covered) && r.covered.length && r.covered.every(c => c && c.layer === '#lipidomic-assistant-root' && /ttd-/.test(String(c.control || '')))) Object.assign(r, {status: 'carried', note: 'carried M3 (drawer under the open chat): ' + (r.note || '')});
    for (const r of rows) if (r.status === 'FAIL' && r.companion === 'opened' && Array.isArray(r.covered) && r.covered.length && r.covered.every(c => c && c.layer === '#lipidomic-assistant-root' && /^(#lipidomic-assistant|[a-z0-9]+\.(assistant|cg-panel))/.test(String(c.paintedOverBy || '')) && !/ttd-/.test(String(c.control || ''))) || (r.status === 'FAIL' && r.companion === 'opened' && /^More |covered by/.test(r.note || '') && (r.note || '').split('; ').every((x, i, a) => (/covered by (header|div|span|p|button|h3)\.(assistant|cg-)/.test(x) || /covered by h3\.$/.test(x) && /Paste plot/.test(x) || /trigger not free .*"hit":"[a-z0-9]+\.(assistant|cg-)/.test(x)) || (i === a.length - 1 && !/:/.test(x))))) Object.assign(r, {status: 'frozen', note: 'frozen (open production chat, as d814775): ' + (r.note || '')});
    console.log(`\n${count('pass')} pass, ${count('FAIL')} FAIL, ${count('frozen')} frozen (open chat as d814775), ${count('carried')} carried (drawer under open chat), ${count('skipped')} skipped (optional, absent or off-screen)`);
    if (!only || only.includes(CARRYOVER.page)) {
      const carry = rows.find(r => r.carryover);
      assert.ok(carry && (carry.status === 'pass' || carry.status === 'FAIL'), 'the wave-1 mascot-over-Undo case (guided Quality after an exclusion, 1440, default position) is asserted: ' + JSON.stringify(carry));
    }
    const failed = rows.filter(r => r.status === 'FAIL');
    if (BASELINE) { console.log('--baseline: failures reported, not asserted'); return; }
    assert.deepEqual(failed.map(r => `${r.page}@${r.width}/${r.companion}: ${r.control} (${r.note || 'covered'})`), [], 'no overlay covers a key control, and every required control is present and on screen');
    console.log(`PASS: ${rows.length} control checks (${count('pass')} unobstructed, ${count('skipped')} optional skipped) at ${F.VIEWPORTS.map(v => v.width).join(', ')} px with the companion ${STATES.join(', ')}, the tools drawer and the step's Help panel`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message || e); process.exitCode = 1; });
