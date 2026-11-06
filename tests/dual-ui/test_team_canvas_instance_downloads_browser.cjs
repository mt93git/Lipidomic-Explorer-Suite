// Run with fixture_team_plot_instances_app.R listening on 43999.
const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:43999');await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.$inputValues['results_dashboard-violin_lipid']);
 for(const f of ['www/team/vendor/jspdf.umd.min.js','www/team/vendor/svg2pdf.umd.min.js'])await page.addScriptTag({path:path.resolve(f)});
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));TeamCanvas.addCatalogPlot('results_dashboard-plot_violin');});
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===1);const id=await page.locator('.tc-node').first().getAttribute('data-plot-id');
 await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id);
 await page.evaluate(id=>{TeamCanvas.copyPlot(id);TeamCanvas.pastePlot();},id);await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2);
 const id2=await page.locator('.tc-node').nth(1).getAttribute('data-plot-id'),ns2=id2.split('-')[0];
 await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id2);
 await page.locator('.tc-node').nth(1).getByRole('button',{name:'Data & settings'}).click();
 await page.evaluate(ns=>document.getElementById(ns+'-violin_lipid').selectize.setValue('PE(36:2)'),ns2);
 await page.waitForFunction(id=>document.getElementById(id)?.data?.some(t=>t.y?.some(y=>Math.abs(y-Math.log10(50))<1e-10)),id2);
 const results=[];
 for(let i=0;i<2;i++){
  const node=page.locator('.tc-node').nth(i); await page.waitForTimeout(1200);
  const csvEvent=page.waitForEvent('download'); const csvLink=node.getByRole('link',{name:'Plot data (CSV)'}); if(await csvLink.count()) await csvLink.click(); else await node.getByRole('button',{name:'Plot data (CSV)'}).click(); const csv=fs.readFileSync(await (await csvEvent).path(),'utf8');assert(csv.includes(i?'PE(36:2)':'PC(34:1)'));assert(!csv.includes(i?'PC(34:1)':'PE(36:2)'));
  await node.getByRole('button',{name:'Finish plot'}).click();await node.locator('.tc-snapshot').waitFor();
  const sizes={csv:Buffer.byteLength(csv)};
  for(const format of ['PNG','SVG','PDF']){const event=page.waitForEvent('download');await node.locator('.tc-snapshot').getByRole('button',{name:format,exact:true}).click();const data=fs.readFileSync(await (await event).path());assert(data.length>500);if(format==='PNG')assert.equal(data.subarray(1,4).toString(),'PNG');if(format==='SVG')assert(data.toString().includes('<svg'));if(format==='PDF')assert(data.toString().startsWith('%PDF-'));sizes[format]=data.length;const fallback=node.getByRole('link',{name:'Save '+format+' file'});assert.equal(await fallback.count(),1);const manual=page.waitForEvent('download');await fallback.click();assert.deepEqual(fs.readFileSync(await (await manual).path()),data);}
  results.push(sizes);
 }
 console.log('PASS Canvas Copy/Paste, independent PC/PE CSV downloads and PNG/SVG/PDF bytes for both plots',JSON.stringify(results));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
