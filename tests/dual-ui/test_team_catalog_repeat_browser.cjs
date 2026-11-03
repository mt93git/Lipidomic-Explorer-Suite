// Run against fixture_team_plot_instances_app.R: repeated palette clicks create real independent plots.
const {chromium}=require('../browser/ci/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch();try{
 const p=await b.newPage({viewport:{width:1600,height:1000}});p.setDefaultTimeout(20000);
 await p.goto('http://127.0.0.1:43999');
 await p.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.$inputValues['results_dashboard-violin_lipid']);
 await p.evaluate(()=>window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}})));
 for(const [source,label] of [['results_dashboard-plot_violin','Feature distributions'],['results_dashboard-plot_heat','Abundance heatmap']]){
   const button=p.locator(`[data-catalog-id="${source}"] button`);
   assert.equal(await button.isEnabled(),true);
   await button.click();await p.waitForFunction(source=>document.querySelectorAll(`.tc-node[data-source-id="${source}"]`).length>=1 || [...document.querySelectorAll('.tc-node')].filter(n=>n.dataset.plotId?.endsWith(source.split('-')[1])).length>=1,source);
   assert.equal(await button.isEnabled(),true,label+' remains addable');
   await button.click();await p.waitForFunction(source=>[...document.querySelectorAll('.tc-node')].filter(n=>n.dataset.plotId?.endsWith(source.split('-')[1])).length===2,source);
 }
 const state=await p.evaluate(()=>TeamCanvas.serialize());
 for(const source of ['results_dashboard-plot_violin','results_dashboard-plot_heat']){
   const nodes=state.nodes.filter(n=>n.instance?.source===source);assert.equal(nodes.length,2);assert.notEqual(nodes[0].instance.id,nodes[1].instance.id);
   await p.waitForFunction(ids=>ids.every(id=>document.getElementById(id)?.data?.length),nodes.map(n=>n.id));
 }
 const violin=state.nodes.filter(n=>n.instance?.source==='results_dashboard-plot_violin');
 await p.evaluate(ns=>document.getElementById(ns+'-violin_lipid').selectize.setValue('PE(36:2)'),violin[1].instance.id);
 await p.waitForFunction(id=>document.getElementById(id)?.data?.some(t=>t.y?.some(y=>Math.abs(y-Math.log10(50))<1e-10)),violin[1].id);
 const after=await p.evaluate(()=>TeamCanvas.serialize());
 assert.equal(after.nodes.find(n=>n.id===violin[0].id).instance.inputs.violin_lipid,'PC(34:1)');
 assert.equal(after.nodes.find(n=>n.id===violin[1].id).instance.inputs.violin_lipid,'PE(36:2)');
 const heat=state.nodes.filter(n=>n.instance?.source==='results_dashboard-plot_heat');
 await p.evaluate(ns=>{const el=document.getElementById(ns+'-heat_group_selection');el.value=JSON.stringify(['A']);jQuery(el).trigger('change');},heat[1].instance.id);
 await p.waitForFunction(id=>document.getElementById(id)?.data?.some(t=>Array.isArray(t.x)&&t.x.length===1&&t.x[0]==='A'),heat[1].id);
 assert.equal(await p.evaluate(id=>document.getElementById(id).data.some(t=>Array.isArray(t.x)&&t.x.includes('A')&&t.x.includes('B')),heat[0].id),true,'first heatmap retains both groups');
 const finalState=await p.evaluate(()=>TeamCanvas.serialize());
 assert.equal(finalState.nodes.find(n=>n.id===heat[1].id).instance.inputs.heat_group_selection,JSON.stringify(['A']));
 assert.equal(finalState.nodes.find(n=>n.id===heat[0].id).instance.inputs.heat_group_selection,'__ALL__');
 console.log('PASS repeated catalog clicks create independent rendered heatmaps and distributions with separate settings and data');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
