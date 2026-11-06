const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1200,height:900}});
await page.setContent(`<section id="team-canvas-root"><div class="tc-layout"><aside class="tc-catalog"><div class="tc-list"></div><input class="tc-search"></aside><button class="tc-reset">Return all plots</button><button class="tc-arrange">Arrange</button><button class="tc-library-toggle">Hide library</button><div class="tc-main" style="width:850px"><div class="tc-scroll" style="width:100%;height:500px"><div class="tc-board"><div class="tc-empty"></div></div></div><div class="tc-status"></div></div></section><div class="rd-card"><h3>PCA</h3><div id="results_dashboard-plot_pca" class="shiny-plot-output"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3C/svg%3E"></div></div>`);
await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});await page.addStyleTag({path:path.resolve('www/team/css/canvas_viewport.css')});
await page.addScriptTag({path:path.resolve('www/team/js/canvas_viewport.js')});await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
await page.evaluate(()=>TeamCanvas.addPlot('results_dashboard-plot_pca'));
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
assert.equal(await page.locator('.tc-layout > .tc-library-edge-toggle').count(),1,'one edge handle stays outside catalog after refresh');
assert.equal(await page.locator('.tc-library-close').count(),0,'no duplicate close button');
await page.getByRole('button',{name:'Hide library',exact:true}).click();
assert.equal(await page.locator('.tc-layout.tc-library-hidden > .tc-library-edge-toggle').count(),1,'handle stays available when collapsed');
await page.getByRole('button',{name:'Show library',exact:true}).click();
assert.equal(await page.locator('.tc-layout > .tc-library-edge-toggle').count(),1);
const packed=await page.locator('.tc-node').evaluate(n=>({x:n.offsetLeft,y:n.offsetTop}));assert.deepEqual(packed,{x:30,y:30},'new plot keeps packed world coordinates');
const before=await page.evaluate(()=>TeamCanvas.serialize());
const zoomBefore=parseInt(await page.locator('.tc-zoom-reset').innerText(),10);
await page.getByRole('button',{name:'Zoom out',exact:true}).click();await page.waitForTimeout(50);
// A fresh plot is fitted to the visible viewport before navigation starts.
assert(Math.abs(parseInt(await page.locator('.tc-zoom-reset').innerText(),10)-zoomBefore/1.25)<=1,'zoom out scales the fitted viewport');
assert.deepEqual(await page.evaluate(()=>TeamCanvas.serialize()),before,'navigation must not change checkpoint');
const dragScale=await page.evaluate(()=>TeamCanvasViewport.scale);const head=page.locator('.tc-node-head');const b=await head.boundingBox();const initial=await page.locator('.tc-node').evaluate(n=>({x:n.offsetLeft,y:n.offsetTop}));
await page.mouse.move(b.x+60,b.y+15);await page.mouse.down();await page.mouse.move(b.x+140,b.y+55,{steps:5});await page.mouse.up();
const moved=await page.locator('.tc-node').evaluate(n=>({x:n.offsetLeft,y:n.offsetTop}));assert(Math.abs(moved.x-initial.x-80/dragScale)<5);assert(Math.abs(moved.y-initial.y-40/dragScale)<5);
for(let i=0;i<30;i++){if(await page.locator('.tc-zoom-out').isEnabled())await page.locator('.tc-zoom-out').click();}
assert.equal(await page.locator('.tc-zoom-reset').innerText(),'5%');assert.equal(await page.locator('.tc-zoom-out').isDisabled(),true);
await page.locator('.tc-zoom-reset').click();assert.equal(await page.locator('.tc-zoom-reset').innerText(),'100%');
await page.getByRole('button',{name:'Fit all',exact:true}).click();await page.waitForTimeout(50);
const fit=await page.evaluate(()=>{const s=document.querySelector('.tc-scroll'),b=document.querySelector('.tc-node').getBoundingClientRect();return {sw:s.clientWidth,sh:s.clientHeight,w:b.width,h:b.height};});assert(fit.w<=fit.sw&&fit.h<=fit.sh);assert(await page.evaluate(()=>TeamCanvasViewport.scale)>.3,'fit should use figure bounds instead of empty board');
await page.locator('.tc-zoom-reset').click();await page.waitForTimeout(50);const map=page.locator('.tc-map svg');
assert.equal(await page.locator('.tc-map').isVisible(),false,'no minimap at 100% when the figure fits');assert(await page.locator('.tc-zoom-reset').isVisible(),'zoom controls stay available');
await page.evaluate(()=>{const n=document.querySelector('.tc-node');n.style.width='1600px';n.style.height='1200px';});await page.waitForTimeout(50);
assert.equal(await page.locator('.tc-map').isVisible(),false,'no minimap at 100% even for a large figure');
await page.getByRole('button',{name:'Zoom out',exact:true}).click();await page.waitForTimeout(50);
assert.equal(await map.isVisible(),true,'minimap appears when zoomed out on a figure larger than the viewport');
// Zoomed out until the drawn figure fits the viewport: the minimap goes away; zooming back in brings it back.
const fits=()=>page.evaluate(()=>{const s=document.querySelector('.tc-scroll'),n=document.querySelector('.tc-node'),z=TeamCanvasViewport.scale;return (n.offsetLeft+n.offsetWidth)*z<=s.clientWidth&&(n.offsetTop+n.offsetHeight)*z<=s.clientHeight;});
let outs=0;while(!(await fits())&&outs<12){await page.getByRole('button',{name:'Zoom out',exact:true}).click();outs++;}await page.waitForTimeout(50);
assert(await fits()&&await page.evaluate(()=>TeamCanvasViewport.scale)<1,'zoomed out until the figure fits');
assert.equal(await page.locator('.tc-map').isVisible(),false,'no minimap once the zoomed-out figure fits the viewport');
for(let i=0;i<outs;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(50);
assert.equal(await map.isVisible(),true,'minimap returns when zooming back in makes the figure overflow');const mb=await map.boundingBox();await page.mouse.click(mb.x+mb.width-5,mb.y+mb.height-5);await page.waitForTimeout(50);
const pos=await page.locator('.tc-scroll').evaluate(s=>({x:s.scrollLeft,y:s.scrollTop}));assert(pos.x>0&&pos.y>0);
await map.press('ArrowLeft');assert(await page.locator('.tc-scroll').evaluate(s=>s.scrollLeft)<pos.x);
// Inside the canvas viewport shell (over the board, or in the band it reserves when no corner is free).
const rects=await page.evaluate(()=>{const a=document.querySelector('.tc-viewport-shell').getBoundingClientRect(),b=document.querySelector('.tc-navigation').getBoundingClientRect();return {inside:b.left>=a.left&&b.right<=a.right&&b.top>=a.top&&b.bottom<=a.bottom};});assert(rects.inside,'minimap floats inside the canvas viewport');
const stateBeforeExpand=await page.evaluate(()=>TeamCanvas.serialize());
await page.getByRole('button',{name:'Expand canvas'}).click();assert.equal(await page.locator('#team-canvas-root').evaluate(n=>n.classList.contains('tc-focus-mode')),true);
assert.equal(await page.getByRole('button',{name:'Exit expanded canvas'}).getAttribute('aria-pressed'),'true');
assert.equal(await page.evaluate(()=>TeamCanvas.serialize().libraryHidden),true);
await page.locator('.tc-library-toggle').click();assert.equal(await page.evaluate(()=>TeamCanvas.serialize().libraryHidden),false);
await page.keyboard.press('Escape');assert.equal(await page.locator('#team-canvas-root').evaluate(n=>n.classList.contains('tc-focus-mode')),false);
assert.deepEqual(await page.evaluate(()=>TeamCanvas.serialize()),stateBeforeExpand);
await page.getByRole('button',{name:'Expand canvas'}).click();await page.getByRole('button',{name:'Exit expanded canvas'}).click();
assert.equal(await page.evaluate(()=>TeamCanvas.serialize().libraryHidden),false,'automatic collapse restores previous open state');
await page.getByRole('button',{name:'Expand canvas'}).click();await page.locator('.tc-library-toggle').click();await page.locator('.tc-library-toggle').click();await page.getByRole('button',{name:'Exit expanded canvas'}).click();
assert.equal(await page.evaluate(()=>TeamCanvas.serialize().libraryHidden),true,'explicit user choice persists');
await page.locator('.tc-library-toggle').click();
await page.evaluate(()=>{const n=document.querySelector('.tc-node');n.style.width='1000px';n.style.height='1100px';TeamCanvasViewport.focusNode(n,{readable:true});});await page.waitForTimeout(80);
const reading=await page.locator('.tc-node').evaluate(n=>({width:n.getBoundingClientRect().width,top:n.getBoundingClientRect().top,viewportTop:n.closest('.tc-scroll').getBoundingClientRect().top,viewportWidth:n.closest('.tc-scroll').clientWidth}));assert(reading.width>=Math.min(1000,reading.viewportWidth-64)-2,'readable mode fits width instead of shrinking tall chart to viewport height '+JSON.stringify(reading));assert(reading.top>=reading.viewportTop+8,'readable mode starts at chart header');
// Fit all on a figure that fits at 100% (only once the minimap's usual height is not held back) stays at 100%.
// At 100% (minimap hidden) its height leaves 40 px spare under the zoom controls: less than the minimap's ~96 px.
await page.locator('.tc-zoom-reset').click();await page.waitForTimeout(50);assert.equal(await page.locator('.tc-map').isVisible(),false);
await page.evaluate(()=>{const n=document.querySelector('.tc-node'),s=document.querySelector('.tc-scroll'),nav=document.querySelector('.tc-navigation');n.style.width='500px';n.style.height=(s.clientHeight-32-16-(nav.offsetHeight+12)-40)+'px';});await page.waitForTimeout(50);
await page.getByRole('button',{name:'Fit all',exact:true}).click();await page.waitForTimeout(50);
assert.equal(await page.locator('.tc-zoom-reset').innerText(),'100%','Fit all does not reserve room for a minimap that will stay hidden');
assert.equal(await page.locator('.tc-map').isVisible(),false,'no minimap after fitting a figure that fits');
// Back to the large figure in reading mode (zoomed out) for the mobile minimap checks below.
await page.evaluate(()=>{const n=document.querySelector('.tc-node');n.style.width='1000px';n.style.height='1100px';TeamCanvasViewport.focusNode(n,{readable:true});});await page.waitForTimeout(80);
await page.setViewportSize({width:390,height:844});await page.addStyleTag({content:'.tc-layout{display:block}.tc-scroll{width:100%!important;height:450px!important}.tc-main{width:100%!important}body{margin:8px}'});await page.waitForTimeout(100);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=390),'mobile navigation must not overflow');
await page.getByRole('button',{name:'Expand canvas'}).click();assert(await page.getByRole('button',{name:'Exit expanded canvas'}).isVisible());await page.keyboard.press('Escape');
await page.locator('.tc-map summary').click();assert.equal(await map.isVisible(),false);await page.locator('.tc-map summary').click();assert.equal(await map.isVisible(),true);
// RC2: the navigation box never covers ANY card's header (status badge) or its actions, selected or not,
// and is never hidden. It moves to a free corner; when no corner is free the canvas reserves a band for it.
const yp=await browser.newPage({viewport:{width:1200,height:900}});
await yp.setContent('<section id="team-canvas-root"><div class="tc-layout"><div class="tc-main" style="width:850px"><div class="tc-scroll" style="width:100%;height:500px"><div class="tc-board" style="width:3000px;height:2400px"><div class="tc-node" id="big" style="position:absolute;left:30px;top:30px;width:2600px;height:2000px"><div class="tc-node-head"><strong>Big</strong></div></div><div class="tc-node" id="low" style="position:absolute;left:2000px;top:2000px;width:420px;height:300px"><div class="tc-node-head"><strong>PCA</strong><span class="tc-card-status">Could not update</span><div class="tc-card-actions"><button type="button">Data &amp; settings</button></div></div></div></div></div></div></div></section>');
await yp.addStyleTag({path:path.resolve('www/team/css/canvas.css')});await yp.addStyleTag({path:path.resolve('www/team/css/canvas_viewport.css')});
await yp.addScriptTag({path:path.resolve('www/team/js/canvas_viewport.js')});
await yp.evaluate(()=>{const root=document.getElementById('team-canvas-root');TeamCanvasViewport.mount(root,root.querySelector('.tc-board'));TeamCanvasViewport.setScale(.5);});
const frames=()=>yp.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));await frames();
assert.equal(await yp.locator('.tc-map').isVisible(),true,'minimap shows below 100% with overflowing content');
// "Minimap still visible at 100% after Reset" (22% -> 100%): Reset hides it, and so does a fitted
// zoom that the Reset button already shows as 100%. The scroll is ~850 px tall here (fitViewport sizes it
// to the window), so at 22% this 2630x2300 figure fits and rightly has no minimap: widen it for this check.
await yp.evaluate(()=>{const n=document.getElementById('big');n.style.width='5000px';n.style.height='4200px';TeamCanvasViewport.setScale(.22);});await frames();
assert.equal(await yp.locator('.tc-map').isVisible(),true,'minimap at 22% on overflowing content');
await yp.locator('.tc-zoom-reset').click();await frames();
assert.equal(await yp.locator('.tc-zoom-reset').innerText(),'100%');assert.equal(await yp.locator('.tc-map').isVisible(),false,'no minimap after Reset to 100%');
await yp.evaluate(()=>TeamCanvasViewport.setScale(.996));await frames();
assert.equal(await yp.locator('.tc-zoom-reset').innerText(),'100%');assert.equal(await yp.locator('.tc-map').isVisible(),false,'no minimap at a zoom shown as 100%');
await yp.evaluate(()=>{const n=document.getElementById('big');n.style.width='2600px';n.style.height='2000px';TeamCanvasViewport.setScale(.5);const s=document.querySelector('.tc-scroll');s.scrollLeft=0;s.scrollTop=0;});await frames();
// Invariant, checked after every step: the box is shown and usable; no visible part of any card header
// lies under it; elementFromPoint at every visible badge and action centre reaches that card.
const audit=()=>yp.evaluate(()=>{
  const nav=document.querySelector('.tc-navigation'),cs=getComputedStyle(nav),b=nav.getBoundingClientRect(),sc=document.querySelector('.tc-scroll'),s=sc.getBoundingClientRect(),bad=[];
  // Inside the scroll's client area (not on its scrollbars).
  const meets=(p,q)=>p.left<q.right&&p.right>q.left&&p.top<q.bottom&&p.bottom>q.top,inView=r=>{const x=r.left+r.width/2,y=r.top+r.height/2;return x>s.left&&x<s.left+sc.clientLeft+sc.clientWidth&&y>s.top&&y<s.top+sc.clientTop+sc.clientHeight;};
  document.querySelectorAll('.tc-node').forEach(n=>{
    const h=n.querySelector('.tc-node-head').getBoundingClientRect(),v={left:Math.max(h.left,s.left),right:Math.min(h.right,s.right),top:Math.max(h.top,s.top),bottom:Math.min(h.bottom,s.bottom)};
    if(v.left<v.right&&v.top<v.bottom&&meets(v,b))bad.push(n.id+' header under the box');
    n.querySelectorAll('.tc-card-status,.tc-card-actions').forEach(el=>{const r=el.getBoundingClientRect();if(!inView(r))return;const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(!hit||!n.contains(hit))bad.push(n.id+' '+el.className+' hit '+(hit&&(hit.className||hit.tagName)));});
  });
  return {bad,shown:cs.visibility==='visible'&&cs.pointerEvents!=='none'&&b.width>0&&b.height>0,box:{left:Math.round(b.left),right:Math.round(b.right),top:Math.round(b.top),bottom:Math.round(b.bottom)},inset:nav.parentElement.classList.contains('tc-nav-inset'),scrollBottom:Math.round(s.bottom)};
});
const clean=(a,label)=>{assert(a.shown,label+': the navigation box stays shown '+JSON.stringify(a));assert.deepEqual(a.bad,[],label+': '+JSON.stringify(a));};
const home0=(await audit()).box;clean(await audit(),'start');
// Pan (scroll the canvas) so that the UNSELECTED card's header, with its status badge and actions, lies where the box is.
await yp.evaluate(()=>{const s=document.querySelector('.tc-scroll'),nr=document.querySelector('.tc-navigation').getBoundingClientRect(),r=document.getElementById('low').getBoundingClientRect();s.scrollLeft+=r.left-(nr.left-100);s.scrollTop+=r.top-(nr.top+30);});await frames();
assert(await yp.evaluate(h=>{const r=document.querySelector('#low .tc-node-head').getBoundingClientRect();return r.left<h.right&&r.right>h.left&&r.top<h.bottom&&r.bottom>h.top&&!document.getElementById('low').classList.contains('is-selected');},home0),'fixture: the unselected card header now lies where the box was');
let st=await audit();clean(st,'unselected card panned under the box');
assert.notDeepEqual(st.box,home0,'the box moved to a free corner '+JSON.stringify([st.box,home0]));assert.equal(st.inset,false,'a free corner was enough');
await yp.hover('#low .tc-node-head strong');clean(await audit(),'hovering the unselected card');
await yp.evaluate(()=>document.getElementById('low').classList.add('is-selected'));await frames();clean(await audit(),'the same card selected');
await yp.evaluate(()=>document.getElementById('low').classList.remove('is-selected'));
// Zoom, Reset, Fit and move stay keyboard reachable while the box has moved.
for(const sel of ['.tc-zoom-out','.tc-zoom-reset','.tc-zoom-in','.tc-zoom-fit','.tc-map-grip','.tc-map svg'])assert.equal(await yp.evaluate(sel=>{const b=document.querySelector(sel);b.focus();return document.activeElement===b;},sel),true,sel+' takes keyboard focus while the box is moved');
const zBefore=await yp.evaluate(()=>TeamCanvasViewport.scale);await yp.locator('.tc-zoom-out').focus();await yp.keyboard.press('Enter');assert(await yp.evaluate(()=>TeamCanvasViewport.scale)<zBefore,'Zoom out works from the keyboard');await frames();clean(await audit(),'after zooming out');
// Panning the card away brings the box back to its own place.
await yp.evaluate(()=>{TeamCanvasViewport.setScale(.5);const s=document.querySelector('.tc-scroll');s.scrollLeft=0;s.scrollTop=0;});await frames();
st=await audit();clean(st,'card panned away');assert.deepEqual(st.box,home0,'the box is back in its own place');
// Every corner holds a card header: the canvas reserves a band for the box, cards end above it.
await yp.evaluate(()=>{TeamCanvasViewport.setScale(.5);const s=document.querySelector('.tc-scroll');s.scrollLeft=200;s.scrollTop=200;});await frames();
await yp.evaluate(()=>{
  const sc=document.querySelector('.tc-scroll'),s=sc.getBoundingClientRect(),sh=document.querySelector('.tc-viewport-shell').getBoundingClientRect(),nav=document.querySelector('.tc-navigation'),w=nav.offsetWidth,h=nav.offsetHeight,z=TeamCanvasViewport.scale,board=document.querySelector('.tc-board');
  const mk=(id,x,y,width)=>{const n=document.createElement('div');n.className='tc-node tc-corner';n.id=id;n.style.cssText='position:absolute;left:'+(x-s.left+sc.scrollLeft)/z+'px;top:'+(y-s.top+sc.scrollTop)/z+'px;width:'+width/z+'px;height:'+240/z+'px';n.innerHTML='<div class="tc-node-head"><strong>'+id+'</strong><span class="tc-card-status">Could not update</span><div class="tc-card-actions"><button type="button">Data &amp; settings</button></div></div>';board.appendChild(n);};
  // Right-hand cards end 10 px inside the scroll's client area, so their badges are not under the scrollbar.
  const cr=s.left+sc.clientWidth;
  mk('tl',sh.left,sh.top+12+h/2,w+60);mk('tr',cr-w-70,sh.top+12+h/2,w+60);mk('bl',sh.left,sh.bottom-12-h/2,w+60);mk('br',cr-w-70,sh.bottom-12-h/2,w+60);
});await frames();await frames();
st=await audit();clean(st,'every corner taken');
assert.equal(st.inset,true,'no free corner: a band is reserved '+JSON.stringify(st));assert(st.box.top>=st.scrollBottom-1,'the box sits in the band below the cards '+JSON.stringify(st));
for(const sel of ['.tc-zoom-out','.tc-zoom-reset','.tc-zoom-in','.tc-zoom-fit','.tc-map-grip'])assert.equal(await yp.evaluate(sel=>{const b=document.querySelector(sel);b.focus();return document.activeElement===b;},sel),true,sel+' takes keyboard focus in the band');
await yp.evaluate(()=>document.querySelectorAll('.tc-corner').forEach(n=>n.remove()));await frames();await frames();
st=await audit();clean(st,'corners free again');assert.equal(st.inset,false,'the band goes once a corner is free');
// FIXR1B item 2: an open card popover (RC4's ⋯ menu, above the card's footer and outside the bar's box) is
// an obstacle too. A card whose header and footer stay clear of the box, but whose open menu reaches into
// it: the box moves aside while the menu is open and comes back when it closes. Card rectangles are cached
// between card changes, so this also checks that opening a menu, and panning, invalidate or shift them.
await yp.evaluate(()=>{TeamCanvasViewport.setScale(1);const s=document.querySelector('.tc-scroll');s.scrollLeft=0;s.scrollTop=0;});await frames();
const homeBox=(await audit()).box;
await yp.evaluate(h=>{
  const sc=document.querySelector('.tc-scroll'),s=sc.getBoundingClientRect(),board=document.querySelector('.tc-board');
  const n=document.createElement('div');n.className='tc-node tc-card-framed';n.id='menu-card';
  // Screen = world at 100%. The footer starts 14 px below the box; the 220 px menu above it covers the box.
  const top=h.bottom+14+40-380,left=h.left-300;
  n.style.cssText='position:absolute;overflow:visible;left:'+(left-s.left+sc.scrollLeft)+'px;top:'+(top-s.top+sc.scrollTop)+'px;width:360px;height:380px';
  n.innerHTML='<div class="tc-node-head" style="position:static"><strong>Menu card</strong><div class="tc-card-actions tc-card-docked" style="position:absolute;left:8px;right:8px;bottom:5px;height:30px;display:flex"><button type="button">Edit</button><div class="tc-card-more-wrap" style="position:relative;margin-left:auto"><button type="button" class="tc-card-more" aria-expanded="false" aria-controls="t-menu">⋯</button><div class="tc-card-menu" id="t-menu" hidden style="position:absolute;right:0;bottom:calc(100% + 4px);width:180px;height:220px;background:#fff"></div></div></div></div><div class="tc-card-foot" style="position:absolute;left:0;right:0;bottom:0;height:40px"></div>';
  board.appendChild(n);
},homeBox);await frames();
st=await audit();clean(st,'menu card, menu closed');assert.deepEqual(st.box,homeBox,'fixture: header and footer leave the box in its place');
const menuMeets=()=>yp.evaluate(()=>{const m=document.getElementById('t-menu').getBoundingClientRect(),b=document.querySelector('.tc-navigation').getBoundingClientRect();return m.width>0&&m.left<b.right&&m.right>b.left&&m.top<b.bottom&&m.bottom>b.top;});
await yp.evaluate(()=>{const m=document.getElementById('t-menu');m.hidden=false;document.querySelector('#menu-card .tc-card-more').setAttribute('aria-expanded','true');});
assert.equal(await yp.evaluate(h=>{const m=document.getElementById('t-menu').getBoundingClientRect();return m.left<h.right&&m.right>h.left&&m.top<h.bottom&&m.bottom>h.top;},homeBox),true,'fixture: the open menu reaches into the box\'s place');
await frames();
st=await audit();clean(st,'menu open');assert.equal(await menuMeets(),false,'the navigation box moves off the open ⋯ menu '+JSON.stringify(st.box));
// Panning a little (cached rectangles shift with the scroll): still clear.
await yp.evaluate(()=>{const s=document.querySelector('.tc-scroll');s.scrollTop+=6;s.scrollLeft+=6;});await frames();
assert.equal(await menuMeets(),false,'still clear of the menu after panning');
await yp.evaluate(()=>{const s=document.querySelector('.tc-scroll');s.scrollTop-=6;s.scrollLeft-=6;const m=document.getElementById('t-menu');m.hidden=true;document.querySelector('#menu-card .tc-card-more').setAttribute('aria-expanded','false');});await frames();
assert.deepEqual((await audit()).box,homeBox,'the box returns once the menu closes');
await yp.evaluate(()=>document.getElementById('menu-card').remove());await frames();
await yp.close();
// Browsers without CSS zoom stay at 100%: no minimap there either, even for an overflowing figure.
const noZoom=await browser.newPage({viewport:{width:1200,height:900}});
await noZoom.setContent('<section id="team-canvas-root"><div class="tc-layout"><div class="tc-main" style="width:850px"><div class="tc-scroll" style="width:100%;height:500px"><div class="tc-board"><div class="tc-node" style="position:absolute;left:30px;top:30px;width:1600px;height:1200px"><strong>PCA</strong></div></div></div></div></div></section>');
await noZoom.addStyleTag({path:path.resolve('www/team/css/canvas.css')});await noZoom.addStyleTag({path:path.resolve('www/team/css/canvas_viewport.css')});
await noZoom.evaluate(()=>Object.defineProperty(Element.prototype,'currentCSSZoom',{configurable:true,get(){return undefined;}}));
await noZoom.addScriptTag({path:path.resolve('www/team/js/canvas_viewport.js')});
await noZoom.evaluate(()=>{const root=document.getElementById('team-canvas-root');TeamCanvasViewport.mount(root,root.querySelector('.tc-board'));});
await noZoom.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
assert.equal(await noZoom.locator('.tc-zoom-fit').isDisabled(),true,'zoom is treated as unsupported');
assert.equal(await noZoom.locator('.tc-zoom-reset').innerText(),'100%');
assert.equal(await noZoom.locator('.tc-map').isVisible(),false,'no minimap at 100% without CSS zoom, even when the figure overflows');
assert(await noZoom.locator('.tc-zoom-reset').isVisible(),'zoom controls stay');
console.log('PASS: zoom limits/reset/fit, unchanged checkpoint, scaled node drag, minimap click/keyboard, floating minimap, expanded mode, mobile width/collapse, minimap hides once the zoomed-out figure fits, Fit keeps no reserve for a hidden minimap, no minimap at 100% without CSS zoom, no minimap after Reset from 22% or at a zoom shown as 100%, the navigation box stays shown and never covers an unselected or selected card header, badge or actions (free corner, or a reserved band when every corner is taken), its controls stay keyboard reachable');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
