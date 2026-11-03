// Run against the focused real Shiny fixture: Rscript tests/dual-ui/fixture_team_violin_statistics_app.R
const {chromium}=require('../browser/ci/node_modules/playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({args:["--remote-debugging-port=49331"]});const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>ws.on('framereceived',f=>{try{let m=JSON.parse(f.payload)?.custom?.['team-violin-stats'];if(m)console.log('STATS_REPLY',m.mode,m.status,m.reason||'');}catch(e){}}));try{
 await page.goto('http://127.0.0.1:44011');await page.waitForFunction(()=>window.TeamCanvas&&window.TeamCanvasStatistics&&window.Shiny?.shinyapp?.$inputValues['results_dashboard-violin_lipid']);
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));window.statsRequests=[];const send=Shiny.setInputValue;Shiny.setInputValue=function(name,value,options){if(name==='team_violin_stats_request')statsRequests.push(value.mode);return send.call(this,name,value,options);};});
 const annotations=id=>page.evaluate(id=>(document.getElementById(id)?.layout?.annotations||[]).filter(a=>String(a.name||'').startsWith('tcstat-label')).map(a=>({text:a.text,size:a.font&&a.font.size})),id);
 const applies=()=>page.evaluate(()=>statsRequests.filter(m=>m==='apply').length);
 await page.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin'));
 await page.waitForFunction(()=>document.querySelectorAll('.tc-node[data-plot-id*="tcinstance_"]').length===1);
 const id=await page.locator('.tc-node').first().getAttribute('data-plot-id');
 await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id);
 await page.locator('.tc-node .tc-node-head').first().focus();
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
 await panel.getByRole('button',{name:'Cancel'}).click();
 assert.equal(await panel.locator('.tcs-confirm').isHidden(),true);assert.equal(await applies(),0,'cancel sends no computation');assert.deepEqual(await annotations(id),[]);
 await panel.getByRole('button',{name:'Review and confirm…'}).click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#tc-selection-inspector').isVisible(),true,'Escape closes only the review');assert.equal(await applies(),0);
 await panel.getByRole('button',{name:'Discard changes'}).click();assert.equal(await panel.getByLabel('Test',{exact:true}).inputValue(),'welch');

 // Confirm computes from the server; labels show the returned value.
 await panel.getByRole('button',{name:'Review and confirm…'}).click();if(!(await panel.getByRole('button',{name:'Confirm and compute'}).isEnabled())) console.log('CONFIRM_BLOCKED',await panel.locator('.tcs-confirm').textContent());await panel.getByRole('button',{name:'Confirm and compute'}).click();
 await page.waitForFunction(()=>document.querySelector('.tc-statistics .tcs-status')?.dataset.status==='current');
 assert.equal(await applies(),1);
 let saved=await page.evaluate(()=>TeamCanvas.serialize());let stats=saved.nodes.find(n=>n.id===id).statistics;
 assert.equal(stats.applied.test,'welch');assert.equal(stats.result.family.m,1);assert.equal(stats.result.groups.map(g=>g.nParticipants).join(','),'4,4');
 const p=stats.result.rows[0].pAdj;const exact=p<0.001?p.toExponential(1):p.toPrecision(2);
 await page.waitForFunction(id=>(document.getElementById(id)?.layout?.annotations||[]).some(a=>String(a.name||'').startsWith('tcstat-label')),id);
 assert.ok((await annotations(id)).some(a=>a.text.endsWith('(adj. p = '+exact+')')),'drawn label is the computed adjusted p');

 // Presentation is immediate and never recomputes or changes the family.
 await panel.getByLabel('Label',{exact:true}).selectOption('exact');await panel.getByLabel('Annotation font size').fill('16');
 await page.waitForFunction(id=>(document.getElementById(id)?.layout?.annotations||[]).some(a=>String(a.name||'').startsWith('tcstat-label')&&a.font.size===16&&a.text.startsWith('adj. p = ')),id);
 await panel.locator('.tcs-shown').getByLabel('B vs A').uncheck();
 await page.waitForFunction(id=>!(document.getElementById(id)?.layout?.annotations||[]).some(a=>String(a.name||'').startsWith('tcstat-label')),id);
 saved=await page.evaluate(()=>TeamCanvas.serialize());stats=saved.nodes.find(n=>n.id===id).statistics;
 assert.deepEqual(stats.presentation.hidden,[['A','B']]);assert.equal(stats.result.family.m,1);assert.equal(stats.applied.comparisons.length,1);assert.equal(await applies(),1);
 await panel.locator('.tcs-shown').getByLabel('B vs A').check();

 // CSV download is the current result with provenance.
 const [download]=await Promise.all([page.waitForEvent('download'),panel.getByRole('button',{name:'Statistics CSV'}).click()]);
 const csv=fs.readFileSync(await download.path(),'utf8');assert.match(csv,new RegExp(stats.result.fingerprint));assert.match(csv,/Holm/);assert.match(csv,/log10 of positive/);

 // Finish records statistics provenance in the frozen figure.
 await page.locator('.tc-node').first().getByRole('button',{name:'Finish plot'}).click();
 await page.waitForFunction(()=>document.querySelector('.tc-node.tc-finished'));
 saved=await page.evaluate(()=>TeamCanvas.serialize());
 assert.equal(saved.nodes.find(n=>n.id===id).finished.provenance.statisticsFingerprint,stats.result.fingerprint);assert.equal(saved.nodes.find(n=>n.id===id).finished.provenance.statisticsStatus,'current');
 await page.locator('.tc-node').first().getByRole('button',{name:'Edit'}).click();

 // Copies are independent: presentation is copied, scientific results are not.
 await page.evaluate(id=>TeamCanvas.duplicatePlot(id),id);await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2);
 const id2=await page.locator('.tc-node').nth(1).getAttribute('data-plot-id');await page.waitForFunction(id=>document.getElementById(id)?.data?.length>0,id2);
 saved=await page.evaluate(()=>TeamCanvas.serialize());
 assert.equal(saved.nodes.find(n=>n.id===id2).statistics.applied,null);assert.equal(saved.nodes.find(n=>n.id===id2).statistics.result,null);assert.equal(saved.nodes.find(n=>n.id===id2).statistics.presentation.label,'exact');assert.deepEqual(await annotations(id2),[]);

 // Checkpoint restore re-verifies before drawing saved p-values.
 await page.evaluate(state=>TeamCanvas.restore(state),saved);await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2);
 await page.waitForFunction(id=>TeamCanvas.serialize().nodes.find(n=>n.id===id).statistics?.result&&document.querySelectorAll('.tc-node').length===2,id);
 await page.waitForFunction(id=>(document.getElementById(id)?.layout?.annotations||[]).some(a=>String(a.name||'').startsWith('tcstat-label')),id);
 assert.ok(await page.evaluate(()=>statsRequests.includes('verify')),'restored statistics were verified');
 const restored=await page.evaluate(()=>TeamCanvas.serialize());assert.equal(restored.nodes.find(n=>n.id===id).statistics.result.rows[0].pAdj,p);assert.equal(restored.nodes.find(n=>n.id===id2).statistics.result,null);

 // A scientific data change invalidates; design withdrawal blocks.
 await page.evaluate(id=>{const ns=id.slice(0,id.indexOf('-'));document.getElementById(ns+'-violin_lipid').selectize.setValue('PE(36:2)');},id);
 await page.waitForFunction(id=>!(document.getElementById(id)?.layout?.annotations||[]).some(a=>String(a.name||'').startsWith('tcstat-label'))&&TeamCanvas.serialize().nodes.find(n=>n.id===id).statistics.result===null,id);
 await page.evaluate(id=>{const ns=id.slice(0,id.indexOf('-'));document.getElementById(ns+'-violin_lipid').selectize.setValue('PC(34:1)');},id);
 await page.locator('.tc-node .tc-node-head').first().focus();await page.getByRole('tab',{name:'Statistics'}).click();
 await panel.getByRole('button',{name:'Review and confirm…'}).click();if(!(await panel.getByRole('button',{name:'Confirm and compute'}).isEnabled())) console.log('CONFIRM_BLOCKED',await panel.locator('.tcs-confirm').textContent());await panel.getByRole('button',{name:'Confirm and compute'}).click();
 await page.waitForFunction(id=>TeamCanvas.serialize().nodes.find(n=>n.id===id).statistics.result!==null,id);
 await page.evaluate(()=>Shiny.setInputValue('test_design_allowed',false));
 await page.waitForFunction(id=>TeamCanvas.serialize().nodes.find(n=>n.id===id).statistics.result===null&&document.querySelector('.tc-statistics .tcs-status')?.dataset.status==='blocked',id);
 assert.equal(errors.length,0,errors.join(';'));console.log('PASS violin statistics: staged Review/Confirm/Cancel, immediate presentation, hidden keeps family, CSV, Finish provenance, independent copies, verified restore, invalidation and design withdrawal');
 }catch(e){console.log('ORIGINAL_ERROR',e.message);console.log('STATS_DIAGNOSTIC',await page.locator('.tc-statistics .tcs-status').allTextContents());console.log('REQUEST_MODES',await page.evaluate(()=>statsRequests));console.log('BROWSER_RETAINED');await new Promise(()=>setInterval(()=>{},60000));throw e;}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
