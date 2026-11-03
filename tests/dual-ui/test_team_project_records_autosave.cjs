const {chromium}=require('../browser/ci/node_modules/playwright');const path=require('path'),assert=require('assert/strict');
(async()=>{const b=await chromium.launch({headless:true});try{
 const page=await b.newPage();await page.clock.install();await page.setContent('<main id="team-workspace"><div id="team-autosave-status"></div></main>');
 await page.evaluate(()=>{window.sent=[];window.handlers={};document.body.dataset.teamAuthenticated='true';window.Shiny={addCustomMessageHandler:(n,f)=>handlers[n]=f,setInputValue:(n,v)=>sent.push({n,v})};});
 await page.addScriptTag({path:path.resolve('www/team/js/autosave.js')});await page.addScriptTag({path:path.resolve('www/team/js/project_records.js')});
 await page.evaluate(()=>{window.dispatchEvent(new Event('team-document-restored'));handlers['team-autosave-context']({writable:true,loaded:true});});
 await page.clock.runFor(61000);assert.equal(await page.evaluate(()=>sent.length),0);
 for(const kind of ['design notes','methods/run history','companion audit']){
   const before=await page.evaluate(()=>sent.length);
   await page.evaluate(()=>handlers['team-project-records-changed']({}));
   assert.equal(await page.evaluate(()=>TeamAutosave.state().dirty),true);
   await page.clock.runFor(15000);
   const saved=await page.evaluate(()=>sent.at(-1));assert.equal(saved.n,'team_library_autosave_request');
   assert.equal(await page.evaluate(()=>sent.length),before+1,kind+' alone schedules save, without Canvas events');
   assert.match(saved.v.reason,/methods and decisions/);
   await page.evaluate(revision=>handlers['team-autosave-result']({revision,ok:true}),saved.v.revision);
   assert.equal(await page.evaluate(()=>TeamAutosave.state().dirty),false);
 }
 console.log('PASS real autosave integration: records-change messages independently dirty+debounce+request private checkpoint for notes, run history and companion audit; no Canvas change or manual save required.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
const help=require('../../www/team/js/help_content.js');
for(const id of ['step1','step7','zip','export']){
 const text=JSON.stringify(help.topics[id]);assert(!/session-local|are not restored by the ZIP|Keep the methods record separately/.test(text));
}
console.log('PASS Team contextual help describes checkpoint records and optional downloads.');
