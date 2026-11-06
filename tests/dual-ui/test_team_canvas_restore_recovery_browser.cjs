// Progressive restore edge cases, against the real Shiny fixture. The restore keeps
// production's semantics: it stays pending until every restored card has mounted, or
// fails through restoreStatus('failed') and its Retry. Only the scheduling differs.
//  capacity:   40 restored cards reserve the 40-figure limit while queued; a new figure
//              is refused, every pending card stays in saves, and all 40 mount once;
//  fallback:   a restored original plot that is returned no longer holds a place: once
//              the canvas is full again, re-adding it through the fallback is refused;
//  failure:    a copy that fails fails the restore (Retry shown, saves keep its node,
//              preview waits); the rest still mount, and Retry restores everything;
//  export:     the preview and export wait while restored cards are pending, then
//              export every card in the saved order;
//  disconnect: closing the connection mid-hydration fails the restore, requests
//              nothing after reconnecting to a fresh server session, and a new restore
//              in that session binds only that session's hosts;
//  token:      an error carrying another request's token (or none) leaves a mounted
//              copy alone; its own token marks it;
//  reset:      Reset cancels an analyst's copy that is still loading;
//  resetrestore: Reset while restored cards are queued or loading completes the
//              restore (nothing is left to mount): the server accepts the reset canvas;
//  analystlast: an analyst's copy that mounts after the last restored card does not
//              hold the restore: it completes when the restored card mounts;
//  duplicate:  two saved nodes sharing one instance namespace (valid node ids): the
//              second is not requested, the restore fails with Retry, and nothing is
//              left pending without a request, a queue entry or a deadline;
//  restores:   a reply to a cancelled restore never initializes a newer restore's copy
//              with the same id;
//  idle:       the idle callback checks again that the server is idle before requesting.
// Starts tests/dual-ui/fixture_team_canvas_lazy_restore_app.R itself.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const port=44000+Math.floor(Math.random()*900);
const only=process.argv[2]||'';
const lipids=['PC(34:1)','PE(36:2)','TG(50:1)'];
const make=(prefix,count,extra)=>Array.from({length:count},(_,i)=>{const id='tcinstance_'+prefix+String(i).padStart(2,'0');return Object.assign({id:id+'-plot_violin',label:prefix+' card '+(i+1),x:30+(i%5)*650,y:30+Math.floor(i/5)*760,width:620,height:720,visual:{background:'#ffffff'},finished:null,instance:{id,source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipids[i%3],color_by:'Group1'}}},extra||{});});
const full=n=>({id:n.id,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,visual:n.visual,finished:n.finished||null,instance:n.instance});
(async()=>{
 const app=spawn('Rscript',['--vanilla',require('node:path').join(__dirname,'fixture_team_canvas_lazy_restore_app.R')],{env:{...process.env,TEAM_LAZY_PORT:String(port)},stdio:['ignore','ignore','pipe']});
 let log='';app.stderr.on('data',d=>{log+=d;});
 const browser=await chromium.launch();
 const results=[];
 async function open(hidden){
  const page=await browser.newPage({viewport:{width:1500,height:1000}});page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.isConnected()&&Shiny.shinyapp.$inputValues['results_dashboard-violin_lipid']);
  await page.evaluate(hidden=>{
   if(hidden)document.getElementById('team-canvas-root').style.display='none';
   window.sentInputs=[];window.corrupt=new Map();window.afterSend=null;window.hold=null;window.held=[];const original=Shiny.setInputValue.bind(Shiny);
   // A corrupted creation request names an unknown source: the server answers it with an instance error.
   Shiny.setInputValue=function(name,value,options){
    if(name==='team_canvas_instance_create'&&value&&corrupt.get(value.id)>0){corrupt.set(value.id,corrupt.get(value.id)-1);value=Object.assign({},value,{source:'results_dashboard-not_a_plot'});}
    sentInputs.push({name,at:performance.now(),value:JSON.parse(JSON.stringify(value??null))});
    // hold(name,value): kept back until released (a slow message).
    if(hold&&hold(name,value)){held.push([name,value,options]);return;}
    const out=original(name,value,options);if(afterSend)afterSend(name,value);return out;};
   window.release=()=>{const all=held.splice(0);for(const [n,v,o] of all)original(n,v,o);return all.length;};
   window.restoreEvents=[];window.addEventListener('team-canvas-restore-status',e=>restoreEvents.push(e.detail.status));
   Shiny.addCustomMessageHandler('test-export',m=>{window.exported=m;});Shiny.addCustomMessageHandler('test-instances',m=>{window.reported=m;});
  },hidden);
  return page;
 }
 const creates=(page,id)=>page.evaluate(id=>sentInputs.filter(x=>x.name==='team_canvas_instance_create'&&(!id||x.value.id===id)).length,id);
 const importState=async(page,state)=>{const n=await page.evaluate(()=>restoreEvents.filter(x=>x==='pending').length);await page.evaluate(s=>Shiny.setInputValue('test_import_state',s,{priority:'event'}),state);await page.waitForFunction(n=>restoreEvents.filter(x=>x==='pending').length>n,n,{timeout:20000});};
 const restored=(page,timeout)=>page.waitForFunction(()=>restoreEvents[restoreEvents.length-1]==='success',null,{timeout});
 const exportNow=async page=>{await page.evaluate(()=>{window.exported=null;Shiny.setInputValue('test_report_export',Math.random(),{priority:'event'});});await page.waitForFunction(()=>window.exported);return page.evaluate(()=>window.exported);};
 const report=async page=>{await page.evaluate(()=>{window.reported=null;Shiny.setInputValue('test_report_instances',Date.now(),{priority:'event'});});await page.waitForFunction(()=>window.reported);return page.evaluate(()=>window.reported);};
 const snapshot='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22200%22%3E%3Crect%20width%3D%22400%22%20height%3D%22200%22%20fill%3D%22%23276e6c%22%2F%3E%3C%2Fsvg%3E';
 const savedState=page=>page.evaluate(async()=>{const ack=await TeamCanvas.checkpoint();return sentInputs.filter(x=>x.name==='team_canvas_state').find(x=>x.value.token===ack.token).value.state;});
 const mounted=page=>page.evaluate(()=>document.querySelectorAll('.tc-node').length);
 try{
  for(let i=0;;i++){try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok)break;}catch(e){}if(i>120)throw new Error('fixture did not start\n'+log);await new Promise(r=>setTimeout(r,250));}

  if(!only||only==='capacity'){
   const page=await open(true),nodes=make('cap',40);
   await importState(page,{version:'1',libraryHidden:false,nodes});
   const added=await page.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin'));
   assert.equal(added,false,'a new figure is refused while 40 restored cards are queued');
   assert.match(await page.evaluate(()=>document.querySelector('.tc-status').textContent),/40 figures/,'the analyst is told why');
   assert.deepEqual((await page.evaluate(()=>TeamCanvas.serialize())).nodes.map(full),nodes.map(full),'the canvas state with 40 queued cards holds them all, unchanged');
   assert.deepEqual((await exportNow(page)).nodes.map(n=>n.id),nodes.map(n=>n.id),'the server copy holds all 40 while they are queued');
   await page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
   await restored(page,300000);
   assert.equal(await mounted(page),40);
   assert.equal(await creates(page),40,'every restored card was requested once; none was consumed by the limit');
   assert.equal(await page.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin')),false,'still refused with 40 mounted cards');
   // The original-plot fallback (no live connection for an independent copy) is refused too.
   const fallback=await page.evaluate(()=>{const socket=Shiny.shinyapp.$socket;Shiny.shinyapp.$socket=null;try{return TeamCanvas.addPlot('results_dashboard-plot_violin');}finally{Shiny.shinyapp.$socket=socket;}});
   assert.equal(fallback,false,'the original-plot fallback is refused at 40 figures');
   assert.equal(await mounted(page),40,'no 41st card was mounted');
   const saved=await savedState(page);
   assert.deepEqual(saved.nodes.map(n=>n.id),nodes.map(n=>n.id),'after the restore, saves work with 40 mounted cards');
   assert.deepEqual(await page.evaluate(()=>restoreEvents),['pending','success']);
   assert.deepEqual(page.errors,[]);results.push('capacity: 40 queued cards refuse a 41st figure and stay in the state, all 40 mount once, the fallback is refused, then saves work');await page.close();
  }

  if(!only||only==='fallback'){
   const page=await open(true);
   const original={id:'results_dashboard-plot_violin',label:'Original violin',x:30,y:30,width:620,height:720,visual:{background:'#ffffff'},finished:{url:snapshot,createdAt:'2026-10-29T00:00:00Z',stale:false}};
   const copies=make('fb',39).map(n=>Object.assign(n,{y:n.y+800}));
   await importState(page,{version:'1',libraryHidden:false,nodes:[original].concat(copies)});
   await page.waitForFunction(()=>!!document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_violin"]'),null,{timeout:20000});
   // Return the archived original to its view: it no longer holds a place.
   await page.evaluate(()=>Array.from(document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_violin"]').querySelectorAll('button')).find(b=>b.textContent==='Return').click());
   assert.equal(await page.evaluate(()=>!!document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_violin"]')),false,'the original was returned');
   // An analyst's copy takes the 40th place (39 restored cards are queued or mounted).
   assert.equal(await page.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin')),true,'a 40th figure is accepted');
   const fallback=await page.evaluate(()=>{const socket=Shiny.shinyapp.$socket;Shiny.shinyapp.$socket=null;try{return TeamCanvas.addPlot('results_dashboard-plot_violin');}finally{Shiny.shinyapp.$socket=socket;}});
   assert.equal(fallback,false,'re-adding the returned original through the fallback is refused at 40 figures');
   assert.equal(await page.evaluate(()=>!!document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_violin"]')),false,'the original did not come back as a 41st card');
   await page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
   await restored(page,300000);
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===40&&!document.querySelector('.tc-restore-settling'),null,{timeout:60000});
   const state=await page.evaluate(()=>TeamCanvas.serialize());
   assert.equal(state.nodes.length,40,'the canvas holds 40 figures and still serializes');
   assert.equal(await page.evaluate(()=>{try{TeamCanvas.restore(TeamCanvas.serialize());return true;}catch(e){return e.message;}}),true,'the 40-figure state is valid');
   assert.deepEqual(page.errors,[]);results.push('fallback: a returned archived original no longer holds a place; with 40 figures its fallback re-add is refused');await page.close();
  }

  if(!only||only==='failure'){
   const page=await open(true),nodes=make('rec',3);
   await page.evaluate(()=>{corrupt.set('tcinstance_rec01',1);});
   await importState(page,{version:'1',libraryHidden:false,nodes});
   await page.waitForFunction(()=>restoreEvents.includes('failed'),null,{timeout:120000});
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2&&!document.querySelector('.tc-restore-settling')&&TeamCanvas.restoreProgress().queued===0&&TeamCanvas.restoreProgress().loading===0,null,{timeout:120000});
   const failed=await page.evaluate(()=>({events:restoreEvents.slice(),button:(b=>({hidden:b.hidden,text:b.textContent}))(document.querySelector('.tc-restore-retry')),ids:Array.from(document.querySelectorAll('.tc-node')).map(n=>n.dataset.plotId),state:TeamCanvas.serialize(),preview:TeamCanvas.previewState()}));
   assert.deepEqual(failed.events,['pending','failed'],'the failing copy fails the restore, as an immediate restore did');
   assert.deepEqual(failed.button,{hidden:false,text:'Retry saved workspace'},'production\'s Retry is shown');
   assert.deepEqual(failed.ids,[nodes[0].id,nodes[2].id],'the other copies still mounted');
   assert.deepEqual(full(failed.state.nodes.find(n=>n.id===nodes[1].id)),full(nodes[1]),'the canvas state keeps the failed card exactly as saved');
   assert.deepEqual(failed.state.nodes.map(n=>n.id),nodes.map(n=>n.id),'in its saved order');
   assert.equal(failed.preview.settled,false,'the preview waits for the failed card');
   assert.match(failed.preview.message,/waiting for their analysis/);
   assert.deepEqual((await exportNow(page)).nodes.map(n=>n.id),nodes.map(n=>n.id),'the server copy still holds all three');
   await page.evaluate(()=>document.querySelector('.tc-restore-retry').click());
   await restored(page,120000);
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===3&&!document.querySelector('.tc-restore-settling'),null,{timeout:60000});
   assert.deepEqual(await page.evaluate(()=>restoreEvents),['pending','failed','pending','success'],'Retry restored the workspace');
   assert.equal(await page.evaluate(()=>document.querySelector('.tc-restore-retry').hidden),true,'Retry is hidden again');
   const after=await page.evaluate(()=>TeamCanvas.serialize());
   assert.deepEqual(after.nodes.map(n=>({id:n.id,x:n.x,y:n.y,lipid:n.instance.inputs.violin_lipid})),nodes.map(n=>({id:n.id,x:n.x,y:n.y,lipid:n.instance.inputs.violin_lipid})),'after Retry every card is mounted as saved');
   assert.deepEqual(page.errors,[]);results.push('failure: a failing copy fails the restore (Retry shown, state keeps it, preview waits), the rest mount, and Retry restores all three');await page.close();
  }

  if(!only||only==='resetrestore'){
   const page=await open(true),nodes=make('rr',4);
   await importState(page,{version:'1',libraryHidden:false,nodes});
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length>=1,null,{timeout:60000});
   const before=await page.evaluate(()=>({progress:TeamCanvas.restoreProgress(),last:restoreEvents[restoreEvents.length-1]}));
   assert.ok(before.progress.queued+before.progress.loading>0&&before.last==='pending','Reset while restored cards are still queued or loading '+JSON.stringify(before));
   await page.evaluate(()=>{document.querySelector('.tc-reset').click();const y=document.querySelector('.tc-reset-yes');if(y)y.click();});
   await page.waitForFunction(()=>restoreEvents[restoreEvents.length-1]==='success',null,{timeout:5000}).catch(()=>{});
   const after=await page.evaluate(()=>({events:restoreEvents.slice(),progress:TeamCanvas.restoreProgress(),nodes:TeamCanvas.serialize().nodes.length,retry:document.querySelector('.tc-restore-retry').hidden}));
   assert.deepEqual(after.events,['pending','success'],'Reset completed the pending restore: nothing was left to mount');
   assert.deepEqual({queued:after.progress.queued,loading:after.progress.loading,pending:after.progress.pending,nodes:after.nodes},{queued:0,loading:0,pending:0,nodes:0});
   // The server accepts canvas states again: it now holds the reset canvas.
   await page.waitForFunction(()=>{const states=sentInputs.filter(x=>x.name==='team_canvas_state');return states.length>0;},null,{timeout:10000});
   await page.waitForTimeout(1000);
   assert.equal((await exportNow(page)).nodes.length,0,'the server holds the reset canvas');
   await page.waitForTimeout(3000);
   assert.equal(await mounted(page),0,'no cancelled restored card came back');
   assert.deepEqual(page.errors,[]);results.push(`resetrestore: Reset with ${before.progress.queued} queued and ${before.progress.loading} loading restored cards completes the restore and the server accepts the reset canvas`);await page.close();
  }

  if(!only||only==='analystlast'){
   const page=await open(true),nodes=make('al',1);
   // The analyst's copy is slow: its creation request is held until released.
   await page.evaluate(()=>{hold=(name,value)=>name==='team_canvas_instance_create'&&!/^tcinstance_al00$/.test(value.id);});
   await importState(page,{version:'1',libraryHidden:false,nodes});
   assert.equal(await page.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin')),true,'the analyst adds a copy while the restore is pending');
   await page.waitForFunction(()=>held.length===1,null,{timeout:5000});
   await page.waitForFunction(id=>!!document.querySelector('.tc-node[data-plot-id="'+id+'"]')&&TeamCanvas.restoreProgress().pending===0&&TeamCanvas.restoreProgress().queued===0&&TeamCanvas.restoreProgress().loading===0,nodes[0].id,{timeout:60000});
   await page.waitForFunction(()=>restoreEvents[restoreEvents.length-1]==='success',null,{timeout:5000}).catch(()=>{});
   const atMount=await page.evaluate(()=>restoreEvents.slice());
   await page.evaluate(()=>release());
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2,null,{timeout:60000});
   await page.waitForTimeout(1500);
   const events=await page.evaluate(()=>restoreEvents.slice());
   assert.deepEqual(atMount,['pending','success'],'the restore completed when its last card mounted, with the analyst\'s copy still loading');
   assert.deepEqual(events,['pending','success'],'and stays complete once the analyst\'s copy mounts');
   const saved=await savedState(page);
   assert.equal(saved.nodes.length,2,'the server accepts the canvas with both cards');
   assert.deepEqual(page.errors,[]);results.push('analystlast: an analyst copy mounting after the last restored card does not hold the restore');await page.close();
  }

  if(!only||only==='duplicate'){
   // Canvas shown: several copies are requested at once, so the second node is reached
   // while the first, with the same namespace, is still in flight.
   const page=await open(false);
   const violin={id:'tcinstance_dup-plot_violin',label:'Violin',x:30,y:30,width:620,height:720,visual:{background:'#ffffff'},finished:null,instance:{id:'tcinstance_dup',source:'results_dashboard-plot_violin',inputs:{violin_lipid:'PC(34:1)',color_by:'Group1'}}};
   const pca={id:'tcinstance_dup-plot_pca',label:'PCA',x:700,y:30,width:620,height:720,visual:{background:'#ffffff'},finished:null,instance:{id:'tcinstance_dup',source:'results_dashboard-plot_pca',inputs:{}}};
   const other=make('dupx',1)[0];
   const nodes=[violin,pca,other];
   await importState(page,{version:'1',libraryHidden:false,nodes});
   await page.waitForFunction(()=>restoreEvents.includes('failed'),null,{timeout:60000});
   await page.waitForFunction(()=>TeamCanvas.restoreProgress().queued===0&&TeamCanvas.restoreProgress().loading===0,null,{timeout:60000});
   await page.waitForTimeout(1500);
   const out=await page.evaluate(()=>({events:restoreEvents.slice(),retry:(b=>({hidden:b.hidden,disabled:b.disabled}))(document.querySelector('.tc-restore-retry')),state:TeamCanvas.serialize(),progress:TeamCanvas.restoreProgress(),requested:sentInputs.filter(x=>x.name==='team_canvas_instance_create').map(x=>x.value.source)}));
   assert.deepEqual(out.events,['pending','failed'],'the restore failed');
   assert.deepEqual(out.retry,{hidden:false,disabled:false},'with a working Retry');
   assert.deepEqual(out.requested.sort(),['results_dashboard-plot_violin','results_dashboard-plot_violin'],'one request per namespace: the violin and the other card');
   assert.deepEqual(out.state.nodes.map(n=>n.id),nodes.map(n=>n.id),'the canvas state keeps every node');
   assert.deepEqual(full(out.state.nodes[1]),full(pca),'the unrequested node exactly as saved');
   // Retry fails again (the checkpoint is unchanged) within bounded time, Retry still offered.
   await page.evaluate(()=>document.querySelector('.tc-restore-retry').click());
   await page.waitForFunction(()=>restoreEvents.filter(x=>x==='failed').length===2,null,{timeout:60000});
   assert.deepEqual(await page.evaluate(()=>restoreEvents),['pending','failed','pending','failed']);
   await page.waitForFunction(()=>{const b=document.querySelector('.tc-restore-retry');return !b.hidden&&!b.disabled;},null,{timeout:5000});
   assert.deepEqual(page.errors,[]);results.push('duplicate: a shared instance namespace fails the restore (Retry offered, every node kept), never a pending node without a request');await page.close();
  }

  if(!only||only==='reserve'){
   const page=await open(true),nodes=make('rsv',4);
   await page.evaluate(()=>{window.instanceErrors=[];jQuery(document).on('shiny:message',e=>{const c=e.message&&e.message.custom;if(c&&c['team-canvas-instance-error'])instanceErrors.push(c['team-canvas-instance-error']);});Shiny.addCustomMessageHandler('test-filled',m=>{window.filled=m.count;});Shiny.setInputValue('test_fill_instances',156,{priority:'event'});});
   await page.waitForFunction(()=>window.filled===156,null,{timeout:10000});
   await importState(page,{version:'1',libraryHidden:false,nodes});
   // While the 4 restored copies are queued, the analyst adds a copy: the session has
   // 156 instances and 4 saved namespaces awaiting creation, so it is refused.
   assert.ok((await page.evaluate(()=>TeamCanvas.restoreProgress().queued))>0,'restored copies are still queued');
   assert.equal(await page.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin')),true,'the browser sends the analyst copy');
   const analyst=await page.evaluate(()=>sentInputs.filter(x=>x.name==='team_canvas_instance_create').pop().value.id);
   await page.waitForFunction(id=>instanceErrors.some(e=>e.id===id),analyst,{timeout:20000});
   assert.match(await page.evaluate(id=>instanceErrors.find(e=>e.id===id).message,analyst),/160 independent plots/,'the analyst copy is refused at the limit');
   await page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
   await restored(page,120000);
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===4,null,{timeout:60000});
   assert.deepEqual(await page.evaluate(()=>restoreEvents),['pending','success'],'every restored copy took its reserved place and the restore completed');
   assert.deepEqual(await page.evaluate(()=>instanceErrors.filter(e=>/^tcinstance_rsv/.test(e.id))),[],'no restored copy was refused');
   assert.deepEqual(page.errors,[]);results.push('reserve: with 156 instances, 4 queued restored copies keep their places: the analyst copy is refused and the restore completes');await page.close();
  }

  if(!only||only==='claim'){
   const page=await open(true),nodes=make('clm',1);
   await page.evaluate(()=>{window.instanceErrors=[];jQuery(document).on('shiny:message',e=>{const c=e.message&&e.message.custom;if(c&&c['team-canvas-instance-error'])instanceErrors.push(c['team-canvas-instance-error']);});});
   await importState(page,{version:'1',libraryHidden:false,nodes});
   // A PCA request for the violin's pending saved namespace, before the violin is requested.
   assert.equal(await page.evaluate(()=>TeamCanvas.restoreProgress().queued),1,'the violin is still queued');
   await page.evaluate(()=>Shiny.setInputValue('team_canvas_instance_create',{id:'tcinstance_clm00',source:'results_dashboard-plot_pca',inputs:{},request:'r900_claim'},{priority:'event'}));
   await page.waitForFunction(()=>instanceErrors.some(e=>e.request==='r900_claim'),null,{timeout:10000});
   assert.match(await page.evaluate(()=>instanceErrors.find(e=>e.request==='r900_claim').message),/already belongs to another plot/,'the PCA request is refused');
   await page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
   await restored(page,60000);
   await page.waitForFunction(id=>!!document.querySelector('.tc-node[data-plot-id="'+id+'"]'),nodes[0].id,{timeout:60000});
   const reported=await report(page);
   assert.deepEqual(reported.inputs.tcinstance_clm00,nodes[0].instance.inputs,'the violin restored with its saved settings');
   assert.deepEqual(await page.evaluate(()=>restoreEvents),['pending','success']);
   assert.deepEqual(page.errors,[]);results.push('claim: a request with another source for a pending saved namespace is refused and the saved copy still restores');await page.close();
  }

  if(!only||only==='export'){
   const page=await open(true);
   const nodes=make('exp',3,{finished:{url:snapshot,createdAt:'2026-10-29T00:00:00Z',stale:false}});
   await importState(page,{version:'1',libraryHidden:false,nodes});
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length>=1,null,{timeout:60000});
   const waiting=await page.evaluate(()=>({mounted:document.querySelectorAll('.tc-node').length,preview:TeamCanvas.previewState()}));
   assert.ok(waiting.mounted<3,'previewed while cards are pending ('+waiting.mounted+' mounted)');
   assert.deepEqual({settled:waiting.preview.settled,ready:waiting.preview.ready},{settled:false,ready:false},'the preview waits for pending restored cards');
   assert.match(waiting.preview.message,/waiting for their analysis/);
   await page.evaluate(()=>{window.figuresDrawn=0;const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...rest){if(image&&image.src&&image.src.indexOf('data:image/svg+xml')===0&&image.src.indexOf('276e6c')>0)figuresDrawn++;return draw.call(this,image,...rest);};window.pdfImages=[];window.jspdf={jsPDF:function(){this.setTextColor=this.setFontSize=this.text=this.addPage=()=>{};this.splitTextToSize=x=>[x];this.addImage=(...a)=>pdfImages.push(a.length);this.save=name=>{window.pdfSaved=name;};}};document.getElementById('team-canvas-root').style.display='';});
   await page.addScriptTag({url:'/team/js/canvas_preview.js'});
   await restored(page,120000);
   await page.waitForFunction(()=>TeamCanvas.previewState().ready===true,null,{timeout:30000});
   const ready=await page.evaluate(()=>{const p=TeamCanvas.previewState();return {usable:p.usableIds.slice().sort(),order:p.state.nodes.map(n=>n.id)};});
   assert.deepEqual(ready,{usable:nodes.map(n=>n.id).sort(),order:nodes.map(n=>n.id)},'every card is exportable, and the exported state is in the saved order');
   await page.getByRole('tab',{name:'Print preview'}).click();
   await page.waitForFunction(()=>{const b=document.querySelector('.tc-preview-pdf');return b&&!b.disabled;},null,{timeout:20000});
   assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('.tc-compose-excluded')).map(n=>n.textContent)),[],'nothing is reported excluded');
   await page.evaluate(()=>{window.figuresDrawn=0;document.querySelector('.tc-preview-pdf').click();});
   await page.waitForFunction(()=>!!window.pdfSaved,null,{timeout:20000});
   assert.equal(await page.evaluate(()=>figuresDrawn),3,'the PDF export drew all three finished figures');
   assert.deepEqual(page.errors,[]);results.push('export: the preview waits while restored cards are pending, then all 3 are exported in the saved order');await page.close();
  }

  if(!only||only==='disconnect'){
   const page=await open(true),nodes=make('dis',4);
   const session0=await page.evaluate(()=>Shiny.shinyapp.config.sessionId);
   // The connection closes once the server has inserted card 2's host, before it mounts.
   await page.evaluate(()=>{window.closedBeforeMount=null;const watch=new MutationObserver(()=>{if(!document.getElementById('tcinstance_dis01_host'))return;watch.disconnect();closedBeforeMount=!document.querySelector('.tc-node[data-plot-id="tcinstance_dis01-plot_violin"]');window.closedAt=sentInputs.length;Shiny.shinyapp.$socket.close();});watch.observe(document.body,{childList:true});});
   await importState(page,{version:'1',libraryHidden:false,nodes});
   await page.waitForFunction(()=>restoreEvents.includes('failed'),null,{timeout:120000});
   assert.equal(await page.evaluate(()=>closedBeforeMount),true,'the connection closed after the host arrived and before its card mounted');
   await page.waitForFunction(s=>Shiny.shinyapp.isConnected()&&Shiny.shinyapp.config.sessionId!==s,session0,{timeout:60000});
   await page.waitForTimeout(4000);
   const after=await page.evaluate(()=>({events:restoreEvents.slice(),creates:sentInputs.slice(closedAt).filter(x=>x.name==='team_canvas_instance_create').length,progress:TeamCanvas.restoreProgress(),state:TeamCanvas.serialize(),mountedIds:Array.from(document.querySelectorAll('.tc-node')).map(n=>n.dataset.plotId),staleHost:document.querySelector('#tcinstance_dis01_host[data-tc-stale="true"]')!==null,preview:TeamCanvas.previewState().settled}));
   assert.deepEqual(after.events,['pending','failed'],'the interrupted restore failed, as an immediate restore did');
   assert.equal(after.creates,0,'nothing was requested from the new server session');
   assert.deepEqual({queued:after.progress.queued,loading:after.progress.loading},{queued:0,loading:0});
   assert.equal(after.staleHost,false,'the interrupted card\'s old host is gone');
   assert.deepEqual(after.state.nodes.map(n=>n.id),nodes.map(n=>n.id),'the canvas state keeps every card');
   for(const n of after.state.nodes.filter(n=>!after.mountedIds.includes(n.id)))assert.deepEqual(full(n),full(nodes.find(x=>x.id===n.id)),'unmounted card '+n.id+' is kept exactly as saved');
   assert.equal(after.preview,false,'the preview waits');
   // A new restore in the new session binds that session's hosts only.
   await page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';restoreEvents.length=0;});
   await importState(page,{version:'1',libraryHidden:false,nodes});
   await restored(page,120000);
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===4&&!document.querySelector('.tc-restore-settling'),null,{timeout:60000});
   const bound=await page.evaluate(ids=>ids.map(id=>{const all=document.querySelectorAll('[id="'+id+'-plot_violin"]'),el=all[0];return {id,count:all.length,onCanvas:!!(el&&el.closest('.tc-board')),stale:!!(el&&el.closest('[data-tc-stale="true"]')),host:document.querySelectorAll('[id="'+id+'_host"]').length,status:TeamCanvas.cardStatus(id+'-plot_violin')};}),nodes.map(n=>n.instance.id));
   for(const b of bound)assert.deepEqual({count:b.count,onCanvas:b.onCanvas,stale:b.stale,host:b.host},{count:1,onCanvas:true,stale:false,host:1},'card '+b.id+' is bound once, to a host of the new session');
   await page.waitForFunction(ids=>ids.every(id=>Shiny.shinyapp.$inputValues[id+'-violin_lipid']!==undefined),nodes.map(n=>n.instance.id),{timeout:30000});
   const reported=await report(page);
   for(const n of nodes)assert.deepEqual(reported.inputs[n.instance.id],n.instance.inputs,'the new session runs '+n.instance.id+' with its saved inputs');
   assert.deepEqual(await page.evaluate(()=>restoreEvents),['pending','success']);
   assert.deepEqual(page.errors,[]);results.push('disconnect: a real socket close mid-hydration fails the restore, nothing is requested from the fresh session, and a new restore binds only fresh hosts');await page.close();
  }

  if(!only||only==='token'){
   const page=await open(false),nodes=make('tok',1);
   await importState(page,{version:'1',libraryHidden:false,nodes});
   await restored(page,60000);
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===1&&!document.querySelector('.tc-restore-settling'),null,{timeout:60000});
   const token=await page.evaluate(()=>sentInputs.filter(x=>x.name==='team_canvas_instance_create').pop().value.request);
   const status=()=>page.evaluate(()=>TeamCanvas.cardStatus('tcinstance_tok00-plot_violin'));
   const before=await status();
   for(const request of ['r0_cancelled',null]){
    await page.evaluate(request=>Shiny.setInputValue('test_instance_error',request?{id:'tcinstance_tok00',request}:{id:'tcinstance_tok00'},{priority:'event'}),request);
    await page.waitForTimeout(1500);
    assert.equal(await status(),before,'an error with '+(request?'another request\'s token':'no token')+' leaves the mounted copy alone');
   }
   await page.evaluate(token=>Shiny.setInputValue('test_instance_error',{id:'tcinstance_tok00',request:token},{priority:'event'}),token);
   await page.waitForFunction(()=>TeamCanvas.cardStatus('tcinstance_tok00-plot_violin')==='error',null,{timeout:5000});
   assert.deepEqual(page.errors,[]);results.push(`token: errors with another token or none leave a mounted copy (${before}) alone; its own token marks it`);await page.close();
  }

  if(!only||only==='reset'){ // 4
   const page=await open(false);
   assert.equal(await page.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin')),true);
   const id=await page.evaluate(()=>sentInputs.find(x=>x.name==='team_canvas_instance_create').value.id);
   await page.evaluate(()=>{document.querySelector('.tc-reset').click();const y=document.querySelector('.tc-reset-yes');if(y)y.click();});
   await page.waitForTimeout(4000);
   assert.equal(await mounted(page),0,'Reset cancelled the loading copy: it never mounts');
   assert.ok(await page.evaluate(id=>sentInputs.some(x=>x.name==='team_canvas_instance_park'&&x.value===id),id),'the cancelled copy was parked on the server');
   assert.equal((await page.evaluate(()=>TeamCanvas.serialize())).nodes.length,0,'nothing is saved for it');
   assert.deepEqual(page.errors,[]);results.push('reset: an analyst copy still loading is cancelled and parked');await page.close();
  }

  if(!only||only==='restores'){ // 5
   const page=await open(false);
   const node=lipid=>({id:'tcinstance_twice-plot_violin',label:'Twice',x:30,y:30,width:620,height:720,visual:{background:'#ffffff'},finished:null,instance:{id:'tcinstance_twice',source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipid,color_by:'Group1'}}});
   const A={version:'1',libraryHidden:false,nodes:[node('PC(34:1)')]},B={version:'1',libraryHidden:false,nodes:[node('TG(50:1)')]};
   // Restore B replaces restore A right after A's copy was requested, before its reply.
   await page.evaluate(B=>{let done=false;afterSend=(name,value)=>{if(done||name!=='team_canvas_instance_create'||value.id!=='tcinstance_twice')return;done=true;TeamCanvas.restore(B);};},B);
   await page.evaluate(A=>TeamCanvas.restore(A),A);
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===1&&!document.querySelector('.tc-restore-settling'),null,{timeout:60000});
   await page.waitForTimeout(1500);
   const out=await page.evaluate(()=>({lipid:TeamCanvas.serialize().nodes[0].instance.inputs.violin_lipid,input:Shiny.shinyapp.$inputValues['tcinstance_twice-violin_lipid'],creates:sentInputs.filter(x=>x.name==='team_canvas_instance_create').map(x=>x.value.instance?x.value.instance.inputs.violin_lipid:x.value.inputs.violin_lipid)}));
   assert.deepEqual(out.creates,['PC(34:1)','TG(50:1)'],'restore A then restore B each requested the copy once');
   assert.equal(out.lipid,'TG(50:1)','the mounted copy has the newer restore\'s settings');
   assert.equal(out.input,'TG(50:1)','the copy runs with the newer restore\'s settings');
   assert.deepEqual(page.errors,[]);results.push('restores: a reply to the cancelled restore never initializes the newer restore of the same id');await page.close();
  }

  if(!only||only==='idle'){ // 6
   const page=await open(true);
   await page.evaluate(()=>{window.idleCallbacks=[];window.requestIdleCallback=function(fn){idleCallbacks.push(fn);return idleCallbacks.length;};window.cancelIdleCallback=function(){};});
   await importState(page,{version:'1',libraryHidden:false,nodes:make('idle',2)});
   await page.waitForFunction(()=>idleCallbacks.length>0,null,{timeout:10000});
   // The server becomes busy after the idle callback was scheduled, before it runs.
   await page.evaluate(()=>{document.documentElement.classList.add('shiny-busy');idleCallbacks.shift()({didTimeout:false,timeRemaining:()=>50});});
   await page.waitForTimeout(1500);
   assert.equal(await creates(page),0,'the idle callback did not request a copy while the server was busy');
   // While busy, the wait is bounded (15 s): the copy is then requested anyway.
   await page.evaluate(()=>{window.idlePump=setInterval(()=>{while(idleCallbacks.length)idleCallbacks.shift()({didTimeout:true,timeRemaining:()=>0});},50);});
   const t0=Date.now();
   await page.waitForFunction(()=>sentInputs.some(x=>x.name==='team_canvas_instance_create'),null,{timeout:30000});
   const waited=Date.now()-t0;
   assert.ok(waited>=10000,'the busy wait applied before the forced request ('+waited+' ms)');
   await page.evaluate(()=>document.documentElement.classList.remove('shiny-busy'));
   await page.waitForFunction(()=>document.querySelectorAll('.tc-node').length===2,null,{timeout:60000});
   assert.deepEqual(page.errors,[]);results.push(`idle: a busy server at idle-callback time defers the request (forced after ${Math.round(waited/1000)} s of busy wait)`);await page.close();
  }
  console.log('PASS: '+results.join('; '));
 }finally{await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
