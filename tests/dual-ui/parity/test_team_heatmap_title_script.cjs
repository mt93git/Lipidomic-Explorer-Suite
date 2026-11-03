// Run after UI-only fixture generation; no study values or live app required.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../../browser/ci/node_modules/playwright');
(async()=>{
 const ui=JSON.parse(fs.readFileSync(path.join(process.env.PRIVATE_PAYLOAD_DIR,'dynamic-source-ui.json')));
 const html=ui['heatmap_barchart_tab-filtered_heatmap_container'];
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]);assert.equal(scripts.length,1);
 assert.match(scripts[0],/typeof window\.updateFilteredHeatmapTabTitle/);assert.doesNotMatch(scripts[0],/querySelector|document\.|filteredHeatmapPlot/);
 // Team does not currently define the optional Classic navigation callback.
 assert.doesNotMatch(fs.readFileSync('www/team/js/app.js','utf8'),/window\.updateFilteredHeatmapTabTitle\s*=/);
 const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage();
  for(const mounted of [false,true])for(const callback of [false,true]){
   await page.setContent(mounted?'<div id="heatmap_barchart_tab-filteredHeatmapPlot"></div><div id="heatmap_barchart_tab-filteredHeatmapSDPlot"></div>':'');
   const calls=await page.evaluate(({script,callback})=>{window.titleCalls=[];if(callback)window.updateFilteredHeatmapTabTitle=x=>titleCalls.push(x);else delete window.updateFilteredHeatmapTabTitle;(0,eval)(script);return titleCalls;},{script:scripts[0],callback});
   assert.deepEqual(calls,callback?['']:[]);
  }
 }finally{await browser.close();}
 console.log('PASS: actual filtered script guarded no-op in Team; optional heading callback identical before/after sibling plot mounting');
})().catch(e=>{console.error(e);process.exitCode=1;});
