/* Tables on the guided and workspace pages: mark which column holds the sample name so
   mobile_tables.css can keep it fixed while the table scrolls sideways, and flag the
   scroll containers that have more columns to the left or right (edge shadow cue).
   Works on DataTables with scrollX (.dataTables_scrollBody scrolls) and on plain
   renderTable() output (the table itself scrolls on phones). Presentation only. */
(function () {
  'use strict';
  // Guided pages, and in the Team workspace every page and dialog outside the Canvas (Data and Review,
  // which are not all .guide-page, and the dialogs Shiny adds to <body>). Tables in scope get the class
  // tw-mobile-table (and their output box tw-mobile-table-host): mobile_tables.css styles those.
  var SCOPE = '.guide-page';
  function inScope(el) {
    return !!el.closest(SCOPE) || (document.body.classList.contains('team-workspace-app') && !el.closest('#team-canvas-root'));
  }
  var SAMPLE = /^(sample|sample id|sample name|matrix[ _]sample)$/i;
  var STICKY_MAX = 6; // mobile_tables.css has rules for columns 1..6

  function headerCells(root) {
    var head = root.querySelector('.dataTables_scrollHead thead tr') || root.querySelector('thead tr');
    return head ? Array.prototype.slice.call(head.children) : [];
  }
  function stickyColumn(root) {
    var cells = headerCells(root);
    for (var i = 0; i < cells.length && i < STICKY_MAX; i++) if (SAMPLE.test(cells[i].textContent.trim())) return i + 1;
    return 1; // no Sample header: keep the row identifier (first column)
  }
  function scroller(root) { return root.classList.contains('dataTables_wrapper') ? root.querySelector('.dataTables_scrollBody') : root; }
  function cueHost(root) { return root.classList.contains('dataTables_wrapper') ? (root.querySelector('.dataTables_scroll') || root) : root.parentElement; }
  function cue(root) {
    var s = scroller(root), host = cueHost(root); if (!s || !host) return;
    var max = s.scrollWidth - s.clientWidth;
    var left = max > 1 && s.scrollLeft > 1, right = max > 1 && s.scrollLeft < max - 1;
    if (host.classList.contains('tw-scroll-left') !== left) host.classList.toggle('tw-scroll-left', left);
    if (host.classList.contains('tw-scroll-right') !== right) host.classList.toggle('tw-scroll-right', right);
    if (!host.classList.contains('tw-scroll-cue')) host.classList.add('tw-scroll-cue');
  }
  function roots() { return Array.prototype.filter.call(document.querySelectorAll('.dataTables_wrapper,table.shiny-table'), inScope); }
  function refresh() {
    roots().forEach(function (root) {
      var col = String(stickyColumn(root)), host = root.parentElement && root.parentElement.closest('.shiny-html-output,.html-widget-output');
      if (!root.classList.contains('tw-mobile-table')) root.classList.add('tw-mobile-table');
      if (host && !host.classList.contains('tw-mobile-table-host')) host.classList.add('tw-mobile-table-host');
      if (root.dataset.twStickyCol !== col) root.dataset.twStickyCol = col;
      cue(root);
    });
  }
  // The fixed column and the cue are phone layouts; wider screens do no work here.
  var phone = window.matchMedia ? window.matchMedia('(max-width:600px)') : { matches: true };
  var queued = false;
  function schedule() { if (queued || !phone.matches) return; queued = true; requestAnimationFrame(function () { queued = false; refresh(); }); }
  function start() {
    if (phone.addEventListener) phone.addEventListener('change', schedule); else if (phone.addListener) phone.addListener(schedule);
    // Tables are (re)rendered by Shiny and redrawn by DataTables (paging, sorting).
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    // scroll does not bubble: listen in the capture phase for any table scroller.
    document.addEventListener('scroll', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var root = t.classList && t.classList.contains('dataTables_scrollBody') ? t.closest('.dataTables_wrapper') : (t.matches && t.matches('table.shiny-table') ? t : null);
      if (root && phone.matches && inScope(root)) cue(root);
    }, true);
    window.addEventListener('resize', schedule);
    // A table inside a closed <details> has no width until it opens.
    document.addEventListener('toggle', schedule, true);
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
