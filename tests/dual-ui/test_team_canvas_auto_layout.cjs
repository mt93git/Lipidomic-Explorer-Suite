const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('../browser/ci/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const markup=execFileSync('Rscript',['--vanilla','-e','source("R/frontends/team/canvas.R");cat(as.character(team_canvas_ui()))'],{encoding:'utf8'});
 const ids=['results_dashboard-plot_pca','results_dashboard-plot_violin','results_dashboard-plot_dist'];
 await page.setContent('<body>'+markup+ids.map(id=>'<div class="rd-card"><div id="'+id+'" class="shiny-plot-output"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'300\'%3E%3C/svg%3E"></div></div>').join('')+'</body>');
 for(const file of ['canvas','canvas_viewport'])await page.addStyleTag({path:'www/team/css/'+file+'.css'});
 for(const file of ['canvas_viewport','canvas'])await page.addScriptTag({path:'www/team/js/'+file+'.js'});
 const state=()=>page.evaluate(()=>TeamCanvas.serialize());
 const noOverlap=nodes=>{for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'cards never overlap');}};
 await page.evaluate(id=>TeamCanvas.addPlot(id),ids[0]);
 await page.locator('.tc-node').evaluate(n=>{n.style.width='400px';n.style.height='350px';});await page.waitForTimeout(60);
 const beforeAdd=await state();
 await page.evaluate(id=>TeamCanvas.addPlot(id),ids[1]);await page.waitForTimeout(100);
 let saved=await state();assert.deepEqual(saved.nodes.map(n=>n.id),[ids[1],ids[0]]);
 // Adding a card keeps the person's placement (ux29 F-31): the older card stays put and the new one takes free space.
 assert.deepEqual([saved.nodes[1].x,saved.nodes[1].y],[beforeAdd.nodes[0].x,beforeAdd.nodes[0].y],'older card stays where it was');noOverlap(saved.nodes);
 const packedAfterAdd=structuredClone(saved);
 await page.locator('.tc-arrange').focus();await page.keyboard.press('Control+z');
 const undoneAdd=await state();assert.equal(undoneAdd.nodes.length,2,'undo never deletes the added scientific plot');
 const previous=undoneAdd.nodes.find(n=>n.id===ids[0]);assert.deepEqual([previous.x,previous.y,previous.width,previous.height],[beforeAdd.nodes[0].x,beforeAdd.nodes[0].y,beforeAdd.nodes[0].width,beforeAdd.nodes[0].height],'undo restores surviving geometry before add');noOverlap(undoneAdd.nodes);
 assert(undoneAdd.nodes.find(n=>n.id===ids[1]).y>=previous.y+previous.height+30,'new plot is parked below the restored layout');
 await page.keyboard.press('Control+Shift+z');assert.deepEqual(await state(),packedAfterAdd,'redo restores packed layout without changing scientific state');
 await page.locator('[data-plot-id="'+ids[1]+'"]').evaluate(n=>{n.style.width='800px';n.style.height='550px';});
 const beforeThird=await state();
 await page.evaluate(id=>TeamCanvas.addPlot(id),ids[2]);await page.waitForTimeout(100);
 saved=await state();assert.deepEqual(saved.nodes.map(n=>n.id),[ids[2],ids[1],ids[0]]);noOverlap(saved.nodes);
 assert.deepEqual(saved.nodes.slice(1).map(n=>[n.x,n.y]),beforeThird.nodes.map(n=>[n.x,n.y]),'adding never repacks existing cards');
 const orderBefore=(await state()).nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x).map(n=>n.id);
 await page.locator('.tc-arrange').click();saved=await state();noOverlap(saved.nodes);assert(saved.nodes.some(n=>n.y>30),'mixed widths wrap down');
 assert.equal(await page.locator('.tc-arrange').textContent(),'Tidy up','the toolbar button reads Tidy up');
 assert.deepEqual(saved.nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x).map(n=>n.id),orderBefore,'Tidy up keeps the reading order (top to bottom, left to right)');
 // Packing compares logical card dimensions with the visible logical width.
 // A 64% camera can show two cards where 100% would wrap them; a 150%
 // camera must wrap sooner. The scroll box already excludes the library gutter.
 const rowsAt={};
 for(const scale of [.64,1.5]){
   await page.evaluate(scale=>{TeamCanvasViewport.scale=scale;document.querySelector('.tc-arrange').click();},scale);
   const packed=await state(), available=await page.locator('.tc-scroll').evaluate((n,scale)=>n.clientWidth/scale,scale);
   noOverlap(packed.nodes);rowsAt[scale]=new Set(packed.nodes.map(n=>n.y)).size;
   // Tidy up keeps the person's reading order: compare the first two cards in that order.
   const reading=packed.nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x),first=reading[0],second=reading[1];
   if(scale<1&&30+first.width+30+second.width+30<=available){assert.equal(second.y,30,'zoomed-out view fills row rightward');assert.equal(second.x,first.x+first.width+30);}
 }
 assert(rowsAt[1.5]>=rowsAt[.64],'a zoomed-in view never packs wider rows than a zoomed-out one');
 await page.evaluate(()=>{
   const dock=document.createElement('div');dock.className='companion-dock';dock.id='fixture-right-rail';dock.style.cssText='position:absolute;right:20px;top:90px;width:360px;height:150px;background:white;z-index:30';document.querySelector('.tc-viewport-shell').appendChild(dock);
   TeamCanvasViewport.scale=.64;document.querySelector('.tc-arrange').click();
 });
 const railState=await state(), railWidth=await page.evaluate(()=>{const scroll=document.querySelector('.tc-scroll').getBoundingClientRect(),dock=document.querySelector('#fixture-right-rail').getBoundingClientRect();return (dock.left-scroll.left-12)/.64;});
 noOverlap(railState.nodes);assert(railState.nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x)[2].y>30,'right overlay rail moves the third card (reading order) down at 64%');railState.nodes.forEach(node=>{if(node.width+60<=railWidth)assert(node.x+node.width+30<=railWidth,'fitting card stays clear of visible overlay rail');});
 await page.evaluate(()=>document.querySelector('#fixture-right-rail').remove());
 await page.evaluate(()=>{TeamCanvasViewport.scale=1;document.querySelector('.tc-arrange').click();});
 saved=await state();
 const retained=saved.nodes.map(({id,width,height,visual,instance})=>({id,width,height,visual,instance}));
 await page.evaluate(s=>TeamCanvas.restore(s),saved);await page.waitForTimeout(100);assert.deepEqual((await state()).nodes.map(n=>n.id),saved.nodes.map(n=>n.id),'checkpoint retains creation order');
 // Narrow and tall: the navigation box now stays inside the window (its band shortens the view), and Tidy up's
 // column count follows the view's aspect, so the view keeps a portrait shape where one column is expected.
 await page.setViewportSize({width:390,height:960});await page.locator('.tc-arrange').click();await page.waitForTimeout(100);
 const narrow=await state();noOverlap(narrow.nodes);assert(narrow.nodes.every(n=>n.x===30),'narrow viewport gives each oversized card its own row');assert.deepEqual(narrow.nodes.map(({id,width,height,visual,instance})=>({id,width,height,visual,instance})),retained,'packing preserves sizes, styles and scientific inputs');assert.deepEqual(errors,[]);
 console.log('PASS canvas auto-layout: add keeps placement, Tidy up packs in reading order, mixed sizes, narrow viewport, checkpoint order, unchanged scientific inputs');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
