const {chromium}=require('../browser/ci/node_modules/playwright');const path=require('path'),assert=require('assert/strict'),fs=require('fs'),os=require('os');
(async()=>{const b=await chromium.launch({headless:true});try{
 const page=await b.newPage();await page.setContent(`<body data-guide-step="1"><section id="team-workspace"><button data-tw-stage="data">Data</button><button data-tw-stage="review">Review</button><button data-tw-stage="canvas">Canvas</button><button data-tw-next>Next</button><button data-tw-back>Back</button><button data-tw-choice="matrix">Matrix</button><h2 id="tw-screen-title"></h2><p id="tw-next"></p></section><input id="data_hub-import_session_file" type="file"><script>window.handlers={};window.sent=[];window.events=[];window.jqueryEvents={};window.jQuery=()=>({on:function(names,fn){names.split(' ').forEach(n=>jqueryEvents[n]=fn);return this},trigger:function(){return this}});window.Shiny={setInputValue:(id,value)=>sent.push({id,value}),addCustomMessageHandler:(name,fn)=>{if(fn.length!==1)throw Error('Shiny handler arity');handlers[name]=fn;},shinyapp:{isConnected:()=>true}};document.addEventListener('change',e=>events.push({trusted:e.isTrusted,id:e.target.id}));</script>`);
 await page.addScriptTag({path:path.resolve('www/team/js/workspace.js')});await page.evaluate(()=>handlers['team-auth-state']({authenticated:true}));
 // A programmatic change cannot authorize preparation, even with a file.
 await page.evaluate(()=>{const f=new DataTransfer();f.items.add(new File(['synthetic'],'session.zip'));const input=document.getElementById('data_hub-import_session_file');input.files=f.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.body.dataset.guideStep='3';handlers['team-review-restore-ready']({ready:true,generation:1});});
 await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>sent.filter(x=>x.id==='team_review_prepare').length),0);
 // Browser file selection is a trusted event. No R/scientific parameters are
 // submitted before server-ready + Review + idle have all been observed.
 await page.evaluate(()=>{document.body.dataset.guideStep='1';document.getElementById('data_hub-import_session_file').value='';});
 const chooser=page.waitForEvent('filechooser');await page.locator('#data_hub-import_session_file').click();const zipPath=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'team-zip-fixture-')),'session.zip');fs.writeFileSync(zipPath,'synthetic fixture, no upload endpoint');await(await chooser).setFiles(zipPath);fs.rmSync(path.dirname(zipPath),{recursive:true});
 assert.equal(await page.evaluate(()=>events.at(-1).trusted),true,'browser file chooser must exercise the real trusted change gate');
 assert.equal(await page.evaluate(()=>sent.filter(x=>x.id==='team_review_prepare').length),0);
 // Server-ready + Review sends the guarded preparation at once, even while Shiny is busy.
 await page.evaluate(()=>{document.documentElement.classList.add('shiny-busy');jqueryEvents['shiny:busy']();handlers['team-review-restore-ready']({ready:true,generation:2});document.body.dataset.guideStep='3';});
 await page.waitForFunction(()=>sent.filter(x=>x.id==='team_review_prepare').length===1);
 await page.evaluate(()=>{document.documentElement.classList.remove('shiny-busy');jqueryEvents['shiny:idle']();});await page.waitForTimeout(40);
 assert.equal(await page.evaluate(()=>sent.filter(x=>x.id==='team_review_prepare').length),1);
 const intents=await page.evaluate(()=>sent.filter(x=>x.id==='team_review_prepare'));
 assert.deepEqual(intents[0].value,{kind:'entry',source:'human',token:1});
 await page.evaluate(()=>{handlers['team-review-restore-ready']({ready:true,generation:2});jqueryEvents['shiny:idle']();});await page.waitForTimeout(40);
 assert.equal(await page.evaluate(()=>sent.filter(x=>x.id==='team_review_prepare').length),1,'repeated readiness must not duplicate preparation');
 assert.equal(await page.evaluate(()=>sent.some(x=>/normalization|minDetection|outlier|guided_qc_propose/.test(x.id))),false,'restore changes no scientific parameter or exclusion');
 console.log('PASS trusted native ZIP selection requests one existing guarded entry preparation once server-ready Review is reached (busy or idle); untrusted input/repeated readiness do nothing; no parameter/outlier writes.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
