// Integration test with the Plotly library installed by R's plotly package.
const {chromium} = require('../browser/ci/node_modules/playwright');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const plotly = execFileSync('Rscript', ['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js", package="plotly"))'], {encoding:'utf8'}).trim();
  assert.ok(plotly, 'R Plotly library is required');
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(4000);
    await page.setContent(`<div class="rd-card"><div class="rd-card-head"><h3>Principal component analysis</h3></div><div id="results_dashboard-plot_pca" class="plotly html-widget-output" style="height:420px"></div></div>
      <section id="team-canvas-root"><button class="tc-library-toggle"></button><div class="tc-layout"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><div class="tc-board"><div class="tc-empty"></div></div><div class="tc-status"></div></div></section>`);
    await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});
    const jquery = execFileSync('Rscript', ['--vanilla','-e','cat(system.file("www/shared/jquery.min.js",package="shiny"))'], {encoding:'utf8'}).trim();
    await page.addScriptTag({path:jquery});
    await page.addScriptTag({path:plotly});
    await page.addScriptTag({path:path.resolve('www/team/vendor/jspdf.umd.min.js')});
    await page.addScriptTag({path:path.resolve('www/team/vendor/svg2pdf.umd.min.js')});
    await page.evaluate(() => Plotly.newPlot('results_dashboard-plot_pca', [{type:'scatter',x:[1,2],y:[1,2]}], {margin:{t:10}}));
    await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
    assert.equal(await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_pca')), true);
    await page.locator('.tc-settings summary').click();
    await page.getByLabel('Plot title').fill('My PCA');
    await page.getByLabel('Plot title').press('Tab');
    await page.waitForFunction(() => document.querySelector('.gtitle')?.textContent === 'My PCA', {timeout:4000});
    assert.ok(await page.evaluate(() => document.getElementById('results_dashboard-plot_pca')._fullLayout.margin.t >= 40));
    const svg = await page.evaluate(async () => decodeURIComponent((await Plotly.toImage(document.getElementById('results_dashboard-plot_pca'), {format:'svg'})).split(',')[1]));
    assert.ok(svg.includes('My PCA'), 'SVG export should contain the title');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}})));
    await page.evaluate(async () => { var gd=document.getElementById('results_dashboard-plot_pca'); jQuery(gd).trigger('shiny:value'); await Plotly.react(gd, [{type:'scatter',x:[1,2,3],y:[1,2,3]}], {margin:{t:10}}); });
    await page.waitForTimeout(1000);
    await page.getByLabel('Plot title').fill('My PCA'); await page.getByLabel('Plot title').press('Tab');
    await page.evaluate(() => { window.resizeCount = 0; window.addEventListener('resize', () => window.resizeCount++); });
    await page.locator('.tc-settings summary').click();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.resizeCount), 0, 'collapsing appearance must not request a new plot');
    await page.locator('.tc-node-head button', {hasText:'Finish plot'}).click();
    await page.waitForTimeout(500); if (!(await page.locator('.tc-snapshot').count())) throw new Error('Finish blocked: ' + await page.locator('.tc-status').textContent());
    await page.waitForSelector('.tc-snapshot img');
    assert.ok((await page.locator('.tc-snapshot img').getAttribute('src')).startsWith('data:image/svg+xml'));
    const frozen = await page.locator('.tc-snapshot img').getAttribute('src');
    assert.ok(decodeURIComponent(frozen).includes('My PCA'), 'frozen SVG keeps the edited title after collapsing appearance');
    for (const format of ['PNG','SVG','PDF']) {
      const downloadPromise = page.waitForEvent('download', {timeout:10000});
      await page.locator('.tc-snapshot-exports button', {hasText:format}).click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'principal-component-analysis-rev1.' + format.toLowerCase());
      assert.equal(await download.failure(), null);
    }
    await page.locator('.tc-node-head button', {hasText:'Edit'}).click();
    await page.locator('.tc-settings summary').click();
    await page.getByLabel('Plot title').fill('');
    await page.getByLabel('Plot title').press('Tab');
    await page.waitForFunction(() => !document.querySelector('.gtitle')?.textContent, {timeout:4000});
    assert.equal(await page.evaluate(() => document.getElementById('results_dashboard-plot_pca').layout.margin.t), 10);
    console.log('PASS: real Plotly title appears, has margin, and clears to the original layout');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
