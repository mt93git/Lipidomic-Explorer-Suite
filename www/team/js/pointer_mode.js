/* Canvas pointer mode: Select (default) or Move (pan by dragging), on the Draft and on the Figure page.
   Camera only: a pan changes scrollLeft/Top of the surface on screen (the Draft's .tc-scroll, or the
   Figure page's desk .tc-preview-pages) and nothing else, so cards, page objects, checkpoint, the figure
   document and both undo histories never see it. One mode for both surfaces: the pair in the rail is the
   same control on both pages, and switching page keeps the mode. */
(function () {
  'use strict';
  var api = window.TeamCanvasPointerMode = { mode: 'select' };
  // Same focus guard as the canvas shortcuts (canvas.js), plus the widgets that own their keys:
  // Plotly (plot and modebar), selectize, comboboxes, list boxes and menus.
  var TYPING = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
  var WIDGET = TYPING + ',.js-plotly-plot,.modebar,.modebar-container,.selectize-control,.selectize-dropdown,[role="combobox"],[role="listbox"],[role="menu"],[role="menubar"],[role^="menuitem"]';
  var CONTROL = WIDGET + ',button,a[href],summary,[role="button"],[role="tab"],[role="option"]';
  var SAY = {
    select: 'Select mode: click a plot to edit it, drag its header to move it. Press H to pan.',
    hand: 'Move mode: drag anywhere to pan the canvas. Press V to select plots again.'
  };
  // The Figure page's own words, written to its status line (the Draft's is not shown there).
  var SAY_FIGURE = {
    select: 'Select mode: click an object on the page to edit it, drag it to move it. Press H to pan.',
    hand: 'Move mode: drag anywhere to pan the page. Press V to select objects again.'
  };
  var ARROW = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 2.2v11l2.9-2.7 1.9 4 1.7-.8-1.9-3.9h3.9z" fill="currentColor"/></svg>';
  var HAND = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5.2 8.6V4a1 1 0 0 1 2 0v3.6M7.2 7.4V2.9a1 1 0 0 1 2 0v4.5M9.2 7.4V3.7a1 1 0 0 1 2 0v4.1M11.2 7.8V5.6a1 1 0 0 1 2 0v4.3c0 2.9-2 4.9-4.6 4.9-1.7 0-2.8-.7-3.7-1.9L2.6 9.8a1 1 0 0 1 1.6-1.2l1 1.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // The Select / Move pair sits in the shell's left rail (.ts-rail), under the panel buttons. The rail is
  // a grid column of fixed size, so the mascot's obstacles (context_help.js: .tc-navigation, .ts-rail,
  // .tc-toolbar, ...) keep production's rectangles. The navigation box is not touched.
  function mountGroup(root) {
    var rail = root.querySelector('.ts-rail');
    if (!rail) return null;
    var group = rail.querySelector(':scope > .tc-pointer-mode');
    if (group) return group;
    group = document.createElement('div');
    group.className = 'tc-pointer-mode'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Pointer mode');
    group.innerHTML = '<button type="button" class="tc-pointer-select" aria-pressed="true" aria-label="Select" aria-keyshortcuts="V" title="Select (V)">' + ARROW + '</button>' +
      '<button type="button" class="tc-pointer-hand" aria-pressed="false" aria-label="Move" aria-keyshortcuts="H" title="Move: drag to pan (H, or hold Space)">' + HAND + '</button>';
    // Before the inspector toggle (inspector_toggle.js) when it is already there: DOM order = visual order.
    rail.insertBefore(group, rail.querySelector(':scope > .ts-inspector-toggle'));
    return group;
  }

  function mount(root) {
    var scroll = root.querySelector('.tc-scroll');
    if (!scroll || root.dataset.tcPointerMode === 'true') return root.dataset.tcPointerMode === 'true';
    var group = mountGroup(root);
    if (!group) return false;
    root.dataset.tcPointerMode = 'true';
    var mode = 'select', spaceHeld = false, pan = null, justPanned = false;
    var selectButton = group.querySelector('.tc-pointer-select'), handButton = group.querySelector('.tc-pointer-hand');
    var help = root.querySelector('.tc-save-help .tc-help-content') || root.querySelector('.tc-save-help');
    if (help && !help.querySelector('.tc-pointer-help')) {
      var p = document.createElement('p'); p.className = 'tc-pointer-help';
      p.textContent = 'Press V to select and move plots, H to pan the canvas by dragging, or hold Space to pan for a moment. The middle mouse button always pans.';
      help.appendChild(p);
    }

    // The Figure page's desk (canvas.R markup; canvas_preview.js moves it, never recreates it). Bound
    // once it exists; looked up again in case the preview builds after this mounts.
    var preview = null, desk = null;
    function bindDesk() {
      if (desk) return desk;
      preview = root.querySelector('#tc-preview-panel');
      var d = preview && preview.querySelector('.tc-preview-pages');
      if (!d) return null;
      desk = d; bindSurface(desk); paint();
      return desk;
    }
    function hand() { return mode === 'hand' || spaceHeld; }
    function paint() {
      // data-mode: select, hand (H / the Move button) or space (held Space, temporary).
      var h = hand(), state = spaceHeld && mode !== 'hand' ? 'space' : h ? 'hand' : 'select';
      if (selectButton.getAttribute('aria-pressed') !== String(!h)) selectButton.setAttribute('aria-pressed', String(!h));
      if (handButton.getAttribute('aria-pressed') !== String(h)) handButton.setAttribute('aria-pressed', String(h));
      if (group.dataset.mode !== state) group.dataset.mode = state;
      [scroll, desk].forEach(function (s) { if (s && s.classList.contains('is-hand') !== h) s.classList.toggle('is-hand', h); });
      api.mode = h ? 'hand' : 'select';
    }
    function tell(next) {
      var figure = shown() === desk && desk;
      var status = figure ? preview.querySelector('.tc-preview-status') : root.querySelector('.tc-status');
      if (status) status.textContent = (figure ? SAY_FIGURE : SAY)[next];
    }
    function setMode(next) {
      if (next !== 'select' && next !== 'hand') return;
      bindDesk();
      var changed = next !== mode; mode = next; paint();
      if (changed) tell(next);
    }
    api.setMode = setMode;
    selectButton.addEventListener('click', function () { setMode('select'); });
    handButton.addEventListener('click', function () { setMode('hand'); });

    function sized(s) { return !!(s && s.getClientRects().length && s.clientWidth); }
    // The surface on screen: the Figure page's desk while that page is shown (it replaces the Draft in
    // the canvas cell), otherwise the Draft canvas; null when neither has a size (another step, a modal
    // page, the Figure page before its desk lays out).
    function shown() {
      bindDesk();
      if (preview && !preview.hidden) return sized(desk) ? desk : null;
      return sized(scroll) ? scroll : null;
    }
    function onCanvas(target, surface) {
      return target === document.body || target === document.documentElement || (surface.contains(target) && !target.closest(CONTROL));
    }
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || (e.getModifierState && e.getModifierState('AltGraph'))) return;
      var t = e.target instanceof Element ? e.target : document.body;
      if (e.code === 'Space' || e.key === ' ') {
        var surface = shown();
        if (e.shiftKey || !surface || !onCanvas(t, surface)) return;
        e.preventDefault();
        if (!spaceHeld) { spaceHeld = true; paint(); }
        return;
      }
      var key = (e.key || '').toLowerCase();
      if ((key !== 'v' && key !== 'h') || e.shiftKey || e.repeat) return;
      if (!(root.contains(t) || t === document.body || t === document.documentElement) || t.closest(WIDGET + ',button,[role="button"]') || !shown()) return;
      e.preventDefault();
      setMode(key === 'h' ? 'hand' : 'select');
    });
    // Keyboard isolation on the Figure page: in Move (held Space included) a focused page object's own
    // arrow-key nudge (canvas_preview.js) does not run, so the camera mode never edits the document. Capture
    // phase, before the object's handler; fields, text areas and contenteditable are not page objects.
    document.addEventListener('keydown', function (e) {
      if (!hand() || !desk || !/^Arrow(Left|Right|Up|Down)$/.test(e.key || '')) return;
      var t = e.target instanceof Element ? e.target : null;
      if (!t || !desk.contains(t) || !t.closest('.tc-free-item') || t.closest(TYPING)) return;
      e.preventDefault(); e.stopPropagation();
    }, true);
    function releaseSpace() { if (spaceHeld) { spaceHeld = false; paint(); } }
    document.addEventListener('keyup', function (e) { if (e.code === 'Space' || e.key === ' ') releaseSpace(); });
    window.addEventListener('blur', releaseSpace);

    // Pointer pan. Capture phase on the surface (.tc-scroll, or the Figure page's desk), so the card's own
    // pointerdown handlers (select, move by header, geometry gesture, drag to a tab), a page object's
    // (select, move, resize, focus) and Plotly never receive the gesture. No wheel or gesture listener:
    // trackpad scrolling, browser pinch and the desk's own zoom are untouched.
    function onScrollbar(e, s) {
      if (e.target !== s) return false;
      var r = s.getBoundingClientRect();
      return e.clientX - r.left - s.clientLeft >= s.clientWidth || e.clientY - r.top - s.clientTop >= s.clientHeight;
    }
    function bindSurface(s) {
      s.addEventListener('pointerdown', function (e) {
        var middle = e.button === 1;
        if (!(middle || (e.button === 0 && hand())) || onScrollbar(e, s)) return;
        // A second finger while panning is swallowed too: it never reaches a card or a page object.
        e.preventDefault(); e.stopPropagation();
        if (pan) return;
        try { s.setPointerCapture(e.pointerId); } catch (err) {}
        pan = { id: e.pointerId, x: e.clientX, y: e.clientY, surface: s };
        s.classList.add('is-panning');
      }, true);
      s.addEventListener('pointermove', function (e) {
        if (!pan || pan.surface !== s || e.pointerId !== pan.id) return;
        var dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        if (!dx && !dy) return;
        // Scroll is measured in zoomed pixels already, so the pointer delta applies 1:1.
        pan.x = e.clientX; pan.y = e.clientY;
        s.scrollLeft -= dx; s.scrollTop -= dy;
        e.preventDefault(); e.stopPropagation();
      }, true);
      function endPan(e) {
        if (!pan || pan.surface !== s || (e && e.pointerId !== undefined && e.pointerId !== pan.id)) return;
        pan = null; s.classList.remove('is-panning');
        // The click that ends this gesture is swallowed even if Space was released first.
        justPanned = true; setTimeout(function () { justPanned = false; }, 0);
        if (e && e.type !== 'lostpointercapture') { try { s.releasePointerCapture(e.pointerId); } catch (err) {} }
      }
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) { s.addEventListener(name, endPan, true); });
      // Compatibility mouse events and the click that follows a pan never reach the cards or page objects
      // in Move (a page object takes focus, and with it the selection, on mousedown); a middle-button
      // press never starts the browser's autoscroll or opens a link.
      ['mousedown', 'click', 'dblclick', 'auxclick'].forEach(function (name) {
        s.addEventListener(name, function (e) {
          // detail 0 is a keyboard-made click (Enter/Space on a focused button): keyboard use stays as it is.
          if (e.type !== 'mousedown' && !e.detail) return;
          if (e.button === 1 || (e.button === 0 && (justPanned || (hand() && !onScrollbar(e, s))))) { e.preventDefault(); e.stopPropagation(); }
        }, true);
      });
    }
    bindSurface(scroll);
    bindDesk();
    paint();
    return true;
  }

  function start() {
    var root = document.getElementById('team-canvas-root');
    if (root && mount(root)) return;
    // canvas.js builds the canvas and shell.js the rail when the workspace initialises; wait for both.
    var observer = new MutationObserver(function () {
      var r = document.getElementById('team-canvas-root');
      if (r && mount(r)) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
