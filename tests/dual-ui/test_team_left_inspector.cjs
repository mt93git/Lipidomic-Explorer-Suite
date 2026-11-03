const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');

(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
  await page.setContent('<section id="team-canvas-root"><div class="tc-layout tc-library-hidden"><aside class="tc-catalog">Library</aside><div class="tc-main"><div class="tc-toolbar"></div><div class="tc-scroll"><div class="tc-board"><article class="tc-node" tabindex="0" data-plot-id="p"><div class="tc-node-head"><strong>First plot</strong><button>Edit</button></div><details class="tc-settings"><summary>Plot appearance</summary><input aria-label="Title"></details><div class="tc-content">Graph</div></article><article class="tc-node tc-illustration" tabindex="0" data-node-kind="illustration"><div class="tc-node-head"><strong>Sample</strong></div><div class="tc-content"><div class="tc-edit"><input aria-label="Accent"></div></div></article></div></div></div></div></section>');
  await page.addStyleTag({content:'.tc-scroll{height:650px;overflow:auto}.tc-board{position:relative;height:1400px!important;width:1800px!important}.tc-node{position:absolute!important;left:40px!important;top:80px!important;width:400px!important;height:300px!important}.tc-illustration{left:700px!important;top:80px!important}'});
  for(const file of ['canvas.css','workspace_minimal.css','canvas_catalog.css','canvas_viewport.css','canvas_inspector.css']) await page.addStyleTag({path:path.resolve('www/team/css',file)});
  await page.addScriptTag({path:path.resolve('www/team/js/canvas_viewport.js')});
  await page.evaluate(()=>TeamCanvasViewport.mount(document.getElementById('team-canvas-root'),document.querySelector('.tc-board')));
  await page.addScriptTag({path:path.resolve('www/team/js/canvas_inspector.js')});

  const inspector=page.locator('.tc-selection-inspector'),toggle=page.locator('.tc-properties-toggle'),first=page.locator('.tc-node').first(),illustration=page.locator('.tc-illustration');
  await first.dispatchEvent('click');
  assert.equal(await inspector.isVisible(),true);
  assert.equal(await inspector.getByRole('textbox',{name:'Title'}).count(),1);
  assert.equal(await toggle.getAttribute('aria-controls'),await inspector.getAttribute('id'));
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  assert.equal(await inspector.evaluate(e=>getComputedStyle(e).position),'fixed');
  const floating=await inspector.boundingBox(),plot=await first.boundingBox(),main=await page.locator('.tc-main').boundingBox();assert.ok(floating.x>=plot.x+plot.width,'properties should sit beside selected plot');assert.ok(main.x<floating.x,'properties must not reserve a sidebar column');
  await page.locator('.tc-scroll').evaluate(e=>e.scrollLeft+=20);
  await page.waitForFunction(()=>Math.abs(document.querySelector('.tc-selection-inspector').getBoundingClientRect().left-document.querySelector('.tc-node').getBoundingClientRect().right-12)<2);
  await page.locator('.tc-scroll').evaluate(e=>e.scrollLeft=0);

  await inspector.getByRole('textbox',{name:'Title'}).fill('First only');
  await illustration.dispatchEvent('click');
  assert.equal(await inspector.getByRole('textbox',{name:'Title'}).count(),0);
  assert.equal(await inspector.getByRole('textbox',{name:'Accent'}).count(),1);
  const selectedBox=await illustration.boundingBox(),panelBox=await inspector.boundingBox();assert.ok(panelBox.x>=selectedBox.x+selectedBox.width,'camera reserves right space instead of flipping panel left');assert.ok(Math.abs(panelBox.y-selectedBox.y)<2,'panel aligns to plot top');assert.ok(panelBox.height<=520,'panel height is bounded');
  assert.equal(await page.getByRole('textbox',{name:'Accent',includeHidden:true}).count(),1,'moving controls must not clone bindings');
  assert.equal(await first.getByRole('textbox',{name:'Title',includeHidden:true}).inputValue(),'First only');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Accent','moving a focused editor should land on the next editor');

  await illustration.evaluate(n=>n.classList.add('tc-finished'));
  await page.waitForFunction(()=>!document.querySelector('.tc-inspector-locked').hidden);
  assert.equal(await inspector.getByRole('textbox',{name:'Accent'}).isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Edit figure','Finish should move focus out of the hidden input');
  await illustration.evaluate(n=>n.classList.remove('tc-finished'));
  await page.waitForFunction(()=>document.querySelector('.tc-inspector-locked').hidden);

  await inspector.getByRole('button',{name:'Close object properties'}).click();
  assert.equal(await inspector.isHidden(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('tc-properties-toggle')),true,'closing should return focus to Properties');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await page.keyboard.press('Enter');
  assert.equal(await inspector.isVisible(),true,'Properties should reopen by keyboard');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Accent','explicit open should focus the first live control');
  await page.keyboard.press('Escape');
  assert.equal(await inspector.isHidden(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('tc-properties-toggle')),true,'Escape should return focus to Properties');

  await page.evaluate(()=>{const root=document.getElementById('team-canvas-root');root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}));});
  await first.focus();
  assert.equal(await inspector.isVisible(),true,'pointercancel must release pointer suppression for keyboard focus');
  await inspector.getByRole('button',{name:'Close object properties'}).click();
  await page.evaluate(()=>{const root=document.getElementById('team-canvas-root');root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));window.dispatchEvent(new Event('blur'));});
  await illustration.focus();
  assert.equal(await inspector.isVisible(),true,'window blur must release pointer suppression for keyboard focus');

  await page.setViewportSize({width:390,height:844});
  await first.focus();
  await page.waitForFunction(()=>document.querySelector('.tc-selection-inspector').getBoundingClientRect().right<=380);
  const mobile=await inspector.boundingBox(),scroll=await page.locator('.tc-scroll').evaluate(e=>({height:e.clientHeight,scrollHeight:e.scrollHeight}));
  assert.ok(mobile.width<=370&&mobile.x>=10&&mobile.x+mobile.width<=380,'mobile drawer should respect safe horizontal margins');
  assert.ok(mobile.y+mobile.height<=834,'mobile drawer should respect the bottom safe-area inset');
  assert.ok(scroll.scrollHeight>scroll.height,'the mobile drawer should add scrollable clearance without narrowing the canvas');

  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('team-canvas-panel-open',{detail:{kind:'data'}})));
  assert.equal(await inspector.isHidden(),true,'data panel replaces appearance panel');
  await toggle.click();
  await inspector.getByRole('textbox',{name:'Title'}).focus();
  await first.evaluate(n=>n.remove());
  await page.waitForFunction(()=>document.querySelector('.tc-selection-inspector').hidden);
  assert.equal(await page.evaluate(()=>document.getElementById('team-canvas-root').contains(document.activeElement)),true,'removing a focused selection should leave focus on a safe canvas target');
  console.log('PASS floating inspector: adjacent anchor follows pan, no sidebar, live controls, focus restoration, keyboard/Escape, pointercancel/blur, mobile safe area and occlusion clearance');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
