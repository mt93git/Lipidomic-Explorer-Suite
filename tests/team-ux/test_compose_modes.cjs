// Draft canvas | Figure page: Text and Shapes add on the first click from the draft
// (with a live, unfinished plot on the canvas), the switch goes both ways, export
// waits with an explanation while a plot is not finished, and the text and shape
// come back after reopening the checkpoint. Synthetic fixture only.
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
 if(checkpoint)await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));},checkpoint);
 else await p.evaluate(()=>{const s=document.querySelector('#team_library_checkpoint');s.selectedIndex=0;s.dispatchEvent(new Event('change',{bubbles:true}));});
 await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.locator('#team_library_resume').click();
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled;},null,{timeout:300000});
 await p.evaluate(()=>document.querySelector('[data-tw-stage="canvas"]').click());
 await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false&&window.TeamShell?.mounted()&&window.TeamCanvasCompose,null,{timeout:300000});
}
const doc=p=>p.evaluate(()=>(TeamCanvas.getDocument()||{items:[]}).items.map(i=>({id:i.id,type:i.type,text:i.text,shape:i.shape})));
const mode=p=>p.evaluate(()=>TeamCanvasCompose.mode());
(async()=>{const b=await chromium.launch({headless:true});const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await open(p,process.env.TEAM_CHECKPOINT);
  const before=await doc(p);
  // A live (unfinished) plot used to disable Text and Shapes on the figure page.
  await p.evaluate(()=>TeamCanvas.addCatalogPlot('results_dashboard-plot_violin'));
  await p.waitForFunction(()=>document.querySelector('.tc-node[data-plot-id]'),null,{timeout:180000});await p.waitForTimeout(3000);
  assert.equal(await mode(p),'draft');
  assert.ok(await p.locator('.ts-mode-hint').isVisible(),'draft hint visible');
  assert.ok(await p.locator('.ts-mode-switch .is-current',{hasText:'Draft'}).isVisible(),'draft marked current');
  await shot(p,'draft');
  await p.locator('.ts-tools .ts-tool',{hasText:/^Text$/}).click();
  await p.waitForFunction(n=>(TeamCanvas.getDocument()||{items:[]}).items.filter(i=>i.type==='text').length>n,before.filter(i=>i.type==='text').length,{timeout:15000});
  assert.equal(await mode(p),'figure','Text opens the figure page');
  assert.ok(await p.evaluate(()=>document.activeElement&&document.activeElement.dataset.itemKey==='text'),'new text is ready to type');
  await p.keyboard.type('Figure 1 · compose check');await p.keyboard.press('Tab');await p.waitForTimeout(600);
  await shot(p,'figure-text');
  // Export waits for the live plot and says why; text/shape stay available.
  const ex=p.locator('.tc-compose-excluded');assert.ok(await ex.isVisible(),'unfinished plot listed');assert.match(await ex.textContent(),/not on the figure page yet.*export waits/s);
  for(const s of ['.tc-preview-svg','.tc-preview-pdf','.tc-preview-print'])assert.ok(await p.locator(s).isDisabled(),s+' disabled while a plot is live');
  await p.locator('.tc-shape-menu summary').click();await p.getByRole('button',{name:'Add Rectangle',exact:true}).click();
  await p.waitForFunction(()=>(TeamCanvas.getDocument()||{items:[]}).items.some(i=>i.type==='shape'),null,{timeout:10000});
  await shot(p,'figure-shape');
  // Back to the draft and forth again with the switch.
  await p.locator('.tc-preview-back').click();assert.equal(await mode(p),'draft');assert.ok(await p.locator('.ts-tools').isVisible());
  await shot(p,'back-to-draft');
  await p.locator('.ts-mode-switch .ts-tool',{hasText:'Figure page'}).click();assert.equal(await mode(p),'figure');
  assert.ok(await p.locator('.tc-mode-switch .is-current',{hasText:'Figure page'}).isVisible());
  await p.locator('.tc-preview-back').click();assert.equal(await mode(p),'draft');
  // Shapes from the draft opens the figure page with an enabled chooser.
  await p.locator('.ts-tools .ts-tool',{hasText:/^Shapes$/}).click();assert.equal(await mode(p),'figure');
  assert.ok(await p.locator('.tc-add-shape').first().isEnabled(),'shape choices enabled');await shot(p,'shapes-from-draft');
  await p.keyboard.press('Escape');await p.locator('.tc-preview-back').click();
  const saved=(await doc(p)).filter(i=>i.type!=='figure');
  for(let i=0;i<60;i++){const st=await p.evaluate(()=>TeamAutosave.state());if(!st.dirty&&!st.inflight&&!st.saving)break;await p.waitForTimeout(3000);}
  await open(p,null);await p.waitForTimeout(3000);
  const back=(await doc(p)).filter(i=>i.type!=='figure');
  assert.deepEqual(back,saved,'text and shape persist after reopening the checkpoint');
  assert.ok(back.some(i=>i.type==='text'&&i.text==='Figure 1 · compose check'));assert.ok(back.some(i=>i.type==='shape'&&i.shape==='rectangle'));
  await p.evaluate(()=>TeamCanvasCompose.showFigure());await p.waitForTimeout(2500);await shot(p,'reopened-figure');
  assert.deepEqual(errors,[]);
  console.log('PASS compose modes: first-click text and shape, Draft ↔ Figure page, export explained, persisted after reopen');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
