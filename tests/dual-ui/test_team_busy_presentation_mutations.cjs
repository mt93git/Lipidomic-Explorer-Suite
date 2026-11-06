// Run with: node tests/dual-ui/test_team_busy_presentation_mutations.cjs
// W6a: canvas.js re-runs discovery 250 ms after any childList mutation outside #team-canvas-root.
// The presentation layer (busy_presentation.js) mounts its nodes once, before the busy dialog first
// opens, and afterwards updates only text data, attributes and styles: no childList mutation at all.
// Observed from page start (init script) through: the lazy mount, a first opening with cards placing and
// an ETA that is shown (from the observed rate once cards are placed), the close, and a second opening
// without an ETA. The outside-the-canvas-root observer runs from before the first opening to the end.
// Real Team wiring (fixture_team_overlay_pages.cjs) plus foreground.js, as the app loads it.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');

// From the first script of every document: every childList mutation that touches the presentation
// nodes (target inside .tbp, or a .tbp node added/removed), and whether .tbp existed at each showModal.
const OBSERVE = () => {
  const log = window.__tbpLog = {mutations: [], showModal: []};
  const touches = n => n && n.nodeType === 1 && (n.matches('.tbp, .tbp *') || !!n.querySelector('.tbp'));
  const show = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () {
    if (this.id === 'team-foreground') log.showModal.push(!!this.querySelector(':scope > .tbp'));
    return show.apply(this, arguments);
  };
  const start = () => new MutationObserver(list => list.forEach(m => {
    if (m.type !== 'childList') return;
    const inside = m.target.nodeType === 1 && m.target.closest('.tbp');
    const nodes = [...m.addedNodes].map(n => ['+', n]).concat([...m.removedNodes].map(n => ['-', n])).filter(e => touches(e[1]));
    if (inside || nodes.length) log.mutations.push({target: m.target.id || m.target.className || m.target.nodeName, nodes: nodes.map(e => e[0] + (e[1].className || e[1].nodeName)), open: !!document.querySelector('#team-foreground[open]')});
  })).observe(document, {childList: true, subtree: true});
  start();
};

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(OBSERVE);
    await F.install(page);
    await F.setupWorkspace(page, {companion: 'default'});
    // The overlay fixture does not wire foreground.js (the dialog's owner); load it as the app does.
    await page.addScriptTag({path: path.resolve('www/team/js/foreground.js')});
    const result = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      await wait(50);
      const dlg = document.getElementById('team-foreground'), tbp = dlg && dlg.querySelector('.tbp');
      if (!window.TeamBusy || !tbp) return {error: 'busy dialog or presentation not mounted'};
      const mountedClosed = !dlg.open;
      let left = 6; const base = window.TeamCanvas || {};
      window.TeamCanvas = Object.assign({}, base, {restoreProgress: () => ({queued: 0, loading: 0, pending: left, editEpoch: 0})});
      const root = document.getElementById('team-canvas-root');
      const outside = [], texts = new Set(), phrases = new Set(), eta = new Set();
      // foreground.js (production) writes its title and detail text: those are its own, not ours.
      const own = n => n.id === 'team-foreground-title' || n.id === 'team-foreground-detail';
      const record = m => { if (m.type === 'childList' && !root.contains(m.target) && !own(m.target)) outside.push((m.target.id || m.target.className || m.target.nodeName) + ' +' + m.addedNodes.length + '/-' + m.removedNodes.length); };
      const mo = new MutationObserver(list => list.forEach(record));
      const sample = () => {
        texts.add(tbp.querySelector('.tbp-phase').textContent + ' | ' + tbp.querySelector('.tbp-eta').textContent);
        phrases.add(tbp.querySelector('.tbp-phrase').textContent);
        eta.add(tbp.querySelector('.tbp-eta').closest('[hidden]') ? 'hidden' : 'shown:' + tbp.querySelector('.tbp-eta').textContent.replace(/\d+/g, 'n'));
      };
      // The stage is set first (the shell redraws its step numbers on a stage change: not ours).
      document.body.dataset.teamStage = 'canvas';
      await wait(300);
      // Observed from before the first opening through the close, the reopening and the last close.
      mo.observe(document.body, {childList: true, subtree: true});
      // 1. First opening: Canvas cards placing, one every 700 ms.
      const token = TeamBusy.begin('Opening your saved analysis\u2026');
      await wait(300);
      const tick = setInterval(() => { if (left > 0) left--; }, 700);
      let t0 = performance.now();
      while (performance.now() - t0 < 5000) { sample(); await wait(200); }
      clearInterval(tick);
      const open1 = dlg.open;
      TeamBusy.end(token);
      await wait(400);
      const closed = !dlg.open && tbp.querySelector('.tbp-body').hidden;
      // 2. Second opening, a label without a typical duration and no counts: the ETA stays hidden.
      const token2 = TeamBusy.begin('Saving your checkpoint\u2026');
      await wait(300);
      t0 = performance.now();
      while (performance.now() - t0 < 1500) { sample(); await wait(200); }
      const open2 = dlg.open;
      TeamBusy.end(token2);
      await wait(400);
      mo.takeRecords().forEach(record); mo.disconnect();
      return {mountedClosed, outside, texts: [...texts], phrases: phrases.size, eta: [...eta], open1, open2, closed, closedAgain: !dlg.open, log: window.__tbpLog};
    });
    assert.ok(!result.error, result.error);
    assert.ok(result.mountedClosed, 'mounted while the dialog was closed');
    assert.deepEqual(result.log.showModal, [true, true], 'the presentation was mounted before each showModal');
    assert.equal(result.log.mutations.length, 1, 'exactly one presentation childList mutation (its mount): ' + JSON.stringify(result.log.mutations));
    assert.deepEqual(result.log.mutations[0], {target: 'team-foreground', nodes: ['+tbp'], open: false}, 'the mount: .tbp added to the closed dialog');
    assert.ok(result.open1 && result.open2 && result.closed && result.closedAgain, 'opened, closed, reopened and closed');
    assert.ok(result.texts.length >= 4, 'the phase line changed while observed: ' + JSON.stringify(result.texts));
    assert.ok(result.texts.some(t => /Placing cards [1-6]\/6/.test(t)), 'placing counts shown: ' + JSON.stringify(result.texts));
    assert.ok(result.eta.includes('hidden') && result.eta.some(e => /^shown:.* left( in this step)?$/.test(e)), 'the ETA was shown and hidden: ' + JSON.stringify(result.eta));
    assert.ok(result.phrases >= 2, 'the phrase rotated while observed');
    assert.deepEqual(result.outside, [], 'childList mutations outside the canvas root (other than foreground.js title/detail) from before the first opening to after the last close');
    assert.deepEqual(errors, []);
    console.log('PASS busy presentation mutations: one mount before the first showModal, then 0 presentation childList mutations through 2 openings (' + result.texts.length + ' phase/ETA texts, ETA ' + JSON.stringify(result.eta) + ', ' + result.phrases + ' phrases); 0 outside #team-canvas-root from before the first opening through close, reopen and close');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
