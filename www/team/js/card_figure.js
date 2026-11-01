/* Team shell: a canvas card shows its figure. The module's other content
   (heading, selectors, notes, download row, insight) is marked as card chrome:
   parked off-screen while the card is idle, moved into the inspector's Data
   tab while it is selected. Nodes move, never re-created, so every Shiny id
   and binding stays; off-screen (not display:none) keeps outputs rendering. */
(function () {
  'use strict';
  var CHROME = 'tc-figure-chrome', PARK = 'tc-figure-park';
  function plotOf(node) {
    var id = node.dataset.plotId;
    return id ? node.querySelector('#' + CSS.escape(id)) : null;
  }
  // Group comparison owns its controls and report; illustrations and finished
  // snapshots have no live module content to move.
  function eligible(node) {
    return !node.classList.contains('tc-illustration') && !node.classList.contains('tc-finished') && !node.querySelector('.gc-root');
  }
  // A display:contents output (e.g. the heatmap's group selector) has no box
  // of its own: it moves as one unit, but its children are what get parked.
  function contents(el) { return getComputedStyle(el).display === 'contents'; }
  function shown(el) { return el.offsetHeight > 0 || contents(el) && Array.prototype.some.call(el.children, shown); }
  function mark(node) {
    var content = node.querySelector(':scope > .tc-content'), plot = plotOf(node);
    var on = !!(content && plot && eligible(node) && plot.offsetHeight > 0 && content.contains(plot));
    node.classList.toggle('tc-figure-card', on);
    if (!on) { node.querySelectorAll('.' + CHROME + ',.' + PARK).forEach(function (el) { el.classList.remove(CHROME, PARK); }); return; }
    for (var a = plot; a && a !== content; a = a.parentElement) {
      Array.prototype.forEach.call(a.parentElement.children, function (sibling) {
        if (sibling === a || /^(STYLE|SCRIPT|LINK)$/.test(sibling.tagName)) return;
        // Hidden or empty outputs (details, compact selectors) stay where their module put them.
        if (!sibling.classList.contains(CHROME) && !shown(sibling)) return;
        sibling.classList.add(CHROME);
        if (contents(sibling)) Array.prototype.forEach.call(sibling.children, function (c) { c.classList.add(PARK); });
      });
    }
  }
  function start() {
    var root = document.getElementById('team-canvas-root'), board = root && root.querySelector('.tc-board');
    if (!board) return;
    var queued = false;
    function sweep() { queued = false; board.querySelectorAll(':scope > .tc-node').forEach(mark); }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(sweep); } }
    new MutationObserver(schedule).observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden'] });
    document.addEventListener('shiny:value', schedule);
    schedule();
    window.TeamCardFigure = { chrome: function (node) { mark(node); return Array.from(node.querySelectorAll('.' + CHROME)); }, refresh: schedule };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
