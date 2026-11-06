/* "All analysis tools" drawer. One non-modal panel (one side panel at a time, see
   placement() below) opened from the guided step bar and from
   the Canvas "Analysis tools" controls. It lists the
   tool links already in the page (Results "All analysis tools (advanced)" and
   the workspace .tw-tools list), grouped by question; each Open button clicks
   that original link, so navigation is exactly the existing guide_open_tool
   route. No Shiny input is created, renamed or removed here. */
(function () {
  'use strict';
  var ID = 'team-tools-drawer';
  var TRIGGERS = '#guide-navigation .guide-global-actions button[data-guide-step="5"],.tw-canvas-tabs details > summary';
  var SOURCES = 'details .guide-tool-grid button[data-guide-tool],.tw-tools button[data-guide-tool]';
  var drawer = null, list = null, returnTo = null, justOpened = false;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function catalog() {
    var node = document.getElementById('team-tools-drawer-catalog');
    try { return node ? JSON.parse(node.textContent) : {}; } catch (e) { return {}; }
  }
  // One link per tool, in page order; the first copy found is the one clicked.
  function sources() {
    var seen = {}, out = [];
    document.querySelectorAll(SOURCES).forEach(function (b) {
      var tool = b.dataset.guideTool;
      if (!tool || seen[tool] || b.closest('#' + ID)) return;
      seen[tool] = true; out.push({ tool: tool, link: b });
    });
    return out;
  }
  function decorate() {
    document.querySelectorAll(TRIGGERS).forEach(function (t) {
      if (t.dataset.ttdTrigger) return;
      t.dataset.ttdTrigger = 'true';
      t.setAttribute('aria-controls', ID); t.setAttribute('aria-expanded', 'false'); t.setAttribute('aria-haspopup', 'dialog');
      var chevron = el('span', 'ttd-chevron'); chevron.setAttribute('aria-hidden', 'true'); t.appendChild(chevron);
    });
  }
  function setExpanded(open) {
    document.querySelectorAll('[data-ttd-trigger]').forEach(function (t) { t.setAttribute('aria-expanded', String(open)); });
  }
  function build() {
    if (drawer) return drawer;
    drawer = el('aside', 'ttd-drawer'); drawer.id = ID; drawer.hidden = true;
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'false'); drawer.setAttribute('aria-labelledby', ID + '-title');
    var head = el('div', 'ttd-head');
    var title = el('h2', 'ttd-title', 'All analysis tools'); title.id = ID + '-title';
    var close = el('button', 'ttd-close', 'Close'); close.type = 'button'; close.setAttribute('aria-label', 'Close all analysis tools');
    close.addEventListener('click', function () { closeDrawer(true); });
    head.append(title, close);
    var intro = el('p', 'ttd-intro', 'Grouped by the question each tool answers.');
    list = el('div', 'ttd-groups');
    drawer.append(head, intro, list);
    // Docked in the Canvas grid the drawer is inside #team-canvas-root: its clicks and copy/paste/undo
    // shortcuts belong to the drawer, not to the canvas (card selection, canvas.js shortcuts). Escape
    // is handled on window before this (below).
    ['click', 'pointerdown'].forEach(function (type) { drawer.addEventListener(type, function (e) { e.stopPropagation(); }); });
    drawer.addEventListener('keydown', function (e) { if (e.metaKey || e.ctrlKey) e.stopPropagation(); });
    document.body.appendChild(drawer);
    return drawer;
  }
  // R's toJSON turns character(0) into []; empty arrays and blank strings mean no description.
  function descriptionText(value) {
    if (Array.isArray(value)) value = value.join(' ');
    return typeof value === 'string' && value.trim() ? value : '';
  }
  function item(entry, description) {
    var row = el('li', 'ttd-item');
    var text = el('div', 'ttd-text');
    text.appendChild(el('strong', 'ttd-name', entry.tool));
    if (description) text.appendChild(el('p', 'ttd-desc', description));
    var open = el('button', 'ttd-open', 'Open'); open.type = 'button';
    open.setAttribute('aria-label', 'Open ' + entry.tool);
    open.disabled = !!entry.link.disabled;
    open.addEventListener('click', function () {
      closeDrawer(true);
      entry.link.click();
    });
    row.append(text, open);
    return row;
  }
  function render() {
    var data = catalog(), groups = Array.isArray(data.groups) ? data.groups : [], copy = data.descriptions || {};
    var available = sources(), byTool = {}, placed = {};
    available.forEach(function (s) { byTool[s.tool] = s; });
    list.textContent = '';
    function section(title, entries) {
      if (!entries.length) return;
      var group = el('section', 'ttd-group');
      var heading = el('h3', 'ttd-group-title', title); heading.id = ID + '-g' + list.children.length;
      group.setAttribute('aria-labelledby', heading.id);
      var ul = el('ul', 'ttd-list');
      entries.forEach(function (s) { ul.appendChild(item(s, descriptionText(copy[s.tool]))); });
      group.append(heading, ul); list.appendChild(group);
    }
    groups.forEach(function (g) {
      var entries = (g.tools || []).map(function (t) { return byTool[t]; }).filter(function (s) { return s && !placed[s.tool]; });
      entries.forEach(function (s) { placed[s.tool] = true; });
      section(g.title, entries);
    });
    section('Other tools', available.filter(function (s) { return !placed[s.tool]; }));
    // The Canvas's 3D cell page (workspace.R guide_link, step 6) leaves the figure canvas like a
    // tool does; the Canvas toolbar's "Analysis tools" opens this drawer, so it is listed here.
    var cell = Array.prototype.find.call(document.querySelectorAll('.tw-canvas-tabs .guide-button'), function (b) { return b.textContent.trim() === '3D cell'; });
    if (cell) section('Canvas pages', [{ tool: '3D cell', link: cell }]);
    if (!list.children.length) list.appendChild(el('p', 'ttd-empty', 'No analysis tools are available on this screen yet.'));
  }
  var modeWatch = null, barSize = null, barWatch = null, barWait = null, companionWatch = null, watchedBar = null;
  function stepBar() { var bar = document.getElementById('guide-navigation'); return bar && bar.getClientRects().length ? bar : null; }
  function overlaps(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
  // Where the drawer goes. It never paints over a control:
  // - Draft canvas (normal or expanded): it takes the inspector's column of the shell grid (shell.js),
  //   at the inspector's width, so the canvas and its header keep their geometry; the inspector is
  //   hidden while the drawer is open and comes back when it closes (tools_drawer.css).
  // - Figure page: in the page flow above the page.
  // - Guided pages, at every width: in the page flow under the step bar and the "Changes pending"
  //   bar, like the Help panel, so it pushes the page (Continue, its note) down.
  // - Elsewhere (a Canvas without the shell, other screens): a fixed panel on the qw_layers scale,
  //   under the bars, full width on phones.
  function canvasLayout() { var l = document.querySelector('#team-canvas-root.ts-shell .tc-layout'); return l && l.getClientRects().length ? l : null; }
  function figurePage() { var p = document.querySelector('#team-canvas-root #tc-preview-panel'); return p && !p.hidden && p.getClientRects().length ? p : null; }
  function placement() {
    var layout = canvasLayout(); if (layout) return { mode: 'dock', host: layout };
    var preview = figurePage(); if (preview) return { mode: 'inline', host: preview, before: true };
    if (document.querySelector('#team-canvas-root.tc-focus-mode')) return { mode: 'fixed', over: true };
    var bar = stepBar();
    if (bar) { var pending = document.getElementById('tw-pending-bar'); return { mode: 'inline', host: pending && pending.parentNode ? pending : bar }; }
    return { mode: 'fixed' };
  }
  function move(put) {
    var focused = drawer.contains(document.activeElement) ? document.activeElement : null;
    put();
    if (focused) focused.focus({ preventScroll: true });
  }
  function settle(p) {
    if (p.mode === 'dock') { if (drawer.parentNode !== p.host) move(function () { p.host.appendChild(drawer); }); }
    else if (p.mode === 'inline') {
      if (p.before ? drawer.nextElementSibling !== p.host : p.host.nextElementSibling !== drawer) move(function () { if (p.before) p.host.before(drawer); else p.host.after(drawer); });
    } else if (drawer.parentNode !== document.body) move(function () { document.body.appendChild(drawer); });
  }
  // The Draft grid gives the drawer the inspector's column only while it is docked there.
  function undock(keep) {
    document.querySelectorAll('.tc-layout.ttd-open').forEach(function (l) { if (l !== keep) l.classList.remove('ttd-open'); });
    if (keep && !keep.classList.contains('ttd-open')) keep.classList.add('ttd-open');
  }
  function place() {
    if (!drawer || drawer.hidden) return;
    var p = placement();
    if (drawer.classList.contains('ttd-docked') !== (p.mode === 'dock')) drawer.classList.toggle('ttd-docked', p.mode === 'dock');
    if (drawer.classList.contains('ttd-inline') !== (p.mode === 'inline')) drawer.classList.toggle('ttd-inline', p.mode === 'inline');
    if (drawer.classList.contains('ttd-over-canvas') !== !!p.over) drawer.classList.toggle('ttd-over-canvas', !!p.over);
    settle(p);
    undock(p.mode === 'dock' ? p.host : null);
    if (p.mode !== 'fixed') { drawer.style.setProperty('--ttd-top', '0px'); return; }
    // The expanded Canvas is a fixed full-screen layer (z-index 10000) that covers the step bar:
    // the drawer is a panel above it and starts under the Canvas toolbar (its ⋯ menu and Companion
    // button stay uncovered), or at the top of the screen when that toolbar is not shown.
    if (p.over) {
      var tools = document.querySelector('#team-canvas-root.tc-focus-mode .tc-toolbar');
      var under = tools && tools.getClientRects().length ? tools.getBoundingClientRect().bottom : 0;
      drawer.style.setProperty('--ttd-top', Math.max(0, Math.min(window.innerHeight - 160, under)) + 'px');
      return;
    }
    var bar = stepBar(), nav = document.querySelector('.navbar');
    var anchor = bar || nav;
    var top = Math.max(0, Math.min(window.innerHeight - 160, anchor ? anchor.getBoundingClientRect().bottom : 0));
    // Guided pages: start below the "Changes pending" bar while it is on screen, so its Update and
    // Undo stay uncovered even when that leaves the drawer short.
    var pending = document.getElementById('tw-pending-bar'), rect = pending && pending.getBoundingClientRect();
    if (rect && rect.height > 0 && rect.bottom > 0) top = Math.max(top, Math.min(rect.bottom, window.innerHeight - 48));
    drawer.style.setProperty('--ttd-top', top + 'px');
  }
  // The "Changes pending" bar is a server render that can arrive, grow or go after the drawer
  // opened. While open: a ResizeObserver on the bar (and the strips above it that can push it
  // down) re-places the drawer; a MutationObserver re-places it when the bar's content changes,
  // and, while the bar is not in the page yet, waits for it to appear.
  function watchBar() {
    var pending = document.getElementById('tw-pending-bar');
    if (pending && pending !== watchedBar) {
      watchedBar = pending;
      if (barWait) { barWait.disconnect(); barWait = null; }
      if (window.ResizeObserver) {
        barSize = barSize || new ResizeObserver(place); barSize.disconnect();
        [pending, document.getElementById('guide-context'), document.getElementById('guide-navigation')].forEach(function (n) { if (n) barSize.observe(n); });
      }
      if (window.MutationObserver) { barWatch = barWatch || new MutationObserver(place); barWatch.disconnect(); barWatch.observe(pending, { childList: true, subtree: true, attributes: true }); }
      place();
    } else if (!pending && !barWait && window.MutationObserver) {
      barWait = new MutationObserver(function () { if (document.getElementById('tw-pending-bar')) watchBar(); });
      barWait.observe(document.body, { childList: true, subtree: true });
    }
  }
  function unwatchBar() {
    [barSize, barWatch, barWait].forEach(function (o) { if (o) o.disconnect(); });
    barWait = null; watchedBar = null;
  }
  // The companion/mascot is frozen as in production (wave2b-carryover.md): the drawer never opens,
  // closes, moves or hides it, its chat or its settings. On the Canvas the drawer lies over the
  // inspector column, which stays laid out (tools_drawer.css), so the mascot's home and the chat's
  // docking geometry are exactly as without the drawer. When the user opens the chat (a closed-to-open
  // change) the drawer closes, so the two never stack; the chat itself is untouched.
  function companionPanel() { var p = document.getElementById('lipidomic-assistant-panel'); return p && !p.hidden ? p : null; }
  var companionWasOpen = false;
  function watchCompanion() {
    if (!window.MutationObserver) return;
    companionWasOpen = !!companionPanel();
    companionWatch = companionWatch || new MutationObserver(function () {
      var open = !!companionPanel();
      if (open && !companionWasOpen && isOpen()) closeDrawer(false);
      companionWasOpen = open;
    });
    companionWatch.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  }
  function openDrawer(trigger) {
    decorate(); build(); render();
    returnTo = trigger || document.activeElement;
    drawer.hidden = false; setExpanded(true); place();
    // In the page flow or below the canvas on narrow screens it can start below the fold.
    var head = drawer.querySelector('.ttd-head');
    // Docked below the canvas (narrow screens) it scrolls to the top of the window, so its head is not
    // left at the bottom edge under the floating mascot (the mascot is frozen: the drawer makes room).
    if ((drawer.classList.contains('ttd-inline') || drawer.classList.contains('ttd-docked')) && head && head.scrollIntoView) head.scrollIntoView({ block: drawer.classList.contains('ttd-docked') && innerWidth <= 900 ? 'start' : 'nearest' });
    // Entering or leaving the expanded Canvas while open changes the layer and the top offset.
    var root = document.getElementById('team-canvas-root');
    if (root && window.MutationObserver) { modeWatch = modeWatch || new MutationObserver(place); modeWatch.observe(root, { attributes: true, attributeFilter: ['class'] }); }
    watchBar(); watchCompanion();
    justOpened = true; setTimeout(function () { justOpened = false; }, 0);
    var close = drawer.querySelector('.ttd-close'); if (close) close.focus();
  }
  function closeDrawer(restoreFocus) {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true; setExpanded(false);
    undock(null); // the inspector's column comes back
    if (modeWatch) modeWatch.disconnect();
    if (companionWatch) companionWatch.disconnect();
    unwatchBar();
    var target = returnTo; returnTo = null;
    if (restoreFocus && target && target.isConnected) {
      // The Canvas summary is visually hidden; fall back to the menu that opened it.
      if (target.getClientRects().length) target.focus({ preventScroll: true });
      else { var more = document.querySelector('.ts-more .ts-menu-trigger'); if (more && more.getClientRects().length) more.focus({ preventScroll: true }); else target.focus({ preventScroll: true }); }
    }
  }
  function isOpen() { return !!(drawer && !drawer.hidden); }

  // Capture phase: runs before guided.js (step 5) and the native <details>
  // toggle, so the trigger opens the drawer instead of the old behaviour.
  window.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest(TRIGGERS);
    if (!trigger) return;
    e.preventDefault(); e.stopPropagation();
    if (isOpen() && returnTo === trigger) closeDrawer(true); else openDrawer(trigger);
  }, true);
  // Places that own Escape themselves: editable fields, dropdowns, the companion and its settings, other dialogs.
  var EDITABLE = 'input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=submit]),textarea,select,[contenteditable]:not([contenteditable=false])';
  var ESC_OWNERS = '.selectize-control,.dropdown-menu.show,#ts-companion-column,#lipidomic-assistant-panel,.assistant-panel,#lipidomic-help-panel,[role=dialog]:not(#' + ID + ')';
  function focusOnPage(a) { return !a || a === document.body || a === document.documentElement || drawer.contains(a); }
  // An open menu or popover outside the drawer (the 390 px step menu, ⋯ menus, card and tab
  // menus) is the innermost layer while focus is on its trigger or inside it: it owns Escape.
  // Found through its expanded trigger (aria-controls, or the menu right after the trigger).
  var POPUP = '[role=menu],[role=listbox],[role=group],[role=tree],[role=grid],.tw-compact-steps-menu,.ts-menu';
  function innerLayerOwnsEscape(a) {
    if (!a || a === document.body || (drawer && drawer.contains(a))) return false;
    return Array.prototype.some.call(document.querySelectorAll('[aria-expanded="true"]'), function (t) {
      if ((drawer && drawer.contains(t)) || t.hasAttribute('data-ttd-trigger')) return false;
      var id = t.getAttribute('aria-controls'), layer = id ? document.getElementById(id) : null;
      if (!layer && t.nextElementSibling && t.nextElementSibling.matches(POPUP)) layer = t.nextElementSibling;
      if (!layer || layer === drawer || layer.hidden || !layer.getClientRects().length) return false;
      var popup = layer.matches(POPUP) || /^(true|menu|listbox|tree|grid)$/.test(t.getAttribute('aria-haspopup') || '');
      return popup && (t === a || layer.contains(a));
    });
  }
  // Capture phase: controls that stop propagation (card badges, menu triggers, Plotly modebar) still close it.
  // Focus goes back to the trigger unless the click moved it to another control.
  document.addEventListener('click', function (e) {
    if (!isOpen() || justOpened) return;
    if (drawer.contains(e.target) || (e.target.closest && e.target.closest('[data-ttd-trigger]'))) return;
    closeDrawer(focusOnPage(document.activeElement));
  }, true);
  // Capture phase on window: the open drawer closes on Escape from anywhere except the
  // places that own Escape (ESC_OWNERS, editable fields, an open modal or dialog, an open
  // inner menu holding focus), and stops it so the companion and expanded-Canvas handlers
  // do not also run. One Escape closes one layer.
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !isOpen() || e.defaultPrevented) return;
    if (document.querySelector('.modal.show,dialog[open]')) return; // a dialog above handles its own Escape
    var a = document.activeElement;
    if (a && !drawer.contains(a) && a.closest && (a.isContentEditable || a.matches(EDITABLE) || a.closest(ESC_OWNERS))) return;
    if (innerLayerOwnsEscape(a)) return;
    e.preventDefault(); e.stopImmediatePropagation(); closeDrawer(true);
  }, true);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate); else decorate();

  // innerLayerOwnsEscape is shared with the guided Help panel (context_help.js), so both outer layers yield the same way.
  window.TeamToolsDrawer = { open: openDrawer, close: closeDrawer, isOpen: isOpen, innerLayerOwnsEscape: innerLayerOwnsEscape };
})();
