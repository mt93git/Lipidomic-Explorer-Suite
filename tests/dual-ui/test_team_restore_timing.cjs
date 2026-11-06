// Static scheduling fixture: synthetic Shiny events, not an R runtime benchmark.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
const ids = ['data_hub-sample_preview_header', 'data_hub-sample_structure_preview', 'data_hub-visual_connection_flow'];
const baseline = process.argv.includes('--baseline');
const server = baseline ? execFileSync('git', ['show', 'd814775:R/frontends/team/server.R'], {encoding:'utf8'}) : fs.readFileSync('R/frontends/team/server.R','utf8');
const policy = fs.readFileSync('R/frontends/team/hidden_previews.R','utf8');
const suspended = server.includes('c(team_hidden_classic_outputs, team_hidden_metadata_previews)');
assert.match(fs.readFileSync('R/frontends/team/ui.R','utf8'), /includeScript\("www\/team\/js\/restore_timing.js"\)/);
assert.deepEqual([...policy.matchAll(/"(data_hub-[^"]+)"/g)].map(x=>x[1]), ids);
assert.match(server, /suspendWhenHidden = TRUE/);
console.log(JSON.stringify({mode:baseline?'baseline':'fixed',hiddenDisplayOutputsForcedActive:suspended?0:3}));
assert(suspended, 'Team must override all three display-only preview outputs to suspend when hidden');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent(`<body data-team-stage="data"><aside hidden>${ids.map(id=>`<div id="${id}"></div>`).join('')}</aside><div id="qc_pca_tab-guided_qc_plot"></div></body>`);
  await page.evaluate(()=>{
   window.listeners={};
   window.jQuery=()=>({on(names,fn){names.split(' ').forEach(n=>(listeners[n.split('.')[0]] ||= []).push(fn));}});
   window.fire=(type,name)=> (listeners[type]||[]).forEach(fn=>fn({type,name,value:'must never be recorded'}));
  });
  await page.addScriptTag({path:'www/team/js/restore_timing.js'});
  const result=await page.evaluate(async ({ids,suspended})=>{
   fire('shiny:busy');
   if(TeamRestoreTiming.snapshot().length) throw Error('tracing must be opt-in');
   TeamRestoreTiming.start(); fire('shiny:busy');
   // Two hydration invalidations; 20 ms represents fixture-only render work.
   for(let round=0;round<2;round++) for(const id of ids){
    fire('shiny:outputinvalidated',id);
    if(!suspended){await new Promise(r=>setTimeout(r,20));fire('shiny:value',id);}
   }
   document.body.dataset.teamStage='review';
   fire('shiny:value','qc_pca_tab-guided_qc_plot');fire('shiny:idle');
   const beforeShow=TeamRestoreTiming.snapshot();
   document.querySelector('aside').hidden=false;
   ids.forEach(id=>fire('shiny:value',id));
   const afterShow=TeamRestoreTiming.snapshot();
   TeamRestoreTiming.stop();fire('shiny:busy');
   if(TeamRestoreTiming.snapshot().length!==afterShow.length) throw Error('stop failed');
   afterShow[0].event='modified';
   if(TeamRestoreTiming.snapshot()[0].event==='modified') throw Error('snapshot is mutable');
   return {beforeShow,afterShow:TeamRestoreTiming.snapshot()};
  },{ids,suspended});
  const hidden=result.beforeShow.filter(r=>r.event==='shiny:value'&&r.hidden);
  const pca=result.beforeShow.find(r=>r.output==='qc_pca_tab-guided_qc_plot');
  console.log(JSON.stringify({mode:baseline?'baseline':'fixed',hiddenDeliveries:hidden.length,invalidations:result.beforeShow.filter(r=>r.event==='shiny:outputinvalidated').length,syntheticPcaDeliveryMs:pca.ms,shownDeliveries:result.afterShow.filter(r=>r.event==='shiny:value'&&!r.hidden&&ids.includes(r.output)).length}));
  assert.equal(hidden.length,0,'display-only hidden previews must stay suspended during restore');
  assert.equal(result.afterShow.filter(r=>r.event==='shiny:value'&&!r.hidden&&ids.includes(r.output)).length,3,'all previews render when shown');
  assert(result.afterShow.every(r=>!('value' in r)),'do not retain output contents');
  console.log('PASS: hidden preview policy, visible resumption model, four Shiny event types, opt-in bounded timing snapshots');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
