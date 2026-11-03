const {chromium}=require('../browser/ci/node_modules/playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.goto(process.env.TEAM_TEST_URL||'http://127.0.0.1:44001');await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.$socket);
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));TeamCanvas.addCatalogPlot('cell_lipid_plot')});
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===1);let id=await page.locator('.tc-node').first().getAttribute('data-plot-id');let ns=id.slice(0,id.indexOf('-'));
 await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id);
 await page.evaluate(id=>TeamCanvas.duplicatePlot(id),id);await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2);let id2=await page.locator('.tc-node').nth(1).getAttribute('data-plot-id');let ns2=id2.slice(0,id2.indexOf('-'));
 await page.locator(`.tc-node[data-plot-id="${id2}"]`).getByRole('button',{name:'Data & settings',exact:true}).click();
 await page.evaluate(ns=>document.getElementById(ns+'-cell_class').selectize.setValue('PE'),ns2);
 await page.waitForFunction(ns=>document.getElementById(ns+'-cell_lipid').selectize.options['PE(36:2)'],ns2);
 await page.evaluate(ns=>document.getElementById(ns+'-cell_lipid').selectize.setValue('PE(36:2)'),ns2);
 await page.waitForFunction(id=>document.getElementById(id)?.data?.some(t=>t.y?.includes(50)),id2);
 let state=await page.evaluate(()=>TeamCanvas.serialize());
 for(let i=0;i<state.nodes.length;i++)for(let j=i+1;j<state.nodes.length;j++){const a=state.nodes[i],b=state.nodes[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'duplicate cards never overlap');}
 assert.equal(state.nodes[0].id,id2,'newest duplicate is first in saved order');assert.equal(state.nodes[0].x,30);assert.equal(state.nodes[0].y,30);
assert.equal(state.nodes.find(node=>node.id===id2).instance.inputs.cell_lipid,'PE(36:2)');assert.equal(state.nodes.find(node=>node.id===id).instance.inputs.cell_lipid,'PC(34:1)');
 for(let count=3;count<=4;count++){
   await page.evaluate(id=>TeamCanvas.duplicatePlot(id),id2);await page.waitForFunction(count=>document.querySelectorAll('.tc-node').length===count,count);
   await page.waitForFunction(()=>{const state=TeamCanvas.serialize(),id=state.nodes[0].id;return document.getElementById(id)?.data?.some(trace=>trace.y?.includes(50));});
   const repeated=await page.evaluate(()=>TeamCanvas.serialize());assert.equal(repeated.nodes[0].x,30);assert.equal(repeated.nodes[0].y,30);assert.equal(repeated.nodes[0].instance.inputs.cell_lipid,'PE(36:2)','repeat duplicate retains its source selection');
   for(let i=0;i<repeated.nodes.length;i++)for(let j=i+1;j<repeated.nodes.length;j++){const a=repeated.nodes[i],b=repeated.nodes[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'repeated duplicates never overlap');}
 }
 await page.reload();await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.$socket);await page.evaluate(state=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));TeamCanvas.restore(state)},state);
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2);await page.waitForFunction(id=>document.getElementById(id)?.data?.some(t=>t.y?.includes(50)),id2);
 assert.equal((await page.evaluate(()=>TeamCanvas.serialize())).nodes.find(node=>node.id===id2).instance.inputs.cell_lipid,'PE(36:2)');assert.equal(errors.length,0,errors.join(';'));console.log('PASS cell Canvas duplicate, local selectors and fresh-session checkpoint restore');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
