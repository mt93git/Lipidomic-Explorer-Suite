// Run with: node tests/dual-ui/test_team_companion_workspace.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent(`<!doctype html><body>
      <aside class="assistant-root" id="lipidomic-assistant-root">
        <button class="assistant-launcher">Ask companion</button>
        <section id="lipidomic-assistant-panel" hidden>
          <div class="assistant-panel-body">
            <div class="assistant-context-actions"></div>
            <div class="assistant-actions">
              <button class="assistant-action" id="legacy-review">Review Quality</button>
              <button class="assistant-action" id="scientific-proposal">Propose setting</button>
            </div>
            <form class="assistant-chat-form"><input class="assistant-chat-input" aria-label="Ask a question"><button class="assistant-send">Send</button></form>
            <section class="assistant-preview">
              <button id="confirm-change">Update Quality setting</button>
              <button id="cancel-change">Keep current settings</button>
            </section>
          </div>
        </section>
      </aside>
      <div id="lipidomic-help-bar">
        <button id="lipidomic-context-help">Help with Design</button>
        <button id="lipidomic-tour">Seven-step tour</button>
      </div>
      <aside id="lipidomic-companion"><button class="companion-launcher"><span class="companion-help-label">Let’s map your study</span></button>
        <aside class="companion-speech"><div class="speech-copy" role="status" aria-live="polite">
          <span class="speech-eyebrow">YOU ARE HERE · 1 / 7</span>
          <strong class="speech-title">Add the abundance matrix</strong>
          <p>Choose the measured Excel or CSV abundance file first.</p>
          <button class="guide-button">Choose abundance file</button>
        </div><button class="speech-close" aria-label="Dismiss companion message">×</button>
        <button class="assistant-speech-chat">Ask about this step</button></aside>
      </aside>
      <h2 id="tw-screen-title">Choose how to begin</h2>
      <button id="data_hub-files" type="button">Hidden legacy file target</button>
      <section class="lipid-help-panel">
        <div class="help-eyebrow">THE SEVEN-STEP TOUR</div>
        <h3 id="lipidomic-help-title">Design</h3>
        <div class="help-step-progress"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="help-tour-nav"><span>Step 2 of 7</span><button>Back</button><button>Next</button></div>
      </section>
    </body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/companion_assistant.css')});
    await page.evaluate(() => {
      window.workspaceCalls = [];
      window.nextCalls = 0;
      window.canvasCalls = [];
      window.shinyInputs = [];
      window.messageHandlers = {};
      const storage = {};
      Object.defineProperty(window, 'localStorage', {configurable:true,value:{
        getItem:key => Object.prototype.hasOwnProperty.call(storage,key) ? storage[key] : null,
        setItem:(key,value) => { storage[key] = String(value); },
        removeItem:key => { delete storage[key]; }
      }});
      window.TeamWorkspace = {go: stage => workspaceCalls.push(stage),next:() => { nextCalls += 1; }};
      window.LIPIDOMIC_TEAM_WORKSPACE = '1';
      window.TeamCanvas = {
        listPlots: () => [
          {id:'dynamic',title:'Dynamic output',added:false,available:false},
          {id:'plot-one',title:'PCA',added:canvasCalls.includes('plot-one'),available:true}
        ],
        addPlot: id => { canvasCalls.push(id); return true; },
        selected: () => null
      };
      window.Shiny = {
        setInputValue: (name,value) => shinyInputs.push({name,value}),
        addCustomMessageHandler: (name,handler) => { messageHandlers[name] = handler; }
      };
      window.confirmCalls = 0;
      window.legacyTargetClicks = 0;
      document.getElementById('data_hub-files').onclick = () => { legacyTargetClicks += 1; };
      document.querySelector('.companion-launcher').onclick = () => { document.getElementById('lipidomic-assistant-panel').hidden = false; };
      document.querySelector('#lipidomic-assistant-root .assistant-launcher').onclick = () => { document.getElementById('lipidomic-assistant-panel').hidden = false; };
      document.getElementById('confirm-change').onclick = () => { confirmCalls += 1; };
      document.getElementById('cancel-change').onclick = () => { confirmCalls += 1; };
    });
    await page.addScriptTag({path:path.resolve('www/team/js/companion_workspace.js')});
    // The adapter renders on requestAnimationFrame; observe that render rather
    // than racing the next frame immediately after the script is attached.
    await page.waitForFunction(() => document.getElementById('lipidomic-assistant-root').hidden === true);

    assert.equal(await page.locator('#lipidomic-assistant-root').evaluate(el => el.hidden), true,
      'the companion stays hidden until authentication arrives');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-workspace-state', {
      detail:{stage:'data',legacyStep:1,tool:'',authenticated:false,substep:'data-choice',substepIndex:1,substepCount:10,canNext:false,canBack:false}
    })));
    await page.waitForFunction(() => document.getElementById('lipidomic-context-help').textContent === 'Help with Data');
    assert.equal(await page.locator('#lipidomic-context-help').textContent(), 'Help with Data');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-workspace-state', {
      detail:{stage:'data',legacyStep:1,tool:'',authenticated:true,substep:'data-choice',substepIndex:1,substepCount:10,canNext:false,canBack:false}
    })));
    await page.waitForFunction(() => document.getElementById('lipidomic-assistant-root').hidden === false);
    assert.equal(await page.locator('.companion-speech .speech-title').textContent(), 'Choose how to begin');
    assert.match(await page.locator('.companion-speech .speech-copy p').textContent(), /Choose a private checkpoint or start a new upload/);
    assert.equal(await page.locator('.companion-speech .guide-button').textContent(), 'Explain how');
    await page.locator('#lipidomic-assistant-root .assistant-launcher').click();
    await page.waitForFunction(() => document.getElementById('lipidomic-assistant-panel').hidden === false);
    const firstNudgeDismiss = page.locator('.assistant-workspace-nudge-dismiss');
    assert.equal(await firstNudgeDismiss.count(), 1, 'the first authenticated screen can show one optional nudge');
    const mobileGeometry = await page.evaluate(() => {
      const tip = document.querySelector('.assistant-workspace-nudge').getBoundingClientRect();
      const next = document.querySelector('.assistant-workspace-primary').getBoundingClientRect();
      const panel = document.getElementById('lipidomic-assistant-panel').getBoundingClientRect();
      return {tip:{top:tip.top,bottom:tip.bottom,left:tip.left,right:tip.right},next:{top:next.top,bottom:next.bottom,left:next.left,right:next.right},panel:{left:panel.left,right:panel.right}};
    });
    assert.ok(mobileGeometry.tip.bottom <= mobileGeometry.next.top,
      'the nudge is displayed before the primary next action, without overlap');
    assert.ok(mobileGeometry.tip.left >= mobileGeometry.panel.left && mobileGeometry.tip.right <= mobileGeometry.panel.right,
      'the mobile nudge stays within the companion panel instead of overlapping the bottom rail');
    await firstNudgeDismiss.click();
    assert.equal(await page.evaluate(() => localStorage.getItem('lipidomic-team-companion-nudge-dismissed:data:data-choice')), '1');
    await page.locator('.companion-speech .guide-button').click();
    assert.equal((await page.evaluate(() => shinyInputs.at(-1))).value.text, 'Explain this step');
    assert.equal(await page.evaluate(() => legacyTargetClicks), 0,
      'the floating bubble no longer targets the hidden legacy abundance-file control');
    assert.equal(await page.locator('.assistant-speech-chat').evaluate(el => el.hidden), true,
      'the bubble exposes one action without a duplicate chat button');
    await page.locator('#tw-screen-title').evaluate(el => { el.textContent = 'Check sample labels'; });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-workspace-state', {
      detail:{stage:'review',legacyStep:3,tool:'quality',authenticated:true,substep:'review-single',substepIndex:3,substepCount:4,canNext:true,canBack:true}
    })));
    await page.waitForFunction(() => document.querySelector('.companion-speech .speech-title').textContent === 'Check sample labels');
    assert.equal(await page.locator('#lipidomic-assistant-root').evaluate(el => el.hidden), false);
    await page.waitForFunction(() => /No analysis loaded/.test(document.querySelector('.assistant-context-note').textContent));
    assert.match(await page.locator('.assistant-context-note').textContent(), /No analysis loaded/);
    assert.equal(await page.locator('.assistant-workspace-nav').count(), 0,
      'the companion keeps a single contextual action instead of duplicating stage navigation');
    assert.match(await page.locator('.assistant-context-note').textContent(), /No analysis loaded/);
    assert.equal(await page.locator('#lipidomic-context-help').textContent(), 'Help with Review');
    assert.equal(await page.locator('#lipidomic-tour').textContent(), 'Workspace guide');
    assert.equal(await page.locator('.assistant-chat-input').count(), 1,
      'the companion question input remains available alongside one contextual action');
    assert.equal(await page.locator('.speech-eyebrow').textContent(), 'YOUR WORKSPACE · REVIEW · 1 OF 1');
    assert.equal(await page.locator('.speech-title').textContent(), 'Check sample labels');
    // Reproduce the delayed legacy context helper replacing a rendered Team tip.
    await page.evaluate(() => {
      document.querySelector('.speech-eyebrow').firstChild.data = 'YOU ARE HERE · 2 / 7';
      document.querySelector('.speech-title').textContent = 'Design';
      document.querySelector('.companion-speech .speech-copy p').textContent = 'Legacy design guidance';
      window.dispatchEvent(new CustomEvent('team-workspace-state', {detail:{stage:'review',legacyStep:3,substep:'review-samples',authenticated:true}}));
    });
    await page.waitForFunction(() => document.querySelector('.speech-eyebrow').textContent === 'YOUR WORKSPACE · REVIEW · 1 OF 1');
    assert.equal(await page.locator('.speech-title').textContent(), 'Check sample labels');
    assert.doesNotMatch(await page.locator('.companion-speech').textContent(), /2 \/ 7|Legacy design guidance/);

    assert.equal(await page.locator('.companion-speech .guide-button').textContent(), 'Open Data');
    assert.equal(await page.locator('.lipid-help-panel .help-eyebrow').textContent(), 'WORKSPACE GUIDE');
    assert.equal(await page.locator('.lipid-help-panel #lipidomic-help-title').textContent(), 'Review');
    assert.equal(await page.locator('.help-step-progress').evaluate(el => el.hidden), true);
    assert.deepEqual(await page.locator('.help-tour-nav button').allTextContents(), ['Data','Review','Canvas','Close guide']);
    assert.equal(await page.locator('.assistant-workspace-nudge').count(), 0,
      'cooldown prevents the next review screen from repeating a dismissed nudge');

    await page.evaluate(() => messageHandlers.team_companion_workspace_state({loaded:true,ready:true,dirty:false}));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-workspace-state', {detail:{stage:'review',legacyStep:3,substep:'review-single',authenticated:true,canNext:false,preparationPending:true,preparationRunning:false}})));
    await page.waitForFunction(() => document.querySelector('.assistant-context-note').textContent.endsWith('Updating…'));
    assert.doesNotMatch(await page.locator('.assistant-context-note').textContent(), /Prepare your data|Apply your changes/);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-workspace-state', {detail:{stage:'review',legacyStep:3,substep:'review-single',authenticated:true,canNext:true,preparationPending:false,preparationRunning:false}})));
    await page.waitForFunction(() => /PCA plot update automatically/.test(document.querySelector('.assistant-context-note').textContent));
    await page.waitForFunction(() => document.querySelector('.companion-speech .guide-button')?.textContent === 'Continue to Canvas');
    await page.locator('.companion-speech .guide-button').click();
    assert.equal(await page.evaluate(() => nextCalls), 1,
      'the floating bubble advances only after the workspace reports that the data is ready');
    assert.equal(await page.locator('.assistant-context-actions .assistant-workspace-primary').count(), 1);
    assert.equal(await page.locator('.assistant-context-actions .assistant-workspace-primary').textContent(), 'Continue to Canvas');
    await page.locator('.assistant-workspace-primary').click();
    assert.equal(await page.evaluate(() => nextCalls), 2,
      'the primary companion action advances exactly one workspace substep');

    const reviewSuggestion = page.locator('.assistant-actions button').first();
    assert.equal(await reviewSuggestion.textContent(), 'Open Review');
    await reviewSuggestion.click();
    assert.deepEqual(await page.evaluate(() => workspaceCalls), ['review']);
    assert.equal(await page.locator('#scientific-proposal').textContent(), 'Propose setting',
      'non-navigation scientific actions are left intact');

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-workspace-state', {
      detail:{stage:'canvas',legacyStep:5,tool:'',authenticated:true,substep:'canvas',substepIndex:10,substepCount:10,canNext:false,canBack:true}
    })));
    await page.waitForFunction(() => document.querySelector('.assistant-workspace-primary')?.textContent === 'Add PCA to Canvas');
    assert.equal(await page.locator('.assistant-workspace-nudge').count(), 0,
      'the cooldown prevents a rapid follow-up nudge on the next screen');
    await page.locator('.assistant-context-actions').getByRole('button', {name:'Add PCA to Canvas'}).click();
    assert.deepEqual(await page.evaluate(() => canvasCalls), ['plot-one'],
      'adding a suggested plot requires an explicit user click');

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-canvas-selection', {
      detail:{id:'plot-one',title:'PCA'}
    })));
    await page.waitForFunction(() => /selected plot is live/.test(document.querySelector('.assistant-context-note').textContent));
    assert.match(await page.locator('.assistant-context-note').textContent(), /selected plot is live/);
    assert.equal(await page.locator('.assistant-context-actions .assistant-workspace-primary').textContent(), 'Ask about selected plot');
    await page.evaluate(() => {
      const node = document.createElement('article');
      node.className = 'tc-node tc-finished';
      node.dataset.plotId = 'plot-one';
      document.body.appendChild(node);
    });
    await page.waitForFunction(() => /archived snapshot of the prepared result at Finish/.test(document.querySelector('.assistant-context-note').textContent));
    assert.match(await page.locator('.assistant-context-note').textContent(), /may differ from current live data/);
    assert.match(await page.locator('.assistant-context-note').textContent(), /choose Edit to regenerate the current plot/);
    assert.match(await page.locator('.assistant-context-note').textContent(), /Export this figure here/);
    await page.locator('.tc-node').evaluate(el => el.classList.add('tc-stale'));
    await page.waitForFunction(() => /predates an analysis change/.test(document.querySelector('.assistant-context-note').textContent));
    assert.match(await page.locator('.assistant-context-note').textContent(), /not the current result/);
    assert.match(await page.locator('.assistant-context-note').textContent(), /choose Edit to regenerate the current plot/);
    await page.locator('.tc-node').evaluate(el => el.remove());
    await page.locator('.assistant-context-actions').getByRole('button', {name:'Ask about selected plot'}).click();
    const request = await page.evaluate(() => shinyInputs.at(-1));
    assert.equal(request.name, 'assistant_request');
    assert.match(request.value.text, /Explain how to read the PCA plot/);
    assert.match(request.value.text, /do not infer findings/);
    assert.equal(request.value.step, 5);
    assert.equal(typeof request.value.nonce, 'number');

    await page.locator('#confirm-change').click();
    assert.equal(await page.evaluate(() => confirmCalls), 1,
      'the adapter leaves the existing scientific confirmation controls functional');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-workspace-state', {
      detail:{stage:'review',legacyStep:3,tool:'quality',authenticated:true,substep:'review-single',substepIndex:1,substepCount:1,canNext:false,canBack:true}
    })));
    await page.waitForFunction(() => document.querySelector('.companion-speech .guide-button')?.textContent === 'Explain how');
    await page.locator('.companion-speech .guide-button').click();
    assert.equal((await page.evaluate(() => shinyInputs.at(-1))).value.text, 'Explain this step');
    assert.equal(await page.evaluate(() => nextCalls), 2,
      'the floating bubble explains a review screen while preparation is incomplete');
    await page.waitForFunction(() => document.querySelector('.assistant-workspace-primary')?.textContent === 'Explain this step');
    await page.locator('.assistant-workspace-primary').click();
    assert.equal((await page.evaluate(() => shinyInputs.at(-1))).value.text, 'Explain this step',
      'an unprepared review screen explains itself without bypassing the workspace gate');
    assert.equal(await page.evaluate(() => nextCalls), 2,
      'an unprepared review screen does not call next');
    await page.setViewportSize({width:1200,height:900});
    await page.evaluate(() => {
      const steps = document.querySelector('.tw-steps') || document.createElement('div');
      steps.className = 'tw-steps';
      let shell = document.getElementById('team-workspace');
      if (!shell) { shell = document.createElement('div'); shell.id = 'team-workspace'; document.body.appendChild(shell); }
      shell.appendChild(steps);
      steps.style.cssText = 'position:fixed;left:0;top:90px;width:390px;height:60px';
      document.getElementById('lipidomic-companion').style.cssText = 'position:fixed;left:260px;top:95px;width:100px;height:100px';
    });
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(() => document.getElementById('lipidomic-companion').getBoundingClientRect().top > 150);
    const safeDock = await page.locator('#lipidomic-companion').boundingBox();
    assert.ok(safeDock.x + safeDock.width <= 378 && safeDock.y + safeDock.height <= 832, 'mobile docking clears navigation and viewport insets');
    await page.locator('#lipidomic-assistant-panel').evaluate(el => { el.hidden = true; });
    await page.locator('.companion-launcher').click();
    assert.equal(await page.locator('#lipidomic-assistant-panel').evaluate(el => el.hidden), false, 'chat still opens from the dock');
    await page.locator('#lipidomic-companion').evaluate(el => { el.style.left = '40px'; el.style.top = '300px'; });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(50);
    assert.equal((await page.locator('#lipidomic-companion').boundingBox()).x, 40, 'safe user positioning survives resize');
    console.log('PASS: companion gives one microstep action, adapts suggestions, respects gates, and emits valid requests');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
