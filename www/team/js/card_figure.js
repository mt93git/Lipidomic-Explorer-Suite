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
  // classList.add rewrites the attribute even when the class is present, which
  // would wake the board observer every frame; write only real changes.
  function addOnce(el, cls) { if (!el.classList.contains(cls)) el.classList.add(cls); }
  function mark(node) {
    var content = node.querySelector(':scope > .tc-content'), plot = plotOf(node);
    // A hidden canvas (Review, Data, compose) measures 0: keep the current marks.
    if (!node.getClientRects().length) return;
    var on = !!(content && plot && eligible(node) && plot.offsetHeight > 0 && content.contains(plot));
    var was = node.classList.contains('tc-figure-card'), before = node.querySelectorAll('.' + CHROME).length;
    node.classList.toggle('tc-figure-card', on);
    if (!on) { node.querySelectorAll('.' + CHROME + ',.' + PARK).forEach(function (el) { el.classList.remove(CHROME, PARK); el.inert = false; }); return; }
    for (var a = plot; a && a !== content; a = a.parentElement) {
      Array.prototype.forEach.call(a.parentElement.children, function (sibling) {
        if (sibling === a || /^(STYLE|SCRIPT|LINK)$/.test(sibling.tagName)) return;
        // Hidden or empty outputs (details, compact selectors) stay where their module put them.
        if (!sibling.classList.contains(CHROME) && !shown(sibling)) return;
        addOnce(sibling, CHROME);
        // Parked controls are off-screen: keep them out of the tab order until the Data tab shows them.
        if (!sibling.inert) sibling.inert = true;
        if (contents(sibling)) Array.prototype.forEach.call(sibling.children, function (c) { addOnce(c, PARK); });
      });
    }
    // The plot gained the room the parked content used: let it fill the card.
    if ((!was || node.querySelectorAll('.' + CHROME).length !== before) && window.TeamCanvas && TeamCanvas.fitPlot) TeamCanvas.fitPlot(node.dataset.plotId);
  }
  // Card actions live in one compact toolbar that shows on hover, selection or
  // keyboard focus; the title keeps one line. Buttons move, never re-created.
  function actions(node) {
    var head = node.querySelector(':scope > .tc-node-head'); if (!head) return;
    var bar = head.querySelector(':scope > .tc-card-actions');
    var loose = Array.prototype.filter.call(head.children, function (c) { return c.tagName === 'BUTTON'; });
    if (!loose.length) return;
    if (!bar) { bar = document.createElement('div'); bar.className = 'tc-card-actions'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Card actions'); head.appendChild(bar); }
    loose.forEach(function (b) { bar.appendChild(b); });
  }
  // The board is CSS-zoomed, so a toolbar inside the header would shrink with
  // it and, far out, crowd the title. It stays in the header (same buttons,
  // ids and handlers) but is fixed-positioned at screen size: counter-zoomed
  // and anchored just above the card's top edge, or below the header when the
  // card's top is at the canvas edge. Never over the title.
  function setStyle(el, prop, value) { if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value); }
  function place(node, view) {
    var bar = node.querySelector(':scope > .tc-node-head > .tc-card-actions');
    if (!bar) return;
    var nr = node.getBoundingClientRect();
    if (!nr.width || !view || nr.right <= view.left || nr.left >= view.right || nr.bottom <= view.top || nr.top >= view.bottom) { setStyle(bar, 'visibility', 'hidden'); return; }
    // CSSOM rounds zoom when serialising it back: compare the requested value,
    // or every sweep would rewrite the style and wake the board observer again.
    var zoom = node.currentCSSZoom || 1, counter = Math.round(1e4 / zoom) / 1e4;
    if (bar._tcZoom !== counter) { bar._tcZoom = counter; bar.style.zoom = counter === 1 ? '' : String(counter); }
    // A toolbar wider than the canvas wraps instead of running under the inspector.
    setStyle(bar, 'max-width', Math.max(120, Math.floor(view.right - view.left - 8)) + 'px');
    var br = bar.getBoundingClientRect(), head = node.querySelector(':scope > .tc-node-head').getBoundingClientRect();
    var left = Math.min(nr.right - br.width, view.right - br.width - 4); left = Math.max(left, view.left + 4);
    var top = nr.top - br.height;
    if (top < view.top + 2) top = Math.max(head.bottom, view.top) + 2;
    if (top + br.height > view.bottom) { setStyle(bar, 'visibility', 'hidden'); return; }
    setStyle(bar, 'visibility', '');
    setStyle(bar, 'left', Math.round(left) + 'px'); setStyle(bar, 'top', Math.round(top) + 'px');
  }
  function start() {
    var root = document.getElementById('team-canvas-root'), board = root && root.querySelector('.tc-board');
    if (!board) return;
    var queued = false;
    var scroll = board.closest('.tc-scroll') || board, placing = false;
    function placeAll() {
      placing = false;
      var v = scroll.getBoundingClientRect(); v = { left: Math.max(0, v.left), top: Math.max(0, v.top), right: Math.min(window.innerWidth, v.right), bottom: Math.min(window.innerHeight, v.bottom) };
      board.querySelectorAll(':scope > .tc-node').forEach(function (n) { place(n, v); });
    }
    function schedulePlace() { if (!placing) { placing = true; requestAnimationFrame(placeAll); } }
    function sweep() { queued = false; board.querySelectorAll(':scope > .tc-node').forEach(function (n) { mark(n); actions(n); }); placeAll(); }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(sweep); } }
    // Panning (canvas or page) and window resizes move cards on screen without a DOM change.
    document.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
    window.addEventListener('resize', schedulePlace);
    // Plotly restyles its own SVG constantly (hover, zoom): those attribute changes never
    // affect what is parked, so only structural changes inside a plot wake the sweep.
    new MutationObserver(function (records) { if (records.some(function (r) { return r.type === 'childList' || !(r.target.closest && r.target.closest('.js-plotly-plot')); })) schedule(); }).observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden'] });
    window.addEventListener('team-canvas-restored', schedule);
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['data-team-stage'] });
    // Shiny triggers its events through jQuery; native listeners never see them.
    if (window.jQuery) jQuery(document).on('shiny:value', schedule);
    schedule();
    window.TeamCardFigure = { chrome: function (node) { mark(node); return Array.from(node.querySelectorAll('.' + CHROME)); }, refresh: schedule };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
