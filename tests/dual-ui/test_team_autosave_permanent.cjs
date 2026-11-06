// A deterministic records rejection (permanent:true) stops the retry loop and
// says so; transient failures still retry; a near-limit save is flagged.
const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.clock.install();
 await page.setContent('<main id="team-workspace"><input id="caption"><div id="team-autosave-status"></div></main>');
 await page.evaluate(()=>{window.sent=[];window.handlers={};window.Shiny={setInputValue:(n,v)=>sent.push({name:n,value:v}),addCustomMessageHandler:(n,f)=>{if(f.length!==1)throw new Error('arity');handlers[n]=f;}};document.body.dataset.teamAuthenticated='true';});
 await page.addScriptTag({path:path.resolve('www/team/js/autosave.js')});
 await page.evaluate(()=>{window.dispatchEvent(new Event('team-document-restored'));handlers['team-autosave-context']({writable:true,loaded:true});});
 const statusText=()=>page.locator('#team-autosave-status').innerText();
 const reply=m=>page.evaluate(m=>handlers['team-autosave-result'](Object.assign({revision:sent.at(-1).value.revision},m)),m);
 await page.locator('#caption').fill('edit 1');await page.clock.runFor(15000);assert.equal(await page.evaluate(()=>sent.length),1);
 await reply({ok:false,permanent:true,message:'Project records reached the size limit for one checkpoint (run history).'});
 assert.match(await statusText(),/Not saved · Project records too large/);
 assert.match(await page.locator('#team-autosave-status').getAttribute('title'),/size limit/);
 await page.clock.runFor(10*60000);assert.equal(await page.evaluate(()=>sent.length),1,'no retry loop after a permanent rejection');
 assert.equal(await page.evaluate(()=>TeamAutosave.state().dirty),true,'work stays unsaved, not discarded');
 // The next real edit tries once more.
 await page.locator('#caption').fill('edit 2');await page.clock.runFor(15000);assert.equal(await page.evaluate(()=>sent.length),2);
 // Transient failure: unchanged retry behaviour.
 await reply({ok:false,message:'Save timed out. Your changes remain in this tab.'});assert.match(await statusText(),/Save failed · Retrying/);
 await page.clock.runFor(15000);assert.equal(await page.evaluate(()=>sent.length),3,'transient failure still retries');
 await reply({ok:true,near_limit:true});assert.match(await statusText(),/^Saved · .* · Records near size limit$/);
 assert.match(await page.locator('#team-autosave-status').getAttribute('title'),/near the size limit/);
 await page.locator('#caption').fill('edit 3');await page.clock.runFor(15000);await reply({ok:true});
 assert.doesNotMatch(await statusText(),/near size limit/);
 assert.equal(await page.locator('#team-autosave-status').getAttribute('title'),'Your private checkpoint is verified on the server.');
 console.log('PASS permanent records rejection stops retrying and keeps work dirty; next edit retries once; transient retry unchanged; near-limit save flagged');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
