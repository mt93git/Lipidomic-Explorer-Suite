// A checkpoint restored while the Canvas is hidden (Review is shown) creates no
// independent plot at once. The copies are created in idle time, one at a time,
// from the saved settings, exactly once, and mount while the Canvas stays hidden;
// the restore completes when the last one has mounted. A save before they mount
// collects the full restored canvas, and mounting is not an edit.
// Starts tests/dual-ui/fixture_team_canvas_lazy_restore_app.R itself.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const port=44000+Math.floor(Math.random()*900);
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
   // The Canvas is hidden, as it is while Review is shown (body:not([data-guide-step='5'])).
   document.getElementById('team-canvas-root').style.display='none';
   window.sentInputs=[];const original=Shiny.setInputValue.bind(Shiny);
   Shiny.setInputValue=function(name,value,options){sentInputs.push({name,value:JSON.parse(JSON.stringify(value??null))});return original(name,value,options);};
   window.messages=[];jQuery(document).on('shiny:message',e=>{const c=e.message&&e.message.custom;if(c)Object.keys(c).forEach(type=>messages.push({type,message:JSON.parse(JSON.stringify(c[type]))}));});
   window.restoreEvents=[];window.addEventListener('team-canvas-restore-status',e=>restoreEvents.push(e.detail.status));
   window.changes=[];window.addEventListener('team-canvas-changed',e=>changes.push(e.detail||{}));
   Shiny.addCustomMessageHandler('test-instances',m=>{window.reported=m;});
  });
  const snapshot='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%2F%3E%3C%2Fsvg%3E';
  const make=(id,lipid,color,x,finished)=>({id:id+'-plot_violin',label:'Saved '+lipid,x,y:30,width:620,height:720,visual:{background:'#eef3fa'},finished:finished?{url:snapshot,createdAt:'2026-10-29T00:00:00Z',stale:false}:null,instance:{id,source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipid,color_by:color}}});
  const state={version:'1',libraryHidden:false,nodes:[make('tcinstance_lazyone','PC(34:1)','Group1',30,false),make('tcinstance_lazytwo','PE(36:2)','Group2',700,false),make('tcinstance_lazythree','TG(50:1)','Group1',1370,true)]};
  const savedInstances=state.nodes.map(n=>n.instance);
  await page.evaluate(s=>Shiny.setInputValue('test_import_state',s,{priority:'event'}),state);
  await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:15000});
  const report=async()=>{await page.evaluate(()=>{window.reported=null;Shiny.setInputValue('test_report_instances',Date.now(),{priority:'event'});});await page.waitForFunction(()=>window.reported);return page.evaluate(()=>window.reported);};
  // 1. No copy is created with the restore (they start after it, in idle time).
  let before=await page.evaluate(()=>({creates:sentInputs.filter(x=>x.name==='team_canvas_instance_create').length,ready:messages.filter(m=>m.type==='team-canvas-instance-ready').length,hosts:document.querySelectorAll('.tc-instance-host').length,states:sentInputs.filter(x=>x.name==='team_canvas_state').length,restore:restoreEvents.slice(),nodes:document.querySelectorAll('.tc-node').length}));
  assert.deepEqual(before,{creates:0,ready:0,hosts:0,states:0,restore:['pending'],nodes:0},'the restore creates no instance at once and echoes no state');
  // 2. A save before the copies mount collects the full restored canvas (the server
  //    refuses it until the restore completes, as before).
  const early=await page.evaluate(async()=>{const sent=sentInputs.length;try{await TeamCanvas.checkpoint();}catch(e){}return sentInputs.slice(sent).find(x=>x.name==='team_canvas_state').value.state;});
  assert.deepEqual(early.nodes.map(n=>({id:n.id,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,visual:n.visual,finished:n.finished||null,instance:n.instance})),
    state.nodes.map(n=>({id:n.id,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,visual:n.visual,finished:n.finished,instance:n.instance})),'a save before opening the Canvas holds every restored node unchanged');
  // 3. With the Canvas still hidden, every instance is created once, from its saved settings, and mounts.
  await page.evaluate(()=>{window.changes=[];});
  await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===3&&!document.querySelector('.tc-restore-settling'),null,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.getElementById('team-canvas-root').style.display),'none','the copies mounted while the Canvas was hidden');
  await page.waitForFunction(()=>restoreEvents.includes('success'),null,{timeout:15000});
  assert.deepEqual(await page.evaluate(()=>restoreEvents),['pending','success'],'the restore completes once every copy has mounted');
  const creates=await page.evaluate(()=>sentInputs.filter(x=>x.name==='team_canvas_instance_create').map(x=>{const {request,...value}=x.value;return value;}));
  assert.deepEqual(creates,savedInstances,'each restored instance is requested once with its saved settings');
  const ready=await page.evaluate(()=>messages.filter(m=>m.type==='team-canvas-instance-ready').map(m=>({id:m.message.id,source:m.message.source,inputs:{violin_lipid:m.message.inputs.violin_lipid,color_by:m.message.inputs.color_by}})));
  assert.deepEqual(ready,savedInstances,'the server created each instance from the saved inputs');
  const tokens=await page.evaluate(()=>({sent:sentInputs.filter(x=>x.name==='team_canvas_instance_create').map(x=>x.value.request),echoed:messages.filter(m=>m.type==='team-canvas-instance-ready').map(m=>m.message.request)}));
  assert.ok(tokens.sent.every(t=>typeof t==='string'&&t.length>0),'each creation request carries a token');
  assert.deepEqual(tokens.echoed,tokens.sent,'the server echoes each request token in its reply');
  await page.waitForFunction(ids=>ids.every(id=>Shiny.shinyapp.$inputValues[id+'-violin_lipid']!==undefined),savedInstances.map(i=>i.id),{timeout:15000});
  const after=await report();
  assert.deepEqual(after.ids,savedInstances.map(i=>i.id).sort(),'all restored instances exist while the Canvas is still hidden');
  for(const i of savedInstances)assert.deepEqual(after.inputs[i.id],i.inputs,'instance '+i.id+' runs with its saved inputs');
  // 4. Mounting is hydration, not an edit; the serialized canvas is still the restored one.
  const hydration=await page.evaluate(()=>changes.map(c=>c.restoreHydration===true));
  assert.ok(hydration.length>0&&hydration.every(Boolean),'every change while the restored plots mount is marked as restore hydration');
  const mounted=await page.evaluate(()=>TeamCanvas.serialize());
  // A mounted copy also serializes its other controls' values (as an immediate restore does).
  const savedPart=n=>({id:n.id,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,finished:!!n.finished,instance:{id:n.instance.id,source:n.instance.source,inputs:{violin_lipid:n.instance.inputs.violin_lipid,color_by:n.instance.inputs.color_by}}});
  assert.deepEqual(mounted.nodes.map(savedPart),state.nodes.map(savedPart),'mounted plots keep the restored geometry and settings');
  await page.waitForTimeout(2500);
  const echoes=await page.evaluate(()=>sentInputs.filter(x=>x.name==='team_canvas_state').length);
  assert.ok(echoes<=2,'at most one background state follows hydration (only when the mounted state differs), got '+(echoes-1));
  // 5. Showing, hiding and showing the Canvas creates nothing more.
  await page.evaluate(()=>{const r=document.getElementById('team-canvas-root');r.style.display='';r.offsetWidth;r.style.display='none';r.offsetWidth;r.style.display='';});
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>sentInputs.filter(x=>x.name==='team_canvas_instance_create').length),3,'no instance is requested twice');
  assert.deepEqual(errors,[]);
  console.log(`PASS: hidden-Canvas restore creates no instance at once and a save collects the full canvas; all 3 copies are then created once in idle time with their saved inputs and mount while hidden; mount is hydration only (background states after hydration: ${echoes-1})`);
 }finally{await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
