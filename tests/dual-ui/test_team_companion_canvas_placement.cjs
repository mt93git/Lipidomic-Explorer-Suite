// Run with node tests/dual-ui/test_team_companion_canvas_placement.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1000,height:700}});
    await page.setContent(`<body class="team-workspace-app"><div id="guide-context"></div><main id="team-canvas-root" style="position:fixed;inset:0"><div class="tc-catalog" style="position:absolute;left:0;top:0;width:180px;height:700px"></div><div class="tc-selection-inspector" hidden style="position:absolute;right:0;top:0;width:250px;height:500px"></div><div class="tc-navigation" style="position:absolute;right:0;bottom:0;width:220px;height:150px"></div><button id="open-inspector" style="position:absolute;left:500px;top:10px">Open</button></main></body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/context_help.css')});
    await page.evaluate(() => {window.$=()=>({on:()=>{}});window.LipidomicHelpContent={controls:{},topics:{}};window.LipidomicCompanionArt=()=>'<svg></svg>';});
    await page.addScriptTag({path:path.resolve('www/team/js/context_help.js')});
    await page.evaluate(()=>window.LipidomicHelp.setContext({step:5,tool:''}));
    await page.waitForSelector('.companion-dock');
    await page.evaluate(()=>{document.querySelector('#open-inspector').onclick=()=>{document.querySelector('.tc-selection-inspector').hidden=false;};});
    const grip=page.locator('.companion-grip'); await grip.focus();
    for(let i=0;i<10;i++) await grip.press('Shift+ArrowRight');
    await page.locator('#open-inspector').click(); await page.waitForTimeout(100);
    const overlap=await page.evaluate(()=>{let r=document.querySelector('.companion-dock').getBoundingClientRect();return [...document.querySelectorAll('.tc-catalog,.tc-selection-inspector,.tc-navigation')].some(n=>{let q=n.getBoundingClientRect();return r.left<q.right&&r.right>q.left&&r.top<q.bottom&&r.bottom>q.top;});});
    assert.equal(overlap,false,'full companion stays clear of canvas controls when inspector opens');
    await page.setViewportSize({width:390,height:600});
    await page.evaluate(()=>{
      Object.assign(document.querySelector('.tc-catalog').style,{width:'160px',height:'600px'});
      Object.assign(document.querySelector('.tc-selection-inspector').style,{width:'160px',height:'600px'});
      Object.assign(document.querySelector('.tc-navigation').style,{width:'70px',height:'510px',right:'160px',bottom:'0'});
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    const narrow=await page.evaluate(()=>({mini:document.querySelector('.companion-dock').classList.contains('is-mini'),visible:getComputedStyle(document.querySelector('.companion-dock')).visibility}));
    assert.equal(narrow.mini,true,'narrow gap uses compact companion');
    assert.equal(narrow.visible,'visible','compact companion fits the remaining gap');
    await page.evaluate(()=>{document.querySelector('.tc-navigation').style.height='600px'; window.dispatchEvent(new Event('resize'));});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.companion-dock').evaluate(n=>getComputedStyle(n).visibility),'hidden','fully occupied viewport never covers controls');
    assert.equal(await page.locator('.team-companion-fallback').isVisible(),true,'chat remains available in the help bar');
    await page.evaluate(()=>{ window.LipidomicAssistant={open:()=>{window.fallbackOpened=true;}}; });
    await page.locator('.team-companion-fallback').focus();
    assert.equal(await page.locator('.team-companion-fallback').evaluate(n=>document.activeElement===n),true,'fallback is keyboard reachable');
    await page.locator('.team-companion-fallback').press('Enter');
    assert.equal(await page.evaluate(()=>window.fallbackOpened),true,'fallback opens the assistant');
    await page.evaluate(()=>{document.querySelector('.tc-navigation').style.height='510px'; window.dispatchEvent(new Event('resize'));});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.companion-dock').evaluate(n=>getComputedStyle(n).visibility),'visible','companion returns when space opens');
    assert.equal(await page.locator('.team-companion-fallback').isVisible(),false,'fallback disappears when the cell returns');
    console.log('PASS: Team companion clears library, inspector and minimap after keyboard movement');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
