const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1000,height:610}});
 await page.setContent(`<div style="height:220px"></div><section id="team-canvas-root"><div class="tc-layout"><div class="tc-catalog" style="height:400px"></div><div class="tc-main"><div class="tc-toolbar"><button class="tc-library-toggle">Hide library</button></div><div class="tc-scroll" style="height:400px;overflow:auto"><div class="tc-board" style="position:relative;width:10000px;height:2000px"><div class="tc-node" style="position:absolute;left:0;top:0;width:620px;height:720px"></div><div class="tc-node" style="position:absolute;left:8000px;top:0;width:620px;height:720px"></div></div></div></div></div></section>`);
 await page.addStyleTag({path:path.resolve('www/team/css/canvas_viewport.css')});
 await page.addScriptTag({path:path.resolve('www/team/js/canvas_viewport.js')});
 await page.evaluate(()=>{TeamCanvasViewport.mount(document.querySelector('#team-canvas-root'),document.querySelector('.tc-board'));window.dispatchEvent(new Event('team-canvas-restored'));});
 await page.waitForTimeout(150);
 const result=await page.evaluate(()=>{let s=document.querySelector('.tc-scroll').getBoundingClientRect(),n=document.querySelector('.tc-node').getBoundingClientRect(),c=document.querySelector('.tc-catalog').getBoundingClientRect();return {s,n,c,scale:TeamCanvasViewport.scale,left:document.querySelector('.tc-node').style.left,top:document.querySelector('.tc-node').style.top};});
 assert(result.s.left>=result.c.right,'library has a reserved gutter');
 assert(result.n.left>=result.s.left-2&&result.n.right<=result.s.right+2&&result.n.top>=result.s.top-2&&result.n.bottom<=result.s.bottom+2,'first card is fit into usable viewport');
 assert(result.scale>.25,'fit focuses one card instead of entire world');
 assert.equal(result.left,'0px');assert.equal(result.top,'0px');
 // RC2: after the restore camera the navigation box is shown, clear of every card's header strip, and usable from the keyboard.
 const nav=await page.evaluate(()=>{const n=document.querySelector('.tc-navigation'),b=n.getBoundingClientRect(),cs=getComputedStyle(n),zoom=n.querySelector('.tc-zoom-in');zoom.focus();
   return {shown:cs.visibility==='visible'&&cs.pointerEvents!=='none'&&b.width>0,focus:document.activeElement===zoom,clear:[...document.querySelectorAll('.tc-node')].every(c=>{const r=c.getBoundingClientRect();return !(r.left<b.right&&r.right>b.left&&r.top-34<b.bottom&&r.top+40>b.top);})};});
 assert(nav.shown&&nav.focus&&nav.clear,'restored view: navigation box shown, focusable and clear of card headers '+JSON.stringify(nav));
 await page.evaluate(()=>document.activeElement.blur());
 await page.evaluate(()=>{let node=document.createElement('div');node.className='tc-node';node.dataset.teamFresh='true';Object.assign(node.style,{position:'absolute',left:'0px',top:'0px',width:'620px',height:'720px'});document.querySelector('.tc-board').appendChild(node);TeamCanvasViewport.setScale(.64);TeamCanvasViewport.focusNode(node);});
 const fresh=await page.evaluate(()=>{const s=document.querySelector('.tc-scroll').getBoundingClientRect(),n=document.querySelector('.tc-node:last-child').getBoundingClientRect();return {s,n};});
 assert(fresh.n.top>=fresh.s.top-2&&fresh.n.bottom<=fresh.s.bottom+2,'fresh card header and bottom remain inside shifted viewport');
 assert(fresh.n.left>=fresh.s.left-2&&fresh.n.right<=fresh.s.right+2,'fresh card remains clear of library');
 console.log('PASS: restored card fits beside library without changing saved coordinates');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
