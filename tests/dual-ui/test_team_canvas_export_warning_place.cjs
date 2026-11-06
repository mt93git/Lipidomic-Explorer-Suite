// Hotfix 36: the "N figures are not up to date" Export warning (card_status.js) lives inside the closed
// Export figure dropdown, never on its wrapper in the toolbar, where it flashed as an amber box while
// any card was redrawing. Mock page: shell.js's menu markup, a stubbed TeamCanvas.cardStatus.
// Run with: node tests/dual-ui/test_team_canvas_export_warning_place.cjs
const assert=require('node:assert/strict');
const {chromium}=require('../browser/ci/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.setContent(`<body class="ts-shell-app"><section id="team-canvas-root" class="ts-shell"><div class="tc-main"><div class="tc-toolbar"><div class="ts-tools"><div class="ts-menu-wrap ts-export"><button class="ts-tool ts-menu-trigger">Export figure</button><div class="ts-menu" role="group" data-open="false"><button class="ts-menu-item">PDF</button></div></div></div></div><div class="tc-scroll"><div class="tc-board"><div class="tc-node" data-plot-id="p1"><div class="tc-node-head"><strong>Violin</strong></div></div></div></div><p class="tc-status"></p></div></section></body>`);
    for(const name of ['shell','card_status'])await p.addStyleTag({path:'www/team/css/'+name+'.css'});
    await p.evaluate(()=>{window.__state='updating';window.TeamCanvas={cardStatus:()=>window.__state};});
    await p.addScriptTag({path:'www/team/js/card_status.js'});
    await p.waitForTimeout(300);
    const r=await p.evaluate(()=>{const w=document.querySelector('.ts-export-warning');return {text:w&&w.textContent,inMenu:!!(w&&w.parentElement.classList.contains('ts-menu')),shown:!!(w&&w.getClientRects().length)};});
    assert.match(r.text,/1 figure is not up to date/);assert.equal(r.inMenu,true,'warning is inside the Export dropdown');assert.equal(r.shown,false,'nothing shows in the toolbar while the menu is closed');
    await p.evaluate(()=>{document.querySelector('.ts-export .ts-menu').dataset.open='true';});
    assert.equal(await p.evaluate(()=>document.querySelector('.ts-export-warning').getClientRects().length>0),true,'shown when Export figure is open');
    assert.deepEqual(errors,[]);
    console.log('PASS Export warning sits inside the Export figure dropdown, never as a toolbar box');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
