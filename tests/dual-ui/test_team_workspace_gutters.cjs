const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('../browser/ci/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}.bslib-sidebar-layout{display:grid;grid-template-columns:260px minmax(0,1fr)}.bslib-sidebar-layout.sidebar-collapsed{grid-template-columns:0 minmax(0,1fr)}.bslib-sidebar-layout.sidebar-transitioning{grid-template-columns:130px minmax(0,1fr)}.bslib-sidebar-layout>.main{padding:24px 48px 24px 8px}.bslib-page-main{width:100%}.test-content{height:90px;background:#e9f5f3}.nested .main{padding:7px 31px 7px 9px}</style>
  <body class="team-workspace-app" data-team-authenticated="true" data-guide-analysis="false"><div class="bslib-sidebar-layout" id="outer"><aside id="main_sidebar"></aside><div class="main"><div class="bslib-page-main"><section id="team-workspace"><div class="tw-top">Team workspace</div><nav class="tw-steps"><button><span>1</span><strong>Data</strong><small>Upload</small></button></nav><div class="tw-journey"><div class="tw-journey-copy"><h2>Choose your data</h2></div><div class="tw-journey-actions"><button>Next</button></div></div></section><section class="guide-page test-content">Review</section><section id="team-canvas-root" class="test-content">Canvas</section><div class="bslib-sidebar-layout nested"><aside></aside><div class="main">Nested analysis controls</div></div></div></div></div></body>`);
  await page.addStyleTag({path:path.resolve('www/team/css/workspace.css')});
  await page.addStyleTag({path:path.resolve('www/team/css/workspace_minimal.css')});
  for(const width of [390,1280,1600]) {
   await page.setViewportSize({width,height:900});
   for(const state of ['sidebar-expanded','sidebar-collapsed','sidebar-transitioning']) {
    await page.locator('#outer').evaluate((el,state)=>el.className='bslib-sidebar-layout '+state,state);
    for(const [screen,step] of [['data-choice','1'],['review-labels','2'],['canvas','5']]) {
     await page.locator('body').evaluate((el,v)=>{el.dataset.twScreen=v[0];el.dataset.guideStep=v[1]},[screen,step]);
     const result=await page.evaluate(()=>{
      const main=document.querySelector('#outer > .main'), box=main.getBoundingClientRect(),style=getComputedStyle(main),shell=document.querySelector('#team-workspace').getBoundingClientRect();
      return {left:style.paddingLeft,right:style.paddingRight,center:(shell.left+shell.right)/2,outerCenter:(box.left+box.right)/2,overflow:document.documentElement.scrollWidth>innerWidth,nested:getComputedStyle(document.querySelector('.nested .main')).paddingRight};
     });
     assert.equal(result.left,'16px');assert.equal(result.right,'16px');
     assert.ok(Math.abs(result.center-result.outerCenter)<1,`${width} ${state} ${screen} is centered`);
     assert.equal(result.overflow,false);assert.equal(result.nested,'31px');
    }
   }
  }
  const polish=await page.evaluate(()=>{
   const journey=getComputedStyle(document.querySelector('.tw-journey')),circle=getComputedStyle(document.querySelector('.tw-steps button span'));
   return {left:journey.paddingLeft,right:journey.paddingRight,min:journey.minHeight,row:circle.gridRowStart};
  });
  assert.deepEqual(polish,{left:'0px',right:'0px',min:'0px',row:'auto'});
  await page.setViewportSize({width:1600,height:900});
  await page.screenshot({path:'/tmp/team-workspace-balanced-gutters.png',fullPage:true});
  await page.locator('.bslib-page-main').evaluate(el=>el.insertAdjacentHTML('beforeend',`<div class="guide-page"><div class="guide-columns"><div>Short</div><div>Tall<br>Tall</div></div></div><button id="data_hub-runAnalysis" style="background:rgb(255,0,0)">Prepare</button><div class="shiny-input-container"><input id="qc_pca_tab-minDetectionPct"><span class="irs-with-grid"><span class="irs-min">0</span><span class="irs-max">100</span><span class="irs-grid">0 100</span></span></div>`));
  assert.equal(await page.locator('.guide-columns').evaluate(el=>getComputedStyle(el).alignItems),'start');
  assert.equal(await page.locator('.irs-max').isVisible(),false);
  assert.equal(await page.locator('.irs-grid').isVisible(),true);
  await page.locator('body').evaluate(el=>el.dataset.guidePreparationStage='prepared');
  assert.equal(await page.locator('#data_hub-runAnalysis').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('body').evaluate(el=>el.dataset.guidePreparationStage='update_pending');
  assert.equal(await page.locator('#data_hub-runAnalysis').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 0, 0)');
  await page.locator('body').evaluate(el=>el.classList.remove('team-workspace-app'));
  assert.equal(await page.locator('#outer > .main').evaluate(el=>getComputedStyle(el).paddingRight),'48px');
  console.log('PASS: actual bslib wrapper has symmetric gutters across Data/Review/Canvas, three sidebar states and 390/1280/1600 widths; nested tool sidebar unchanged');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
