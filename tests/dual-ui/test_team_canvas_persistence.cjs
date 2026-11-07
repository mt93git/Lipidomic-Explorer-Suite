// Browser integration of checkpoint serialization, acknowledgement and archived restoration.
const {chromium} = require('../browser/ci/node_modules/playwright');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const plotly = execFileSync('Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();
  const jquery = execFileSync('Rscript',['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'],{encoding:'utf8'}).trim();
  const browser = await chromium.launch({headless:true});
  async function pageFixture() {
    const page = await browser.newPage({acceptDownloads:true}); page.setDefaultTimeout(6000);
    await page.setContent(`<div class="rd-dashboard"><div class="rd-controls"></div><div class="rd-card"><div class="rd-card-head"><h3>Principal component analysis</h3><a id="csv" href="/data.csv">CSV</a></div><div id="results_dashboard-plot_pca" class="plotly html-widget-output" style="height:420px"></div></div></div>
      <section id="team-canvas-root"><button class="tc-library-toggle"></button><div class="tc-layout"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><div class="tc-board"><div class="tc-empty"></div></div><div class="tc-status"></div></div></section>
      <script>window.handlers={}; window.sent=[]; window.receipts=[]; window.ackDelay=5; window.Shiny={addCustomMessageHandler:(name,fn)=>handlers[name]=fn,setInputValue:(name,payload)=>{ if(name==='team_canvas_restore_complete')receipts.push(payload); if(name==='team_canvas_state'){sent.push(payload); setTimeout(()=>handlers['team-canvas-state-ack']({token:payload.token,ok:!window.rejectAck,message:'Rejected by server'}),window.ackDelay);}}};</script>`);
    await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});
    await page.addScriptTag({path:jquery}); await page.addScriptTag({path:plotly});
    await page.evaluate(() => Plotly.newPlot('results_dashboard-plot_pca',[{type:'scatter',x:[1,2],y:[2,3],marker:{color:'#235c77'}}],{margin:{t:10}}));
    await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
    return page;
  }
  async function rendered(page, revision, data) {
    await page.evaluate(async ({revision,data}) => {
      window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision}}));
      const gd=document.getElementById('results_dashboard-plot_pca'); jQuery(gd).trigger('shiny:value');
      await Plotly.react(gd,[{type:'scatter',x:data,y:data,marker:{color:'#235c77'}}],{margin:{t:10}});
    }, {revision,data});
    await page.waitForTimeout(350);
  }
  try {
    let page = await pageFixture();
    await page.evaluate(()=>{window.restoreEvents=[];window.addEventListener('team-canvas-restore-status',e=>restoreEvents.push(e.detail));handlers['team-canvas-restore']({state:{version:'bad'},restoreToken:'failed-1'});});
    assert.deepEqual(await page.evaluate(()=>restoreEvents.map(e=>e.status)),['pending','failed']);
    assert.equal(await page.evaluate(()=>receipts.length),0,'invalid restore must not acknowledge success');
    assert.equal(await page.locator('.tc-restore-retry').isVisible(),true,'failed restore offers an explicit retry');
    await page.evaluate(()=>{const original=Shiny.setInputValue;Shiny.setInputValue=(name,value,options)=>{if(name==='team_canvas_restore_retry')window.retryRequest=value;return original(name,value,options)};});
    await page.locator('.tc-restore-retry').click();assert.deepEqual(await page.evaluate(()=>retryRequest),{token:'failed-1'});
    await page.evaluate(()=>handlers['team-canvas-restore']({state:{version:'1',libraryHidden:false,nodes:[]},restoreToken:'success-2'}));
    assert.deepEqual(await page.evaluate(()=>receipts),[{ok:true,token:'success-2'}]);
    assert.equal(await page.locator('.tc-restore-retry').isVisible(),false);
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_pca')), true);
    await rendered(page,1,[1,2,3]);
    await page.locator('.tc-settings summary').click();
    await page.getByLabel('Plot title').fill('Saved title');
    await page.locator('.tc-node').evaluate(n=>{n.style.left='155px'; n.style.top='210px'; n.style.width='700px'; n.style.height='760px';});
    await page.locator('.tc-library-toggle').click();
    await page.evaluate(() => { const original=Plotly.toImage; Plotly.toImage=(...a)=>new Promise(resolve=>setTimeout(()=>resolve(original(...a)),200)); });
    await page.locator('.tc-node-head button',{hasText:'Finish plot'}).click();
    const liveDownload=page.waitForEvent('download'); await page.locator('.tc-snapshot-exports button',{hasText:'SVG'}).click(); await liveDownload;
    const blocked=await page.evaluate(()=>{document.documentElement.classList.add('shiny-busy');jQuery(document).trigger('shiny:busy');const link=document.querySelector('.tc-export-fallback');const allowed=link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));const removed=!link.isConnected;document.documentElement.classList.remove('shiny-busy');jQuery(document).trigger('shiny:idle');return {allowed,removed};});
    assert.deepEqual(blocked,{allowed:true,removed:false},'unrelated busy activity must not invalidate a current figure');
    const first = await page.evaluate(async () => { const result=await TeamCanvas.checkpoint(); return {result,state:sent.findLast(x=>x.token===result.token).state}; });
    assert.equal(first.state.version,'1'); assert.equal(first.state.libraryHidden,true);
    assert.equal(first.state.nodes[0].visual.plotTitle,'Saved title');
    assert.equal(first.state.nodes[0].x,155); assert.equal(first.state.nodes[0].width,700);
    await page.evaluate(() => { document.getElementById('team-canvas-root').style.display='none'; });
    const hiddenSave=await page.evaluate(async () => {const ack=await TeamCanvas.checkpoint(); return sent.findLast(x=>x.token===ack.token).state;});
    assert.equal(hiddenSave.nodes[0].x,155); assert.equal(hiddenSave.nodes[0].y,210); assert.equal(hiddenSave.nodes[0].width,700);
    assert.ok(first.state.nodes[0].finished.url.startsWith('data:image/svg+xml'));
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'team-canvas-state-')); const json=path.join(tmp,'canvas.json');
    try { fs.writeFileSync(json,JSON.stringify(first.state)); execFileSync('Rscript',['--vanilla','-e','source("R/frontends/team/canvas_state.R"); team_canvas_read(commandArgs(TRUE)[1])',json],{stdio:'pipe'}); } finally {fs.rmSync(tmp,{recursive:true,force:true});}
    await page.close();
    page = await pageFixture();
    const archivedState=structuredClone(first.state); archivedState.nodes[0].finished.stale=true;
    await page.evaluate(state => handlers['team-canvas-restore']({state}), archivedState);
    assert.equal(await page.locator('.tc-node.tc-finished').count(),1);
    assert.equal((await page.evaluate(() => TeamCanvas.serialize())).nodes[0].finished.stale, true);
    assert.ok((await page.locator('.tc-snapshot-status').textContent()).includes('Saved checkpoint figure'));
    assert.equal(await page.locator('.tc-layout.tc-library-hidden').count(),1);
    const archiveDownload=page.waitForEvent('download'); await page.locator('.tc-snapshot-exports button',{hasText:'SVG'}).click();
    const archiveFile=await archiveDownload;
    assert.ok(archiveFile.suggestedFilename().endsWith('-saved.svg'));
    assert.ok(fs.statSync(await archiveFile.path()).size>100,'individual canvas SVG download must contain bytes');
    await page.evaluate(()=>document.documentElement.classList.add('shiny-busy'));
    const archiveFallback=page.waitForEvent('download'); await page.locator('.tc-export-fallback').click();
    assert.ok(fs.statSync(await (await archiveFallback).path()).size>100,'archived fallback stays available during analysis');
    await page.evaluate(()=>document.documentElement.classList.remove('shiny-busy'));
    await rendered(page,2,[4,5,6,7]);
    assert.equal(await page.locator('.tc-node.tc-stale').count(),0);
    await page.locator('.tc-node-head button',{hasText:'Edit'}).click();
    await page.waitForFunction(() => document.querySelector('.gtitle')?.textContent === 'Saved title');
    await page.locator('.tc-settings summary').click();
    await page.getByLabel('Plot title').fill('Latest edit');
    await page.evaluate(() => { window.ackDelay=200; });
    const pending = page.evaluate(() => TeamCanvas.checkpoint());
    await page.waitForTimeout(30);
    await page.getByLabel('Plot title').fill('Edit during save');
    const result = await pending;
    const saved = await page.evaluate(token => sent.findLast(x=>x.token===token).state, result.token);
    assert.equal(saved.nodes[0].visual.plotTitle,'Edit during save');
    await page.waitForTimeout(500); assert.equal(await page.evaluate(() => sent.at(-1).token), result.token);
    await page.close();
    page = await pageFixture(); await page.evaluate(state => handlers['team-canvas-restore']({state}),saved);
    assert.equal(await page.locator('.tc-node').count(),1);
    await page.evaluate(state => handlers['team-canvas-restore']({state}),saved);
    assert.equal(await page.locator('.tc-node').count(),1);
    assert.equal(await page.locator('[id="results_dashboard-plot_pca"]').count(),1);
    await page.evaluate(() => handlers['team-canvas-restore']({state:null}));
    assert.equal(await page.locator('.tc-node').count(),0);
    // (Codex on 07af799) Without a busy dialog, the status keeps naming the figures still
    // awaiting their analysis after another one mounts (its "Added" message does not hide them).
    const twoPending={version:'1',libraryHidden:false,nodes:[{id:'pending-a',label:'Pending A',x:25,y:35,width:620,height:720,visual:[],finished:null},{id:'pending-b',label:'Pending B',x:700,y:35,width:620,height:720,visual:[],finished:null}]};
    await page.evaluate(state => handlers['team-canvas-restore']({state}),twoPending);
    assert.ok((await page.locator('.tc-status').textContent()).includes('Pending B'));
    await page.evaluate(() => { let el=document.createElement('div');el.id='pending-a';el.className='shiny-plot-output';document.body.appendChild(el); });
    await page.waitForSelector('.tc-node[data-plot-id="pending-a"]');
    const afterA=await page.locator('.tc-status').textContent();
    assert.ok(afterA.includes('Pending B')&&!afterA.includes('Pending A'),'after A mounts the status still names B: '+afterA);
    await page.evaluate(() => handlers['team-canvas-restore']({state:null}));
    await page.evaluate(() => document.getElementById('pending-a').remove());
    assert.equal(await page.locator('.tc-node').count(),0);
    const pendingState={version:'1',libraryHidden:false,nodes:[{id:'barchart-barPlotFiltered',label:'Filtered bars',x:25,y:35,width:620,height:720,visual:[],finished:null}]};
    await page.evaluate(state => handlers['team-canvas-restore']({state}),pendingState);
    assert.ok((await page.locator('.tc-status').textContent()).includes('Filtered bars'));
    assert.equal((await page.evaluate(() => TeamCanvas.serialize())).nodes.length,1);
    await page.evaluate(() => { let el=document.createElement('div');el.id='barchart-barPlotFiltered';el.className='shiny-plot-output';document.body.appendChild(el); });
    await page.waitForSelector('.tc-node[data-plot-id="barchart-barPlotFiltered"]');
    assert.equal(await page.locator('.tc-node').count(),1);
    const before=await page.evaluate(()=>TeamCanvas.serialize());
    const invalid=structuredClone(before); invalid.nodes[0].finished={url:'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E%3C%2Fsvg%3E',createdAt:'2026-10-28T00:00:00Z',stale:false};
    assert.equal(await page.evaluate(state=>{try {TeamCanvas.restore(state);return false;} catch(e) {return true;}}, invalid),true);
    assert.equal(await page.locator('.tc-node').count(),1);
    await page.evaluate(()=>{window.rejectAck=true;});
    assert.ok((await page.evaluate(async()=>{try {await TeamCanvas.checkpoint();return '';}catch(e){return e.message;}})).includes('Rejected by server'));
    await page.evaluate(state => { window.rejectAck=false; TeamCanvas.restore(null); TeamCanvas.restore(state); }, archivedState);
    assert.equal(await page.locator('.tc-node.tc-finished').count(),1);
    await page.evaluate(() => { const replacement=document.createElement('div'); replacement.id='results_dashboard-plot_pca'; replacement.className='plotly html-widget-output'; document.body.appendChild(replacement); });
    await page.waitForFunction(() => document.querySelectorAll('[id="results_dashboard-plot_pca"]').length === 1);
    const afterReplacement=await page.evaluate(() => TeamCanvas.serialize());
    assert.equal(afterReplacement.nodes.length,1);
    assert.equal(afterReplacement.nodes[0].finished.url, archivedState.nodes[0].finished.url);
    await page.locator('.tc-reset').click();await page.evaluate(()=>{const y=document.querySelector('.tc-reset-yes');if(y)y.click();});
    assert.equal((await page.evaluate(() => TeamCanvas.serialize())).nodes.length,0);
    console.log('PASS: checkpoints survive reload, preserve archived figures and retry concurrent edits');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
