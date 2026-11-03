const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('../browser/ci/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent(`<body data-guide-step="5"><section id="team-workspace"><h2 id="tw-screen-title"></h2><p id="tw-screen-help"></p><span id="tw-progress"></span><button data-tw-next></button><button data-tw-back></button><button data-tw-choice="matrix"></button><p id="tw-next"></p></section><section class="team-library"><h3></h3><p></p></section><script>
  window.events={};window.handlers={};window.jQuery=function(){return {on:function(name,fn){events[name]=fn;return this},trigger:function(){}}};window.Shiny={setInputValue:function(){},addCustomMessageHandler:function(name,fn){handlers[name]=fn},shinyapp:{isConnected:()=>true}};
  </script></body>`);
  await page.addStyleTag({path:path.resolve('www/team/css/workspace.css')});
  await page.addStyleTag({path:path.resolve('www/team/css/workspace_minimal.css')});
  await page.addScriptTag({path:path.resolve('www/team/js/workspace.js')});
  await page.evaluate(()=>handlers['team-auth-state']({authenticated:true}));
  assert.equal(await page.locator('#team_library_disconnected').count(),0);
  await page.evaluate(()=>{events['shiny:disconnected']();const overlay=document.createElement('div');overlay.className='shiny-disconnected-overlay';overlay.style='position:fixed;inset:0;background:#8888;z-index:99998';document.body.appendChild(overlay)});
  const notice=page.locator('#team_library_disconnected');
  assert.equal(await notice.isVisible(),true);
  assert.match(await notice.textContent(),/Unsaved changes will be lost/);
  assert.equal(await notice.locator('button').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(37, 99, 235)');
  assert.equal(await page.locator('body').getAttribute('data-team-authenticated'),'false');
  await page.getByRole('button',{name:'Reload and sign in'}).click({trial:true});
  // A repeated disconnect keeps one notice and never navigates automatically.
  await page.evaluate(()=>events['shiny:disconnected']());
  assert.equal(await notice.count(),1);assert.equal(page.url(),'about:blank');
  await page.evaluate(()=>{events['shiny:connected']();document.querySelector('.shiny-disconnected-overlay').remove()});
  assert.equal(await notice.isVisible(),false);
  assert.equal(await page.locator('#team-connection-diagnostics').count(),0,'Diagnostics stay opt-in');
  const diagnostic=await browser.newPage();
  await diagnostic.route('http://team.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><section id="team-workspace"><button data-tw-next></button><button data-tw-back></button><button data-tw-choice="matrix"></button></section><button class="tc-preview-pdf">Download PDF</button></body></html>'}));
  await diagnostic.goto('http://team.test/?connectionDiagnostics=1');
  await diagnostic.evaluate(()=>{window.events={};window.socket=new EventTarget();socket.readyState=1;window.jQuery=()=>({on(name,fn){events[name]=fn;return this},trigger(){}});window.Shiny={setInputValue(){},addCustomMessageHandler(){},shinyapp:{$socket:socket,isConnected:()=>true}};});
  await diagnostic.addScriptTag({path:path.resolve('www/team/js/workspace.js')});
  await diagnostic.getByRole('button',{name:'Download PDF'}).click();
  await diagnostic.evaluate(()=>socket.dispatchEvent(new CloseEvent('close',{code:1006,reason:'SECRET_MUST_NOT_BE_LOGGED',wasClean:false})));
  assert.match(await diagnostic.locator('#team-connection-diagnostics').innerText(),/pdf-click/);
  assert.match(await diagnostic.locator('#team-connection-diagnostics').innerText(),/code=1006 clean=false/);
  assert.doesNotMatch(await diagnostic.locator('#team-connection-diagnostics').innerText(),/SECRET/);
  for(let i=0;i<20;i++)await diagnostic.getByRole('button',{name:'Download PDF'}).click();
  assert.equal((await diagnostic.locator('#team-connection-diagnostics').innerText()).split('\n').length,12);
  await diagnostic.close();
  console.log('PASS: disconnected Canvas has a visible, clickable recovery notice above the overlay; reconnection hides it; opt-in diagnostics are bounded and omit server reasons');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
