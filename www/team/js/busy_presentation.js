/* W6a: presentation layer for the Team busy dialog (#team-foreground, owned by foreground.js).
 * Read-only: it never opens, closes or locks anything, never calls Shiny or TeamWorkspace, only
 * reads TeamBusy.pending() and TeamCanvas.restoreProgress(), stores nothing and dispatches no events.
 * Its container is inserted into the dialog once, before the dialog first opens; afterwards only
 * text-node data, attributes and inline styles change (no childList mutation: canvas.js reacts to
 * document-wide childList changes).
 * Accessibility: the visible phase line, bar, ETA and phrase are decoration (aria-hidden); a polite
 * live region (outside the part that is hidden) announces the phase when it changes, from the first
 * animation frame after the dialog opens, not every count. There is no progressbar role, so the
 * companion's busy check (context_help.js busyFeedbackVisible) sees what production shows.
 *
 * The phase follows the stage the person is looking at (body[data-team-stage]); background work on
 * a hidden Canvas never moves it. Progress is per phase and counts only work of this operation:
 *   prepare   no count exists: indeterminate bar, typical-duration ETA
 *   review    Review plot outputs (by output id) that started (re)drawing in this operation, and of
 *             those the ones drawn since (a new Plotly layout, a new image, an image that finished
 *             loading)
 *   place     Canvas shown: TeamCanvas.restoreProgress(), cards mounted of the cards to restore;
 *             placing ends complete when nothing is left
 *   draw      Canvas shown: card plot outputs that started drawing in this operation, and of those
 *             the ones drawn since
 * Counts are of jobs: an output that starts drawing again (or shows another drawing) adds a job, so
 * the shown count never goes backwards and never reads complete while something is still drawing.
 * A job whose output shows an error finishes as failed ("4/5 (1 failed)"): finished, not drawn. An
 * output whose element is gone leaves its unfinished job; one whose id now names a new element starts
 * that job again. Nothing on a stale card (.tc-stale) is painted. The bar is always the ratio in the text. ETA: while counting, from
 * this step's observed rate (hidden after 15 s without progress); otherwise the step's typical
 * duration (fixed constants below) counted down from its start, then "taking longer than usual".
 *
 * Lipid scene (ux25): a small decorative scene above the phase line, built with the container (no
 * later childList mutation) and shown only while .tbp-body is (so it is display:none, with no running
 * animation, whenever the dialog is closed or shows an error). Phospholipids assemble into a breathing
 * micelle while data is prepared (and for any non-pipeline label), and into a bilayer with one
 * flip-flopping lipid once Review or Canvas work is counted. Only data-scene changes from render();
 * all motion is CSS keyframes on transform/opacity of HTML boxes (composited, no script per frame).
 * Shown in the Team shell only (body.ts-shell-app, busy_presentation.css); static under reduced
 * motion. window.TeamBusyScene.create() returns a fresh copy for another busy container. */
(function () {
  'use strict';
  var PHASES = ['Preparing data', 'Drawing Review plots', 'Placing cards', 'Drawing cards'];
  // Labels (set by foreground.js / review_live.js) that run the data -> Review -> Canvas pipeline.
  var PIPELINE = {'Opening your saved analysis…': 1, 'Recovering your checkpoint…': 1, 'Preparing data…': 1, 'Updating your analysis…': 1};
  var STAGES = {data: 0, review: 1, canvas: 2};
  // Opening a restored Canvas (canvas.js gate): one count, figures ready of figures, read from
  // TeamCanvas.openProgress(); the same bar, time left and phrases as the pipeline.
  var OPENING = 'Preparing your canvas\u2026';
  function openingCount() {
    try { var p = window.TeamCanvas && typeof TeamCanvas.openProgress === 'function' ? TeamCanvas.openProgress() : null; return p && p.total > 0 ? {done: Math.min(p.done | 0, p.total | 0), total: p.total | 0} : null; } catch (e) { return null; }
  }
  var PLOTS = ['.plotly.html-widget-output', '.shiny-plot-output', '.visNetwork.html-widget-output'];
  // Typical step durations where nothing can be counted, measured on RTX (seeded check-copy resume,
  // ux-redesign-evidence/w6a*/: Preparing data 9-15 s, Review redraw 5-8 s, signing in 5 s warm):
  // shown as "about N s left" counted down from the step's start, then "taking longer than usual".
  // Fixed constants: nothing is stored or learned.
  var PHASE_DEFAULT_MS = [15000, 8000, 8000, 8000]; // steps 2-4 only when they have nothing to count
  var LABEL_DEFAULT_MS = {'Signing in\u2026': 10000};
  var TICK_MS = 500, SCAN_MS = 1000, PHRASE_MS = 2500, ETA_MAX_MS = 600000, STALL_MS = 15000, WAIT_MOUNT_MS = 60000;
  var dialog = null, wrap, body, phaseEl, phaseText, liveText, bar, fill, etaEl, etaText, phraseText;
  var ticker = 0, phraseTimer = 0, session = null, motion = null, scene;

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function setText(node, value) { if (node.data !== value) node.data = value; }
  function show(el, on) { if (el.hidden === on) el.hidden = !on; }
  // Pending foreground operations, or null when TeamBusy is absent or fails.
  function pendingOps() {
    try { var n = window.TeamBusy && typeof TeamBusy.pending === 'function' ? TeamBusy.pending() : null; return typeof n === 'number' && isFinite(n) ? n : null; } catch (e) { return null; }
  }
  function label() { var h = dialog.querySelector('h2'); return h ? h.textContent : ''; }
  function phrases() { return Array.isArray(window.TeamBusyPhrases) && window.TeamBusyPhrases.length ? window.TeamBusyPhrases : ['Working…']; }

  // ---- read-only signals (no layout reads: the stage says what is shown) -------------------
  // A drawing's signature: a new value means the output was (re)drawn or finished loading. Images:
  // element identity, source and decoded state; Plotly: the plot node and its _fullLayout object
  // (replaced on every draw), else the .main-svg node; a network: its canvas node.
  var ids = new WeakMap(), nextId = 0;
  function uid(o) { if (!o) return '-'; var v = ids.get(o); if (!v) { v = ++nextId; ids.set(o, v); } return v; }
  function signature(out) {
    if (out.classList.contains('shiny-plot-output')) { var img = out.querySelector('img'); return img ? 'img:' + uid(img) + ':' + img.getAttribute('src') + ':' + (img.complete && img.naturalWidth > 0 ? 1 : 0) : null; }
    if (out.classList.contains('visNetwork')) { var cv = out.querySelector('canvas'); return cv ? 'net:' + uid(cv) : null; }
    var gd = out.classList.contains('js-plotly-plot') ? out : out.querySelector('.js-plotly-plot');
    if (gd && gd._fullLayout) return 'ply:' + uid(gd) + ':' + uid(gd._fullLayout);
    var svg = out.querySelector('.main-svg'); return svg ? 'svg:' + uid(svg) : null;
  }
  function recalculating(out) { return !!out.closest('.recalculating'); }
  function inError(out) { return !!(out.closest('.shiny-output-error') || out.querySelector('.shiny-output-error')); }
  function stale(out) { return !!out.closest('.tc-stale'); }
  function loading(out) { var img = out.classList.contains('shiny-plot-output') && out.querySelector('img'); return !!img && !img.complete; }
  // Shows a finished drawing: not recalculating, not in error, not on a stale card, content painted.
  function painted(out) {
    if (recalculating(out) || inError(out) || stale(out)) return false;
    if (out.classList.contains('shiny-plot-output')) { var img = out.querySelector('img'); return !!img && img.complete && img.naturalWidth > 0; }
    if (out.classList.contains('visNetwork')) { var cv = out.querySelector('canvas'); return !!cv && cv.width > 0 && cv.height > 0; }
    return !!out.querySelector('.main-svg');
  }
  // Jobs of a phase, by output id. An output joins (one job) when recalculating, or when empty (not
  // painted, not in error, not on a stale card: a frozen snapshot awaiting review is not work). The
  // job keeps the signature it started with and is done once the output is painted with another
  // signature, or painted after it was seen loading (an image) or on a stale card (canvas.js clears
  // .tc-stale without redrawing). An OPEN job whose output shows an error (not recalculating)
  // finishes as failed: not drawn, but no longer waited for. A finished job (or a failed one, once its
  // error clears) is armed again, as a new job, only when its output recalculates or its signature
  // changes outside an error. A new element under a known id starts not done (its open job moves to
  // it; after a finished one it is a new job) and is checked from the next scan. An id no longer
  // present: its open job is dropped. Returns whether anything is pending.
  function job(out, was) { return {node: out, was: was, sig: signature(out), done: false, failed: false, sawLoading: false, sawStale: false}; }
  function track(s, outs) {
    var seen = {}, pending = false;
    for (var i = 0; i < outs.length; i++) {
      var out = outs[i], id = out.id;
      if (!id || seen[id]) continue;
      seen[id] = true;
      var it = s.items[id], sig = signature(out);
      if (it && it.node !== out) {
        if (it.done) s.jobs++;
        if (it.failed) s.failedJobs--;
        s.items[id] = job(out, null); pending = true; continue; // the new element is checked from the next scan
      }
      if (!it) {
        if (!recalculating(out) && (painted(out) || inError(out) || stale(out))) continue;
        s.items[id] = it = job(out, sig); s.jobs++;
      } else if (it.done) {
        var again = recalculating(out) || (sig !== it.sig && !inError(out));
        if (!again) { it.sig = sig; continue; }
        s.jobs++; // a new job; the finished one stays counted (a failure no longer shows once retried)
        if (it.failed) s.failedJobs--;
        it.done = it.failed = it.sawLoading = it.sawStale = false; it.was = it.sig;
      }
      it.sig = sig;
      if (loading(out)) it.sawLoading = true;
      if (stale(out)) it.sawStale = true;
      if (painted(out) && (sig !== it.was || it.sawLoading || it.sawStale)) { it.done = true; s.doneJobs++; s.progressAt = s.now; }
      else if (inError(out) && !recalculating(out)) { it.done = it.failed = true; s.doneJobs++; s.failedJobs++; s.progressAt = s.now; }
      else pending = true;
    }
    Object.keys(s.items).forEach(function (id) {
      if (seen[id]) return;
      if (!s.items[id].done) s.jobs--;
      delete s.items[id];
    });
    return pending;
  }
  function restoreLeft() {
    try {
      var p = window.TeamCanvas && typeof TeamCanvas.restoreProgress === 'function' ? TeamCanvas.restoreProgress() : null;
      return p ? Math.max(p.pending | 0, (p.queued | 0) + (p.loading | 0)) : 0;
    } catch (e) { return 0; }
  }
  function outputs(stage) {
    if (stage === 'canvas') { var root = document.getElementById('team-canvas-root'); return root ? root.querySelectorAll(PLOTS.map(function (p) { return '.tc-node ' + p; }).join(',')) : []; }
    var review = document.querySelector('.tw-simple-review');
    return review ? review.querySelectorAll(PLOTS.join(',')) : [];
  }
  function enter(s, i, t) { s.phase = i; s.phaseStart = t; s.items = {}; s.jobs = 0; s.doneJobs = 0; s.failedJobs = 0; s.placeTotal = 0; s.placeDone = 0; s.progressAt = t; s.eta = null; }
  // A probe on a scratch session: does this stage have outputs drawing now? (then the phase starts)
  function probe(s, outs, i, t) {
    var trial = {items: {}, jobs: 0, doneJobs: 0, failedJobs: 0, now: t, progressAt: t};
    if (!track(trial, outs)) return false;
    enter(s, i, t); s.items = trial.items; s.jobs = trial.jobs; s.doneJobs = trial.doneJobs; s.failedJobs = trial.failedJobs; return true;
  }
  function scan(s, t) {
    s.now = t;
    var stage = document.body.dataset.teamStage || '';
    // The stage moved forward since the dialog opened: that is progress even before any output changes.
    var advanced = (STAGES[stage] || 0) > s.openStage;
    if (stage === 'canvas') {
      var left = restoreLeft();
      if (left > 0 && s.phase <= 2) {
        if (s.phase < 2) enter(s, 2, t);
        // Never backwards: cards placed only grow; more cards to place grow the total.
        var placed = Math.max(s.placeDone, s.placeTotal - left);
        if (placed > s.placeDone) { s.placeDone = placed; s.progressAt = t; }
        s.placeTotal = Math.max(s.placeTotal, s.placeDone + left);
        return;
      }
      // Nothing left to place: placing ends complete.
      if (s.phase === 2 && s.placeDone !== s.placeTotal) { s.placeDone = s.placeTotal; s.progressAt = t; }
      var outs = outputs('canvas');
      if (s.phase < 3) {
        if (!probe(s, outs, 3, t) && s.phase < 2 && advanced) enter(s, 3, t);
        return;
      }
      track(s, outs);
      return;
    }
    if (stage === 'review' && s.phase <= 1) {
      var routs = outputs('review');
      if (s.phase < 1) {
        if (!probe(s, routs, 1, t) && advanced) enter(s, 1, t);
        return;
      }
      track(s, routs);
    }
  }
  function counts(s) {
    if (s.phase === 2) return {done: s.placeDone, total: s.placeTotal};
    if (s.phase === 1 || s.phase === 3) return {done: s.doneJobs, total: s.jobs, failed: s.failedJobs};
    return {done: 0, total: 0};
  }

  // ---- rendering into the container built once --------------------------------------------
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  // One phospholipid: polar head and two wavy acyl tails, in nested boxes so that each animation
  // owns one transform (.tbl place, .tbl-j join, .tbl-m bob or flip-flop, .tbl-f tail flex).
  var LIPID = '<svg viewBox="0 0 12 34" width="12" height="34" focusable="false" aria-hidden="true">' +
    '<path class="tbl-t" d="M4 10.5c-2 3.4 2 5.3 0 8.7s2 5.3 0 8.7"/><path class="tbl-t" d="M8 10.5c2 3.4-2 5.3 0 8.7s-2 5.3 0 8.7"/>' +
    '<circle class="tbl-h" cx="6" cy="6" r="5"/><circle class="tbl-s" cx="4.3" cy="4.3" r="1.5"/></svg>';
  function lipid(cls, place, join, move, flex) {
    return '<span class="tbl' + cls + '" style="' + place + '"><span class="tbl-j" style="animation-delay:' + join + 's">' +
      '<span class="tbl-m" style="animation-delay:' + move + 's"><span class="tbl-f" style="animation-delay:' + flex + 's">' + LIPID + '</span></span></span></span>';
  }
  function sceneEl() {
    var i, mic = '', bil = '';
    // Micelle: nine lipids, heads out, tails meeting at the centre (80, 44) of the 160x88 scene.
    for (i = 0; i < 9; i++) mic += lipid(i === 3 ? ' is-warm' : '', 'left:74px;top:8px;transform:rotate(' + i * 40 + 'deg)', (i * 0.11).toFixed(2), 0, (-i * 0.37).toFixed(2));
    // Bilayer: two leaflets of eight columns; the warm lipid of column 5 flip-flops into the gap below.
    for (i = 0; i < 8; i++) {
      var x = 11 + i * 18;
      bil += lipid(i === 5 ? ' is-warm is-flip' : '', 'left:' + x + 'px;top:6px', (i * 0.07).toFixed(2), i === 5 ? 1.5 : (-i * 0.22).toFixed(2), (-i * 0.29).toFixed(2));
      if (i !== 5) bil += lipid(' is-lower', 'left:' + x + 'px;top:48px', (0.3 + i * 0.07).toFixed(2), (-0.9 - i * 0.22).toFixed(2), (-i * 0.31 - 0.5).toFixed(2));
    }
    var n = el('div', 'tbp-scene'); n.setAttribute('aria-hidden', 'true'); n.dataset.scene = 'micelle';
    n.innerHTML = '<div class="tbp-mic"><div class="tbp-mic-core">' + mic + '</div></div><div class="tbp-bil">' + bil + '</div>';
    return n;
  }
  window.TeamBusyScene = {create: sceneEl};
  function build() {
    // .tbp is never hidden (its live region stays in the accessibility tree); .tbp-body is shown
    // while an operation runs.
    wrap = el('div', 'tbp'); body = el('div', 'tbp-body'); body.hidden = true;
    phaseEl = el('p', 'tbp-phase'); phaseEl.setAttribute('aria-hidden', 'true'); phaseText = document.createTextNode(''); phaseEl.appendChild(phaseText);
    // Screen readers hear the phase when it changes (not every count): a polite status line.
    var live = el('span', 'tbp-live'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); liveText = document.createTextNode(''); live.appendChild(liveText);
    bar = el('div', 'tbp-bar is-indeterminate'); bar.setAttribute('aria-hidden', 'true');
    fill = el('span'); bar.appendChild(fill);
    etaEl = el('p', 'tbp-eta'); etaEl.setAttribute('aria-hidden', 'true'); etaText = document.createTextNode(''); etaEl.appendChild(etaText);
    var phraseEl = el('p', 'tbp-phrase'); phraseEl.setAttribute('aria-hidden', 'true'); phraseText = document.createTextNode(''); phraseEl.appendChild(phraseText);
    scene = sceneEl();
    body.append(scene, phaseEl, bar, etaEl, phraseEl);
    wrap.append(live, body);
    dialog.insertBefore(wrap, dialog.querySelector(':scope > button'));
  }
  function seconds(ms) {
    var s = Math.ceil(ms / 1000);
    if (s <= 5) return 'a few seconds';
    if (s < 20) return 'about ' + s + ' s';
    if (s < 90) return 'about ' + Math.ceil(s / 5) * 5 + ' s';
    return 'about ' + Math.round(s / 60) + ' min';
  }
  // Counted steps: time left from this step's observed rate (none before a rate exists), hidden after
  // STALL_MS without progress. Steps without a count: the step's typical duration counted down from
  // its start, then 'taking longer than usual'.
  function estimate(s, t, c, pipeline) {
    var phaseSpent = t - s.phaseStart;
    if (pipeline && s.phase >= 1 && c.total > 0) {
      if (c.done >= c.total || t - s.progressAt > STALL_MS) return null;
      if (c.done > 0 && phaseSpent >= 1500) return {ms: Math.min(phaseSpent * (1 - c.done / c.total) / (c.done / c.total), ETA_MAX_MS), kind: 'rate'};
      return null; // counted, but no rate observed yet: no number rather than a guess
    }
    var typical = pipeline ? PHASE_DEFAULT_MS[s.phase] : LABEL_DEFAULT_MS[s.label];
    if (!typical) return null;
    return {ms: typical - phaseSpent, kind: 'typical'};
  }
  function smooth(s, t, est) {
    if (!est || est.kind === 'typical') { s.eta = est; s.etaOff = 0; return; } // a countdown already
    if (!s.eta || s.eta.kind !== est.kind) { s.eta = {ms: est.ms, at: t, kind: est.kind}; s.etaOff = 0; return; }
    var down = s.eta.ms - (t - s.eta.at);
    // Count down with the clock; follow the estimate (upwards too) once it has disagreed by more than
    // a quarter for two ticks in a row, so a slowdown corrects the time left instead of sticking at it.
    s.etaOff = Math.abs(est.ms - down) > Math.max(3000, down * 0.25) ? s.etaOff + 1 : 0;
    if (s.etaOff >= 2 || down < 1000) { s.eta = {ms: est.ms, at: t, kind: est.kind}; s.etaOff = 0; }
  }
  // A label (re)starts the session's phase, counts and clock.
  function relabel(s, t) { s.label = label(); s.scanAt = -Infinity; enter(s, 0, t); }
  function render() {
    if (!session) return;
    var s = session, t = now();
    if (dialog.classList.contains('has-error')) { show(body, false); return; }
    show(body, true);
    if (label() !== s.label) relabel(s, t);
    if (s.label === OPENING) { renderOpening(s, t); return; }
    var pipeline = !!PIPELINE[s.label];
    if (pipeline && t - s.scanAt >= SCAN_MS) { s.scanAt = t; scan(s, t); }
    var c = pipeline ? counts(s) : {done: 0, total: 0};
    var look = pipeline && s.phase >= 1 ? 'bilayer' : 'micelle';
    if (scene.dataset.scene !== look) scene.dataset.scene = look;
    show(phaseEl, pipeline);
    if (pipeline) setText(phaseText, 'Step ' + (s.phase + 1) + '/' + PHASES.length + ' · ' + PHASES[s.phase] + (s.phase >= 1 && c.total ? ' ' + c.done + '/' + c.total + (c.failed ? ' (' + c.failed + ' failed)' : '') : ''));
    // Announced from the first frame after the dialog appeared: a live region in a dialog that just
    // appeared is often not read when its text is set in the same moment.
    if (s.announce) setText(liveText, pipeline ? 'Step ' + (s.phase + 1) + ' of ' + PHASES.length + ': ' + PHASES[s.phase] : '');
    // Determinate exactly when a count is shown; the bar is that ratio.
    var determinate = pipeline && s.phase >= 1 && c.total > 0;
    var width = determinate ? Math.round(c.done / c.total * 100) + '%' : '';
    if (fill.style.width !== width) fill.style.width = width;
    if (bar.classList.contains('is-indeterminate') === determinate) bar.classList.toggle('is-indeterminate', !determinate);
    smooth(s, t, estimate(s, t, c, pipeline));
    show(etaEl, !!s.eta);
    setText(etaText, !s.eta ? '' : s.eta.kind === 'typical' ? (s.eta.ms > 0 ? seconds(s.eta.ms) + ' left' : 'taking longer than usual\u2026')
      : seconds(s.eta.ms - (t - s.eta.at)) + ' left in this step');
  }
  // "Preparing your canvas · 7 of 17 figures": the bar is that ratio; time left from the observed
  // rate once figures complete (as a counted pipeline step), hidden after STALL_MS without progress.
  function renderOpening(s, t) {
    var c = openingCount() || {done: 0, total: 0};
    if (c.done > (s.openDone || 0)) { s.openDone = c.done; s.progressAt = t; }
    show(phaseEl, true);
    setText(phaseText, 'Preparing your canvas' + (c.total ? ' \u00b7 ' + c.done + ' of ' + c.total + ' figures' : ''));
    if (s.announce) setText(liveText, 'Preparing your canvas');
    var determinate = c.total > 0, width = determinate ? Math.round(c.done / c.total * 100) + '%' : '';
    if (fill.style.width !== width) fill.style.width = width;
    if (bar.classList.contains('is-indeterminate') === determinate) bar.classList.toggle('is-indeterminate', !determinate);
    var spent = t - s.phaseStart, est = null;
    if (determinate && c.done > 0 && c.done < c.total && spent >= 1500 && t - s.progressAt <= STALL_MS) est = {ms: Math.min(spent * (1 - c.done / c.total) / (c.done / c.total), ETA_MAX_MS), kind: 'rate'};
    smooth(s, t, est);
    show(etaEl, !!s.eta);
    setText(etaText, s.eta ? seconds(s.eta.ms - (t - s.eta.at)) + ' left' : '');
  }
  function nextPhrase() { if (!session) return; var list = phrases(); session.phrase = (session.phrase + 1) % list.length; setText(phraseText, list[session.phrase]); }
  // Reduced motion (checked again whenever the preference changes): one phrase, no rotation.
  function rotate() {
    clearInterval(phraseTimer); phraseTimer = 0;
    if (session && !(motion && motion.matches)) phraseTimer = setInterval(nextPhrase, PHRASE_MS);
  }
  function opened() {
    var t = now(), list = phrases();
    session = {announce: false, etaOff: 0, phrase: Math.floor(t / PHRASE_MS) % list.length, openStage: STAGES[document.body.dataset.teamStage || ''] || 0};
    relabel(session, t);
    setText(phraseText, list[session.phrase]);
    render();
    var mine = session;
    (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () { if (session === mine) { mine.announce = true; render(); } });
    clearInterval(ticker); ticker = setInterval(render, TICK_MS);
    rotate();
  }
  function closed() {
    clearInterval(ticker); clearInterval(phraseTimer); ticker = phraseTimer = 0;
    session = null; show(body, false); setText(liveText, '');
  }
  // A close while work is still pending is not the end (foreground.js shows the dialog again).
  function finished() { var n = pendingOps(); return n === null || n === 0; }
  function sync() {
    if (dialog.open) { if (!session) opened(); else render(); return; }
    if (session && finished()) closed();
  }
  function attach(found) {
    dialog = found; build();
    var observer = new MutationObserver(sync);
    observer.observe(dialog, {attributes: true, attributeFilter: ['open', 'class']});
    var h = dialog.querySelector('h2'); if (h) observer.observe(h, {childList: true, characterData: true, subtree: true});
    dialog.addEventListener('close', function () { if (session && finished()) closed(); });
    if (window.matchMedia) {
      motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (motion.addEventListener) motion.addEventListener('change', rotate); else if (motion.addListener) motion.addListener(rotate);
    }
    sync();
  }
  function init() {
    var found = document.getElementById('team-foreground');
    if (found) { attach(found); return; }
    // Only the Team workspace has the busy dialog (foreground.js creates it there at load, or on its
    // first use): wait for it, reading only, and stop waiting after a minute.
    if (!document.getElementById('team-workspace')) return;
    var giveUp = 0, watch = new MutationObserver(function () { var d = document.getElementById('team-foreground'); if (d) { watch.disconnect(); clearTimeout(giveUp); attach(d); } });
    giveUp = setTimeout(function () { watch.disconnect(); }, WAIT_MOUNT_MS);
    watch.observe(document.body, {childList: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
