// Plotly/HTMLWidgets regression: geometry redraw must not stale a finished figure.
const { chromium } = require('../browser/ci/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const jquery=execFileSync('Rscript',['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'],{encoding:'utf8'}).trim();
  const plotly=execFileSync('Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1200,height:1000},acceptDownloads:true});
    await page.setContent(`<div class="rd-dashboard"><div class="rd-card"><div class="rd-card-head"><h3>Abundance distribution</h3><a href="/data.csv">CSV</a></div><div id="results_dashboard-plot_dist" class="plotly html-widget-output" style="height:420px"></div></div></div><section id="team-canvas-root"><button class="tc-library-toggle"></button><div class="tc-layout"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><div class="tc-scroll" style="height:600px"><div class="tc-board"><div class="tc-empty"></div></div></div><div class="tc-status"></div></div></section>`);
    await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});
    await page.addScriptTag({path:jquery}); await page.addScriptTag({path:plotly});
    await page.evaluate(() => Plotly.newPlot('results_dashboard-plot_dist',[{type:'scatter',x:[1,2,3],y:[2,3,4]}],{margin:{t:10},xaxis:{title:'Sample'}}));
    await page.addStyleTag({path:path.resolve('www/team/css/canvas_viewport.css')});
    await page.addScriptTag({path:path.resolve('www/team/js/canvas_viewport.js')});
    await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
    await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_dist'));
    const data=[{type:'scatter',x:[1,2,3],y:[2,3,4]}], layout={margin:{t:10},xaxis:{title:'Sample'},width:500,height:400};
    async function output(d,l) { await page.evaluate(async ({d,l}) => {const gd=document.getElementById('results_dashboard-plot_dist');jQuery(gd).trigger({type:'shiny:value',value:{x:{data:d,layout:l}}});await Plotly.react(gd,d,l);},{d,l}); await page.waitForTimeout(450); }
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}})));
    await output(data,layout);
    assert.equal(await page.locator('.tc-paste-plot').isDisabled(),true,'empty clipboard cannot paste');
    await page.evaluate(({data,layout})=>{
      window.captureOriginal=Plotly.toImage;
      Plotly.toImage=async function(...args){jQuery(document).trigger('shiny:busy');jQuery(document.getElementById('results_dashboard-plot_dist')).trigger({type:'shiny:value',value:{x:{data,layout}}});return captureOriginal.apply(this,args);};
    },{data,layout});
    await page.locator('.tc-node-head button',{hasText:'Finish plot'}).click();await page.waitForSelector('.tc-snapshot img');
    assert.equal((await page.evaluate(()=>TeamCanvas.serialize())).nodes[0].finished.stale,false,'unrelated global activity cannot abort own capture');
    await page.evaluate(({data,layout})=>{
      HTMLImageElement.prototype.decode=async function(){jQuery(document).trigger('shiny:busy');jQuery(document.getElementById('results_dashboard-plot_dist')).trigger({type:'shiny:value',value:{x:{data,layout}}});};
    },{data,layout});
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'SVG',exact:true}).click();await downloaded;
    assert.equal((await page.evaluate(()=>TeamCanvas.serialize())).nodes[0].finished.stale,false,'immutable SVG survives activity during decode');
    await page.evaluate(()=>{HTMLImageElement.prototype.decode=async function(){jQuery(document.getElementById('results_dashboard-plot_dist')).trigger('shiny:error');};});
    await page.getByRole('button',{name:'SVG',exact:true}).click();await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>TeamCanvas.serialize())).nodes[0].finished.stale,true,'own source errors still reject export');
    console.log('PASS scoped capture and immutable SVG export tolerate unrelated busy/equivalent activity; own source error rejects');

  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
