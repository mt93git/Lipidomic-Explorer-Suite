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
        // The Updating/Generating skeleton (card_status.js) covers the plot; it is not a control to move to Data.
        if (sibling === a || sibling.classList.contains('tc-card-skeleton') || /^(STYLE|SCRIPT|LINK)$/.test(sibling.tagName)) return;
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
  // Toolbars keep their original DOM/handlers and cancel the camera scale locally.
  // Only this small toolbar uses CSS zoom: unlike an inverse transform, it does not
  // leave a large untransformed layout box overflowing a card at >100%.
  // The transformed board contains fixed descendants, so positions are local.
  function setStyle(el, prop, value) {
    // CSSOM serializes fractional pixels with limited precision. Stable writes keep
    // the placement observer from waking itself indefinitely after fractional zoom.
    if (/^-?[0-9.]+px$/.test(value)) value=(Math.round(parseFloat(value)*1000)/1000)+'px';
    if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
  }
  // RC4's framed cards (card_frame.js) paint this toolbar as their footer, Edit · Duplicate · ⋯. It stays
  // screen-size at every Canvas zoom: docked in the card's footer (absolute, card_frame.css) while that
  // footer is tall and wide enough for it on screen, otherwise floating at screen size over the card's
  // lower edge, shown on hover, selection or keyboard focus like the plain toolbar.
  var DOCK_ZOOM = 0.9, DOCK_WIDTH = 240;
  function place(node, view) {
    var bar = node.querySelector(':scope > .tc-node-head > .tc-card-actions');
    if (!bar) return;
    // An open ⋯ menu (card_frame.js) stays where it opened: re-placing the bar under it moved the
    // menu hundreds of pixels and a click meant for Remove landed on the plot. Placed again on close.
    if (node.classList.contains('tc-card-menu-open')) return;
    var zoom = window.TeamCanvasViewport ? TeamCanvasViewport.scale : 1;
    var counter=1/zoom;
    // CSS zoom serialization also rounds reciprocals such as 1 / 1.5.
    if(bar._tcZoom!==counter){bar._tcZoom=counter;bar.style.zoom=counter===1?'':String(counter);}
    var nr = node.getBoundingClientRect(), framed = node.classList.contains('tc-card-framed');
    // Docked only while the card's footer is inside the canvas view: a card larger than the view (high
    // zoom) or partly scrolled out keeps its actions floating at the view's lower edge, still reachable.
    var dockable = framed && zoom >= DOCK_ZOOM - 0.005 && nr.width >= DOCK_WIDTH;
    var docked = dockable && (!view || (nr.bottom <= view.bottom + 0.5 && nr.bottom - 40 >= view.top));
    // No room to float it in view (only the card's top shows, or the view is short): keep it in the footer,
    // where scrolling the card into view reaches it.
    if (dockable && !docked) {
      var hb = node.querySelector(':scope > .tc-node-head').getBoundingClientRect();
      if (nr.bottom <= view.top || nr.top >= view.bottom || Math.max(hb.bottom, view.top) + 2 + 34 > view.bottom) docked = true;
    }
    // The docked bar ends left of the card's resize grip (16 px in card units, so 16*zoom on screen): at
    // high zoom the grip would otherwise cover ⋯.
    var dockWidth = Math.max(0, nr.width - 8 - Math.max(8, 16 * zoom + 2)), shift = 0, nav = view && view.nav;
    // A card in the navigation box's corner: its footer buttons start right of the box, or, with no room
    // there, the bar floats (placed clear of the box below).
    if (docked && nav) {
      var need = Array.prototype.reduce.call(bar.children, function (sum, c) { return sum + c.getBoundingClientRect().width + 4; }, 0);
      if (nr.left + 8 < nav.right && nr.left + 8 + need > nav.left && nr.bottom - 35 < nav.bottom && nr.bottom - 5 > nav.top) {
        shift = nav.right + 4 - (nr.left + 8);
        if (shift + need > dockWidth) { docked = false; shift = 0; }
      }
    }
    if (bar.classList.contains('tc-card-docked') !== docked) bar.classList.toggle('tc-card-docked', docked);
    setStyle(bar,'width',docked?(dockWidth-shift)+'px':'');
    if (!nr.width || !view || nr.right <= view.left || nr.left >= view.right || nr.bottom <= view.top || nr.top >= view.bottom) { setStyle(bar, 'visibility', 'hidden'); return; }
    // A toolbar wider than the canvas wraps instead of running under the inspector.
    setStyle(bar, 'max-width', Math.max(120, Math.floor(view.right - view.left - 8)) + 'px');
    var br = bar.getBoundingClientRect(), head = node.querySelector(':scope > .tc-node-head').getBoundingClientRect();
    var left, top;
    if (docked) {
      left=nr.left+8+shift;top=nr.bottom-35;
    } else if (framed) {
      // The footer's place: over the card's lower edge (as much of it as is in view), never over the title.
      left = Math.max(view.left + 4, Math.min(nr.left + 4, view.right - br.width - 4));
      top = Math.max(Math.min(nr.bottom, view.bottom) - br.height - 4, Math.max(head.bottom, view.top) + 2);
    } else {
      left = Math.min(nr.right - br.width, view.right - br.width - 4); left = Math.max(left, view.left + 4);
      top = nr.top - br.height;
      if (top < view.top + 2) top = Math.max(head.bottom, view.top) + 2;
    }
    // The navigation box is fixed in the view's lower-left corner (canvas_viewport.js): a floating bar
    // never sits under it (its ⋯ would be unreachable); it moves right of the box, or above it.
    nav = !docked && view.nav;
    if (nav && left < nav.right && left + br.width > nav.left && top < nav.bottom && top + br.height > nav.top) {
      if (nav.right + 4 + br.width <= view.right - 4) left = nav.right + 4; else top = nav.top - br.height - 4;
    }
    if (top + br.height > view.bottom) { setStyle(bar, 'visibility', 'hidden'); return; }
    setStyle(bar, 'visibility', '');
    setStyle(bar,'position',docked?'absolute':'fixed');
    var parent=docked?(bar.offsetParent||node):node.closest('.tc-board');
    if(!docked&&parent&&getComputedStyle(parent).transform==='none')parent=null;
    var pr=parent?parent.getBoundingClientRect():{left:0,top:0};
    setStyle(bar, 'left', ((left-pr.left)/(zoom*counter)-(parent?parent.clientLeft-parent.scrollLeft:0)/counter) + 'px');
    setStyle(bar, 'top', ((top-pr.top)/(zoom*counter)-(parent?parent.clientTop-parent.scrollTop:0)/counter) + 'px');
  }
  function start() {
    var root = document.getElementById('team-canvas-root'), board = root && root.querySelector('.tc-board');
    if (!board) return;
    var queued = false;
    var scroll = board.closest('.tc-scroll') || board, placing = false;
    function view() { var v = scroll.getBoundingClientRect(), n = root.querySelector('.tc-navigation'), nr = n && n.getBoundingClientRect(); return { left: Math.max(0, v.left), top: Math.max(0, v.top), right: Math.min(window.innerWidth, v.right), bottom: Math.min(window.innerHeight, v.bottom), nav: nr && nr.width ? nr : null }; }
    function placeAll() {
      placing = false;
      // A wheel/pinch/pan gesture (canvas_viewport.js) hides the toolbars: placed once at its end.
      if (root.classList.contains('tc-gesturing')) return;
      var v = view();
      board.querySelectorAll(':scope > .tc-node').forEach(function (n) { place(n, v); });
    }
    function schedulePlace() { if (!placing) { placing = true; requestAnimationFrame(placeAll); } }
    function sweep() { queued = false; board.querySelectorAll(':scope > .tc-node').forEach(function (n) { mark(n); actions(n); }); placeAll(); }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(sweep); } }
    // Panning (canvas or page) and window resizes move cards on screen without a DOM change.
    document.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
    window.addEventListener('resize', schedulePlace);
    // The navigation box's band (canvas_viewport.js) moves the view's lower edge without either.
    window.addEventListener('team-canvas-nav-inset', schedulePlace);
    window.addEventListener('team-canvas-gesture-end', schedulePlace);
    // The minimap folding or unfolding changes the navigation box's size (toggle does not bubble).
    document.addEventListener('toggle', function (e) { if (e.target.closest && e.target.closest('.tc-navigation')) schedulePlace(); }, true);
    // The view's own size changes too (bands and panels around the canvas come and go) without a
    // scroll or window resize: a bar placed for the old view was stale until the next sweep.
    if (window.ResizeObserver) new ResizeObserver(schedulePlace).observe(scroll);
    // Plotly restyles its own SVG constantly (hover, zoom): those attribute changes never
    // affect what is parked, so only structural changes inside a plot wake the sweep.
    // Moving a card (drag, arrow keys) only rewrites its own or the board's style: that
    // moves the toolbar but cannot change what is parked, so re-place instead of a full
    // sweep of every card on each drag frame.
    function moveOnly(r) { return r.type === 'attributes' && r.attributeName === 'style' && (r.target === board || r.target.parentElement === board); }
    new MutationObserver(function (records) { var relevant = records.filter(function (r) { return r.type === 'childList' || !(r.target.closest && r.target.closest('.js-plotly-plot')); }); if (!relevant.length) return; if (relevant.every(moveOnly)) schedulePlace(); else schedule(); }).observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden'] });
    window.addEventListener('team-canvas-restored', schedule);
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['data-team-stage'] });
    // Shiny triggers its events through jQuery; native listeners never see them.
    if (window.jQuery) jQuery(document).on('shiny:value', schedule);
    schedule();
    // place: card_frame.js frames a card in its own frame, after this file's sweep of that frame; it
    // places the bar at once, so a new framed card is docked (or floating) from its first painted frame.
    window.TeamCardFigure = { chrome: function (node) { mark(node); return Array.from(node.querySelectorAll('.' + CHROME)); }, refresh: schedule,
      place: function (node) { if (node && node.parentElement === board) place(node, view()); } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
