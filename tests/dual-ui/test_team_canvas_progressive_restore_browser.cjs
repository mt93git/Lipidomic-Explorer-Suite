// A checkpoint with 12 independent plots is restored while the Canvas is hidden
// (Review is shown). The copies are created progressively, one at a time in idle
// time while hidden and a few at a time once the Canvas is shown, each exactly once
// from its saved settings. As before this wave, the restore stays pending until the
// last card has mounted. Every card ends up mounted at its saved position, size,
// label and appearance, in the saved order. A save made while copies are still
// pending or loading collects every pending card exactly as saved (the server
// refuses it until the restore completes, as it always has); the server's copy
// (what a library save or the end of the session persists) holds all 12 cards
// throughout.
// Starts tests/dual-ui/fixture_team_canvas_lazy_restore_app.R itself.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const port=44000+Math.floor(Math.random()*900);
const COUNT=12;
(async()=>{
 const app=spawn('Rscript',['--vanilla',require('node:path').join(__dirname,'fixture_team_canvas_lazy_restore_app.R')],{env:{...process.env,TEAM_LAZY_PORT:String(port)},stdio:['ignore','ignore','pipe']});
 let log='';app.stderr.on('data',d=>{log+=d;});
 const browser=await chromium.launch();
 try{
  for(let i=0;;i++){try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok)break;}catch(e){}if(i>120)throw new Error('fixture did not start\n'+log);await new Promise(r=>setTimeout(r,250));}
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.isConnected()&&Shiny.shinyapp.$inputValues['results_dashboard-violin_lipid']);
  await page.evaluate(()=>{
   document.getElementById('team-canvas-root').style.display='none';
   window.sentInputs=[];const original=Shiny.setInputValue.bind(Shiny);
   Shiny.setInputValue=function(name,value,options){sentInputs.push({name,at:performance.now(),value:JSON.parse(JSON.stringify(value??null))});return original(name,value,options);};
   window.restoreEvents=[];window.mountedAt={};window.addEventListener('team-canvas-restore-status',e=>{restoreEvents.push(e.detail.status);mountedAt[e.detail.status]=document.querySelectorAll('.tc-node').length;});
   window.mounts=[];new MutationObserver(list=>list.forEach(m=>m.addedNodes.forEach(n=>{if(n.classList&&n.classList.contains('tc-node')&&!mounts.some(x=>x.id===n.dataset.plotId))mounts.push({id:n.dataset.plotId,at:performance.now(),hidden:document.getElementById('team-canvas-root').style.display==='none'});}))).observe(document.querySelector('.tc-board')||document.body,{childList:true,subtree:true});
   Shiny.addCustomMessageHandler('test-instances',m=>{window.reported=m;});
   Shiny.addCustomMessageHandler('test-export',m=>{window.exported=m;});
  });
  const snapshot='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%2F%3E%3C%2Fsvg%3E';
  const lipids=['PC(34:1)','PE(36:2)','TG(50:1)'],colors=['Group1','Group2'],backgrounds=['#eef3fa','#ffffff','#f7f2e8'];
  const nodes=Array.from({length:COUNT},(_,i)=>{const id='tcinstance_prog'+String(i).padStart(2,'0');return {id:id+'-plot_violin',label:'Saved card '+(i+1),x:30+(i%4)*650,y:30+Math.floor(i/4)*760,width:600+(i%3)*10,height:700+(i%2)*20,visual:{background:backgroundsFor(i)},finished:i%4===3?{url:snapshot,createdAt:'2026-10-29T00:00:00Z',stale:false}:null,instance:{id,source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipids[i%3],color_by:colors[i%2]}}};});
  function backgroundsFor(i){return backgrounds[i%3];}
  const state={version:'1',libraryHidden:false,nodes};
  const savedInstances=nodes.map(n=>n.instance);
  const full=n=>({id:n.id,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,visual:n.visual,finished:n.finished||null,instance:n.instance});
  const savedPart=n=>({id:n.id,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,background:n.visual.background,finished:n.finished?n.finished.url:null,instance:{id:n.instance.id,source:n.instance.source,inputs:{violin_lipid:n.instance.inputs.violin_lipid,color_by:n.instance.inputs.color_by}}});
  const exportNow=async()=>{await page.evaluate(()=>{window.exported=null;Shiny.setInputValue('test_report_export',Math.random(),{priority:'event'});});await page.waitForFunction(()=>window.exported);return page.evaluate(()=>window.exported);};
  const exportPart=n=>({id:n.id,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,instance:{id:n.instance.id,source:n.instance.source,inputs:{violin_lipid:n.instance.inputs.violin_lipid,color_by:n.instance.inputs.color_by}}});

  await page.evaluate(s=>Shiny.setInputValue('test_import_state',s,{priority:'event'}),state);
  // 1. The restore is pending while the copies mount; the server holds every card.
  await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:15000});
  assert.deepEqual((await exportNow()).nodes.map(exportPart),nodes.map(exportPart),'the server holds all restored cards right after the restore');

  // 2. While hidden the copies are created one at a time.
  await page.waitForFunction(()=>mounts.length>=2&&sentInputs.filter(x=>x.name==='team_canvas_instance_create').length>mounts.length,null,{timeout:60000});
  // 3. A save while copies are pending and one is loading is collected without
  //    waiting for them and holds them unchanged; the server refuses it until the
  //    restore completes (production's rule), keeping its own full copy.
  const during=await page.evaluate(async()=>{
   const before={mounted:document.querySelectorAll('.tc-node').length,creates:sentInputs.filter(x=>x.name==='team_canvas_instance_create').length,restore:restoreEvents.slice()};
   const sent=sentInputs.length;let error=null;try{await TeamCanvas.checkpoint();}catch(e){error=e.message;}
   return {before,error,state:sentInputs.slice(sent).find(x=>x.name==='team_canvas_state').value.state,mountedIds:Array.from(document.querySelectorAll('.tc-node')).map(n=>n.dataset.plotId)};
  });
  assert.ok(during.before.mounted<COUNT&&during.before.creates>during.before.mounted,'the save ran while copies were pending and one was loading: '+JSON.stringify(during.before));
  assert.deepEqual(during.before.restore,['pending'],'the restore is still pending while copies load');
  assert.match(during.error||'',/has not finished restoring/,'the server refuses a save until the restore completes, as before');
  assert.equal(during.state.nodes.length,COUNT,'the save holds every restored card');
  assert.deepEqual(during.state.nodes.map(n=>n.id),nodes.map(n=>n.id),'the save keeps the restored order');
  const pendingSaved=during.state.nodes.filter(n=>!during.mountedIds.includes(n.id));
  assert.ok(pendingSaved.length>0,'some cards were still pending at the save');
  for(const n of pendingSaved)assert.deepEqual(full(n),full(nodes.find(x=>x.id===n.id)),'pending card '+n.id+' is saved exactly as restored');
  for(const n of during.state.nodes)assert.deepEqual(savedPart(n),savedPart(nodes.find(x=>x.id===n.id)),'card '+n.id+' keeps its saved geometry and settings in the save');
  assert.deepEqual((await exportNow()).nodes.map(exportPart),nodes.map(exportPart),'the server copy after a save during hydration holds all cards');
  const hiddenMounts=await page.evaluate(()=>({mounts:mounts.slice(),creates:sentInputs.filter(x=>x.name==='team_canvas_instance_create').map(x=>({id:x.value.id,at:x.at}))}));
  // Concurrency 1 while hidden: copy k+1 is requested only after copy k mounted.
  for(let k=1;k<hiddenMounts.creates.length;k++){
   const prev=hiddenMounts.mounts.find(m=>m.id===hiddenMounts.creates[k-1].id+'-plot_violin');
   assert.ok(prev&&prev.at<=hiddenMounts.creates[k].at,'hidden: request '+k+' waited for the previous copy to mount');
  }
  assert.deepEqual(hiddenMounts.creates.map(c=>c.id),savedInstances.slice(0,hiddenMounts.creates.length).map(i=>i.id),'hidden: copies are requested in the saved order');

  // 4. Showing the Canvas loads the rest sooner; every card ends up mounted.
  await page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
  await page.waitForFunction(n=>document.querySelectorAll('.tc-node').length===n&&!document.querySelector('.tc-restore-settling'),COUNT,{timeout:180000});
  await page.waitForFunction(()=>restoreEvents.includes('success'),null,{timeout:30000});
  assert.equal(await page.evaluate(()=>mountedAt.success),COUNT,'the restore completed only once every card had mounted');
  const ack=await page.evaluate(async()=>{const ack=await TeamCanvas.checkpoint();return sentInputs.filter(x=>x.name==='team_canvas_state').find(x=>x.value.token===ack.token).value.state.nodes.map(n=>n.id);});
  assert.deepEqual(ack,nodes.map(n=>n.id),'after the restore a save is accepted and holds every card');
  const creates=await page.evaluate(()=>sentInputs.filter(x=>x.name==='team_canvas_instance_create').map(x=>{const {request,...value}=x.value;return value;}));
  assert.deepEqual(creates,savedInstances,'each restored instance is requested once, in order, with its saved settings');
  await page.waitForFunction(ids=>ids.every(id=>Shiny.shinyapp.$inputValues[id+'-violin_lipid']!==undefined),savedInstances.map(i=>i.id),{timeout:30000});
  await page.evaluate(()=>{window.reported=null;Shiny.setInputValue('test_report_instances',Date.now(),{priority:'event'});});await page.waitForFunction(()=>window.reported);
  const reported=await page.evaluate(()=>window.reported);
  assert.deepEqual(reported.ids,savedInstances.map(i=>i.id).sort(),'all restored instances exist on the server');
  for(const i of savedInstances)assert.deepEqual(reported.inputs[i.id],i.inputs,'instance '+i.id+' runs with its saved inputs');

  // 5. Mounted cards are identical to the saved ones, in the saved order and place.
  const mounted=await page.evaluate(()=>TeamCanvas.serialize());
  assert.deepEqual(mounted.nodes.map(savedPart),nodes.map(savedPart),'mounted cards keep the saved geometry, label, appearance, snapshot and settings');
  const dom=await page.evaluate(()=>Array.from(document.querySelectorAll('.tc-board .tc-node')).map(n=>({id:n.dataset.plotId,x:parseFloat(n.style.left),y:parseFloat(n.style.top),width:parseFloat(n.style.width),height:parseFloat(n.style.height),label:n.querySelector('.tc-node-head strong').textContent})));
  assert.deepEqual(dom,nodes.map(n=>({id:n.id,x:n.x,y:n.y,width:n.width,height:n.height,label:n.label})),'cards sit in the board in the saved order at their saved position and size');
  await page.waitForTimeout(2500);
  assert.deepEqual((await exportNow()).nodes.map(exportPart),nodes.map(exportPart),'the server copy after hydration holds all cards unchanged');
  assert.deepEqual(await page.evaluate(()=>restoreEvents),['pending','success'],'the restore never failed');
  assert.deepEqual(errors,[]);
  const shownAt=hiddenMounts.mounts.length;
  console.log(`PASS: ${COUNT}-card restore stays pending until all ${COUNT} mounted; hidden copies load one at a time in order (${shownAt} before the Canvas was shown); a save mid-hydration collects ${pendingSaved.length} pending cards exactly as saved (server refuses it until the restore completes, keeping all ${COUNT}); all ${COUNT} mount once, identical, in saved order and position`);
 }finally{await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
