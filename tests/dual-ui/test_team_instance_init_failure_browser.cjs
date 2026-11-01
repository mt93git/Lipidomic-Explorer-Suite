// Start Rscript tests/dual-ui/fixture_team_plot_instances_app.R on port 43999.
const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.goto('http://127.0.0.1:43999');await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.$inputValues['results_dashboard-violin_lipid']);
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));TeamCanvas.addCatalogPlot('results_dashboard-plot_violin')});
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===1);const id=await page.locator('.tc-node').first().getAttribute('data-plot-id');await page.waitForFunction(id=>document.getElementById(id)?.data?.length,id);
 await page.evaluate(id=>{
  const original=Shiny.setInputValue;let failId=null;
  Shiny.setInputValue=function(key,value,options){if(key==='team_canvas_instance_create')failId=value.id;return original.call(this,key,value,options)};
  const get=document.getElementById.bind(document);document.getElementById=function(key){if(failId&&key===failId+'-plot_violin'&&get(failId+'_host')){failId=null;document.getElementById=get;throw Error('injected instance initialization failure')}return get(key)};
  TeamCanvas.duplicatePlot(id);
 },id);
 await page.waitForFunction(()=>document.querySelector('.tc-status')?.textContent.includes('could not be initialized'));
 assert.equal(await page.locator('.tc-node').count(),1);
 await page.evaluate(id=>TeamCanvas.duplicatePlot(id),id);await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2);
 console.log('PASS initialization exception clears pending request and permits a new duplicate');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
