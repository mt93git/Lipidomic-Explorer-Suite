const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');const path=require('node:path');
// Draft canvas Select / Move (pointer_mode.js): toggle, V/H/Space, drag-to-pan that never reaches the cards, middle button.
(async()=>{const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars']});/* real scrollbars: the scrollbar exemption is checked */try{
const page=await browser.newPage({viewport:{width:1200,height:900}});
await page.setContent(`<section id="team-canvas-root"><div class="tc-layout"><nav class="ts-rail" aria-label="Canvas panels"><button class="ts-rail-item" aria-label="Plots">P</button></nav><aside class="tc-catalog"><div class="tc-list"></div><input class="tc-search"></aside><button class="tc-reset">Return all plots</button><button class="tc-arrange">Arrange</button><button class="tc-library-toggle">Hide library</button><div class="tc-main" style="width:850px"><div class="tc-toolbar"><details class="tc-save-help"><summary>About</summary><p class="tc-shortcut-help">Undo with Ctrl+Z.</p></details></div><div class="tc-scroll" style="width:100%;height:500px"><div class="tc-board"><div class="tc-empty"></div></div></div><div class="tc-status" role="status" aria-live="polite"></div></div></div><section id="tc-preview-panel" hidden><h3>Figure page</h3></section></section><div class="rd-card"><h3>PCA</h3><div id="results_dashboard-plot_pca" class="shiny-plot-output"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3C/svg%3E"></div></div>`);
for(const f of ['canvas.css','canvas_viewport.css','pointer_mode.css'])await page.addStyleTag({path:path.resolve('www/team/css/'+f)});
for(const f of ['canvas_viewport.js','canvas.js','pointer_mode.js'])await page.addScriptTag({path:path.resolve('www/team/js/'+f)});
await page.evaluate(()=>TeamCanvas.addPlot('results_dashboard-plot_pca'));
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));await frames();
// Toggle: one group in the shell's left rail, after the panel buttons; the navigation box is untouched
// (the mascot avoids its rectangle, context_help.js). Select pressed on load.
const group=page.getByRole('group',{name:'Pointer mode'});assert.equal(await group.count(),1);
assert.equal(await page.locator('.ts-rail > .ts-rail-item + .tc-pointer-mode').count(),1,'toggle sits in the rail after its panel buttons');
assert.equal(await page.locator('.tc-navigation .tc-pointer-mode, .tc-navigation .tc-pointer-label').count(),0,'nothing added to the navigation box');
const selectBtn=group.getByRole('button',{name:'Select',exact:true}),moveBtn=group.getByRole('button',{name:'Move',exact:true});
const state=async()=>({select:await selectBtn.getAttribute('aria-pressed'),move:await moveBtn.getAttribute('aria-pressed'),label:await group.getAttribute('data-mode'),hand:await page.locator('.tc-scroll').evaluate(s=>s.classList.contains('is-hand'))});
assert.deepEqual(await state(),{select:'true',move:'false',label:'select',hand:false});
assert.match(await page.locator('.tc-save-help').textContent(),/V to select.*H to pan.*Space/s,'Canvas help names the shortcuts');
// A scrollable world at 100%.
await page.locator('.tc-zoom-reset').click();
await page.evaluate(()=>{const n=document.querySelector('.tc-node');n.style.width='1600px';n.style.height='1400px';document.querySelector('.tc-board').style.width='2600px';document.querySelector('.tc-board').style.height='2400px';TeamCanvasViewport.refresh();});await frames();
const scrollPos=()=>page.locator('.tc-scroll').evaluate(s=>({x:s.scrollLeft,y:s.scrollTop}));
const nodePos=()=>page.locator('.tc-node').evaluate(n=>({x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth,h:n.offsetHeight}));
await page.locator('.tc-scroll').evaluate(s=>{s.scrollLeft=0;s.scrollTop=0;});await frames();
await page.evaluate(()=>{window.cardDowns=0;window.plotlyDowns=0;const n=document.querySelector('.tc-node');n.addEventListener('pointerdown',()=>window.cardDowns++);n.addEventListener('mousedown',()=>window.plotlyDowns++);});
// H from the page body: Move, announced.
await page.evaluate(()=>document.activeElement&&document.activeElement.blur());
await page.keyboard.press('h');
assert.deepEqual(await state(),{select:'false',move:'true',label:'hand',hand:true});
assert.match(await page.locator('.tc-status').innerText(),/^Move mode: drag anywhere to pan/);
const look=await page.locator('.tc-node').evaluate(n=>({cursor:getComputedStyle(n.querySelector('.tc-node-head')||n).cursor,resize:getComputedStyle(n).resize,select:getComputedStyle(n).userSelect}));
assert.deepEqual(look,{cursor:'grab',resize:'none',select:'none'},'cards are grab surfaces without resize or text selection');
// Drag on a card header pans the view 1:1 and never selects, moves or resizes the card.
const checkpoint=await page.evaluate(()=>TeamCanvas.serialize());const n0=await nodePos(),s0=await scrollPos();
const head=await page.locator('.tc-node-head').boundingBox();
await page.mouse.move(head.x+300,head.y+12);await page.mouse.down();
assert(await page.locator('.tc-scroll').evaluate(s=>s.classList.contains('is-panning')),'grabbing while dragging');
await page.mouse.move(head.x+200,head.y-18,{steps:6});await page.mouse.up();
const near=(a,b)=>Math.abs(a-b)<=2;
const s1=await scrollPos();assert(near(s1.x-s0.x,100),'pan x is 1:1');assert(near(s1.y-s0.y,30),'pan y is 1:1');
assert.deepEqual(await nodePos(),n0,'card did not move or resize');
assert.deepEqual(await page.evaluate(()=>[window.cardDowns,window.plotlyDowns]),[0,0],'card and Plotly never saw the press');
assert.deepEqual(await page.evaluate(()=>TeamCanvas.serialize()),checkpoint,'a pan is camera only');
assert.equal(await page.locator('.tc-scroll').evaluate(s=>s.classList.contains('is-panning')),false);
// Typing keeps its letters; V back to Select.
await page.locator('.tc-search').focus();await page.keyboard.press('v');assert.equal((await state()).label,'hand','V in a text field types');
assert.equal(await page.locator('.tc-search').inputValue(),'v');
await page.locator('.tc-search').evaluate(i=>{i.value='';i.blur();});
await page.keyboard.press('v');
assert.deepEqual(await state(),{select:'true',move:'false',label:'select',hand:false});
assert.match(await page.locator('.tc-status').innerText(),/^Select mode: click a plot/);
// Space held from the body: temporary Move, page does not scroll, release returns to Select.
const winY=await page.evaluate(()=>window.scrollY);
await page.keyboard.down(' ');
assert.deepEqual(await state(),{select:'false',move:'true',label:'space',hand:true});
const s2=await scrollPos();await page.mouse.move(head.x+200,head.y+100);await page.mouse.down();await page.mouse.move(head.x+150,head.y+60,{steps:4});await page.mouse.up();
const s3=await scrollPos();assert(near(s3.x-s2.x,50)&&near(s3.y-s2.y,40),'Space pans');
await page.keyboard.up(' ');assert.equal((await state()).label,'select');assert.equal(await page.evaluate(()=>window.scrollY),winY,'Space did not scroll the page');
// Space on a button presses the button and leaves the mode alone.
await page.locator('.tc-zoom-reset').focus();await page.keyboard.down(' ');assert.equal((await state()).label,'select');await page.keyboard.up(' ');
// V, H and Space are not the shortcuts in a field, in a widget that owns its keys, or with a modifier.
await page.evaluate(()=>{const box=document.createElement('div');box.id='pm-widgets';
box.innerHTML='<div class="js-plotly-plot" id="pm-plotly" tabindex="0"><div class="modebar-container"><div class="modebar"><a role="button" id="pm-modebar" tabindex="0">zoom</a></div></div></div>'+
'<div class="selectize-control"><div class="selectize-input"><input id="pm-selectize" autocomplete="off"></div></div>'+
'<div role="combobox" id="pm-combobox" tabindex="0">c</div><div role="listbox" id="pm-listbox" tabindex="0"><div role="option" id="pm-option" tabindex="0">o</div></div>'+
'<div role="menu" id="pm-menu" tabindex="0"><div role="menuitem" id="pm-menuitem" tabindex="0">m</div><div role="menuitemradio" id="pm-menuitemradio" tabindex="0">r</div></div>'+
'<div contenteditable="true" id="pm-ce">x</div><input id="pm-input"><textarea id="pm-textarea"></textarea><select id="pm-select"><option>a</option><option>h</option><option>v</option></select>';
document.querySelector('.tc-node .tc-content,.tc-node').appendChild(box);});
for(const id of ['pm-plotly','pm-modebar','pm-selectize','pm-combobox','pm-listbox','pm-option','pm-menu','pm-menuitem','pm-menuitemradio','pm-ce','pm-input','pm-textarea','pm-select']){
  for(const [key,start] of [['h','select'],['v','hand'],[' ','select']]){
    await page.evaluate(m=>TeamCanvasPointerMode.setMode(m),start==='hand'?'hand':'select');
    await page.locator('#'+id).focus();
    if(key===' '){await page.keyboard.down(' ');assert.equal((await state()).label,start,`Space ignored in #${id}`);await page.keyboard.up(' ');}
    else{await page.keyboard.press(key);assert.equal((await state()).label,start,`${key.toUpperCase()} ignored in #${id}`);}
  }
}
await page.evaluate(()=>{document.getElementById('pm-widgets').remove();document.activeElement&&document.activeElement.blur();TeamCanvasPointerMode.setMode('select');});
for(const mod of ['Control','Meta','Alt','Shift']){
  await page.keyboard.press(mod+'+h');assert.equal((await state()).label,'select',`${mod}+H is not the shortcut`);
  await page.keyboard.down(mod);await page.keyboard.down(' ');assert.equal((await state()).label,'select',`${mod}+Space is not the shortcut`);await page.keyboard.up(' ');await page.keyboard.up(mod);
}
await page.evaluate(()=>TeamCanvasPointerMode.setMode('hand'));
for(const mod of ['Control','Meta','Alt','Shift']){await page.keyboard.press(mod+'+v');assert.equal((await state()).label,'hand',`${mod}+V is not the shortcut`);}
await page.evaluate(()=>TeamCanvasPointerMode.setMode('select'));
// FigA: the integrated Figure page offers the same pair in the same rail (its pan on the page's desk is
// tests/dual-ui/test_team_figure_hand_mode.cjs); the pair stays shown and in place in figure mode.
const pairBox=await group.boundingBox();
await page.evaluate(()=>document.getElementById('team-canvas-root').classList.add('tc-figure-mode'));
assert.equal(await group.isVisible(),true,'pair shown on the figure page');
assert.deepEqual(await group.boundingBox(),pairBox,'pair keeps its place on the figure page');
await page.evaluate(()=>document.getElementById('team-canvas-root').classList.remove('tc-figure-mode'));
await page.locator('.tc-scroll').evaluate(s=>{s.scrollLeft=0;s.scrollTop=0;});await page.evaluate(()=>window.scrollTo(0,0));await frames();
// The toggle buttons switch too.
await moveBtn.click();assert.equal((await state()).label,'hand');await selectBtn.click();assert.equal((await state()).label,'select');
// Middle button pans in Select without touching the card.
await page.evaluate(()=>{window.cardDowns=0;window.plotlyDowns=0;});const s4=await scrollPos();
await page.mouse.move(head.x+200,head.y+100);await page.mouse.down({button:'middle'});await page.mouse.move(head.x+170,head.y+80,{steps:3});await page.mouse.up({button:'middle'});
const s5=await scrollPos();assert(near(s5.x-s4.x,30)&&near(s5.y-s4.y,20),'middle button pans');
assert.deepEqual(await page.evaluate(()=>[window.cardDowns,window.plotlyDowns]),[0,0]);
// Select keeps today's header drag (card moves, view does not).
await page.locator('.tc-scroll').evaluate(s=>{s.scrollLeft=0;s.scrollTop=0;});await frames();
const hb=await page.locator('.tc-node-head').boundingBox(),before=await nodePos(),sBefore=await scrollPos();
await page.mouse.move(hb.x+60,hb.y+12);await page.mouse.down();await page.mouse.move(hb.x+140,hb.y+52,{steps:5});await page.mouse.up();
const after=await nodePos();assert(Math.abs(after.x-before.x-80)<5&&Math.abs(after.y-before.y-40)<5,'Select still moves the card by its header');
assert.deepEqual(await scrollPos(),sBefore);
// Wheel scrolling is unchanged in Move.
await page.keyboard.press('h');const w0=await scrollPos();await page.mouse.move(hb.x+300,hb.y+200);await page.mouse.wheel(0,120);await page.waitForTimeout(100);
assert((await scrollPos()).y>w0.y,'wheel still scrolls in Move');
// Scrollbar exemption: in Move, a press on the canvas's scrollbar is the browser's (not prevented, no pan).
await page.addStyleTag({content:'#team-canvas-root .tc-scroll::-webkit-scrollbar{width:16px;height:16px}#team-canvas-root .tc-scroll::-webkit-scrollbar-thumb{background:#999}'});
await page.locator('.tc-scroll').evaluate(s=>{s.style.display='none';void s.offsetWidth;s.style.display='';});await frames();
await page.evaluate(()=>{TeamCanvasPointerMode.setMode('hand');window.barDown=null;window.addEventListener('pointerdown',e=>{window.barDown={prevented:e.defaultPrevented};},{once:true});});
const sb=await page.locator('.tc-scroll').evaluate(s=>{const r=s.getBoundingClientRect();return {x:r.left+s.clientLeft+s.clientWidth+(s.offsetWidth-s.clientWidth-s.clientLeft)/2,y:r.top+s.clientHeight/2,bar:s.offsetWidth-s.clientWidth};});
assert(sb.bar>=10,'the canvas has a classic scrollbar for this check');
await page.mouse.move(sb.x,sb.y);await page.mouse.down();
assert.deepEqual(await page.evaluate(()=>[window.barDown&&window.barDown.prevented,document.querySelector('.tc-scroll').classList.contains('is-panning')]),[false,false],'a scrollbar press in Move is not a pan');
await page.mouse.up();
// The click that ends a Space pan is swallowed even when Space is released before the button.
await page.evaluate(()=>{TeamCanvasPointerMode.setMode('select');window.spaceClicks=0;document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#team-canvas-root'))window.spaceClicks++;});document.activeElement&&document.activeElement.blur();});
const mid=await page.locator('.tc-scroll').evaluate(s=>{const r=s.getBoundingClientRect();return {x:r.left+s.clientWidth/2,y:r.top+s.clientHeight/2};});
await page.keyboard.down(' ');await page.mouse.move(mid.x,mid.y);await page.mouse.down();await page.mouse.move(mid.x-30,mid.y+14,{steps:4});
await page.keyboard.up(' ');await page.mouse.up();await frames();
assert.equal(await page.evaluate(()=>window.spaceClicks),0,'the click ending a Space pan never reaches the canvas');
// Control: a plain click there in Select does reach it (the check above can fail).
await page.mouse.click(mid.x-30,mid.y+14);assert.equal(await page.evaluate(()=>window.spaceClicks),1,'a plain click in Select reaches the canvas');
// With the Figure page shown and no desk laid out (this fixture's panel has none), H, V and Space are
// nobody's: the Draft canvas is not on screen and there is no Figure surface to pan.
await page.evaluate(()=>{document.getElementById('tc-preview-panel').hidden=false;document.activeElement&&document.activeElement.blur();});
await page.keyboard.press('h');assert.equal((await state()).label,'select','H ignored on a Figure page without a desk');
await page.keyboard.down(' ');assert.equal((await state()).label,'select','Space ignored on a Figure page without a desk');await page.keyboard.up(' ');
await page.evaluate(()=>TeamCanvasPointerMode.setMode('hand'));await page.keyboard.press('v');assert.equal((await state()).label,'hand','V ignored on a Figure page without a desk');
await page.evaluate(()=>{document.getElementById('tc-preview-panel').hidden=true;TeamCanvasPointerMode.setMode('select');});
await page.keyboard.press('h');assert.equal((await state()).label,'hand','H works again on the Draft');
console.log('pointer mode ok');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
