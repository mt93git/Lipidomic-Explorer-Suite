/* Team tool pages on wide screens: when the main sidebar is collapsed, its
   floating bslib chevron sat alone at the top-left with no visible sidebar.
   The labelled "Plot controls" toolbar button (built by guided.js for narrow
   screens) takes its place and drives the same bslib toggle, so the sidebar
   stays reachable. While the sidebar is open the chevron is shown as before. */
(function () {
  'use strict';
  var WIDE = '(min-width:900px)', CLASS = 'qw-plot-controls-proxy';
  function layout() {
    var sidebar = document.getElementById('main_sidebar'), parent = sidebar && sidebar.parentElement;
    return parent && parent.classList.contains('bslib-sidebar-layout') ? parent : null;
  }
  function toggle(l) { return l ? l.querySelector(':scope > .collapse-toggle') : null; }
  function isOpen(l, t) { return !l.classList.contains('sidebar-collapsed') && t.getAttribute('aria-expanded') !== 'false'; }
  function sync() {
    var l = layout(), t = toggle(l), button = document.getElementById('guide-narrow-controls');
    var proxy = !!(l && t && button && document.body.dataset.guideAnalysis === 'true' && window.matchMedia(WIDE).matches);
    document.body.classList.toggle(CLASS, proxy);
    if (proxy) { var open = String(isOpen(l, t)); if (button.getAttribute('aria-expanded') !== open) button.setAttribute('aria-expanded', open); }
  }
  var pending = false;
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; sync(); }); } }
  // Capture phase: on wide screens the narrow-drawer handler in guided.js must not run.
  document.addEventListener('click', function (e) {
    var button = e.target.closest && e.target.closest('#guide-narrow-controls');
    if (!button || !document.body.classList.contains(CLASS)) return;
    var t = toggle(layout()); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    t.click();
    setTimeout(sync, 0); setTimeout(sync, 400);
  }, true);
  function start() {
    sync();
    new MutationObserver(schedule).observe(document.body, {subtree: true, attributes: true, childList: true,
      attributeFilter: ['class', 'aria-expanded', 'data-guide-analysis']});
    // guided.js resets aria-expanded on resize; re-sync after it.
    window.addEventListener('resize', schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
