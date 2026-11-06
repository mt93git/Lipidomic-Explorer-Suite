/* Team shell: one status badge per canvas card (from TeamCanvas.cardStatus) in the
   card header, with at most one action and a plain-language explanation; one
   global strip only while the whole canvas waits on the user (data changes not
   prepared, no prepared data, or a study design to confirm); and a warning in
   the Export figure menu while any card is not up to date. Presentation only:
   it reads state and clicks existing controls, never changes how figures are
   computed or saved. */
(function () {
  'use strict';
  // [badge text, explanation]. Keys are TeamCanvas.cardStatus states, plus
  // 'needs-data': a 'pending' card while there is no prepared data at all.
  var LABELS = {
    current: ['Up to date', 'This figure shows your latest prepared data.'],
    updating: ['Updating…', 'This figure is redrawing with your latest prepared data. It updates on its own.'],
    pending: ['Changes pending', 'Your data changes are not prepared yet, so this figure still shows the previous result. Prepare them in Review to update it.'],
    'needs-data': ['Needs data', 'There is no prepared data for this figure yet. Prepare your data in Review and it draws on its own.'],
    finished: ['Finished', 'This figure is frozen. Choose Edit to change it.'],
    'finished-stale': ['Finished · out of date', 'Your data changed after this figure was finished. Choose Edit figure to redraw it with the current data.'],
    error: ['Could not update', 'This figure could not be drawn from your current data. Open Data & settings on this card for details.'],
    waiting: ['Needs settings', 'This figure is waiting for a choice or an analysis step. Open Data & settings on this card.']
  };
  // Last preparation state sent by the server (same message canvas.js reads).
  var preparation = null;
  window.addEventListener('team-preparation-state', function (e) { preparation = e.detail || null; });
  function kindOf(state) {
    if (state !== 'pending') return state;
    // Never prepared: there is no previous result to show, so the card needs data, not a re-run.
    if (preparation && preparation.applied === false) return 'needs-data';
    return preparation && !preparation.pending && preparation.ready !== true ? 'needs-data' : 'pending';
  }
  function openReview() { var b = document.querySelector('[data-tw-stage="review"]'); if (b) b.click(); }
  // A view that runs only on request (structural analysis): its module button sits in
  // the card's Data & settings; the badge offers the same click. Same input id, same handler.
  function runButton(id, button) { return document.getElementById(String(id).split('-')[0] + '-' + button); }
  function dataSettings(node) {
    var b = node.querySelector('[data-canvas-data-settings]');
    return b ? ['Data & settings', function () { b.click(); }] : null;
  }
  function action(state, node, need) {
    if (state === 'waiting' && need && need.kind === 'run') { var run = runButton(node.dataset.plotId, need.button); if (run) return [need.action, function () { if (window.jQuery) jQuery(run).trigger('click'); else run.click(); }]; }
    if (state === 'waiting' && need && need.kind === 'design') {
      // A paired design is not a missing step: no button that suggests changing it.
      var label = need.gate === 'design' || !need.gate ? 'Study design' : need.button;
      if (label) return [label, openReview];
    }
    if (state === 'pending') return ['Review', openReview];
    if (state === 'finished-stale') return ['Edit figure', function () { var b = Array.from(node.querySelectorAll('.tc-node-head > button, .tc-card-actions > button')).find(function (x) { return x.textContent === 'Edit'; }); if (b) b.click(); }];
    // Any other waiting card (a time or comparison requirement) keeps Data & settings as its one action.
    if (state === 'error' || state === 'waiting') return dataSettings(node);
    return null;
  }
  var descSeq = 0;
  function chipFor(node) {
    var head = node.querySelector(':scope > .tc-node-head'); if (!head) return null;
    var chip = head.querySelector(':scope > .tc-card-status');
    if (!chip) {
      chip = document.createElement('span'); chip.className = 'tc-card-status';
      var dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
      var text = document.createElement('span'); text.className = 'tc-card-status-text';
      // The explanation is read with the badge and describes its action button.
      var desc = document.createElement('span'); desc.className = 'tc-card-status-desc'; desc.id = 'tc-card-status-desc-' + (++descSeq);
      chip.append(dot, text, desc);
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
    var kind = kindOf(state), key = kind + '|' + (need ? need.status : '');
    node._tcNeed = need;
    if (chip.dataset.state === state && chip.dataset.need === key) return state;
    var label = need ? [need.status, need.reason] : LABELS[kind];
    chip.dataset.state = state; chip.dataset.kind = kind; chip.dataset.need = key; chip.title = label[1];
    chip.querySelector('.tc-card-status-text').textContent = label[0];
    var desc = chip.querySelector('.tc-card-status-desc'); desc.textContent = label[1];
    var old = chip.querySelector('button'); if (old) old.remove();
    var act = action(state, node, need);
    if (act) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = act[0]; b.setAttribute('aria-describedby', desc.id);
      b.addEventListener('click', function (e) { e.stopPropagation(); act[1](); }); chip.appendChild(b);
    }
    return state;
  }
  // One sentence and one action while the whole canvas waits on the user; never a per-card list.
  function globalWait(states, nodes) {
    if (states.indexOf('pending') >= 0) {
      return kindOf('pending') === 'needs-data'
        ? ['Your data are not prepared yet, so the figures cannot be drawn.', 'Open Review', openReview]
        : ['Data changes are waiting to be prepared. The figures show the previous result until then.', 'Review changes', openReview];
    }
    var design = nodes.filter(function (n, i) { var need = n._tcNeed; return states[i] === 'waiting' && need && need.kind === 'design' && (need.gate === 'design' || !need.gate); });
    if (design.length > 1) return ['Some figures need a confirmed study design before they can be drawn.', 'Study design', openReview];
    return null;
  }
  function stripFor(root) {
    var strip = root.querySelector('.tc-global-wait'); if (strip) return strip;
    var status = root.querySelector('.tc-status'), main = root.querySelector('.tc-main'); if (!status && !main) return null;
    strip = document.createElement('div'); strip.className = 'tc-global-wait'; strip.hidden = true;
    strip.setAttribute('role', 'status'); strip.setAttribute('aria-live', 'polite');
    var text = document.createElement('span'); text.className = 'tc-global-wait-text';
    var button = document.createElement('button'); button.type = 'button';
    button.addEventListener('click', function () { if (strip._tcAction) strip._tcAction(); });
    strip.append(text, button);
    // In the toolbar band's status slot (canvas_band_status.js), ahead of the notice line.
    var band = window.TeamCanvasBand && TeamCanvasBand.slot(root);
    if (band) band.prepend(strip); else if (status) status.parentNode.insertBefore(strip, status); else main.prepend(strip);
    return strip;
  }
  function start() {
    var root = document.getElementById('team-canvas-root'), board = root && root.querySelector('.tc-board');
    if (!board) return;
    // One quiet announcement for the whole canvas instead of one per card.
    var live = document.createElement('span'); live.className = 'tc-card-status-desc tc-card-status-live'; live.setAttribute('aria-live', 'polite'); root.appendChild(live);
    var was = { updating: 0, error: 0 }, reannounce = null;
    function announce(count) {
      var text = '';
      if (count.updating) text = was.updating ? '' : 'Updating figures…';
      else if (was.updating) text = count.error ? 'Figures finished updating. ' + count.error + (count.error === 1 ? ' figure' : ' figures') + ' could not update.' : 'Figures finished updating.';
      else if (count.error > was.error) text = count.error === 1 ? 'A figure could not update.' : count.error + ' figures could not update.';
      was = count;
      if (!text) return;
      // The same sentence twice in a row is cleared first so screen readers announce it again.
      clearTimeout(reannounce);
      if (live.textContent === text) { live.textContent = ''; reannounce = setTimeout(function () { live.textContent = text; }, 60); } else live.textContent = text;
    }
    var queued = false;
    function paint() {
      queued = false;
      var behind = [], nodes = [], states = [], count = { updating: 0, error: 0 };
      board.querySelectorAll(':scope > .tc-node[data-plot-id]').forEach(function (node) {
        var s = paintCard(node);
        nodes.push(node); states.push(s);
        if (s === 'updating') count.updating++; if (s === 'error') count.error++;
        if (s && s !== 'current' && s !== 'finished') behind.push((node.querySelector('.tc-node-head > strong') || {}).textContent || 'A figure');
      });
      announce(count);
      var strip = stripFor(root), wait = globalWait(states, nodes);
      if (strip) {
        if (wait) {
          var text = strip.querySelector('.tc-global-wait-text'), button = strip.querySelector('button');
          if (text.textContent !== wait[0]) { text.textContent = wait[0]; text.title = wait[0]; }
          if (button.textContent !== wait[1]) button.textContent = wait[1];
          strip._tcAction = wait[2];
        }
        if (strip.hidden !== !wait) strip.hidden = !wait;
      }
      var menu = root.querySelector('.ts-export'); if (!menu) return;
      var warn = menu.querySelector('.ts-export-warning'), list = menu.querySelector('.ts-menu-list,[role="menu"]') || menu;
      if (!warn) { warn = document.createElement('p'); warn.className = 'ts-menu-note ts-export-warning'; warn.setAttribute('role', 'alert'); list.prepend(warn); }
      var note = behind.length ? behind.length + (behind.length === 1 ? ' figure is' : ' figures are') + ' not up to date (' + behind.join(', ') + '). The export would show older or incomplete results.' : '';
      if (warn.textContent !== note) warn.textContent = note;
      if (warn.hidden !== !behind.length) warn.hidden = !behind.length; menu.classList.toggle('has-stale', behind.length > 0);
      // The same warning where Export figure moves into ⋯ (phones, or a narrow canvas column at fit level 3):
      // placed before those items and shown only when they are (canvas_header.css).
      var more = root.querySelector('.ts-more > .ts-menu'), first = more && more.querySelector(':scope > .ts-menu-item.ts-phone-only[data-ts-fit="3"][data-ts-export]');
      if (first) {
        var w2 = more.querySelector(':scope > .ts-more-export-warning');
        if (!w2) { w2 = document.createElement('p'); w2.className = 'ts-menu-note ts-export-warning ts-more-export-warning'; w2.setAttribute('role', 'alert'); more.insertBefore(w2, first); }
        if (w2.textContent !== note) w2.textContent = note;
        if (w2.hidden !== !behind.length) w2.hidden = !behind.length;
      }
    }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(paint); } }
    new MutationObserver(schedule).observe(board, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'], attributeOldValue: false });
    // Shiny's events arrive through jQuery; the canvas ones are native window events.
    if (window.jQuery) jQuery(document).on('shiny:busy shiny:idle shiny:value', schedule);
    ['team-canvas-selection', 'team-preparation-state'].forEach(function (e) { window.addEventListener(e, schedule); });
    // Preparation state lives in canvas.js; a light poll catches changes that emit no DOM event.
    setInterval(function () { if (root.offsetParent !== null) schedule(); }, 1500);
    schedule();
    // The canvas notice line (action feedback) lives in the toolbar band: canvas_band_status.js.
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
