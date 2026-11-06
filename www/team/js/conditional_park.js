/* While Team shows Data (choice), Review or Canvas, park the conditionalPanels of Max's hidden tool tabs.
   Shiny 1.14's $updateConditionals() runs after every input sent and every message received;
   it finds every [data-display-if] in the document and, for each namespaced panel, rebuilds a
   narrowed copy of all input and output values before evaluating it. Team embeds Max's full
   module UI in tab panes that are display:none on these screens, so most of that work was for
   panels nobody can see (about 20 s of main thread while Canvas opened).
   A parked panel keeps its expression in data-team-display-if instead of data-display-if, so
   Shiny's selector no longer finds it; nothing else changes: the node, its inputs, their values
   and bindings stay where they are, and team/css/conditional_park.css hides a parked panel that
   is not shown exactly as Shiny's own rule does. A panel is unparked, and Shiny re-checks it in
   the same pass, as soon as no tab pane hides it any more (a pane hides only while it is a
   non-active .tab-pane inside a .tab-content and computes display:none; its pane turning active,
   the node or the pane being moved or removed all count, checked at most once per frame; anything
   no observer reports, e.g. an inline style exposing a pane, within a second), when
   the screen is none of those (sample upload steps, Classic), or after any error here. Only panels inside an
   inactive (display:none) tab pane are parked: that includes a Canvas card module's own unopened
   tabs, never a card's visible or off-screen controls, the inspector, or an active pane. Only
   DOM attributes are touched; Shiny is not wrapped. */
(function () {
  'use strict';
  var ON = 'data-display-if', OFF = 'data-team-display-if', HIDDEN = '.tab-pane:not(.active)';
  // data-choice: resuming a checkpoint replays ~1,400 updates there before Review shows.
  var SCREENS = { 'data-choice': true, 'review-single': true, canvas: true };
  var parked = [];          // [{el, pane}]: pane = the innermost pane that hides el
  var lastScan = 0, SCAN_MS = 1000, dirty = false;
  var stats = window.TeamConditionalPark = { parked: function () { return parked.length; }, panes: function () { return observed.size; }, restored: 0, scans: 0, revalidates: 0, errors: 0, active: false };

  function screenOn() { return !!SCREENS[document.body && document.body.dataset.twScreen]; }
  function app() { return window.Shiny && Shiny.shinyapp; }
  // Re-check every panel once with Shiny's own code (the same call input_batch.js makes).
  function recheck() { var a = app(); if (a && typeof a.$updateConditionals === 'function') a.$updateConditionals(); }

  function unpark(el) {
    var expr = el.getAttribute(OFF);
    if (expr != null) { el.setAttribute(ON, expr); el.removeAttribute(OFF); stats.restored++; }
  }
  // A pane hides only while it is a non-active tab pane still inside a .tab-content and computes
  // display:none (a pane portaled out of its tab-content shows). Never a pane holding the Canvas.
  function hides(pane, memo) {
    if (memo && memo.has(pane)) return memo.get(pane);
    var yes = !!pane.parentElement && !!pane.parentElement.closest('.tab-content') &&
      !pane.querySelector('#team-canvas-root') && getComputedStyle(pane).display === 'none';
    if (memo) memo.set(pane, yes);
    return yes;
  }
  // The innermost pane that hides el now, or null.
  function hider(el, memo) {
    if (!el.isConnected) return null;
    for (var pane = el.closest(HIDDEN); pane; pane = pane.parentElement && pane.parentElement.closest(HIDDEN))
      if (hides(pane, memo)) return pane;
    return null;
  }
  function restoreAll() {
    var list = parked, any = list.length > 0; parked = [];
    for (var i = 0; i < list.length; i++) { try { unpark(list[i].el); } catch (e) { stats.errors++; } }
    // Belt and braces: nothing may stay parked outside this list.
    document.querySelectorAll('[' + OFF + ']').forEach(function (el) { any = true; unpark(el); });
    watchPanes();
    return any;
  }
  // Keep a panel parked only while a pane still hides it; follow it to the pane that hides it
  // now (nested tabs). Panels whose node or pane left the document are dropped (and their
  // panes unobserved). Returns true when something was unparked.
  function revalidate() {
    stats.revalidates++;
    var keep = [], changed = false, memo = new Map();
    for (var i = 0; i < parked.length; i++) {
      var it = parked[i], pane = hider(it.el, memo);
      if (pane) { it.pane = pane; keep.push(it); } else { unpark(it.el); if (it.el.isConnected) changed = true; }
    }
    parked = keep; watchPanes();
    return changed;
  }
  function scan() {
    lastScan = Date.now(); stats.scans++;
    var found = document.querySelectorAll(HIDDEN + ' [' + ON + ']'), memo = new Map();
    for (var i = 0; i < found.length; i++) {
      var el = found[i], pane = hider(el, memo);
      if (!pane) continue;
      el.setAttribute(OFF, el.getAttribute(ON)); el.removeAttribute(ON);
      parked.push({ el: el, pane: pane });
    }
    watchPanes();
  }
  // Pane class changes, moves and removals mark the set dirty; one revalidate per frame.
  function flush() {
    if (!dirty) return; dirty = false;
    try { if (revalidate()) recheck(); } catch (e) { stats.errors++; release(); }
  }
  function schedule() { if (dirty) return; dirty = true; requestAnimationFrame(flush); }
  // Runs from 'shiny:conditional', which Shiny triggers at the start of $updateConditionals,
  // before it queries [data-display-if]: whatever is unparked here is evaluated in that pass.
  function tick() {
    try {
      if (!screenOn()) { stats.active = false; restoreAll(); return; }
      stats.active = true;
      if (dirty) { dirty = false; revalidate(); }   // a pending frame check (e.g. background tab)
      if (Date.now() - lastScan >= SCAN_MS) { revalidate(); scan(); }
    } catch (e) { stats.errors++; restoreAll(); }
  }
  // Once a second, with or without Shiny traffic: re-validate every parked panel. This catches
  // what no observer reports (an inline style, `hidden` or an ancestor/body class exposing an
  // inactive pane) within a second, at O(parked) with style reads cached per pass.
  function sweep() {
    if (!parked.length || !screenOn()) return;
    dirty = false;
    try { if (revalidate()) recheck(); } catch (e) { stats.errors++; release(); }
  }
  // Out of band (screen change, error): unpark now and let Shiny re-check.
  function release() {
    try { if (restoreAll()) recheck(); } catch (e) { stats.errors++; }
  }
  function onScreen() {
    if (screenOn()) { stats.active = true; tick(); }
    else { stats.active = false; release(); }
  }
  // Each parked pane: its own class (no subtree), its subtree's child lists (a node moved out)
  // and its parent's child list (the pane moved or removed).
  // Three observers: options given twice to one observer for one target replace each other.
  var classObserver = new MutationObserver(schedule), moveObserver = new MutationObserver(schedule), parentObserver = new MutationObserver(schedule);
  var observed = new Set(), parents = new Map();
  function watchPanes() {
    var panes = new Set(parked.map(function (it) { return it.pane; }));
    var same = observed.size === panes.size;
    // Same panes but one moved to another parent (e.g. between .tab-content): re-attach.
    if (same) panes.forEach(function (p) { if (!observed.has(p) || parents.get(p) !== p.parentNode) same = false; });
    if (same) return;
    classObserver.disconnect(); moveObserver.disconnect(); parentObserver.disconnect(); observed = panes; parents = new Map();
    observed.forEach(function (p) {
      parents.set(p, p.parentNode);
      classObserver.observe(p, { attributes: true, attributeFilter: ['class'] });
      moveObserver.observe(p, { childList: true, subtree: true });
      if (p.parentNode) parentObserver.observe(p.parentNode, { childList: true });
    });
  }
  function init() {
    if (!document.body) return;
    if (window.jQuery) jQuery(document).on('shiny:conditional', tick);
    new MutationObserver(onScreen).observe(document.body, { attributes: true, attributeFilter: ['data-tw-screen'] });
    setInterval(sweep, SCAN_MS);
  }
  stats.restoreAll = release;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
