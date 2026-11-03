// Run with fixture_team_legacy_instances_app.R on port 44001.
const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs/promises');
const scenarios=[
 {source:'cell_profile_plot',key:'cell_sample',value:'S2',csvKey:'Sample',expect:'S2',old:'S1'},
 {source:'cell_class_plot',key:'cell_comparison_group',value:'C',csvKey:'Group',expect:'C',old:'B'},
 {source:'cell_comparison_plot',key:'cell_comparison_group',value:'C',csvKey:'Group',expect:'C',old:'B'}
];
(async()=>{const browser=await chromium.launch();try{for(const scenario of scenarios){console.log('START',scenario.source);
 const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto('http://127.0.0.1:44001');await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.$socket);
 await page.evaluate(source=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));TeamCanvas.addCatalogPlot(source)},scenario.source);
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===1);const id=await page.locator('.tc-node').first().getAttribute('data-plot-id');
 await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id);
 await page.evaluate(id=>TeamCanvas.duplicatePlot(id),id);await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2);
 const id2=await page.locator('.tc-node').nth(1).getAttribute('data-plot-id'),ns2=id2.slice(0,id2.indexOf('-'));
 await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id2);
 await page.locator(`.tc-node[data-plot-id="${id2}"]`).getByRole('button',{name:'Data & settings',exact:true}).click();
 await page.selectOption(`#${ns2}-${scenario.key}`,scenario.value);
 await page.waitForFunction(({ns,key,value})=>Shiny.shinyapp.$inputValues[ns+'-'+key]===value,{ns:ns2,key:scenario.key,value:scenario.value});
 await page.waitForTimeout(1500);
 const download=async plot=>{const [item]=await Promise.all([page.waitForEvent('download'),page.locator(`.tc-node[data-plot-id="${plot}"] .tc-csv`).click()]);return await fs.readFile(await item.path(),'utf8')};
 const first=await download(id),second=await download(id2);assert.notEqual(first,second,scenario.source+' CSV must use independent settings');
 assert.match(first,new RegExp('"'+scenario.old+'"'));assert.match(second,new RegExp('"'+scenario.expect+'"'));
 let state=await page.evaluate(()=>TeamCanvas.serialize());assert.equal(state.nodes[1].instance.inputs[scenario.key],scenario.value);assert.equal(state.nodes[0].instance.inputs[scenario.key],scenario.old);
 await page.reload();await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.$socket);await page.evaluate(state=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));TeamCanvas.restore(state)},state);
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2,null,{timeout:15000}).catch(async e=>{console.log('restore diagnostic',await page.evaluate(()=>({nodes:[...document.querySelectorAll('.tc-node')].map(n=>n.dataset.plotId),status:[...document.querySelectorAll('[role=status]')].map(x=>x.textContent),hosts:[...document.querySelectorAll('.tc-instance-host')].map(x=>({id:x.id,inputs:[...x.querySelectorAll('select')].map(e=>({id:e.id,value:e.value})),outputs:[...x.querySelectorAll('.html-widget-output')].map(e=>({id:e.id,hasData:!!e.data,error:e.textContent}))})),shiny:Shiny.shinyapp.$inputValues})));throw e});await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id2);
 await page.waitForFunction(({ns,key,value})=>Shiny.shinyapp.$inputValues[ns+'-'+key]===value,{ns:ns2,key:scenario.key,value:scenario.value});
 let restored=await page.evaluate(()=>TeamCanvas.serialize());assert.equal(restored.nodes[1].instance.inputs[scenario.key],scenario.value);assert.equal(restored.nodes[0].instance.inputs[scenario.key],scenario.old);
 await page.waitForTimeout(1200);const reopened=await download(id2);assert.match(reopened,new RegExp('"'+scenario.expect+'"'));assert.equal(errors.length,0,errors.join(';'));
 console.log('PASS',scenario.source,'duplicate, independent control/CSV, fresh-session restore');
 }finally{await page.close()}
 }}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
