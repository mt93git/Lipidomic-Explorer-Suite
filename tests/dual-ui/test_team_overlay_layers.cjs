// Run with: node tests/dual-ui/test_team_overlay_layers.cjs [case,case,...] [--baseline] [--no-tokens]
// Overlay inventory for the Team frontend, one z-index scale (www/team/css/qw_layers.css).
// Every overlay is opened with its real opening code wherever the fixture can run it, at 1280, 1440
// and 390 px, with the Canvas normal and expanded (#team-canvas-root.tc-focus-mode, a fixed full-screen
// layer); guided-flow overlays run on the guided Quality page. A case passes when document.elementFromPoint
// at the overlay's centre is inside the overlay and, where the real opener ran and the overlay takes focus,
// focus is inside it. An overlay whose centre is below the fold is first scrolled into view (n/a when it
// cannot be). Overlays that a branch does not have yet (wave 2: tools drawer R10, colour popover
// R12, mobile step menu R13) are reported as
// "absent", so this runs on every branch. Coexistence cases open two layers together.
// FIXR3B item 5: "absent" and "n/a" never hide a wired overlay. Each case names the script that owns it
// (code); when the fixture loads that script on the case's page (the Team wiring, fixture_team_overlay_pages.cjs
// assets()), an overlay that does not show, does not open, or cannot be scrolled into view FAILS. Only reasons
// that hold by design stay n/a (the phone step menu above 600 px; the disclosure the drawer replaces).
// --baseline prints the table and exits 0 even with failures (for a before/after record);
// --no-tokens leaves qw_layers.css out to check the var() fallbacks alone.
// Fixtures: tests/dual-ui/fixture_team_overlay_pages.cjs. Screenshots: set OVL_SHOTS=<dir>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');

const NO_TOKENS = process.argv.includes('--no-tokens');
const BASELINE = process.argv.includes('--baseline');
const SHOTS = process.env.OVL_SHOTS ? path.resolve(process.env.OVL_SHOTS) : null;
const CANVAS_JS = fs.readFileSync(path.resolve('www/team/js/canvas.js'), 'utf8');
const INSTANCE_CSS = (CANVAS_JS.match(/instanceStyle\.textContent='([^']*)'/) || [])[1];
assert.ok(INSTANCE_CSS && INSTANCE_CSS.includes('.tc-instance-host.is-open{'), 'canvas.js still styles the instance panel inline');

// focus: true when the real opener ran and the overlay should own focus; false when it takes no focus;
// a string when the opener cannot run in this fixture (focus is then not asserted).
const SERVER = 'n/c (server-side opener)';
const VENDOR_OPENER = 'n/c (vendor opener: Bootstrap/colourpicker)';
const NOT_ASSERTED = '- (not asserted)';
// byDesign: the reason holds whatever is wired (a width the overlay is not offered at, a replaced overlay).
const na = (reason, byDesign) => ({na: reason, byDesign: !!byDesign});
const absent = (what, byDesign) => ({absent: what, byDesign: !!byDesign});
// The fixture loads `key` (e.g. 'js/tools_drawer.js') on a page of this mode ('guided' or 'workspace').
const loaded = (key, mode) => F.assets(mode, key.split('/')[0]).includes('www/team/' + key);
const modeOf = page => page === 'guided' ? 'guided' : 'workspace';
// A not-shown result that hides a wired overlay: the case FAILS instead.
const hidesWired = (c, opened, mode) => !opened.byDesign && (!c.code || loaded(c.code, mode));

// Marks the element a dynamic opener produced; the probe then targets [data-ovl-target].
function markScript() {
  return `window.__ovlMark=function(n){document.querySelectorAll('[data-ovl-target]').forEach(function(x){x.removeAttribute('data-ovl-target');});if(n)n.setAttribute('data-ovl-target','');return !!n;};
    window.__ovlShown=function(n){return !!n&&!n.hidden&&!n.closest('[hidden]')&&n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden';};`;
}
const helpers = page => page.addScriptTag({content: markScript()});
async function firstShown(page, selectors) {
  return page.evaluate(list => list.find(s => window.__ovlShown(document.querySelector(s))) || null, selectors);
}
async function clickFirst(page, selectors, done, timeout = 2000) {
  for (const sel of selectors) {
    if (!await page.evaluate(s => window.__ovlShown(document.querySelector(s)), sel)) continue;
    await page.evaluate(s => document.querySelector(s).click(), sel);
    if (await page.waitForFunction(done, null, {timeout}).then(() => true, () => false)) return sel;
  }
  return null;
}

// Analysis tools through the real shell toolbar button (RC1's "Analysis tools", which opens the R10 drawer).
// On phones (<= 600 px, canvas_header.css) the button is offered in ⋯ as "Analysis tools…".
const ANALYSIS_TRIGGER = '#team-canvas-root .ts-tools .ts-analysis-trigger';
async function analysisToolsFromToolbar(page) {
  if (await page.evaluate(s => window.__ovlShown ? window.__ovlShown(document.querySelector(s)) : document.querySelector(s).getClientRects().length > 0, ANALYSIS_TRIGGER)) { await page.locator(ANALYSIS_TRIGGER).click(); return; }
  await page.locator('#team-canvas-root .ts-more > .ts-menu-trigger').click();
  await page.locator('#team-canvas-root .ts-more .ts-menu-item', {hasText: 'Analysis tools…'}).click();
}
const hasDrawer = () => loaded('js/tools_drawer.js', 'workspace');
const hasSwatches = () => F.wired().some(a => a.key === 'js/palette_swatches.js' && F.exists(a.rel));

function shinyModal(body) {
  return `<div id="shiny-modal-wrapper"><div id="shiny-modal" class="modal fade show" tabindex="-1" role="dialog" aria-modal="true" style="display:block">
    <div class="modal-dialog modal-lg" role="document"><div class="modal-content">
      <div class="modal-header"><h4 class="modal-title">Colors &amp; palettes</h4></div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer"><button type="button" class="btn btn-default" data-dismiss="modal" data-bs-dismiss="modal">Close</button></div>
    </div></div></div></div>`;
}
// What showModal(modalDialog(...)) inserts for input$open_palette_editor (R/modules/1_shared_data_module.R,
// palette_color_field()), trimmed to one colour field; Bootstrap adds the backdrop to <body>.
const PALETTE_BODY = `<div class="palette-editor"><p class="text-muted">Choose a palette, then click any color to make it your own.</p><h5>Fine-tune colors</h5>
  <div class="palette-color-field" data-palette-label="Control"><span class="palette-color-label">Control</span><div class="palette-color-control">
    <button type="button" class="palette-swatch-button" style="--palette-color:#2166AC" aria-label="Choose color for Control current color #2166AC" aria-haspopup="dialog" aria-expanded="false"><span class="palette-swatch-mark" aria-hidden="true"></span><span>Choose color</span></button>
    <div class="palette-color-input"><div class="form-group shiny-input-container"><div class="input-group colourpicker-input-container" style="position:relative">
      <input id="data_hub-color_Control" type="text" class="form-control colourpicker-input" value="#2166AC" aria-label="Control colour">
      <div class="colourpicker-panel" style="display:none;position:absolute;left:0;top:100%;width:220px;height:180px;background:#fff;border:1px solid #888">
        <button type="button" class="colourpicker-pick">Pick #2166AC</button></div></div></div></div></div></div>
  <button id="data_hub-btn_apply_colors" type="button" class="btn btn-primary action-button">Apply color changes</button></div>`;
async function openPaletteModal(page, pickerOpen) {
  await page.evaluate(([html, pickerOpen]) => {
    document.body.insertAdjacentHTML('beforeend', html);
    const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop fade show'; document.body.appendChild(backdrop);
    document.body.classList.add('modal-open');
    // The colourpicker library is not in this fixture: its panel is shown directly.
    if (pickerOpen) document.querySelector('#shiny-modal .colourpicker-panel').style.display = 'block';
  }, [shinyModal(PALETTE_BODY), pickerOpen]);
}

async function zoomOutUntilMinimap(p) {
  for (let i = 0; i < 4; i++) await p.evaluate(() => document.querySelector('#team-canvas-root .tc-zoom-out').click());
  await p.waitForFunction(() => !document.querySelector('#team-canvas-root .tc-navigation').classList.contains('tc-map-off'));
}
// The drawer from the trigger a person can reach on this page: the guided step bar's "All analysis
// tools" (workspace.css hides that bar in the Team workspace), the Canvas toolbar's Analysis tools (Draft only), else the
// Canvas tabs' visually hidden "All analysis tools (advanced)" summary, reached with the keyboard
// (the Figure page). Returns the route used.
async function openDrawerShown(p) {
  const opened = () => p.waitForFunction(() => !document.getElementById('team-tools-drawer').hidden, null, {timeout: 3000}).then(() => true, () => false);
  const step = '#guide-navigation .guide-global-actions button[data-guide-step="5"]';
  if (await p.evaluate(s => window.__ovlShown(document.querySelector(s)), step)) { await p.locator(step).click(); if (await opened()) return 'step bar'; }
  if (await p.evaluate(s => window.__ovlShown(document.querySelector(s)), ANALYSIS_TRIGGER)) { await analysisToolsFromToolbar(p); if (await opened()) return 'toolbar Analysis tools'; }
  const summary = '.tw-canvas-tabs details > summary[data-ttd-trigger]';
  if (await p.evaluate(s => !!document.querySelector(s), summary)) { await p.focus(summary); await p.keyboard.press('Enter'); if (await opened()) return 'Canvas tabs summary (keyboard)'; }
  throw new Error('no Analysis tools trigger opened the drawer');
}

// ---- The overlays -------------------------------------------------------------------------------------
// page: 'canvas' runs normal and expanded; 'guided' runs on the guided Quality page with a pending change.
// open() leaves the overlay open with its real opening code; it may return na(reason) (not shown at this
// width/mode) or absent(what) (not on this branch). target null means open() marked [data-ovl-target].
const OVERLAYS = [
  // Companion, as in production (d814775): the floating character's chat docks over the Canvas inspector
  // column (companion_assistant.js position()).
  {name: 'companion-docked', page: 'canvas', code: 'js/companion_assistant.js', target: null, focus: true, open: async (p, vp) => {
    // At 600 px and below the chat is a bottom sheet, not docked (companion_assistant.js position()).
    if (vp.width <= 600) return na('phones: the chat opens as a bottom sheet (<= 600 px)', true);
    const used = await F.openCompanionChat(p);
    if (!used) return na('no companion opener is shown');
    const docked = await p.evaluate(() => {
      const c = document.querySelector('#team-canvas-root .ts-inspector-column'), panel = document.getElementById('lipidomic-assistant-panel');
      if (window.__ovlShown(c) && window.__ovlShown(panel) && Math.abs(panel.getBoundingClientRect().left - c.getBoundingClientRect().left) < 2) return window.__ovlMark(panel);
      return false;
    });
    return docked ? {note: 'opened by ' + used} : na('the chat does not dock here (it floats)');
  }},
  // Floating: the character and its chat on the Figure page (the Draft dock is not used there).
  // context_help.js avoidance only shrinks the character (.is-yielding keeps its launcher shown): with a
  // character chosen it is always shown here.
  {name: 'companion-floating', page: 'canvas', code: 'js/context_help.js', target: '#lipidomic-companion', focus: false, open: async p => {
    await F.figurePage(p);
    return await p.evaluate(() => window.__ovlShown(document.getElementById('lipidomic-companion'))) ? null : na('the character is not shown on the Figure page');
  }},
  {name: 'companion-floating-chat', page: 'canvas', code: 'js/context_help.js', target: '#lipidomic-assistant-panel', focus: true, open: async p => {
    await F.figurePage(p);
    const used = await F.openCompanionChat(p);
    return used ? {note: 'opened by ' + used} : na('no companion opener is shown');
  }},
  {name: 'companion-settings', page: 'canvas', code: 'js/context_help.js', target: '#lipidomic-help-panel', focus: true, open: async p => {
    const settings = ['#lipidomic-companion .companion-settings', '.help-bar-settings'];
    const done = () => window.__ovlShown(document.getElementById('lipidomic-help-panel'));
    const used = await clickFirst(p, settings, done);
    return used ? {note: 'opened by ' + used} : na('no companion settings control is shown');
  }},
  // Analysis tools: the R10 drawer, or the base "All analysis tools" disclosure it replaces.
  {name: 'tools-drawer', page: 'canvas', code: 'js/tools_drawer.js', target: '#team-tools-drawer', focus: true, open: async p => {
    if (!hasDrawer()) return absent('tools drawer (R10): www/team/js/tools_drawer.js is not on this branch');
    await analysisToolsFromToolbar(p);
    await p.waitForFunction(() => !document.getElementById('team-tools-drawer').hidden);
  }},
  {name: 'analysis-tools-disclosure', page: 'canvas', target: '.tw-canvas-tabs details[open]', focus: true, open: async p => {
    if (hasDrawer()) return absent('replaced by the tools drawer (R10)', true);
    await analysisToolsFromToolbar(p);
    await p.waitForFunction(() => document.querySelector('.tw-canvas-tabs details[open]'));
  }},
  // Select a card, then Properties (canvas_inspector.js select(node, true) moves focus to its first control).
  {name: 'inspector', page: 'canvas', target: '#tc-selection-inspector', focus: true, open: async p => {
    await p.locator('#team-canvas-root .tc-node').first().dispatchEvent('click');
    await p.waitForFunction(() => !document.getElementById('tc-selection-inspector').hidden);
    await p.evaluate(() => document.querySelector('.tc-properties-toggle').click());
    await p.waitForFunction(() => document.getElementById('tc-selection-inspector').hidden);
    await p.evaluate(() => document.querySelector('.tc-properties-toggle').click());
    await p.waitForFunction(() => !document.getElementById('tc-selection-inspector').hidden);
  }},
  {name: 'palette-modal', page: 'canvas', target: '#shiny-modal .modal-content', hitTarget: ['#shiny-modal'], focus: SERVER, open: p => openPaletteModal(p, false)},
  {name: 'palette-modal-backdrop', page: 'canvas', target: '.modal-backdrop', focus: false, hitTarget: ['.modal-backdrop', '#shiny-modal'], point: 'corner', open: p => openPaletteModal(p, false)},
  // R12: the colour popover inside the palettes modal, opened by the swatch (palette_editor.js). Found as a
  // new visible popover/dialog/grid inside the modal; the vendor colourpicker is not in the fixture.
  {name: 'colour-popover', page: 'canvas', code: 'js/palette_swatches.js', target: null, focus: NOT_ASSERTED, open: async p => {
    await openPaletteModal(p, false);
    await p.evaluate(() => document.querySelector('#shiny-modal .palette-swatch-button').click());
    await p.waitForTimeout(150);
    const found = await p.evaluate(() => {
      const modal = document.getElementById('shiny-modal');
      const hit = Array.from(modal.querySelectorAll('[role="dialog"],[role="listbox"],[class*="popover"],[class*="colour-grid"],[class*="color-grid"],[class*="swatch-grid"]'))
        .filter(n => n !== modal && !n.closest('.colourpicker-panel,.modal-dialog > .modal-content > .modal-header') && !n.classList.contains('modal-dialog') && window.__ovlShown(n));
      const outer = hit.find(n => !hit.some(m => m !== n && m.contains(n)));
      return outer ? window.__ovlMark(outer) : false;
    });
    if (found) return null;
    // Absent only when the branch does not have R12. With R12 wired (palette_swatches.js registered in the
    // Team UI) a swatch that opens nothing is a broken overlay, not a missing one (Astra 7, Sol 6).
    if (hasSwatches()) throw new Error('colour popover (R12): palette_swatches.js is wired but the swatch opened no popover inside the modal');
    return absent('colour popover (R12): palette_swatches.js is not on this branch');
  }},
  {name: 'colour-picker-vendor', page: 'canvas', target: '#shiny-modal .colourpicker-panel', focus: VENDOR_OPENER, open: p => openPaletteModal(p, true)},
  // An independent card copy's Data & settings panel: R inserts the host on <body>
  // (R/frontends/team/plot_instances.R) and canvas.js styles it; the rule is read from canvas.js.
  {name: 'instance-panel', page: 'canvas', target: '.tc-instance-host.is-open', focus: SERVER, open: async p => {
    await p.addStyleTag({content: INSTANCE_CSS});
    await p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="tcinstance_1_host" class="tc-instance-host is-open" style="left:20px;top:140px;width:340px;height:420px"><div class="tc-instance-panel-head"><strong>Data &amp; settings · PCA</strong><button type="button">Done</button></div><label>Group <select><option>Condition</option></select></label></div>'));
  }},
  {name: 'minimap', page: 'canvas', target: '#team-canvas-root .tc-map svg', focus: false, open: zoomOutUntilMinimap},
  {name: 'canvas-more-menu', page: 'canvas', target: '#team-canvas-root .ts-more .ts-menu', focus: true, open: async p => {
    await p.locator('#team-canvas-root .ts-more .ts-menu-trigger').click();
    await p.waitForFunction(() => document.activeElement && document.activeElement.closest('.ts-more .ts-menu'));
  }},
  // The Canvas-tab ⋯ menu (canvas_tabs.js menuButton()).
  {name: 'canvas-tab-menu', page: 'canvas', code: 'js/canvas_tabs.js', target: '#team-canvas-root .tc-canvas-tab-actions', focus: true, open: async p => {
    // The fixture now loads canvas_tabs_model.js before canvas_tabs.js (as the app does), so the strip mounts:
    // no waiver. If the trigger is not shown, the wired-overlay rule turns this into a FAIL.
    if (!await p.evaluate(() => window.__ovlShown(document.querySelector('#team-canvas-root .tc-canvas-tab-more')))) return absent('the Tab actions trigger is not shown');
    await p.locator('#team-canvas-root .tc-canvas-tab-more').click();
    await p.waitForFunction(() => !document.querySelector('#team-canvas-root .tc-canvas-tab-actions').hidden);
  }},
  // Keyboard: focus a card, then Tab into its action toolbar.
  {name: 'card-actions', page: 'canvas', target: '#team-canvas-root .tc-card-actions', focus: true, open: async p => {
    await p.locator('#team-canvas-root .tc-node').first().focus(); await p.keyboard.press('Tab');
    await p.waitForFunction(() => document.activeElement && document.activeElement.closest('.tc-card-actions'));
    await p.waitForTimeout(150);
  }},
  // card_status.js shows the notice when its text changes. It ignores the pointer (by design); turn that
  // off here only to hit-test its layer.
  {name: 'status-notice', page: 'canvas', target: '#team-canvas-root .tc-status', focus: false, open: async p => {
    await p.evaluate(() => { const s = document.querySelector('#team-canvas-root .tc-status'); s.textContent = 'Plot added. Drag a header to move it.'; s.style.pointerEvents = 'auto'; });
    await p.waitForFunction(() => document.querySelector('#team-canvas-root .tc-status').classList.contains('is-visible'), null, {timeout: 2000}).catch(() => {});
  }},
  {name: 'global-wait-strip', page: 'canvas', target: '#team-canvas-root .tc-global-wait', focus: false,
    open: p => p.evaluate(() => { document.querySelector('#team-canvas-root .tc-global-wait').hidden = false; })},
  {name: 'shiny-notification', page: 'canvas', target: '#shiny-notification-panel .shiny-notification', focus: false,
    open: p => p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="shiny-notification-panel"><div id="shiny-notification-n1" class="shiny-notification shiny-notification-warning"><div class="shiny-notification-content"><div class="shiny-notification-content-text">Figure saved to your workspace.</div></div></div></div>'))},
  {name: 'toast-over-modal', page: 'canvas', target: '#shiny-notification-panel .shiny-notification', focus: false, open: async p => {
    await openPaletteModal(p, false);
    await p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="shiny-notification-panel"><div class="shiny-notification shiny-notification-error"><div class="shiny-notification-content">Could not apply colours.</div></div></div>'));
  }},

  // ---- Guided flow (Quality, one exclusion pending) ----
  // The guided page opens with a character chosen (opted in): it is shown.
  {name: 'guided-companion', page: 'guided', code: 'js/context_help.js', target: '#lipidomic-companion', focus: false, open: async p =>
    await p.evaluate(() => window.__ovlShown(document.getElementById('lipidomic-companion'))) ? null : na('the character is not shown (opt-in or hidden)')},
  {name: 'guided-companion-chat', page: 'guided', code: 'js/context_help.js', target: '#lipidomic-assistant-panel', focus: true, open: async p => {
    const used = await F.openCompanionChat(p);
    return used ? {note: 'opened by ' + used} : na('no companion opener is shown');
  }},
  // R13: the compact step bar's menu on phones (<= 600 px).
  {name: 'mobile-step-menu', page: 'guided', code: 'js/mobile_steps.js', target: null, focus: NOT_ASSERTED, open: async (p, vp) => {
    if (vp.width > 600) return na('phone layout only (<= 600 px)', true);
    const trigger = await p.evaluate(() => {
      const t = Array.from(document.querySelectorAll('#guide-navigation button[aria-haspopup],#guide-navigation button[aria-expanded][aria-controls]')).find(window.__ovlShown);
      if (!t) return null;
      t.setAttribute('data-ovl-trigger', ''); return true;
    });
    if (!trigger) return absent('mobile step menu (R13): no step-menu trigger in #guide-navigation on this branch');
    await p.evaluate(() => document.querySelector('[data-ovl-trigger]').click());
    await p.waitForTimeout(100);
    const found = await p.evaluate(() => {
      const t = document.querySelector('[data-ovl-trigger]'), id = t.getAttribute('aria-controls');
      const menu = (id && document.getElementById(id)) || Array.from(document.querySelectorAll('#guide-navigation [role="menu"],#guide-navigation [role="listbox"]')).find(window.__ovlShown);
      return window.__ovlShown(menu) ? window.__ovlMark(menu) : false;
    });
    if (!found) throw new Error('the step-menu trigger did not show a menu');
  }}
];

// ---- Coexistence: two layers at once. check() returns {ok, detail, focus}. ----------------------------
const COEXIST = [
  // RC2: the navigation box (minimap and zoom, bottom-left below 100% zoom) never covers a card's header or
  // action toolbar and is never hidden. Where its own place meets a card it moves to a free corner, or the
  // canvas reserves a band for it. A card is placed at the box's own place and selected with a real click;
  // then the box has moved (or reserved its band), no card header or toolbar on screen meets it, it stays
  // shown with a control on top and focusable, and the selected card's badge and toolbar are reachable.
  {name: 'selected-card-under-minimap', focus: '-', setup: {expand: true},
    open: async p => {
      await zoomOutUntilMinimap(p);
      // Place the second card (a position is data, not an opener) so its header lies where the box is.
      await p.evaluate(() => {
        const s = document.querySelector('#team-canvas-root .tc-scroll'), sr = s.getBoundingClientRect(), nr = document.querySelector('#team-canvas-root .tc-navigation').getBoundingClientRect(), z = TeamCanvasViewport.scale, n = document.querySelector('.tc-node[data-plot-id="p2"]');
        n.style.left = Math.round((nr.left + 24 - sr.left + s.scrollLeft) / z) + 'px'; n.style.top = Math.round((nr.top + 40 - sr.top + s.scrollTop) / z) + 'px';
      });
      await F.frames(p); await F.settle(p);
      // The box has moved, or its band has pushed the card down: bring the header into view, then click a
      // part of it that is no control (a button there would act instead of selecting).
      const pt = await p.evaluate(() => {
        const head = document.querySelector('.tc-node[data-plot-id="p2"] .tc-node-head');
        head.scrollIntoView({block: 'nearest', inline: 'nearest'});
        const r = head.getBoundingClientRect();
        for (let i = 1; i < 24; i++) {
          const x = r.left + r.width * i / 24, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
          if (hit && head.contains(hit) && !hit.closest('button,a,input,select,textarea,[role="button"],.tc-card-status,.tc-card-actions')) return {x, y};
        }
        return null;
      });
      if (!pt) throw new Error('no free point on the card header to click');
      await p.mouse.click(pt.x, pt.y);
      await p.waitForFunction(() => document.querySelector('.tc-node[data-plot-id="p2"]').classList.contains('is-selected'), null, {timeout: 5000});
      await F.frames(p);
      // RC4 paints the card actions as a footer (Edit · Duplicate · ⋯) at the card's bottom edge, which
      // can sit below the visible canvas when the header is at the box's place: scroll it into view as a
      // person would; the box then re-places itself clear of the footer too.
      await p.evaluate(() => { const foot = document.querySelector('.tc-node[data-plot-id="p2"] .tc-card-foot') || document.querySelector('.tc-node[data-plot-id="p2"] .tc-card-actions'); if (foot) foot.scrollIntoView({block: 'nearest', inline: 'nearest'}); });
      await F.frames(p); await F.settle(p);
    },
    check: p => p.evaluate(() => {
      const n = document.querySelector('.tc-node[data-plot-id="p2"]'), nav = document.querySelector('#team-canvas-root .tc-navigation');
      const scroll = document.querySelector('#team-canvas-root .tc-scroll').getBoundingClientRect();
      const describe = el => el && (el.id || el.getAttribute('class') || el.tagName);
      const shown = el => { if (!el) return false; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const meets = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const at = sel => { const el = n.querySelector(sel); if (!el) return {missing: sel}; const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y); return {x: Math.round(x), y: Math.round(y), inside: !!hit && n.contains(hit), hit: describe(hit)}; };
      const b = nav.getBoundingClientRect();
      // Every card header and shown action toolbar, clipped to the visible canvas, stays clear of the box.
      const covered = [];
      document.querySelectorAll('#team-canvas-root .tc-node:not(.tc-tab-hidden)').forEach(card => {
        [card.querySelector(':scope > .tc-node-head'), card.querySelector('.tc-card-actions'), card.querySelector(':scope > .tc-card-foot')].forEach(part => {
          if (!shown(part)) return;
          const r = part.getBoundingClientRect(), c = {left: Math.max(r.left, scroll.left), top: Math.max(r.top, scroll.top), right: Math.min(r.right, scroll.right), bottom: Math.min(r.bottom, scroll.bottom)};
          if (c.left < c.right && c.top < c.bottom && meets(c, b)) covered.push(card.dataset.plotId + ' ' + String(part.className).split(/\s+/)[0]);
        });
      });
      const mapShown = !nav.classList.contains('tc-map-off') && TeamCanvasViewport.scale < 1;
      const navShown = shown(nav) && b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight;
      // Moved to a free corner (.tc-nav-moved) or kept in a reserved band (.tc-nav-inset on the canvas shell).
      const dodged = nav.classList.contains('tc-nav-moved') || !!document.querySelector('.tc-nav-inset');
      // One of its controls (zoom, Reset, Fit) is on top and takes focus.
      const control = Array.from(nav.querySelectorAll('button')).find(x => shown(x) && !x.disabled);
      let controlOk = false, controlHit = null;
      if (control) {
        const r = control.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), before = document.activeElement;
        controlHit = describe(hit);
        control.focus({preventScroll: true}); controlOk = !!hit && control.contains(hit) && document.activeElement === control;
        if (before && before !== document.body && before.focus) before.focus({preventScroll: true}); else control.blur();
      }
      // RC4's footer Edit (the first footer action); the whole action bar before RC4.
      const badge = at('.tc-card-status'), actions = at(n.querySelector('.tc-card-edit') ? '.tc-card-edit' : '.tc-card-actions');
      // A badge that is not drawn on this branch is not a failure of the layers.
      const badgeOk = badge.missing ? true : badge.inside;
      return {ok: mapShown && navShown && dodged && !covered.length && controlOk && badgeOk && actions.inside,
        detail: {mapShown, navShown, dodged, covered, control: control && (control.getAttribute('aria-label') || control.textContent.trim()), controlOk, controlHit, scale: TeamCanvasViewport.scale, badge, actions}};
    })},
  // Figure page, not expanded: the floating companion chat is open, then Analysis tools opens (from the
  // trigger shown there, see openDrawerShown). One right-side panel at a time (tools_drawer.js, R10): the
  // chat closes, the drawer is on top and holds focus, and no part of a shown chat is under the drawer
  // (chatUncovered must be 100%).
  {name: 'drawer-with-floating-chat', focus: true, setup: {expand: false},
    absent: () => hasDrawer() ? null : 'tools drawer (R10) is not on this branch',
    open: async p => {
      await F.figurePage(p);
      if (!await F.openCompanionChat(p)) throw new Error('no companion opener is shown');
      return {note: 'drawer opened by the ' + await openDrawerShown(p)};
    },
    check: p => p.evaluate(() => {
      const d = document.getElementById('team-tools-drawer'), c = document.getElementById('lipidomic-assistant-panel');
      const vis = el => { const r = el.getBoundingClientRect(); return !el.hidden && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const own = (el, x, y) => { const hit = document.elementFromPoint(x, y); return !!hit && el.contains(hit); };
      const centre = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
      const dr = d.getBoundingClientRect(), cr = c.getBoundingClientRect(), chatShown = vis(c);
      // Share of the chat that is not under the drawer (sampled on a 10x10 grid); a closed chat has nothing covered.
      let covered = 0;
      if (chatShown) for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { const x = cr.left + cr.width * (i + .5) / 10, y = cr.top + cr.height * (j + .5) / 10; if (!own(c, x, y) && own(d, x, y)) covered++; }
      const chatUncovered = 100 - covered;
      const a = document.activeElement, focus = !!a && d.contains(a);
      const launcher = document.querySelector('#lipidomic-companion .companion-launcher');
      // The chat is frozen as in production: opening the drawer leaves it as it is; the drawer must not cover it.
      return {ok: vis(d) && own(d, ...centre(d)) && chatUncovered === 100 && focus, focus,
        detail: {drawer: vis(d), chatShown, chatUncovered: chatUncovered + '%', drawerRect: [dr.left, dr.top, dr.right, dr.bottom].map(Math.round), launcherExpanded: launcher && launcher.getAttribute('aria-expanded'), focused: a && (a.className || a.tagName)}};
    })},
  // The reverse (R10): the drawer is open on the Figure page and the floating chat opens through its API
  // (the route the speech bubble and tips use, no click outside the drawer): the drawer closes and the
  // chat holds focus with its Close, input and Send uncovered.
  {name: 'floating-chat-closes-drawer', code: 'js/context_help.js', focus: true, setup: {expand: false},
    absent: () => hasDrawer() ? null : 'tools drawer (R10) is not on this branch',
    open: async p => {
      await F.figurePage(p);
      const route = await openDrawerShown(p);
      if (!await p.evaluate(() => window.__ovlShown(document.querySelector('#lipidomic-companion .companion-launcher')))) return na('the floating character is not shown here');
      await p.evaluate(() => LipidomicAssistant.open(document.querySelector('#lipidomic-companion .companion-launcher')));
      await p.waitForFunction(() => document.activeElement && document.activeElement.matches('#lipidomic-assistant-panel .assistant-chat-input'));
      return {note: 'drawer opened by the ' + route};
    },
    check: p => p.evaluate(() => {
      const d = document.getElementById('team-tools-drawer');
      const free = s => { const n = document.querySelector('#lipidomic-assistant-panel ' + s); if (!n) return false; const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && n.contains(hit); };
      const controls = {close: free('.assistant-close'), input: free('.assistant-chat-input'), send: free('.assistant-send')};
      const a = document.activeElement, focus = !!a && a.matches('#lipidomic-assistant-panel .assistant-chat-input');
      const expanded = Array.from(document.querySelectorAll('[data-ttd-trigger]')).map(t => t.getAttribute('aria-expanded'));
      return {ok: d.hidden && controls.close && controls.input && controls.send && focus && expanded.every(v => v === 'false'),
        focus, detail: {drawerHidden: d.hidden, controls, triggersExpanded: expanded, focused: a && (a.className || a.tagName)}};
    })},
  // Companion settings over an open drawer (expanded Draft). A click outside the drawer may close it; if it
  // is still open, the settings must be above it where they overlap.
  {name: 'settings-over-drawer', focus: true, setup: {expand: true},
    absent: () => hasDrawer() ? null : 'tools drawer (R10) is not on this branch',
    open: async p => {
      await analysisToolsFromToolbar(p);
      await p.waitForFunction(() => !document.getElementById('team-tools-drawer').hidden);
      // The floating character's ⚙ (context_help.js, as in d814775).
      if (!await clickFirst(p, ['#lipidomic-companion .companion-settings'], () => window.__ovlShown(document.getElementById('lipidomic-help-panel'))))
        throw new Error('no companion settings control is shown');
    },
    check: p => p.evaluate(() => {
      const d = document.getElementById('team-tools-drawer'), s = document.getElementById('lipidomic-help-panel');
      const own = (el, x, y) => { const hit = document.elementFromPoint(x, y); return !!hit && el.contains(hit); };
      const sr = s.getBoundingClientRect(), dr = d.getBoundingClientRect(), drawerOpen = !d.hidden && dr.width > 0;
      const ix = [Math.max(dr.left, sr.left), Math.max(dr.top, sr.top), Math.min(dr.right, sr.right), Math.min(dr.bottom, sr.bottom)];
      const overlap = drawerOpen && ix[0] < ix[2] && ix[1] < ix[3];
      const settingsOnTop = own(s, sr.left + sr.width / 2, sr.top + sr.height / 2) && (!overlap || own(s, (ix[0] + ix[2]) / 2, (ix[1] + ix[3]) / 2));
      const a = document.activeElement, focus = !!a && s.contains(a);
      const c = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2), under = c && !s.contains(c) ? (c.closest('[id]') ? '#' + c.closest('[id]').id + ' ' : '') + (c.className && c.className.baseVal === undefined ? String(c.className) : c.tagName) : null;
      return {ok: settingsOnTop && focus, focus, detail: {drawerStillOpen: drawerOpen, overlap, settingsOnTop, under, focused: a && (a.id || a.className || a.tagName)}};
    })}
];

// elementFromPoint only sees the viewport. An overlay whose centre is below the fold (phones: the
// inspector, the docked companion and the minimap sit under the canvas) is scrolled into view first, as a
// person would do. Returns 'scrolled', 'off-screen' (still outside the viewport after scrolling) or null.
async function bringIntoView(page, o) {
  if (o.point === 'corner') return null;
  const sel = o.target || '[data-ovl-target]';
  const inView = () => page.evaluate(sel => {
    const el = document.querySelector(sel); if (!el) return true;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
  }, sel);
  if (await inView()) return null;
  await page.evaluate(sel => document.querySelector(sel).scrollIntoView({block: 'center', inline: 'center'}), sel);
  await F.frames(page); await F.settle(page);
  return await inView() ? 'scrolled' : 'off-screen';
}

async function probe(page, o) {
  return page.evaluate(([sel, hitSel, point]) => {
    const el = document.querySelector(sel);
    if (!el) return {missing: true};
    const r = el.getBoundingClientRect();
    const x = point === 'corner' ? 8 : r.left + r.width / 2, y = point === 'corner' ? 8 : r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const owners = (hitSel || [sel]).map(s => document.querySelector(s)).filter(Boolean);
    const describe = n => n ? (n.id ? '#' + n.id : n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '')) : null;
    const chain = [];
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const z = getComputedStyle(a).zIndex; if (z !== 'auto') chain.push(describe(a) + ':' + z); }
    const a = document.activeElement;
    return {visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden', x: Math.round(x), y: Math.round(y),
      onTop: !!hit && owners.some(n => n.contains(hit)), hit: describe(hit), zChain: chain,
      focusInside: !!a && a !== document.body && owners.some(n => n.contains(a)), focused: describe(a)};
  }, [o.target || '[data-ovl-target]', o.hitTarget, o.point]);
}

// Wiring (checked after the cases, so a run on old CSS still reports each case): the scale is defined
// once, in qw_layers.css, which the Team head links right after qw_a11y.css.
function checkWiring() {
  const teamUi = fs.readFileSync('R/frontends/team/ui.R', 'utf8');
  assert.ok(teamUi.includes('includeCSS("www/team/css/qw_a11y.css"), includeCSS("www/team/css/qw_layers.css")'), 'qw_layers.css is linked after qw_a11y.css in R/frontends/team/ui.R');
  const teamCss = fs.readdirSync('www/team/css').filter(f => f.endsWith('.css')).map(f => [f, fs.readFileSync(path.join('www/team/css', f), 'utf8')]);
  const defining = teamCss.filter(([, text]) => /--z-canvas-expanded\s*:/.test(text)).map(([f]) => f);
  assert.deepEqual(defining, ['qw_layers.css'], 'the overlay scale is defined in exactly one file');
  // Every use of a layer token carries its number as the var() fallback (the rule of qw_layers.css).
  const scale = Object.fromEntries([...fs.readFileSync('www/team/css/qw_layers.css', 'utf8').matchAll(/(--z-[\w-]+)\s*:\s*(\d+)/g)].map(m => [m[1], m[2]]));
  for (const [file, text] of teamCss.concat(fs.readdirSync('www/team/js').filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(path.join('www/team/js', f), 'utf8')])))
    for (const m of text.matchAll(/var\((--z-[\w-]+)(?:\s*,\s*([^)]*))?\)/g)) {
      assert.ok(m[1] in scale, `${file}: ${m[1]} is a qw_layers.css token`);
      assert.equal((m[2] || '').trim(), scale[m[1]], `${file}: var(${m[1]}) repeats ${scale[m[1]]} as its fallback`);
    }
  // Which Team stylesheets use the scale (informational; see UX_RESULT_OVL.md for the inventory).
  return teamCss.filter(([, text]) => /var\(--z-/.test(text)).map(([f]) => f);
}

function shot(page, name) {
  if (!SHOTS || NO_TOKENS) return Promise.resolve();
  return page.screenshot({path: path.join(SHOTS, `${name}.png`)}).catch(e => { console.log(`  (no screenshot for ${name}: ${String(e.message || e).split('\n')[0]})`); });
}

(async () => {
  if (SHOTS) try { fs.mkdirSync(SHOTS, {recursive: true}); } catch (e) { console.log(`(screenshots disabled: ${e.code || e.message})`); }
  const names = process.argv.slice(2).find(a => !a.startsWith('--'));
  const only = names ? names.split(',') : null;
  const browser = await chromium.launch({headless: true});
  const results = [], warnings = [];
  try {
    const page = await browser.newPage({viewport: F.VIEWPORTS[0]});
    page.on('pageerror', e => warnings.push(e.message));
    await F.install(page);
    const setup = async (kind, opts) => {
      if (kind === 'guided') await F.setupGuided(page, 'quality-pending', {companion: 'default'});
      else {
        await F.setupWorkspace(page, {companion: 'default', ...opts});
        // ux27: the Canvas inspector opens hidden; these layers are checked with it shown, as the user's
        // Show inspector (the rail toggle) leaves it.
        const toggle = page.locator('#team-canvas-root .ts-rail .ts-inspector-toggle');
        if (await toggle.isVisible() && await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed'))) { await toggle.click(); await F.settle(page); }
      }
      if (NO_TOKENS) await page.evaluate(() => document.querySelectorAll('style').forEach(s => { if (/--z-canvas-expanded\s*:/.test(s.textContent)) s.remove(); }));
      await helpers(page);
    };
    for (const vp of F.VIEWPORTS) {
      await page.setViewportSize(vp);
      for (const o of OVERLAYS) {
        if (only && !only.includes(o.name)) continue;
        for (const mode of o.page === 'guided' ? ['guided'] : ['normal', 'expanded']) {
          const row = {kind: 'overlay', name: o.name, width: vp.width, mode};
          let r = {};
          try {
            await setup(o.page, {expand: mode === 'expanded'});
            const opened = (await o.open(page, vp)) || {};
            if (opened.absent || opened.na) {
              const why = opened.absent || opened.na;
              Object.assign(row, hidesWired(o, opened, modeOf(o.page)) ? {status: 'FAIL', note: `${o.code || 'its code'} is wired here, yet: ${why}`} : {status: opened.absent ? 'absent' : 'n/a', note: why});
              results.push(row); continue;
            }
            row.note = opened.note;
            await page.waitForTimeout(60); await F.settle(page);
            const view = await bringIntoView(page, o);
            // An open overlay that cannot be brought on screen is unreachable: a failure, not n/a.
            if (view === 'off-screen') { Object.assign(row, {status: 'FAIL', note: 'opened but below the fold: cannot be scrolled into view at this width'}); results.push(row); continue; }
            if (view) row.note = (row.note ? row.note + '; ' : '') + 'scrolled into view';
            r = await probe(page, o);
            await shot(page, `${o.name}-${mode}-${vp.width}`);
          } catch (e) { r = {error: String(e.message || e).split('\n')[0]}; }
          const expanded = o.page !== 'canvas' || mode !== 'expanded' || await page.evaluate(() => document.getElementById('team-canvas-root').classList.contains('tc-focus-mode')).catch(() => false);
          const focusAsserted = o.focus === true;
          const ok = !r.error && !r.missing && r.visible && r.onTop && (!focusAsserted || r.focusInside) && expanded;
          Object.assign(row, {status: ok ? 'pass' : 'FAIL', layer: !!r.onTop, hit: r.hit, zChain: r.zChain,
            focus: focusAsserted ? (r.focusInside ? 'held (real opener)' : 'LOST') : o.focus === false ? '- (takes no focus)' : o.focus});
          if (!ok) row.detail = {expandedHeld: expanded, ...r};
          results.push(row);
        }
      }
      for (const c of COEXIST) {
        if (only && !only.includes(c.name)) continue;
        const row = {kind: 'coexist', name: c.name, width: vp.width, mode: c.setup.expand ? 'expanded' : 'normal'};
        const why = c.absent && c.absent();
        if (why) { Object.assign(row, {status: 'absent', note: why}); results.push(row); continue; }
        let r;
        try {
          await setup('canvas', c.setup);
          const opened = (await c.open(page)) || {};
          if (opened.absent || opened.na) {
            const why = opened.absent || opened.na;
            Object.assign(row, hidesWired(c, opened, 'workspace') ? {status: 'FAIL', note: `${c.code || 'its code'} is wired here, yet: ${why}`} : {status: opened.absent ? 'absent' : 'n/a', note: why});
            results.push(row); continue;
          }
          row.note = opened.note;
          await page.waitForTimeout(60); await F.settle(page); r = await c.check(page); await shot(page, `coexist-${c.name}-${vp.width}`);
        } catch (e) { r = {ok: false, detail: {error: String(e.message || e).split('\n')[0]}}; }
        Object.assign(row, {status: r.ok ? 'pass' : 'FAIL', layer: !!r.ok, focus: c.focus === true ? (r.focus ? 'held (real opener)' : 'LOST') : c.focus, detail: r.detail});
        results.push(row);
      }
    }
// The mascot is frozen at production d814775 (Gerardo, 2026-11-04; wave2b-carryover.md). Its own
// stylesheets and behaviour are not changed by any wave, so results that come only from the mascot
// itself are reported as 'frozen (as d814775)', not as FAIL. A control the RESTING mascot covers still FAILS.
    // The mascot's settings panel (#lipidomic-help-panel, context_help.css z 1041) sits under the expanded
    // Canvas exactly as on d814775.
    for (const r of results) if (r.status === 'FAIL' && r.mode === 'expanded' && /^(companion-settings|settings-over-drawer)$/.test(r.name) && r.focus !== 'LOST' && !/setup|did not open|not shown|absent/i.test(r.note || '') && (/tc-focus-mode|team-canvas-root|ts-inspector|tc-node|tc-main|#p\d/.test(JSON.stringify(r.hit || '')) || (r.detail && r.detail.settingsOnTop === false && (r.detail.overlap === true || /tc-focus-mode|team-canvas-root|ts-inspector|tc-node|tc-main|tc-board|tc-scroll/.test(r.detail.under || ''))))) Object.assign(r, {status: 'frozen', note: 'frozen (as d814775): ' + (r.note || '')});
    const extra = F.extraAssets();
    console.log(`\nwave-2 assets loaded by the fixtures: ${extra.length ? extra.join(', ') : 'none (base)'}`);
    console.log('\nkind     case                         width mode      result  layering  focus / note');
    for (const r of results) console.log(`${r.kind.padEnd(8)} ${r.name.padEnd(28)} ${String(r.width).padEnd(5)} ${r.mode.padEnd(9)} ${r.status.padEnd(7)} ${String(r.layer === undefined ? '-' : r.layer).padEnd(9)} ${r.focus || ''}${r.note ? '  ' + r.note : ''}`);
    for (const r of results.filter(x => x.status === 'FAIL' || x.kind === 'coexist' && x.detail)) console.log(`  ${r.name} @${r.width} ${r.mode}: ${JSON.stringify(r.detail || {hit: r.hit, zChain: r.zChain})}`);
    if (warnings.length) console.log(`\nfixture page errors (not failures): ${JSON.stringify([...new Set(warnings)].slice(0, 12))}`);
    const count = s => results.filter(r => r.status === s).length;
    console.log(`\n${count('pass')} pass, ${count('FAIL')} FAIL, ${count('frozen')} frozen (mascot as d814775), ${count('absent')} absent (not on this branch), ${count('n/a')} n/a (not shown at that width/mode)`);
    const usesScale = NO_TOKENS ? [] : checkWiring();
    if (usesScale.length) console.log(`stylesheets on the qw_layers.css scale: ${usesScale.join(', ')}`);
    const failed = results.filter(r => r.status === 'FAIL');
    if (BASELINE) { console.log('--baseline: failures reported, not asserted'); return; }
    assert.deepEqual(failed.map(r => `${r.name}@${r.width}/${r.mode}`), [], 'every present overlay is on top where it opens, holds focus where its real opener ran, and coexists');
    console.log(`PASS: ${results.length} cases (${count('pass')} asserted, ${count('absent')} absent, ${count('n/a')} n/a); one scale in qw_layers.css`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message || e); process.exitCode = 1; });
