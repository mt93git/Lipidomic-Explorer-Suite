// Isolated composition fixture; runs the real figure editor without a Shiny service.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.setContent(`<div id="team-canvas-root">
   <div class="tc-mode-tabs"><button role="tab" id="tc-workspace-tab" aria-controls="tc-workspace-panel">Workspace</button><button role="tab" id="tc-preview-tab" aria-controls="tc-preview-panel">Print preview</button></div>
   <div id="tc-workspace-panel"><div class="tc-toolbar"></div><details class="tc-save-help"><summary>Canvas help</summary><p>Undo document edits with Ctrl+Z.</p></details></div>
   <button class="tc-focus-toggle">Expand canvas</button>
   <section id="tc-preview-panel" hidden><div class="tc-preview-toolbar"><div class="tc-preview-heading"></div><div class="tc-preview-actions">
   ${['stephania','add-text','svg','pdf','print'].map(c=>`<button class="tc-preview-${c}">${c}</button>`).join('')}</div></div>
   <div class="tc-preview-options">
    <select class="tc-preview-layout"><option value="free">Free layout</option><option value="pages">Pages</option></select>
    <select class="tc-preview-paper"><option value="letter">Letter</option><option value="custom">Custom</option></select>
    <select class="tc-preview-orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
    <input class="tc-preview-custom-width" value="612"><input class="tc-preview-custom-height" value="792"><input type="checkbox" class="tc-preview-furniture" checked>
   </div><p class="tc-preview-status" role="status"></p><div class="tc-preview-pages"></div></section></div>`);
  for (const file of ['canvas_preview','figure_toolbar']) await page.addStyleTag({path:`www/team/css/${file}.css`});
  await page.evaluate(()=>{
   window.fixture={ready:true,state:{version:'1',nodes:[{id:'live',label:'Live plot',width:400,height:300,x:0,y:0}]},unusable:[{id:'live',label:'Live plot',reason:'live'}]};
   window.TeamCanvas={previewState:()=>structuredClone(fixture)};
   window.tabRequests=[];window.addEventListener('team-figure-open-tab',e=>tabRequests.push(e.detail.tab));
   window.escapes=[];document.addEventListener('keydown',e=>{if(e.key==='Escape')escapes.push(e.defaultPrevented);});
   window.originals=Array.from(document.querySelectorAll('.tc-preview-actions button'));
  });
  for (const file of ['canvas_preview','figure_toolbar']) await page.addScriptTag({path:`www/team/js/${file}.js`});
  await page.getByRole('tab',{name:'Print preview'}).click();
  const host=page.locator('.tc-figure-tools'), button=name=>host.getByRole('button',{name,exact:true});
  await button('1 plots not finished — open Plots ›').click();
  assert.deepEqual(await page.evaluate(()=>tabRequests),['plots']);
  assert.equal(await page.locator('.tc-compose-excluded').getAttribute('aria-hidden'),null);
  assert.match(await page.locator('.tc-compose-excluded').textContent(),/Live plot/);
  await button('Export figure ▾').click();
  for (const name of ['SVG','PDF','Print']) assert(await button(name).isDisabled());
  assert.match(await host.locator('.tc-figure-export-reason').textContent(),/1 plots not finished/);
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>escapes),[true]);
  assert.equal(await button('Export figure ▾').getAttribute('aria-expanded'),'false');
  await button('Add text').click();
  await page.waitForFunction(()=>document.querySelectorAll('.tc-free-item').length===1);
  await button('Undo').click();
  await page.waitForFunction(()=>document.querySelectorAll('.tc-free-item').length===0);
  await button('Redo').click();
  await page.waitForFunction(()=>document.querySelectorAll('.tc-free-item').length===1);
  await button('Add shape ▾').click();await button('Rectangle').click();
  await page.waitForFunction(()=>document.querySelectorAll('.tc-free-item').length===2);
  await button('More figure options').click();await button('Page guides').click();
  assert.equal(await page.locator('.tc-paper-guides').count(),1);
  await button('More figure options').click();await button('Show page header and footer').click();
  assert.equal(await page.locator('.tc-preview-furniture').isChecked(),false);
  await button('More figure options').click();await button('Page setup').click();
  assert.equal(await page.locator('.tc-page-settings').getAttribute('open'),'');
  assert.deepEqual(await page.evaluate(()=>tabRequests),['plots','page']);
  // Re-render the authoritative composition; the hint and export gates must recover.
  await page.evaluate(()=>{fixture.state.nodes=[];fixture.unusable=[];window.dispatchEvent(new Event('team-canvas-changed'));});
  await page.waitForFunction(()=>document.querySelector('.tc-figure-excluded-chip').hidden);
  // Every export goes through the SAME original button. Intercept downstream work in this fixture.
  await page.evaluate(()=>{window.exports=[];['svg','pdf','print'].forEach(name=>{const b=document.querySelector('.tc-preview-'+name);b.disabled=false;b.addEventListener('click',e=>{exports.push(name);e.stopImmediatePropagation();},true);});});
  for (const name of ['SVG','PDF','Print']) {await button('Export figure ▾').click();await button(name).click();}
  assert.deepEqual(await page.evaluate(()=>exports),['svg','pdf','print']);
  for (const width of [1920,1440,1280,900,390]) {
   await page.setViewportSize({width,height:900});
   assert.equal(await host.locator('.tc-figure-publication').isVisible(),width>1280);
   await button('More figure options').click();
   assert.equal(await host.locator('.tc-figure-publication-overflow').isVisible(),width<=1280);
   await page.keyboard.press('Escape');
   assert(await host.evaluate(el=>el.scrollWidth<=el.clientWidth),'toolbar fits');
  }
  await page.setViewportSize({width:1440,height:900});
  await button('Publication layout').click();
  await page.locator('.tc-publication-confirmation').waitFor();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  // A1 can provide its slot before or after this script mounts.
  await page.evaluate(()=>{const slot=document.createElement('div');slot.id='tc-figure-toolbar-slot';document.getElementById('team-canvas-root').appendChild(slot);});
  await page.waitForFunction(()=>document.querySelector('#tc-figure-toolbar-slot > .tc-figure-tools'));
  await page.addScriptTag({path:'www/team/js/figure_toolbar.js'});
  assert.equal(await host.count(),1);
  assert(await page.evaluate(()=>originals.every(b=>b.isConnected)));
  await button('← Back to draft').click();await page.waitForFunction(()=>document.querySelector('.tc-figure-tools').hidden);
  assert.equal(await page.locator('#tc-workspace-panel').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS figure_toolbar: original actions, gates, hint, menus, Escape bubbling, responsive fit, slot migration, and Draft return');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
