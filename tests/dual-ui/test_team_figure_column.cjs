// Figure page right column (Option A, block A2): Object / Plots · N / Page tabs hold the
// existing inspector, picker and Page setup nodes (moved, same handlers); entering with
// unfinished checked plots opens Plots; a page selection opens Object; "Finish in Draft"
// frames the first unfinished card; "Uncheck unfinished" unblocks export. Runs on the
// standalone markup (no shell: A1's #tc-figure-column inside the figure page, styled as the
// fallback) and integrated in the shell grid, where canvas_preview.js (A1) moves #tc-figure-column
// into the right column .ts-inspector-column above .tc-companion-home, whose box stays the same.
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('../browser/ci/node_modules/playwright');
const markup=execFileSync('Rscript',['--vanilla','-e','source("R/frontends/team/canvas.R");cat(as.character(team_canvas_ui()))'],{encoding:'utf8'});
// Four plots on two canvas tabs: plot0/plot1 finished, plot2 live, plot3 stale.
function stubs(){
 const url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#315c89"/></svg>');
 const nodes=[0,1,2,3].map(i=>({id:'plot'+i,label:'Plot '+i,x:i*420,y:0,width:400,height:300,finished:i<2?{url,stale:false}:i===3?{url,stale:true}:null}));
 window.fixture={state:{version:'1',nodes},ready:true,settled:true,usableIds:['plot0','plot1'],unusable:[{id:'plot2',label:'Plot 2',reason:'live'},{id:'plot3',label:'Plot 3',reason:'stale'}]};
 let saved=null;window.TeamCanvas={previewState:()=>structuredClone(fixture),getDocument:()=>saved,setDocument:d=>{saved=d;}};
 const tabs=[{id:'t1',name:'Canvas 1',nodes:['plot0','plot1']},{id:'t2',name:'Canvas 2',nodes:['plot2','plot3']}],included={plot0:true,plot1:true,plot2:true,plot3:true};
 window.calls={focus:[],activate:[],setIncluded:[]};let activeTab='t1';
 const changed=()=>window.dispatchEvent(new Event('team-canvas-changed'));
 window.TeamCanvasTabs={groups:()=>tabs.map(t=>({id:t.id,name:t.name,nodes:t.nodes.slice()})),figureOrder:()=>['plot0','plot1','plot2','plot3'],included:id=>included[id],
  setIncluded:(id,on)=>{calls.setIncluded.push([id,on]);included[id]=on;changed();},setTabIncluded:(t,on)=>{tabs.find(x=>x.id===t).nodes.forEach(id=>included[id]=on);changed();},
  moveInOrder(){},resetOrder(){},label:id=>id.replace('plot','Plot '),state:()=>({active:activeTab}),activate:id=>{calls.activate.push(id);activeTab=id;}};
 window.TeamCanvasViewport={focusNode:n=>calls.focus.push(n.dataset.plotId)};
 const board=document.createElement('div');board.className='tc-board';nodes.forEach(n=>{const d=document.createElement('div');d.className='tc-node';d.dataset.plotId=n.id;board.appendChild(d);});
 document.querySelector('#tc-workspace-panel').appendChild(board);
}
async function page(browser,host){
 const p=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.setContent('<body>'+markup+'</body>');
 // The shell case loads shell.css, whose figure-mode rules show #tc-figure-column in the right column.
 for(const css of host?['canvas_preview','shell','figure_column']:['canvas_preview','figure_column'])await p.addStyleTag({path:'www/team/css/'+css+'.css'});
 await p.addStyleTag({content:'body{margin:0;font:14px Arial}#team-canvas-root{width:100%;box-sizing:border-box}#tc-workspace-panel[hidden]{display:none}'+
  '#team-canvas-root.ts-shell .tc-layout>.ts-inspector-column{position:fixed;right:0;top:0;width:300px;height:900px;display:flex;flex-direction:column;background:#fff}'});
 // Shell host: the right column shell.js builds in .tc-layout, ending with the companion's home.
 if(host)await p.evaluate(()=>{const col=document.createElement('div');col.className='ts-inspector-column';col.innerHTML='<div class="ts-inspector-empty"><span class="ts-label">Inspector</span></div><div class="tc-companion-home" aria-hidden="true"></div>';document.querySelector('#team-canvas-root .tc-layout').appendChild(col);document.getElementById('team-canvas-root').classList.add('ts-shell');});
 await p.evaluate(stubs);
 await p.addScriptTag({path:'www/team/js/canvas_preview.js'});await p.addScriptTag({path:'www/team/js/figure_column.js'});
 return {p,errors};
}
const tabState=p=>p.evaluate(()=>[...document.querySelectorAll('.tc-fc-tab')].map(t=>t.textContent+(t.getAttribute('aria-selected')==='true'?'*':'')));
(async()=>{const browser=await chromium.launch({headless:true});try{
 // 1. Standalone (no shell): A1's #tc-figure-column inside the figure page holds the column, above the desk.
 {const {p,errors}=await page(browser,false);
  const handles=await p.evaluate(()=>{window.moved={inspector:document.querySelector('.tc-free-inspector'),picker:document.querySelector('.tc-figure-plots'),settings:document.querySelector('.tc-page-settings')};return true;});assert.ok(handles);
  await p.getByRole('tab',{name:'Print preview',exact:true}).click();
  await p.waitForSelector('.tc-figure-plots:not([hidden])');
  assert.deepEqual(await tabState(p),['Object','Plots · 4*','Page'],'entering with unfinished checked plots opens Plots');
  assert.equal(await p.evaluate(()=>{const c=document.getElementById('tc-figure-column'),pages=document.querySelector('#tc-preview-panel .tc-preview-pages');return document.querySelectorAll('#tc-figure-column').length===1&&!!c.closest('#tc-preview-panel')&&c.classList.contains('tc-figure-column-fallback')&&c.firstElementChild.classList.contains('tc-fc')&&!!(c.compareDocumentPosition(pages)&Node.DOCUMENT_POSITION_FOLLOWING);}),true,'standalone column in the figure page, above the desk');
  assert.equal(await p.locator('#tc-figure-column .tc-fc-tabs').isVisible(),true,'standalone tabs are shown');
  assert.equal(await p.evaluate(()=>moved.inspector===document.querySelector('#tc-fc-panel-object .tc-free-inspector')&&moved.picker===document.querySelector('#tc-fc-panel-plots .tc-figure-plots')&&moved.settings===document.querySelector('#tc-fc-panel-page .tc-page-settings')),true,'the same nodes are moved, not recreated');
  assert.equal(await p.locator('.tc-free-inspector').count(),1);assert.equal(await p.locator('.tc-figure-plots').count(),1);assert.equal(await p.locator('.tc-preview-options').count(),1);
  const howto=await p.locator('.tc-fc-howto').innerText();
  assert.match(howto,/How plots get here/);assert.match(howto,/A plot is placed on the page when it is Finished in Draft and checked here\./);assert.match(howto,/2 checked plots are not finished yet; export waits for them\./);
  assert.equal(await p.evaluate(()=>document.querySelector('#tc-fc-panel-plots').firstElementChild.className),'tc-fc-howto','the card heads the Plots tab');
  const rows=await p.locator('.tc-figure-plots-row label').allInnerTexts();
  assert.match(rows[0],/✓ on page/);assert.match(rows[1],/✓ on page/);assert.match(rows[2],/not finished/);assert.match(rows[3],/needs review/);assert.doesNotMatch(rows[2]+rows[3],/on page/);
  // Picker handlers still work from inside the tab.
  await p.locator('.tc-figure-plots-row').nth(1).locator('input').uncheck();
  assert.deepEqual(await p.evaluate(()=>calls.setIncluded),[['plot1',false]]);
  await p.locator('.tc-figure-plots-row').nth(1).locator('input').check();
  assert.equal(await p.locator('.tc-preview-print').isDisabled(),true,'export waits for unfinished plots');
  // Uncheck unfinished: setIncluded on the excluded ones only; export unblocks.
  await p.evaluate(()=>{calls.setIncluded=[];});
  await p.getByRole('button',{name:'Uncheck unfinished',exact:true}).click();
  assert.deepEqual(await p.evaluate(()=>calls.setIncluded),[['plot2',false],['plot3',false]]);
  await p.waitForFunction(()=>!document.querySelector('.tc-preview-print').disabled,null,{timeout:5000});
  assert.equal(await p.locator('.tc-fc-howto-count').isHidden(),true);assert.equal(await p.locator('.tc-fc-finish').isDisabled(),true);
  // Page tab: the existing Page setup controls keep their handlers.
  await p.getByRole('tab',{name:'Page',exact:true}).click();
  assert.equal(await p.locator('#tc-fc-panel-page').isVisible(),true);assert.equal(await p.locator('#tc-fc-panel-plots').isHidden(),true);
  await p.locator('.tc-preview-layout').selectOption('pages');await p.waitForFunction(()=>document.querySelectorAll('.tc-paper').length===2);
  await p.getByRole('tab',{name:'Object',exact:true}).click();
  assert.equal(await p.locator('.tc-fc-empty').isVisible(),true,'outside Free layout Object explains where properties are');
  await p.getByRole('tab',{name:'Page',exact:true}).click();await p.locator('.tc-preview-layout').selectOption('free');
  // Keyboard: arrows move between tabs.
  await p.locator('#tc-fc-tab-page').focus();await p.keyboard.press('ArrowLeft');assert.deepEqual(await tabState(p),['Object','Plots · 4*','Page']);
  await p.keyboard.press('Home');assert.deepEqual(await tabState(p),['Object*','Plots · 4','Page']);
  // Selecting an object on the page opens Object, with the moved inspector's handlers.
  await p.getByRole('tab',{name:/^Plots/}).click();
  await p.locator('.tc-free-item').first().waitFor();await p.locator('.tc-free-item').first().click();
  assert.deepEqual(await tabState(p),['Object*','Plots · 4','Page'],'a page selection opens Object');
  assert.equal(await p.locator('#tc-fc-panel-object .tc-object-name').textContent(),'Plot 0');
  const before=await p.locator('#tc-fc-panel-object [data-item-key="x"]').inputValue();
  await p.locator('#tc-fc-panel-object [data-item-key="x"]').fill(String(Number(before)+10));await p.locator('#tc-fc-panel-object [data-item-key="x"]').press('Tab');
  assert.equal(Math.round(await p.evaluate(()=>TeamCanvas.getDocument().items.find(i=>i.nodeId==='plot0').x)),Math.round(Number(before)+10),'inspector edits still save the document');
  // Undo (inspector button) re-renders without switching away from the current tab.
  await p.getByRole('tab',{name:'Page',exact:true}).click();await p.keyboard.press('Control+z');await p.waitForTimeout(100);
  assert.deepEqual(await tabState(p),['Object','Plots · 4','Page*'],'Undo does not switch tabs');
  // Add text opens Object so its text field can take focus.
  await p.locator('.tc-preview-add-text').click();await p.waitForFunction(()=>document.activeElement&&document.activeElement.dataset.itemKey==='text');
  assert.deepEqual(await tabState(p),['Object*','Plots · 4','Page']);
  assert.deepEqual(errors,[]);await p.close();}
 // 2. Shell grid: the tabs are in #tc-figure-column in the right column, above the companion home, whose box is unchanged.
 {const {p,errors}=await page(browser,true);
  const homeBefore=await p.evaluate(()=>document.querySelector('.tc-companion-home').getBoundingClientRect().toJSON());
  // The shell hides the old Workspace / Print preview tabs; its mode switch calls the same API.
  await p.evaluate(()=>TeamCanvasCompose.showFigure());await p.waitForSelector('.tc-figure-plots:not([hidden])');
  const geo=await p.evaluate(()=>{const host=document.getElementById('tc-figure-column'),col=host.parentElement,home=col.querySelector(':scope>.tc-companion-home');return{fallback:!!document.querySelector('.tc-figure-column-fallback'),ids:document.querySelectorAll('#tc-figure-column').length,inColumn:col.classList.contains('ts-inspector-column')&&!!col.closest('#team-canvas-root .tc-layout'),first:host.firstElementChild.className,count:host.children.length,last:col.lastElementChild===home,above:!!(host.compareDocumentPosition(home)&Node.DOCUMENT_POSITION_FOLLOWING),tabsVisible:!!host.querySelector('.tc-fc-tabs').getClientRects().length,home:home.getBoundingClientRect().toJSON(),fc:host.querySelector('.tc-fc').getBoundingClientRect().toJSON()};});
  assert.equal(geo.fallback,false);assert.equal(geo.ids,1);assert.equal(geo.inColumn,true,'#tc-figure-column is in the right column');
  assert.equal(geo.first,'tc-fc');assert.equal(geo.count,1);assert.equal(geo.tabsVisible,true,'tabs shown in the right column');
  assert.equal(geo.last,true,'the companion home stays the column\'s last child');assert.equal(geo.above,true,'#tc-figure-column precedes the companion home');
  assert.deepEqual(geo.home,homeBefore,'the companion home keeps its geometry');assert.ok(geo.fc.bottom<=geo.home.top+0.5,'the column stays above the companion home');
  assert.deepEqual(await tabState(p),['Object','Plots · 4*','Page']);
  // Finish in Draft: back to the draft, on the card's tab, framed by the viewport.
  await p.getByRole('button',{name:'← Finish in Draft',exact:true}).click();
  await p.waitForFunction(()=>calls.focus.length===1);
  assert.deepEqual(await p.evaluate(()=>({focus:calls.focus,activate:calls.activate,mode:TeamCanvasCompose.mode(),hidden:document.querySelector('.tc-fc').hidden})),{focus:['plot2'],activate:['t2'],mode:'draft',hidden:true});
  assert.deepEqual(await p.evaluate(()=>document.querySelector('.tc-companion-home').getBoundingClientRect().toJSON()),homeBefore);
  assert.equal(await p.locator('#tc-figure-column').isHidden(),true,'the column steps out in the Draft');
  assert.deepEqual(errors,[]);await p.close();}
 console.log('PASS figure column: Object / Plots · N / Page tabs with moved nodes, auto-open rules, How plots get here actions, standalone column and the shell right column above the untouched companion home');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
