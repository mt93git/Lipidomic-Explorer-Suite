// Run with: node tests/dual-ui/test_team_busy_debounce.cjs
// UX14: the workspace step lock follows Shiny busy with a debounce. A busy cycle
// shorter than 400 ms never changes the page; a real update shows the lock once
// and clears it 300 ms after idle. Navigation stays safe: a step click made while
// Shiny is busy is held and sent once, at idle. While the saved Canvas restores
// in the background (team-canvas-restore-status pending) and the analyst is on
// Review, its busy cycles never lock or blink the steps. No layout shift and no
// flicker of Continue / Canvas / the status line is allowed in any of these.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
const CSS = ['www/team/css/workspace.css', 'www/team/css/workspace_minimal.css', 'www/team/css/shell.css', 'www/team/css/status_slot.css'];
const JS = ['www/team/js/status_hold.js', 'www/team/js/workspace.js'];
const HTML = `<!doctype html><body class="team-workspace-app" data-guide-step="1" data-guide-analysis="false">
  <section id="team-workspace">
    <nav class="tw-steps" aria-label="Analysis steps"><button type="button" data-tw-stage="data"><span>01</span><strong>Data</strong></button><button type="button" data-tw-stage="review"><span>02</span><strong>Review</strong></button><button type="button" data-tw-stage="canvas"><span>03</span><strong>Canvas</strong></button></nav>
    <div class="tw-journey"><div class="tw-journey-copy"><span class="tw-progress" id="tw-progress"></span><h2 id="tw-screen-title" tabindex="-1">Choose how to begin</h2><p id="tw-screen-help">Help</p></div>
      <div class="tw-journey-actions"><button type="button" class="tw-back" data-tw-back="true">← Back</button><button type="button" class="tw-next" data-tw-next="true">Next →</button></div></div>
    <div class="tw-choice-card"><button type="button" data-tw-choice="matrix">Upload a new matrix</button></div>
    <p id="tw-next" role="status" aria-live="polite"></p>
  </section>
  <div id="board" style="height:300px;background:#eef">Review board</div>
  <script>window.sent=[];window.handlers={};window.jqueryEvents={};window.jQuery=function(){return {on:function(names,fn){names.split(' ').forEach(name=>jqueryEvents[name]=fn);return this;},trigger:function(){return this;}}};window.Shiny={setInputValue:(id,value)=>sent.push([id,value]),addCustomMessageHandler:(name,fn)=>handlers[name]=fn,shinyapp:{isConnected:()=>true}};
  window.busy=()=>{document.documentElement.classList.add('shiny-busy');jqueryEvents['shiny:busy']();};window.idle=()=>{document.documentElement.classList.remove('shiny-busy');jqueryEvents['shiny:idle']();};</script>
</body>`;

async function reviewPage(browser) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  await page.setContent(HTML);
  for (const f of CSS) await page.addStyleTag({path: path.resolve(f)});
  for (const f of JS) await page.addScriptTag({path: path.resolve(f)});
  await page.evaluate(() => { handlers['team-auth-state']({authenticated: true}); document.body.dataset.guideStep = '3'; });
  await page.waitForFunction(() => TeamWorkspace.state().substep === 'review-single');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: true, pending: false, running: false, restoring: false, revision: 1}})));
  await page.waitForTimeout(2200); // status hold (1 s per text) settles
  await page.evaluate(() => {
    window.flips = []; window.cls = 0;
    const watch = (el, name) => new MutationObserver(ms => ms.forEach(m => flips.push([performance.now(), name, m.attributeName || 'text', m.attributeName ? el.getAttribute(m.attributeName) : el.textContent]))).observe(el, {attributes: true, attributeFilter: ['disabled', 'class', 'style'], childList: true, characterData: true, subtree: name === 'status'});
    watch(document.querySelector('[data-tw-next]'), 'continue'); watch(document.querySelector('[data-tw-stage="canvas"]'), 'canvas'); watch(document.getElementById('tw-next'), 'status');
    window.boxes = () => ['[data-tw-next]', '[data-tw-stage="canvas"]', '#tw-next', '#board'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(','); }).join('|');
    window.box0 = boxes();
    new PerformanceObserver(l => { for (const e of l.getEntries()) cls += e.value; }).observe({type: 'layout-shift'});
  });
  return page;
}
const navs = page => page.evaluate(() => sent.filter(x => x[0] === 'team_workspace_nav'));
const state = page => page.evaluate(() => ({cont: document.querySelector('[data-tw-next]').disabled, canvas: document.querySelector('[data-tw-stage="canvas"]').disabled, text: document.getElementById('tw-next').textContent, same: boxes() === box0, boxes: boxes(), box0}));

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // A. 40 short busy cycles (90 ms busy / 150 ms idle, like the autosave and 30 s companion ticks): nothing moves or blinks.
    let page = await reviewPage(browser);
    assert.equal((await state(page)).cont, false, 'Continue to Canvas starts enabled on a ready Review');
    for (let i = 0; i < 40; i++) { await page.evaluate(() => busy()); await page.waitForTimeout(90); await page.evaluate(() => idle()); await page.waitForTimeout(150); }
    await page.waitForTimeout(1200);
    let r = await page.evaluate(() => ({flips, cls}));
    assert.deepEqual(r.flips, [], `short busy cycles change nothing: ${JSON.stringify(r.flips.slice(0, 6))}`);
    assert.ok(r.cls < 0.001, `CLS ≈ 0 during short cycles (${r.cls})`);
    assert.ok((await state(page)).same, 'Continue, Canvas, the status line and the board keep their boxes');

    // B. A click on Canvas inside a short busy cycle is held, then sent exactly once at idle.
    await page.evaluate(() => busy());
    await page.evaluate(() => document.querySelector('[data-tw-stage="canvas"]').click());
    assert.equal((await navs(page)).length, 0, 'no step change is sent while Shiny is busy');
    await page.waitForTimeout(120); await page.evaluate(() => idle());
    let n = await navs(page);
    assert.equal(n.length, 1, 'the held Canvas click is sent once at idle'); assert.equal(n[0][1].step, 5);
    await page.waitForTimeout(600); assert.equal((await navs(page)).length, 1, 'never sent twice');
    await page.close();

    // C. A real update (900 ms) shows the lock once, with stable boxes; it clears 300 ms after idle.
    page = await reviewPage(browser);
    await page.evaluate(() => busy()); await page.waitForTimeout(250);
    assert.equal((await state(page)).cont, false, 'not locked before 400 ms');
    await page.waitForTimeout(400);
    let s = await state(page);
    assert.equal(s.cont, true, 'Continue is disabled during a real update'); assert.equal(s.canvas, true, 'Canvas step is disabled during a real update');
    assert.equal(s.text, 'Updating…', 'Review shows one update text'); assert.ok(s.same, `no layout change while locked: ${s.boxes} vs ${s.box0}`);
    await page.waitForTimeout(250); await page.evaluate(() => idle());
    await page.waitForTimeout(150); assert.equal((await state(page)).cont, true, 'the lock stays up just after idle (no blink)');
    await page.evaluate(() => busy()); await page.waitForTimeout(500); await page.evaluate(() => idle()); // back-to-back cycle
    await page.waitForTimeout(450);
    s = await state(page);
    assert.equal(s.cont, false, 'the lock clears ~300 ms after the final idle');
    r = await page.evaluate(() => ({flips: flips.filter(f => f[2] === 'disabled'), cls}));
    const transitions = r.flips.filter(f => f[1] === 'continue').map(f => f[3] !== null).filter((v, i, xs) => i === 0 || v !== xs[i - 1]);
    assert.deepEqual(transitions, [true, false], `Continue locked and unlocked exactly once across back-to-back cycles: ${JSON.stringify(r.flips)}`);
    assert.ok(r.cls < 0.001, `CLS ≈ 0 across a real update (${r.cls})`);
    await page.close();

    // D. Background Canvas restore while on Review: long busy cycles never lock; Go to Canvas is held and sent once at idle.
    page = await reviewPage(browser);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-canvas-restore-status', {detail: {status: 'pending', token: 'restore-1'}})));
    for (let i = 0; i < 6; i++) { await page.evaluate(() => busy()); await page.waitForTimeout(700); await page.evaluate(() => idle()); await page.waitForTimeout(120); }
    r = await page.evaluate(() => ({flips: flips.filter(f => f[2] === 'disabled' || f[1] === 'status'), cls}));
    assert.deepEqual(r.flips, [], `background restore busy never locks or blinks Review: ${JSON.stringify(r.flips.slice(0, 6))}`);
    assert.ok(r.cls < 0.001, `CLS ≈ 0 during the background restore (${r.cls})`);
    await page.evaluate(() => busy());
    await page.evaluate(() => document.querySelector('[data-tw-next]').click()); // Continue to Canvas
    await page.evaluate(() => document.querySelector('[data-tw-stage="canvas"]').click()); // and a second click
    await page.waitForTimeout(500);
    assert.equal((await navs(page)).length, 0, 'nothing is sent mid-cycle');
    s = await state(page);
    assert.match(s.text, /Opening Canvas when the update finishes/, 'a held click is acknowledged once it waits');
    assert.ok(s.same, 'the acknowledgement does not move anything');
    await page.evaluate(() => idle());
    n = await navs(page);
    assert.equal(n.length, 1, 'two clicks during the restore send one Canvas request'); assert.equal(n[0][1].step, 5);
    await page.evaluate(token => handlers['team-navigation-receipt']({token, accepted: true, step: 5}), n[0][1].token);
    await page.evaluate(() => { document.body.dataset.guideStep = '5'; });
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'canvas');
    // On Canvas the restore's own progress is shown by canvas.js; a real update locks the steps again.
    await page.evaluate(() => busy()); await page.waitForTimeout(550);
    assert.equal(await page.evaluate(() => document.querySelector('[data-tw-stage="data"]').disabled), true, 'on Canvas a real update still locks the steps');
    await page.evaluate(() => idle()); await page.waitForTimeout(400);
    assert.equal((await navs(page)).length, 1, 'still exactly one navigation');
    await page.close();
    // E. The public TeamWorkspace.go() (companion and help navigation) queues like a step click:
    // during a shown lock it is held, then sent once at idle.
    page = await reviewPage(browser);
    await page.evaluate(() => busy()); await page.waitForTimeout(500);
    assert.equal((await state(page)).canvas, true, 'locked');
    assert.equal(await page.evaluate(() => TeamWorkspace.go('canvas')), true, 'go() during the lock is accepted (queued)');
    assert.equal((await navs(page)).length, 0, 'not sent while busy');
    await page.evaluate(() => idle());
    n = await navs(page); assert.equal(n.length, 1, 'go() is sent once at idle'); assert.equal(n[0][1].step, 5);
    await page.close();

    // F. A foreground update during the background restore is not hidden: a Review preparation
    // (threshold change) or an owned TeamBusy operation shows the lock.
    page = await reviewPage(browser);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-canvas-restore-status', {detail: {status: 'pending', token: 'restore-1'}})));
    await page.evaluate(() => busy()); await page.waitForTimeout(500);
    assert.equal((await state(page)).cont, false, 'background restore alone: no lock');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: false, pending: true, running: false, restoring: false, revision: 2}})));
    assert.equal(await page.evaluate(() => document.querySelector('[data-tw-stage="data"]').disabled), true, 'a Review preparation mid-restore shows the lock at once (busy already > 400 ms)');
    // The preparation ends while the background restore keeps Shiny busy: the lock clears without an idle.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: true, pending: false, running: false, restoring: false, revision: 3}})));
    assert.equal(await page.evaluate(() => document.querySelector('[data-tw-stage="data"]').disabled), false, 'lock clears when foreground ends mid-restore, with Shiny still busy');
    await page.evaluate(() => idle()); await page.waitForTimeout(400);
    await page.evaluate(() => { window.TeamBusy = {pending: () => 1}; busy(); }); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.querySelector('[data-tw-stage="data"]').disabled), true, 'an owned foreground operation mid-restore shows the lock');
    await page.evaluate(() => { window.TeamBusy = {pending: () => 0}; idle(); });
    await page.close();

    // G. Disconnect resets busy, the lock, a held click and the restore flag; nothing is stale after reconnect.
    page = await reviewPage(browser);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-canvas-restore-status', {detail: {status: 'pending', token: 'restore-1'}})));
    await page.evaluate(() => busy());
    await page.evaluate(() => document.querySelector('[data-tw-stage="canvas"]').click()); // held
    await page.evaluate(() => jqueryEvents['shiny:disconnected']());
    await page.evaluate(() => { document.documentElement.classList.remove('shiny-busy'); handlers['team-auth-state']({authenticated: true}); });
    await page.waitForTimeout(600);
    s = await state(page);
    assert.equal(s.canvas, false, 'after reconnect Canvas is not locked by a stale busy'); assert.equal(s.cont, false);
    assert.equal((await navs(page)).length, 0, 'the click held before the disconnect is not replayed');
    await page.evaluate(() => busy()); await page.waitForTimeout(500);
    assert.equal((await state(page)).canvas, true, 'the restore flag was cleared: a real update locks again on Review');
    await page.evaluate(() => idle());
    await page.close();
    console.log('test_team_busy_debounce: ok');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exit(1); });
