// A canvas card shows its figure; the module's controls live in the inspector's Data tab
// while the card is selected and go back when it is released. Synthetic fixture only.
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
(async()=>{const b=await chromium.launch({headless:true});const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await ready(p);
  const v=await add(p,'results_dashboard-plot_violin');const h=await add(p,'results_dashboard-plot_heat');await p.waitForTimeout(2000);
  const sel=id=>'.tc-node[data-plot-id="'+id+'"]';
  // Idle card: only the figure shows; the controls stay rendered for Shiny, off-screen.
  for(const id of [v,h]){const idle=await p.evaluate(s=>{const n=document.querySelector(s),box=n.getBoundingClientRect();const chrome=[...n.querySelectorAll('.tc-figure-chrome,.tc-figure-park')].filter(e=>e.getClientRects().length);
   return {chrome:chrome.length,onCard:chrome.filter(e=>{const r=e.getBoundingClientRect();return r.right>box.left&&r.left<box.right;}).length,lipid:!!n.querySelector('[id$="-violin_lipid"],[id$="-select_heat"]')};},sel(id));
   assert.ok(idle.chrome>0,id+': no module content marked as card chrome');assert.equal(idle.onCard,0,id+': module content still shows on the card');assert.ok(idle.lipid,id+': controls left the card while idle');console.log('PASS idle card shows only the figure',id.split('-').pop());}
  // Selected: the Data tab holds the same nodes, and they work.
  await p.evaluate(id=>window.TeamCanvasViewport?.focusNode(document.querySelector('.tc-node[data-plot-id="'+id+'"]'),{topLeft:true}),v);
  await p.locator(sel(v)+' .tc-node-head').first().click({position:{x:8,y:8}});await p.locator('#tc-inspector-tab-data').click();
  assert.ok(await p.locator('#tc-inspector-panel-data [id$="-violin_lipid"]').count(),'violin lipid selector not in the Data tab');console.log('PASS Data tab holds the module controls');
  // Wait until Shiny has bound the download link and is idle, as a person would.
  await p.waitForFunction(()=>{const a=[...document.querySelectorAll('#tc-inspector-panel-data a.shiny-download-link')].find(a=>/Plot data/.test(a.textContent));return a&&/session\//.test(a.getAttribute('href')||'')&&!document.documentElement.classList.contains('shiny-busy');},null,{timeout:120000});
  const [d]=await Promise.all([p.waitForEvent('download',{timeout:60000}),p.locator('#tc-selection-inspector').getByRole('link',{name:/Plot data \(CSV\)/}).first().click()]);
  assert.match(await d.suggestedFilename(),/\.csv$/);console.log('PASS plot CSV downloads from the Data tab');
  const y=()=>p.evaluate(s=>JSON.stringify(document.querySelector(s+' .js-plotly-plot').data[0].y),sel(v));const before=await y();
  await p.evaluate(()=>{const s=document.querySelector('#tc-inspector-panel-data select[id$="-violin_lipid"]'),z=s.selectize,cur=z?z.getValue():s.value,next=(z?Object.keys(z.options):[...s.options].map(o=>o.value)).find(o=>o!==cur);if(z)z.setValue(next);else{s.value=next;s.dispatchEvent(new Event('change',{bubbles:true}));}});
  await p.waitForFunction(([s,b])=>JSON.stringify(document.querySelector(s+' .js-plotly-plot').data[0].y)!==b,[sel(v),before],{timeout:60000});console.log('PASS a Data tab control updates the figure');
  await p.keyboard.press('Escape');await p.waitForTimeout(500);
  const back=await p.evaluate(s=>({inCard:!!document.querySelector(s+' [id$="-violin_lipid"]'),panel:document.querySelector('#tc-inspector-panel-data').children.length}),sel(v));
  assert.ok(back.inCard&&back.panel===0,'controls did not return to the card: '+JSON.stringify(back));console.log('PASS release returns the controls to the card');
  assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
