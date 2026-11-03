// Regression: adding a Quality check plot as an independent canvas copy ended the
// whole Shiny session (QC's PCA reads `input$classLabelFormat` before the copy's
// controls are bound; an observer error is fatal). Copies must draw, the session
// must stay connected, and plots that used to never get a card now get one.
// Synthetic fixture only.
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
const connected=p=>p.evaluate(()=>!!window.Shiny?.shinyapp?.isConnected());
const drawn=(p,id)=>p.waitForFunction(id=>{const n=document.querySelector('.tc-node[data-plot-id="'+id+'"]');if(!n)return false;
  const img=[...n.querySelectorAll('.tc-content img')].some(i=>i.naturalWidth>1);const plotly=[...n.querySelectorAll('.js-plotly-plot')].some(g=>(g.data||[]).length);
  return img||plotly;},id,{timeout:120000});
(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await ready(p);
  for(const source of ['qc_pca_tab-pca2dPlot','qc_pca_tab-boxplotAfterNorm','qc_pca_tab-guided_qc_plot']){
   const id=await add(p,source);await drawn(p,id);
   assert.equal(await connected(p),true,'session connected after adding '+source);
   console.log('PASS '+source+' copy draws and the session stays connected');
  }
  await p.waitForTimeout(3000);assert.equal(await connected(p),true);console.log('PASS session still connected after the QC copies settle');
  // Plots inside a server-rendered panel or a hidden tab used to time out without a card.
  for(const source of ['barchart-donutPlotUnfiltered','heatmap_barchart_tab-heatmapSDPlot']){const id=await add(p,source);await drawn(p,id);console.log('PASS '+source+' gets a drawn card');}
  // A plot that cannot draw for this dataset says what it needs instead of "Updating…".
  const t=await add(p,'longitudinal_tab-index_plot');
  await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"] .tc-card-status')?.dataset.state==='waiting',t,{timeout:60000});
  assert.match(await p.locator('.tc-node[data-plot-id="'+t+'"] .tc-card-status').textContent(),/Needs time points/);console.log('PASS a time course without time points says it needs time points');
  assert.equal(await connected(p),true);
  assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
