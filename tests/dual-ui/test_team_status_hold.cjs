// Run with: node tests/dual-ui/test_team_status_hold.cjs
// TeamStatusHold (www/team/js/status_hold.js): an urgent text (the result of a
// user action, e.g. a refused step) is written at once and then held >=1 s, so a
// routine repaint right after it cannot discard it unseen. Non-urgent texts keep
// coalescing: the line never changes faster than once per second.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
const SCRIPT = path.resolve(process.env.STATUS_HOLD_JS || 'www/team/js/status_hold.js');

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.clock.install({time: 0});
    await page.setContent('<p id="tw-next" role="status" aria-live="polite">Sign in to start an analysis.</p>');
    await page.addScriptTag({path: SCRIPT});
    await page.evaluate(() => {
      const el = document.getElementById('tw-next');
      window.changes = [];
      // Record each visible change with the (fake) clock time at which it happened.
      new MutationObserver(() => changes.push({t: performance.now(), text: el.textContent})).observe(el, {childList: true, characterData: true, subtree: true});
      window.set = (text, urgent) => TeamStatusHold.set(el, text, urgent);
      window.text = () => el.textContent;
    });
    const t = () => page.evaluate(() => performance.now());
    const text = () => page.evaluate(() => window.text());

    // 1. Non-urgent text, an urgent rejection 200 ms later, a routine repaint 100 ms after that.
    await page.evaluate(() => set('Updating…'));
    assert.equal(await text(), 'Updating…', 'first non-urgent text lands at once (nothing was held)');
    await page.clock.runFor(200);
    const REJECT = 'Prepare the current data before continuing.';
    await page.evaluate(r => set(r, true), REJECT);
    const shownAt = await t();
    assert.equal(await text(), REJECT, 'the urgent rejection is in textContent immediately, despite the hold on the previous text');
    await page.clock.runFor(100);
    await page.evaluate(() => set('Waiting for the server…'));
    assert.equal(await text(), REJECT, 'a repaint right after the rejection does not replace it');
    assert.equal(await page.evaluate(() => TeamStatusHold.target(document.getElementById('tw-next'))), 'Waiting for the server…', 'the repaint is the pending target');
    await page.clock.runFor(850); // 950 ms after the rejection
    assert.equal(await text(), REJECT, 'the rejection is still visible ~950 ms later');
    await page.clock.runFor(200);
    assert.equal(await text(), 'Waiting for the server…', 'the repaint lands once the hold ends');
    const changes1 = await page.evaluate(() => changes.splice(0));
    const rej = changes1.find(c => c.text === REJECT), rep = changes1.find(c => c.text === 'Waiting for the server…');
    console.log(JSON.stringify({urgent: changes1.map(c => ({t: Math.round(c.t), text: c.text}))}));
    assert.ok(rej && Math.abs(rej.t - shownAt) <= 2, 'the rejection was committed at the moment it was set (within 2 ms)');
    assert.ok(rep.t - rej.t >= 1000, `the rejection stayed >=1000 ms (${Math.round(rep.t - rej.t)} ms)`);

    // 2. Plain non-urgent rapid changes (busy/idle every 60 ms) still coalesce.
    await page.clock.runFor(1500);
    const start = await t();
    for (let i = 0; i < 40; i++) { await page.evaluate(i => set(i % 2 ? '' : 'Updating…'), i); await page.clock.runFor(60); }
    await page.evaluate(() => set('Ready to continue.'));
    await page.clock.runFor(1200);
    const changes2 = await page.evaluate(() => changes.splice(0));
    const gaps = changes2.slice(1).map((c, i) => c.t - changes2[i].t);
    console.log(JSON.stringify({coalesced: {sets: 41, changes: changes2.length, minGapMs: gaps.length ? Math.round(Math.min(...gaps)) : null, overMs: Math.round(changes2.at(-1).t - start)}}));
    assert.ok(changes2.length >= 2 && changes2.length <= 4, `41 rapid sets over ~2.4 s produced few visible changes (${changes2.length})`);
    assert.ok(gaps.every(g => g >= 1000), `no non-urgent change faster than 1 s (gaps ${gaps.map(Math.round)})`);
    assert.equal(await text(), 'Ready to continue.', 'the latest wanted text is shown after the hold');

    // 3. An urgent text equal to the visible one restarts its hold instead of being lost.
    await page.clock.runFor(1500);
    await page.evaluate(() => set('Step change cancelled.', true));
    await page.clock.runFor(700);
    await page.evaluate(() => { set('', false); set('Step change cancelled.', true); set('Opening Review when the update finishes.'); });
    await page.clock.runFor(900);
    assert.equal(await text(), 'Step change cancelled.', 'a repeated urgent text is held again from its repeat');
    await page.clock.runFor(200);
    assert.equal(await text(), 'Opening Review when the update finishes.');
    console.log('test_team_status_hold: ok');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exit(1); });
