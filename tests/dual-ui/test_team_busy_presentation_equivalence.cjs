// Run with: node tests/dual-ui/test_team_busy_presentation_equivalence.cjs [sequences=500] [seed=20261105]
// Env: PROD_REF (default 20e74d8), PLAYWRIGHT_MODULE (default ../browser/ci/node_modules/playwright).
// W6a equivalence: the busy presentation layer (busy_phrases.js + busy_presentation.js) and the
// labelled inspector controls must not change the production busy lifecycle. Page A loads production
// foreground.js + workspace.js + inspector_toggle.js (+ its CSS), read from git at PROD_REF; page B
// loads this tree's files plus the presentation layer. Both replay the same seeded random event
// sequences (busy operations, Shiny busy/idle, receipts, clicks, keys, steps, the clock, Canvas
// restore and plot draws, the inspector: rail toggle / labelled controls, I key, tools drawer, Figure
// page, a selected object, focus) under the same virtual clock. After EVERY step these must be
// identical: dialog open / :modal / title / error state, every workspace control's disabled and
// label state, the whole DOM minus the W6a-only nodes, TeamBusy/TeamWorkspace state, focus (unless
// it is in the Canvas shell, where the W6a controls deliberately differ), and every dispatched event,
// Shiny input, jQuery trigger, native close/cancel, focus transition and MutationObserver throw.
// The inspector's own synthetic resizes are compared by count only (B sends one only when a box
// moved, so never more than A). Page B must also never leave focus on a hidden or inert node in the
// shell. Finally the harness proves it can fail: two deliberate lifecycle mutations of page B must
// each be detected.
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');

const ROOT = path.resolve(__dirname, '../..');
const PROD_REF = process.env.PROD_REF || '20e74d8';
const SEQUENCES = Number(process.argv[2] || 500), SEED = Number(process.argv[3] || 20261105), STEPS = 60, MUTANT_TRIES = 60;
const prod = f => execFileSync('git', ['show', PROD_REF + ':' + f], {cwd: ROOT, encoding: 'utf8'});
const here = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const named = (src, name) => src + '\n//# sourceURL=' + name;
const A = {css: prod('www/team/css/foreground.css') + prod('www/team/css/inspector_toggle.css'),
  js: [named(prod('www/team/js/foreground.js'), 'foreground.js'), named(here('www/team/js/workspace.js'), 'workspace.js') /* UX14 changed workspace.js's busy lock (debounce) on purpose; both pages use this tree's copy so the comparison still isolates the W6a presentation layer */, named(prod('www/team/js/inspector_toggle.js'), 'inspector_toggle.js')]};
const bSources = (fg, ws) => ({css: here('www/team/css/foreground.css') + here('www/team/css/busy_presentation.css') + here('www/team/css/inspector_toggle.css'),
  js: [named(fg, 'foreground.js'), named(here('www/team/js/busy_phrases.js'), 'busy_phrases.js'), named(here('www/team/js/busy_presentation.js'), 'busy_presentation.js'), named(ws, 'workspace.js'), named(here('www/team/js/inspector_toggle.js'), 'inspector_toggle.js')]});
const FG = here('www/team/js/foreground.js'), WS = here('www/team/js/workspace.js');
const B = bSources(FG, WS);
// Deliberate lifecycle mutations: the test must detect each of them.
const mutate = (src, from, to) => { assert.ok(src.includes(from), 'mutation anchor missing: ' + from); return src.replace(from, to); };
const MUTANTS = {
  'dialog not reopened after a native close': bSources(mutate(FG, "dialog.addEventListener('close', function () { if (operations.size) paint(); });", "dialog.addEventListener('close', function () {});"), WS),
  'step buttons not locked while busy': bSources(FG, mutate(WS, 'b.disabled=!!reason;', 'b.disabled=!!reason&&!busy;'))
};
const SHELL_CSS = '#team-canvas-root .tc-layout{display:grid;grid-template-columns:40px 1fr 290px 0;min-height:200px}#team-canvas-root .tc-main{grid-column:2;position:relative}#team-canvas-root .ts-inspector-column{grid-column:3}';

const FIXTURE = css => `<!doctype html><html><head><style>${css}${SHELL_CSS}</style></head><body data-guide-step="1" data-guide-analysis="false">
<section id="team-workspace"><nav class="tw-steps"><button data-tw-stage="data"><strong>Data</strong></button><button data-tw-stage="review"><strong>Review</strong></button><button data-tw-stage="canvas"><strong>Canvas</strong></button></nav>
<h2 id="tw-screen-title" tabindex="-1"></h2><p id="tw-screen-help"></p><span id="tw-progress"></span>
<button data-tw-back>Back</button><button data-tw-next>Next</button><button data-tw-choice="matrix">Upload a new matrix</button><p id="tw-next"></p>
<div class="team-library"><h3></h3><p></p><input id="team_library_email"><input id="team_library_password"><button id="team_library_login">Sign in</button><button id="team_library_resume">Open latest</button><button id="team_library_save">Save</button></div>
<div id="guide_experiment_summary"></div><div id="guide_experiment_next"></div>
<div class="tw-simple-review"><div class="shiny-plot-output" id="rv1" style="width:100px;height:40px"></div><div class="plotly html-widget-output" id="rv2" style="width:100px;height:40px"></div></div>
<div id="team-canvas-root" class="ts-shell" data-ts-shell="true"><div class="tc-layout"><div class="ts-rail"><button class="tc-pointer-mode">Select</button></div>
<div class="tc-main"><div class="tc-board"></div></div>
<div class="ts-inspector-column"><div id="tc-selection-inspector" class="tc-selection-inspector" hidden><div class="tc-inspector-header"><h3>Card</h3><button class="tc-insp-close">Close</button></div></div><button class="tc-insp-empty">Add plot</button><div class="tc-companion-home"></div></div>
</div></div>
</section></body></html>`;

// In-page harness: virtual clock, Shiny/jQuery fakes, event log. Runs before the scripts.
function harness() {
  var vt = 0, timers = new Map(), tid = 0, base = 1.7e12;
  var realST = window.setTimeout.bind(window);
  window.__realTimeout = realST;
  function add(fn, ms, repeat, args) { var id = ++tid; timers.set(id, {fn: fn, due: vt + Math.max(0, +ms || 0), ms: Math.max(1, +ms || 0), repeat: repeat, args: args}); return id; }
  window.setTimeout = function (fn, ms) { return add(fn, ms, false, [].slice.call(arguments, 2)); };
  window.setInterval = function (fn, ms) { return add(fn, ms, true, [].slice.call(arguments, 2)); };
  window.clearTimeout = window.clearInterval = function (id) { timers.delete(id); };
  window.requestAnimationFrame = function (fn) { return add(function () { fn(vt); }, 16, false, []); };
  window.cancelAnimationFrame = function (id) { timers.delete(id); };
  performance.now = function () { return vt; };
  Date.now = function () { return base + vt; };
  window.__advance = function (ms) {
    var target = vt + ms;
    for (;;) {
      var next = null;
      timers.forEach(function (t, id) { if (t.due <= target && (!next || t.due < next[1].due || (t.due === next[1].due && id < next[0]))) next = [id, t]; });
      if (!next) break;
      vt = next[1].due;
      if (next[1].repeat) next[1].due = vt + next[1].ms; else timers.delete(next[0]);
      try { next[1].fn.apply(window, next[1].args); } catch (e) { window.__log.push(['error', String(e && e.message)]); }
    }
    vt = target;
  };
  window.__log = [];
  window.LIPIDOMIC_TEAM_WORKSPACE = true;
  // A throwing MutationObserver callback is logged (and compared), not lost.
  var RealMO = window.MutationObserver;
  window.MutationObserver = function (cb) { return new RealMO(function (list, obs) { try { return cb.call(this, list, obs); } catch (e) { window.__log.push(['mo-error', String(e && e.message)]); } }); };
  window.MutationObserver.prototype = RealMO.prototype;
  function where(el) { return !el || el === document.body ? 'body' : el.nodeType !== 1 ? String(el.nodeName) : el.tagName + '#' + (el.id || '') + '.' + String(el.className || '').split(' ')[0]; }
  window.__where = where;
  // Native transitions: close / cancel (capture: they do not bubble) and every focus change.
  ['close', 'cancel'].forEach(function (type) { window.addEventListener(type, function (e) { window.__log.push(['native', type, where(e.target)]); }, true); });
  // The last element focused outside the busy dialog (where focus returns when it closes).
  window.__lastOutside = null;
  window.addEventListener('focusin', function (e) { window.__log.push(['focusin', where(e.target)]); if (!(e.target.closest && e.target.closest('#team-foreground')) && e.target !== document.body) window.__lastOutside = e.target; }, true);
  // dialog.close() fires its 'close' event in a later task; the step is not over until it has run
  // (foreground.js repaints on it), or the two pages could be compared mid-flight.
  // What had focus when the busy dialog opened (foreground.js gives focus back to it on close).
  window.__opener = undefined;
  var realShowModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () { if (this.id === 'team-foreground') window.__opener = document.activeElement; return realShowModal.apply(this, arguments); };
  window.__closing = 0;
  var realClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.close = function () {
    if (this.open) { var self = this; window.__closing++; self.addEventListener('close', function () { window.__closing--; }, {once: true}); }
    return realClose.apply(this, arguments);
  };
  var wd = window.dispatchEvent.bind(window), dd = document.dispatchEvent.bind(document);
  function describe(e) { return [e.type, e.detail === undefined ? null : JSON.stringify(e.detail)]; }
  window.__ownResizes = 0;
  window.dispatchEvent = function (e) {
    // The inspector's synthetic resize is counted apart (page B sends one only when a box moved).
    if (e.type === 'resize' && /inspector_toggle\.js/.test(new Error().stack || '')) { window.__ownResizes++; return wd(e); }
    window.__log.push(['window'].concat(describe(e))); return wd(e);
  };
  document.dispatchEvent = function (e) { window.__log.push(['document'].concat(describe(e))); return dd(e); };
  window.__custom = {}; window.__jq = {};
  window.Shiny = {setInputValue: function (id, value, opts) { window.__log.push(['shiny', id, JSON.stringify(value), JSON.stringify(opts || null)]); },
    addCustomMessageHandler: function (name, fn) { window.__custom[name] = fn; }, shinyapp: {isConnected: function () { return true; }}};
  window.jQuery = function (target) {
    return {on: function (names, fn) { names.split(' ').forEach(function (n) { (window.__jq[n] = window.__jq[n] || []).push(fn); }); return this; },
      trigger: function (name) { window.__log.push(['jquery-trigger', target && target.id || String(target), name]); return this; }};
  };
  window.__fire = function (name) { (window.__jq[name] || []).forEach(function (fn) { fn({type: name}); }); };
  window.__canvas = {pending: 0, queued: 0, loading: 0};
  window.TeamCanvas = {restoreProgress: function () { return {queued: window.__canvas.queued, loading: window.__canvas.loading, pending: window.__canvas.pending, editEpoch: 0}; }};
}

// Executes one whole sequence inside the page and returns a snapshot after every step.
async function runSequence(steps) {
  var snaps = [], ids = [];
  var tick = function () { return new Promise(function (r) { window.__realTimeout(r, 0); }); };
  var flush = async function () { await tick(); for (var n = 0; window.__closing > 0 && n < 200; n++) await tick(); if (window.__closing > 0) throw new Error('close event never fired'); };
  function describeEl(el) { if (!el || el === document.body) return 'body'; return el.tagName + '#' + (el.id || '') + '[' + (el.textContent || '').trim().slice(0, 30) + ']'; }
  function snapshot(step) {
    var dlg = document.getElementById('team-foreground');
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('style,.tbp,.ts-inspector-header,.ts-inspector-show').forEach(function (n) { n.remove(); });
    var tbp = dlg && dlg.querySelector('.tbp');
    var buttons = Array.from(document.querySelectorAll('button')).filter(function (b) { return !b.matches('.ts-inspector-hide,.ts-inspector-show'); }).map(function (b) { return [describeEl(b), b.disabled, b.hidden, b.getAttribute('aria-label'), b.dataset.twQueued || null, b.dataset.twBusyLock || null]; });
    var ws = window.TeamWorkspace ? JSON.stringify(window.TeamWorkspace.state()) : null;
    var log = window.__log.splice(0);
    var a = document.activeElement, shell = document.getElementById('team-canvas-root');
    // The body is neither usable nor in the shell: focus lost from a shell control to the body fails.
    var isBody = !a || a === document.body, inShell = !isBody && shell.contains(a);
    // (while the busy dialog is open, focus is foreground.js's, identical to production)
    var lostFromShell = isBody && !(dlg && dlg.open) && !!window.__lastOutside && shell.contains(window.__lastOutside);
    // In the shell focus must be on a shown, enabled, non-inert control (checked on page B).
    var usable = !lostFromShell && (isBody || !shell.contains(a) || (!a.disabled && !a.closest('[hidden],[inert]') && a.getClientRects().length > 0 && getComputedStyle(a).visibility !== 'hidden'));
    // After the dialog closed: where its opener was and whether it was a shell control hidden meanwhile.
    var op = window.__opener, opHiddenShell = !!op && op !== document.body && shell.contains(op) && !(op.isConnected && !op.disabled && !op.closest('[hidden],[inert]') && op.getClientRects().length > 0 && getComputedStyle(op).visibility !== 'hidden');
    var closeInfo = op === undefined ? null : {opener: describeEl(op), openerHiddenShell: opHiddenShell, onClosedDialog: !!dlg && !dlg.open && dlg.contains(a)};
    return {step: step, closeInfo: closeInfo, open: !!(dlg && dlg.open), modal: !!(dlg && dlg.matches(':modal')), dom: clone.outerHTML, inShell: inShell, usable: usable, resizes: window.__ownResizes,
      // focus transitions inside the shell differ by design (the labelled controls); everything else is compared
      cmpLog: log.filter(function (x) { return !(x[0] === 'focusin' && /^(body|BUTTON#\.(tc-pointer-mode|ts-inspector|tc-insp))/.test(x[1])); }), buttons: buttons, focus: describeEl(document.activeElement),
      pending: window.TeamBusy ? window.TeamBusy.pending() : null, ws: ws, log: log,
      // presentation-only facts (not compared): proves page B rendered something
      pres: tbp ? {shown: !tbp.querySelector('.tbp-body').hidden && !!(dlg && dlg.open), phase: tbp.querySelector('.tbp-phase').hidden ? '' : tbp.querySelector('.tbp-phase').textContent,
        determinate: !tbp.querySelector('.tbp-bar').classList.contains('is-indeterminate'), width: tbp.querySelector('.tbp-bar>span').style.width,
        eta: tbp.querySelector('.tbp-eta').hidden ? '' : tbp.querySelector('.tbp-eta').textContent, phrase: tbp.querySelector('.tbp-phrase').textContent} : null};
  }
  var LABELS = ['Opening your saved analysis…', 'Preparing data…', 'Updating your analysis…', 'Saving your checkpoint…', 'Finishing your figure…', 'Preparing your ZIP…'];
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i], r = s.r;
    var pick = function (list) { return list[Math.floor(r[1] * list.length) % list.length]; };
    var layout = document.querySelector('#team-canvas-root .tc-layout'), railToggle = document.querySelector('#team-canvas-root .ts-inspector-toggle');
    var shown = function (n) { return !!n && !n.closest('[hidden],[inert]') && n.getClientRects().length > 0; };
    // Page B's labelled controls do what the rail toggle does in page A (set(!hidden, true)).
    var label = window.__variant === 'B' ? [document.querySelector('.ts-inspector-hide'), document.querySelector('.ts-inspector-show')].filter(shown)[0] : null;
    switch (s.kind) {
      case 'auth': window.__custom['team-auth-state']({authenticated: r[0] < 0.8}); break;
      case 'prep': window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: r[0] < 0.6, running: r[1] < 0.35, pending: r[2] < 0.2, restoring: r[3] < 0.15}})); break;
      case 'busy': document.documentElement.classList.add('shiny-busy'); window.__fire('shiny:busy'); break;
      case 'idle': document.documentElement.classList.remove('shiny-busy'); window.__fire('shiny:idle'); break;
      case 'begin': ids.push(window.TeamBusy.begin(pick(LABELS))); break;
      case 'end': if (ids.length) window.TeamBusy.end(ids[Math.floor(r[0] * ids.length)]); break;
      case 'fail': if (ids.length) window.TeamBusy.fail(ids[Math.floor(r[0] * ids.length)], 'Fixture failure'); break;
      case 'result': {
        var fg = []; for (var k = 1; k <= 40; k++) fg.push('foreground-' + k);
        window.__custom['team-foreground-result']({id: pick(fg.slice(0, 12)), ok: r[0] < 0.8}); break; }
      case 'click': {
        var buttons = Array.from(document.querySelectorAll('#team-workspace > :not(#team-canvas-root) button, #team-workspace > button, #team-foreground button')); // not Reload (navigates away), not the shell (insp-* actions)
        var b = pick(buttons); if (b) b.click(); break; }
      case 'key': {
        var key = r[0] < 0.4 ? 'Escape' : r[0] < 0.8 ? 'Enter' : ' ';
        // Explicit targets: focus in the shell may differ by design between the pages.
        var target = r[2] < 0.5 ? document.getElementById(pick(['team_library_email', 'team_library_password'])) : document.body;
        target.dispatchEvent(new KeyboardEvent('keydown', {key: key, bubbles: true, cancelable: true})); break; }
      case 'step': document.body.dataset.guideStep = String(1 + Math.floor(r[0] * 7)); break;
      case 'receipt': {
        var navs = window.__navTokens || [];
        window.__custom['team-navigation-receipt']({token: Math.floor(r[0] * 6), accepted: r[1] < 0.75, step: 1 + Math.floor(r[2] * 5), reason: r[3] < 0.5 ? 'Fixture reason' : null}); break; }
      case 'time': window.__advance(r[0] < 0.05 ? 125000 : Math.floor(r[1] * 4000)); break;
      case 'disconnect': window.__fire('shiny:disconnected'); break;
      case 'connect': window.__fire('shiny:connected'); break;
      case 'dialogclose': { var d = document.getElementById('team-foreground'); if (d && d.open) d.close(); break; }
      case 'canvas': {
        window.__canvas = {pending: Math.floor(r[0] * 8), queued: Math.floor(r[1] * 3), loading: Math.floor(r[2] * 2)}; break; }
      case 'node': {
        var root = document.querySelector('#team-canvas-root .tc-board');
        if (r[0] < 0.3 && root.firstChild) root.removeChild(root.lastChild);
        else { var n = document.createElement('div'); n.className = 'tc-node'; var o = document.createElement('div'); o.className = 'plotly html-widget-output'; o.style.cssText = 'width:60px;height:30px';
          if (r[1] < 0.5) { var svg = document.createElement('div'); svg.className = 'main-svg'; o.appendChild(svg); } if (r[2] < 0.3) o.classList.add('recalculating'); n.appendChild(o); root.appendChild(n); }
        break; }
      case 'draw': { var outs = document.querySelectorAll('#team-canvas-root .tc-node .plotly'); var o2 = outs[Math.floor(r[0] * outs.length)];
        if (o2) { o2.classList.remove('recalculating'); if (!o2.querySelector('.main-svg')) { var g = document.createElement('div'); g.className = 'main-svg'; o2.appendChild(g); } } break; }
      case 'insp-toggle': if (label && r[0] < 0.6) label.click(); else if (railToggle) railToggle.click(); break;
      // A real pointer sequence: pointerdown, then the click (the rail toggle, or a control outside the
      // shell that opens the tools drawer over the column).
      case 'insp-pointer': {
        var pt = r[0] < 0.5 ? railToggle : document.getElementById('team_library_save');
        if (pt) { pt.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, cancelable: true})); if (r[0] < 0.5) pt.click(); else layout.classList.add('ttd-open'); }
        break; }
      case 'insp-key': document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'i', bubbles: true, cancelable: true})); break;
      case 'insp-drawer': layout.classList.toggle('ttd-open', r[0] < 0.5); break;
      case 'insp-figure': document.getElementById('team-canvas-root').classList.toggle('tc-figure-mode', r[0] < 0.4); break;
      case 'insp-select': document.getElementById('tc-selection-inspector').hidden = r[0] < 0.5; break;
      case 'insp-focus': { var f = r[0] < 0.4 ? (label || railToggle) : r[0] < 0.7 ? railToggle : document.querySelector('.tc-insp-empty'); if (f) f.focus(); break; }
      case 'reviewbusy': document.getElementById('rv' + (1 + Math.floor(r[1] * 2))).classList.toggle('recalculating', r[0] < 0.6); break;
      case 'matrix': document.getElementById('guide_experiment_summary').textContent = r[0] < 0.5 ? 'Abundance matrix loaded' : ''; break;
    }
    await flush(); await flush();
    snaps.push(snapshot(i));
  }
  return snaps;
}

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const KINDS = [['auth', 3], ['prep', 6], ['busy', 5], ['idle', 5], ['begin', 7], ['end', 5], ['fail', 2], ['result', 3], ['click', 8], ['key', 4], ['step', 3], ['receipt', 3],
  ['time', 10], ['disconnect', 1], ['connect', 1], ['dialogclose', 1], ['canvas', 3], ['node', 3], ['draw', 3], ['reviewbusy', 3], ['matrix', 2],
  ['insp-toggle', 3], ['insp-key', 2], ['insp-drawer', 2], ['insp-figure', 2], ['insp-select', 2], ['insp-focus', 3], ['insp-pointer', 3]];
const WEIGHT = KINDS.reduce((n, k) => n + k[1], 0);
function sequence(rand) {
  const steps = [{kind: 'auth', r: [0, 0, 0, 0]}];
  while (steps.length < STEPS) {
    let x = rand() * WEIGHT, kind = KINDS[0][0];
    for (const [k, w] of KINDS) { if ((x -= w) < 0) { kind = k; break; } }
    steps.push({kind, r: [rand(), rand(), rand(), rand()]});
  }
  return steps;
}

async function load(page, sources, variant) {
  await page.goto('http://harness.test/' + variant);
  await page.evaluate(harness);
  await page.evaluate(v => { window.__variant = v; }, variant);
  for (const src of sources.js) await page.evaluate(code => { (0, eval)(code); }, src);
  await page.evaluate(() => window.__log.splice(0)); // load-time noise is compared at step 0 onwards
}
const strip = (s, inShellEither) => ({open: s.open, modal: s.modal, dom: s.dom, buttons: s.buttons, focus: inShellEither ? null : s.focus, pending: s.pending, ws: s.ws, log: s.cmpLog});

// Replays `count` sequences on pages A and B; returns the first divergence (or null) and stats.
async function compare(pa, pb, sources, count, seed, stats) {
  const rand = rng(seed);
  for (let q = 0; q < count; q++) {
    const steps = sequence(rand);
    if (process.env.ONLY_SEQ && String(q) !== process.env.ONLY_SEQ) continue;
    const errs = {a: [], b: []};
    await Promise.all([load(pa, A, 'A'), load(pb, sources, 'B')]);
    const onA = e => errs.a.push(e.message), onB = e => errs.b.push(e.message);
    pa.on('pageerror', onA); pb.on('pageerror', onB);
    const [sa, sb] = await Promise.all([pa.evaluate(runSequence, steps), pb.evaluate(runSequence, steps)]);
    pa.off('pageerror', onA); pb.off('pageerror', onB);
    let wasOpen = false;
    for (let i = 0; i < steps.length; i++) {
      const a = sa[i], b = sb[i];
      assert.equal(a.pres, null, 'production page has no presentation layer');
      const either = a.inShell || b.inShell, before = i > 0 && (sa[i - 1].inShell || sb[i - 1].inShell);
      // Focus transitions out of or into the shell (where page B has the labelled controls) differ by
      // design, e.g. the dialog's native focus restore (on close) to the control focused before it opened.
      // The close itself and where focus ends up outside the shell are still compared.
      const closed = [a, b].some(x => x.cmpLog.some(e => e[0] === 'native' && e[1] === 'close'));
      if (either || before || closed) { a.cmpLog = a.cmpLog.filter(x => x[0] !== 'focusin'); b.cmpLog = b.cmpLog.filter(x => x[0] !== 'focusin'); }
      if (process.env.DEBUG_PRES) console.log(q, i, steps[i].kind, 'A', a.open, a.focus, JSON.stringify(a.cmpLog.filter(x => x[0] === 'focusin' || x[0] === 'native')), '| B', b.open, b.focus, JSON.stringify(b.cmpLog.filter(x => x[0] === 'focusin' || x[0] === 'native')));
      try {
        assert.deepStrictEqual(strip(b, either), strip(a, either));
        // On a close, the actual focus destination is compared with production (shell or not), unless
        // the openers differ (earlier shell steps differ by design) or page B's opener was a shell
        // control hidden while busy, or production left focus on the closed dialog (page B rescues focus
        // in both cases, where production loses it).
        if (closed && !a.open && !b.open && a.closeInfo && b.closeInfo && a.closeInfo.opener === b.closeInfo.opener && !b.closeInfo.openerHiddenShell && !a.closeInfo.onClosedDialog) {
          assert.equal(b.focus, a.focus, 'focus after the busy dialog closed (opener ' + a.closeInfo.opener + ')');
          if (stats) stats.closeFocusCompared++;
        }
        assert.ok(b.usable, 'page B left focus on the body or on a hidden or inert node after a shell control had it: ' + b.focus);
        assert.ok(b.resizes <= a.resizes, `page B sent more inspector resizes (${b.resizes}) than production (${a.resizes})`);
      } catch (e) { return {seq: q, step: i, kind: steps[i].kind, steps: steps.slice(0, i + 1), error: e}; }
      if (stats) {
        stats.steps++; stats.events += a.cmpLog.length; stats.native += a.cmpLog.filter(x => x[0] === 'native' || x[0] === 'focusin').length; stats.moErrors += a.cmpLog.filter(x => x[0] === 'mo-error').length;
        if (either) stats.shellFocusSteps++;
        if (a.open) { stats.openSteps++; if (!wasOpen) stats.opens++; }
        wasOpen = a.open;
        if (b.pres && b.pres.shown) { stats.presShown++; if (b.pres.phrase) stats.phrases.add(b.pres.phrase); if (b.pres.phase) { stats.phase++; stats.phases.add(b.pres.phase.replace(/ \d+\/\d+$/, '')); } if (b.pres.determinate) stats.determinate++; if (b.pres.eta) stats.eta++; }
      }
    }
    try { assert.deepStrictEqual(errs.b, errs.a, 'page errors'); } catch (e) { return {seq: q, step: 'end', kind: 'pageerror', steps: [], error: e}; }
    if (stats) { stats.sequences++; stats.resizesA += sa[sa.length - 1].resizes; stats.resizesB += sb[sb.length - 1].resizes; }
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({headless: true});
  const stats = {closeFocusCompared: 0, sequences: 0, steps: 0, events: 0, native: 0, moErrors: 0, shellFocusSteps: 0, openSteps: 0, presShown: 0, phase: 0, determinate: 0, eta: 0, phrases: new Set(), phases: new Set(), opens: 0, resizesA: 0, resizesB: 0};
  try {
    const mk = async () => {
      const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
      await ctx.route('http://harness.test/**', r => r.fulfill({contentType: 'text/html', body: FIXTURE(/\/A$/.test(r.request().url()) ? A.css : B.css)}));
      return ctx.newPage();
    };
    const [pa, pb] = await Promise.all([mk(), mk()]);
    const diverged = await compare(pa, pb, B, SEQUENCES, SEED, stats);
    if (diverged) { console.error('DIVERGENCE seq', diverged.seq, 'step', diverged.step, diverged.kind, '\nsteps so far:', JSON.stringify(diverged.steps)); throw diverged.error; }
    console.log('STATS busy presentation equivalence vs ' + PROD_REF + ': ' + JSON.stringify({seed: SEED, closeFocusCompared: stats.closeFocusCompared, sequences: stats.sequences, steps: stats.steps, comparedEvents: stats.events,
      nativeCloseCancelFocus: stats.native, mutationObserverThrows: stats.moErrors, shellFocusSteps: stats.shellFocusSteps, inspectorResizes: {production: stats.resizesA, w6a: stats.resizesB},
      dialogOpenings: stats.opens, openSteps: stats.openSteps, presentationShown: stats.presShown, phaseSteps: stats.phase, phases: [...stats.phases], determinateSteps: stats.determinate, etaSteps: stats.eta, distinctPhrases: stats.phrases.size}));
    assert.ok(stats.opens > SEQUENCES / 5 && stats.presShown > SEQUENCES * 2, 'the presentation layer was actually exercised');
    assert.ok(stats.phases.size >= 3 && stats.determinate > 0 && stats.eta > 0 && stats.phrases.size >= 10, 'phase, determinate bar, ETA and rotating phrases all rendered');
    // The harness can fail: each deliberate lifecycle mutation of page B is detected.
    for (const [name, sources] of Object.entries(MUTANTS)) {
      const hit = await compare(pa, pb, sources, MUTANT_TRIES, SEED + 1, null);
      assert.ok(hit, 'mutation not detected: ' + name);
      console.log(`MUTANT detected: ${name} (sequence ${hit.seq}, step ${hit.step}, ${hit.kind}): ${String(hit.error.message).split('\n')[0].slice(0, 120)}`);
    }
    console.log('PASS');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
