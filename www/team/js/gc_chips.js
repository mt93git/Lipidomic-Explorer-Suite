// Group comparison chips (gc_chips.css): a chip whose label is cut by the ellipsis gets the full label
// as its tooltip. Presentation only; the chips, their state and their click handlers are untouched.
(function () {
  var SELECTOR = '.gc-inspector button.tc-chip, .gc-root .gc-controls button.tc-chip', queued = false;
  function mark() {
    queued = false;
    if (!document.body || !document.body.classList.contains('ts-shell-app')) return;
    document.querySelectorAll(SELECTOR).forEach(function (b) {
      if (!b.clientWidth) return;
      var cut = b.scrollWidth > b.clientWidth + 1, label = b.textContent;
      if (cut && b.title !== label) { b.title = label; b.dataset.gcChipTitle = '1'; }
      else if (!cut && b.dataset.gcChipTitle) { b.removeAttribute('title'); delete b.dataset.gcChipTitle; }
    });
  }
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(mark); }
  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('toggle', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
