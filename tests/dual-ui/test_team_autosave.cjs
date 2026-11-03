const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.clock.install();
 await page.setContent('<main id="team-workspace"><button data-tw-logout>Sign out</button><input id="caption"><div id="team-autosave-status"></div></main>');
 await page.evaluate(()=>{window.sent=[];window.handlers={};window.logoutClicks=0;window.Shiny={setInputValue:(name,value)=>sent.push({name,value}),addCustomMessageHandler:(n,f)=>handlers[n]=f};document.body.dataset.teamAuthenticated='true';document.querySelector('button').addEventListener('click',()=>logoutClicks++);});
 await page.addScriptTag({path:path.resolve('www/team/js/autosave.js')});
 await page.evaluate(()=>{window.dispatchEvent(new Event('team-document-restored'));handlers['team-autosave-context']({writable:true,loaded:true});});
 await page.clock.runFor(61000);assert.equal(await page.evaluate(()=>sent.length),0,'restore alone must not save');
 await page.locator('#caption').fill('A real edit');await page.clock.runFor(14900);assert.equal(await page.evaluate(()=>sent.length),0);
 await page.clock.runFor(100);assert.equal(await page.evaluate(()=>sent.length),1,'debounce sends one request');
 let rev=await page.evaluate(()=>sent.at(-1).value.revision);assert.equal(typeof rev,'string');
 await page.locator('#caption').fill('Edit while saving');
 await page.evaluate(r=>handlers['team-autosave-result']({revision:r,ok:true}),rev);
 assert.equal(await page.evaluate(()=>TeamAutosave.state().dirty),true,'old success cannot clear neweredit');
 await page.clock.runFor(1000);rev=await page.evaluate(()=>sent.at(-1).value.revision);
 await page.evaluate(()=>handlers['team-autosave-result']({revision:'stale',ok:true}));assert.equal(await page.evaluate(()=>TeamAutosave.state().inflight),true);
 await page.evaluate(r=>handlers['team-autosave-result']({revision:r,ok:false}),rev);assert.match(await page.locator('#team-autosave-status').innerText(),/failed/);
 await page.clock.runFor(15000);assert.equal(await page.evaluate(()=>sent.length),3);rev=await page.evaluate(()=>sent.at(-1).value.revision);
 await page.evaluate(r=>handlers['team-autosave-result']({revision:r,ok:true}),rev);assert.equal(await page.evaluate(()=>TeamAutosave.state().dirty),false);
 await page.locator('#caption').fill('Signout pending');await page.locator('button').click();assert.equal(await page.evaluate(()=>logoutClicks),0);
 rev=await page.evaluate(()=>sent.at(-1).value.revision);await page.locator('button').click();assert.equal(await page.evaluate(()=>logoutClicks),0,'inflight cannot bypass logout guard');
 await page.evaluate(r=>handlers['team-autosave-result']({revision:r,ok:false}),rev);await page.clock.runFor(5000);assert.equal(await page.evaluate(()=>logoutClicks),0,'failure cannot signout');
 const dismissed=page.waitForEvent('dialog').then(d=>d.dismiss());await page.clock.runFor(5100);await dismissed;assert.equal(await page.evaluate(()=>logoutClicks),0);
 await page.clock.runFor(16000);rev=await page.evaluate(()=>sent.at(-1).value.revision);await page.evaluate(r=>handlers['team-autosave-result']({revision:r,ok:true}),rev);
 await page.locator('button').click();assert.equal(await page.evaluate(()=>logoutClicks),1);
 await page.evaluate(()=>handlers['team-autosave-context']({loaded:true,writable:false}));const before=await page.evaluate(()=>sent.length);await page.locator('#caption').fill('Viewer edit');await page.clock.runFor(61000);assert.equal(await page.evaluate(()=>sent.length),before);
 // A restore invalidates the old in-flight request, even if a later edit has
 // the same local revision. Old replies must not clear the new document.
 await page.evaluate(()=>handlers['team-autosave-context']({loaded:true,writable:true}));
 await page.locator('#caption').fill('Before restore');await page.clock.runFor(15000);
 const old=await page.evaluate(()=>sent.at(-1).value.revision);
 await page.evaluate(()=>{window.dispatchEvent(new Event('team-document-restored'));handlers['team-autosave-context']({loaded:true,writable:true});});
 await page.locator('#caption').fill('After restore');await page.clock.runFor(15000);
 const fresh=await page.evaluate(()=>sent.at(-1).value.revision);assert.notEqual(fresh,old);
 await page.evaluate(r=>handlers['team-autosave-result']({revision:r,ok:true}),old);
 assert.equal(await page.evaluate(()=>TeamAutosave.state().dirty),true);
 await page.evaluate(r=>handlers['team-autosave-result']({revision:r,ok:true}),fresh);
 // A temporarily unavailable writable/loaded context must re-arm dirty work.
 await page.locator('#caption').fill('Access interruption');
 await page.evaluate(()=>handlers['team-autosave-context']({loaded:true,writable:false}));
 const paused=await page.evaluate(()=>sent.length);await page.clock.runFor(61000);
 assert.equal(await page.evaluate(()=>sent.length),paused);
 await page.evaluate(()=>handlers['team-autosave-context']({loaded:true,writable:true}));await page.clock.runFor(15000);
 assert.equal(await page.evaluate(()=>sent.length),paused+1);
 await page.evaluate(()=>handlers['team-autosave-result']({revision:sent.at(-1).value.revision,ok:true}));
 // Delayed canvas work remains a change after the original interaction window.
 await page.locator('#caption').click();await page.clock.runFor(6000);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('team-canvas-changed',{detail:{epoch:1}})));
 assert.equal(await page.evaluate(()=>TeamAutosave.state().dirty),true);
 await page.clock.runFor(15000);await page.evaluate(()=>handlers['team-autosave-result']({revision:sent.at(-1).value.revision,ok:true}));
 // Saving must never synthesize a file upload change.
 await page.evaluate(()=>{const f=document.createElement('input');f.type='file';f.id='file';document.querySelector('main').append(f);window.fileChanges=0;f.addEventListener('change',()=>fileChanges++);f.focus();TeamAutosave.schedule('test');TeamAutosave.requestSave('test');});
 assert.equal(await page.evaluate(()=>fileChanges),0);
 // Server emits preparation and context through independent observers. Exercise
 // preparation before loaded context after restoring, including a new file.
 const other=await browser.newPage();await other.clock.install();
 await other.setContent('<main id="team-workspace"><button id="team_library_resume">Resume</button><input id="metadata" type="file"><input id="edit"><div id="team-autosave-status"></div></main>');
 await other.evaluate(()=>{window.sent=[];window.handlers={};window.Shiny={setInputValue:(n,v)=>sent.push({name:n,value:v}),addCustomMessageHandler:(n,f)=>handlers[n]=f};document.body.dataset.teamAuthenticated='true';});
 await other.addScriptTag({path:path.resolve('www/team/js/autosave.js')});
 await other.evaluate(()=>{window.dispatchEvent(new Event('team-document-restored'));handlers['team-autosave-context']({writable:true,loaded:false});});
 await other.locator('#edit').click();
 await other.evaluate(()=>window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}})));
 await other.locator('#metadata').setInputFiles({name:'metadata.csv',mimeType:'text/csv',buffer:Buffer.from('id,group\nS1,A')});
 await other.evaluate(()=>window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:2}})));
 assert.equal(await other.evaluate(()=>TeamAutosave.state().dirty),false);
 await other.evaluate(()=>handlers['team-autosave-context']({writable:true,loaded:true}));await other.clock.runFor(15000);
 assert.equal(await other.evaluate(()=>sent.length),1,'file and preparation preceding loaded context must be saved');
 await other.evaluate(()=>handlers['team-autosave-result']({revision:sent.at(-1).value.revision,ok:true}));
 // A failed resume has no restored event: the existing dirty timer must survive.
 await other.locator('#edit').fill('unsaved');await other.locator('#team_library_resume').click();
 await other.clock.runFor(15000);assert.equal(await other.evaluate(()=>sent.length),2,'failed resume cannot suspend pending save');
 await other.evaluate(()=>handlers['team-autosave-result']({revision:sent.at(-1).value.revision,ok:true}));
 // Restored workspace: confirmed scientific change becomes dirty only when
 // the subsequent prepared revision arrives, without a trusted slider event.
 await other.evaluate(()=>{window.dispatchEvent(new Event('team-document-restored'));window.dispatchEvent(new Event('team-confirmed-scientific-edit'));window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:42}}));});
 assert.equal(await other.evaluate(()=>TeamAutosave.state().dirty),true);
 const beforeScientific=await other.evaluate(()=>sent.length);await other.clock.runFor(15000);
 assert.equal(await other.evaluate(()=>sent.length),beforeScientific+1);
 // The server locks autosave before Canvas hydration. A failed or stale
 // receipt cannot turn an incomplete document into a saved checkpoint.
 await other.evaluate(()=>{handlers['team-autosave-result']({revision:sent.at(-1).value.revision,ok:true});handlers['team-canvas-restore-status']({status:'pending',token:'restore-1'});});
 const beforeRestore=await other.evaluate(()=>sent.length);
 await other.locator('#edit').fill('Edit while restoring');await other.clock.runFor(61000);
 await other.evaluate(()=>window.dispatchEvent(new CustomEvent('team-canvas-restore-status',{detail:{status:'failed',token:'restore-1'}})));
 await other.clock.runFor(61000);assert.equal(await other.evaluate(()=>sent.length),beforeRestore,'failed restore cannot autosave');
 await other.evaluate(()=>window.dispatchEvent(new CustomEvent('team-canvas-restore-status',{detail:{status:'success',token:'stale'}})));
 await other.clock.runFor(16000);assert.equal(await other.evaluate(()=>sent.length),beforeRestore,'stale receipt cannot unlock autosave');
 await other.evaluate(()=>{handlers['team-canvas-restore-status']({status:'pending',token:'restore-2'});window.dispatchEvent(new CustomEvent('team-canvas-restore-status',{detail:{status:'success',token:'restore-2'}}));});
 await other.clock.runFor(15000);assert.equal(await other.evaluate(()=>sent.length),beforeRestore+1,'completed restore resumes autosave');
 await other.close();
 console.log('PASS: restore idle, actual input debounce, string protocol, in-flight edits, stale reply, failure/retry, blocked logout, cancel discard, saved logout, viewer');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
