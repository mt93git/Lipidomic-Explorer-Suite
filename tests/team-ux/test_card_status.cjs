// Each canvas card carries a status chip, and Export figure warns while any card is not
// up to date. Synthetic fixture only.
const assert=require('node:assert/strict');
const {chromium}=require('../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD;
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
async function ready(p){
 await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
 await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
 await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
 if(process.env.TEAM_CHECKPOINT)await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));},process.env.TEAM_CHECKPOINT);
 await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.locator('#team_library_resume').click();
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled;},null,{timeout:300000});
 await p.evaluate(()=>document.querySelector('[data-tw-stage="canvas"]').click());
 await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false&&window.TeamShell?.mounted(),null,{timeout:300000});
}
async function add(p,source){
 const before=await p.locator('.tc-node[data-plot-id]').evaluateAll(ns=>ns.map(n=>n.dataset.plotId));
 await p.evaluate(s=>TeamCanvas.addCatalogPlot(s),source);
 await p.waitForFunction(ids=>[...document.querySelectorAll('.tc-node[data-plot-id]')].some(n=>!ids.includes(n.dataset.plotId)),before,{timeout:180000});
 const id=await p.locator('.tc-node[data-plot-id]').evaluateAll((ns,ids)=>ns.find(n=>!ids.includes(n.dataset.plotId)).dataset.plotId,before);
 await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"]')?.classList.contains('tc-figure-card'),id,{timeout:120000});return id;
}
(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await ready(p);
  const v=await add(p,'results_dashboard-plot_violin');
  await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"] .tc-card-status')?.dataset.state==='current',v,{timeout:120000});console.log('PASS a drawn card says Up to date');
  const warn=()=>p.evaluate(()=>{const w=document.querySelector('.ts-export-warning');return w&&!w.hidden?w.textContent:'';});
  assert.equal(await warn(),'','export warns while every card is current');console.log('PASS no export warning when all cards are current');
  // Simulate a card falling behind; the chip, its action and the export warning follow.
  await p.evaluate(id=>{const real=TeamCanvas.cardStatus;TeamCanvas.cardStatus=x=>x===id?'pending':real(x);},v);
  await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"] .tc-card-status')?.dataset.state==='pending',v,{timeout:10000});
  assert.equal(await p.locator('.tc-node[data-plot-id="'+v+'"] .tc-card-status button').textContent(),'Review');console.log('PASS a pending card offers Review');
  assert.match(await warn(),/1 figure is not up to date/);console.log('PASS Export figure warns about the stale card');
  assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
