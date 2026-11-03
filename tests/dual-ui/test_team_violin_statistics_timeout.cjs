// Run against the focused real Shiny fixture: Rscript tests/dual-ui/fixture_team_violin_statistics_app.R
const {chromium}=require('../browser/ci/node_modules/playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.goto('http://127.0.0.1:44011');await page.waitForFunction(()=>window.TeamCanvas&&window.TeamCanvasStatistics&&window.Shiny?.shinyapp?.$inputValues['results_dashboard-violin_lipid']);
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));window.statsRequests=[];const send=Shiny.setInputValue;Shiny.setInputValue=function(name,value,options){if(name==='team_violin_stats_request')statsRequests.push(value.mode);return send.call(this,name,value,options);};});
 const annotations=id=>page.evaluate(id=>(document.getElementById(id)?.layout?.annotations||[]).filter(a=>String(a.name||'').startsWith('tcstat-label')).map(a=>({text:a.text,size:a.font&&a.font.size})),id);
 const applies=()=>page.evaluate(()=>statsRequests.filter(m=>m==='apply').length);
 await page.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin'));
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node[data-plot-id*="tcinstance_"]').length===1);
 const id=await page.locator('.tc-node').first().getAttribute('data-plot-id');
 await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id);
 await page.locator('.tc-node[data-plot-id="'+id+'"] .tc-node-head').focus();
 await page.getByRole('tab',{name:'Statistics'}).click();
 const panel=page.locator('#tc-inspector-panel-statistics .tc-statistics');
 await panel.getByLabel('B vs A').first().waitFor();assert.equal(await panel.locator('.tcs-comparisons').getByLabel('B vs A').isChecked(),true);
 assert.match(await panel.locator('.tcs-status').textContent(),/No statistics applied/);

 // Staged scientific edits never compute; Cancel keeps them staged; Discard reverts.
 await panel.getByLabel('Test',{exact:true}).selectOption('wilcoxon');
 assert.match(await panel.locator('.tcs-family').textContent(),/Unconfirmed changes/);
 await panel.getByRole('button',{name:'Review and confirm…'}).click();
 await panel.getByRole('heading',{name:'Confirm statistical analysis'}).waitFor();
 assert.match(await panel.locator('.tcs-confirm').textContent(),/Tests in family \(m\)/);
 await panel.getByLabel('Multiple-testing correction',{exact:true}).selectOption('BH');assert.equal(await panel.locator('.tcs-confirm').isHidden(),true,'editing science closes stale review');await panel.getByLabel('Multiple-testing correction',{exact:true}).selectOption('holm');await panel.getByRole('button',{name:'Review and confirm…'}).click();
 await panel.getByRole('button',{name:'Cancel'}).click();
 assert.equal(await panel.locator('.tcs-confirm').isHidden(),true);assert.equal(await applies(),0,'cancel sends no computation');assert.deepEqual(await annotations(id),[]);
 await panel.getByRole('button',{name:'Review and confirm…'}).click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#tc-selection-inspector').isVisible(),true,'Escape closes only the review');assert.equal(await applies(),0);
 await panel.getByRole('button',{name:'Discard changes'}).click();assert.equal(await panel.getByLabel('Test',{exact:true}).inputValue(),'welch');


 await page.evaluate(()=>{const original=Shiny.setInputValue;let drop=true;Shiny.setInputValue=function(name,value,options){if(name==='team_violin_stats_request'&&value.mode==='apply'&&drop){drop=false;return;}return original.call(this,name,value,options);};});
 await panel.getByRole('button',{name:'Review and confirm…'}).click();await panel.getByRole('button',{name:'Confirm and compute'}).click();
 await page.waitForFunction(()=>document.querySelector('#tc-inspector-panel-statistics .tcs-status')?.dataset.status==='error',null,{timeout:40000});
 assert.match(await panel.locator('.tcs-status').textContent(),/did not reply in time/);assert.deepEqual(await annotations(id),[]);assert.equal((await page.evaluate(()=>TeamCanvas.serialize())).nodes.find(n=>n.id===id).statistics.applied,null);
 await panel.getByRole('button',{name:'Retry check',exact:true}).click();await panel.getByRole('button',{name:'Review and confirm…'}).click();await panel.getByRole('button',{name:'Confirm and compute'}).click();await page.waitForFunction(()=>document.querySelector('#tc-inspector-panel-statistics .tcs-status')?.dataset.status==='current');
 console.log('PASS missing reply times out safely, applies no analysis, retry check and explicit reconfirm recover');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
