// Run with: node tests/dual-ui/test_team_workspace_shell.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body data-guide-step="1" data-guide-analysis="false">
      <main style="display:flex;flex-direction:column;height:800px"><section id="team-workspace"><nav><button data-tw-stage="data">Data</button><button data-tw-stage="review">Review</button><button data-tw-stage="canvas">Canvas</button></nav>
      <h2 id="tw-screen-title" tabindex="-1"></h2><p id="tw-screen-help"></p><span id="tw-progress"></span>
      <button data-tw-back>Back</button><button data-tw-next>Next</button><button data-tw-choice="matrix">Upload a new matrix</button><button data-tw-logout>Sign out</button><p id="tw-next"></p></section>
      <section class="team-library"><h3>Library</h3><p>Resume</p><div class="shiny-input-container"><input id="team_library_label"></div><button id="team_library_save">Save</button><button id="team_library_retry">Retry</button><button id="team_library_resume">Resume</button><button id="team_library_logout">Sign out</button></section>
      <section class="tab-pane" data-value="Experiment"><div class="guide-page"><div class="guide-heading"><h2>Experiment</h2></div><div id="guide-experiment-abundance"></div><div id="guide-experiment-metadata"></div><div id="guide-experiment-design"></div><details class="guide-panel"><summary>ZIP</summary></details></div></section>
      <section class="tab-pane" data-value="Design"><div class="guide-page"><div class="guide-panel" id="labels"></div><div id="guide-design-decisions" class="guide-panel"></div><div id="guide-sample-selection"></div><div id="guide-design-review"></div></div></section>
      <section class="tab-pane" data-value="Preparation"><div class="guide-page"><div class="guide-columns"><div class="guide-panel"><h3>Prepare</h3><div class="shiny-input-container"><input id="qc_pca_tab-dropNonDetected"></div><div class="shiny-input-container"><input id="qc_pca_tab-detectionScope"></div><div class="shiny-input-container"><input id="qc_pca_tab-imputationSeed"></div></div><div class="guide-panel"></div></div><div id="guide-qc-review"></div></div></section>
      <section class="tab-pane" data-value="Question"><div class="guide-page"><div class="guide-goals"><button>Big picture</button><button>Compare</button><button>Structure</button><button>Function</button><button>Time</button></div><div id="guide_question_summary"></div><div id="guide_question_requirements"></div><div id="guide-contrast-controls"></div></div></section>
      <div id="guide_experiment_summary"></div><div id="guide_experiment_next"></div><div id="guide_design_status"></div><div id="guide_quality_status"></div>
      </main><script>window.resizeCount=0;window.addEventListener("resize",()=>resizeCount++);window.sent=[];window.handlers={};window.Shiny={setInputValue:(id,value)=>sent.push([id,value]),addCustomMessageHandler:(name,fn)=>handlers[name]=fn,shinyapp:{isConnected:()=>true}};</script>
    </body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/workspace.css')});
    await page.addScriptTag({path:path.resolve('www/team/js/workspace.js')});
    await page.evaluate(() => handlers['team-auth-state']({authenticated:true}));
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'data-choice');
    assert.ok(await page.locator('#team-workspace').evaluate(el=>el.getBoundingClientRect().height<500), 'shell height follows content inside vertical bslib flex container');
    assert.equal(await page.locator('#team_library_save').isVisible(), false, 'save is absent from the start/resume choice');
    assert.equal(await page.locator('#team_library_resume').isVisible(), true);
    await page.locator('[data-tw-choice="matrix"]').click();
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'data-matrix');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().canNext), false, 'upload is required before metadata');
    assert.equal(await page.evaluate(() => TeamWorkspace.next()), false, 'API cannot bypass a disabled Next');
    await page.evaluate(() => {document.getElementById('guide_experiment_summary').textContent='Abundance matrix loaded';document.body.dataset.guideAnalysis='true';});
    await page.waitForFunction(() => TeamWorkspace.state().canNext === true);
    assert.equal(await page.locator('#guide-experiment-abundance').evaluate(el => el.classList.contains('tw-panel-hidden')), false);
    assert.equal(await page.locator('#guide-experiment-metadata').evaluate(el => el.classList.contains('tw-panel-hidden')), true);
    await page.locator('[data-tw-next]').click();
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'data-metadata');
    assert.equal(await page.locator('[data-tw-next]').isDisabled(), true, 'metadata decision stays explicit');
    await page.evaluate(() => { const b=document.createElement('button');b.dataset.guideStep='2';document.getElementById('guide_experiment_next').appendChild(b);document.dispatchEvent(new Event('shiny:value')); });
    await page.evaluate(() => TeamWorkspace.next());
    assert.deepEqual(await page.evaluate(() => sent.at(-1)), ['team_workspace_nav',{step:2,token:1}]);
    await page.waitForTimeout(1900);
    assert.match(await page.locator('#tw-next').innerText(), /Waiting for the server/);
    assert.equal(await page.evaluate(() => TeamWorkspace.next()), false, 'slow server must not discard pending navigation or permit a duplicate');
    await page.evaluate(() => {document.body.dataset.guideStep='2';handlers['team-navigation-receipt']({token:1,accepted:true,step:2});});
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'review-labels');
    await page.evaluate(() => TeamWorkspace.next());
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'review-design');
    await page.evaluate(() => TeamWorkspace.next());
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'review-confirm');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().canNext), false, 'design confirmation gates preparation');
    await page.evaluate(() => {document.getElementById('guide_design_status').textContent='Design review complete';document.dispatchEvent(new Event('shiny:value'));});
    await page.evaluate(() => TeamWorkspace.next());
    assert.deepEqual(await page.evaluate(() => sent.at(-1)), ['team_workspace_nav',{step:3,token:2}]);
    await page.evaluate(() => {document.body.dataset.guideStep='3';handlers['team-navigation-receipt']({token:2,accepted:true,step:3});});
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'review-prepare');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().canNext), false, 'preparation completion gates QC review');
    await page.evaluate(() => {document.getElementById('guide_quality_status').textContent='Preparation complete';window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:false,pending:true,running:false,revision:1}})));
    assert.equal(await page.evaluate(() => TeamWorkspace.next()), false, 'pending preparation blocks Next even with old completion text');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}})));
    await page.evaluate(() => TeamWorkspace.next());
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'review-quality');
    await page.waitForFunction(()=>resizeCount>=5); // each microstep notifies Shiny to recalculate output geometry
    assert.equal(await page.locator('#qc_pca_tab-imputationSeed').evaluate(el => !!el.closest('.tw-advanced-prep')), true);
    assert.equal(await page.locator('.tw-more-goals > button').count(), 3);
    assert.equal(await page.locator('#tw-screen-title').evaluate(el => document.activeElement===el), true);
    await page.evaluate(() => {document.body.dataset.guideStep='7';});
    await page.waitForFunction(() => TeamWorkspace.state().stage === 'canvas');
    assert.equal(await page.locator('#team_library_save').isVisible(), true, 'save returns on Save & export');
    console.log('PASS: Team workspace has progressive screens, explicit gates, preserved controls, and keyboard focus');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
