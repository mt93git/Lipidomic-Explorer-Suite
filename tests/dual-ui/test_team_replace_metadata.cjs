// Run with: node tests/dual-ui/test_team_replace_metadata.cjs
// UX17: Review has a visible "Replace sample metadata" button. It opens an in-page
// note (no window.confirm) with Replace / Cancel. Cancel does nothing; Replace opens
// the existing "Add sample labels" screen (data-metadata) through the same guarded
// route as "← Back" (team_workspace_nav step 1). During a busy lock the request is
// held and sent once at idle, never dropped; a newer step click replaces it. Focus
// never stays on a hidden note button. Opening the note moves nothing, at
// 390, 1280 and 1440 px.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
const CSS = ['www/team/css/libreros.css', 'www/team/css/workspace.css', 'www/team/css/workspace_minimal.css', 'www/team/css/shell.css', 'www/team/css/status_slot.css', 'www/team/css/review_live.css', 'www/team/css/replace_metadata.css'];
const JS = ['www/team/js/status_hold.js', 'www/team/js/workspace.js', 'www/team/js/replace_metadata.js'];
const NOTE = 'Groups and colours in Review will be rebuilt from the new table. Exclusions, Canvas figures and checkpoints are kept.';
const HTML = `<!doctype html><body class="team-workspace-app" data-guide-step="1" data-guide-analysis="false">
  <section id="team-workspace">
    <nav class="tw-steps" aria-label="Analysis steps"><button type="button" data-tw-stage="data"><span>01</span><strong>Data</strong></button><button type="button" data-tw-stage="review"><span>02</span><strong>Review</strong></button><button type="button" data-tw-stage="canvas"><span>03</span><strong>Canvas</strong></button></nav>
    <div class="tw-journey"><div class="tw-journey-copy"><span class="tw-progress" id="tw-progress"></span><h2 id="tw-screen-title" tabindex="-1">Choose how to begin</h2><p id="tw-screen-help">Help</p></div>
      <div class="tw-journey-actions"><button type="button" class="tw-back" data-tw-back="true">← Back</button><button type="button" class="tw-next" data-tw-next="true">Next →</button></div></div>
    <div class="tw-choice-card"><button type="button" data-tw-choice="matrix">Upload a new matrix</button></div>
    <p id="tw-next" role="status" aria-live="polite"></p>
  </section>
  <section class="tab-pane" data-value="Experiment"><div class="guide-page"><div id="guide-experiment-abundance">Matrix</div><div id="guide-experiment-metadata">Add sample labels</div><div id="guide-experiment-design"></div></div></section>
  <div class="tw-simple-review"><div id="board" style="height:300px;background:#eef">Review board</div></div>
  <div id="guide_experiment_summary">Abundance matrix loaded</div><div id="guide_experiment_next"></div>
  <script>window.sent=[];window.handlers={};window.jqueryEvents={};window.confirmCalls=0;window.confirm=()=>{confirmCalls++;return true;};window.jQuery=function(){return {on:function(names,fn){names.split(' ').forEach(name=>jqueryEvents[name]=fn);return this;},trigger:function(){return this;}}};window.Shiny={setInputValue:(id,value)=>sent.push([id,value]),addCustomMessageHandler:(name,fn)=>handlers[name]=fn,shinyapp:{isConnected:()=>true}};
  window.busy=()=>{document.documentElement.classList.add('shiny-busy');jqueryEvents['shiny:busy']();};window.idle=()=>{document.documentElement.classList.remove('shiny-busy');jqueryEvents['shiny:idle']();};</script>
</body>`;

async function load(browser, width) {
  const page = await browser.newPage({viewport: {width, height: 900}});
  await page.setContent(HTML);
  for (const f of CSS) await page.addStyleTag({path: path.resolve(f)});
  for (const f of JS) await page.addScriptTag({path: path.resolve(f)});
  return page;
}
async function toReview(page) {
  await page.evaluate(() => { handlers['team-auth-state']({authenticated: true}); document.body.dataset.guideStep = '3'; });
  await page.waitForFunction(() => TeamWorkspace.state().substep === 'review-single');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: true, pending: false, running: false, restoring: false, revision: 1}})));
}
const navs = page => page.evaluate(() => sent.filter(x => x[0] === 'team_workspace_nav'));
const visible = (page, sel) => page.locator(sel).isVisible();
const trigger = '.tw-replace-meta-trigger', note = '.tw-replace-meta-note';

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // A. Visible on Review only (not before sign-in, not on Data screens, not on Canvas).
    let page = await load(browser, 1440);
    assert.equal(await page.locator(trigger).count(), 1, 'one button is added to the journey actions');
    assert.equal(await visible(page, trigger), false, 'hidden before sign-in');
    await page.evaluate(() => handlers['team-auth-state']({authenticated: true}));
    assert.equal(await visible(page, trigger), false, 'hidden on data-choice');
    await page.locator('[data-tw-choice="matrix"]').click();
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'data-matrix');
    assert.equal(await visible(page, trigger), false, 'hidden on data-matrix');
    await toReview(page);
    assert.equal(await visible(page, trigger), true, 'visible on Review');
    assert.equal((await page.locator(trigger).textContent()).trim(), 'Replace sample metadata');
    assert.equal(await page.locator(trigger).isDisabled(), false);
    assert.equal(await visible(page, note), false, 'the note starts closed');
    await page.evaluate(() => { document.body.dataset.guideStep = '5'; });
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'canvas');
    assert.equal(await visible(page, trigger), false, 'hidden on Canvas');
    await page.close();

    // B. Cancel does nothing: no navigation, still Review, focus back on the button. Escape also closes.
    page = await load(browser, 1440);
    await toReview(page);
    await page.waitForTimeout(1200);
    const before = (await page.evaluate(() => sent.length));
    await page.locator(trigger).click();
    assert.equal(await visible(page, note), true, 'the in-page note opens');
    assert.equal(await page.locator(trigger).getAttribute('aria-expanded'), 'true');
    assert.equal((await page.locator(`${note} p`).textContent()).trim(), NOTE);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Replace', 'focus moves into the note');
    await page.locator('.tw-replace-meta-cancel').click();
    assert.equal(await visible(page, note), false, 'Cancel closes the note');
    assert.equal(await page.evaluate(() => sent.length), before, 'Cancel sends nothing');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'review-single', 'Cancel stays on Review');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('tw-replace-meta-trigger')), true, 'focus returns to the button');
    await page.locator(trigger).click(); await page.keyboard.press('Escape');
    assert.equal(await visible(page, note), false, 'Escape closes the note');
    await page.locator(trigger).click(); await page.locator('#board').click();
    assert.equal(await visible(page, note), false, 'a click outside closes the note');
    assert.equal(await page.evaluate(() => sent.length), before, 'closing never navigates');
    assert.equal(await page.evaluate(() => confirmCalls), 0, 'window.confirm is never used');
    await page.close();

    // C. Replace navigates exactly like Back from Review: team_workspace_nav step 1, then data-metadata.
    page = await load(browser, 1440);
    await toReview(page);
    await page.locator('[data-tw-back]').click();
    const backNav = (await navs(page))[0];
    await page.close();
    page = await load(browser, 1440);
    await toReview(page);
    await page.locator(trigger).click(); await page.locator('.tw-replace-meta-confirm').click();
    let n = await navs(page);
    assert.equal(n.length, 1, 'Replace sends one navigation');
    assert.equal(n[0][1].step, backNav[1].step, 'same server step as Back from Review');
    assert.equal(n[0][1].step, 1);
    assert.equal(await visible(page, note), false, 'the note closes on Replace');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('tw-replace-meta-trigger')), true, 'immediate confirmation: focus moves to the button, not left on the hidden Replace');
    await page.evaluate(token => handlers['team-navigation-receipt']({token, accepted: true, step: 1}), n[0][1].token);
    await page.evaluate(() => { document.body.dataset.guideStep = '1'; });
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'data-metadata');
    assert.equal(await page.locator('#guide-experiment-metadata').evaluate(el => el.classList.contains('tw-panel-hidden')), false, 'the existing Add sample labels panel is shown');
    assert.equal(await page.locator('#tw-screen-title').textContent(), 'Add sample labels');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tw-screen-title', 'on the new screen focus is on its title');
    assert.equal(await visible(page, trigger), false, 'the button is Review-only');
    await page.close();

    // D. During a shown busy lock the request is held (not dropped) and sent once at idle.
    page = await load(browser, 1440);
    await toReview(page);
    await page.waitForTimeout(2200); // status hold (1 s per text) settles
    await page.evaluate(() => busy()); await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-tw-back]').isDisabled(), true, 'the step lock is shown');
    await page.locator(trigger).click(); await page.locator('.tw-replace-meta-confirm').click();
    assert.equal((await navs(page)).length, 0, 'nothing is sent while Shiny is busy');
    await page.waitForFunction(() => /Opening Data when the update finishes/.test(document.getElementById('tw-next').textContent), null, {timeout: 2500}); // the held request is acknowledged
    assert.equal(await page.evaluate(() => { const a = document.activeElement; return a.classList.contains('tw-replace-meta-trigger') && a.getClientRects().length > 0; }), true, 'queued confirmation: focus is on the visible button');
    await page.locator(trigger).click(); await page.locator('.tw-replace-meta-confirm').click(); // a second confirmation
    await page.waitForTimeout(150); await page.evaluate(() => idle());
    n = await navs(page);
    assert.equal(n.length, 1, 'the held Replace is sent once at idle'); assert.equal(n[0][1].step, 1);
    await page.waitForTimeout(500); assert.equal((await navs(page)).length, 1, 'never sent twice');
    await page.close();
    // A short busy cycle (lock not yet shown) also holds it; Escape withdraws it like a step click.
    page = await load(browser, 1440);
    await toReview(page);
    await page.evaluate(() => busy());
    await page.locator(trigger).click(); await page.locator('.tw-replace-meta-confirm').click();
    assert.equal((await navs(page)).length, 0, 'held during a short busy cycle');
    await page.keyboard.press('Escape');
    await page.evaluate(() => idle()); await page.waitForTimeout(100);
    assert.equal((await navs(page)).length, 0, 'Escape withdraws the held request');
    await page.close();

    // D2. A queued Replace (data-metadata) followed by a Data step click during the same lock:
    // the newer target (data-choice) is the one sent, not the stale data-metadata.
    page = await load(browser, 1440);
    await toReview(page);
    await page.evaluate(() => busy()); await page.waitForTimeout(500);
    await page.locator(trigger).click(); await page.locator('.tw-replace-meta-confirm').click();
    const dataBox = await page.locator('[data-tw-stage="data"]').boundingBox();
    assert.equal(await page.locator('[data-tw-stage="data"]').isDisabled(), true, 'the Data step is locked');
    await page.mouse.click(dataBox.x + dataBox.width / 2, dataBox.y + dataBox.height / 2); // reaches the step bar through the disabled button
    assert.equal((await navs(page)).length, 0, 'nothing sent while busy');
    await page.waitForTimeout(150); await page.evaluate(() => idle());
    n = await navs(page);
    assert.equal(n.length, 1, 'one request at idle'); assert.equal(n[0][1].step, 1);
    await page.evaluate(token => handlers['team-navigation-receipt']({token, accepted: true, step: 1}), n[0][1].token);
    await page.evaluate(() => { document.body.dataset.guideStep = '1'; });
    await page.waitForFunction(() => TeamWorkspace.state().stage === 'data');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'data-choice', 'the newer Data step click wins over the queued data-metadata');
    await page.close();
    // And the API: a queued data-metadata is replaced by request('data'); repeating the same target is a no-op.
    page = await load(browser, 1440);
    await toReview(page);
    await page.evaluate(() => busy()); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => TeamWorkspace.open('data-metadata')), true);
    assert.equal(await page.evaluate(() => TeamWorkspace.open('data-metadata')), true, 'the same screen twice is held once');
    assert.equal(await page.evaluate(() => TeamWorkspace.request('data')), true);
    await page.evaluate(() => idle());
    n = await navs(page); assert.equal(n.length, 1);
    await page.evaluate(token => handlers['team-navigation-receipt']({token, accepted: true, step: 1}), n[0][1].token);
    await page.evaluate(() => { document.body.dataset.guideStep = '1'; });
    await page.waitForFunction(() => TeamWorkspace.state().stage === 'data');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'data-choice', 'request("data") replaces a queued data-metadata');
    await page.close();

    // D3. Programmatic closes (sign-out, screen change) never leave focus inside the hidden note.
    page = await load(browser, 1440);
    await toReview(page);
    await page.locator(trigger).click();
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Replace');
    await page.evaluate(() => handlers['team-auth-state']({authenticated: false}));
    let f = await page.evaluate(() => ({inNote: !!document.activeElement.closest('.tw-replace-meta-note'), id: document.activeElement.id, hidden: document.querySelector('.tw-replace-meta-note').hidden}));
    assert.equal(f.hidden, true, 'sign-out closes the note'); assert.equal(f.inNote, false, 'sign-out: focus is not left in the hidden note'); assert.equal(f.id, 'tw-screen-title');
    await page.evaluate(() => handlers['team-auth-state']({authenticated: true}));
    await page.locator(trigger).click();
    await page.evaluate(() => { document.body.dataset.guideStep = '1'; });
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'data-choice');
    f = await page.evaluate(() => ({inNote: !!document.activeElement.closest('.tw-replace-meta-note'), id: document.activeElement.id, hidden: document.querySelector('.tw-replace-meta-note').hidden}));
    assert.equal(f.hidden, true, 'a screen change closes the note'); assert.equal(f.inNote, false, 'screen change: focus is not left in the hidden note'); assert.equal(f.id, 'tw-screen-title');
    await page.close();

    // E. No layout shift, no horizontal overflow, note inside the viewport at 390 / 1280 / 1440.
    for (const width of [390, 1280, 1440]) {
      page = await load(browser, width);
      await toReview(page);
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        window.cls = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) cls += e.value; }).observe({type: 'layout-shift'});
        window.boxes = () => ['.tw-steps', '.tw-journey', '[data-tw-back]', '[data-tw-next]', '.tw-replace-meta-trigger', '#tw-next', '#board'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(','); }).join('|');
        window.box0 = boxes(); window.overflow0 = document.documentElement.scrollWidth;
      });
      const t = await page.locator(trigger).boundingBox();
      assert.ok(t && t.width > 0 && t.x >= 0 && t.x + t.width <= width, `${width}px: the button is fully on screen (${JSON.stringify(t)})`);
      const actions = await page.evaluate(() => [...document.querySelectorAll('.tw-journey-actions > *')].map(e => e.getBoundingClientRect()).map(r => [r.x, r.right]));
      for (const [x, right] of actions) assert.ok(x >= 0 && right <= width + 0.5, `${width}px: journey actions fit (${JSON.stringify(actions)})`);
      await page.locator(trigger).click();
      const nb = await page.locator(note).boundingBox();
      assert.ok(nb && nb.x >= 0 && nb.x + nb.width <= width + 0.5, `${width}px: the note is inside the viewport (${JSON.stringify(nb)})`);
      await page.waitForTimeout(100);
      const r = await page.evaluate(() => ({same: boxes() === box0, now: boxes(), box0, cls, overflow: document.documentElement.scrollWidth - overflow0}));
      assert.ok(r.same, `${width}px: opening the note moves nothing: ${r.now} vs ${r.box0}`);
      assert.ok(r.cls < 0.001, `${width}px: CLS ≈ 0 (${r.cls})`);
      assert.ok(r.overflow <= 0, `${width}px: the note adds no horizontal overflow (${r.overflow})`);
      await page.locator('.tw-replace-meta-cancel').click();
      assert.equal(await page.evaluate(() => boxes() === box0), true, `${width}px: closing moves nothing`);
      if (process.env.SHOT_DIR) { await page.locator(trigger).click(); await page.screenshot({path: path.join(process.env.SHOT_DIR, `team_replace_metadata_${width}.png`)}); }
      await page.close();
    }
    console.log('test_team_replace_metadata: ok');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exit(1); });
