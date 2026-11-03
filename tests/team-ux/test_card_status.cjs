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
async function add(p,source,figure=true){
 const before=await p.locator('.tc-node[data-plot-id]').evaluateAll(ns=>ns.map(n=>n.dataset.plotId));
 await p.evaluate(s=>TeamCanvas.addCatalogPlot(s),source);
 await p.waitForFunction(ids=>[...document.querySelectorAll('.tc-node[data-plot-id]')].some(n=>!ids.includes(n.dataset.plotId)),before,{timeout:180000});
 const id=await p.locator('.tc-node[data-plot-id]').evaluateAll((ns,ids)=>ns.find(n=>!ids.includes(n.dataset.plotId)).dataset.plotId,before);
 if(figure)await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"]')?.classList.contains('tc-figure-card'),id,{timeout:120000});return id;
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
  // visNetwork draws into a <canvas>, not Plotly or an <img>: its card must still settle.
  const net=await add(p,'pathway_tab-pathwayVisNetwork');
  await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"] .vis-network canvas')?.width>0,net,{timeout:120000});
  await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"] .tc-card-status')?.dataset.state==='current',net,{timeout:60000});console.log('PASS a drawn visNetwork card says Up to date');
  // A group comparison waiting for its baseline confirmation asks for it; it is not "Updating…".
  const gc=await add(p,'group_comparison_tab-comparisonPlot',false); // owns its controls: never a figure-only card
  const confirm=p.locator('.tc-node[data-plot-id="'+gc+'"] .gc-status button',{hasText:'Confirm baseline'});
  await confirm.waitFor({timeout:120000});
  await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"] .tc-card-status')?.dataset.state==='waiting',gc,{timeout:20000});console.log('PASS an unconfirmed group comparison says Needs settings');
  await confirm.click();
  await p.waitForFunction(id=>{const n=document.querySelector('.tc-node[data-plot-id="'+id+'"]');return n&&[...n.querySelectorAll('.gc-plot')].some(g=>g.data&&g.data.length)&&n.querySelector('.tc-card-status')?.dataset.state==='current';},gc,{timeout:120000});console.log('PASS the confirmed comparison draws and says Up to date');
  // A heatmap has only a continuous colour scale: its Style tab explains instead of offering a palette that does nothing.
  const heat=await add(p,'results_dashboard-plot_heat');
  await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"] .tc-card-status')?.dataset.state==='current',heat,{timeout:120000});
  await p.evaluate(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"] .tc-node-head').click(),heat);
  await p.evaluate(()=>document.getElementById('tc-inspector-tab-appearance')?.click());
  const pal=await p.waitForFunction(()=>{const d=[...document.querySelectorAll('#tc-selection-inspector details')].find(d=>d.querySelector('summary')?.textContent==='Color palette');return d&&{text:d.textContent,apply:[...d.querySelectorAll('button')].some(b=>b.textContent==='Apply palette')};},null,{timeout:20000}).then(h=>h.jsonValue());
  assert.match(pal.text,/continuous colour scale/);assert.equal(pal.apply,false);console.log('PASS a heatmap Style tab explains that palettes do not apply');
  // Saved settings are replayed as {value} messages; bslib's accordion takes only {method}.
  const acc=await p.evaluate(async()=>{const el=document.getElementById('heatmap_barchart_tab-heatmap_advanced_aesthetics_accordion');const b=jQuery(el).data('shiny-input-binding');const v=el.querySelector('.accordion-item').dataset.value;
    const wait=()=>new Promise(r=>setTimeout(r,600));const open=()=>[...el.querySelectorAll('.accordion-collapse.show')].length;
    let err=null;try{await b.receiveMessage(el,{value:[v]});await wait();var o1=open();await b.receiveMessage(el,{value:null});await wait();var o0=open();await b.receiveMessage(el,{selected:[v]});await wait();var o2=open();await b.receiveMessage(el,{label:'x'});}catch(e){err=e.message;}return {err,o1,o0,o2};});
  assert.deepEqual(acc,{err:null,o1:1,o0:0,o2:1},'accordion value messages');console.log('PASS an accordion takes a saved {value} message');
  assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
