/* Team workspace shell: one top bar, icon rail, floating canvas toolbar and a
   fixed inspector column. Existing controls are reused in place or proxied by
   click; no Shiny input is created, renamed or removed here. */
(function () {
  'use strict';
  var ICONS = {
    plots: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/></svg>',
    text: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h10M9 4v10"/></svg>',
    illustrations: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="6"/><circle cx="9" cy="9" r="2"/></svg>',
    palettes: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="7" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="9" cy="12" r="2"/></svg>',
    cell: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 2l6 3.5v7L9 16l-6-3.5v-7z"/><path d="M3 5.5L9 9l6-3.5M9 9v7"/></svg>'
  };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function button(cls, label, onClick, html) {
    var b = el('button', cls); b.type = 'button';
    if (html) { b.innerHTML = html; b.setAttribute('aria-label', label); b.title = label; } else b.textContent = label;
    b.addEventListener('click', onClick); return b;
  }
  function proxy(selector, root) { var t = (root || document).querySelector(selector); if (t && !t.disabled) t.click(); return t; }
  function guideLink(text) {
    return Array.from(document.querySelectorAll('.tw-canvas-tabs .guide-button,.tw-canvas-tabs a,.tw-canvas-tabs button'))
      .find(function (b) { return b.textContent.trim() === text; });
  }

  // ---- Top bar --------------------------------------------------------------
  function mountTopbar() {
    var navbar = document.querySelector('.navbar');
    if (!navbar || navbar.querySelector('.ts-topbar-extras')) return !!navbar;
    var original = document.querySelector('#team-workspace .tw-steps');
    if (!original) return false;
    var name = navbar.querySelector('.guide-app-name'); if (name) name.textContent = 'Lipidomic Explorer';
    var extras = el('div', 'ts-topbar-extras');
    var project = button('ts-project', 'No project open', function () {
      var data = document.querySelector('#team-workspace [data-tw-stage="data"]');
      if (data && !data.disabled) data.click();
    });
    project.setAttribute('aria-label', 'Project. Open the project list in Data');
    // Step buttons, save state and sign out keep their DOM home in #team-workspace,
    // where workspace.js updates them. The bar shows mirrors that click the originals.
    var steps = el('nav', 'ts-steps'); steps.setAttribute('aria-label', 'Analysis steps');
    var mirrors = Array.from(original.querySelectorAll('[data-tw-stage]')).map(function (src) {
      var b = button('ts-step', '', function () { if (!src.disabled) src.click(); });
      b.dataset.stage = src.dataset.twStage;
      b.innerHTML = '<em aria-hidden="true"></em><span></span>';
      b.querySelector('span').textContent = (src.querySelector('strong') || src).textContent.trim();
      b.querySelector('em').textContent = (src.querySelector('span') || {}).textContent || '';
      steps.appendChild(b); return [src, b];
    });
    var right = el('div', 'ts-topbar-right');
    var saved = el('span', 'ts-saved'); saved.setAttribute('role', 'status'); saved.setAttribute('aria-live', 'polite');
    var signout = button('ts-signout', 'Sign out', function () { proxy('#team-workspace .tw-signout'); });
    var avatar = el('span', 'ts-avatar'); avatar.setAttribute('aria-hidden', 'true');
    right.append(saved, signout, avatar);
    extras.append(project, steps, right);
    (navbar.querySelector('.container-fluid') || navbar).appendChild(extras);
    var order = ['data', 'review', 'canvas'];
    function syncSteps() {
      var current = order.indexOf(document.body.dataset.teamStage || '');
      mirrors.forEach(function (pair, i) {
        var src = pair[0], b = pair[1], on = src.getAttribute('aria-current') === 'step', done = current > i;
        if (b.disabled !== src.disabled) b.disabled = src.disabled;
        b.classList.toggle('is-current', on); b.classList.toggle('is-done', done && !on);
        if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        var em = b.querySelector('em'), mark = done && !on ? '✓' : String(i + 1);
        if (em.textContent !== mark) em.textContent = mark;
        var label = src.getAttribute('aria-label');
        if (label) { if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label); } else b.removeAttribute('aria-label');
        // A step queued during a busy cycle shows the same pending state here.
        ['data-tw-queued', 'aria-busy', 'title'].forEach(function (name) { var v = src.getAttribute(name); if (v === null) b.removeAttribute(name); else if (b.getAttribute(name) !== v) b.setAttribute(name, v); });
      });
      var status = document.getElementById('team-autosave-status'), text = status ? status.textContent.trim() : '';
      if (saved.textContent !== text) saved.textContent = text;
      saved.hidden = !text;
      // Mirror the save state too, so errors and offline do not show a green dot.
      var state = status && status.getAttribute('data-state') || '';
      if (saved.dataset.state !== state) saved.dataset.state = state;
    }
    new MutationObserver(syncSteps).observe(original, { attributes: true, subtree: true, attributeFilter: ['aria-current', 'disabled', 'aria-label', 'data-tw-queued', 'aria-busy', 'title'] });
    var status = document.getElementById('team-autosave-status');
    if (status) new MutationObserver(syncSteps).observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    new MutationObserver(syncSteps).observe(document.body, { attributes: true, attributeFilter: ['data-team-stage'] });
    syncSteps();
    function sync() {
      var select = document.getElementById('team_library_project');
      var label = select && select.selectedIndex >= 0 && select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
      var authed = document.body.dataset.teamAuthenticated === 'true';
      project.textContent = authed && label ? label + ' ▾' : authed ? 'Choose a project ▾' : 'Not signed in';
      project.disabled = !authed;
      var email = (document.getElementById('team_library_email') || {}).value || '';
      avatar.textContent = authed && email ? email.trim().charAt(0).toUpperCase() : '';
      avatar.hidden = !avatar.textContent;
    }
    document.addEventListener('change', function (e) { if (e.target && e.target.id === 'team_library_project') sync(); });
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-team-authenticated', 'data-tw-screen'] });
    var lib = document.querySelector('.team-library'); if (lib) new MutationObserver(sync).observe(lib, { childList: true, subtree: true });
    sync();
    return true;
  }

  // ---- Canvas -----------------------------------------------------------------
  var menu = null;
  function closeMenus(except) { document.querySelectorAll('.ts-menu[data-open="true"]').forEach(function (m) { if (m !== except) { m.dataset.open = 'false'; var t = m.previousElementSibling; if (t) t.setAttribute('aria-expanded', 'false'); } }); }
  function menuButton(label, items, cls) {
    var wrap = el('div', 'ts-menu-wrap ' + (cls || ''));
    var trigger = button('ts-tool ts-menu-trigger', label, function (e) { e.stopPropagation(); var open = panel.dataset.open !== 'true'; closeMenus(panel); panel.dataset.open = String(open); trigger.setAttribute('aria-expanded', String(open)); if (open) { var first = Array.prototype.find.call(panel.querySelectorAll('button:not([disabled]),summary'), function (b) { return b.getClientRects().length; }); if (first) first.focus(); } });
    trigger.setAttribute('aria-haspopup', 'true'); trigger.setAttribute('aria-expanded', 'false');
    var panel = el('div', 'ts-menu'); panel.setAttribute('role', 'menu'); panel.dataset.open = 'false';
    items.forEach(function (item) { panel.appendChild(item); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { panel.dataset.open = 'false'; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); } });
    // Closing hides the focused item: hand focus back to the trigger.
    panel.addEventListener('click', function (e) { if (e.target.closest('button') && !e.target.closest('details')) { var hadFocus = panel.contains(document.activeElement); panel.dataset.open = 'false'; trigger.setAttribute('aria-expanded', 'false'); if (hadFocus) setTimeout(function () { if (!document.activeElement || document.activeElement === document.body || panel.contains(document.activeElement)) trigger.focus(); }, 0); } });
    wrap.append(trigger, panel); return wrap;
  }
  function item(label, run, enabled) {
    var b = button('ts-menu-item', label, run); b.setAttribute('role', 'menuitem');
    if (enabled) b.dataset.enabledFrom = enabled; return b;
  }
  function mountCanvas() {
    var root = document.getElementById('team-canvas-root');
    if (!root || root.dataset.tsShell === 'true') return !!(root && root.dataset.tsShell === 'true');
    var layout = root.querySelector('.tc-layout'), main = root.querySelector('.tc-main'), toolbar = root.querySelector('.tc-toolbar');
    var shell = root.querySelector('.tc-viewport-shell'), inspector = root.querySelector('.tc-selection-inspector');
    // Wait until the canvas, viewport and inspector modules have mounted.
    if (!layout || !main || !toolbar || !shell || !inspector || !root.querySelector('.tc-paste-plot')) return false;
    root.dataset.tsShell = 'true'; root.classList.add('ts-shell');
    // The library is a panel opened from the rail. Start it closed so restoring a
    // checkpoint (which saves it closed) does not shift the whole canvas sideways.
    if (!layout.classList.contains('tc-library-hidden')) { layout.classList.add('tc-library-hidden'); var libToggle = root.querySelector('.tc-library-toggle'); if (libToggle) { libToggle.setAttribute('aria-expanded', 'false'); libToggle.textContent = 'Show library'; } }

    // Left icon rail: panels push the canvas (grid column), never overlay it.
    var rail = el('nav', 'ts-rail'); rail.setAttribute('aria-label', 'Canvas panels');
    function libraryOpen() { return !layout.classList.contains('tc-library-hidden'); }
    function setLibrary(open) { if (libraryOpen() !== open) proxy('.tc-library-toggle', root); }
    function libraryTab(name) {
      var tab = Array.from(root.querySelectorAll('.tc-catalog [role="tab"],.tc-catalog button')).find(function (b) { return b.textContent.trim() === name; });
      if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    }
    // 3D cell and Save & export are legacy steps inside the Canvas stage whose
    // tabs the shell hides; without this the top bar's Canvas step and the rail
    // could not bring the figure canvas back. Figure tools return to it first.
    function figureCanvasShown() { return root.offsetParent !== null; }
    // Only when the workspace is really on 3D cell (6) or Save & export (7); during
    // an ordinary stage change the canvas is briefly hidden and must be left alone.
    function onLegacyCanvasStep() { var st = window.TeamWorkspace && TeamWorkspace.state(); return !!(st && st.stage === 'canvas' && st.legacyStep > 5); }
    function toFigureCanvas() {
      var compose = root.querySelector('#tc-preview-panel'); if (compose && !compose.hidden) proxy('#tc-workspace-tab', root);
      if (!figureCanvasShown() && onLegacyCanvasStep()) { var link = guideLink('Figure canvas'); if (link) link.click(); }
    }
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-tw-stage="canvas"]') && onLegacyCanvasStep()) setTimeout(toFigureCanvas, 0); }, true);
    var railPlots = button('ts-rail-item', 'Plots', function () { toFigureCanvas(); var showPlots = !(libraryOpen() && rail.dataset.active === 'plots'); setLibrary(showPlots); if (showPlots) libraryTab('Plots'); paintRail(showPlots ? 'plots' : ''); }, ICONS.plots);
    var railText = button('ts-rail-item', 'Text & shapes', function () { toFigureCanvas(); proxy('.tc-draw-primitives', root); }, ICONS.text);
    var railIllus = button('ts-rail-item', 'Illustrations', function () { toFigureCanvas(); var show = !(libraryOpen() && rail.dataset.active === 'illustrations'); setLibrary(show); if (show) libraryTab('Illustrations'); paintRail(show ? 'illustrations' : ''); }, ICONS.illustrations);
    var railPalettes = button('ts-rail-item', 'Palettes', function () { toFigureCanvas(); proxy('.tc-palette', root); }, ICONS.palettes);
    var railCell = button('ts-rail-item', '3D cell', function () { if (!figureCanvasShown()) { toFigureCanvas(); return; } var link = guideLink('3D cell'); if (link) link.click(); }, ICONS.cell);
    railPlots.dataset.panel = 'plots'; railIllus.dataset.panel = 'illustrations';
    rail.append(railPlots, railText, railIllus, railPalettes, railCell);
    function paintRail(active) {
      if (active == null) active = libraryOpen() ? (rail.dataset.active || 'plots') : '';
      rail.dataset.active = active;
      [railPlots, railIllus].forEach(function (b) { var on = b.dataset.panel === active; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    }
    layout.insertBefore(rail, layout.firstChild);
    new MutationObserver(function () { paintRail(); }).observe(layout, { attributes: true, attributeFilter: ['class'] });
    paintRail();

    // Fixed inspector column: always reserved; empty state when nothing is selected.
    var column = el('div', 'ts-inspector-column');
    var empty = el('div', 'ts-inspector-empty');
    empty.innerHTML = '<span class="ts-label">Inspector</span><p>Select a plot or object on the canvas to edit its settings here.</p>';
    var home = el('div', 'tc-companion-home'); home.setAttribute('aria-hidden', 'true');
    layout.appendChild(column); column.append(inspector, empty, home);
    // Selecting an object opens its properties in the column without an extra click.
    window.addEventListener('team-canvas-selection', function (event) {
      if (!event.detail) return; // a cleared selection (Esc, removed card) must not re-open it
      setTimeout(function () {
        var trigger = root.querySelector('.tc-properties-toggle');
        // Open without moving focus (the user may be typing in the card, e.g. its title).
        if (trigger && !trigger.disabled && trigger.getAttribute('aria-expanded') !== 'true' && inspector.hidden) { trigger.dataset.autoOpen = 'true'; trigger.click(); }
      }, 0);
    });

    // Floating toolbar: the existing .tc-toolbar is restyled; proxied controls stay in the DOM.
    var tools = el('div', 'ts-tools');
    var addPlot = button('ts-tool', '+ Add plot', function () { setLibrary(true); libraryTab('Plots'); paintRail('plots'); var s = root.querySelector('.tc-search'); if (s) s.focus(); });
    var arrange = button('ts-tool', 'Arrange', function () { proxy('.tc-arrange', root); });
    var text = button('ts-tool', 'Text', function () { proxy('#tc-preview-tab', root); proxy('.tc-preview-add-text', root); });
    var shapes = button('ts-tool', 'Shapes', function () { proxy('.tc-draw-primitives', root); });
    function key(redo) { return function (e) { var t = e.currentTarget; t.dispatchEvent(new KeyboardEvent('keydown', { key: redo ? 'Z' : 'z', shiftKey: !!redo, ctrlKey: true, bubbles: true, cancelable: true })); }; }
    var undo = button('ts-tool ts-icon', 'Undo', key(false), '↶');
    var redo = button('ts-tool ts-icon', 'Redo', key(true), '↷');
    var preview = button('ts-tool', 'Preview', function () {
      var p = root.querySelector('#tc-preview-panel');
      proxy(p && !p.hidden ? '#tc-workspace-tab' : '#tc-preview-tab', root);
    });
    function exportItem(label, selector) { return item(label, function () { proxy('#tc-preview-tab', root); setTimeout(function () { proxy(selector, root); }, 0); }); }
    var exportMenu = menuButton('Export figure', [
      exportItem('SVG · vector', '.tc-preview-svg'), exportItem('PDF', '.tc-preview-pdf'), exportItem('Print', '.tc-preview-print'),
      el('p', 'ts-menu-note', 'Exports the finished figures as composed in Preview.')], 'ts-export');
    exportMenu.querySelector('.ts-menu-trigger').classList.add('ts-primary');
    var help = root.querySelector('.tc-save-help');
    var expandItem;
    function compactOnly(b) { b.classList.add('ts-compact-only'); return b; }
    var moreItems = [
      compactOnly(item('Arrange', function () { proxy('.tc-arrange', root); })),
      compactOnly(item('Text', function () { text.click(); })),
      compactOnly(item('Shapes', function () { shapes.click(); })),
      item('Paste plot', function () { proxy('.tc-paste-plot', root); }, '.tc-paste-plot'),
      item('Return all plots', function () { proxy('.tc-reset', root); }, '.tc-reset'),
      expandItem = item('Expand canvas', function () { proxy('.tc-focus-toggle', root); }, '.tc-focus-toggle'),
      item('Save & export…', function () { var l = guideLink('Save & export'); if (l) l.click(); }),
      item('Analysis tools', function () { var d = document.querySelector('.tw-canvas-tabs details'); if (d) { d.open = true; var s = d.querySelector('summary'); if (s) s.focus(); } })
    ];
    if (help) moreItems.push(help);
    menu = menuButton('⋯', moreItems, 'ts-more');
    menu.querySelector('.ts-menu-trigger').setAttribute('aria-label', 'More canvas actions');
    function sep(secondary) { var s = el('span', 'ts-sep' + (secondary ? ' ts-secondary' : '')); s.setAttribute('aria-hidden', 'true'); return s; }
    [arrange, text, shapes].forEach(function (b) { b.classList.add('ts-secondary'); });
    tools.append(addPlot, sep(true), arrange, text, shapes, sep(), undo, redo, sep(), preview, exportMenu, menu);
    toolbar.insertBefore(tools, toolbar.firstChild);
    toolbar.setAttribute('aria-label', 'Canvas tools'); toolbar.setAttribute('role', 'toolbar');
    // One row always: when the full toolbar no longer fits the canvas width, Arrange,
    // Text and Shapes move into the ⋯ menu (same actions).
    var fullToolsWidth = 0;
    function fitTools() {
      var space = toolbar.parentElement ? toolbar.parentElement.clientWidth - 24 : 0;
      if (space <= 0 || !tools.getClientRects().length) return; // hidden: measure once visible
      if (!root.classList.contains('ts-tools-compact')) fullToolsWidth = Math.max(fullToolsWidth, Array.prototype.reduce.call(tools.children, function (w, c) { var cs = getComputedStyle(c); return w + c.offsetWidth + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0) + 2; }, 24));
      var compact = fullToolsWidth > space;
      if (compact !== root.classList.contains('ts-tools-compact')) root.classList.toggle('ts-tools-compact', compact);
    }
    if (window.ResizeObserver && toolbar.parentElement) new ResizeObserver(fitTools).observe(toolbar.parentElement);
    fitTools();
    // When the toolbar wraps to more rows, keep the status notice and the top of the canvas below it.
    if (window.ResizeObserver) new ResizeObserver(function () { var b = Math.round(toolbar.offsetTop + toolbar.offsetHeight); if (b > 0 && root.style.getPropertyValue('--ts-toolbar-bottom') !== b + 'px') root.style.setProperty('--ts-toolbar-bottom', b + 'px'); }).observe(toolbar);
    function syncTools() {
      var p = root.querySelector('#tc-preview-panel'), inPreview = !!(p && !p.hidden);
      // Write only real changes: this runs from an attribute observer on the same subtree.
      var label = inPreview ? 'Workspace' : 'Preview';
      if (preview.textContent !== label) preview.textContent = label;
      if (preview.getAttribute('aria-pressed') !== String(inPreview)) preview.setAttribute('aria-pressed', String(inPreview));
      root.querySelectorAll('.ts-menu-item[data-enabled-from]').forEach(function (b) { var t = root.querySelector(b.dataset.enabledFrom), off = !t || t.disabled; if (b.disabled !== off) b.disabled = off; });
      var focus = root.querySelector('.tc-focus-toggle'), expand = expandItem;
      if (focus && expand.textContent !== focus.textContent) expand.textContent = focus.textContent;
    }
    new MutationObserver(syncTools).observe(root, { attributes: true, subtree: true, attributeFilter: ['hidden', 'disabled'] });
    syncTools();
    // Context menu on empty canvas space reuses the ⋯ menu.
    var scroll = root.querySelector('.tc-scroll');
    if (scroll) scroll.addEventListener('contextmenu', function (e) {
      if (e.target.closest('.tc-node,input,textarea,select,[contenteditable="true"]')) return;
      e.preventDefault(); var trigger = menu.querySelector('.ts-menu-trigger'); trigger.click();
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.ts-menu-wrap')) closeMenus(null); });
    window.dispatchEvent(new Event('resize'));
    return true;
  }

  function tick() { var a = mountTopbar(), b = mountCanvas(); return a && b; }
  function start() {
    if (!window.LIPIDOMIC_TEAM_WORKSPACE) return;
    document.body.classList.add('ts-shell-app');
    if (tick()) return;
    var observer = new MutationObserver(function () { if (tick()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  // Dialogs opened by analysis modules have a footer Dismiss button only; give
  // every dialog a visible close control in its header as well.
  if (window.jQuery) jQuery(document).on('shown.bs.modal', function (e) {
    var header = e.target.querySelector('.modal-header');
    if (!header || header.querySelector('.btn-close,[data-dismiss="modal"],[data-bs-dismiss="modal"],.close')) return;
    var x = document.createElement('button'); x.type = 'button'; x.className = 'btn-close btn-close-white ts-modal-close'; x.setAttribute('data-bs-dismiss', 'modal'); x.setAttribute('data-dismiss', 'modal'); x.setAttribute('aria-label', 'Close');
    header.appendChild(x);
  });
  window.TeamShell = { mounted: function () { var r = document.getElementById('team-canvas-root'); return !!(r && r.dataset.tsShell === 'true'); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
