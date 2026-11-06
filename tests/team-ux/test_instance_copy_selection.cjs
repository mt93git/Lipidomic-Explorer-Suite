// An independent plot copied while its source's server-side selector is mid-reload
// (cleared, options loading) must still get a selection and a working CSV download.
// Repeats TEAM_UX_ITERATIONS times (default 20). Synthetic fixture only.
const assert=require('node:assert/strict');
const {chromium}=require('../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD,N=+process.env.TEAM_UX_ITERATIONS||20;
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
async function ready(p){
 await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
 await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
 await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
 if(process.env.TEAM_CHECKPOINT)await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));},process.env.TEAM_CHECKPOINT);
 await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.locator('#team_library_resume').click();
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled;},null,{timeout:300000});
 await p.evaluate(()=>document.querySelector('[data-tw-stage="canvas"]').click());
 await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false,null,{timeout:300000});
}
(async()=>{const b=await chromium.launch({headless:true});const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await ready(p);
  const source='results_dashboard-violin_lipid';
  await p.waitForFunction(id=>!!document.getElementById(id)?.selectize?.getValue(),source,{timeout:120000});
  const original=await p.evaluate(id=>document.getElementById(id).selectize.getValue(),source);
  let passed=0;
  for(let i=0;i<N;i++){
   const before=await p.locator('.tc-node[data-plot-id]').evaluateAll(ns=>ns.map(n=>n.dataset.plotId));
   // The state a server-side updateSelectizeInput leaves while its options reload
   // (Shiny calls clear() and clearOptions() before the AJAX load answers).
   await p.evaluate(id=>{const z=document.getElementById(id).selectize;z.clear(true);z.clearOptions(true);TeamCanvas.addCatalogPlot('results_dashboard-plot_violin');},source);
   await p.waitForFunction(ids=>[...document.querySelectorAll('.tc-node[data-plot-id]')].some(n=>!ids.includes(n.dataset.plotId)),before,{timeout:180000});
   const id=await p.locator('.tc-node[data-plot-id]').evaluateAll((ns,ids)=>ns.find(n=>!ids.includes(n.dataset.plotId)).dataset.plotId,before);
   await p.evaluate(([id,v])=>{const s=document.getElementById(id).selectize;s.addOption({value:v,label:v});s.setValue(v);},[source,original]);
   const lipid=id.replace(/-plot_violin$/,'-violin_lipid'),dl=id.replace(/-plot_violin$/,'-dl_violin');
   // The instance's input check retries for several seconds; the copy must keep a selection after it settles.
   await p.waitForTimeout(8000);
   const value=await p.evaluate(k=>Shiny.shinyapp.$inputValues[k],lipid);
   assert.ok(value,`iteration ${i+1}: the copy was left with no lipid selected`);
   await p.waitForFunction(k=>/session\//.test(document.getElementById(k)?.getAttribute('href')||'')&&!document.documentElement.classList.contains('shiny-busy'),dl,{timeout:60000});
   // Fetch the card's own download URL in this session (the link may be parked while the card is idle).
   const href=await p.evaluate(k=>document.getElementById(k).getAttribute('href'),dl);
   const res=await p.request.get(new URL(href,url).href);
   assert.equal(res.status(),200,`iteration ${i+1}: the CSV download returned ${res.status()} (no selection reaches the server as an error page)`);
   assert.match(res.headers()['content-disposition']||'',/\.csv/,`iteration ${i+1}: the download is not the plot CSV`);
   await p.evaluate(id=>{const n=document.querySelector('.tc-node[data-plot-id="'+id+'"]');const r=n&&[...n.querySelectorAll('.tc-node-head button')].find(x=>x.textContent==='Remove');if(r)r.click();},id);
   await p.waitForTimeout(1000);passed++;
  }
  console.log(`PASS ${passed}/${N} copies made during a selector reload keep a selection and download their CSV`);
  assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
