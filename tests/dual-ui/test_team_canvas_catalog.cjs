// Run with: node tests/dual-ui/test_team_canvas_catalog.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('../browser/ci/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body>
      <div id="analysis">
        <div id="barchart-barPlotUnfiltered" class="shiny-plot-output" style="height:600px"></div>
        <div id="dynamic-host" class="shiny-html-output"><div id="barchart-donutPlotUnfiltered" class="shiny-plot-output js-plotly-plot"></div></div>
        <div id="outer-dynamic-host" class="shiny-html-output"><div id="inner-dynamic-host" class="shiny-html-output"><div id="structural_tab-speciesPlotPlot" class="shiny-plot-output"></div></div></div>
        <div id="guide_metadata" class="html-widget-output datatables"><table><tbody><tr><td>guide metadata row</td></tr></tbody></table></div>
        <div id="guide_history" class="html-widget-output"><div class="dataTables_wrapper"><table><tbody><tr><td>guide history row</td></tr></tbody></table></div></div>
        <div id="bqcFilteredTable" class="html-widget-output datatables"><table></table></div>
        <div id="bqcTable" class="html-widget-output datatables"><table></table></div>
        <div id="diffAcylTable" class="html-widget-output datatables"><table></table></div>
        <div id="tableBiomarkers" class="html-widget-output datatables"><table></table></div>
        <div id="corrTable" class="html-widget-output datatables"><table></table></div>
        <div id="summaryTable" class="html-widget-output datatables"><table></table></div>
        <div id="ledger_table" class="html-widget-output datatables"><table></table></div>
      </div>
      <section id="team-canvas-root"><details class="tc-view-settings"><summary>Plot settings</summary><div class="tc-settings-dock"></div></details>
        <input class="tc-search" aria-label="Search plots"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange">Arrange</button>
        <button class="tc-library-toggle">Hide library</button><div class="tc-layout"><div class="tc-scroll"><div class="tc-board"><div class="tc-empty"></div></div></div><div class="tc-status"></div></div>
      </section><script>window.routeCalls=[]; window.unbindCalls=0; window.Shiny={setInputValue:(name,value)=>routeCalls.push([name,value]),unbindAll:()=>window.unbindCalls++};</script>
    </body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});
    await page.addStyleTag({path:path.resolve('www/team/css/canvas_catalog.css')});
    const jquery = execFileSync('Rscript', ['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'], {encoding:'utf8'}).trim();
    await page.addScriptTag({path:jquery});
    await page.addScriptTag({path:path.resolve('www/team/js/canvas_catalog.js')});
    await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});

    const catalog = await page.evaluate(() => TeamCanvasCatalog.list);
    const expectedIds = `
      results_dashboard-plot_pca results_dashboard-plot_violin results_dashboard-plot_dist results_dashboard-plot_comp results_dashboard-plot_heat
      qc_pca_tab-boxplotAfterNorm qc_pca_tab-outlierPlot qc_pca_tab-pca2dPlot qc_pca_tab-pca2dVectorPlot qc_pca_tab-pca3dPlot qc_pca_tab-load2dPlot qc_pca_tab-load2dVectorPlot qc_pca_tab-load3dPlot qc_pca_tab-sampleCorrPlot qc_pca_tab-bqcPlot qc_pca_tab-bqcDeviationPlot qc_pca_tab-bqcAbundancePlot qc_pca_tab-outlierPcaPlot qc_pca_tab-guided_qc_plot
      barchart-barPlotUnfiltered barchart-barPlotFiltered barchart-donutPlotUnfiltered barchart-donutPlotFiltered
      volcano_tab-volcanoPlot lsea_tab-lseaPlot fla_tab-plotVolcano structural_tab-diffAcylPlot
      heatmap_barchart_tab-heatmapPlot heatmap_barchart_tab-heatmapSDPlot heatmap_barchart_tab-filteredHeatmapPlot heatmap_barchart_tab-filteredHeatmapSDPlot heatmap_barchart_tab-violin_plot_render
      structural_tab-summaryPlot structural_tab-speciesPlotPlot structural_tab-networkPlot structural_tab-propPlotPlot structural_grid_tab-heatmapPlot structural_grid_tab-dotplotPlot structural_grid_tab-mergedPlot structural_grid_tab-diffAllPlot
      group_comparison_tab-comparisonPlot logratio_tab-logratioPlot fla_tab-logratioPlot fla_tab-plotCircos
      longitudinal_tab-macroclass_plot longitudinal_tab-subclass_plot longitudinal_tab-index_plot longitudinal_tab-struct_plot longitudinal_tab-allmetrics_plot
      pathway_tab-pathwayPlot pathway_tab-pathwayVisNetwork cellular_org_tab-stressPlot cellular_org_tab-cpiPlot cellular_org_tab-polarPlot
      cell_lipid_plot cell_profile_plot cell_class_plot cell_comparison_plot export_studio-studio_preview_plot
    `.trim().split(/\s+/).sort();
    assert.deepEqual(catalog.map(item => item.id).sort(), expectedIds, 'catalog registry IDs must match the reviewed static manifest; this does not validate every plot scale or scientific use');
    assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length, 'catalog IDs must be stable and unique');
    assert.ok(catalog.some(item => item.id === 'longitudinal_tab-allmetrics_plot' && item.title === 'Time course · all metrics'));
    assert.ok(catalog.some(item => item.id === 'heatmap_barchart_tab-violin_plot_render'));
    assert.ok(!(await page.locator('.tc-list').textContent()).includes('results_dashboard-plot_pca'));
    assert.ok((await page.locator('.tc-list').textContent()).includes('Principal components'));
    const dashboard = page.locator('.tc-catalog-group').filter({has:page.locator('summary', {hasText:'Dashboard'})});
    const dashboardGlyphs = await dashboard.locator('.tc-catalog-item').evaluateAll(items => items.map(item => ({title:item.querySelector('strong').textContent, paths:item.querySelector('button svg g').innerHTML, ariaHidden:item.querySelector('button svg').getAttribute('aria-hidden'), name:item.querySelector('button').getAttribute('aria-label'), description:item.querySelector('button').getAttribute('aria-describedby')})));
    assert.equal(dashboardGlyphs.length,5);
    assert.equal(new Set(dashboardGlyphs.map(entry=>entry.paths)).size,5,'each dashboard plot has a distinct plot-specific glyph');
    assert.ok(dashboardGlyphs.every(entry=>entry.ariaHidden==='true' && entry.name && entry.description),'icon buttons expose a name and tooltip description');
    assert.equal(await dashboard.locator('.tc-catalog-group-count').textContent(), '5', 'group heading shows the matching plot count');
    const firstAction = dashboard.locator('.tc-catalog-action').first();
    assert.equal(await firstAction.evaluate(el => getComputedStyle(el).color), 'rgb(49, 92, 137)', 'plot icons use the navy token');
    await firstAction.focus();
    assert.equal(await firstAction.evaluate(el => document.getElementById(el.getAttribute('aria-describedby')).classList.contains('is-visible')), true, 'keyboard focus shows the tooltip');
    assert.match(await firstAction.evaluate(el => document.getElementById(el.getAttribute('aria-describedby')).textContent), /Principal components · Dashboard.*Compare sample structure.*0 on canvas/);
    assert.equal(await firstAction.getAttribute('title'),null,'custom tooltips do not duplicate a native title tooltip');
    await firstAction.press('Escape');
    assert.equal(await firstAction.evaluate(el => document.getElementById(el.getAttribute('aria-describedby')).classList.contains('is-visible')), false, 'Escape closes a focused tooltip');
    assert.equal(await firstAction.evaluate(el => document.activeElement===el),true,'closing a tooltip keeps keyboard focus in the catalog');
    await firstAction.blur();
    assert.equal(await firstAction.evaluate(el => document.getElementById(el.getAttribute('aria-describedby')).classList.contains('is-visible')), false, 'blur hides the tooltip');
    for (const group of await page.locator('.tc-catalog-group').all()) if (!(await group.evaluate(el => el.open))) await group.locator('summary').click();

    const status = async id => page.evaluate(id => TeamCanvas.listPlots().find(plot => plot.id === id), id);
    const studioId='export_studio-studio_preview_plot';
    const studioCard=page.locator('[data-catalog-id="'+studioId+'"]');
    assert.equal((await status(studioId)).routeOnly,true);
    assert.equal(await studioCard.getByRole('button',{name:'Open export studio',exact:true}).count(),1);
    assert.equal(await page.evaluate(id=>TeamCanvas.queuePlot(id),studioId),false,'dedicated studio never queues a preview that discover excludes');
    assert.equal(await page.evaluate(id=>TeamCanvas.addCatalogPlot(id),studioId),false);
    assert.equal((await status(studioId)).pending,false);
    await studioCard.getByRole('button',{name:'Open export studio',exact:true}).click();
    assert.equal((await page.evaluate(()=>routeCalls.at(-1)))[0],'guide_export_studio');
    assert.match(await page.locator('.tc-status').textContent(),/Opened Export studio/);
    assert.equal((await status('barchart-barPlotUnfiltered')).status, 'Add to check');
    assert.equal((await status('barchart-donutPlotUnfiltered')).status, 'Add to check');
    assert.equal((await status('barchart-barPlotUnfiltered')).available, true, 'empty mounted output remains addable while its status is truthful');
    const notYetVisible=page.locator('.tc-catalog-item').filter({hasText:'Composition · unfiltered'}).getByRole('button',{name:'Add'});
    assert.equal(await notYetVisible.getAttribute('title'),null,'plot guidance is not duplicated in a native title tooltip');
    await notYetVisible.focus();
    assert.match(await notYetVisible.evaluate(el=>document.getElementById(el.getAttribute('aria-describedby')).textContent),/plot is not visible yet.*check whether its analysis has produced a figure/,'plot guidance remains readable in the custom keyboard tooltip');
    await notYetVisible.blur();
    await page.evaluate(() => {
      const list=document.createElement('div');list.id='unavailable-catalog-test';document.body.appendChild(list);
      const output=document.createElement('div');output.id='unknown-unavailable-output';output.className='shiny-plot-output';
      const record={el:output,label:'Unattached output',instance:null,node:null,dynamic:false,wrapper:null};
      window.unavailableActions=0;
      TeamCanvasCatalog.render({list:list,filter:'Unattached output',records:new Map([[output.id,record]]),pending:new Set(),routeFor:()=>null,repeatable:()=>false,onAdd:()=>{unavailableActions++;},onQueue:()=>{unavailableActions++;},onCancel:()=>{unavailableActions++;},onRoute:()=>{unavailableActions++;}});
    });
    const unavailable=page.locator('#unavailable-catalog-test .tc-catalog-action');
    assert.equal(await unavailable.evaluate(el=>el.disabled),false,'unavailable reason stays reachable by keyboard');
    assert.equal(await unavailable.getAttribute('aria-disabled'),'true');
    await unavailable.focus();
    assert.equal(await unavailable.evaluate(el=>document.getElementById(el.getAttribute('aria-describedby')).classList.contains('is-visible')),true);
    assert.match(await unavailable.evaluate(el=>document.getElementById(el.getAttribute('aria-describedby')).textContent),/Open the analysis and wait for this plot to render before adding it/);
    await unavailable.evaluate(el=>el.click());
    assert.equal(await page.evaluate(()=>unavailableActions),0,'aria-disabled unavailable action is guarded from activation');
    await page.locator('#unavailable-catalog-test').evaluate(el=>el.remove());
    const tableIds = ['guide_metadata','guide_history','bqcFilteredTable','bqcTable','diffAcylTable','tableBiomarkers','corrTable','summaryTable','ledger_table'];
    const discoveredIds = await page.evaluate(() => TeamCanvas.listPlots().map(plot => plot.id));
    assert.deepEqual(discoveredIds.filter(id => tableIds.includes(id)), [], 'DataTable/HTML table widgets are not discovered as plots');
    assert.equal(await page.locator('.tc-catalog-item').filter({hasText:'guide metadata row'}).count(), 0, 'table contents never leak into the discovered plot palette');
    assert.equal((await status('results_dashboard-plot_pca')).status, 'Requires configuration');
    const selectedViolinId = 'heatmap_barchart_tab-violin_plot_render';
    const selectedViolin = await status(selectedViolinId);
    assert.equal(selectedViolin.available, false, 'unmounted violin still requires analysis configuration');
    assert.equal(Boolean(selectedViolin.blocked), false, 'the independently tested Team scale adapter enables selected-feature distributions');
    await page.evaluate(id=>{const plot=document.createElement('div');plot.id=id;plot.className='shiny-plot-output';document.getElementById('analysis').appendChild(plot);},selectedViolinId);
    await page.waitForFunction(id=>TeamCanvas.listPlots().find(plot=>plot.id===id).available,selectedViolinId);
    assert.equal(await page.evaluate(id=>TeamCanvas.addCatalogPlot(id),selectedViolinId),true);
    assert.equal(await page.locator('.tc-node #'+selectedViolinId).count(),1);
    await page.locator('.tc-node-head button', {hasText:'Return'}).click();
    assert.equal(await page.evaluate(id=>TeamCanvas.addPlot(id), 'structural_tab-speciesPlotPlot'),false,'nested renderUI plots cannot be moved from inside an outer dynamic ancestor');
    assert.equal(await page.evaluate(id=>TeamCanvas.queuePlot(id,{tool:'Structural'}),'structural_tab-speciesPlotPlot'),false,'nested renderUI plots cannot be queued for unsafe movement');
    assert.equal((await status('structural_tab-speciesPlotPlot')).available,false);
    const nestedCard = page.locator('.tc-catalog-item').filter({hasText:'Species structural features'});
    assert.equal(await nestedCard.getByRole('button',{name:'Open analysis'}).isVisible(),true,'nested renderUI output stays available as a route-only catalog item');
    await nestedCard.getByRole('button',{name:'Open analysis'}).click();
    assert.deepEqual(await page.evaluate(()=>routeCalls.at(-1)),['guide_open_tool','Structural']);
    const queuedNestedId='structural_grid_tab-heatmapPlot';
    assert.equal(await page.evaluate(id=>TeamCanvas.queuePlot(id,{tool:'Structural Grid'}),queuedNestedId),true);
    await page.evaluate(id=>{
      const outer=document.createElement('div'); outer.id='late-outer-render'; outer.className='shiny-html-output';
      const inner=document.createElement('div'); inner.id='late-inner-render'; inner.className='shiny-html-output';
      const plot=document.createElement('div'); plot.id=id; plot.className='shiny-plot-output'; inner.appendChild(plot); outer.appendChild(inner); document.getElementById('analysis').appendChild(outer);
    },queuedNestedId);
    await page.waitForFunction(id=>!TeamCanvas.listPlots().find(plot=>plot.id===id).pending,queuedNestedId);
    assert.equal((await status(queuedNestedId)).available,false,'unsafe nested output clears rather than leaving its queued add pending');
    assert.match(await page.locator('.tc-status').textContent(),/Could not add.*Structural grid · selected class heatmap.*nested or shared dynamic panel/);

    await page.getByLabel('Search plots').fill('');

    const barAdd = page.locator('.tc-catalog-item').filter({hasText:'Composition · unfiltered'}).getByRole('button', {name:'Add'});
    await barAdd.focus(); await barAdd.click();
    assert.equal((await status('barchart-barPlotUnfiltered')).status, 'Added');
    assert.equal(await page.locator('.tc-node #barchart-barPlotUnfiltered').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-catalog-id]')?.dataset.catalogId), 'barchart-barPlotUnfiltered', 'catalog rerender keeps keyboard focus on the plot whose Add action completed');
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineColor), 'rgb(49, 92, 137)', 'retained keyboard focus is visible in the brand blue');
    await page.locator('.tc-node-head button', {hasText:'Return'}).click();
    assert.equal(await page.locator('#analysis #barchart-barPlotUnfiltered').count(), 1);

    const wrapper = await page.locator('#dynamic-host').evaluate(el => el);
    await page.locator('.tc-catalog-item').filter({hasText:'Composition share · unfiltered'}).getByRole('button', {name:'Add'}).click();
    assert.equal(await page.locator('.tc-node #dynamic-host #barchart-donutPlotUnfiltered').count(), 1, 'moving a renderUI plot must keep its original bound wrapper intact');
    assert.equal(await page.locator('#dynamic-host').evaluate(el => el.id), 'dynamic-host');
    for (let cycle=0; cycle<5; cycle++) {
      await page.evaluate(() => {
        const old=document.getElementById('barchart-donutPlotUnfiltered'), fresh=document.createElement('div');
        fresh.id=old.id; fresh.className='shiny-plot-output'; old.replaceWith(fresh); jQuery(fresh).trigger('shiny:value');
      });
      await page.waitForFunction(() => document.querySelectorAll('#dynamic-host #barchart-donutPlotUnfiltered').length === 1);
      await page.waitForTimeout(280);
      assert.equal(await page.locator('.tc-node #dynamic-host #barchart-donutPlotUnfiltered').count(), 1, 'renderUI refresh must keep the original wrapper and only one output mounted');
      assert.equal(await page.locator('.tc-node').count(), 1, 'repeated renderUI refresh must not duplicate canvas nodes');
    }
    assert.equal(await page.evaluate(() => window.unbindCalls), 0, 'inner renderUI replacement must preserve the bound parent wrapper');
    await page.locator('.tc-node-head button', {hasText:'Return'}).click();
    assert.equal(await page.locator('#analysis > #dynamic-host').count(), 1);

    await page.evaluate(() => { const el=document.createElement('div'); el.id='pathway_tab-pathwayVisNetwork'; el.className='html-widget-output'; document.getElementById('analysis').appendChild(el); });
    await page.waitForFunction(() => document.querySelector('.tc-catalog-item button:not(:disabled)') && TeamCanvas.listPlots().find(plot => plot.id === 'pathway_tab-pathwayVisNetwork').available);
    assert.ok((await page.evaluate(() => TeamCanvas.listPlots().map(plot => plot.id)).then(ids => ids.includes('pathway_tab-pathwayVisNetwork'))), 'non-table visNetwork output remains discoverable');
    await page.locator('.tc-catalog-item').filter({hasText:'Interactive pathway network'}).getByRole('button', {name:'Add'}).click();
    assert.equal(await page.locator('.tc-node-head button', {hasText:'Live only'}).isDisabled(), true, 'unsupported capture must be stated on the live network card');
    await page.locator('.tc-node-head button', {hasText:'Return'}).click();

    await page.locator('.tc-catalog-item').filter({hasText:'Principal components'}).getByRole('button', {name:'Add'}).click();
    assert.equal((await status('results_dashboard-plot_pca')).status, 'Queued: Principal components');
    const queuedPalette = await page.locator('.tc-catalog-item').filter({hasText:'Principal components'}).evaluate(item => ({border:getComputedStyle(item.querySelector('button')).borderTopColor,background:getComputedStyle(item.querySelector('button')).backgroundColor}));
    assert.deepEqual(queuedPalette,{border:'rgb(49, 92, 137)',background:'rgb(232, 239, 247)'},'queued state stays within the blue brand palette');
    assert.match((await page.evaluate(()=>TeamCanvas.previewState())).message,/Principal components/,'preview block must name the pending add');
    await page.locator('.tc-catalog-item').filter({hasText:'Principal components'}).getByRole('button', {name:'Cancel queued add: Principal components'}).click();
    assert.equal((await status('results_dashboard-plot_pca')).status, 'Requires configuration');
    await page.locator('.tc-catalog-item').filter({hasText:'Principal components'}).getByRole('button', {name:'Add'}).click();
    assert.deepEqual(await page.evaluate(() => routeCalls.at(-1)), ['guide_open_tool','Quality Check']);
    await page.evaluate(() => {
      const card=document.createElement('div'); card.className='rd-card';
      const download=document.createElement('a'); download.id='results_dashboard-dl_pca'; download.className='shiny-download-link rd-dl'; download.href='/download/fresh-pca.csv'; download.textContent='Plot data (CSV)';
      const plot=document.createElement('div'); plot.id='results_dashboard-plot_pca'; plot.className='plotly html-widget-output'; card.append(download,plot); document.getElementById('analysis').appendChild(card);
    });
    await page.waitForFunction(() => document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_pca"]'));
    assert.equal((await status('results_dashboard-plot_pca')).status, 'Added');
    assert.equal(await page.locator('.tc-node[data-plot-id="results_dashboard-plot_pca"] #results_dashboard-dl_pca').count(), 1, 'the dashboard CSV download stays visible inside its moved wrapper');
    assert.equal(await page.locator('.tc-node[data-plot-id="results_dashboard-plot_pca"] .tc-export-note').count(), 0, 'a visible dashboard CSV is not accompanied by a false no-CSV warning');

    await page.evaluate(() => {
      const card=document.createElement('div'); card.className='rd-card';
      const plot=document.createElement('div'); plot.id='results_dashboard-plot_heat'; plot.className='plotly html-widget-output'; card.appendChild(plot); document.getElementById('analysis').appendChild(card);
    });
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_heat')), true, 'a dashboard plot can be added before its download link mounts');
    const heatNode=page.locator('.tc-node[data-plot-id="results_dashboard-plot_heat"]');
    assert.equal(await heatNode.locator('.tc-csv').count(),1,'mapped dashboard CSV falls back to a proxy when the source link has not mounted');
    await page.evaluate(() => {
      const node=document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_heat"]'), source=document.createElement('a');
      source.id='results_dashboard-dl_heat'; source.className='shiny-download-link'; source.href='#'; source.textContent='Plot data (CSV)'; window.csvSourceClicks=0; source.addEventListener('click',event=>{event.preventDefault();window.csvSourceClicks++;}); node.querySelector('.tc-content').appendChild(source);
    });
    await heatNode.locator('.tc-csv').click();
    assert.equal(await page.evaluate(()=>window.csvSourceClicks),0,'the CSV proxy rejects a placeholder href instead of invoking stale download state');
    await page.evaluate(() => { const source=document.getElementById('results_dashboard-dl_heat'); source.href='/download/fresh-heat.csv'; });
    await heatNode.locator('.tc-csv').click();
    assert.equal(await page.evaluate(()=>window.csvSourceClicks),1,'the CSV proxy clicks the current non-placeholder source link');
    for (const [plotId, downloadId] of [
      ['results_dashboard-plot_violin','results_dashboard-dl_violin'],
      ['results_dashboard-plot_comp','results_dashboard-dl_comp'],
      ['results_dashboard-plot_dist','results_dashboard-dl_dist']
    ]) {
      await page.evaluate(({plotId,downloadId}) => {
        const card=document.createElement('div'); card.className='rd-card';
        const download=document.createElement('a'); download.id=downloadId; download.className='shiny-download-link rd-dl'; download.href='/download/current.csv'; download.textContent='Plot data (CSV)';
        const plot=document.createElement('div'); plot.id=plotId; plot.className='plotly html-widget-output'; card.append(download,plot); document.getElementById('analysis').appendChild(card);
      },{plotId,downloadId});
      assert.equal(await page.evaluate(id=>TeamCanvas.addPlot(id),plotId),true,plotId+' remains addable with its actual dashboard CSV control');
      const node=page.locator('.tc-node').filter({has:page.locator('#'+plotId)});
      assert.equal(await node.locator('#'+downloadId).count(),1,plotId+' keeps its actual dashboard download link in the moved wrapper');
      assert.equal(await node.locator('.tc-export-note').count(),0,plotId+' does not receive a false missing-CSV warning');
    }

    await page.getByLabel('Search plots').fill('longitudinal');
    assert.ok((await page.locator('.tc-list').textContent()).includes('Time course · all metrics'));
    assert.equal(await page.locator('.tc-catalog-item').count(), 5);
    await page.clock.install({time:new Date('2026-10-28T12:00:00Z')});
    assert.equal(await page.evaluate(()=>TeamCanvas.queuePlot('longitudinal_tab-allmetrics_plot',{tool:'Longitudinal'})),true);
    assert.equal((await status('longitudinal_tab-allmetrics_plot')).pending,true);
    await page.clock.runFor(90001);
    assert.equal((await status('longitudinal_tab-allmetrics_plot')).pending,false,'unresolved configuration expires instead of blocking the canvas indefinitely');
    assert.match(await page.locator('.tc-status').textContent(),/Queued add expired.*Time course · all metrics/);
    await page.evaluate(id=>TeamCanvas.restore({version:'1',libraryHidden:false,nodes:[{id:id,label:'Old saved distribution',x:10,y:10,width:620,height:500,visual:{},finished:null}]}),selectedViolinId);
    assert.equal((await page.evaluate(()=>TeamCanvas.serialize())).nodes.some(node=>node.id===selectedViolinId),true,'restored selected-feature distribution uses the validated Team adapter');
    console.log(`PASS: ${catalog.length} stable catalog entries, live and renderUI adds, queued routes, search and states`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
