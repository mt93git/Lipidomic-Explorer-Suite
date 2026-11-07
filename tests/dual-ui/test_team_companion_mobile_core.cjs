const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('../browser/ci/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1512,height:806}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<body class="team-workspace-app" data-team-authenticated="true"><nav class="navbar" style="position:fixed;top:0;height:71px;width:100%">Libreros</nav><div id="team-workspace" style="position:fixed;top:80px;left:0;width:100%"><div class="tw-steps" style="height:51px">Data Review Canvas</div><button class="tw-signout" style="position:absolute;right:12px;top:0;height:40px">Sign out</button></div><div id="guide-context"></div><aside id="lipidomic-assistant-root"><button class="assistant-launcher">Chat</button><section id="lipidomic-assistant-panel" hidden><div class="assistant-context-actions"></div></section></aside><h2 id="tw-screen-title">Check sample labels</h2></body>`);
  await page.evaluate(()=>{
   window.$=()=>({on:()=>{}});
   window.LIPIDOMIC_TEAM_WORKSPACE=true;
   window.TeamWorkspace={state:()=>({stage:'review',legacyStep:2,substep:'review-labels',authenticated:true})};
   window.chatOpened=0;window.LipidomicAssistant={open:()=>{window.chatOpened++;}};
  });
  for(const css of ['context_help','companion_assistant'])await page.addStyleTag({path:path.resolve(`www/team/css/${css}.css`)});
  for(const script of ['help_content','companion_art','context_help','companion_workspace'])await page.addScriptTag({path:path.resolve(`www/team/js/${script}.js`)});
  await page.setViewportSize({width:390,height:844});
  const safe=async()=>{
   await page.waitForFunction(()=>{const r=document.getElementById('lipidomic-companion').getBoundingClientRect();return r.top>=143&&r.right<=378&&r.bottom<=832;});
   const r=await page.locator('#lipidomic-companion').boundingBox();assert.ok(r.y>=143);
  };
  await safe();
  // Trigger the core's child-list rAF positioning AFTER the adapter resize pass.
  await page.evaluate(()=>document.body.appendChild(document.createElement('p')));
  await page.waitForTimeout(100);
  await safe();
  // Core scroll avoidance reuses its old avoidanceBase; repair must still hold.
  await page.evaluate(()=>document.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(100);
  await safe();
  await page.locator('.companion-launcher').click();
  assert.equal(await page.evaluate(()=>window.chatOpened),1);
  // A real core drag records its intended placement and remains stable later.
  const grip=await page.locator('.companion-grip').boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
  await page.mouse.move(65,320,{steps:8});await page.mouse.up();
  const dragged=await page.locator('#lipidomic-companion').boundingBox();
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(100);
  const retained=await page.locator('#lipidomic-companion').boundingBox();
  assert.ok(Math.abs(dragged.x-retained.x)<2&&Math.abs(dragged.y-retained.y)<2,'core user drag is retained');
  assert.deepEqual(errors,[]);
  console.log('PASS: actual help core resize, delayed content render, scroll, drag and mobile chat');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
