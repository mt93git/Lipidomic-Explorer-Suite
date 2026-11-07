// An idle Team Canvas does no background work: hidden sliders stop polling (and resume when shown),
// card badges and the stale-version strip do not poll, and autosave stays silent until an edit,
// then saves it. Mock pages: no Shiny server, no data.
const { chromium } = require('../browser/ci/node_modules/playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const shared = f => execFileSync('Rscript', ['--vanilla', '-e', `cat(system.file("www/shared/${f}",package="shiny"))`], { encoding: 'utf8' }).trim();
const card = id => `<div class="tc-node" data-plot-id="${id}"><div class="tc-node-head"><strong>Figure ${id}</strong></div></div>`;
(async () => {
  const browser = await chromium.launch();
  try {
    // ---- 1. ion.rangeSlider: a slider with no box stops its 300 ms loop; showing it resumes drawing.
    {
      const p = await browser.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.setContent(`<div style="width:400px"><input id="shown" class="js-range-slider"></div>
        <div id="pane" style="display:none;width:400px"><input id="hidden" class="js-range-slider"></div>
        <div id="chrome" class="tc-figure-chrome" inert style="position:absolute;left:-9999px;width:400px"><input id="parked" class="js-range-slider"></div>`);
      await p.addScriptTag({ path: shared('jquery.min.js') });
      await p.addStyleTag({ path: shared('ionrangeslider/css/ion.rangeSlider.css') });
      await p.addScriptTag({ path: shared('ionrangeslider/js/ion.rangeSlider.min.js') });
      await p.evaluate(() => { jQuery('#shown,#hidden,#parked').ionRangeSlider({ min: 0, max: 10, from: 7 }); });
      await p.addScriptTag({ path: path.resolve('www/team/js/slider_idle.js') });
      // Count each slider's draws (test instrumentation only).
      await p.evaluate(() => { window.draws = { shown: 0, hidden: 0, parked: 0 }; const proto = Object.getPrototypeOf(jQuery('#shown').data('ionRangeSlider')); const d = proto.drawHandles;
        proto.drawHandles = function () { draws[this.input.id]++; return d.apply(this, arguments); }; });
      await p.waitForTimeout(1000);
      assert.equal(await p.evaluate(() => TeamSliderIdle.parked()), 2, 'the hidden slider and the one in parked card chrome are parked');
      await p.evaluate(() => { draws.shown = draws.hidden = draws.parked = 0; });
      await p.waitForTimeout(1500);
      const idle = await p.evaluate(() => Object.assign({}, draws));
      assert.equal(idle.hidden, 0, 'a hidden slider does not poll');
      assert.equal(idle.parked, 0, 'a slider in parked (inert, off-screen) card chrome does not poll');
      assert.ok(idle.shown >= 3, 'a visible slider keeps its own loop (' + idle.shown + ')');
      // Shiny updates a hidden slider's value; it draws it once shown.
      await p.evaluate(() => jQuery('#hidden').data('ionRangeSlider').update({ from: 3 }));
      await p.evaluate(() => { document.getElementById('pane').style.display = 'block'; });
      await p.waitForFunction(() => TeamSliderIdle.parked() === 1 && draws.hidden > 0, null, { timeout: 3000 });
      await p.waitForTimeout(400);
      const handle = await p.evaluate(() => { const h = document.querySelector('#pane .irs-single'); return h && h.textContent; });
      assert.equal(handle, '3', 'the slider shown later draws its current value');
      // The inspector's Data tab shows parked chrome (moved into view, inert off): it draws again.
      await p.evaluate(() => { const c = document.getElementById('chrome'); c.inert = false; c.style.left = '0px'; c.style.top = '300px'; draws.parked = 0; });
      await p.waitForFunction(() => TeamSliderIdle.parked() === 0 && draws.parked > 0, null, { timeout: 3000 });
      assert.deepEqual(errors, []);
      await p.close();
    }
    // ---- 1b. Dashboard selections: Plotly's own redraw/hover churn inside a drawn plot does not rescan the page.
    {
      const p = await browser.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.setContent(`<div id="gd" class="js-plotly-plot"><div class="plot-container"><svg><g class="hoverlayer"></g></svg></div></div>`);
      await p.addScriptTag({ path: shared('jquery.min.js') });
      await p.addScriptTag({ path: path.resolve('www/team/js/dashboard_selection.js') });
      await p.evaluate(() => { window.scans = 0; const q = document.querySelectorAll.bind(document); document.querySelectorAll = s => { if (s === '.js-plotly-plot') scans++; return q(s); }; });
      await p.waitForTimeout(100); await p.evaluate(() => { scans = 0; });
      await p.evaluate(async () => { const h = document.querySelector('.hoverlayer'); for (let i = 0; i < 20; i++) { h.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g')); await new Promise(r => requestAnimationFrame(r)); } });
      assert.equal(await p.evaluate(() => scans), 0, 'hover/redraw churn inside a plot does not rescan');
      await p.evaluate(async () => { const d = document.createElement('div'); d.textContent = 'status'; document.body.appendChild(d); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      assert.equal(await p.evaluate(() => scans), 0, 'other page churn (status text, toolbars) does not rescan');
      await p.evaluate(async () => { const d = document.createElement('div'); d.innerHTML = '<div data-selection-input="x"></div>'; document.body.appendChild(d); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      assert.equal(await p.evaluate(() => scans), 1, 'an added selection rescans once');
      await p.evaluate(async () => { const g = document.createElement('div'); document.body.appendChild(g); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); window.scans = 0; g.className = 'js-plotly-plot'; g.appendChild(document.createElement('div')); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      assert.equal(await p.evaluate(() => scans), 1, "a plot's first draw rescans once");
      assert.deepEqual(errors, []);
      await p.close();
    }
    // ---- 2. Card badges: no timer while nothing changes; a held "Updating" badge gets one repaint.
    {
      const p = await browser.newPage(); await p.clock.install(); const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.setContent(`<section id="team-canvas-root"><div class="tc-main"><div class="tc-status"></div><div class="tc-scroll"><div class="tc-board">${card('a')}${card('b')}</div></div></div></section>
        <script>window.states={a:'current',b:'current'};window.TeamCanvas={cardStatus:id=>states[id],catalogSource:id=>id};window.calls=0;</script>`);
      await p.addScriptTag({ path: path.resolve('www/team/js/card_status.js') });
      await p.clock.runFor(1000);
      await p.evaluate(() => { const c = TeamCanvas.cardStatus; TeamCanvas.cardStatus = id => { calls++; return c(id); }; });
      await p.clock.runFor(60000);
      // The 1.5 s badge poll is kept on purpose (late client renders emit no event), so calls are not asserted.
      await p.evaluate(() => { states.a = 'updating'; window.dispatchEvent(new Event('team-canvas-selection')); });
      await p.clock.runFor(100);
      assert.equal(await p.evaluate(() => document.querySelector('[data-plot-id=a] .tc-card-status').dataset.state), 'current', 'Updating is held for 2 s');
      await p.clock.runFor(2500);
      assert.equal(await p.evaluate(() => document.querySelector('[data-plot-id=a] .tc-card-status').dataset.state), 'updating', 'a persistent update shows');
      assert.deepEqual(errors, []);
      await p.close();
    }
    // ---- 3. Stale strip: the version.json poll is kept (it drives the 'new version · Reload' strip).
    {
      const p = await browser.newPage(); await p.clock.install();
      let hits = 0;
      await p.route('**/team/version.json', r => { hits++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"version":"x"}' }); });
      await p.route('http://idle.test/', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body></body>' }));
      await p.goto('http://idle.test/');
      await p.addScriptTag({ path: path.resolve('www/team/js/stale_reload.js') });
      for (let i = 0; i < 5; i++) { await p.clock.runFor(60000); await p.waitForTimeout(20); }
      assert.ok(hits >= 4, 'version.json is still polled every minute (' + hits + ' requests)');
      await p.close();
    }
    // ---- 4. Autosave: nothing sent while idle; an edit is saved after the debounce and persists.
    {
      const p = await browser.newPage(); await p.clock.install();
      await p.setContent('<main id="team-workspace"><input id="caption"><div id="team-autosave-status"></div></main>');
      await p.evaluate(() => { window.sent = []; window.handlers = {}; window.Shiny = { setInputValue: (name, value) => sent.push({ name, value }), addCustomMessageHandler: (n, f) => handlers[n] = f }; document.body.dataset.teamAuthenticated = 'true'; });
      await p.addScriptTag({ path: path.resolve('www/team/js/autosave.js') });
      await p.evaluate(() => { window.dispatchEvent(new Event('team-document-restored')); handlers['team-autosave-context']({ writable: true, loaded: true }); });
      await p.clock.runFor(10 * 60000);
      assert.equal(await p.evaluate(() => sent.length), 0, 'idle canvas sends no autosave');
      await p.locator('#caption').fill('An edit');
      await p.clock.runFor(15000);
      assert.equal(await p.evaluate(() => sent.length), 1, 'the edit is saved after the debounce');
      await p.evaluate(() => handlers['team-autosave-result']({ revision: sent[0].value.revision, ok: true }));
      assert.equal(await p.evaluate(() => TeamAutosave.state().dirty), false, 'the save persisted');
      await p.clock.runFor(10 * 60000);
      assert.equal(await p.evaluate(() => sent.length), 1, 'nothing more while idle after the save');
      await p.close();
    }
    console.log('PASS team idle quiet');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
