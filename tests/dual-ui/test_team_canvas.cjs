// Run with: node tests/dual-ui/test_team_canvas.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body>
      <div class="rd-dashboard"><div class="rd-controls"><label>Color samples by <select id="results_dashboard-color_by"><option value="Group1">Condition</option><option value="Group2">Tissue</option></select></label></div></div>
      <div id="home"><div class="rd-card"><div class="rd-card-head"><h3>Principal components</h3>
      <a id="csv" href="/actual-data.csv">Plot data (CSV)</a></div>
      <div class="plot-export-bar"><button id="svg">SVG</button><button>PNG</button><button>PDF</button></div>
      <div id="results_dashboard-plot_pca" class="plotly html-widget-output js-plotly-plot"></div></div></div>
      <div id="analysis"><a id="barchart-downloadBarCSV_Unfiltered" href="/bar.csv">CSV</a>
      <div id="barchart-barPlotUnfiltered" class="shiny-plot-output" style="height:600px"></div></div>
      <div id="results_dashboard-plot_violin" class="plotly html-widget-output"></div>
      <div class="shiny-html-output" id="barchart-donutPlotUnfilteredUI"><div id="barchart-donutPlotUnfiltered" class="shiny-plot-output"></div></div>
      <section id="team-canvas-root"><details class="tc-view-settings" open><summary>Plot settings</summary><div class="tc-settings-dock"></div></details><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange">Arrange</button>
      <button class="tc-library-toggle">Hide library</button><div class="tc-layout"><div class="tc-scroll"><div class="tc-board"><div class="tc-empty"></div></div></div><div class="tc-status"></div></div></section>
      <script>window.calls=[]; window.Plotly={toImage:()=>Promise.resolve('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3C%2Fsvg%3E'),Plots:{resize:()=>Promise.resolve()}, relayout:(gd,v)=>calls.push(['layout',v]), restyle:(gd,v,i)=>calls.push(['style',v,i])}; document.querySelector('.js-plotly-plot')._fullLayout={}; document.querySelector('.js-plotly-plot').data=[{type:'scatter',marker:{color:'#235c77'}}]; document.querySelector('.js-plotly-plot').layout={xaxis:{title:'Original X'},yaxis:{title:'Original Y'},margin:{t:10}};</script>
    </body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});
    await page.evaluate(() => { window.originalSetting = document.getElementById('results_dashboard-color_by'); window.settingChanges = 0; window.originalSetting.addEventListener('change', () => window.settingChanges++); });
    const jquery = execFileSync('Rscript', ['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'], {encoding:'utf8'}).trim();
    await page.addScriptTag({path:jquery});
    await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
    // Native drawing primitives are document items, independent of analysis nodes.
    const primitiveDocument = {version:'1',layout:'free',paper:'letter',orientation:'portrait',items:[
      {id:'shape-box',type:'shape',shape:'rectangle',x:40,y:40,width:220,height:80,fill:'#f5e9c8',stroke:'#172b3a',strokeWidth:3,radius:18,z:0},
      {id:'shape-label',type:'text',x:70,y:65,width:160,height:24,text:'Phospholipids',fontSize:16,color:'#172b3a',z:1}
    ]};
    await page.evaluate(document => TeamCanvas.setDocument(document), primitiveDocument);
    const primitiveState = await page.evaluate(() => TeamCanvas.serialize());
    assert.equal(primitiveState.nodes.length, 0, 'primitive-only documents do not require figure nodes');
    assert.equal(primitiveState.document.items[0].shape, 'rectangle');
    await page.evaluate(state => TeamCanvas.restore(state), primitiveState);
    assert.deepEqual(await page.evaluate(() => TeamCanvas.getDocument()), primitiveState.document, 'primitive document survives restore');
    await page.evaluate(() => { let failed = false; try { TeamCanvas.setDocument({version:'1',layout:'free',paper:'letter',orientation:'portrait',items:[{id:'bad',type:'shape',shape:'triangle',x:0,y:0,width:40,height:40,fill:'#ffffff',stroke:'none',strokeWidth:1,z:0}]}); } catch (e) { failed = true; } window.primitiveRejected = failed; });
    assert.equal(await page.evaluate(() => window.primitiveRejected), true, 'unknown primitive shape is rejected');
    assert.equal(await page.locator('.tc-settings-dock #results_dashboard-color_by').count(), 1);
    assert.equal(await page.evaluate(() => document.getElementById('results_dashboard-color_by') === window.originalSetting), true);
    await page.locator('#results_dashboard-color_by').selectOption('Group2');
    assert.equal(await page.evaluate(() => window.settingChanges), 1);
    assert.equal(await page.evaluate(() => window.originalSetting.value), 'Group2');
    assert.equal(await page.locator('[id="results_dashboard-color_by"]').count(), 1);
    assert.ok(await page.evaluate(() => TeamCanvas.listPlots().some(r => r.title === 'Principal components' && !r.added)));
    assert.ok(!(await page.locator('.tc-list').textContent()).includes('results_dashboard-plot_pca'));
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('barchart-donutPlotUnfiltered')), true);
    await page.locator('.tc-node-head button', {hasText:'Return'}).click();
    assert.ok(await page.evaluate(() => TeamCanvas.listPlots().some(r => r.id === 'pathway_tab-pathwayVisNetwork' && !r.available)));
    assert.ok(await page.evaluate(() => TeamCanvas.listPlots().some(r => r.id === 'cell-show-route' && !r.available)));
    assert.equal(await page.evaluate(() => TeamCanvas.listPlots().find(r => r.id === 'barchart-donutPlotUnfiltered').available), false);
    assert.ok((await page.locator('.tc-list').textContent()).includes('Open analysis'));
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_pca')), true);
    assert.equal(await page.locator('.tc-node #csv').count(), 1);
    assert.equal(await page.locator('.tc-node #svg').count(), 1);
    assert.equal(await page.evaluate(() => TeamCanvas.selected().id), 'results_dashboard-plot_pca');
    await page.locator('.tc-settings summary').click();
    await page.getByLabel('Plot title').fill('My figure');
    await page.getByLabel('Plot title').dispatchEvent('change');
    await page.getByLabel('Uniform mark color').fill('#ff0000');
    await page.getByLabel('Uniform mark color').dispatchEvent('change');
    await page.waitForTimeout(220);
    const calls = await page.evaluate(() => window.calls);
    assert.ok(calls.some(c => c[0] === 'layout' && c[1]['title.text'] === 'My figure'));
    assert.ok(calls.some(c => c[0] === 'style' && c[1]['marker.color'] === '#ff0000' && JSON.stringify(c[2]) === '[0]'));
    await page.getByLabel('X axis').fill('Edited X'); await page.getByLabel('X axis').dispatchEvent('change');
    await page.getByLabel('X axis').fill(''); await page.getByLabel('X axis').dispatchEvent('change');
    await page.waitForTimeout(220);
    assert.ok(await page.evaluate(() => calls.some(c => c[0] === 'layout' && c[1]['xaxis.title.text'] === 'Original X')));
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    assert.equal(await page.locator('.tc-snapshot').count(), 0);
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}})); jQuery(document).trigger('shiny:busy'); });
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    assert.equal(await page.locator('.tc-snapshot').count(), 0);
    await page.evaluate(() => { jQuery(document).trigger('shiny:idle'); const el=document.getElementById('results_dashboard-plot_pca'); jQuery(el).trigger('shiny:value'); el.appendChild(document.createElement('i')); });
    await page.waitForTimeout(160);
    await page.evaluate(() => { window.originalToImage = Plotly.toImage; Plotly.toImage = () => new Promise(resolve => { window.resolveCapture = resolve; }); });
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    await page.waitForFunction(() => !!window.resolveCapture);
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:2}})); window.resolveCapture('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3C%2Fsvg%3E'); Plotly.toImage = window.originalToImage; });
    await page.waitForFunction(() => !document.querySelector('.tc-node-head button').disabled);
    assert.equal(await page.locator('.tc-snapshot').count(), 0);
    await page.evaluate(() => { const el=document.getElementById('results_dashboard-plot_pca'); jQuery(el).trigger('shiny:value'); el.appendChild(document.createElement('i')); });
    await page.waitForTimeout(160);
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    assert.equal(await page.locator('.tc-node.tc-finished').count(), 1);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{revision:2,running:false,pending:false,ready:true}})));
    assert.equal(await page.locator('.tc-node.tc-stale').count(), 0);
    await page.evaluate(() => { const img=document.querySelector('.tc-snapshot img'); window.originalSrc=img.getAttribute('src'); img.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%2F%3E'; });
    await page.locator('.tc-snapshot-exports button', {hasText:'SVG'}).click();
    assert.equal(await page.locator('.tc-node.tc-stale').count(), 1);
    assert.ok((await page.locator('.tc-status').textContent()).includes('missing or changed'));
    await page.locator('.tc-node-head button', {hasText:'Edit'}).click();
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    await page.waitForSelector('.tc-snapshot img');
    await page.evaluate(() => { const img=document.querySelector('.tc-snapshot img'); Object.defineProperty(img,'naturalWidth',{value:0,configurable:true}); });
    await page.locator('.tc-snapshot-exports button', {hasText:'PNG'}).click();
    await page.waitForFunction(() => document.querySelector('.tc-status').textContent.includes('no usable dimensions'));
    await page.evaluate(() => { delete document.querySelector('.tc-snapshot img').naturalWidth; window.savedToBlob=HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob=function(cb){cb(null);}; });
    await page.locator('.tc-snapshot-exports button', {hasText:'PNG'}).click();
    await page.waitForFunction(() => document.querySelector('.tc-status').textContent.includes('Could not create the PNG'));
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob=window.savedToBlob; });
    await page.evaluate(() => jQuery(document.getElementById('results_dashboard-plot_pca')).trigger('shiny:error'));
    assert.equal(await page.locator('.tc-node.tc-stale').count(), 1);
    assert.equal(await page.locator('.tc-snapshot-exports button:disabled').count(), 3);
    await page.locator('.tc-node-head button', {hasText:'Edit'}).click();
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    assert.equal(await page.locator('.tc-snapshot').count(), 0);
    await page.evaluate(() => { const el=document.getElementById('results_dashboard-plot_pca'); jQuery(el).trigger('shiny:value'); el.appendChild(document.createElement('i')); });
    await page.waitForTimeout(160);
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    assert.equal(await page.locator('.tc-node.tc-finished').count(), 1);
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:null})); });
    assert.equal(await page.locator('.tc-node.tc-stale').count(), 1);
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:2}})); });
    await page.locator('.tc-node-head button', {hasText:'Edit'}).click();
    await page.evaluate(() => { const el=document.getElementById('results_dashboard-plot_pca'); jQuery(el).trigger('shiny:value'); el.appendChild(document.createElement('i')); });
    await page.waitForTimeout(160);
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    assert.equal(await page.locator('.tc-node.tc-finished').count(), 1);
    await page.evaluate(() => jQuery(document).trigger('shiny:busy'));
    assert.equal(await page.locator('.tc-node.tc-stale').count(), 0);
    assert.equal(await page.locator('.tc-snapshot-exports button:disabled').count(), 0,'unrelated global busy keeps immutable snapshot downloads available');
    await page.evaluate(() => jQuery(document).trigger('shiny:idle'));
    assert.equal(await page.locator('.tc-node.tc-stale').count(), 0);
    assert.equal(await page.locator('.tc-snapshot-exports button:disabled').count(), 0);
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = function (cb) { window.completeBlob = cb; }; });
    await page.locator('.tc-snapshot-exports button', {hasText:'PNG'}).click();
    await page.waitForFunction(() => !!window.completeBlob);
    await page.evaluate(() => { jQuery(document).trigger('shiny:busy'); jQuery(document).trigger('shiny:idle'); window.completeBlob(new Blob(['png'], {type:'image/png'})); });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.tc-node.tc-stale').count(), 0);
    assert.equal(await page.locator('.tc-snapshot-exports button:disabled').count(), 0);
    await page.evaluate(() => { window.completeBlob = null; });
    await page.locator('.tc-snapshot-exports button', {hasText:'PNG'}).click();
    await page.waitForFunction(() => !!window.completeBlob);
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:3}})); window.completeBlob(new Blob(['png'], {type:'image/png'})); });
    await page.waitForTimeout(100);
    assert.ok((await page.locator('.tc-status').textContent()).includes('during export'));
    await page.evaluate(() => { const el=document.getElementById('results_dashboard-plot_pca'); el.data=[{type:'scatter',marker:{color:'#f00'}},{type:'scatter',marker:{color:'#00f'}}]; jQuery(el).trigger('shiny:value'); });
    assert.equal(await page.locator('.tc-node.tc-stale').count(), 1);
    assert.equal(await page.locator('.tc-snapshot-exports button:disabled').count(), 3);
    await page.locator('.tc-node-head button', {hasText:'Edit'}).click();
    assert.equal(await page.locator('.tc-node.tc-finished').count(), 0);
    assert.equal(await page.getByLabel('Plot title').inputValue(), '');
    assert.equal(await page.getByLabel('Uniform mark color').isDisabled(), true);
    const stylesBefore = await page.evaluate(() => calls.filter(c => c[0] === 'style').length);
    await page.getByLabel('Plot title').fill('New result'); await page.getByLabel('Plot title').dispatchEvent('change');
    assert.equal(await page.evaluate(() => calls.filter(c => c[0] === 'style').length), stylesBefore);
    await page.evaluate(() => { const el=document.getElementById('results_dashboard-plot_pca'); el.data=[{type:'scatter',marker:{color:['red','blue']}}]; jQuery(el).trigger('shiny:value'); });
    assert.equal(await page.getByLabel('Uniform mark color').isDisabled(), true);
    await page.locator('.tc-node-head button').last().click();
    assert.equal(await page.locator('#home #csv').count(), 1);
    assert.equal(await page.locator('#home #svg').count(), 1);
    assert.equal(await page.evaluate(() => TeamCanvas.selected()), null);
    await page.evaluate(() => { window.csvClicked = 0; document.getElementById('barchart-downloadBarCSV_Unfiltered').addEventListener('click', event => { event.preventDefault(); window.csvClicked++; }); });
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('barchart-barPlotUnfiltered')), true);
    await page.locator('.tc-csv').click();
    assert.equal(await page.evaluate(() => window.csvClicked), 1);
    assert.notEqual(await page.locator('#barchart-barPlotUnfiltered').evaluate(el => el.style.height), '600px');
    await page.locator('.tc-node-head button').last().click();
    assert.equal(await page.locator('#barchart-barPlotUnfiltered').evaluate(el => el.style.height), '600px');
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('barchart-barPlotUnfiltered')), true);
    await page.evaluate(() => { var replacement = document.createElement('div'); replacement.id = 'barchart-barPlotUnfiltered'; replacement.className = 'shiny-plot-output'; document.getElementById('analysis').appendChild(replacement); });
    await page.waitForFunction(() => document.querySelectorAll('[id="barchart-barPlotUnfiltered"]').length === 1);
    assert.equal(await page.locator('.tc-node').count(), 0);
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('barchart-barPlotUnfiltered')), false);
    assert.ok((await page.locator('.tc-status').textContent()).includes('source analysis replaced'));
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_pca')), true);
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_violin')), true);
    const apart = await page.locator('.tc-node').evaluateAll(nodes => {
      const [a,b] = nodes.map(n => n.getBoundingClientRect());
      return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
    });
    assert.equal(apart, true);
    await page.locator('.tc-node').first().evaluate(n => { n.style.left='40px'; n.style.top='900px'; });
    await page.locator('.tc-arrange').click();
    // Tidy up keeps reading order: PCA (moved left of Violin, within Violin's row) starts the first row.
    assert.deepEqual(await page.locator('[data-plot-id="results_dashboard-plot_pca"]').evaluate(n => [n.style.left, n.style.top]), ['30px', '30px'], 'the first card in reading order starts the first row');
    assert.ok(await page.locator('[data-plot-id="results_dashboard-plot_violin"]').evaluate(n => n.offsetLeft > 30 || n.offsetTop > 30),'the next card packs right or below according to viewport width');
    const note={paragraph:'Measured abundances vary across groups; mechanisms require independent validation.',context_label:'CE(14:0) distribution',searched_at:'2026-10-29',fingerprint:'a'.repeat(64),sources:[{pmid:'12345',title:'Lipid evidence',year:'2025',url:'https://pubmed.ncbi.nlm.nih.gov/12345/'}],stale:false};
    assert.equal(await page.evaluate(n=>TeamCanvas.setInsight('results_dashboard-plot_pca',n),note),true);
    const savedInsight=await page.evaluate(()=>TeamCanvas.serialize());
    assert.deepEqual(savedInsight.nodes.find(n=>n.id==='results_dashboard-plot_pca').insight,note);
    await page.evaluate(s=>TeamCanvas.restore(s),savedInsight);
    assert.deepEqual(await page.evaluate(()=>TeamCanvas.getInsight('results_dashboard-plot_pca')),note);
    await page.evaluate(()=>TeamCanvas.setInsight('results_dashboard-plot_pca',null));
    const deletedInsight=await page.evaluate(()=>TeamCanvas.serialize());
    assert.ok(!deletedInsight.nodes.find(n=>n.id==='results_dashboard-plot_pca').insight);
    await page.evaluate(s=>TeamCanvas.restore(s),deletedInsight);
    assert.equal(await page.evaluate(()=>TeamCanvas.getInsight('results_dashboard-plot_pca')),null);
    console.log('PASS insight checkpoint roundtrip and persisted deletion');
    console.log('PASS: canvas discovers, edits, restores, protects dynamic IDs and arranges plots');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
