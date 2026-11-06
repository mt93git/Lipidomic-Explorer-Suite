// Run with: node tests/dual-ui/test_team_canvas_tip_passthrough.cjs
// The companion tip (section.cg-tip, companion_guidance.js) over a card's ⋯: a real pointer moving onto ⋯
// and clicking opens the card menu (Chromium + WebKit), and a menu item under the tip is clickable too.
// The same page without card_tip_passthrough.css reproduces the bug (the click lands on the tip). A pixel
// compare shows the mascot and tip render identically before and after the fix CSS is added to the same page. Real Team canvas, card frame, companion and guidance scripts with the workspace CSS cascade.
'use strict';
const assert=require('node:assert/strict');
const pw=require('../browser/ci/node_modules/playwright');
const F=require('./fixture_team_overlay_pages.cjs');
const FIX='www/team/css/card_tip_passthrough.css';
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
const ids=['mock_tip_1','mock_tip_2'];
const BODY=`<body class="ts-shell-app team-workspace-app" data-tw-screen="canvas" data-team-stage="canvas" data-guide-step="5" data-team-authenticated="true" style="margin:0">
<nav class="navbar"><span class="guide-app-name">Lipidomic Explorer</span></nav><div id="guide-context"></div>
<section id="team-canvas-root" class="ts-shell"><div class="tc-layout tc-library-hidden"><aside class="tc-catalog"><input class="tc-search"><div class="tc-list"></div></aside><div class="tc-main"><div class="tc-toolbar"><button class="tc-library-toggle">Library</button><button class="tc-reset">Return all</button><button class="tc-arrange">Arrange</button></div><div class="tc-scroll"><div class="tc-board"><div class="tc-empty"></div></div></div><p class="tc-status"></p></div><aside class="ts-inspector-column"></aside></div></section>
${ids.map(id=>`<div class="rd-card"><h3>${id}</h3><div id="${id}" class="plotly html-widget-output js-plotly-plot" style="height:400px"></div></div>`).join('')}
<script>window.sent=[];window.$=window.jQuery=function(){return {on:function(){return this;},one:function(){return this;},off:function(){return this;},trigger:function(){return this;}};};window.jQuery.fn={};
window.Shiny={setInputValue:function(id,value){window.sent.push([id,value]);},addCustomMessageHandler:function(){},notifications:{remove:function(){}}};</script></body>`;

async function setup(browser,fixed){
  const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route(F.ORIGIN+'**',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta charset="utf-8"></head>'+BODY+'</html>'}));
  await p.goto(F.ORIGIN+'canvas');
  const css=F.assets('workspace','css');
  assert(css.includes(FIX),'the fix is wired in R/frontends/team');
  for(const f of css)if(f!==FIX)await p.addStyleTag({path:f});
  await p.evaluate(()=>{sessionStorage.clear();localStorage.clear();sessionStorage.setItem('lipidomic-companion','neutrophil');window.LIPIDOMIC_TEAM_WORKSPACE=true;
    document.querySelectorAll('.js-plotly-plot').forEach(g=>{g.data=[{type:'scatter',x:[1,2],y:[3,4]}];g.layout={width:600,height:400,autosize:false};g._fullLayout={width:600,height:400};});
    window.Plotly={Plots:{resize:g=>Promise.resolve(g)},relayout:(g,u)=>{Object.assign(g.layout,u);Object.assign(g._fullLayout,u);return Promise.resolve(g);},restyle:()=>Promise.resolve(),
      toImage:async(g,o)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}"></svg>`)};});
  // The workspace's own scripts in wiring order; canvas.js (and its exporter) right after the viewport, as in ui.R.
  const js=F.assets('workspace','js');
  for(const f of js){await p.addScriptTag({path:f});if(f.endsWith('/canvas_viewport.js'))for(const n of ['plot_exports','canvas'])await p.addScriptTag({path:`www/team/js/${n}.js`});}
  if(errors.length)throw Error(errors.join("\n"));
  await p.evaluate(ids=>ids.forEach(id=>{if(!TeamCanvas.addPlot(id))throw Error('Could not mount '+id);}),ids);
  // workspace.js reports the Canvas stage in the app; the guidance then shows its first Canvas tip.
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('team-workspace-state',{detail:{stage:'canvas',authenticated:true,legacyStep:5}})));
  await p.waitForSelector('body > .cg-tip:not(.is-collapsed) .cg-text',{timeout:5000});
  if(fixed)await p.addStyleTag({path:FIX});
  await F.settle(p);
  return {p,errors};
}
// Move the first card (as a header drag would) so its ⋯ sits under the tip's text (geometrically: with the fix the tip is not hit), then wait for the camera gesture to end.
async function coverMore(p){
  for(let i=0;i<4;i++){
    await p.evaluate(()=>{const t=document.querySelector('.cg-tip .cg-text').getBoundingClientRect(),m=document.querySelector('.tc-board > .tc-node .tc-card-more').getBoundingClientRect(),s=document.querySelector('.tc-scroll');
      const n=document.querySelector('.tc-board > .tc-node');n.style.left=Math.max(0,n.offsetLeft+(t.left+t.width/2)-(m.left+m.width/2))+'px';n.style.top=Math.max(0,n.offsetTop+(t.top+t.height/2)-(m.top+m.height/2))+'px';s.dispatchEvent(new Event('scroll'));});
    await p.waitForFunction(()=>!document.getElementById('team-canvas-root').classList.contains('tc-gesturing'),null,{timeout:3000});await frames(p);
  }
  const more=await p.evaluate(()=>{const b=document.querySelector('.tc-board > .tc-node .tc-card-more'),r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
    const t=document.querySelector('.cg-tip .cg-text').getBoundingClientRect();
    return {x,y,under:x>=t.left&&x<=t.right&&y>=t.top&&y<=t.bottom,hit:hit&&(hit.className||hit.tagName)};});
  assert(more.under,'precondition: the tip covers ⋯ '+JSON.stringify(more));
  return more;
}
const shot=async p=>p.screenshot({animations:'disabled',caret:'hide',clip:await p.evaluate(()=>{
  const a=document.querySelector('body > .cg-tip').getBoundingClientRect(),b=document.getElementById('lipidomic-companion').getBoundingClientRect();
  const x=Math.floor(Math.min(a.left,b.left))-4,y=Math.floor(Math.min(a.top,b.top))-4;return {x,y,width:Math.ceil(Math.max(a.right,b.right))+4-x,height:Math.ceil(Math.max(a.bottom,b.bottom))+4-y};})});

async function run(type){
  let browser;try{browser=await pw[type].launch({headless:true});}catch(e){if(type==='chromium')throw e;console.log('SKIP '+type+': not installed');return;}
  try{
    // 1. Pixel compare in one page: mascot + tip before and after the fix CSS is added (pointer on the tip text, then on the board).
    {const {p,errors}=await setup(browser,false);
      assert(await p.evaluate(()=>!!document.querySelector('#lipidomic-companion')&&getComputedStyle(document.getElementById('lipidomic-companion')).visibility!=='hidden'),`${type}: the mascot is shown`);
      const t=await p.locator('.cg-tip .cg-text').boundingBox(),spots=[[t.x+4,t.y+4],[700,860]],pics={before:[],after:[]};
      for(const k of ['before','after']){
        if(k==='after'){await p.addStyleTag({path:FIX});await frames(p);}
        for(const [x,y] of spots){await p.mouse.move(x,y,{steps:4});await frames(p);pics[k].push(await shot(p));}
      }
      assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('body > .cg-tip')).pointerEvents),'none',`${type}: the fix CSS applied`);
      for(const i of [0,1])assert(pics.before[i].equals(pics.after[i]),`${type}: mascot/tip pixels identical before and after the fix (pointer ${i?'on the board':'on the tip'})`);
      assert.deepEqual(errors,[],`${type}: no page errors`);await p.close();
      console.log(`PASS ${type}: mascot + tip render pixel-identical before and after the fix CSS in the same page (${pics.after[0].length} / ${pics.after[1].length} byte PNGs)`);}

    // 2. Without the fix: the click on ⋯ under the tip lands on the tip (the reported bug).
    {const {p}=await setup(browser,false);const more=await coverMore(p);const c=await p.locator('.tc-board > .tc-node').first().boundingBox();
      await p.mouse.move(c.x+c.width/2,c.y+c.height/2);await p.mouse.move(more.x,more.y,{steps:6});
      const target=await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e&&e.closest('.cg-tip')?'tip':'other';},[more.x,more.y]);
      await p.mouse.click(more.x,more.y);await frames(p);
      const open=await p.evaluate(()=>document.querySelector('.tc-board > .tc-node .tc-card-more').getAttribute('aria-expanded'));
      assert(target==='tip'&&open!=='true',`${type} baseline reproduces the bug ${JSON.stringify({target,open})}`);await p.close();}

    // 3. With the fix: the same real pointer opens the menu, and a menu item under the tip is clickable.
    {const {p,errors}=await setup(browser,true);const more=await coverMore(p);const c=await p.locator('.tc-board > .tc-node').first().boundingBox();
      await p.mouse.move(c.x+c.width/2,c.y+c.height/2);await p.mouse.move(more.x,more.y,{steps:6});
      assert(await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return !!e&&!!e.closest('.tc-card-more');},[more.x,more.y]),`${type}: ⋯ is hit through the tip`);
      assert(await p.evaluate(()=>getComputedStyle(document.querySelector('body > .cg-tip')).opacity==='1'&&!document.querySelector('body > .cg-tip').hidden),`${type}: the tip still shows`);
      await p.mouse.click(more.x,more.y);await frames(p);
      assert.equal(await p.evaluate(()=>document.querySelector('.tc-board > .tc-node .tc-card-more').getAttribute('aria-expanded')),'true',`${type}: ⋯ under the tip opens the menu`);
      // Selecting the card can glide the camera to it (click-to-focus); the toolbar is hidden until that ends.
      await p.waitForFunction(()=>!document.getElementById('team-canvas-root').classList.contains('tc-gesturing'),null,{timeout:3000});await frames(p);
      // Remove/Return in the open menu: the click reaches it (the tip lets clicks through while a menu is open).
      const item=await p.evaluate(()=>{const tip=document.querySelector('body > .cg-tip').getBoundingClientRect();
        const bs=[...document.querySelectorAll('.tc-board > .tc-node .tc-card-menu > button')].filter(b=>b.getClientRects().length&&/^(Remove|Return)$/.test(b.textContent.trim()));
        const b=bs[0],r=b.getBoundingClientRect();b.dataset.tipTest='1';const x=r.left+r.width/2,y=r.top+r.height/2;
        return {x,y,underTip:x>=tip.left&&x<=tip.right&&y>=tip.top&&y<=tip.bottom};});
      await p.mouse.move(item.x,item.y,{steps:4});
      // Wherever the tip now sits (selection swaps it for the card's tip), its surface takes no clicks (its own buttons, e.g. the pill, still do).
      assert.equal(await p.evaluate(()=>[...document.querySelectorAll('body > .cg-tip, body > .cg-tip .cg-body, body > .cg-tip .cg-text')].map(e=>getComputedStyle(e).pointerEvents).join()),'none,none,none',`${type}: the tip lets clicks through while the menu is open`);
      const hit=await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return !!e&&!!e.closest('[data-tip-test]');},[item.x,item.y]);
      assert(hit,`${type}: Remove is under the pointer (tip lets it through: ${item.underTip})`);
      await p.mouse.click(item.x,item.y);await p.waitForTimeout(700);
      assert.equal(await p.evaluate(()=>document.querySelectorAll('.tc-board > .tc-node').length),1,`${type}: Remove took the card off the canvas`);
      // The tip's own controls still take clicks: Collapse collapses it.
      const ic=await p.locator('body > .cg-tip .cg-icon[aria-label="Collapse tip"]').boundingBox();
      assert(await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return !!e&&!!e.closest('.cg-icon');},[ic.x+ic.width/2,ic.y+ic.height/2]),`${type}: the tip's buttons are hit`);
      await p.mouse.click(ic.x+ic.width/2,ic.y+ic.height/2);await frames(p);
      assert(await p.evaluate(()=>document.querySelector('body > .cg-tip').classList.contains('is-collapsed')),`${type}: the tip's Collapse button works`);
      assert.deepEqual(errors,[],`${type}: no page errors`);
      console.log(`PASS ${type}: real pointer click on ⋯ under the companion tip opens the card menu; the tip lets clicks through, Remove removes the card and the tip's own buttons still work; without the fix the click lands on the tip`);
      await p.close();}
  }finally{await browser.close();}
}
(async()=>{for(const t of ['chromium','webkit'])await run(t);})().catch(e=>{console.error(e);process.exitCode=1;});
