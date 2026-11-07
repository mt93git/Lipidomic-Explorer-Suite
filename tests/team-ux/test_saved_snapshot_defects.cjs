// Saved figures from older captures (ckpt16-style checkpoints): a composition captured at a
// collapsed size is shown as broken, never stretched, and the figure page and exports refuse it.
// Trimmed violins whose axis holds every shape and good snapshots are not flagged. Restoring a
// checkpoint is not an edit (no autosave). Also: figure-page counters and the strip tooltip.
// Synthetic fixture library only: TEAM_URL, TEAM_EMAIL, TEAM_PASSWORD, TEAM_CHECKPOINT (ckpt16.zip).
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT||'../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD;
if(!url||!email||!password||!process.env.TEAM_CHECKPOINT)throw Error('TEAM_URL, TEAM_EMAIL, TEAM_PASSWORD and TEAM_CHECKPOINT are required (synthetic library only).');
const pass=m=>console.log('PASS '+m);
async function ready(p){
 await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
 await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
 await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
 await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));},process.env.TEAM_CHECKPOINT);
 await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.waitForTimeout(1000);await p.locator('#team_library_resume').click();
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled&&window.TeamWorkspace?.state().preparationReady;},null,{timeout:600000});
 await p.evaluate(()=>window.TeamWorkspace.request?TeamWorkspace.request('canvas'):document.querySelector('[data-tw-stage="canvas"]').click());
 await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false&&document.querySelectorAll('.tc-node.tc-finished').length>=5&&!document.documentElement.classList.contains('shiny-busy'),null,{timeout:600000});
}
const card=(p,id)=>p.evaluate(id=>{const n=document.querySelector('.tc-node[data-plot-id="'+id+'"]'),pv=n&&n.querySelector('.tc-snapshot'),img=pv&&pv.querySelector('img');
 return n&&{badge:(n.querySelector('.tc-card-status')||{dataset:{}}).dataset.state,defect:n.classList.contains('tc-snapshot-defect'),stale:n.classList.contains('tc-stale'),imgShown:!!img&&getComputedStyle(img).display!=='none',caption:pv.querySelector('.tc-snapshot-status').textContent,
  captionShown:getComputedStyle(pv.querySelector('.tc-snapshot-status')).display!=='none',exports:[...pv.querySelectorAll('.tc-snapshot-exports button')].map(b=>b.disabled),src:img&&img.getAttribute('src')};},id);
(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await ready(p);
  // Restoring is not an edit: the autosave stays clean through the settle window.
  await p.waitForTimeout(20000);
  const auto=await p.evaluate(()=>({s:TeamAutosave.state(),text:document.getElementById('team-autosave-status').textContent}));
  assert.equal(auto.s.dirty,false,'dirty right after restore: '+auto.text);assert.ok(!/Unsaved|Saving/.test(auto.text),auto.text);pass('a restored checkpoint is not an unsaved change ('+auto.text+')');
  const comp=await card(p,'results_dashboard-plot_comp'),violin=await card(p,'results_dashboard-plot_violin'),pca=await card(p,'results_dashboard-plot_pca');
  assert.ok(comp.defect&&comp.stale,'collapsed composition flagged');assert.equal(comp.imgShown,false,'stretched image hidden');assert.ok(comp.captionShown,'caption visible');
  assert.match(comp.caption,/^Saved image looks broken\. Choose Edit, then Finish plot to regenerate it\. This saved image is much smaller than its card \(268×92 px\)/);assert.deepEqual(comp.exports,[true,true,true]);assert.equal(comp.badge,'finished-broken');
  pass('the collapsed 268×92 composition is shown as broken, image hidden, exports disabled');
  for(const [name,c] of [['trimmed violin',violin],['PCA',pca]]){assert.equal(c.defect,false,name+' flagged');assert.equal(c.imgShown,true,name);assert.deepEqual(c.exports,[false,false,false],name);}
  pass('the trimmed (pre-soft-span) violin and the PCA snapshot are not flagged');
  const st=await p.evaluate(()=>{const s=TeamCanvas.previewState();const n=s.state.nodes.find(n=>n.id==='results_dashboard-plot_comp');return {usable:s.usableIds,comp:s.unusable.find(u=>u.id==='results_dashboard-plot_comp'),saved:n&&n.finished};});
  assert.ok(!st.usable.includes('results_dashboard-plot_comp'));assert.equal(st.comp.reason,'stale');
  assert.ok(st.usable.includes('results_dashboard-plot_violin')&&st.usable.includes('results_dashboard-plot_pca'));pass('the figure page leaves out the broken figure and keeps the good ones');
  assert.deepEqual(Object.keys(st.saved).sort(),['createdAt','provenance','stale','url']);assert.equal(st.saved.stale,false);assert.equal(st.saved.url,comp.src);pass('the saved state of the broken figure is unchanged (nothing written back)');
  // Detector cases on the real images: a violin whose shapes leave the plot clip, with and without the capture stamp.
  const cases=await p.evaluate(({v,c,q})=>{
   const markup=decodeURIComponent(v.slice(v.indexOf(',')+1)),cut=markup.replace(/(<clipPath[^>]*class="plotclip"[^>]*><rect width="[0-9.]+" height=")([0-9.]+)/,(m,a,h)=>a+(Number(h)*0.5));
   if(cut===markup)throw Error('fixture: no plot clip found');
   const clipped='data:image/svg+xml,'+encodeURIComponent(cut),f=TeamCanvas.snapshotDefectOf;
   return {violin:f(v,620,720),pca:f(q,620,720),comp:f(c,1494,720),compSmallCard:f(c,300,150),clipped:f(clipped,620,720),clippedStamped:f(clipped,620,720,{captureVersion:2}),png:f('data:image/png;base64,iVBORw0KGgo=',1494,720)};
  },{v:violin.src,c:comp.src,q:pca.src});
  assert.deepEqual(cases,{violin:null,pca:null,comp:'collapsed',compSmallCard:null,clipped:'clipped',clippedStamped:null,png:null});pass('detector: clipped violin flagged, stamped capture and good images not');
  // Figure page counters and the strip tooltip.
  await p.evaluate(()=>{const b=document.querySelector('#tc-preview-tab');if(b)b.click();else [...document.querySelectorAll('.ts-mode-option')].find(x=>/figure page/i.test(x.innerText))?.click();});
  await p.waitForFunction(()=>{const x=document.querySelector('#tc-preview-panel');return x&&!x.hidden&&document.querySelector('.tc-figure-plots summary');},null,{timeout:30000});await p.waitForTimeout(1500);
  const fig=await p.evaluate(()=>{const s=document.querySelector('.tc-figure-plots summary').textContent,st=document.querySelector('#tc-preview-panel .tc-preview-status');return {summary:s,title:st&&st.title,text:st&&st.textContent.replace(/\s+/g,' ').trim(),placed:TeamCanvas.previewState().usableIds.length};});
  assert.match(fig.summary,/^Plots in this figure · \d+ of \d+ checked · \d+ placed$/);assert.equal(Number(/(\d+) placed/.exec(fig.summary)[1]),fig.placed);pass('Plots in this figure says checked and placed ('+fig.summary+')');
  assert.equal(fig.title.replace(/\s+/g,' '),fig.text);pass('the figure strip status carries its full text as a tooltip');
  await p.evaluate(()=>{const x=document.querySelector('#tc-workspace-tab')||document.querySelector('.tc-preview-back');x&&x.click();});await p.waitForTimeout(1500);
  // Edit returns the card to its live plot; Finish then captures a new, stamped image.
  await p.evaluate(()=>{const n=document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_comp"]');[...n.querySelectorAll('button')].find(b=>/^Edit$/.test(b.textContent.trim())).click();});
  await p.waitForFunction(()=>{const n=document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_comp"]');return n&&!n.classList.contains('tc-finished')&&!n.classList.contains('tc-snapshot-defect')&&!n.classList.contains('tc-stale');},null,{timeout:30000});
  pass('Edit clears the broken state');
  assert.deepEqual(errors,[]);pass('no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e&&e.stack||e);process.exit(1);});
