// Heatmap presentation dimensions only; no biological controls change.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const {chromium}=require('../../browser/ci/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent('<div id="analysis"></div><section id="team-canvas-root"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><button class="tc-library-toggle"></button><div class="tc-layout"><div class="tc-board"><div class="tc-empty"></div></div><div class="tc-status"></div></div></section><script>window.Shiny={setInputValue:()=>{}}</script>');
 await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});await page.addStyleTag({content:'*,*:before,*:after{box-sizing:border-box}'});await page.addScriptTag({path:execFileSync('Rscript',['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'],{encoding:'utf8'}).trim()});
 const dir=process.env.PRIVATE_PAYLOAD_DIR,html=fs.readFileSync(path.join(dir,'source-ui-heatmap_barchart_tab.html'),'utf8'),dynamic=JSON.parse(fs.readFileSync(path.join(dir,'dynamic-source-ui.json')));
 await page.evaluate(({html,dynamic})=>{document.getElementById('analysis').innerHTML=html;Object.entries(dynamic).forEach(([parent,inner])=>{const el=document.getElementById(parent);if(el)el.innerHTML=inner;});},{html,dynamic});
 await page.addScriptTag({path:path.resolve('www/team/js/canvas_catalog.js')});await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
 const ids=['heatmapPlot','heatmapSDPlot','filteredHeatmapPlot','filteredHeatmapSDPlot'].map(x=>'heatmap_barchart_tab-'+x);
 for(const id of ids)assert.equal(await page.evaluate(id=>TeamCanvas.addCatalogPlot(id),id),true);
 await page.waitForTimeout(350);
 const sizes=await page.evaluate(ids=>ids.map(id=>{const n=document.querySelector('.tc-node[data-plot-id="'+id+'"]'),el=document.getElementById(id);return{id,width:n.offsetWidth,height:n.offsetHeight,plotHeight:parseFloat(el.style.height),x:n.offsetLeft,y:n.offsetTop};}),ids);
 assert.ok(sizes.every(x=>x.width>=1000&&x.height>=1100&&x.plotHeight>=750));
 for(let i=0;i<sizes.length;i++)for(let j=i+1;j<sizes.length;j++){const a=sizes[i],b=sizes[j];assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'new heatmap nodes must not overlap');}
 await page.evaluate(id=>{const n=document.querySelector('.tc-node[data-plot-id="'+id+'"]');n.style.width='760px';n.style.height='500px';},ids[0]);await page.waitForTimeout(350);
 assert.ok(await page.evaluate(id=>parseFloat(document.getElementById(id).style.height)>=750,ids[0]),'short node scrolls rather than squeezing plot');
 const state=await page.evaluate(()=>TeamCanvas.serialize());assert.equal(state.nodes.find(x=>x.id===ids[0]).width,760);assert.equal(state.nodes.find(x=>x.id===ids[0]).height,500);
 await page.locator('.tc-reset').click();assert.equal(await page.locator('.tc-node').count(),0);assert.equal(await page.evaluate(id=>document.getElementById(id).style.height,ids[0]),'750px','Return restores source height');
 await page.evaluate(state=>TeamCanvas.restore(state),state);await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===4);await page.waitForTimeout(350);
 const restored=await page.evaluate(()=>TeamCanvas.serialize());for(const saved of state.nodes){const n=restored.nodes.find(x=>x.id===saved.id);assert.equal(n.width,saved.width);assert.equal(n.height,saved.height);}
 await page.locator('.tc-reset').click();
 await page.evaluate(()=>{const el=document.createElement('div');el.id='qc_pca_tab-pca2dPlot';el.className='shiny-plot-output';el.style.height='600px';document.getElementById('analysis').append(el);});await page.waitForFunction(()=>TeamCanvas.listPlots().find(x=>x.id==='qc_pca_tab-pca2dPlot')?.available);assert.equal(await page.evaluate(()=>TeamCanvas.addCatalogPlot('qc_pca_tab-pca2dPlot')),true);
 const other=await page.locator('.tc-node').evaluate(n=>({width:n.offsetWidth,height:n.offsetHeight}));assert.deepEqual(other,{width:620,height:720});
 const report={status:'PASS',scope:'isolated production wrapper geometry; actual Shiny rerender/live readability checked separately',sizes,manual_height_scroll:true,saved_dimensions_preserved:true,source_height_restored:true,other_plot_default_unchanged:other,scientific_controls_changed:false};if(process.env.HEATMAP_SIZING_JSON)fs.writeFileSync(process.env.HEATMAP_SIZING_JSON,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
