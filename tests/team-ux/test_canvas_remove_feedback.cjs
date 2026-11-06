// Canvas card Remove / Return feedback on a restored checkpoint (synthetic library only).
// For an independent copy (Remove), a library plot (Return) and an illustration, clicked like a
// person (the card's ⋯ menu, real mouse): the card fades out, then a toast names it with Undo;
// the saved canvas state after the removal equals the old synchronous path (the same state minus
// that card, and a save signal); Undo brings the card back with the same saved node, creation
// order and tab. Failures show a visible error toast: a library plot whose original view is gone
// stays (and says so); an independent copy whose hidden host is gone is now removed.
// TEAM_URL, TEAM_EMAIL, TEAM_PASSWORD; optional TEAM_CHECKPOINT (name prefix), TEAM_UX_SHOTS=<dir>,
// PLAYWRIGHT=<path to playwright> (default ../browser/ci/node_modules/playwright).
const assert=require('node:assert/strict');const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT||'../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD,shots=process.env.TEAM_UX_SHOTS,checkpoint=process.env.TEAM_CHECKPOINT||'';
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
if(shots)fs.mkdirSync(shots,{recursive:true});
const shot=async(p,name)=>{if(shots)await p.screenshot({path:shots+'/'+name+'.png'});};
async function open(p){
 await p.goto(url,{waitUntil:'domcontentloaded',timeout:180000});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
 await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
 await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
 await p.evaluate(()=>{const x=document.querySelector('#team_library_password');if(x)x.value='';});
 await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');if(name){const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;}else s.selectedIndex=0;s.dispatchEvent(new Event('change',{bubbles:true}));},checkpoint);
 await p.waitForTimeout(1000);
 await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.locator('#team_library_resume').click();
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled&&window.TeamWorkspace?.state().preparationReady;},null,{timeout:600000,polling:250});
 await p.evaluate(()=>document.querySelector('[data-tw-stage="canvas"]').click());
 await settled(p);
}
const settled=p=>p.waitForFunction(()=>document.body.dataset.twScreen==='canvas'&&window.TeamAutosave?.state().restorePending===false&&window.TeamCanvas?.restoreProgress().pending===0&&!document.querySelector('.tc-node .tc-restore-settling')&&!document.documentElement.classList.contains('shiny-busy'),null,{timeout:600000,polling:250}).then(()=>p.waitForTimeout(2000));
// The saved canvas, as an autosave would send it.
const state=p=>p.evaluate(()=>JSON.parse(JSON.stringify(TeamCanvas.serialize())));
const without=(s,id)=>{const c=JSON.parse(JSON.stringify(s));c.nodes=c.nodes.filter(n=>n.id!==id);if(c.tabs){c.tabs.tabs.forEach(t=>{t.nodes=t.nodes.filter(n=>n!==id);});c.tabs.figure.deselected=c.tabs.figure.deselected.filter(n=>n!==id);c.tabs.figure.order=c.tabs.figure.order.filter(n=>n!==id);}return c;};
// The figure document lists cards by id; it is compared through the nodes it keeps.
const strip=s=>{const c=JSON.parse(JSON.stringify(s));delete c.document;return c;};
const node=(s,id)=>s.nodes.find(n=>n.id===id);
async function click(p,sel){
 // Wait (up to 3 s) until the target is the element under its own centre: card bars are placed a frame or more after a camera move.
 await p.waitForFunction(sel=>{const t=document.querySelector(sel);if(!t)return false;const r=t.getBoundingClientRect();if(!r.width)return false;const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!(e&&(e===t||t.contains(e)));},sel,{timeout:3000,polling:100}).catch(async()=>{if(shots)await p.screenshot({path:shots+'/click-miss.png'});console.log('click target state',JSON.stringify(await p.evaluate(sel=>{const t=document.querySelector(sel),bar=t&&t.closest('.tc-card-actions');return bar&&{cls:bar.className,style:bar.getAttribute('style'),node:bar.closest('.tc-node').className};},sel)));});
 const box=await p.locator(sel).boundingBox();assert.ok(box,'no box for '+sel);
 const x=box.x+box.width/2,y=box.y+box.height/2;
 const ok=await p.evaluate(([x,y,sel])=>{const e=document.elementFromPoint(x,y),t=document.querySelector(sel);return e&&t&&(t===e||t.contains(e))?true:(e?e.tagName+'.'+e.className+' in '+(e.closest('[class]')?.className||''):'nothing');},[x,y,sel]);
 assert.ok(ok===true,'a real click on '+sel+' would hit '+ok);
 await p.mouse.move(x,y,{steps:3});await p.mouse.down();await p.mouse.up();
}
async function focus(p,id){
 await p.evaluate(id=>{document.querySelectorAll('[data-ux-target]').forEach(n=>delete n.dataset.uxTarget);const n=[...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node')].find(n=>n.dataset.canvasOrderId===id);n.dataset.uxTarget='1';TeamCanvasViewport.focusNode(n,{readable:true});},id);
 await p.waitForTimeout(900);await p.mouse.move(5,450);await p.waitForTimeout(200);
}
// Opens the card's ⋯ menu (plots) and clicks its Remove/Return; an illustration's Remove is in its header.
async function pressRemove(p,id){
 await focus(p,id);const card='[data-ux-target="1"]';
 // A floating action bar (and an illustration's actions) shows on selection: select the card by its title first, as a person would.
 await click(p,card+' > .tc-node-head > strong');await p.waitForTimeout(300);
 if(await p.locator(card+' .tc-card-more').count()){
  await click(p,card+' .tc-card-more');
  // The open menu must not move under the pointer (it used to jump ~440 px when the footer bar re-docked).
  const at=()=>p.evaluate(card=>{const b=[...document.querySelectorAll(card+' .tc-card-menu button')].find(b=>/^(Remove|Return)$/.test(b.textContent.trim()));const r=b.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y)];},card);
  const first=await at();await p.waitForTimeout(800);const later=await at();
  assert.deepEqual(later,first,'the open ⋯ menu moved from '+first+' to '+later);
 }
 const label=await p.evaluate(card=>{document.querySelectorAll('[data-ux-remove]').forEach(x=>delete x.dataset.uxRemove);const b=[...document.querySelectorAll(card+' button')].find(b=>/^(Remove|Return)$/.test(b.textContent.trim()));b.dataset.uxRemove='1';return b.textContent.trim();},card);
 const watch=p.evaluate(card=>new Promise(res=>{const n=document.querySelector(card),out=[];const t0=performance.now();(function tick(){const t=performance.now()-t0;out.push({t:Math.round(t),on:n.isConnected,leaving:n.classList.contains('tc-feedback-leaving'),opacity:+getComputedStyle(n).opacity,transform:getComputedStyle(n).transform,transition:getComputedStyle(n).transitionDuration,toast:!!document.querySelector('.tc-feedback-toast')});if(!n.isConnected||t>4000){res(out);return;}requestAnimationFrame(tick);})();}),card);
 await click(p,'[data-ux-remove="1"]');const at=Date.now();
 return {label,at,frames:await watch};
}
const toast=p=>p.evaluate(()=>{const t=document.querySelector('.tc-feedback-toast');if(!t)return null;const r=t.getBoundingClientRect(),cs=getComputedStyle(t);return {text:t.querySelector('.tc-feedback-text').textContent,undo:!!t.querySelector('.tc-feedback-undo'),error:t.classList.contains('is-error'),role:t.getAttribute('role'),opacity:+cs.opacity,inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.width>0,focusUndo:document.activeElement===t.querySelector('.tc-feedback-undo')};});
const present=(p,id)=>p.evaluate(id=>!![...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node')].find(n=>n.dataset.canvasOrderId===id),id);
const order=(p)=>p.evaluate(()=>TeamCanvas.creationOrder());
async function removeAndUndo(p,id,kind,name,switchTab){
 const before=await state(p),orderBefore=await order(p);
 await p.evaluate(()=>{window.__uxChanged=0;window.addEventListener('team-canvas-changed',()=>window.__uxChanged++);});
 const r=await pressRemove(p,id);const clickedAt=r.at;
 // A person reaches for Undo: the pointer over the toast pauses its countdown while the checks run.
 await p.waitForSelector('.tc-feedback-toast .tc-feedback-undo',{timeout:5000});{const bx=await p.locator('.tc-feedback-toast .tc-feedback-text').boundingBox();await p.mouse.move(bx.x+5,bx.y+bx.height/2);}
 assert.equal(r.label,kind==='return'?'Return':'Remove',name+': button label');
 // Visible exit: still on the canvas for a moment, fading (opacity below 1, scaled), then gone.
 // A busy page can skip frames of the 150 ms fade: require the leaving state on the canvas with its
 // opacity/transform transition, and at least one frame partway when frames were painted.
 const leaving=r.frames.filter(f=>f.on&&f.leaving);
 assert.ok(leaving.length>=1&&/0\.15s/.test(leaving[0].transition),name+': no leaving state '+JSON.stringify(r.frames.slice(-8)));
 if(leaving.length>=3)assert.ok(leaving.some(f=>f.opacity<0.999&&f.transform!=='none'),name+': card did not fade/scale '+JSON.stringify(leaving));
 // The toast is there at once, while the card is still fading (before any teardown).
 assert.ok(r.frames.filter(f=>f.on&&f.leaving)[0]?.toast,name+': toast not shown at the click');
 const gone=r.frames.find(f=>!f.on);assert.ok(gone&&gone.t>=100&&gone.t<=3000,name+': card left at '+(gone&&gone.t)+' ms');
 await p.waitForTimeout(250);await shot(p,name+'-1-removed');
 const t=await toast(p);assert.ok(t,name+': no toast');
 const title=node(before,id).label;
 assert.equal(t.text,kind==='return'?'Returned '+title+' to its original view.':'Removed '+title+'.',name+': toast text');
 assert.ok(t.undo&&!t.error&&t.inView&&t.opacity>0.99,name+': toast '+JSON.stringify(t));
 assert.equal(await present(p,id),false,name+': card still on the canvas');
 // Same saved state as the old path: everything but this card unchanged, and a save was signalled.
 const after=await state(p);
 assert.deepEqual(strip(after),strip(without(before,id)),name+': saved state differs from the old Remove path');
 assert.ok(await p.evaluate(()=>window.__uxChanged)>0,name+': no save signal');
 // Still offered after 4.5 s.
 // Reaching for Undo (pointer over the toast) holds it; its 6 s lifetime is checked separately below.
 if(Date.now()-clickedAt>5500)console.log(name+': checks took '+(Date.now()-clickedAt)+' ms');
 await click(p,'.tc-feedback-undo');
 // While it loads, every save already holds the card (and it counts toward the 40-figure limit).
 {const held=await p.evaluate(id=>TeamCanvas.serialize().nodes.some(n=>n.id===id),id);assert.ok(held,name+': card missing from the saved state while Undo loads');}
 // Switching tabs while an independent copy is still being created must not move it to that tab.
 if(switchTab)await p.evaluate(t=>TeamCanvasTabs.activate(t),switchTab);
 await p.waitForFunction(id=>[...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node')].some(n=>n.dataset.canvasOrderId===id),id,{timeout:180000});
 await p.waitForFunction(()=>/^Restored /.test(document.querySelector('.tc-feedback-toast .tc-feedback-text')?.textContent||''),null,{timeout:5000}).catch(()=>{});const t2=await toast(p);assert.ok(t2&&/^Restored /.test(t2.text),name+': no restored toast '+JSON.stringify(t2));await shot(p,name+'-2-undone');
 await settled(p);
 if(switchTab){await p.evaluate(t=>TeamCanvasTabs.activate(t),before.tabs.active);await p.waitForTimeout(800);}
 const back=await state(p);
 // A finished figure comes back out of date (Edit, then Finish plot, before export): the only difference.
 const expected=JSON.parse(JSON.stringify(before));expected.nodes.forEach(n=>{if(n.id===id&&n.finished&&n.kind!=='illustration')n.finished.stale=true;});
 assert.deepEqual(node(back,id),node(expected,id),name+': restored node differs');
 assert.deepEqual(strip(back),strip(expected),name+': canvas after Undo differs from before');
 assert.deepEqual(await order(p),orderBefore,name+': creation order changed');
}
(async()=>{
 const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:900}});p.setDefaultTimeout(60000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await open(p);
 const ids=await p.evaluate(()=>[...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node[data-plot-id]')].map(n=>n.dataset.plotId));
 const copy=ids.find(i=>/^tcinstance_.*-plot_pca$/.test(i)),library=ids.find(i=>/^results_dashboard-/.test(i));
 assert.ok(copy&&library,'checkpoint needs an independent PCA copy and a library plot: '+ids.join(' '));
 // Two tabs, and the copy deselected and moved in the figure-page order: Undo must bring all of it back.
 const second=await p.evaluate(()=>{const first=TeamCanvasTabs.state().active;TeamCanvasTabs.add();const s=TeamCanvasTabs.state();const added=s.tabs.find(t=>t.id!==first).id;TeamCanvasTabs.activate(first);return added;});
 await p.evaluate(id=>{TeamCanvasTabs.setIncluded(id,false);TeamCanvasTabs.moveInOrder(id,1);},copy);await p.waitForTimeout(800);
 const tabbed=await state(p);assert.ok(tabbed.tabs&&tabbed.tabs.figure.deselected.includes(copy)&&tabbed.tabs.figure.order.length,'tab setup '+JSON.stringify(tabbed.tabs));
 await removeAndUndo(p,copy,'remove','copy',second);console.log('ok remove + undo (independent copy)');
 await removeAndUndo(p,library,'return','library');console.log('ok return + undo (library plot)');
 // Illustration.
 const illus=await p.evaluate(()=>{const before=new Set(TeamCanvas.creationOrder());const list=TeamCanvas.listIllustrations();if(!list.length)return null;TeamCanvas.addIllustration(list[0].id);return TeamCanvas.creationOrder().find(k=>!before.has(k));});
 if(illus){await p.waitForTimeout(800);await removeAndUndo(p,illus,'remove','illustration');console.log('ok remove + undo (illustration)');}
 // Zoomed out, then ⋯ on a card: the menu opens in its final place and stays there.
 const inView=()=>p.evaluate(()=>{const v=document.querySelector('#team-canvas-root .tc-scroll').getBoundingClientRect();const n=[...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node[data-plot-id]:not(.tc-tab-hidden)')].find(n=>{const r=n.getBoundingClientRect();return r.top>v.top+40&&r.bottom<v.bottom-80&&r.left>v.left&&r.right<v.right-200;});return n&&n.dataset.plotId;});
 for(const round of [1,2]){
  let zid=null;for(let i=0;i<(round===1?10:2)||!zid;i++){await p.locator('#team-canvas-root .tc-zoom-out').click();await p.waitForTimeout(400);zid=await inView();if(round===1&&zid&&i>=1)break;if(i>12)break;}
  await p.waitForTimeout(700);zid=await inView();const steps=round+'-'+(await p.evaluate(()=>document.querySelector('#team-canvas-root .tc-zoom-reset')?.textContent.trim()));
  assert.ok(zid,'no card fully in view after zooming out');
  await p.evaluate(id=>{document.querySelectorAll('[data-ux-target]').forEach(n=>delete n.dataset.uxTarget);document.querySelector('.tc-node[data-plot-id="'+id+'"]').dataset.uxTarget='1';},zid);
  await click(p,'[data-ux-target="1"] > .tc-node-head > strong');await p.waitForTimeout(400);
  await click(p,'[data-ux-target="1"] .tc-card-more');
  const at=()=>p.evaluate(()=>{const b=[...document.querySelectorAll('[data-ux-target="1"] .tc-card-menu button')].find(b=>/^(Remove|Return)$/.test(b.textContent.trim()));const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {xy:[Math.round(r.x),Math.round(r.y)],hit:!!(e&&(e===b||b.contains(e)))};});
  const first=await at();await p.waitForTimeout(900);const later=await at();
  await shot(p,'zoomed-menu-'+steps);
  assert.deepEqual(later.xy,first.xy,'zoomed ⋯ menu moved '+JSON.stringify([first,later]));assert.ok(later.hit,'zoomed Remove not reachable');
  await p.keyboard.press('Escape');await p.mouse.click(5,450);
 }
 console.log('ok zoomed-out ⋯ menu stays put');
 // The toast lasts about 6 s: still there at 4.5 s, gone by 7.5 s (pointer away).
 await p.mouse.move(5,450);
 await p.evaluate(()=>{window.__uxT0=performance.now();TeamCanvasFeedback.show('Lifetime probe',{undo:function(){}});});
 await p.waitForFunction(()=>performance.now()-window.__uxT0>4500,null,{polling:50});assert.ok(await p.evaluate(()=>!!document.querySelector('.tc-feedback-toast.is-shown')),'toast gone before 4.5 s');
 await p.waitForFunction(()=>performance.now()-window.__uxT0>7500,null,{polling:50});assert.equal(await p.evaluate(()=>document.querySelector('.tc-feedback-toast')),null,'toast still there after 7.5 s');
 console.log('ok toast lifetime about 6 s');
 // F-02: a finished library plot that is returned and added again is live: no old frozen image, not
 // "Finished", saved without it, and the figure page/export treats it as a live plot.
 const fin=ids.filter(i=>/^results_dashboard-/.test(i))[2];
 if(fin&&await p.evaluate(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"]')?.classList.contains('tc-finished'),fin)){
  await p.evaluate(id=>[...document.querySelector('.tc-node[data-plot-id="'+id+'"]').querySelectorAll('button')].find(b=>/^Return$/.test(b.textContent.trim())).click(),fin);
  assert.equal(await present(p,fin),false,'F-02: not returned');
  // Added again as the same library record (the path without an independent-copy socket).
  const added=await p.evaluate(id=>{const app=Shiny.shinyapp,socket=app.$socket;app.$socket=null;try{return TeamCanvas.addPlot(id);}finally{app.$socket=socket;}},fin);
  assert.ok(added,'F-02: no library entry to add the plot again');
  await p.waitForFunction(id=>!!document.querySelector('.tc-node[data-plot-id="'+id+'"]'),fin,{timeout:60000});await p.waitForTimeout(1500);
  const live=await p.evaluate(id=>{const n=document.querySelector('.tc-node[data-plot-id="'+id+'"]');const s=TeamCanvas.serialize().nodes.find(x=>x.id===id);const pv=TeamCanvas.previewState();return {finishedClass:n.classList.contains('tc-finished'),snapshot:!!n.querySelector('.tc-snapshot'),status:TeamCanvas.cardStatus(id),saved:s&&s.finished,usable:pv.usableIds.includes(id),unusable:(pv.unusable.find(u=>u.id===id)||{}).reason};},fin);
  await shot(p,'f02-readded-live');
  assert.ok(!live.finishedClass&&!live.snapshot&&!/^finished/.test(live.status)&&live.saved===null&&!live.usable&&live.unusable==='live','F-02: '+JSON.stringify(live));
  console.log('ok F-02: re-added plot is live');
 }else console.log('F-02 skipped: no finished library plot in this checkpoint');
 // Failure: the library plot's original view is gone. It stays, visibly, with a visible error.
 const lib2=ids.filter(i=>/^results_dashboard-/.test(i))[1]||library;
 const before=await state(p);
 const dropped=await p.evaluate(()=>{const homes=[...document.querySelectorAll('.tc-home')].filter(h=>!h.closest('.tc-instance-host')&&!h.closest('#team-canvas-root'));window.__uxHomes=homes.map(h=>({h:h,parent:h.parentNode,next:h.nextSibling}));return homes.map(h=>{const t=h.textContent;h.remove();return t;});});
 assert.ok(dropped.length,'no library home placeholder to drop');
 const f=await pressRemove(p,lib2);
 await p.waitForTimeout(400);await shot(p,'failure-return');
 const ft=await toast(p);assert.ok(ft&&ft.error&&ft.inView&&!ft.undo,'failure toast '+JSON.stringify(ft));
 assert.match(ft.text,/^Couldn’t return .+\. Its original view has changed\. It stays on the canvas\.$/);
 const card=await p.evaluate(id=>{const n=[...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node')].find(n=>n.dataset.canvasOrderId===id);return n&&{opacity:+getComputedStyle(n).opacity,inert:n.inert,leaving:n.classList.contains('tc-feedback-leaving')};},lib2);
 assert.ok(card&&!card.inert&&!card.leaving,'refused card not restored '+JSON.stringify(card));
 await p.waitForTimeout(300);assert.equal(await p.evaluate(id=>+getComputedStyle([...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node')].find(n=>n.dataset.canvasOrderId===id)).opacity,lib2),1);
 assert.deepEqual(strip(await state(p)),strip(before),'a refused Return changed the saved state');
 console.log('ok failure toast (original view gone)',f.frames.length);
 // Put the original views' placeholders back, so the library plots can be returned later (F-13).
 await p.evaluate(()=>window.__uxHomes.forEach(x=>x.parent.insertBefore(x.h,x.next&&x.next.parentNode===x.parent?x.next:null)));
 // An independent copy whose hidden host is gone used to stay, unremovable: now it is removed.
 const copy2=ids.find(i=>/^tcinstance_.*-plot_comp$/.test(i));
 if(copy2){
  const before2=await state(p);
  await p.evaluate(id=>{const iid=id.slice(0,id.indexOf('-'));document.getElementById(iid+'_host').remove();},copy2);
  await pressRemove(p,copy2);await p.waitForTimeout(400);await shot(p,'copy-without-host');
  const t=await toast(p);assert.ok(t&&!t.error&&/^Removed /.test(t.text),'copy without host '+JSON.stringify(t));
  assert.equal(await present(p,copy2),false);
  assert.deepEqual(strip(await state(p)),strip(without(before2,copy2)));
  console.log('ok independent copy without its host is removed');
 }
 // A teardown step that throws (here: closing the copy's Data & settings panel) no longer stops the
 // removal: the card goes, the saved state is the old path's, and the toast says part of it failed.
 const copy3=ids.find(i=>/^tcinstance_.*-plot_violin$/.test(i));
 if(copy3){
  const before3=await state(p);
  await p.evaluate(()=>{window.__uxClose=TeamCanvasFloatingPanel.close;TeamCanvasFloatingPanel.close=function(){throw new Error('injected teardown failure');};});
  const consoleErrors=[];const onConsole=m=>{if(m.type()==='error')consoleErrors.push(m.text());};p.on('console',onConsole);
  await pressRemove(p,copy3);await p.waitForTimeout(400);await shot(p,'teardown-error');
  await p.evaluate(()=>{TeamCanvasFloatingPanel.close=window.__uxClose;});p.off('console',onConsole);
  assert.equal(await present(p,copy3),false,'card kept after a teardown error');
  const t=await toast(p);assert.ok(t&&t.error&&t.undo&&/^Removed .+\. Part of its cleanup failed/.test(t.text),'teardown toast '+JSON.stringify(t));
  assert.deepEqual(strip(await state(p)),strip(without(before3,copy3)),'teardown error changed the saved state');
  assert.ok(consoleErrors.some(m=>/teardown step failed \(controls\)/.test(m)),'teardown error not logged');
  console.log('ok teardown error: card removed, error shown');
 }
 // Diagnostic: uncaught errors and rejections are sent to the server log, at most 20 per page.
 const sent0=await p.evaluate(()=>TeamClientErrors.sent());
 await p.evaluate(()=>{for(let i=0;i<25;i++)setTimeout(()=>{throw new Error('ux28 diagnostic probe '+i);});Promise.reject(new Error('ux28 diagnostic rejection'));});
 await p.waitForTimeout(800);
 const sent1=await p.evaluate(()=>TeamClientErrors.sent());assert.ok(sent1===20,'diagnostic sent '+sent0+' -> '+sent1);
 if(process.env.TEAM_SERVER_LOG){await p.waitForTimeout(1500);const logText=fs.readFileSync(process.env.TEAM_SERVER_LOG,'utf8');const lines=logText.split('\n').filter(l=>l.includes('[TEAM JS')&&l.includes('ux28 diagnostic probe'));assert.ok(lines.length>=1&&lines.length<=20,'server log lines '+lines.length);assert.ok(lines.every(l=>l.length<2000),'log line too long');console.log('server log:',lines[0].slice(0,300));}
 errors.length=0; // the probes above are intentional
 console.log('ok diagnostic (rate-limited at 20)');
 // Scripted clicks (canvas_tabs.js deleting a tab with its cards) stay synchronous, without a toast.
 await p.evaluate(()=>TeamCanvasFeedback.close());
 const sync=ids.find(i=>/^tcinstance_.*-plot_dist$/.test(i));
 if(sync){const gone=await p.evaluate(id=>{const n=[...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node')].find(n=>n.dataset.canvasOrderId===id);TeamCanvasFeedback.close();[...n.querySelectorAll('button')].find(b=>/^(Remove|Return)$/.test(b.textContent.trim())).click();return {gone:!n.isConnected,toast:!!TeamCanvasFeedback.current()};},sync);assert.deepEqual(gone,{gone:true,toast:false},'scripted Remove not synchronous');console.log('ok scripted Remove stays synchronous');}
 // F-13: removing the last card (an illustration on an emptied canvas) shows the empty state again.
 await p.evaluate(()=>{TeamCanvasFeedback.close();[...document.querySelectorAll('#team-canvas-root .tc-board > .tc-node')].forEach(n=>{const b=[...n.querySelectorAll('button')].find(b=>/^(Remove|Return)$/.test(b.textContent.trim()));if(b)b.click();});});
 await p.waitForTimeout(500);
 const left=await p.evaluate(()=>document.querySelectorAll('#team-canvas-root .tc-board > .tc-node').length);
 if(!left){
  const last=await p.evaluate(()=>{const before=new Set(TeamCanvas.creationOrder());TeamCanvas.addIllustration(TeamCanvas.listIllustrations()[0].id);return TeamCanvas.creationOrder().find(k=>!before.has(k));});
  await p.waitForTimeout(600);await pressRemove(p,last);await p.waitForTimeout(800);
  const empty=await p.evaluate(()=>{const b=document.querySelector('#team-canvas-root .tc-board'),e=b.querySelector('.tc-empty');return {hasNodes:b.classList.contains('has-nodes'),emptyShown:!!e&&getComputedStyle(e).display!=='none'};});
  await shot(p,'f13-empty');
  assert.ok(!empty.hasNodes&&empty.emptyShown,'F-13: '+JSON.stringify(empty));console.log('ok F-13: empty state after the last card');
 }else console.log('F-13 skipped: '+left+' cards could not be removed (original views gone)');
 assert.deepEqual(errors,[],'page errors');
 await b.close();console.log('PASS');
})().catch(e=>{console.error('FAIL',e.stack||e);process.exit(1);});
