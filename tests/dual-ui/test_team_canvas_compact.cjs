const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1512,height:806}});
  await page.setContent(`<body class="team-workspace-app" data-tw-screen="canvas" data-team-authenticated="true" data-guide-step="5" data-guide-analysis="false" data-team-stage="canvas"><nav class="navbar">Libreros</nav><main class="main"><section id="team-workspace"><div class="tw-top"><button class="tw-signout">Sign out</button></div><div class="tw-steps"><button>Data</button><button>Review</button><button>Canvas</button></div><div class="tw-canvas-tabs"><button class="guide-button">Save & export</button><details><summary>Tools</summary></details></div></section><div id="guide-context">Prepared analysis</div><section id="team-canvas-root" class="tc-workspace"><div class="tc-intro"><div><h2>Your figure canvas</h2><p>Add a plot. Make it yours. Finish when ready.</p></div><button class="tc-palette">Colors & palettes</button></div><div class="tc-mode-tabs"><button role="tab">Workspace</button><button role="tab">Print preview</button></div><div id="tc-workspace-panel"><div class="tc-layout"><aside class="tc-catalog">Plot library</aside><div class="tc-main"><div class="tc-toolbar"><button class="tc-library-toggle">Hide library</button><button class="tc-arrange">Arrange</button><button class="tc-reset">Return all plots</button></div><div class="tc-scroll"><div class="tc-board">Board</div></div></div></div></div><section id="tc-preview-panel" hidden></section></section></main></body>`);
  for (const file of ['libreros','workspace','canvas','canvas_preview','workspace_minimal']) await page.addStyleTag({content:fs.readFileSync(`www/team/css/${file}.css`,'utf8').replace(/^@import.*$/mg,'')});
  const box = selector => page.locator(selector).boundingBox();
  const intro = await box('.tc-intro'), tabs = await box('.tc-mode-tabs'), board = await box('.tc-scroll');
  assert.ok(tabs.y < intro.y + intro.height && tabs.y + tabs.height > intro.y, 'intro and tabs share one row');
  assert.ok(board.y <= 300, `board starts within 300px: ${board.y}`);
  for (const selector of ['.tw-signout','.tw-canvas-tabs','.tc-palette','.tc-mode-tabs','.tc-toolbar']) assert.equal(await page.locator(selector).isVisible(),true,selector);
  assert.equal(await page.locator('.tc-scroll').evaluate(el=>getComputedStyle(el).overflowY),'auto');
  await page.setViewportSize({width:390,height:844});
  const mobileTabs = await box('.tc-mode-tabs'), mobileIntro = await box('.tc-intro');
  assert.ok(mobileTabs.y >= mobileIntro.y + mobileIntro.height, 'phone retains stacked controls');
  await page.evaluate(()=>{document.body.dataset.twScreen='review-design';});
  assert.equal(await page.locator('#team-canvas-root').evaluate(el=>getComputedStyle(el).display),'block', 'compact grid is Canvas-only');
  await page.setViewportSize({width:1512,height:806});
  for (const state of [{step:'6',analysis:'false'},{step:'7',analysis:'false'},{step:'5',analysis:'true'}]) {
   await page.evaluate(state=>{document.body.dataset.twScreen='canvas';document.body.dataset.guideStep=state.step;document.body.dataset.guideAnalysis=state.analysis;},state);
   assert.equal(await page.locator('#team-canvas-root').isVisible(),false, `Canvas is hidden on legacy step ${state.step}, advanced=${state.analysis}`);
  }
  console.log('PASS: desktop Canvas compact rows, board height, mobile stacking and screen scoping');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
