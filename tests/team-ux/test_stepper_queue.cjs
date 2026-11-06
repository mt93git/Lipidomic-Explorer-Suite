// A step clicked during a Shiny busy cycle is queued, shown as pending and sent
// once when the app is idle. Esc and another step cancel it; a step that is
// genuinely unavailable is never queued. Synthetic fixture only.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD,shot=process.env.TEAM_UX_SHOTS;
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
// The app runs short real busy/idle cycles of its own. While a test window is
// forced, the server's busy messages are held back so only the test decides.
const HOLD=()=>{const app=Shiny.shinyapp,dispatch=app.dispatchMessage;app.dispatchMessage=function(data){
 if(window.__holdBusy&&typeof data==='string'&&data.indexOf('"busy"')>=0){const msg=JSON.parse(data);if('busy' in msg){delete msg.busy;if(!Object.keys(msg).length)return Promise.resolve();data=JSON.stringify(msg);}}
 return dispatch.call(this,data);};};
const busy=p=>p.evaluate(()=>{window.__holdBusy=true;document.documentElement.classList.add('shiny-busy');jQuery(document).trigger('shiny:busy');});
const idle=p=>p.evaluate(()=>{document.documentElement.classList.remove('shiny-busy');jQuery(document).trigger('shiny:idle');window.__holdBusy=false;});
const navs=p=>p.evaluate(()=>window.__navs.slice());
const src=(p,stage)=>p.evaluate(s=>{const b=document.querySelector(`#team-workspace [data-tw-stage="${s}"]`);return {disabled:b.disabled,lock:b.dataset.twBusyLock||'',queued:b.dataset.twQueued||'',busy:b.getAttribute('aria-busy'),title:b.title,label:b.getAttribute('aria-label')||'',current:b.getAttribute('aria-current')};},stage);
const mirror=(p,stage)=>p.evaluate(s=>{const b=document.querySelector(`.ts-steps .ts-step[data-stage="${s}"]`);return {disabled:b.disabled,queued:b.dataset.twQueued||'',busy:b.getAttribute('aria-busy'),title:b.title,label:b.getAttribute('aria-label')||''};},stage);
// A real pointer click at the visible top-bar step, as a person would click it.
async function clickStep(p,stage){const box=await p.locator(`.ts-steps .ts-step[data-stage="${stage}"]`).boundingBox();assert.ok(box,'step '+stage+' is visible');await p.mouse.click(box.x+box.width/2,box.y+box.height/2);}
(async()=>{const b=await chromium.launch({headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
 await p.evaluate(HOLD);await p.evaluate(()=>{window.__navs=[];const set=Shiny.setInputValue.bind(Shiny);Shiny.setInputValue=function(id,value,opts){if(id==='team_workspace_nav')window.__navs.push(value);return set(id,value,opts);};});
 await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
 await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
 await p.waitForFunction(()=>window.TeamWorkspace?.state().authenticated&&!document.documentElement.classList.contains('shiny-busy'),null,{timeout:120000});

 // 1. Canvas without prepared data is genuinely unavailable: a busy-time click is not queued.
 await busy(p);let c=await src(p,'canvas');
 assert.equal(c.disabled,true);assert.equal(c.lock,'','an unavailable Canvas is not marked as busy-locked');
 await clickStep(p,'canvas');c=await src(p,'canvas');assert.equal(c.queued,'','an unavailable Canvas is not queued');
 await idle(p);await p.waitForTimeout(400);c=await src(p,'canvas');
 assert.equal(c.disabled,true);assert.match(c.label,/Open a saved analysis|Prepare the current data in Review/,'the existing reason stays');
 assert.equal((await navs(p)).length,0,'no navigation was sent for an unavailable Canvas');console.log('PASS unavailable Canvas is not queued and keeps its reason');

 // Resume the seeded fixture checkpoint and wait for an idle, prepared Review.
 await p.evaluate(name=>{if(!name)return;const s=document.querySelector('#team_library_checkpoint');const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));},process.env.TEAM_CHECKPOINT||'');
 await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.locator('#team_library_resume').click();
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled&&document.body.dataset.teamStage==='review';},null,{timeout:300000});
 await p.evaluate(()=>{window.__navs.length=0;});

 // 2. Busy click on Canvas: pending is visible, nothing is sent until idle, then exactly once.
 await busy(p);c=await src(p,'canvas');assert.equal(c.disabled,true);assert.equal(c.lock,'true','Canvas is locked only by the busy cycle');
 await clickStep(p,'canvas');
 c=await src(p,'canvas');const m=await mirror(p,'canvas');
 assert.equal(c.queued,'true');assert.equal(c.busy,'true');assert.equal(c.title,'Opening Canvas when the update finishes.');
 assert.equal(m.queued,'true','the top-bar step shows the pending state');assert.equal(m.busy,'true');assert.equal(m.title,'Opening Canvas when the update finishes.');assert.match(m.label,/Opening Canvas when the update finishes/);
 assert.equal(await p.locator('#tw-next').textContent(),'Opening Canvas when the update finishes.');
 const tip=await p.evaluate(()=>getComputedStyle(document.querySelector('.ts-step[data-stage="canvas"]'),'::after').content);assert.match(tip,/Opening Canvas/,'the pending status is visible beside the step');
 if(shot)await p.screenshot({path:path.join(shot,'stepper-queue-pending-1440.png'),clip:{x:0,y:0,width:1440,height:260}});
 await clickStep(p,'canvas');await p.waitForTimeout(500);
 assert.equal((await navs(p)).length,0,'nothing is sent while busy (a second click is not a second request)');
 await idle(p);
 await p.waitForFunction(()=>document.querySelector('[data-tw-stage=canvas]')?.getAttribute('aria-current')==='step',null,{timeout:120000});
 await p.waitForFunction(()=>!document.documentElement.classList.contains('shiny-busy'),null,{timeout:120000});await p.waitForTimeout(1500);
 let sent=await navs(p);assert.equal(sent.length,1,'Canvas navigation sent exactly once: '+JSON.stringify(sent));assert.equal(Number(sent[0].step),5);
 c=await src(p,'canvas');assert.equal(c.queued,'');assert.equal(c.busy,null);console.log('PASS busy click on Canvas shows pending and opens Canvas exactly once');
 await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false,null,{timeout:300000});
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="review"]');return b&&!b.disabled;},null,{timeout:120000});

 // 3. Esc cancels a queued step.
 await p.evaluate(()=>{window.__navs.length=0;});await busy(p);await clickStep(p,'review');
 assert.equal((await src(p,'review')).queued,'true');await p.keyboard.press('Escape');
 assert.equal((await src(p,'review')).queued,'');assert.equal((await mirror(p,'review')).queued,'');
 await idle(p);await p.waitForTimeout(800);assert.equal((await navs(p)).length,0,'Esc: nothing sent');
 assert.equal(await p.evaluate(()=>document.body.dataset.teamStage),'canvas');console.log('PASS Esc cancels the pending step');

 // 4. Clicking another step replaces it; the first is never sent.
 await busy(p);await clickStep(p,'review');assert.equal((await src(p,'review')).queued,'true');
 await clickStep(p,'data');assert.equal((await src(p,'review')).queued,'','another step cancels the pending one');assert.equal((await src(p,'review')).busy,null);
 assert.equal((await src(p,'data')).queued,'true','the newly clicked step is the pending one');
 await p.keyboard.press('Escape');await idle(p);await p.waitForTimeout(800);
 assert.equal((await navs(p)).length,0,'another step: the first request is not sent');assert.equal(await p.evaluate(()=>document.body.dataset.teamStage),'canvas');
 console.log('PASS clicking another step cancels the pending one');

 // 5. Keyboard: Enter on the focused step during a busy cycle queues it the same way.
 // The app's own busy cycles can briefly disable the step: focus it when enabled.
 await p.waitForFunction(()=>{const b=document.querySelector('.ts-steps .ts-step[data-stage="review"]');b.focus();return document.activeElement===b;},null,{timeout:30000});await busy(p);
 assert.equal((await src(p,'review')).disabled,true);await p.keyboard.press('Enter');
 assert.equal((await src(p,'review')).queued,'true','Enter right after the lock queues the step');await p.keyboard.press('Escape');assert.equal((await src(p,'review')).queued,'');
 // Chrome then blurs the disabled button to <body>; Enter still reaches the step.
 await p.waitForFunction(()=>document.activeElement===document.body,null,{timeout:5000});await p.keyboard.press('Enter');
assert.equal((await src(p,'review')).queued,'true','Enter on the focused step queues it');await p.waitForTimeout(300);assert.equal((await navs(p)).length,0);
 await idle(p);await p.waitForFunction(()=>document.body.dataset.teamStage==='review',null,{timeout:120000});
 await p.waitForFunction(()=>!document.documentElement.classList.contains('shiny-busy'),null,{timeout:120000});await p.waitForTimeout(1500);
 sent=await navs(p);assert.equal(sent.length,1,'keyboard: exactly once '+JSON.stringify(sent));assert.equal(Number(sent[0].step),3);console.log('PASS Enter on a busy step queues and opens it once');

 assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error("FAIL",e.message,e.stack.split("\n").slice(1,3).join(" "));process.exit(1);});
