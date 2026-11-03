// Canvas tabs end to end on the synthetic fixture: create 3 tabs, rename (double-click
// and menu), move and copy cards between tabs (with undo), reopen the checkpoint and
// get the same tabs back, then build the figure page from plots of 2 tabs.
// Optional TEAM_UX_SHOTS=<dir> saves a screenshot per step.
const assert=require('node:assert/strict');const fs=require('node:fs');
const {chromium}=require('../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD,shots=process.env.TEAM_UX_SHOTS;
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
if(shots)fs.mkdirSync(shots,{recursive:true});
let n=0;const shot=async(p,name)=>{if(shots)await p.screenshot({path:shots+'/'+String(++n).padStart(2,'0')+'-'+name+'.png'});};
async function open(p,checkpoint){
 await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
 await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
 await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
 await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');if(name){const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;}else s.selectedIndex=0;s.dispatchEvent(new Event('change',{bubbles:true}));},checkpoint||null);
 await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.locator('#team_library_resume').click();
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled;},null,{timeout:300000});
 await p.evaluate(()=>document.querySelector('[data-tw-stage="canvas"]').click());
 await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false&&window.TeamShell?.mounted()&&document.querySelector('.tc-tabbar'),null,{timeout:300000});
}
async function add(p,source){
 const before=await p.locator('.tc-node[data-plot-id]').evaluateAll(ns=>ns.map(n=>n.dataset.plotId));
 await p.evaluate(s=>TeamCanvas.addCatalogPlot(s),source);
 await p.waitForFunction(ids=>[...document.querySelectorAll('.tc-node[data-plot-id]')].some(n=>!ids.includes(n.dataset.plotId)),before,{timeout:180000});
 const id=await p.locator('.tc-node[data-plot-id]').evaluateAll((ns,ids)=>ns.find(n=>!ids.includes(n.dataset.plotId)).dataset.plotId,before);
 await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"]')?.classList.contains('tc-figure-card'),id,{timeout:120000});return id;
}
const tabs=p=>p.evaluate(()=>TeamCanvasTabs.state().tabs.map(t=>({name:t.name,nodes:t.nodes})));
const visible=p=>p.evaluate(()=>[...document.querySelectorAll('.tc-node:not(.tc-tab-hidden)')].map(n=>n.dataset.plotId));
const tabButton=(p,name)=>p.locator('.tc-canvas-tab',{has:p.locator('.tc-canvas-tab-name',{hasText:new RegExp('^'+name+'$')})});
async function finishVisible(p){for(const id of await visible(p)){const done=await p.evaluate(id=>{const n=document.querySelector('.tc-node[data-plot-id="'+id+'"]');if(n.classList.contains('tc-finished'))return true;const b=[...n.querySelectorAll('.tc-node-head button')].find(b=>/^Finish plot$/.test(b.textContent.trim()));if(b){b.click();return false;}return true;},id);if(!done)await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"]')?.classList.contains('tc-finished'),id,{timeout:60000});}}
(async()=>{const b=await chromium.launch({headless:true});const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await open(p,process.env.TEAM_CHECKPOINT);
  assert.deepEqual((await tabs(p)).map(t=>t.name),['Canvas 1'],'an old checkpoint opens as one tab');
  assert.equal(await p.locator('[role=tablist][aria-label="Canvas tabs"] [role=tab]').count(),1);
  const violin=await add(p,'results_dashboard-plot_violin');const pca=await add(p,'results_dashboard-plot_pca');
  await shot(p,'canvas-1-two-plots');
  // Tab 2 via +, its new plot lands there; tab 3 via +.
  await p.locator('.tc-canvas-tab-add').click();assert.equal(await p.locator('.tc-canvas-tab[aria-selected=true] .tc-canvas-tab-name').textContent(),'Canvas 2');
  assert.deepEqual(await visible(p),[],'a new tab starts empty');
  const dist=await add(p,'results_dashboard-plot_dist');assert.deepEqual(await visible(p),[dist],'new cards go to the active tab');
  await p.locator('.tc-canvas-tab-add').click();
  await shot(p,'three-tabs');
  // Rename by double-click and by the menu.
  await tabButton(p,'Canvas 2').dblclick();await p.locator('.tc-canvas-tab-input').fill('  Results B  ');await p.keyboard.press('Enter');
  await tabButton(p,'Canvas 3').click();await p.locator('.tc-canvas-tab-more').click();await p.getByRole('menuitem',{name:'Rename…'}).click();
  await p.locator('.tc-canvas-tab-input').fill('Scratch');await p.keyboard.press('Enter');
  assert.deepEqual((await tabs(p)).map(t=>t.name),['Canvas 1','Results B','Scratch']);
  await shot(p,'renamed');
  // Keyboard: arrows move between tabs (ARIA tabs pattern).
  await tabButton(p,'Scratch').focus();await p.keyboard.press('ArrowLeft');assert.equal(await p.locator('.tc-canvas-tab[aria-selected=true] .tc-canvas-tab-name').textContent(),'Results B');
  // Move violin to Scratch from its card menu, undo it, redo it.
  await tabButton(p,'Canvas 1').click();assert.deepEqual((await visible(p)).sort(),[violin,pca].sort());
  await p.locator('.tc-node[data-plot-id="'+violin+'"] .tc-tab-card-action[data-tab-action=move]').evaluate(b=>b.click());
  await p.locator('.tc-tab-picker').getByRole('menuitem',{name:'Scratch'}).click();
  assert.deepEqual(await visible(p),[pca]);assert.deepEqual((await tabs(p))[2].nodes,[violin]);
  await shot(p,'moved-violin-to-scratch');
  await p.locator('.ts-tools .ts-tool[aria-label=Undo]').click();assert.deepEqual((await tabs(p))[0].nodes.sort(),[violin,pca].sort(),'undo returns the card');
  await p.locator('.ts-tools .ts-tool[aria-label=Redo]').click();assert.deepEqual((await tabs(p))[2].nodes,[violin],'redo moves it again');
  // Copy pca to Results B (a new independent plot instance).
  const before=await p.evaluate(()=>[...document.querySelectorAll('.tc-node[data-plot-id]')].map(n=>n.dataset.plotId));
  await p.locator('.tc-node[data-plot-id="'+pca+'"] .tc-tab-card-action[data-tab-action=copy]').evaluate(b=>b.click());
  await p.locator('.tc-tab-picker').getByRole('menuitem',{name:'Results B'}).click();
  await p.waitForFunction(ids=>[...document.querySelectorAll('.tc-node[data-plot-id]')].some(n=>!ids.includes(n.dataset.plotId)),before,{timeout:180000});
  const copy=await p.evaluate(ids=>[...document.querySelectorAll('.tc-node[data-plot-id]')].map(n=>n.dataset.plotId).find(id=>!ids.includes(id)),before);
  await p.waitForFunction(id=>TeamCanvasTabs.state().tabs[1].nodes.includes(id),copy,{timeout:10000});
  assert.deepEqual(await visible(p),[pca],'the copy goes to the other tab, not this one');
  await finishVisible(p);
  await tabButton(p,'Results B').click();await p.waitForTimeout(1500);assert.deepEqual((await visible(p)).sort(),[dist,copy].sort());
  await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"]')?.classList.contains('tc-figure-card'),copy,{timeout:120000});
  await finishVisible(p);await shot(p,'results-b-finished');
  const want=await tabs(p);
  // Reopen the latest checkpoint: same tabs, names, order and cards.
  for(let i=0;i<60;i++){const st=await p.evaluate(()=>TeamAutosave.state());if(!st.dirty&&!st.inflight&&!st.saving)break;await p.waitForTimeout(3000);}
  await open(p,null);await p.waitForFunction(n=>document.querySelectorAll('.tc-node').length>=n,4,{timeout:180000});await p.waitForTimeout(4000);
  assert.deepEqual(await tabs(p),want,'tabs come back from the checkpoint');
  await shot(p,'reopened');
  // Figure page from 2 tabs: leave Scratch (live violin) out; it does not block export.
  await p.locator('.ts-mode-switch .ts-tool',{hasText:'Figure page'}).click();await p.waitForSelector('.tc-figure-plots:not([hidden])');
  const scratch=p.locator('.tc-figure-plots-tab',{has:p.locator('legend',{hasText:'Scratch'})});
  assert.equal(await p.locator('.tc-compose-excluded').count(),1,'the live plot in Scratch is listed while chosen');
  await scratch.locator('.tc-figure-plots-all input').uncheck();
  await p.waitForFunction(()=>!document.querySelector('.tc-compose-excluded'),null,{timeout:20000});
  await p.waitForFunction(()=>document.querySelectorAll('.tc-paper .tc-free-item img').length===3,null,{timeout:20000});
  assert.equal(await p.locator('.tc-compose-excluded').count(),0,'an unchosen live plot does not hold up the figure');
  assert.ok(await p.locator('.tc-preview-print').isEnabled(),'export available');
  assert.match(await p.locator('.tc-figure-plots>summary').textContent(),/3 of 4/);
  // Order: move the copy first.
  const rows=()=>p.locator('.tc-figure-plots-row label').allTextContents();
  await p.getByRole('button',{name:/Move .* later in the figure/}).first().click();await p.waitForTimeout(500);
  assert.notDeepEqual(await rows(),[]);
  await shot(p,'figure-page-two-tabs');
  for(let i=0;i<60;i++){const st=await p.evaluate(()=>TeamAutosave.state());if(!st.dirty&&!st.inflight&&!st.saving)break;await p.waitForTimeout(3000);}
  const saved=await p.evaluate(()=>TeamCanvasTabs.state().figure);
  await open(p,null);await p.waitForTimeout(3000);
  assert.deepEqual(await p.evaluate(()=>TeamCanvasTabs.state().figure),saved,'figure selection and order are remembered');
  assert.deepEqual(errors,[]);
  console.log('PASS canvas tabs: 3 tabs, rename, move/copy with undo, reopen, figure page from 2 tabs with remembered selection');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message.split('\n')[0]);process.exit(1);});
