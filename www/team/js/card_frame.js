/* Team shell: a clean plot card. The card shows its title (with the status badge in its
   header slot), the plot and a footer with three actions: Edit, Duplicate and ⋯.
   - The footer bar is card_figure.js's .tc-card-actions toolbar, still inside the header
     (every lookup of header buttons keeps working), painted over an in-card spacer
     (.tc-card-foot) by card_frame.css; canvas.js leaves the plot room for the spacer.
   - Edit opens the inspector on this card and focuses its tabs; on a finished figure it
     clicks the card's own Edit (unfreeze) button.
   - Duplicate is canvas.js's own button, moved. Cards that cannot be copied have none.
   - ⋯ is a disclosure holding every other original header button (Finish plot, Copy,
     Controls, Data & settings, Enlarge plot, Return/Remove), moved, never re-created.
   Presentation only. Illustrations keep their own card. */
(function () {
  'use strict';
  var seq = 0;
  function ours(el) { return el.classList.contains('tc-card-edit') || el.classList.contains('tc-card-more-wrap'); }
  function finishButton(node) { return node.querySelector('.tc-card-menu > button[aria-pressed]'); }
  function openInspector(node) {
    // The inspector selects a card on any click inside it (this one included); then go to its tabs.
    requestAnimationFrame(function () {
      var inspector = document.getElementById('tc-selection-inspector');
      if (!inspector || inspector.hidden || !node.classList.contains('is-selected')) return;
      var tab = inspector.querySelector('.tc-inspector-tab[aria-selected="true"]:not([hidden])');
      var locked = inspector.querySelector('.tc-inspector-locked:not([hidden]) button');
      (tab && !tab.closest('[hidden]') ? tab : locked || inspector.querySelector('.tc-inspector-header button')).focus();
    });
  }
  function closeMenu(wrap, focusToggle) {
    var toggle = wrap.querySelector(':scope > .tc-card-more'), menu = wrap.querySelector(':scope > .tc-card-menu');
    if (!menu.hidden) { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    var node = wrap.closest('.tc-node');
    if (node && node.classList.contains('tc-card-menu-open')) node.classList.remove('tc-card-menu-open');
    if (focusToggle) toggle.focus();
  }
  // Opens upward over the card; downward when the canvas view has no room above the footer.
  function openMenu(wrap, node) {
    var toggle = wrap.querySelector(':scope > .tc-card-more'), menu = wrap.querySelector(':scope > .tc-card-menu');
    node.classList.add('tc-card-menu-open');
    menu.classList.remove('is-below', 'is-left'); menu.hidden = false; toggle.setAttribute('aria-expanded', 'true');
    var view = node.closest('.tc-scroll'), vr = view ? view.getBoundingClientRect() : null, top = Math.max(0, vr ? vr.top : 0), left = Math.max(0, vr ? vr.left : 0);
    var bottom = Math.min(window.innerHeight, vr ? vr.bottom : window.innerHeight);
    menu.style.maxHeight = ''; menu.style.overflowY = '';
    var above = menu.getBoundingClientRect();
    if (above.top < top) {
      menu.classList.add('is-below');
      // Neither side may have room for the whole menu: keep the side with more room and let the menu scroll.
      var below = menu.getBoundingClientRect();
      if (below.bottom > bottom) {
        var roomAbove = above.bottom - top, roomBelow = bottom - below.top;
        if (roomAbove > roomBelow) menu.classList.remove('is-below');
        menu.style.maxHeight = Math.max(32, Math.floor(Math.max(roomAbove, roomBelow) - 4)) + 'px'; menu.style.overflowY = 'auto';
      }
    }
    // Right-aligned to ⋯ by default; near the canvas's left edge (small cards, low zoom) it opens rightwards instead.
    if (menu.getBoundingClientRect().left < left) menu.classList.add('is-left');
  }
  // After an action the menu folds and its focused button is hidden: focus goes back to the visible ⋯,
  // or to the card's header if the ⋯ is not on screen, or to the canvas status line (which reports the
  // change) if the action removed the card. An action that moved focus on purpose (the inspector, a
  // dialog) keeps it.
  function restoreFocus(wrap, node) {
    requestAnimationFrame(function () {
      var active = document.activeElement;
      if (active && active !== document.body && !wrap.contains(active) && active.isConnected) return;
      var toggle = wrap.querySelector(':scope > .tc-card-more');
      if (node.isConnected && toggle && toggle.getClientRects().length && getComputedStyle(toggle).visibility !== 'hidden') { toggle.focus(); return; }
      var head = node.isConnected && node.querySelector(':scope > .tc-node-head');
      if (head && head.tabIndex >= 0 && head.getClientRects().length) { head.focus(); return; }
      var status = document.querySelector('#team-canvas-root .tc-status[tabindex]');
      if (status && status.getClientRects().length) status.focus();
    });
  }
  function build(bar, node) {
    var edit = document.createElement('button'); edit.type = 'button'; edit.className = 'tc-card-edit'; edit.textContent = 'Edit';
    edit.addEventListener('click', function () {
      var finish = finishButton(node);
      if (node.classList.contains('tc-finished') && finish && !finish.disabled) { finish.click(); return; }
      openInspector(node);
    });
    var wrap = document.createElement('div'); wrap.className = 'tc-card-more-wrap';
    var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'tc-card-more'; toggle.textContent = '⋯';
    var menu = document.createElement('div'); menu.className = 'tc-card-menu'; menu.id = 'tc-card-menu-' + (++seq); menu.hidden = true;
    menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'More card actions');
    toggle.setAttribute('aria-label', 'More card actions'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', menu.id);
    toggle.addEventListener('click', function () {
      var open = menu.hidden;
      document.querySelectorAll('.tc-card-more-wrap').forEach(function (w) { if (w !== wrap) closeMenu(w, false); });
      if (!open) { closeMenu(wrap, false); return; }
      openMenu(wrap, node);
      var first = Array.prototype.find.call(menu.querySelectorAll('button:not(:disabled)'), function (b) { return b.getClientRects().length > 0; }); if (first) first.focus();
    });
    // An action ran (or the card went away): fold the menu back and give focus a visible home.
    menu.addEventListener('click', function (e) { if (e.target.closest('button')) { closeMenu(wrap, false); restoreFocus(wrap, node); } });
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || menu.hidden) return;
      // Handled here: the canvas would otherwise deselect the card on the same Escape.
      e.preventDefault(); e.stopPropagation(); closeMenu(wrap, true);
    });
    wrap.addEventListener('focusout', function (e) { if (!menu.hidden && e.relatedTarget && !wrap.contains(e.relatedTarget)) closeMenu(wrap, false); });
    wrap.append(toggle, menu);
    bar.prepend(edit); bar.appendChild(wrap);
    return wrap;
  }
  function frame(node) {
    if (!node.dataset.plotId || node.classList.contains('tc-illustration')) return;
    var head = node.querySelector(':scope > .tc-node-head'); if (!head) return;
    var bar = head.querySelector(':scope > .tc-card-actions'), added = false;
    if (!bar) { bar = document.createElement('div'); bar.className = 'tc-card-actions'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Card actions'); head.appendChild(bar); }
    var wrap = bar.querySelector(':scope > .tc-card-more-wrap') || build(bar, node), menu = wrap.querySelector(':scope > .tc-card-menu');
    // Original buttons, wherever card_figure.js or canvas.js left them: Duplicate after Edit, the rest in ⋯.
    var loose = Array.prototype.filter.call(head.children, function (c) { return c.tagName === 'BUTTON'; })
      .concat(Array.prototype.filter.call(bar.children, function (c) { return c.tagName === 'BUTTON' && !ours(c); }));
    loose.forEach(function (b) {
      if (b.textContent === 'Duplicate') { if (b.parentNode !== bar || b.previousElementSibling !== bar.querySelector(':scope > .tc-card-edit')) bar.querySelector(':scope > .tc-card-edit').after(b); }
      else menu.appendChild(b);
    });
    var framing = !node.classList.contains('tc-card-framed');
    if (framing) node.classList.add('tc-card-framed');
    var foot = node.querySelector(':scope > .tc-card-foot');
    if (!foot) { foot = document.createElement('div'); foot.className = 'tc-card-foot'; foot.setAttribute('aria-hidden', 'true'); node.appendChild(foot); added = true; }
    // The plot gives the footer its room.
    if (added && window.TeamCanvas && TeamCanvas.fitPlot) TeamCanvas.fitPlot(node.dataset.plotId);
    // card_figure.js placed the bar earlier in this frame, before the card was framed: dock it now
    // instead of one frame later (its observer would only catch up on the next sweep).
    if (framing && window.TeamCardFigure && TeamCardFigure.place) TeamCardFigure.place(node);
  }
  function start() {
    var root = document.getElementById('team-canvas-root'), board = root && root.querySelector('.tc-board');
    if (!board) return;
    var queued = false;
    function sweep() {
      queued = false;
      if (!document.body.classList.contains('ts-shell-app')) return;
      board.querySelectorAll(':scope > .tc-node').forEach(frame);
    }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(sweep); } }
    // New cards and header buttons arrive as child changes; Plotly's own churn is ignored.
    new MutationObserver(function (records) {
      if (records.some(function (r) { return !(r.target.closest && r.target.closest('.js-plotly-plot,.tc-content')); })) schedule();
    }).observe(board, { childList: true, subtree: true });
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('team-canvas-restored', schedule);
    // A click elsewhere folds an open ⋯ menu.
    document.addEventListener('pointerdown', function (e) {
      document.querySelectorAll('.tc-card-more-wrap').forEach(function (w) { if (!w.contains(e.target)) closeMenu(w, false); });
    }, true);
    schedule();
    window.TeamCardFrame = { refresh: schedule };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
