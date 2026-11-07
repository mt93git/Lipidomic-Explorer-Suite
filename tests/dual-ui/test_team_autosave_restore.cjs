// W3B: "Save failed · Retrying" while a private checkpoint opens.
// Replays the server's staged restore with a static fixture: files first
// (loaded=true, restoring=true), the canvas last. AUTOSAVE_JS can point at an
// older autosave.js to measure the behaviour before the fix.
const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');const path=require('node:path');
const script=path.resolve(process.env.AUTOSAVE_JS||'www/team/js/autosave.js');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.clock.install({time:0});
 await page.setContent('<main id="team-workspace"><button class="ts-data-open">Open latest</button><button id="team_library_resume">Resume checkpoint</button><input id="caption"><div id="team-autosave-status"></div></main>');
 await page.evaluate(()=>{
  window.sent=[];window.handlers={};window.timeline=[];window.restoring=false;window.serverBusy=false;
  // Fake server: a save that reaches it during the restore is rejected, as the
  // canvas barrier cannot confirm a workspace that is still being restored.
  window.Shiny={addCustomMessageHandler:(n,f)=>handlers[n]=f,setInputValue:(name,value)=>{
   sent.push({name,value,at:Date.now(),restoring});
   if(name!=='team_library_autosave_request')return;
   if(serverBusy)return setTimeout(()=>handlers['team-autosave-result']({revision:value.revision,ok:false,busy:true,message:'A save is already in progress; retry after it finishes.'}),50);
   if(restoring)setTimeout(()=>handlers['team-autosave-result']({revision:value.revision,ok:false,message:'The latest canvas changes have not been confirmed. Please try again.'}),300);
  }};
  document.body.dataset.teamAuthenticated='true';
  const badge=document.getElementById('team-autosave-status');
  new MutationObserver(()=>{const t=badge.textContent;if(!timeline.length||timeline.at(-1).text!==t)timeline.push({at:Date.now(),text:t,state:badge.dataset.state});}).observe(badge,{childList:true,characterData:true,subtree:true,attributes:true});
  // Data shell: "Open latest" selects the newest checkpoint and clicks Resume.
  document.querySelector('.ts-data-open').addEventListener('click',()=>setTimeout(()=>document.getElementById('team_library_resume').click(),0));
 });
 await page.addScriptTag({path:script});
 // Signed in, writable project, nothing loaded yet.
 await page.evaluate(()=>handlers['team-autosave-context']({writable:true,loaded:false,restoring:false}));
 await page.locator('.ts-data-open').click();
 await page.clock.runFor(200);
 // Stage 1: checkpoint files are loaded; metadata, inputs and canvas follow.
 await page.evaluate(()=>{restoring=true;handlers['team-autosave-context']({writable:true,loaded:true,restoring:true});});
 // Data and Review load slowly on large checkpoints (simulated 25 s).
 await page.clock.runFor(25000);
 const duringRestore=await page.evaluate(()=>sent.filter(s=>s.name==='team_library_autosave_request').length);
 const badgeDuring=await page.locator('#team-autosave-status').innerText();
 // Stage 4: restore flag cleared, canvas restore pending, then hydrated.
 await page.evaluate(()=>{restoring=false;handlers['team-canvas-restore-status']({status:'pending',token:'restore-1'});handlers['team-autosave-context']({writable:true,loaded:true,restoring:false});});
 await page.clock.runFor(500);
 await page.evaluate(()=>{window.dispatchEvent(new Event('team-document-restored'));window.dispatchEvent(new CustomEvent('team-canvas-restore-status',{detail:{status:'pending',token:'restore-1'}}));});
 await page.clock.runFor(1500);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('team-canvas-restore-status',{detail:{status:'success',token:'restore-1'}})));
 await page.clock.runFor(60000);
 const timeline=await page.evaluate(()=>timeline);
 const requests=await page.evaluate(()=>sent.filter(s=>s.name==='team_library_autosave_request').length);
 console.log('Autosave requests during restore:',duringRestore,'· in the first 87 s:',requests);
 console.log('Badge timeline (ms after Open latest):');for(const t of timeline)console.log(' ',String(t.at).padStart(6),t.state||'-',JSON.stringify(t.text));
 assert.equal(timeline.some(t=>/Save failed/.test(t.text)),false,'restore must not show Save failed');
 assert.equal(duringRestore,0,'no autosave request before the restore finishes');
 assert.doesNotMatch(badgeDuring,/failed/i);
 assert.equal(requests,0,'opening a checkpoint alone must not save');
 assert.equal(await page.locator('#team-autosave-status').innerText(),'Saved workspace restored');
 // A busy server is not a failure: show Saving… and retry shortly.
 await page.locator('#caption').fill('A real edit');await page.clock.runFor(15000);
 assert.equal(await page.evaluate(()=>sent.filter(s=>s.name==='team_library_autosave_request').length),1);
 await page.evaluate(()=>{serverBusy=true;});
 // The first request was sent before the busy flag: answer it as busy.
 await page.evaluate(()=>handlers['team-autosave-result']({revision:sent.at(-1).value.revision,ok:false,busy:true,message:'A save is already in progress; retry after it finishes.'}));
 assert.equal(await page.locator('#team-autosave-status').innerText(),'Saving…');
 await page.clock.runFor(5100);
 assert.equal(await page.evaluate(()=>sent.filter(s=>s.name==='team_library_autosave_request').length),2,'busy reply retries after 5 s');
 assert.equal(await page.locator('#team-autosave-status').innerText(),'Saving…');
 // A real failure still shows Save failed and still retries.
 await page.evaluate(()=>{serverBusy=false;});await page.clock.runFor(5000);
 const real=await page.evaluate(()=>sent.at(-1).value.revision);
 await page.evaluate(r=>handlers['team-autosave-result']({revision:r,ok:false,message:'Checkpoint upload failed.'}),real);
 assert.equal(await page.locator('#team-autosave-status').innerText(),'Save failed · Retrying');
 const beforeRetry=await page.evaluate(()=>sent.length);await page.clock.runFor(15000);
 assert.equal(await page.evaluate(()=>sent.length),beforeRetry+1,'real failure retries after 15 s');
 await page.evaluate(()=>handlers['team-autosave-result']({revision:sent.at(-1).value.revision,ok:true}));
 assert.match(await page.locator('#team-autosave-status').innerText(),/^Saved · /);
 // A restore that stops with an error (no canvas, no restored event) resumes
 // normal autosave for real edits after the 30 s fallback.
 const other=await browser.newPage();await other.clock.install({time:0});
 await other.setContent('<main id="team-workspace"><input id="edit"><div id="team-autosave-status"></div></main>');
 await other.evaluate(()=>{window.sent=[];window.handlers={};window.Shiny={setInputValue:(n,v)=>sent.push({name:n,value:v}),addCustomMessageHandler:(n,f)=>handlers[n]=f};document.body.dataset.teamAuthenticated='true';});
 await other.addScriptTag({path:script});
 await other.evaluate(()=>{handlers['team-autosave-context']({writable:true,loaded:false});handlers['team-autosave-context']({writable:true,loaded:true,restoring:true});handlers['team-autosave-context']({writable:true,loaded:true,restoring:false});});
 await other.locator('#edit').fill('edit after failed restore');await other.clock.runFor(29000);
 assert.equal(await other.evaluate(()=>sent.length),0,'held while the restore may still finish');
 await other.clock.runFor(16000);
 assert.equal(await other.evaluate(()=>sent.length),1,'failed restore cannot block later edits forever');
 // Round 2 (Sol): the gate message says restoring, then the restore stops with an error and no
 // later context ever arrives. Autosave must not stay paused forever: the watchdog resumes it.
 const stuck=await browser.newPage();await stuck.clock.install({time:0});
 await stuck.setContent('<main id="team-workspace"><input id="edit"><div id="team-autosave-status"></div></main>');
 await stuck.evaluate(()=>{window.sent=[];window.handlers={};window.Shiny={setInputValue:(n,v)=>sent.push({name:n,value:v}),addCustomMessageHandler:(n,f)=>handlers[n]=f};document.body.dataset.teamAuthenticated='true';});
 await stuck.addScriptTag({path:script});
 await stuck.evaluate(()=>{handlers['team-autosave-context']({writable:true,loaded:false});if(handlers['team-autosave-restoring'])handlers['team-autosave-restoring']({restoring:true});handlers['team-autosave-context']({writable:true,loaded:true,restoring:true});});
 await stuck.locator('#edit').fill('edit after a restore that never ended');await stuck.clock.runFor(170000);
 assert.equal(await stuck.evaluate(()=>sent.length),0,'held while the restore may still finish');
 await stuck.clock.runFor(30000);
 assert.equal(await stuck.evaluate(()=>sent.length),1,'a restore that never reports its end cannot pause autosave forever');
 // A restore that fails during metadata hydration, then the user uploads a
 // replacement file while nothing is loaded (pendingFile), then the new files
 // load while the checkpoint is still "opening". The canvas restore never comes:
 // the 30 s fallback must drain the queued upload and save it, and leaving the
 // tab must warn while the upload is queued.
 const up=await browser.newPage();await up.clock.install({time:0});
 await up.setContent('<main id="team-workspace"><input id="upload" type="file"><div id="team-autosave-status"></div></main>');
 await up.evaluate(()=>{window.sent=[];window.handlers={};window.Shiny={setInputValue:(n,v)=>sent.push({name:n,value:v,at:Date.now()}),addCustomMessageHandler:(n,f)=>handlers[n]=f};document.body.dataset.teamAuthenticated='true';
  window.unloadGuarded=()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;};});
 await up.addScriptTag({path:script});
 const saves=()=>up.evaluate(()=>sent.filter(s=>s.name==='team_library_autosave_request').length);
 await up.evaluate(()=>{handlers['team-autosave-context']({writable:true,loaded:false,restoring:false});handlers['team-autosave-context']({writable:true,loaded:true,restoring:true});});
 // Metadata hydration fails: the server drops back to the upload path (loaded=false).
 await up.evaluate(()=>handlers['team-autosave-context']({writable:true,loaded:false,restoring:false}));
 await up.clock.runFor(1000);
 // The user picks a replacement file the way the page does (a trusted change on input[type=file]).
 const isTrusted=up.evaluate(()=>new Promise(r=>document.getElementById('upload').addEventListener('change',e=>r(e.isTrusted),{once:true})));
 // A path (not a buffer): Chromium sets it natively, so input/change are trusted as from the file picker.
 const fs=require('node:fs'),os=require('node:os');const upload=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tw-upload-')),'replacement.csv');fs.writeFileSync(upload,'lipid,s1\nPC 34:1,1\n');
 await up.locator('#upload').setInputFiles(upload);
 assert.equal(await isTrusted,true,'the file choice reaches autosave as a trusted change event');
 const guardedQueued=await up.evaluate(()=>unloadGuarded());
 await up.clock.runFor(1000);
 // The replacement is uploaded and loaded; the checkpoint is still opening (no canvas restore).
 await up.evaluate(()=>handlers['team-autosave-context']({writable:true,loaded:true,restoring:false}));
 const guardedLoaded=await up.evaluate(()=>unloadGuarded());
 await up.clock.runFor(26000); // 28 s since the fallback was armed
 const savesBeforeFallback=await saves();
 await up.clock.runFor(3500); // fallback (30 s) fires
 const guardedAfterFallback=await up.evaluate(()=>unloadGuarded());
 await up.clock.runFor(15500); // 15 s debounce
 const uploadSaves=await saves();
 const uploadReason=await up.evaluate(()=>(sent.find(s=>s.name==='team_library_autosave_request')||{value:{}}).value.reason);
 console.log('Queued upload while opening:',JSON.stringify({guardedQueued,guardedLoaded,savesBeforeFallback,guardedAfterFallback,uploadSaves,uploadReason,badge:await up.locator('#team-autosave-status').innerText()}));
 assert.equal(guardedQueued,true,'leaving the tab warns while an upload is queued during opening');
 assert.equal(guardedLoaded,true,'leaving the tab still warns once the queued upload is loaded but not saved');
 assert.equal(savesBeforeFallback,0,'held while the checkpoint may still finish opening');
 assert.equal(guardedAfterFallback,true,'leaving the tab warns once the fallback has queued the save');
 assert.equal(uploadSaves,1,'the upload queued while opening is saved after the fallback');
 console.log('PASS: no false Save failed while opening a checkpoint; busy is Saving…; real failure still shows Save failed and retries; an upload queued while opening is saved after the fallback');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
