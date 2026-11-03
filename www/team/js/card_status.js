/* Team shell: one status chip per canvas card (from TeamCanvas.cardStatus) with
   at most one action, and a warning in the Export figure menu while any card
   is not up to date. Presentation only: it reads state and clicks existing
   controls, never changes how figures are computed or saved. */
(function () {
  'use strict';
  var LABELS = {
    current: ['Up to date', 'This figure shows the current prepared result.'],
    updating: ['Updating…', 'This figure is redrawing with the current prepared result.'],
    pending: ['Data changes pending', 'Review has unapplied changes. Prepare them to update this figure.'],
    finished: ['Finished', 'Frozen figure. Choose Edit to change it.'],
    'finished-stale': ['Finished · out of date', 'The prepared data changed after this figure was finished. Edit it to redraw.'],
    error: ['Could not update', 'This figure could not be drawn from the current result. Open its Data tab for details.'],
    waiting: ['Needs settings', 'This plot is waiting for a selection or an analysis. Open its Data & settings.']
  };
  // A view that runs only on request (structural analysis): its module button sits in
  // the card's Data & settings; the chip offers the same click. Same input id, same handler.
  function runButton(id, button) { return document.getElementById(String(id).split('-')[0] + '-' + button); }
  function action(state, node, need) {
    if (state === 'waiting' && need && need.kind === 'run') { var run = runButton(node.dataset.plotId, need.button); if (run) return [need.action, function () { if (window.jQuery) jQuery(run).trigger('click'); else run.click(); }]; }
    if (state === 'waiting' && need && need.kind === 'design') return ['Study design', function () { var b = document.querySelector('[data-tw-stage="review"]'); if (b) b.click(); }];
    if (state === 'pending') return ['Review', function () { var b = document.querySelector('[data-tw-stage="review"]'); if (b) b.click(); }];
    if (state === 'finished-stale') return ['Edit figure', function () { var b = Array.from(node.querySelectorAll('.tc-node-head > button, .tc-card-actions > button')).find(function (x) { return x.textContent === 'Edit'; }); if (b) b.click(); }];
    return null;
  }
  function chipFor(node) {
    var head = node.querySelector(':scope > .tc-node-head'); if (!head) return null;
    var chip = head.querySelector(':scope > .tc-card-status');
    if (!chip) {
      chip = document.createElement('span'); chip.className = 'tc-card-status';
      var dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
      var text = document.createElement('span'); text.className = 'tc-card-status-text';
      chip.append(dot, text);
      var title = head.querySelector(':scope > strong'); if (title) title.after(chip); else head.prepend(chip);
    }
    return chip;
  }
  var updatingSince = new WeakMap();
  function paintCard(node) {
    var id = node.dataset.plotId, state = id && window.TeamCanvas && TeamCanvas.cardStatus ? TeamCanvas.cardStatus(id) : null;
    // Autosave and unrelated outputs briefly mark Shiny busy; show Updating only once it persists.
    if (state === 'updating') { var since = updatingSince.get(node) || Date.now(); updatingSince.set(node, since); if (Date.now() - since < 2000 && node.querySelector('.tc-card-status[data-state]')) state = node.querySelector('.tc-card-status').dataset.state; }
    else updatingSince.delete(node);
    var chip = chipFor(node); if (!chip) return null;
    chip.hidden = !state; if (!state) return null;
    // A plot with a known requirement names it (catalog: study design, comparison, time points,
    // a structural run). The requirement can change while the card keeps waiting, so it is part of the key.
    var need = state === 'waiting' && window.TeamCanvasCatalog && TeamCanvasCatalog.needs && TeamCanvas.catalogSource ? TeamCanvasCatalog.needs(TeamCanvas.catalogSource(id), id) : null;
    var key = state + '|' + (need ? need.status : '');
    if (chip.dataset.state === state && chip.dataset.need === key) return state;
    var label = need ? [need.status, need.reason] : LABELS[state];
    chip.dataset.state = state; chip.dataset.need = key; chip.title = label[1];
    chip.querySelector('.tc-card-status-text').textContent = label[0];
    var old = chip.querySelector('button'); if (old) old.remove();
    var act = action(state, node, need);
    if (act) { var b = document.createElement('button'); b.type = 'button'; b.textContent = act[0]; b.addEventListener('click', function (e) { e.stopPropagation(); act[1](); }); chip.appendChild(b); }
    return state;
  }
  function start() {
    var root = document.getElementById('team-canvas-root'), board = root && root.querySelector('.tc-board');
    if (!board) return;
    var queued = false;
    function paint() {
      queued = false;
      var behind = [];
      board.querySelectorAll(':scope > .tc-node[data-plot-id]').forEach(function (node) {
        var s = paintCard(node);
        if (s && s !== 'current' && s !== 'finished') behind.push((node.querySelector('.tc-node-head > strong') || {}).textContent || 'A figure');
      });
      var menu = root.querySelector('.ts-export'); if (!menu) return;
      var warn = menu.querySelector('.ts-export-warning'), list = menu.querySelector('.ts-menu-list,[role="menu"]') || menu;
      if (!warn) { warn = document.createElement('p'); warn.className = 'ts-menu-note ts-export-warning'; warn.setAttribute('role', 'alert'); list.prepend(warn); }
      var text = behind.length ? behind.length + (behind.length === 1 ? ' figure is' : ' figures are') + ' not up to date (' + behind.join(', ') + '). The export would show older or incomplete results.' : '';
      if (warn.textContent !== text) warn.textContent = text;
      warn.hidden = !behind.length; menu.classList.toggle('has-stale', behind.length > 0);
    }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(paint); } }
    new MutationObserver(schedule).observe(board, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'], attributeOldValue: false });
    // Shiny's events arrive through jQuery; the canvas ones are native window events.
    if (window.jQuery) jQuery(document).on('shiny:busy shiny:idle shiny:value', schedule);
    ['team-canvas-selection', 'team-preparation-state'].forEach(function (e) { window.addEventListener(e, schedule); });
    // Preparation state lives in canvas.js; a light poll catches changes that emit no DOM event.
    setInterval(function () { if (root.offsetParent !== null) schedule(); }, 1500);
    schedule();
    // The canvas status line becomes a short notice: it shows when the message
    // changes and fades after a few seconds instead of a permanent strip that
    // covered the bottom of the cards. Card state lives in each card's chip.
    var line = root.querySelector('.tc-status'), timer = null, last = '';
    if (line) new MutationObserver(function () {
      var text = line.textContent.trim(); if (text === last) return; last = text;
      clearTimeout(timer); line.classList.toggle('is-visible', !!text);
      // Forget the message when it fades, so the same notice can show again later.
      if (text) timer = setTimeout(function () { line.classList.remove('is-visible'); last = ''; }, 6000);
    }).observe(line, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
