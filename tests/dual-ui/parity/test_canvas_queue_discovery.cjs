// Regression: queued plots resolve during continuous unrelated DOM mutations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const {chromium}=require('../../browser/ci/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent('<div id="analysis"></div><div id="noise"></div><section id="team-canvas-root"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><button class="tc-library-toggle"></button><div class="tc-layout"><div class="tc-board"><div class="tc-empty"></div></div><div class="tc-status"></div></div></section><script>window.Shiny={setInputValue:()=>{}}</script>');
 await page.addScriptTag({path:execFileSync('Rscript',['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'],{encoding:'utf8'}).trim()});
 await page.addScriptTag({path:path.resolve('www/team/js/canvas_catalog.js')});await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
 const id='heatmap_barchart_tab-heatmapPlot';assert.equal(await page.evaluate(id=>TeamCanvas.queuePlot(id),id),true);
 const dir=process.env.PRIVATE_PAYLOAD_DIR,html=fs.readFileSync(path.join(dir,'source-ui-heatmap_barchart_tab.html'),'utf8'),dynamic=JSON.parse(fs.readFileSync(path.join(dir,'dynamic-source-ui.json'))),png=fs.readFileSync(path.join(dir,id+'.png')).toString('base64');
 await page.evaluate(({id,html,dynamic,png})=>{window.noiseCount=0;window.noiseTimer=setInterval(()=>document.getElementById('noise').replaceChildren(document.createTextNode(String(++noiseCount))),30);document.getElementById('analysis').innerHTML=html;Object.entries(dynamic).forEach(([parent,inner])=>{const el=document.getElementById(parent);if(el)el.innerHTML=inner;});const img=new Image();img.src='data:image/png;base64,'+png;document.getElementById(id).append(img);},{id,html,dynamic,png});
 await page.waitForTimeout(1000);
 const during=await page.evaluate(id=>({state:TeamCanvas.listPlots().find(x=>x.id===id),mounted:!!document.querySelector('.tc-node #'+id),noiseCount,rendered:document.getElementById(id).querySelector('img').naturalWidth>0}),id);
 assert.equal(during.rendered,true);assert.equal(during.state.pending,false);assert.equal(during.mounted,true);assert.ok(during.noiseCount>=20);
 await page.evaluate(()=>clearInterval(noiseTimer));await page.waitForTimeout(700);
 const after=await page.evaluate(id=>({state:TeamCanvas.listPlots().find(x=>x.id===id),mounted:!!document.querySelector('.tc-node #'+id)}),id);
 assert.equal(after.mounted,true);assert.equal(after.state.pending,false);assert.equal(await page.locator('.tc-node').count(),1);assert.equal(await page.locator('[id="'+id+'"]').count(),1);
 const report={status:'PASS',scope:'isolated actual source UI; not proof of cause in current live session',behavior:'bounded250ms coalescing resolves queued add while outside-Canvas child mutations continue; no duplicate node/output after noise stops',during,after};if(process.env.QUEUE_DIAGNOSTIC_JSON)fs.writeFileSync(process.env.QUEUE_DIAGNOSTIC_JSON,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
