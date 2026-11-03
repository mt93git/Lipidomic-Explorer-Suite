const {chromium}=require('../browser/ci/node_modules/playwright');const {execFileSync}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'team-comp-hidden-'));let browser;
try{
 execFileSync('Rscript',['tests/dual-ui/fixture_team_composition_hidden_payload.R'],{env:{...process.env,TEAM_COMP_PAYLOAD_DIR:dir},stdio:'pipe'});
 const all=JSON.parse(fs.readFileSync(path.join(dir,'all.json'))).x,filtered=JSON.parse(fs.readFileSync(path.join(dir,'filtered.json'))).x;
 assert.equal(filtered.data.length,21);const hidden=filtered.data.filter(t=>t.visible===false);assert.equal(hidden.length,2);assert(hidden.every(t=>t.name===undefined&&t.legendgroup===undefined&&t.y===undefined));
 const plotly=execFileSync('Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();
 browser=await chromium.launch({headless:true});const p=await browser.newPage();await p.setContent('<input id="tcinstance_repro-comp_class_selection" value="__ALL__"><div id="choices"></div><div id="tcinstance_repro-plot_comp"></div>');await p.addScriptTag({path:plotly});
 await p.evaluate(async payload=>{window.gd=document.getElementById('tcinstance_repro-plot_comp');const m=payload.layout.meta.teamClassSelection;document.getElementById('choices').dataset.selectionInput=m.inputId;document.getElementById('choices').dataset.choices=JSON.stringify(m.classes);await Plotly.newPlot(gd,payload.data,payload.layout);},all);
 await p.addScriptTag({path:path.resolve('www/team/js/dashboard_selection.js')});await p.waitForTimeout(100);
 assert.equal(await p.locator('.tds-empty-overlay').count(),0);
 await p.evaluate(selected=>{const input=document.getElementById('tcinstance_repro-comp_class_selection');input.value=JSON.stringify(selected);input.dispatchEvent(new Event('change',{bubbles:true}));},filtered.layout.meta.teamClassSelection.selected);
 await p.waitForTimeout(100);assert.equal(await p.locator('.tds-empty-overlay').innerText(),'Updating class proportions…');
 await p.evaluate(async payload=>Plotly.react(gd,payload.data,payload.layout),filtered);await p.waitForTimeout(150);
 assert.equal(await p.locator('.tds-empty-overlay').count(),0,'actual filtered R payload must refresh cached serverSelected and finish pending state');
 const mapped=await p.evaluate(()=>{const owner=TeamDashboardSelection.forPlot(gd);return {selected:owner.getSelection(),dagSelected:owner.isSelected(gd.data.findIndex(t=>t.meta?.teamSourceKey==='team-composition:DAG')),data:gd.data.map(t=>({x:t.x,y:t.y,visible:t.visible,meta:t.meta}))};});
 assert.deepEqual(mapped.selected,filtered.layout.meta.teamClassSelection.selected);assert.equal(mapped.dagSelected,false);
 for(let i=0;i<filtered.data.length;i++){assert.deepEqual(mapped.data[i].x,filtered.data[i].x);assert.deepEqual(mapped.data[i].y,filtered.data[i].y);}
 // Reproduce the pre-fix mapper against the very same R payload on a separate
 // page: all-NA names are absent, attachPlot rejects it and old All ACK sticks.
 const before=await browser.newPage();await before.setContent('<input id="tcinstance_repro-comp_class_selection" value="__ALL__"><div id="choices"></div><div id="tcinstance_repro-plot_comp"></div>');await before.addScriptTag({path:plotly});
 await before.evaluate(async payload=>{window.gd=document.getElementById('tcinstance_repro-plot_comp');const m=payload.layout.meta.teamClassSelection;document.getElementById('choices').dataset.selectionInput=m.inputId;document.getElementById('choices').dataset.choices=JSON.stringify(m.classes);await Plotly.newPlot(gd,payload.data,payload.layout);},all);
 const fixed=fs.readFileSync('www/team/js/dashboard_selection.js','utf8');const start=fixed.indexOf('      // R Plotly omits name/legendgroup'),end=fixed.indexOf('      return sourceClass!==null&&classes.includes(sourceClass)?sourceClass:null;',start);
 assert(start>=0&&end>start);const old=fixed.slice(0,start)+'      return null;'+fixed.slice(end+'      return sourceClass!==null&&classes.includes(sourceClass)?sourceClass:null;'.length);
 await before.addScriptTag({content:old});await before.waitForTimeout(60);
 await before.evaluate(async payload=>{const input=document.getElementById('tcinstance_repro-comp_class_selection');input.value=JSON.stringify(payload.layout.meta.teamClassSelection.selected);input.dispatchEvent(new Event('change',{bubbles:true}));await Plotly.react(gd,payload.data,payload.layout);},filtered);await before.waitForTimeout(150);
 assert.equal(await before.locator('.tds-empty-overlay').innerText(),'Updating class proportions…');await before.close();
 console.log('CONFIRMED pre-fix mapper stays pending on the same serialized R payload; fixed mapper clears it.');
 console.log('PASS actual R→Plotly66sample/21class payload: hidden all-NA DAG/TAG lose names but stable metadata preserves selection owner, refreshes19class acknowledgement, clears pending; scientific arrays unchanged.');
}finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1)});
