/* Team Canvas: visible feedback for removing a card (Remove, Return, an illustration's Remove).
   canvas.js calls TeamCanvasFeedback.remove(node, options) for a person's click:
   - the card fades and shrinks out (150 ms, opacity/transform only; none with reduced motion),
   - then options.commit() runs canvas.js's unchanged removal (same state, same changed() save),
   - then a toast says what happened, with Undo for about 6 s: options.undo() brings the card
     back from its saved node; the toast follows it until the card is on the canvas again.
   commit() returns true (removed), false (refused: the card stays, canvas.js said why on its
   status line) or null (the card was already gone). A refusal or an error is shown in the toast.
   The canvas status line (.tc-status, the live region) keeps reporting every change; while the
   toast shows the same news, the band's copy of that line is hidden so it is not shown twice. */
(function () {
  'use strict';
  var LEAVE_MS = 150, SHOW_MS = 6000, ERROR_MS = 9000, toast = null, timer = 0, follow = null, serial = 0;
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function root() { return document.getElementById('team-canvas-root'); }
  function statusLine() { var r = root(); return r && r.querySelector('.tc-status'); }
  // The band's status pill is hidden while the toast carries the same message; any new message shows it again.
  var quietObserver = null;
  function quietStatus(on) {
    var r = root(), line = statusLine(); if (!r) return;
    if (quietObserver) { quietObserver.disconnect(); quietObserver = null; }
    r.classList.toggle('tc-feedback-quiet', !!on);
    if (on && line && window.MutationObserver) {
      quietObserver = new MutationObserver(function () { quietStatus(false); });
      quietObserver.observe(line, { childList: true, characterData: true, subtree: true });
    }
  }
  function place(el) {
    var r = root(), view = r && (r.querySelector('.tc-scroll') || r);
    var box = view && view.getClientRects().length ? view.getBoundingClientRect() : { left: 0, right: window.innerWidth, bottom: window.innerHeight };
    var bottom = Math.max(0, Math.min(window.innerHeight, box.bottom));
    el.style.left = Math.round((Math.max(0, box.left) + Math.min(window.innerWidth, box.right)) / 2) + 'px';
    el.style.bottom = Math.round(window.innerHeight - bottom + 20) + 'px';
  }
  function close() {
    clearTimeout(timer); timer = 0; if (follow) { follow.disconnect(); follow = null; }
    quietStatus(false);
    if (!toast) return; var old = toast; toast = null;
    var hadFocus = old.contains(document.activeElement), back = old.tcFocusBack;
    // A closing toast takes no more clicks (its Undo must not run twice).
    old.inert = true; Array.prototype.forEach.call(old.querySelectorAll('button'), function (b) { b.disabled = true; });
    old.classList.remove('is-shown');
    setTimeout(function () { old.remove(); }, reduced() ? 0 : 160);
    // Focus goes back where it came from, or to a canvas control when that is gone.
    if (hadFocus) {
      var r = root(), line = statusLine();
      var target = [back, line && line.tabIndex >= 0 ? line : null, r && r.querySelector('[aria-label="More canvas actions"]'), r && r.querySelector('.tc-reset')].find(function (el) { return el && el.isConnected && !el.disabled && !el.closest('[inert]') && el.getClientRects().length; });
      if (target) target.focus({ preventScroll: true });
    }
  }
  function arm(ms) {
    clearTimeout(timer); timer = setTimeout(close, ms);
  }
  // One toast at a time: a new one replaces the last (its Undo is no longer offered).
  // Also used by canvas.js for Return all ("Returned N items · Undo"): one toast for every canvas removal.
  function show(text, options) {
    options = options || {};
    close();
    var el = document.createElement('div'); el.className = 'tc-feedback-toast' + (options.error ? ' is-error' : '') + (options.className ? ' ' + options.className : '');
    // An unexpected error has no other announcement; other news is announced by the canvas status line.
    if (options.alert) el.setAttribute('role', 'alert'); else { el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Canvas notification'); }
    var message = document.createElement('span'); message.className = 'tc-feedback-text'; message.textContent = text; message.id = 'tc-feedback-text-' + (++serial); el.appendChild(message);
    var undo = null;
    if (options.undo) {
      undo = document.createElement('button'); undo.type = 'button'; undo.className = 'tc-feedback-undo' + (options.undoClassName ? ' ' + options.undoClassName : ''); undo.textContent = 'Undo';
      undo.setAttribute('aria-describedby', message.id);
      // One shot: a second activation does nothing.
      var used = false; undo.addEventListener('click', function () { if (used || toast !== el) return; used = true; undo.disabled = true; options.undo(); }); el.appendChild(undo);
    }
    var dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'tc-feedback-close'; dismiss.setAttribute('aria-label', 'Dismiss'); dismiss.textContent = '×';
    dismiss.addEventListener('click', close); el.appendChild(dismiss);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
    // Reading or reaching for Undo pauses the countdown.
    var ms = options.ms || SHOW_MS;
    el.addEventListener('pointerenter', function () { clearTimeout(timer); });
    el.addEventListener('pointerleave', function () { if (toast === el && !el.contains(document.activeElement)) arm(ms); });
    el.tcFocusBack = el.contains(document.activeElement) ? null : document.activeElement;
    el.addEventListener('focusin', function (e) { clearTimeout(timer); if (e.relatedTarget && !el.contains(e.relatedTarget)) el.tcFocusBack = e.relatedTarget; });
    el.addEventListener('focusout', function (e) { if (toast === el && !el.contains(e.relatedTarget)) arm(ms); });
    document.body.appendChild(el); place(el); toast = el;
    requestAnimationFrame(function () { el.classList.add('is-shown'); });
    if (options.quiet) quietStatus(true);
    if (options.focus && undo) undo.focus();
    // A focused toast keeps its Undo until focus leaves it (focusout starts the countdown).
    if (!el.contains(document.activeElement)) arm(ms);
    return el;
  }
  function cardFor(id) {
    var r = root(), board = r && r.querySelector('.tc-board'); if (!board || !id) return null;
    return Array.prototype.find.call(board.querySelectorAll(':scope > .tc-node'), function (n) { return n.dataset.canvasOrderId === id || n.dataset.plotId === id; }) || null;
  }
  function enter(node) {
    if (!node || reduced()) return;
    node.classList.add('tc-feedback-entering');
    setTimeout(function () { node.classList.remove('tc-feedback-entering'); }, 400);
  }
  // Undo: the card returns at once (a library plot, an illustration) or after its independent
  // copy is created again (asynchronous). The toast follows until the card is back.
  function restoredText(options) { return 'Restored ' + options.label + '.' + (options.finished ? ' Finished figure: choose Edit, then Finish plot, before exporting it again.' : ''); }
  function undo(options) {
    var ok = false;
    try { ok = options.undo(); } catch (error) { if (window.console) console.error('Canvas undo failed', error); ok = false; }
    if (!ok) { show('Couldn’t bring back ' + options.label + '. Add it again from the plot library.', { error: true, alert: true, ms: ERROR_MS }); return; }
    var back = cardFor(options.id);
    if (back) { enter(back); show(restoredText(options), { ms: options.finished ? 6000 : 3000, quiet: true }); return; }
    show('Restoring ' + options.label + '…', { ms: 120000 });
    // Checked every 200 ms until the card is mounted (up to 2 minutes, the copy's own request budget).
    var waiting = toast, until = Date.now() + 120000;
    follow = { disconnect: function () { clearInterval(poll); } };
    var poll = setInterval(function () {
      if (toast !== waiting || Date.now() > until) { clearInterval(poll); return; }
      var node = cardFor(options.id); if (!node) return;
      clearInterval(poll); follow = null; enter(node); show(restoredText(options), { ms: options.finished ? 6000 : 3000, quiet: true });
    }, 200);
  }
  function refused(node, options, error) {
    if (node && node.isConnected) { node.classList.remove('tc-feedback-leaving'); node.inert = false; }
    var what = options.kind === 'return' ? 'return' : 'remove';
    var parts = ['Couldn’t ' + what + ' ' + options.label + '.'];
    if (error) parts.push('Something went wrong.'); else if (options.kind === 'return') parts.push('Its original view has changed.');
    if (node && node.isConnected) parts.push('It stays on the canvas.');
    // A refusal is also on the status line (canvas.js); an error is not.
    show(parts.join(' '), { error: true, alert: !!error, quiet: !error, ms: ERROR_MS });
  }
  function remove(node, options) {
    if (!node || node.classList.contains('tc-feedback-leaving')) return;
    var wait = reduced() ? 0 : LEAVE_MS, phase = 'pending';
    node.classList.add('tc-feedback-leaving'); node.inert = true;
    var text = options.kind === 'return' ? 'Returned ' + options.label + ' to its original view.' : 'Removed ' + options.label + '.';
    // Shown at once, before any teardown: on a busy page the click is still answered right away.
    // Undo before the removal ran just keeps the card.
    var shown = show(text, { focus: !!options.keyboard, undo: options.undo ? function () {
      if (phase === 'pending') { phase = 'cancelled'; node.classList.remove('tc-feedback-leaving'); node.inert = false; show(options.label + ' stays on the canvas.', { ms: 3000 }); return; }
      if (phase === 'done') undo(options);
    } : null });
    function finish() {
      if (phase !== 'pending') return; phase = 'committing';
      var result;
      try { result = options.commit(); }
      catch (error) { phase = 'failed'; if (window.console) console.error('Canvas card removal failed', error); refused(node, options, error); return; }
      if (result === null) { phase = 'failed'; if (node.isConnected) { node.classList.remove('tc-feedback-leaving'); node.inert = false; } if (toast === shown) close(); return; }
      if (!result) { phase = 'failed'; refused(node, options, null); return; }
      phase = 'done';
      if (toast !== shown) return;
      if (result.warning) { shown.classList.add('is-error'); shown.querySelector('.tc-feedback-text').textContent = text + ' ' + result.warning; arm(ERROR_MS); }
      quietStatus(true);
    }
    if (!wait) { finish(); return; }
    node.addEventListener('transitionend', function (e) { if (e.target === node && e.propertyName === 'opacity') finish(); });
    setTimeout(finish, wait + 60);
  }
  window.addEventListener('resize', function () { if (toast) place(toast); });
  window.TeamCanvasFeedback = { remove: remove, refuse: function (node, options) { refused(node, options, null); }, show: show, close: close, current: function () { return toast; } };
})();
/* Team-only diagnostic: uncaught browser errors reach the service log (team_client_error_observer in
   R/frontends/team/canvas_state.R), so a report such as "Remove does nothing" can be matched to its
   exception. At most 20 per page; only the error text (user data patterns redacted), script
   file:line:col and three stack frames (code locations), each cut to 500 characters, with query
   strings dropped. */
(function () {
  'use strict';
  var sent = 0, MAX = 20;
  function cut(x) { return String(x == null ? '' : x).slice(0, 500); }
  // Error text written by the app can quote user data (file names, labels, values): data file names,
  // e-mail addresses, long numbers and long quoted text are replaced before anything is sent.
  function redact(x) {
    return cut(String(x == null ? '' : x)
      .replace(/[^\s'"()\/\\]+\.(?:csv|tsv|txt|xlsx?|xls|zip|json|mztab|parquet|rds|rdata|pdf|png|svg)\b/gi, '[file]')
      .replace(/[^\s@'"]+@[^\s@'"]+\.[a-z]{2,}/gi, '[email]')
      .replace(/\d{6,}/g, '[number]')
      .replace(/(['"\u201c\u2018])([^'"\u201d\u2019]{41,})(['"\u201d\u2019])/g, '$1[text]$3'));
  }
  function bare(x) { return String(x).replace(/[?#][^\s):]*/g, ''); }
  function where(file, line, col) { return file ? cut(bare(file).split('/').slice(-2).join('/') + ':' + line + ':' + col) : ''; }
  // Only code locations leave the page: a stack line is kept only when it is a frame (V8 "at …(file:line:col)"
  // or "fn@file:line:col"), and only its script file:line:col. A message's continuation lines, which
  // also appear in the stack, and function names are dropped.
  // The message itself (which can contain frame-shaped lines) is cut off the top of a V8 stack first,
  // and only this page's own scripts count as frames.
  var FRAME = /^\s*(?:at\s+(?:[^()]*\()?|[^\s@()]*@)((?:https?|file|blob):\/\/[^\s()]+?|[^\s()]+?\.js)(?:[?#][^\s():]*)?:(\d+):(\d+)\)?\s*$/;
  function ownScript(file) { return !!file && file.indexOf(location.origin + '/') === 0 && /\.js$/.test(file); }
  function frames(error) {
    var stack = error && error.stack, out = []; if (!stack) return '';
    stack = String(stack);
    var head = String(error.name || 'Error') + (error.message ? ': ' + error.message : '');
    if (stack.indexOf(head) === 0) stack = stack.slice(head.length);
    else if (error.message && stack.indexOf(String(error.message)) >= 0) stack = stack.slice(stack.indexOf(String(error.message)) + String(error.message).length);
    stack.split('\n').forEach(function (line) { var m = out.length < 3 && FRAME.exec(line); if (m && ownScript(m[1])) out.push(where(m[1], m[2], m[3])); });
    return cut(out.join(' | '));
  }
  function firstLine(x) { return String(x == null ? '' : x).split(/[\r\n]/)[0]; }
  function send(value) {
    if (sent >= MAX || !window.Shiny || typeof Shiny.setInputValue !== 'function') return;
    sent++; try { Shiny.setInputValue('team_client_error', value, { priority: 'event' }); } catch (ignore) {}
  }
  window.addEventListener('error', function (e) {
    if (typeof ErrorEvent === 'undefined' || !(e instanceof ErrorEvent)) return; // not a failed image or script load
    send({ kind: 'error', message: redact(firstLine(e.message)), where: ownScript(bare(e.filename || '')) ? where(e.filename, e.lineno, e.colno) : '', stack: frames(e.error) });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    send({ kind: 'rejection', message: redact(firstLine(reason && reason.message || reason)), where: '', stack: frames(reason) });
  });
  window.TeamClientErrors = { sent: function () { return sent; } };
})();
