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
      <section class="tab-pane" data-value="Preparation"><div class="guide-page tw-simple-review"><div class="guide-columns"><div class="guide-panel"><h3>Prepare</h3><div class="shiny-input-container"><input id="qc_pca_tab-dropNonDetected"></div><div class="shiny-input-container"><input id="qc_pca_tab-detectionScope"></div><div class="shiny-input-container"><input id="qc_pca_tab-imputationSeed"></div></div><div class="guide-panel"></div></div><div id="guide-qc-review"></div></div></section>
      <section class="tab-pane" data-value="Question"><div class="guide-page"><div class="guide-goals"><button>Big picture</button><button>Compare</button><button>Structure</button><button>Function</button><button>Time</button></div><div id="guide_question_summary"></div><div id="guide_question_requirements"></div><div id="guide-contrast-controls"></div></div></section>
      <div id="guide_experiment_summary"></div><div id="guide_experiment_next"></div><div id="guide_design_status"></div><div id="guide_quality_status"></div>
      </main><script>window.resizeCount=0;window.addEventListener("resize",()=>resizeCount++);window.sent=[];window.handlers={};window.jqueryEvents={};window.jQuery=function(){return {on:function(names,fn){names.split(' ').forEach(name=>jqueryEvents[name]=fn);return this;},trigger:function(){return this;}}};window.fireJQueryEvent=name=>jqueryEvents[name]&&jqueryEvents[name]();window.Shiny={setInputValue:(id,value)=>sent.push([id,value]),addCustomMessageHandler:(name,fn)=>handlers[name]=fn,shinyapp:{isConnected:()=>true}};</script>
    </body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/workspace.css')});
    await page.addScriptTag({path:path.resolve('www/team/js/workspace.js')});
    assert.equal(await page.locator('[data-tw-stage="data"]').isDisabled(),true,'stage navigation is locked before authentication');
    assert.match(await page.locator('[data-tw-stage="data"]').getAttribute('aria-label'),/Sign in/);
    assert.match(await page.locator('#tw-next').textContent(),/Sign in/);
    await page.evaluate(() => handlers['team-auth-state']({authenticated:true}));
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'data-choice');
    const canvasStage=page.locator('[data-tw-stage="canvas"]');
    assert.equal(await canvasStage.isDisabled(),true,'Canvas stays unavailable until prepared data is ready');
    assert.equal(await canvasStage.getAttribute('aria-describedby'),'tw-next','disabled stage navigation points to its live status');
    assert.match(await canvasStage.getAttribute('aria-label'),/Prepare the current data in Review/);
    const sentBeforeCanvas=await page.evaluate(()=>sent.length);
    assert.equal(await page.evaluate(()=>TeamWorkspace.go('canvas')),false,'the navigation API enforces the same preparation gate');
    assert.equal(await page.evaluate(()=>sent.length),sentBeforeCanvas,'an unavailable Canvas request is not sent to the server');
    assert.match(await page.locator('#tw-next').textContent(),/Prepare the current data in Review/);
    await page.evaluate(()=>{fireJQueryEvent('shiny:busy');});
    assert.equal(await page.locator('[data-tw-stage="data"]').isDisabled(),true,'all stage navigation locks while a workspace request is active');
    assert.match(await page.locator('[data-tw-stage="data"]').getAttribute('aria-label'),/workspace update is running/i);
    assert.equal(await canvasStage.isDisabled(),true);
    assert.match(await page.locator('#tw-next').textContent(),/workspace update is running/i);
    const sentBeforeBusy=await page.evaluate(()=>sent.length);
    assert.equal(await page.evaluate(()=>TeamWorkspace.go('review')),false);
    assert.equal(await page.evaluate(()=>sent.length),sentBeforeBusy,'busy navigation is not silently submitted');
    await page.evaluate(()=>{fireJQueryEvent('shiny:idle');});
    assert.equal(await page.locator('[data-tw-stage="data"]').isDisabled(),false,'stage navigation unlocks when the request finishes');
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
    await page.evaluate(() => { const b=document.createElement('button');b.dataset.guideStep='2';document.getElementById('guide_experiment_next').appendChild(b);document.body.dataset.guideAnalysis='false'; });
    await page.waitForFunction(() => TeamWorkspace.state().canNext === true);
    await page.locator('[data-tw-next]').click();
    assert.deepEqual(await page.evaluate(() => sent.at(-1)), ['team_workspace_nav',{step:3,token:1}]);
    assert.equal(await page.locator('[data-tw-stage="data"]').isDisabled(),true,'stage navigation cannot race an in-flight route');
    assert.match(await page.locator('[data-tw-stage="data"]').getAttribute('aria-label'),/navigation to finish/i);
    assert.match(await page.locator('#tw-next').textContent(),/Opening the requested screen/);
    // Receipt and body update can arrive in either order; neither duplicate nor
    // mismatched receipt may complete the pending navigation.
    await page.evaluate(() => handlers['team-navigation-receipt']({token:99,accepted:true,step:3}));
    assert.equal(await page.evaluate(() => TeamWorkspace.next()), false);
    await page.evaluate(() => handlers['team-navigation-receipt']({token:1,accepted:true,step:3}));
    assert.equal(await page.locator('[data-tw-stage="data"]').isDisabled(),true,'stage navigation waits for the matching body update as well as the route receipt');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substep), 'data-metadata');
    await page.evaluate(() => {document.body.dataset.guideStep='3';});
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'review-single');
    assert.equal(await page.locator('[data-tw-stage="data"]').isDisabled(),false,'stage navigation unlocks after both route signals arrive');
    assert.deepEqual(await page.evaluate(() => sent.at(-1)), ['team_review_prepare',{kind:'entry',source:'human',token:1}], 'entry preparation is requested only after an explicit human Next reaches Review');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().substepCount), 5);
    assert.equal(await page.locator('[data-tw-next]').textContent(), 'Continue to Canvas →');
    assert.equal(await page.evaluate(() => TeamWorkspace.next()), false, 'unprepared data cannot continue');
    assert.equal(await canvasStage.isDisabled(),true,'restored Review does not expose Canvas before preparation is ready');
    assert.match(await page.locator('#tw-next').textContent(),/Prepare the current data in Review/);
    const sentBeforeUnpreparedCanvas=await page.evaluate(()=>sent.length);
    assert.equal(await page.evaluate(()=>TeamWorkspace.go('canvas')),false);
    assert.equal(await page.evaluate(()=>sent.length),sentBeforeUnpreparedCanvas,'Canvas is not routed and rejected while Review preparation is incomplete');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,restoring:true,revision:1}})));
    assert.equal(await page.evaluate(() => TeamWorkspace.state().preparationReady),false,'a restored preparation payload cannot become ready while the saved session is still restoring');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().preparationRestoring),true);
    assert.equal(await canvasStage.isDisabled(),true,'Canvas stays locked while saved-session restoration is active');
    assert.match(await canvasStage.getAttribute('aria-label'),/Restoring your saved session/);
    assert.match(await page.locator('#tw-next').textContent(),/Restoring your saved session/);
    const sentBeforeRestoringCanvas=await page.evaluate(()=>sent.length);
    assert.equal(await page.evaluate(()=>TeamWorkspace.go('canvas')),false,'the public Team navigation API also blocks Canvas during restore');
    assert.equal(await page.evaluate(()=>sent.length),sentBeforeRestoringCanvas,'restore-blocked Canvas is not sent to the server');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,restoring:false,revision:1}})));
    assert.equal(await page.evaluate(() => TeamWorkspace.state().preparationReady),true,'preparation becomes ready only after restoration clears');
    assert.equal(await page.evaluate(() => TeamWorkspace.state().canNext), true, 'no design checkbox required');
    assert.equal(await canvasStage.isDisabled(),false,'Canvas stage unlocks when Review preparation is ready');
    assert.equal(await canvasStage.getAttribute('aria-label'),null,'ready stage labels return to their visible text');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:false,pending:true,running:false,revision:1}})));
    assert.equal(await canvasStage.isDisabled(),true,'pending data changes disable Canvas navigation');
    assert.match(await canvasStage.getAttribute('aria-label'),/Data changes are pending/);
    assert.equal(await page.evaluate(() => TeamWorkspace.next()), false, 'pending preparation blocks stale result');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:true,revision:1}})));
    assert.equal(await canvasStage.isDisabled(),true,'running preparation disables Canvas navigation');
    assert.match(await page.locator('#tw-next').textContent(),/updating/i);
    assert.equal(await page.evaluate(() => TeamWorkspace.next()), false, 'running preparation blocks continuation');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:2}})));
    await page.evaluate(() => TeamWorkspace.next());
    assert.deepEqual(await page.evaluate(() => sent.at(-1)), ['team_workspace_nav',{step:5,token:2}]);
    assert.equal(await page.evaluate(() => TeamWorkspace.next()), false, 'pending navigation cannot be duplicated');
    await page.evaluate(() => {document.body.dataset.guideStep='5';});
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'canvas');
    await page.evaluate(() => handlers['team-navigation-receipt']({token:2,accepted:true,step:5}));
    assert.equal(await page.locator('#tw-screen-title').evaluate(el => document.activeElement===el), true);
    // The advanced tool occupies legacy step 5 too. Returning to Canvas must
    // go through the server even though the numeric step is unchanged.
    await page.evaluate(()=>{document.body.dataset.guideAnalysis='true';});
    await page.waitForFunction(()=>TeamWorkspace.state().tool==='advanced analysis');
    const countBeforeReturn=await page.evaluate(()=>sent.length);
    await page.locator('[data-tw-stage="canvas"]').click();
    const request=await page.evaluate(()=>sent.at(-1));
    assert.equal(request[0],'team_workspace_nav');assert.equal(request[1].step,5);
    assert.equal(await page.evaluate(()=>sent.length),countBeforeReturn+1);
    await page.evaluate(token=>{document.body.dataset.guideAnalysis='false';handlers['team-navigation-receipt']({token,accepted:true,step:5});},request[1].token);
    await page.waitForFunction(()=>TeamWorkspace.state().tool==='');
    assert.equal(await page.evaluate(()=>TeamWorkspace.state().substep),'canvas');
    assert.equal(await page.evaluate(()=>sent.length),countBeforeReturn+1,'return must not request a scientific change');

    await page.evaluate(() => {document.body.dataset.guideStep='7';});
    await page.waitForFunction(() => TeamWorkspace.state().stage === 'canvas');
    assert.equal(await page.locator('#team_library_save').isVisible(), true, 'save returns on Save & export');
    await page.evaluate(() => {document.body.dataset.guideStep='1';document.getElementById('guide_experiment_summary').textContent='Abundance matrix loaded';});
    await page.waitForFunction(() => TeamWorkspace.state().stage === 'data');
    await page.locator('#team_library_resume').click();
    await page.evaluate(() => {document.documentElement.classList.add('shiny-busy');fireJQueryEvent('shiny:busy');document.body.dataset.guideStep='3';handlers['team-review-restore-ready']({ready:true,generation:1});});
    await page.waitForFunction(() => TeamWorkspace.state().stage === 'review');
    // Restore readiness at Review sends the guarded preparation at once, even while
    // Shiny is busy (the server queues it); it no longer waits for idle.
    await page.waitForFunction(() => sent.some(x => x[0] === 'team_review_prepare' && x[1].token === 2));
    assert.deepEqual(await page.evaluate(() => sent.filter(x => x[0] === 'team_review_prepare').at(-1)), ['team_review_prepare',{kind:'entry',source:'human',token:2}], 'a trusted Resume request waits for restored data at Review');
    await page.evaluate(() => { document.documentElement.classList.remove('shiny-busy'); fireJQueryEvent('shiny:idle'); });
    await page.waitForTimeout(40);
    assert.equal(await page.evaluate(() => sent.filter(x => x[0] === 'team_review_prepare' && x[1].token >= 2).length), 1, 'idle after readiness does not repeat the preparation');
    console.log('PASS: Team workspace has one review screen, current preparation gate, race-safe navigation, and keyboard focus');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
