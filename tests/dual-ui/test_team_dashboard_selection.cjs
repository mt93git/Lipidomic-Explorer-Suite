const {chromium}=require('../browser/ci/node_modules/playwright');
const {execFileSync}=require('node:child_process');const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{const p=await browser.newPage();
const plotly=execFileSync('/usr/local/bin/Rscript',['--vanilla','-e','cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'],{encoding:'utf8'}).trim();
await p.setContent(`<input id="results_dashboard-comp_class_selection" value="__ALL__"><div data-selection-input="results_dashboard-comp_class_selection" data-choices='["PC","PE","TAG"]'><button data-action="all">All</button><button data-action="none">None</button><button data-value="PC">PC</button><button data-value="PE">PE</button><button data-value="TAG">TAG</button></div><div id="results_dashboard-plot_comp"></div><div id="editor"></div>`);
await p.addScriptTag({path:plotly});await p.evaluate(async()=>{window.gd=document.getElementById('results_dashboard-plot_comp');window.raw=[{type:'bar',name:'PC',legendgroup:'PC',x:['A','B'],y:[20,50]},{type:'bar',name:'PE',legendgroup:'PE',x:['A','B'],y:[30,50]},{type:'bar',name:'TAG',legendgroup:'TAG',x:['A','B'],y:[50,0]}];await Plotly.newPlot(gd,raw,{barmode:'stack',barnorm:'percent',meta:{teamClassSelection:{inputId:'results_dashboard-comp_class_selection',classes:['PC','PE','TAG']}},yaxis:{range:[0,100]}});window.events=[];document.querySelector('input').addEventListener('change',e=>events.push(e.target.value));});
await p.addScriptTag({path:path.resolve('www/team/js/dashboard_selection.js')});await p.addScriptTag({path:path.resolve('www/team/js/plot_editor.js')});
await p.evaluate(()=>{window.state={};window.editor=TeamPlotEditor.mount({container:document.getElementById('editor'),getPlot:()=>gd,getState:()=>state,onChange:n=>state=n});});
async function settle(){await p.waitForTimeout(150);}
async function values(){return p.evaluate(()=>({visible:gd.data.map(t=>t.visible),raw:gd.data.map(t=>t.y),heights:gd.calcdata.map(t=>t.map(v=>v.s)),selection:document.querySelector('input').value}));}
await settle();await p.getByRole('button',{name:'TAG',exact:true}).click();await settle();let v=await values();assert.deepEqual(v.raw,[[20,50],[30,50],[50,0]]);assert.equal(v.visible[2],false);assert.equal(v.heights[0][0],40);assert.equal(v.heights[1][0],60);assert.equal(v.heights[0][1]+v.heights[1][1],100);
// Real Plotly hover must use normalized y, never raw signal with a percent label.
let hover=await p.evaluate(()=>{Plotly.Fx.hover(gd,[{curveNumber:0,pointNumber:0}]);return document.querySelector('.hoverlayer').textContent;});assert(hover.includes('40'),hover);
const series=p.locator('#editor details').filter({has:p.getByText('Series',{exact:true})});await series.locator('summary').click();await p.locator('#editor fieldset').filter({has:p.locator('legend').getByText('PC',{exact:true})}).getByRole('checkbox',{name:'Show series',exact:true}).uncheck();await settle();v=await values();assert.equal(v.heights[1][0],100);assert.deepEqual(JSON.parse(v.selection),['PE']);
await p.getByRole('button',{name:'None',exact:true}).click();await settle();assert.equal(await p.locator('.tds-empty-overlay').count(),1);assert.equal((await values()).selection,'[]');
await p.getByRole('button',{name:'Show all series',exact:true}).click();await settle();assert.equal(await p.locator('.tds-empty-overlay').count(),0);assert.equal((await values()).selection,'__ALL__');
// Shiny hydration of a persisted input drives the same plot; no replay event feedback.
await p.evaluate(()=>{const el=document.querySelector('input');el.value='["TAG"]';el.dispatchEvent(new Event('change',{bubbles:true}));});await settle();v=await values();assert.equal(v.heights[2][0],100);assert.equal(v.visible[0],false);
// Legacy presentation-only hidden patches cannot overwrite canonical selection.
await p.evaluate(async()=>{const key=TeamPlotEditor.publicationStyle(gd,{layout:{},traces:[],annotations:[]}).traces[0]?.sourceKey;await TeamPlotEditor.apply(gd,{traces:[{index:2,sourceKey:key,hidden:true}]});});await settle();assert.equal((await values()).visible[2],true);
// Finished plot rejects changes.
await p.evaluate(()=>gd.classList.add('tc-finished'));await p.getByRole('button',{name:'All',exact:true}).click({force:true});await settle();assert.equal((await values()).selection,'["TAG"]');
console.log('PASS: real Plotly selected class percentages, raw arrays unchanged, normalized hover, editor canonical selection, empty/re-show, restored input and finished lock');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
