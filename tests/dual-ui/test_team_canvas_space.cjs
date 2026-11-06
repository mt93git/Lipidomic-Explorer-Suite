const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('../browser/ci/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const p=await browser.newPage({viewport:{width:1512,height:806}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const markup=execFileSync('Rscript',['--vanilla','-e','source("R/frontends/team/canvas.R");cat(as.character(team_canvas_ui()))'],{encoding:'utf8'});
 await p.setContent('<body class="team-workspace-app" data-tw-screen="canvas"><div style="height:110px">Application navigation</div>'+markup+'<div class="rd-card"><h3>PCA</h3><div id="results_dashboard-plot_pca" class="shiny-plot-output"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'300\'%3E%3C/svg%3E"></div></div></body>');
 for(const file of ['canvas','workspace_minimal','canvas_catalog','canvas_preview','canvas_viewport'])await p.addStyleTag({path:'www/team/css/'+file+'.css'});
 await p.addStyleTag({content:'body{margin:8px;font:14px Arial}#team-canvas-root{width:100%;box-sizing:border-box}'});
 for(const file of ['canvas_viewport','canvas'])await p.addScriptTag({path:'www/team/js/'+file+'.js'});
 await p.evaluate(()=>TeamCanvas.addPlot('results_dashboard-plot_pca'));
 await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
 const state=await p.evaluate(()=>TeamCanvas.serialize());const sizes=[];
 for(const [width,height] of [[1512,806],[1366,768],[1920,1080],[390,844],[360,640]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(100);
  let d=await p.evaluate(()=>{const a=document.querySelector('.tc-scroll').getBoundingClientRect(),n=document.querySelector('.tc-navigation').getBoundingClientRect();return {width:innerWidth,height:innerHeight,board:a.toJSON(),nav:n.toJSON(),pageWidth:document.documentElement.scrollWidth}});
  assert(d.board.height>=300);assert(d.pageWidth<=width,'no page overflow');if(width>720) assert(d.board.width>=width-210,'desktop reserves only the library gutter'); else assert(d.board.width>=width-25,'mobile camera keeps full width');
  if(width>900){assert(d.board.height>height-430+100,'recover over 100px of height');assert(d.board.bottom<=height-30,'status remains in viewport');}
  const drawer=await p.locator('.tc-catalog').boundingBox();assert(drawer.height<d.board.height,'drawer scrolls internally');assert(drawer.y>=d.board.y,'drawer must not cover toolbar');
  assert(d.nav.bottom<=d.board.bottom&&d.nav.right<=d.board.right,'navigation stays inside board');
  assert(drawer.x+drawer.width<=d.nav.left || drawer.y+drawer.height<=d.nav.top || drawer.y>=d.nav.bottom,'drawer does not cover minimap');sizes.push(d);
  assert(await p.locator('.tc-zoom-out').evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'zoom reachable with library open');
  assert.deepEqual(await p.evaluate(()=>TeamCanvas.serialize()),state,'resize leaves checkpoint unchanged');
 }
 await p.getByRole('button',{name:'Close library',exact:true}).click();assert.equal(await p.locator('.tc-library-toggle').getAttribute('aria-expanded'),'false');assert(await p.locator('.tc-library-toggle').evaluate(n=>n===document.activeElement));
 await p.locator('.tc-library-toggle').click();await p.locator('.tc-search').press('Escape');assert.equal(await p.locator('.tc-library-toggle').getAttribute('aria-expanded'),'false');
 await p.locator('.tc-map summary').click();assert.equal(await p.locator('.tc-map svg').isVisible(),false);await p.locator('.tc-zoom-reset').click();await p.getByRole('button',{name:'Zoom out',exact:true}).click();assert.equal(await p.locator('.tc-zoom-reset').innerText(),'80%');
 await p.getByRole('button',{name:'Expand canvas',exact:true}).click();await p.waitForTimeout(100);const expanded=await p.locator('.tc-scroll').evaluate(n=>({height:n.clientHeight,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom}));console.log('expanded',expanded);assert(expanded.height>400);assert(expanded.bottom<=640);
 await p.locator('.tc-library-toggle').click();await p.locator('.tc-search').press('Escape');assert(await p.locator('#team-canvas-root').evaluate(n=>n.classList.contains('tc-focus-mode')),'Escape in library closes drawer before fullscreen');
 await p.getByRole('button',{name:'Exit expanded canvas',exact:true}).click();
 const helpBefore=await p.locator('.tc-save-help>summary').boundingBox();
 await p.locator('.tc-save-help>summary').click();const helpAfter=await p.locator('.tc-save-help>summary').boundingBox();assert.deepEqual(helpAfter,helpBefore,'help trigger stays under pointer');assert(await p.getByText('Your workspace saves automatically. Check the save status before leaving.',{exact:true}).isVisible());
 assert.deepEqual(errors,[]);console.log(JSON.stringify({sizes,errors},null,2));console.log('PASS canvas space: five viewports, full width, more height, unchanged checkpoints, drawer close/focus/Escape, zoom with collapsed map, fullscreen, help');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
