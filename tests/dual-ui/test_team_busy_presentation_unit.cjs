// Run with: node tests/dual-ui/test_team_busy_presentation_unit.cjs
// W6a busy presentation (busy_presentation.js) semantics, on the production foreground.js dialog with
// Playwright's fake clock: per-phase job counts from 0/N whose done count never goes back and never reads
// complete while something is drawing (the bar is always the text's ratio); outputs tracked by id (a
// replaced element starts not done, no phantom completions); an image that finishes loading counts; the
// stage the person sees decides the phase (no "Placing cards" from background hydration during Review);
// a new label starts over; ETA from the observed rate while counting (hidden after 15 s without
// // progress; none at 0/N), otherwise fixed typical step durations counted down, then 'taking longer
// than usual'; nothing stored; fail() and Dismiss in one turn end cleanly; outputs re-armed when their
// drawing signature changes, failed on error, not painted on a stale card; the phase is announced
// from a live region outside the hidden part, on the first frame after opening; reduced motion is
// re-checked while open;
// no progressbar role (the companion's busy check sees what production shows).
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const HTML = `<!doctype html><body data-team-stage="data"><section id="team-workspace">
<div class="tw-simple-review"><div class="shiny-plot-output" id="rv1"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="></div><div class="plotly html-widget-output" id="rv2"><div class="main-svg"></div></div></div>
<div id="team-canvas-root"><div class="tc-node"><div class="shiny-plot-output" id="c1"></div></div><div class="tc-node"><div class="plotly html-widget-output" id="c2"></div></div></div>
</section></body>`;

(async () => {
  const browser = await chromium.launch({headless: true});
  let checks = 0; const ok = (c, m) => { assert.ok(c, m); checks++; };
  try {
    const ctx = await browser.newContext();
    await ctx.route('http://unit.test/**', r => r.fulfill({contentType: 'text/html', body: HTML}));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let release = null;
    await ctx.route(/http:\/\/unit\.test\/slow\.png/, async r => { await new Promise(res => { release = res; }); await r.fulfill({contentType: 'image/png', body: Buffer.from(PNG, 'base64')}); });
    async function fresh() {
      await page.clock.install({time: 0});
      await page.goto('http://unit.test/');
      await page.evaluate(() => { localStorage.clear(); window.__left = 0;
        window.TeamCanvas = {restoreProgress: () => ({queued: 0, loading: 0, pending: window.__left, editEpoch: 0})}; });
      for (const f of ['foreground.js', 'busy_phrases.js', 'busy_presentation.js']) await page.addScriptTag({path: path.resolve('www/team/js/' + f)});
    }
    const ui = () => page.evaluate(() => { const t = document.querySelector('#team-foreground .tbp'), q = s => t.querySelector(s);
      return {open: document.getElementById('team-foreground').open, phase: q('.tbp-phase').closest('[hidden]') ? '' : q('.tbp-phase').textContent, eta: q('.tbp-eta').closest('[hidden]') ? '' : q('.tbp-eta').textContent,
        phrase: q('.tbp-phrase').textContent, det: !q('.tbp-bar').classList.contains('is-indeterminate'), width: q('.tbp-bar>span').style.width,
        live: q('.tbp-live').textContent, liveHidden: !!q('.tbp-live').closest('[hidden]'), bodyHidden: q('.tbp-body').hidden,
        roles: document.querySelectorAll('#team-foreground [role="progressbar"]').length}; });
    const stored = () => page.evaluate(() => localStorage.length);
    const COUNT = / (\d+)\/(\d+)( \(\d+ failed\))?$/;
    const ratioOk = x => { const m = COUNT.exec(x.phase); return m ? x.det && x.width === Math.round(m[1] / m[2] * 100) + '%' : !x.det && x.width === ''; };
    const doneOf = x => { const m = COUNT.exec(x.phase); return m ? +m[1] : null; };
    const monotone = list => { let last = -1, ph = ''; return list.every(x => { const p = x.phase.replace(COUNT, ''); if (p !== ph) { ph = p; last = -1; } const d = doneOf(x); if (d == null) return true; const okd = d >= last; last = d; return okd; }); };

    // 1. Placing on the shown Canvas: 0/5 first; more cards to place grow the total, the done count
    // never goes back; the bar always the text's ratio. Announced one render after opening.
    await fresh();
    const atOpen = await page.evaluate(() => { document.body.dataset.teamStage = 'canvas'; window.__left = 5; window.__id = TeamBusy.begin('Opening your saved analysis…'); return document.querySelector('#team-foreground .tbp-live').textContent; });
    ok(atOpen === '', 'live region empty in the moment the dialog opens: ' + JSON.stringify(atOpen));
    await page.clock.runFor(50);
    let u = await ui(); ok(u.live === 'Step 3 of 4: Placing cards' && !u.liveHidden && !u.bodyHidden, 'announced on the next animation frame (before the 500 ms tick), outside the hidden part: ' + JSON.stringify(u.live));
    await page.clock.runFor(50);
    await page.clock.runFor(500);
    u = await ui(); ok(/Step 3\/4 · Placing cards 0\/5$/.test(u.phase), 'placing starts at 0/5: ' + u.phase); ok(u.det && u.width === '0%', 'determinate at 0%');
    await page.clock.runFor(4000); ok((await ui()).eta === '' && / 0\/5$/.test((await ui()).phase), 'counted 0/5 with no rate observed: no ETA (no typical-duration guess)');
    ok(u.roles === 0, 'no progressbar role in the dialog');
    ok(u.live === 'Step 3 of 4: Placing cards', 'still announced: ' + u.live);
    const seen = [u];
    for (const left of [4, 4, 2, 3, 0]) { await page.evaluate(n => { window.__left = n; }, left); await page.clock.runFor(1100); seen.push(await ui()); }
    ok(seen.every(ratioOk), 'bar equals the text ratio at every step: ' + seen.map(x => x.phase + ' ' + x.width).join(' ; '));
    ok(monotone(seen) && seen.some(x => /Placing cards 3\/6$/.test(x.phase)) && seen.filter(x => /Placing/.test(x.phase)).every(x => x.live === 'Step 3 of 4: Placing cards'), 'left 2 -> 3 grows the total (3/6), done never back; counts not announced: ' + seen.map(x => x.phase).join(' ; '));
    // Drawing follows placing (determinate, no flip), from 0 of the outputs not yet drawn.
    u = await ui(); ok(/Drawing cards 0\/2$/.test(u.phase) && u.det && u.live === 'Step 4 of 4: Drawing cards', 'drawing starts at 0/2, announced once: ' + u.phase);
    const draw = [u];
    // A failed image is not drawn; a newly drawn plot is.
    await page.evaluate(() => { const i = document.createElement('img'); i.src = 'data:image/png;base64,AAAA'; document.getElementById('c1').appendChild(i); });
    await page.clock.runFor(1100); u = await ui(); draw.push(u); ok(/Drawing cards 0\/2$/.test(u.phase), 'a broken image does not count as drawn: ' + u.phase);
    await page.evaluate(() => { const g = document.createElement('div'); g.className = 'main-svg'; document.getElementById('c2').appendChild(g); });
    await page.clock.runFor(1100); u = await ui(); draw.push(u); ok(/Drawing cards 1\/2$/.test(u.phase) && u.width === '50%', 'a drawn plot counts: ' + u.phase + ' ' + u.width);
    // Recalculating again is a new job: never a false 100%, never back.
    await page.evaluate(() => document.getElementById('c2').classList.add('recalculating'));
    await page.clock.runFor(1100); u = await ui(); draw.push(u); ok(/Drawing cards 1\/3$/.test(u.phase) && u.width === '33%', 'a recalculating output adds a job: ' + u.phase + ' ' + u.width);
    await page.evaluate(() => document.getElementById('c2').classList.remove('recalculating'));
    await page.clock.runFor(1100); u = await ui(); draw.push(u); ok(/Drawing cards 1\/3$/.test(u.phase), 'the same old drawing is not a redraw: ' + u.phase);
    await page.evaluate(() => { const c = document.getElementById('c2'); c.querySelector('.main-svg').remove(); const g = document.createElement('div'); g.className = 'main-svg'; c.appendChild(g); });
    await page.clock.runFor(1100); u = await ui(); draw.push(u); ok(/Drawing cards 2\/3$/.test(u.phase) && u.width === '67%', 'a new drawing counts: ' + u.phase);
    // An output in error is not drawn.
    await page.evaluate(() => document.getElementById('c1').classList.add('shiny-output-error'));
    await page.clock.runFor(1100); u = await ui(); draw.push(u); ok(/Drawing cards 3\/3 \(1 failed\)$/.test(u.phase) && u.width === '100%', 'an output in error finishes as failed, not drawn: ' + u.phase);
    // By id: a new element under c2 (drawn) starts not done, a new job, not a phantom completion.
    await page.evaluate(() => { const old = document.getElementById('c2'), n = document.createElement('div'); n.className = 'plotly html-widget-output'; n.id = 'c2'; old.replaceWith(n); });
    await page.clock.runFor(1100); u = await ui(); draw.push(u); ok(/Drawing cards 3\/4 \(1 failed\)$/.test(u.phase) && u.width === '75%', 'a replaced element starts not done: ' + u.phase + ' ' + u.width);
    await page.evaluate(() => { const g = document.createElement('div'); g.className = 'main-svg'; document.getElementById('c2').appendChild(g); });
    await page.clock.runFor(1100); u = await ui(); draw.push(u); ok(/Drawing cards 4\/4 \(1 failed\)$/.test(u.phase), 'the new element counts once drawn: ' + u.phase);
    // A new element already painted when it appears is checked from the next scan, then counts.
    await page.evaluate(png => { const old = document.getElementById('c1'), n = document.createElement('div'); n.className = 'shiny-plot-output'; n.id = 'c1'; const i = document.createElement('img'); i.src = 'data:image/png;base64,' + png; n.appendChild(i); old.replaceWith(n); }, PNG);
    await page.waitForFunction(() => document.querySelector('#c1 img').complete);
    await page.clock.runFor(1000); u = await ui(); draw.push(u); ok(/Drawing cards 4\/5$/.test(u.phase), 'a replacement (of the failed one) is not done in the scan it appears: ' + u.phase);
    await page.clock.runFor(1000); u = await ui(); draw.push(u); ok(/Drawing cards 5\/5$/.test(u.phase) && u.width === '100%', 'then counts: ' + u.phase);
    ok(monotone(draw) && draw.every(ratioOk), 'drawing: done never back, bar equals text: ' + draw.map(x => x.phase + ' ' + x.width).join(' ; '));
    // A new label starts over.
    await page.evaluate(() => { window.__id2 = TeamBusy.begin('Updating your analysis…'); });
    await page.clock.runFor(100); u = await ui(); ok(/^Step 1\/4/.test(u.phase) || / 0\/\d+$/.test(u.phase), 'label change resets the counts: ' + u.phase);
    await page.evaluate(() => { TeamBusy.end(window.__id2); TeamBusy.end(window.__id); });
    await page.clock.runFor(100);
    u = await ui(); ok(!u.open && u.bodyHidden && u.live === '', 'closed, hidden, nothing announced');
    ok((await stored()) === 0, 'nothing stored');

    // 1b. Placing 5 -> 1 -> 0 with every card already drawn: placing ends complete (5/5, 100%).
    await fresh();
    await page.evaluate(png => { const i = document.createElement('img'); i.src = 'data:image/png;base64,' + png; document.getElementById('c1').appendChild(i);
      const g = document.createElement('div'); g.className = 'main-svg'; document.getElementById('c2').appendChild(g);
      document.body.dataset.teamStage = 'canvas'; window.__left = 5; window.__id = TeamBusy.begin('Opening your saved analysis…'); }, PNG);
    await page.waitForFunction(() => document.querySelector('#c1 img').complete);
    for (const left of [5, 1, 0, 0]) { await page.evaluate(n => { window.__left = n; }, left); await page.clock.runFor(1100); }
    u = await ui(); ok(/Placing cards 5\/5$/.test(u.phase) && u.width === '100%', 'placing completes when nothing is left to draw: ' + u.phase + ' ' + u.width);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);

    // 1c. Placing 5 -> 1 -> 3: 4/5 then 4/7 (never 2/5).
    await fresh();
    await page.evaluate(() => { document.body.dataset.teamStage = 'canvas'; window.__left = 5; window.__id = TeamBusy.begin('Opening your saved analysis…'); });
    const p513 = [];
    for (const left of [5, 1, 3]) { await page.evaluate(n => { window.__left = n; }, left); await page.clock.runFor(1100); p513.push(await ui()); }
    ok(p513.map(x => x.phase.replace(/.* /, '')).join(',') === '0/5,4/5,4/7' && p513.every(ratioOk), '5 -> 1 -> 3 reads 0/5, 4/5, 4/7: ' + p513.map(x => x.phase + ' ' + x.width).join(' ; '));
    // ETA only while counting, from the observed rate; hidden after 15 s without progress; back on progress.
    await page.evaluate(() => { window.__left = 2; }); await page.clock.runFor(1100); u = await ui(); ok(/^(a few seconds|about \d+ (s|min)) left in this step$/.test(u.eta), 'rate ETA while counting: ' + u.eta);
    await page.clock.runFor(16000); u = await ui(); ok(u.eta === '', 'no placed card for 15 s: ETA hidden: ' + u.eta);
    await page.evaluate(() => { window.__left = 1; }); await page.clock.runFor(1100); u = await ui(); ok(/left in this step$/.test(u.eta), 'progress again: ETA back: ' + u.eta);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);

    // 1d. An image first sampled while loading counts once it has loaded, with the same source.
    await fresh();
    await page.evaluate(() => { const i = document.createElement('img'); i.src = 'http://unit.test/slow.png'; document.getElementById('c1').appendChild(i);
      document.body.dataset.teamStage = 'canvas'; window.__id = TeamBusy.begin('Opening your saved analysis…'); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 0\/2$/.test(u.phase), 'a loading image joins the step: ' + u.phase);
    release(); await page.waitForFunction(() => { const i = document.querySelector('#c1 img'); return i.complete && i.naturalWidth > 0; });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 1\/2$/.test(u.phase) && u.width === '50%', 'the image decoded after its first sample counts: ' + u.phase);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);

    // 1e. Re-armed by signature, between scans: a drawn plot redrawn (new .main-svg node), Astra's
    // same-source image swap (decoded at once, then one still loading), a stale card, and an output in
    // error that comes back drawing.
    await fresh();
    await page.evaluate(png => { const i = document.createElement('img'); i.src = 'data:image/png;base64,' + png; document.getElementById('c1').appendChild(i);
      document.getElementById('c2').classList.add('recalculating');
      document.body.dataset.teamStage = 'canvas'; window.__id = TeamBusy.begin('Opening your saved analysis…'); }, PNG);
    await page.waitForFunction(() => document.querySelector('#c1 img').complete);
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 0\/1$/.test(u.phase), 'only the recalculating output joins: ' + u.phase);
    await page.evaluate(() => { const c = document.getElementById('c2'); c.classList.remove('recalculating'); const g = document.createElement('div'); g.className = 'main-svg'; c.appendChild(g); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 1\/1$/.test(u.phase), 'drawn: ' + u.phase);
    await page.evaluate(() => { const c = document.getElementById('c2'); c.querySelector('.main-svg').remove(); const g = document.createElement('div'); g.className = 'main-svg'; c.appendChild(g); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 2\/2$/.test(u.phase), 'a redraw between scans (new .main-svg) is a new job, done: ' + u.phase);
    // c2 starts drawing again (keeps the step open); c1, drawn before the operation, starts drawing.
    await page.evaluate(() => { document.getElementById('c2').classList.add('recalculating'); const c = document.getElementById('c1'); c.querySelector('img').remove(); c.classList.add('recalculating'); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 2\/4$/.test(u.phase), 'c1 and c2 drawing: ' + u.phase);
    await page.evaluate(png => { const c = document.getElementById('c1'); c.classList.remove('recalculating'); const i = document.createElement('img'); i.src = 'data:image/png;base64,' + png; c.appendChild(i); }, PNG);
    await page.waitForFunction(() => document.querySelector('#c1 img').complete);
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 3\/4$/.test(u.phase), 'c1 drawn: ' + u.phase);
    // Astra: a new img with the same source, decoded between scans: a redraw (new job, done).
    await page.evaluate(png => { const c = document.getElementById('c1'); c.querySelector('img').remove(); const i = document.createElement('img'); i.src = 'data:image/png;base64,' + png; c.appendChild(i); }, PNG);
    await page.waitForFunction(() => document.querySelector('#c1 img').complete);
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 4\/5$/.test(u.phase), 'same-source image swap, decoded between scans: a new job, done: ' + u.phase);
    // Swapped to an image still loading: an open job, counted once it has loaded.
    await page.evaluate(() => { const c = document.getElementById('c1'); c.querySelector('img').remove(); const i = document.createElement('img'); i.src = 'http://unit.test/slow.png?2'; c.appendChild(i); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 4\/6$/.test(u.phase), 'swap to an image still loading: a new open job: ' + u.phase);
    release(); await page.waitForFunction(() => { const i = document.querySelector('#c1 img'); return i.complete && i.naturalWidth > 0; });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 5\/6$/.test(u.phase), 'counted once loaded: ' + u.phase);
    // A stale card is not painted: c2 drawn on a stale card stays open until the card is current.
    await page.evaluate(() => { const c = document.getElementById('c2'); c.closest('.tc-node').classList.add('tc-stale'); c.classList.remove('recalculating'); c.querySelector('.main-svg').remove(); const g = document.createElement('div'); g.className = 'main-svg'; c.appendChild(g); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 5\/6$/.test(u.phase), 'a drawing on a stale card is not counted: ' + u.phase);
    await page.evaluate(() => document.querySelector('#c2').closest('.tc-node').classList.remove('tc-stale'));
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 6\/6$/.test(u.phase), 'counted once the card is current: ' + u.phase);
    // An open job whose output shows an error finishes as failed; when it draws again, a new job.
    await page.evaluate(() => document.getElementById('c2').classList.add('recalculating')); await page.clock.runFor(1100);
    await page.evaluate(() => { const c = document.getElementById('c2'); c.classList.remove('recalculating'); c.classList.add('shiny-output-error'); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 7\/7 \(1 failed\)$/.test(u.phase) && u.width === '100%', 'error: finished as failed, not waited for: ' + u.phase);
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 7\/7 \(1 failed\)$/.test(u.phase), 'a failed job is not re-armed while the error stays: ' + u.phase);
    await page.evaluate(() => { const c = document.getElementById('c2'); c.classList.remove('shiny-output-error'); c.classList.add('recalculating'); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 7\/8$/.test(u.phase), 'drawing again after the error: a new job, the failure no longer shown: ' + u.phase);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);

    // 1f. Terra: an output already drawn that then shows an error is not a new job (1/1 stays 1/1).
    await fresh();
    await page.evaluate(png => { const i = document.createElement('img'); i.src = 'data:image/png;base64,' + png; document.getElementById('c1').appendChild(i);
      document.getElementById('c2').classList.add('recalculating'); const g = document.createElement('div'); g.className = 'main-svg'; document.getElementById('c2').appendChild(g);
      document.body.dataset.teamStage = 'canvas'; window.__id = TeamBusy.begin('Opening your saved analysis…'); }, PNG);
    await page.waitForFunction(() => document.querySelector('#c1 img').complete);
    await page.clock.runFor(1100);
    await page.evaluate(() => { const c = document.getElementById('c2'); c.classList.remove('recalculating'); c.querySelector('.main-svg').remove(); const g = document.createElement('div'); g.className = 'main-svg'; c.appendChild(g); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 1\/1$/.test(u.phase), 'drawn: ' + u.phase);
    await page.evaluate(() => document.getElementById('c2').classList.add('shiny-output-error'));
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 1\/1$/.test(u.phase), 'an error on a finished output does not re-arm it: ' + u.phase);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);

    // 1g. Astra: a frozen stale snapshot is never a job; a tracked output whose card loses .tc-stale
    // (canvas.js, without a redraw) while painted is done, even with the same signature.
    await fresh();
    await page.evaluate(() => {
      const g1 = document.createElement('div'); g1.className = 'main-svg'; document.getElementById('c2').appendChild(g1); document.getElementById('c2').closest('.tc-node').classList.add('tc-stale');
      document.getElementById('c1').classList.add('recalculating');
      document.body.dataset.teamStage = 'canvas'; window.__id = TeamBusy.begin('Opening your saved analysis…'); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 0\/1$/.test(u.phase), 'the stale snapshot is not enrolled: ' + u.phase);
    await page.evaluate(() => document.getElementById('c2').classList.add('recalculating')); await page.clock.runFor(1100);
    u = await ui(); ok(/Drawing cards 0\/2$/.test(u.phase), 'it joins when it recalculates: ' + u.phase);
    await page.evaluate(() => document.getElementById('c2').classList.remove('recalculating')); await page.clock.runFor(1100);
    u = await ui(); ok(/Drawing cards 0\/2$/.test(u.phase), 'still stale: not done: ' + u.phase);
    await page.evaluate(() => document.getElementById('c2').closest('.tc-node').classList.remove('tc-stale')); await page.clock.runFor(1100);
    u = await ui(); ok(/Drawing cards 1\/2$/.test(u.phase), 'stale cleared while painted, same signature: done: ' + u.phase);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);

    // 1h. Astra: a decoded image sampled while recalculating, then seen loading, then decoded again with
    // the same signature (its source swapped away and back): counted once the observed load completes.
    await fresh();
    await page.evaluate(png => { const i = document.createElement('img'); i.src = 'data:image/png;base64,' + png; const c = document.getElementById('c1'); c.appendChild(i); c.classList.add('recalculating'); const g = document.createElement('div'); g.className = 'main-svg'; document.getElementById('c2').appendChild(g);
      document.body.dataset.teamStage = 'canvas'; window.__id = TeamBusy.begin('Opening your saved analysis…'); }, PNG);
    await page.waitForFunction(() => document.querySelector('#c1 img').complete);
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 0\/1$/.test(u.phase), 'sampled decoded while recalculating: ' + u.phase);
    await page.evaluate(() => { document.querySelector('#c1 img').src = 'http://unit.test/slow.png?3'; });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 0\/1$/.test(u.phase) && await page.evaluate(() => !document.querySelector('#c1 img').complete), 'seen loading: ' + u.phase);
    await page.evaluate(png => { const c = document.getElementById('c1'); c.querySelector('img').src = 'data:image/png;base64,' + png; c.classList.remove('recalculating'); }, PNG);
    await page.waitForFunction(() => { const i = document.querySelector('#c1 img'); return i.complete && i.naturalWidth > 0; });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing cards 1\/1$/.test(u.phase), 'decoded after an observed load, same signature: counted: ' + u.phase);
    if (release) release();
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);

    // 2. Background hydration during Review does not jump to Placing.
    await fresh();
    await page.evaluate(() => { document.body.dataset.teamStage = 'review'; window.__left = 7; window.__id = TeamBusy.begin('Preparing data…'); });
    await page.clock.runFor(2200); u = await ui(); ok(/^Step 1\/4 · Preparing data$/.test(u.phase) && !u.det, 'review with hidden Canvas hydration stays at Preparing data: ' + u.phase);
    await page.evaluate(() => document.getElementById('rv2').classList.add('recalculating'));
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing Review plots 0\/1$/.test(u.phase) && u.det && u.width === '0%', 'review step at 0/1, bar equals the text: ' + u.phase + ' ' + u.width);
    await page.evaluate(() => { const c = document.getElementById('rv2'); c.classList.remove('recalculating'); c.querySelector('.main-svg').remove(); const g = document.createElement('div'); g.className = 'main-svg'; c.appendChild(g); });
    await page.clock.runFor(1100); u = await ui(); ok(/Drawing Review plots 1\/1$/.test(u.phase) && u.det, 'redrawn review plot counted: ' + u.phase);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);

    // 3. No ETA where nothing is counted; an external close reopens; fail() and Dismiss in one turn.
    await fresh();
    await page.evaluate(() => { window.__id = TeamBusy.begin('Saving your checkpoint…'); });
    const etas = []; for (let i = 0; i < 6; i++) { await page.clock.runFor(4000); etas.push((await ui()).eta); }
    ok(etas.every(e => e === ''), 'a label without a typical duration: no ETA in 24 s: ' + JSON.stringify(etas));
    await page.evaluate(() => new Promise(r => { const d = document.getElementById('team-foreground'); d.addEventListener('close', () => r(), {once: true}); d.close(); })); await page.clock.runFor(100);
    ok((await ui()).open, 'dialog reopened by foreground.js');
    await page.evaluate(() => { TeamBusy.fail(window.__id, 'x'); document.querySelector('#team-foreground > button').click(); }); await page.clock.runFor(100);
    u = await ui(); ok(!u.open && u.bodyHidden && u.live === '', 'fail() and Dismiss in one turn: closed and reset');
    await page.evaluate(() => { document.body.dataset.teamStage = 'data'; window.__id = TeamBusy.begin('Preparing data…'); }); await page.clock.runFor(600);
    u = await ui(); ok(u.open && /^Step 1\/4 · Preparing data$/.test(u.phase) && u.eta === 'about 15 s left' && !u.det, 'the next operation starts clean: ' + u.phase + ' | ' + u.eta);
    // Typical durations (fixed constants) where nothing is counted: counted down from the step's
    // start, then 'taking longer than usual'.
    await page.clock.runFor(1000); u = await ui(); ok(u.eta === 'about 14 s left', 'Preparing data: about 14 s left after ~1.5 s: ' + u.eta);
    await page.clock.runFor(5000); u = await ui(); ok(u.eta === 'about 9 s left', 'counts down: ' + u.eta);
    await page.clock.runFor(8000); u = await ui(); ok(u.eta === 'a few seconds left', 'near the end: ' + u.eta);
    await page.clock.runFor(2000); u = await ui(); ok(u.eta === 'taking longer than usual\u2026', 'past the typical duration: ' + u.eta);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);
    await page.evaluate(() => { window.__id = TeamBusy.begin('Signing in\u2026'); }); await page.clock.runFor(600);
    u = await ui(); ok(u.phase === '' && u.eta === 'about 10 s left', 'Signing in: its own typical duration: ' + u.eta);
    await page.clock.runFor(10000); u = await ui(); ok(u.eta === 'taking longer than usual\u2026', 'then taking longer: ' + u.eta);
    await page.evaluate(() => TeamBusy.end(window.__id)); await page.clock.runFor(100);
    ok((await stored()) === 0, 'nothing stored');

    // 5. Reduced motion re-checked while open: the phrase stops rotating.
    await fresh();
    await page.evaluate(() => { window.__id = TeamBusy.begin('Saving your checkpoint…'); });
    const p0 = (await ui()).phrase; await page.clock.runFor(2600); const p1 = (await ui()).phrase; ok(p0 !== p1, 'phrase rotates');
    await page.emulateMedia({reducedMotion: 'reduce'}); await page.waitForTimeout(200); await page.evaluate(() => new Promise(r => requestAnimationFrame(r))).catch(() => {}); await page.clock.runFor(100);
    const p2 = (await ui()).phrase; await page.clock.runFor(8000); ok((await ui()).phrase === p2, 'reduced motion while open stops the rotation');
    await page.emulateMedia({reducedMotion: 'no-preference'}); await page.clock.runFor(2600); ok((await ui()).phrase !== p2, 'rotation resumes');
    await page.evaluate(() => TeamBusy.end(window.__id));
    assert.deepEqual(errors, []);
    console.log(`PASS busy presentation unit: ${checks} checks`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
