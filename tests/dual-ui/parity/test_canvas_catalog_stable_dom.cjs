// Continuous unrelated discovery must not replace an unchanged catalog button.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const {chromium}=require('../../browser/ci/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent('<div id="analysis"></div><div id="noise"></div><section id="team-canvas-root"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><button class="tc-library-toggle"></button><div class="tc-layout"><div class="tc-board"><div class="tc-empty"></div></div><div class="tc-status"></div></div></section><script>window.Shiny={setInputValue:()=>{}}</script>');
 await page.addScriptTag({path:execFileSync('Rscript',['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'],{encoding:'utf8'}).trim()});await page.addScriptTag({path:path.resolve('www/team/js/canvas_catalog.js')});await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
 const id='heatmap_barchart_tab-heatmapPlot';
 await page.evaluate(id=>{window.heldButton=document.querySelector('[data-catalog-id="'+id+'"] button');heldButton.focus();window.noiseCount=0;window.noiseTimer=setInterval(()=>document.getElementById('noise').replaceChildren(document.createTextNode(String(++noiseCount))),30);},id);
 await page.waitForTimeout(1100);
 const observed=await page.evaluate(id=>({same:heldButton===document.querySelector('[data-catalog-id="'+id+'"] button'),connected:heldButton.isConnected,focused:document.activeElement===heldButton,noiseCount}),id);
 const stable=!process.env.EXPECT_DOM_REPLACEMENT;assert.equal(observed.same,stable);assert.equal(observed.connected,stable);assert.equal(observed.focused,stable);assert.ok(observed.noiseCount>=20);
 let transitions=null;
 if(stable){
  await page.evaluate(id=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));const el=document.createElement('div');el.id=id;el.className='shiny-plot-output';el.innerHTML='<img src="data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><text x="10" y="30">Mechanical fixture</text></svg>')+'">';document.getElementById('analysis').append(el);},id);
  const card=page.locator('[data-catalog-id="'+id+'"]');
  await page.waitForFunction(id=>document.querySelector('[data-catalog-id="'+id+'"] .tc-catalog-state')?.textContent==='Ready to add',id);
  assert.equal(await page.evaluate(id=>heldButton===document.querySelector('[data-catalog-id="'+id+'"] button'),id),false,'new readiness must repaint');
  await page.evaluate(id=>{window.readyButton=document.querySelector('[data-catalog-id="'+id+'"] button');readyButton.focus();const el=document.getElementById(id);el.style.width='777px';jQuery(el).trigger('plotly_autosize');const fresh=el.cloneNode(true);fresh.dataset.fresh='yes';el.replaceWith(fresh);},id);
  await page.waitForTimeout(750);
  assert.equal(await page.evaluate(id=>readyButton===document.querySelector('[data-catalog-id="'+id+'"] button')&&document.activeElement===readyButton,id),true,'same visible state and replacement output preserve action identity/focus');
  await card.getByRole('button',{name:'Add',exact:true}).click();
  assert.equal(await page.locator('.tc-node [data-fresh="yes"]').count(),1,'retained action must use current replacement record');
  await page.waitForFunction(id=>document.querySelector('[data-catalog-id="'+id+'"] button')?.textContent==='Added',id);
  await page.evaluate(id=>{window.addedButton=document.querySelector('[data-catalog-id="'+id+'"] button');const el=document.getElementById(id);jQuery(el).trigger('shiny:value');el.querySelector('img').src+='#initial';},id);await page.waitForTimeout(300);
  await page.getByRole('button',{name:'Finish plot',exact:true}).click();await page.waitForSelector('.tc-snapshot img');
  await page.evaluate(id=>{const el=document.getElementById(id);jQuery(el).trigger('shiny:value');el.querySelector('img').src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><text x="10" y="30">Changed mechanical render</text></svg>');},id);await page.waitForTimeout(400);
  assert.equal(await page.locator('.tc-node.tc-stale').count(),1,'catalog no-op must not suppress scientific render snapshot invalidation');
  assert.equal(await page.evaluate(id=>addedButton===document.querySelector('[data-catalog-id="'+id+'"] button'),id),true,'render changes with unchanged palette state do not replace its button');
  await page.getByRole('button',{name:'Return',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-catalog-id="'+id+'"] button')?.textContent==='Add',id);
  await page.evaluate(id=>{const el=document.getElementById(id);jQuery(el).trigger('shiny:error');el.replaceChildren();},id);
  await page.waitForFunction(id=>document.querySelector('[data-catalog-id="'+id+'"] .tc-catalog-state')?.textContent==='Add to check',id);
  await page.evaluate(id=>{const el=document.getElementById(id),img=new Image();img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"/>');el.append(img);jQuery(el).trigger('shiny:value');},id);
  await page.waitForFunction(id=>document.querySelector('[data-catalog-id="'+id+'"] .tc-catalog-state')?.textContent==='Ready to add',id);
  await page.evaluate(id=>document.getElementById(id).remove(),id);await page.waitForFunction(id=>document.querySelector('[data-catalog-id="'+id+'"] .tc-catalog-state')?.textContent==='Requires configuration',id);
  await card.getByRole('button',{name:'Add',exact:true}).click();await page.waitForFunction(id=>TeamCanvas.listPlots().find(x=>x.id===id).pending,id);
  await page.evaluate(id=>{window.cancelButton=document.querySelector('[data-catalog-id="'+id+'"] button');cancelButton.focus();},id);await page.waitForTimeout(750);
  assert.equal(await page.evaluate(id=>cancelButton===document.querySelector('[data-catalog-id="'+id+'"] button')&&document.activeElement===cancelButton,id),true);
  await card.getByRole('button',{name:'Cancel queued add: Average signal heatmap',exact:true}).click();assert.equal(await page.evaluate(id=>TeamCanvas.listPlots().find(x=>x.id===id).pending,id),false);
  await page.locator('.tc-search').fill('no-matching-plot-999');assert.match(await page.locator('.tc-list').textContent(),/No plots match/);await page.locator('.tc-search').fill('');
  // Reused DOM must call the latest callback even when its visible state is equal.
  const callback=await page.evaluate(()=>{const list=document.createElement('div');document.body.append(list);let called='';const base={list,filter:'',records:new Map(),pending:new Map(),onAdd:()=>{},onCancel:()=>{},onRoute:()=>{},onQueue:()=>{called='old';}};TeamCanvasCatalog.render(base);const button=list.querySelector('[data-catalog-id="results_dashboard-plot_pca"] button');TeamCanvasCatalog.render({...base,onQueue:()=>{called='latest';}});const same=button===list.querySelector('[data-catalog-id="results_dashboard-plot_pca"] button');button.click();list.remove();return{same,called};});assert.deepEqual(callback,{same:true,called:'latest'});
  transitions={readiness:true,same_id_replacement_current_record:true,autosize_preserves_DOM:true,render_invalidates_snapshot_without_palette_repaint:true,Add_Return:true,error_ready:true,queue_cancel:true,search:true,latest_callback:true};
 }
 const report={status:stable?'PASS':'REPLACEMENT_REPRODUCED',scope:'isolated browser with current production discovery and catalog JS; no scientific analysis',observed,transitions};
 if(process.env.STABLE_DOM_JSON)fs.writeFileSync(process.env.STABLE_DOM_JSON,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 await page.evaluate(()=>clearInterval(noiseTimer));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
