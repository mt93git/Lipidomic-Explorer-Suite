// Start tests/dual-ui/fixture_team_plot_instances_app.R before running.
const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:43999');await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.$inputValues['results_dashboard-violin_lipid']);
 const snapshot='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%2F%3E%3C%2Fsvg%3E';
 const make=(id,lipid)=>({id:id+'-plot_violin',label:lipid,x:30,y:30,width:620,height:720,visual:{background:'#eef3fa'},finished:{url:snapshot,createdAt:'2026-10-29T00:00:00Z',stale:false},instance:{id,source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipid}}});
 const state={version:'1',libraryHidden:false,nodes:[make('tcinstance_busyone','PC(34:1)'),make('tcinstance_busytwo','PE(36:2)')]};
 await page.evaluate(()=>{const list=document.documentElement.classList, original=list.contains.bind(list);list.contains=function(name){return name==='shiny-busy'||original(name)};TeamCanvas.addCatalogPlot('results_dashboard-plot_heat');});
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===1,null,{timeout:12000});
 const added=await page.evaluate(()=>TeamCanvas.serialize().nodes[0]);assert.equal(added.instance.source,'results_dashboard-plot_heat','unrelated busy status does not prevent a new plot with stable local inputs');
 await page.evaluate(state=>TeamCanvas.restore(state),state);
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node.tc-finished').length===2,null,{timeout:12000});
 const saved=await page.evaluate(()=>TeamCanvas.serialize());assert.equal(saved.nodes.length,2);assert.equal(saved.nodes[0].instance.inputs.violin_lipid,'PC(34:1)');assert.equal(saved.nodes[1].instance.inputs.violin_lipid,'PE(36:2)');assert.equal(saved.nodes[1].visual.background,'#eef3fa');assert.ok(saved.nodes[1].finished);assert.deepEqual(errors,[]);
 console.log('PASS: two saved independent plots and archived snapshots restore while global Shiny busy remains asserted');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
