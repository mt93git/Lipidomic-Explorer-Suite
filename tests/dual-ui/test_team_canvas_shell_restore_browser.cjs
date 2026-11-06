// Inside the Team shell (LIPIDOMIC_TEAM_WORKSPACE, shell.js's data-ts-shell, canvas
// tabs, card_frame.js and card_figure.js framing every card, autosave.js loaded with a
// writable context), a checkpoint with two canvas tabs is restored while the Canvas is
// hidden. The restore stays pending until every copy has mounted (autosave paused).
//  1. Nobody touches the page: mounting every copy, including the tabs observer's
//     report of each insertion and card_frame.js/card_figure.js's automatic fitPlot,
//     is hydration only (autosave stays clean, the edit epoch does not move), and the
//     saved tabs and geometry survive. A real tab edit afterwards still counts.
//  2. Edits made by code while copies mount, with no gesture: a figure-order edit in
//     a mount's own microtask and in the next task, and Arrange through a click with
//     no pointerdown or keydown, each advance the edit epoch, are not tagged as
//     hydration, and reach the server once the restore completes.
//  3. A real click in Review while copies mount: from then on changes count as edits
//     (biased towards edit); autosave saves once the restore completes, not before,
//     through the real canvas checkpoint handshake (the fixture runs project_library.R's
//     autosave path: team-canvas-save-request, TeamCanvas.checkpoint(), the acknowledged
//     token checked against team_canvas_acked_token(), then the server copy written).
// Starts tests/dual-ui/fixture_team_canvas_shell_restore_app.R itself.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const port=44000+Math.floor(Math.random()*900);
const COUNT=6;
const lipids=['PC(34:1)','PE(36:2)','TG(50:1)'];
const makeNodes=prefix=>Array.from({length:COUNT},(_,i)=>{const id='tcinstance_'+prefix+i;return {id:id+'-plot_violin',label:prefix+' card '+(i+1),x:30+(i%3)*650,y:30+Math.floor(i/3)*760,width:620,height:720,visual:{background:'#ffffff'},finished:null,instance:{id,source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipids[i%3],color_by:'Group1'}}};});
const makeTabs=nodes=>({version:'1',active:'tab-1',tabs:[{id:'tab-1',name:'Main',nodes:nodes.slice(0,3).map(n=>n.id)},{id:'tab-two',name:'Second',nodes:nodes.slice(3).map(n=>n.id)}],figure:{deselected:[],order:[]}});
const geometry=n=>({id:n.id,x:n.x,y:n.y,width:n.width,height:n.height,label:n.label});
(async()=>{
 const app=spawn('Rscript',['--vanilla',require('node:path').join(__dirname,'fixture_team_canvas_shell_restore_app.R')],{env:{...process.env,TEAM_LAZY_PORT:String(port)},stdio:['ignore','ignore','pipe']});
 let log='';app.stderr.on('data',d=>{log+=d;});
 const browser=await chromium.launch();
 async function open(){
  const page=await browser.newPage({viewport:{width:1500,height:1000}});page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(()=>window.TeamCanvas&&window.TeamAutosave&&window.TeamCardFigure&&window.Shiny?.shinyapp?.isConnected()&&Shiny.shinyapp.$inputValues['results_dashboard-violin_lipid']);
  await page.waitForFunction(()=>document.getElementById('team-canvas-root').dataset.tsShell==='true'&&!!document.querySelector('.tc-tabbar'),null,{timeout:20000});
  // Autosave has its writable, loaded context (a fresh dataset is first marked unsaved).
  await page.waitForFunction(()=>!!document.getElementById('team-autosave-status').dataset.state,null,{timeout:20000});
  await page.evaluate(()=>{
   document.getElementById('team-canvas-root').style.display='none';
   window.sentInputs=[];const original=Shiny.setInputValue.bind(Shiny);
   Shiny.setInputValue=function(name,value,options){sentInputs.push({name,value:JSON.parse(JSON.stringify(value??null))});return original(name,value,options);};
   window.restoreEvents=[];window.mountedAt={};window.addEventListener('team-canvas-restore-status',e=>{restoreEvents.push(e.detail.status);mountedAt[e.detail.status]=document.querySelectorAll('.tc-node').length;});
   window.changes=[];window.addEventListener('team-canvas-changed',e=>changes.push(Object.assign({mounted:document.querySelectorAll('.tc-node').length},e.detail||{})));
   window.acks=[];window.autosaveResults=[];jQuery(document).on('shiny:message',e=>{const c=e.message&&e.message.custom;if(c&&c['team-canvas-state-ack'])acks.push(c['team-canvas-state-ack']);if(c&&c['team-autosave-result'])autosaveResults.push(c['team-autosave-result']);});
   Shiny.addCustomMessageHandler('test-persisted',m=>{window.persisted=m;});
   // Counts card_frame.js / card_figure.js framing calls (test instrumentation only).
   window.fits=0;const fit=TeamCanvas.fitPlot;TeamCanvas.fitPlot=function(id){fits++;return fit.call(this,id);};
  });
  return page;
 }
 const persistedNow=async page=>{await page.evaluate(()=>{window.persisted=null;Shiny.setInputValue('test_report_persisted',Math.random(),{priority:'event'});});await page.waitForFunction(()=>window.persisted);return page.evaluate(()=>window.persisted);};
 const importState=(page,state)=>page.evaluate(s=>Shiny.setInputValue('test_import_state',s,{priority:'event'}),state);
 const allMounted=page=>page.waitForFunction(n=>document.querySelectorAll('.tc-node').length===n&&!document.querySelector('.tc-restore-settling')&&TeamCanvas.restoreProgress().queued===0&&TeamCanvas.restoreProgress().loading===0&&restoreEvents.includes('success'),COUNT,{timeout:180000});
 try{
  for(let i=0;;i++){try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok)break;}catch(e){}if(i>120)throw new Error('fixture did not start\n'+log);await new Promise(r=>setTimeout(r,250));}

  // 1. No interaction.
  const page=await open(),nodes=makeNodes('shell'),tabs=makeTabs(nodes);
  await importState(page,{version:'1',libraryHidden:false,nodes,tabs});
  await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:15000});
  const start=await page.evaluate(()=>({auto:TeamAutosave.state(),progress:TeamCanvas.restoreProgress()}));
  assert.equal(start.auto.restorePending,true,'autosave is paused while the restore is pending');
  // The Canvas is shown part-way (no gesture): the rest load at the shown concurrency.
  await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length>=2,null,{timeout:60000});
  await page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
  await allMounted(page);
  await page.waitForTimeout(1500);
  const end=await page.evaluate(()=>({auto:TeamAutosave.state(),progress:TeamCanvas.restoreProgress(),changes:changes.slice(),saves:sentInputs.filter(x=>x.name==='team_library_autosave_request').length,fits,framed:document.querySelectorAll('.tc-node.tc-card-framed').length,feet:document.querySelectorAll('.tc-node > .tc-card-foot').length,events:restoreEvents.slice(),atSuccess:mountedAt.success}));
  assert.equal(end.framed,COUNT,'card_frame.js framed every restored card');
  assert.equal(end.feet,COUNT,'every card got its footer');
  assert.ok(end.fits>=COUNT,'card_frame.js/card_figure.js re-fitted the cards while they mounted ('+end.fits+' fitPlot calls)');
  assert.deepEqual(end.events,['pending','success'],'the restore completed once');
  assert.equal(end.atSuccess,COUNT,'only after every copy had mounted');
  const mountChanges=end.changes.filter(c=>c.mounted>0);
  assert.ok(mountChanges.length>=COUNT,'the tabs observer and the mounts reported changes ('+mountChanges.length+')');
  assert.deepEqual(end.changes.filter(c=>c.restoreHydration!==true),[],'every change while the copies mounted is tagged as restore hydration');
  assert.equal(end.auto.dirty,false,'mounting the restored copies does not make autosave dirty');
  assert.equal(end.saves,0,'no autosave was requested by mounting');
  assert.equal(end.progress.editEpoch,start.progress.editEpoch,'mounting and automatic framing do not advance the canvas edit epoch');
  const serialized=await page.evaluate(()=>TeamCanvas.serialize());
  assert.deepEqual(serialized.tabs.tabs.map(t=>({id:t.id,name:t.name,nodes:t.nodes})),tabs.tabs.map(t=>({id:t.id,name:t.name,nodes:t.nodes})),'the saved tabs survive the mounts unchanged');
  assert.deepEqual(serialized.nodes.map(geometry),nodes.map(geometry),'mounted cards keep the saved geometry and order');
  // A real Canvas edit after hydration is still an edit.
  await page.evaluate(()=>{window.changes=[];});
  await page.click('.tc-canvas-tab-add');
  await page.waitForFunction(()=>changes.some(c=>c.restoreHydration!==true),null,{timeout:5000});
  assert.equal(await page.evaluate(()=>TeamAutosave.state().dirty),true,'a tab added by the analyst makes autosave dirty');
  assert.ok((await page.evaluate(()=>TeamCanvas.restoreProgress().editEpoch))>end.progress.editEpoch,'an analyst edit advances the edit epoch');
  assert.deepEqual(page.errors,[]);await page.close();

  // 2. Edits by code while copies mount, with no gesture.
  const page2=await open(),nodes2=makeNodes('order'),tabs2=makeTabs(nodes2);
  await page2.evaluate(()=>{
   window.edits=[];let mountsSeen=0;
   const edit=(how,fn)=>{const before={epoch:TeamCanvas.restoreProgress().editEpoch,changes:changes.length};fn();edits.push({how,before,after:{epoch:TeamCanvas.restoreProgress().editEpoch},events:changes.slice(before.changes),pending:restoreEvents[restoreEvents.length-1]==='pending'});};
   // Registered after the tabs observer: runs in the same mutation-observer microtask, after it.
   new MutationObserver(list=>{const added=list.some(m=>Array.from(m.addedNodes).some(n=>n.classList&&n.classList.contains('tc-node')));if(!added)return;mountsSeen++;
    if(mountsSeen===1)edit('microtask',()=>TeamCanvasTabs.moveInOrder('tcinstance_order0-plot_violin',1));
    if(mountsSeen===2){const ch=new MessageChannel();ch.port1.onmessage=()=>edit('next task',()=>TeamCanvasTabs.moveInOrder('tcinstance_order1-plot_violin',1));ch.port2.postMessage(0);}
    // Arrange activated by a click with no pointerdown or keydown (an assistive technology's click).
    if(mountsSeen===3)setTimeout(()=>edit('arrange',()=>document.querySelector('.tc-arrange').click()),0);
   }).observe(document.querySelector('.tc-board'),{childList:true});
  });
  await importState(page2,{version:'1',libraryHidden:false,nodes:nodes2,tabs:tabs2});
  await page2.waitForFunction(()=>edits.length===3,null,{timeout:120000});
  const edits=await page2.evaluate(()=>edits);
  for(const e of edits){
   assert.equal(e.pending,true,e.how+': made while the restore was pending');
   assert.ok(e.after.epoch>e.before.epoch,e.how+': the edit advanced the edit epoch');
   assert.ok(e.events.length>0&&e.events.every(x=>x.restoreHydration!==true),e.how+': the edit is not tagged as hydration '+JSON.stringify(e.events));
  }
  await page2.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
  await allMounted(page2);
  // Once the restore completes the edited state reaches the server (it refused it before).
  await page2.waitForFunction(()=>{const states=sentInputs.filter(x=>x.name==='team_canvas_state');const last=states[states.length-1];return last&&acks.some(a=>a.token===last.value.token&&a.ok===true);},null,{timeout:10000});
  const final=await page2.evaluate(()=>({sent:sentInputs.filter(x=>x.name==='team_canvas_state').pop().value.state,now:TeamCanvas.serialize()}));
  assert.ok(Array.isArray(final.sent.tabs.figure.order)&&final.sent.tabs.figure.order.length>0,'the edited figure order reached the server: '+JSON.stringify(final.sent.tabs.figure.order));
  assert.deepEqual(final.sent.nodes.map(geometry),final.now.nodes.map(geometry),'the server holds the arranged geometry');
  assert.notDeepEqual(final.now.nodes.map(geometry),nodes2.map(geometry),'Arrange changed the geometry');
  // A save now writes the edited canvas through the real handshake. (Autosave itself
  // waits for a trusted pointer or key after a resume, as in production, so the save
  // is requested directly.)
  await page2.evaluate(()=>{TeamAutosave.schedule('test');TeamAutosave.requestSave('test');});
  await page2.waitForFunction(()=>autosaveResults.some(r=>r.ok===true),null,{timeout:40000});
  const written2=await persistedNow(page2);
  assert.ok(written2.count>=1&&written2.refused===0,'the edited canvas was written '+JSON.stringify({count:written2.count,refused:written2.refused}));
  assert.deepEqual(written2.nodes,final.now.nodes.map(geometry),'the written checkpoint holds the arranged geometry');
  assert.ok(Array.isArray(written2.order)&&written2.order.length>0,'and the edited figure order');
  assert.deepEqual(page2.errors,[]);await page2.close();

  // 3. A real Review click while copies mount.
  const page3=await open(),nodes3=makeNodes('review'),tabs3=makeTabs(nodes3);
  await importState(page3,{version:'1',libraryHidden:false,nodes:nodes3,tabs:tabs3});
  await page3.waitForFunction(()=>restoreEvents.includes('pending')&&document.querySelectorAll('.tc-node').length>=1,null,{timeout:60000});
  await page3.click('#review-action');
  const clicked=await page3.evaluate(()=>({mounted:document.querySelectorAll('.tc-node').length}));
  assert.ok(clicked.mounted<COUNT,'Review was clicked while copies were still loading');
  await page3.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
  await page3.waitForFunction(n=>document.querySelectorAll('.tc-node').length===n&&restoreEvents.includes('success'),COUNT,{timeout:180000});
  const order=await page3.evaluate(()=>({save:sentInputs.findIndex(x=>x.name==='team_library_autosave_request'),complete:sentInputs.findIndex(x=>x.name==='team_canvas_restore_complete')}));
  assert.ok(order.save<0||order.save>order.complete,'autosave stayed paused while the restore was pending '+JSON.stringify(order));
  await page3.waitForFunction(()=>sentInputs.some(x=>x.name==='team_library_autosave_request'),null,{timeout:20000});
  // The save completes through the real handshake: the server asked for the canvas,
  // checkpoint() sent it and was acknowledged, and the reply's token was the accepted one.
  await page3.waitForFunction(()=>autosaveResults.some(r=>r.ok===true),null,{timeout:30000});
  const bridge=await page3.evaluate(()=>{const ready=sentInputs.filter(x=>x.name==='team_canvas_save_ready');const last=ready[ready.length-1];return {ready:last&&last.value,ack:last&&acks.find(a=>a.token===last.value.token),auto:TeamAutosave.state()};});
  assert.equal(bridge.ready.ok,true,'canvas_checkpoint.js answered the save request with a checkpoint');
  assert.equal(bridge.ack&&bridge.ack.ok,true,'canvas_state.R acknowledged that checkpoint\'s state');
  assert.equal(bridge.auto.dirty,false,'autosave is clean after the server confirmed the save');
  const written=await persistedNow(page3);
  assert.ok(written.count>=1&&written.refused===0,'the checkpoint was written and never refused '+JSON.stringify({count:written.count,refused:written.refused}));
  assert.equal(written.token,bridge.ready.token,'the written checkpoint is the one whose token the server accepted');
  assert.deepEqual(written.nodes,nodes3.map(geometry),'the written checkpoint holds every restored card as saved');
  const serialized3=await page3.evaluate(()=>TeamCanvas.serialize());
  assert.deepEqual(serialized3.nodes.map(geometry),nodes3.map(geometry),'the canvas autosaved after the restore holds every card as saved');
  assert.deepEqual(page3.errors,[]);await page3.close();

  console.log(`PASS: Team shell with tabs, card_frame.js/card_figure.js and autosave: untouched, ${COUNT} restored copies mount with ${mountChanges.length} hydration-only changes and ${end.fits} automatic fitPlot calls, autosave clean, edit epoch unchanged, restore completes at ${end.atSuccess}/${COUNT}; a tab edit still counts; microtask, next-task and click-only Arrange edits during hydration count and reach the server after the restore; a Review click turns later changes into edits and autosave saves only after the restore`);
 }finally{await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
