// Run with: node tests/dual-ui/test_team_stepper_queue.cjs
// A step clicked during a busy cycle is sent once on idle; a server rejection
// drops the pending state and keeps the server's message.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body class="team-workspace-app" data-guide-step="3" data-guide-analysis="false">
      <section id="team-workspace"><nav class="tw-steps"><button data-tw-stage="data"><span>01</span><strong>Data</strong></button><button data-tw-stage="review"><span>02</span><strong>Review</strong></button><button data-tw-stage="canvas"><span>03</span><strong>Canvas</strong></button></nav>
      <h2 id="tw-screen-title" tabindex="-1"></h2><p id="tw-screen-help"></p><span id="tw-progress"></span>
      <button data-tw-back>Back</button><button data-tw-next>Next</button><button data-tw-choice="matrix">Upload a new matrix</button><p id="tw-next"></p></section>
      <script>window.sent=[];window.handlers={};window.jqueryEvents={};window.jQuery=function(){return {on:function(names,fn){names.split(' ').forEach(name=>jqueryEvents[name]=fn);return this;},trigger:function(){return this;}}};window.fire=name=>jqueryEvents[name]&&jqueryEvents[name]();window.Shiny={setInputValue:(id,value)=>sent.push([id,value]),addCustomMessageHandler:(name,fn)=>handlers[name]=fn,shinyapp:{isConnected:()=>true}};</script>
    </body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/workspace.css')});
    await page.addScriptTag({path:path.resolve('www/team/js/workspace.js')});
    await page.evaluate(() => { handlers['team-auth-state']({authenticated:true}); window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true}})); });
    const canvas = page.locator('[data-tw-stage="canvas"]');
    const navs = () => page.evaluate(() => sent.filter(x => x[0]==='team_workspace_nav').map(x => x[1]));
    const clickCanvas = async () => { const b = await canvas.boundingBox(); await page.mouse.click(b.x+b.width/2, b.y+b.height/2); };
    assert.equal(await canvas.isDisabled(), false);

    await page.evaluate(() => fire('shiny:busy'));
    assert.equal(await canvas.isDisabled(), true);
    await clickCanvas();
    assert.equal(await canvas.getAttribute('data-tw-queued'), 'true', 'the busy click is queued');
    assert.equal(await canvas.getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#tw-next').textContent(), 'Opening Canvas when the update finishes.');
    assert.equal((await navs()).length, 0, 'nothing is sent while busy');
    await page.evaluate(() => fire('shiny:idle'));
    let sent = await navs();
    assert.equal(sent.length, 1, 'sent once on idle'); assert.equal(sent[0].step, 5);
    assert.equal(await canvas.getAttribute('data-tw-queued'), 'true', 'pending stays visible until the server answers');
    await page.evaluate(() => { fire('shiny:busy'); fire('shiny:idle'); fire('shiny:busy'); fire('shiny:idle'); });
    assert.equal((await navs()).length, 1, 'later idle cycles never send it again');

    await page.evaluate(token => handlers['team-navigation-receipt']({token, accepted:false, step:3, reason:'Server says no.'}), sent[0].token);
    assert.equal(await canvas.getAttribute('data-tw-queued'), null, 'a rejection drops the pending state');
    assert.equal(await canvas.getAttribute('aria-busy'), null);
    assert.equal(await page.locator('#tw-next').textContent(), 'Server says no.', 'the rejection message is kept');
    assert.equal(await canvas.isDisabled(), false);
    await page.evaluate(() => { fire('shiny:busy'); fire('shiny:idle'); });
    assert.equal((await navs()).length, 1, 'a rejected request is not retried');

    // Data that turns stale after the click keeps Canvas waiting, not dropped.
    await page.evaluate(() => fire('shiny:busy')); await clickCanvas();
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:false,pending:true}})); fire('shiny:idle'); });
    assert.equal((await navs()).length, 1, 'nothing is sent while preparation is pending');
    assert.equal(await canvas.getAttribute('data-tw-queued'), 'true', 'Canvas stays queued while preparation catches up');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true}})));
    sent = await navs(); assert.equal(sent.length, 2, 'Canvas opens once preparation is ready');
    await page.evaluate(token => handlers['team-navigation-receipt']({token, accepted:false, step:3, reason:'Again no.'}), sent[1].token);

    // A request accepted by the server completes once the body step follows.
    await page.evaluate(() => fire('shiny:busy')); await clickCanvas(); await page.evaluate(() => fire('shiny:idle'));
    sent = await navs(); assert.equal(sent.length, 3);
    await page.evaluate(token => { handlers['team-navigation-receipt']({token, accepted:true, step:5}); document.body.dataset.guideStep='5'; }, sent[2].token);
    await page.waitForFunction(() => document.body.dataset.teamStage === 'canvas');
    assert.equal(await canvas.getAttribute('data-tw-queued'), null);
    assert.equal((await navs()).length, 3);
    console.log('PASS: a busy-time stage click is queued, sent once on idle, and a rejection keeps the server message');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
