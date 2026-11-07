// Generate payloads with the real Team R renderers, then exercise the canvas.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'team-dashboard-payload-'));
 const jquery=execFileSync('Rscript',['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'],{encoding:'utf8'}).trim();
 const plotly=execFileSync('Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();
 let browser;
 try {
  execFileSync('Rscript',['--vanilla','tests/dual-ui/fixture_team_canvas_dashboard_payload.R',dir],{stdio:'pipe'});
  browser=await chromium.launch({headless:true});
  for (const name of ['dist','comp','heat']) {
   const first=JSON.parse(fs.readFileSync(path.join(dir,name+'-500.json'))), second=JSON.parse(fs.readFileSync(path.join(dir,name+'-900.json')));
   if(name==='heat'){assert.deepEqual(first.x.layout.xaxis,second.x.layout.xaxis);assert.equal(first.x.layout.meta?.teamCanvasSampleLabels,undefined);assert.equal(first.x.data[0].x.length,2);}else{assert.notEqual(first.x.layout.xaxis.tickvals.length,second.x.layout.xaxis.tickvals.length,'R renderer must generate different tick densities');assert.deepEqual(first.x.layout.meta.teamCanvasSampleLabels,second.x.layout.meta.teamCanvasSampleLabels);}
   const page=await browser.newPage();page.setDefaultTimeout(6000);
   await page.setContent(`<div class="rd-card"><div class="rd-card-head"><h3>${name}</h3></div><div id="results_dashboard-plot_${name}" class="plotly html-widget-output" style="height:420px"></div></div><section id="team-canvas-root"><button class="tc-library-toggle"></button><div class="tc-layout"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><div class="tc-board"><div class="tc-empty"></div></div><div class="tc-status"></div></div></section>`);
   await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});await page.addScriptTag({path:jquery});await page.addScriptTag({path:plotly});
   await page.evaluate(({name,first})=>Plotly.newPlot('results_dashboard-plot_'+name,first.x.data,first.x.layout),{name,first});
   if(name==='comp'){
    assert(first.x.data.every(t=>t.text && t.hovertemplate && [].concat(t.textposition).every(v=>v==='none')), 'composition keeps hover metadata without visible bar text');
    assert.equal(await page.locator('#results_dashboard-plot_comp .bartext').count(),0,'composition must not render hover metadata as bar labels');
    const hover=await page.evaluate(()=>{const gd=document.getElementById('results_dashboard-plot_comp');Plotly.Fx.hover(gd,[{curveNumber:0,pointNumber:0}]);return document.querySelectorAll('.hoverlayer .hovertext').length;});
    assert(hover>0,'composition hover remains interactive');
   }
   await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});await page.evaluate(name=>TeamCanvas.addPlot('results_dashboard-plot_'+name),name);
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}})));
   async function emit(payload){await page.evaluate(async({name,payload})=>{const gd=document.getElementById('results_dashboard-plot_'+name);jQuery(gd).trigger({type:'shiny:value',value:payload});await Plotly.react(gd,payload.x.data,payload.x.layout);},{name,payload});await page.waitForTimeout(500);}
   await emit(first);await page.locator('.tc-node-head button',{hasText:'Finish plot'}).click();await page.waitForSelector('.tc-snapshot img');
   const captured=await page.locator('.tc-snapshot img').getAttribute('src');
   if(name==='comp'){const svg=decodeURIComponent(captured.slice(captured.indexOf(',')+1));assert(!svg.includes('class=\"bartext'), 'composition snapshot must not contain bar labels');}
   await emit(second);assert.equal(await page.locator('.tc-node.tc-stale').count(),0,name+' size-only redraw must preserve snapshot');
   assert.equal(await page.locator('.tc-snapshot img').getAttribute('src'),captured);
   const wrongTick=structuredClone(second);wrongTick.x.layout.xaxis.ticktext[0]+=' changed';
   await emit(wrongTick);assert.equal(await page.locator('.tc-node.tc-stale').count(),1,name+' incorrect tick label must invalidate');
   await page.locator('.tc-node-head button',{hasText:'Edit'}).click();await emit(second);
   await page.locator('.tc-node-head button',{hasText:'Finish plot'}).click();await page.waitForSelector('.tc-snapshot img');
   const bad=structuredClone(second);if(name==='heat')bad.x.data[0].z[0][0]+=0.2;else bad.x.layout.meta.teamCanvasSampleLabels.labels[0]+=' changed';
   await emit(bad);assert.equal(await page.locator('.tc-node.tc-stale').count(),1,name+' changed full label map must invalidate');
   await page.close();
  }
  console.log('PASS: actual R dashboard payloads preserve width-only redraws; changed sample/group labels or group means invalidate snapshots');
 } finally {if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
