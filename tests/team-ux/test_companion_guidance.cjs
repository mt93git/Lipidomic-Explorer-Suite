// Companion guidance: a tip at each step, chart-specific Explain / Suggest for a PCA and a
// heatmap card, suggestion buttons that drive UI (not scientific settings), the
// server-side confirm preview for a parameter request, and offline chat answers.
// Synthetic fixture only; the AI provider stays off (LIPIDOMIC_COMPANION_AI=0).
const assert=require('node:assert/strict');
const {chromium}=require('../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD;
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
const shots=process.env.TEAM_UX_SHOTS;
async function shot(p,name){if(shots)await p.screenshot({path:require('path').join(shots,name+'.png')});}
async function tip(p,context){
 await p.waitForFunction(c=>{const t=document.querySelector('.cg-tip');return t&&!t.hidden&&t.dataset.context===c&&t.getClientRects().length;},context,{timeout:60000});
 return p.evaluate(()=>{const t=document.querySelector('.cg-tip');return {text:t.innerText,collapsed:t.classList.contains('is-collapsed'),id:t.dataset.tipId};});
}
async function add(p,source){
 const before=await p.locator('.tc-node[data-plot-id]').evaluateAll(ns=>ns.map(n=>n.dataset.plotId));
 await p.evaluate(s=>TeamCanvas.addCatalogPlot(s),source);
 await p.waitForFunction(ids=>[...document.querySelectorAll('.tc-node[data-plot-id]')].some(n=>!ids.includes(n.dataset.plotId)),before,{timeout:180000});
 const id=await p.locator('.tc-node[data-plot-id]').evaluateAll((ns,ids)=>ns.find(n=>!ids.includes(n.dataset.plotId)).dataset.plotId,before);
 await p.waitForFunction(id=>document.querySelector('.tc-node[data-plot-id="'+id+'"]')?.classList.contains('tc-figure-card'),id,{timeout:120000});return id;
}
async function select(p,id){
 await p.evaluate(()=>{const x=document.querySelector('#lipidomic-assistant-panel:not([hidden]) .assistant-close');if(x)x.click();document.querySelectorAll('.tc-instance-host.is-open .tc-instance-panel-head button').forEach(b=>b.click());});
 await p.evaluate(id=>window.TeamCanvasViewport?.focusNode(document.querySelector('.tc-node[data-plot-id="'+id+'"]'),{topLeft:true}),id);
 await p.locator('.tc-node[data-plot-id="'+id+'"] .tc-node-head').first().click({position:{x:8,y:8}});
 await p.waitForFunction(id=>TeamCanvas.selected()?.id===id,id,{timeout:20000});
}
async function lastAnswer(p,kind){return p.evaluate(k=>{const m=[...document.querySelectorAll('.cg-answer'+(k?'[data-cg-kind="'+k+'"]':''))].pop();return m?{text:m.innerText,actions:[...m.querySelectorAll('button[data-action]')].map(b=>b.dataset.action),checks:[...m.querySelectorAll('[data-check]')].map(li=>li.dataset.check)}:null;},kind);}
async function chartButton(p,label){
 await p.evaluate(()=>{const t=document.querySelector('.cg-tip.is-collapsed .cg-pill');if(t)t.click();});
 const n=await p.locator('.cg-answer').count();
 await p.locator('.cg-tip .cg-button',{hasText:label}).click();
 await p.waitForFunction(n=>document.querySelectorAll('.cg-answer').length>n,n,{timeout:10000});
}
async function ask(p,q){
 await p.evaluate(()=>{const panel=document.getElementById('lipidomic-assistant-panel');if(panel.hidden)window.LipidomicAssistant.open(document.querySelector('.assistant-dock-chat'));});
 const n=await p.locator('.assistant-message-assistant').count();
 await p.locator('.assistant-chat-input').fill(q);await p.locator('.assistant-send').click();
 await p.waitForFunction(n=>document.querySelectorAll('.assistant-message-assistant').length>n,n,{timeout:30000});
 return p.evaluate(()=>[...document.querySelectorAll('.assistant-message-assistant')].pop().innerText);
}
(async()=>{const b=await chromium.launch({headless:true});const ctx=await b.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
  // Record what crosses to the server: local answers must not send a request.
  await p.evaluate(()=>{window.__sent=[];const orig=Shiny.setInputValue.bind(Shiny);Shiny.setInputValue=function(n,v,o){window.__sent.push(n);return orig(n,v,o);};});
  await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
  await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
  let t=await tip(p,'data-choice');assert.ok(!t.collapsed&&/checkpoint/i.test(t.text),'Data tip: '+JSON.stringify(t));console.log('PASS Data tip:',t.text.split('\n')[0]);await shot(p,'data');
  // Dismissed tips are not repeated.
  await p.locator('.cg-tip .cg-icon[aria-label="Dismiss tip"]').click();
  assert.equal(await p.locator('.cg-tip').count(),0,'tip still shown after dismiss');
  assert.ok(await p.evaluate(()=>JSON.parse(localStorage.getItem('lipidomic-companion-tips-seen')).includes('data-choice-1')),'dismissed tip not recorded');console.log('PASS dismiss records the tip as seen');
  if(process.env.TEAM_CHECKPOINT)await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));},process.env.TEAM_CHECKPOINT);
  await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.locator('#team_library_resume').click();
  await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled;},null,{timeout:300000});
  t=await tip(p,'review');assert.match(t.text,/detection/i);console.log('PASS Review tip:',t.text.split('\n')[0]);await shot(p,'review');
  // Offline answer in Review, without a server request.
  await p.evaluate(()=>{window.__sent=[];});
  let a=await ask(p,'What does the detection threshold do?');
  assert.match(a,/positive measured values/i);assert.match(a,/Local guide · reviewed text/);
  assert.ok(!(await p.evaluate(()=>window.__sent.includes('assistant_request'))),'local answer sent a server request');console.log('PASS Chat answers offline without a server request');
  // A parameter request still goes through the server's token confirm preview, and cancelling keeps settings.
  await p.locator('.assistant-chat-input').fill('set normalization to pqn');await p.locator('.assistant-send').click();
  await p.waitForSelector('.assistant-preview',{timeout:30000});
  const prev=await p.evaluate(()=>document.querySelector('.assistant-preview').innerText);assert.match(prev,/Confirmation required/);await shot(p,'confirm-preview');
  await p.locator('.assistant-preview button',{hasText:'Keep current settings'}).click();
  await p.waitForFunction(()=>!document.querySelector('.assistant-preview'),null,{timeout:30000});console.log('PASS parameter request opens the confirm preview; cancel keeps settings');
  await p.evaluate(()=>document.querySelector('#lipidomic-assistant-panel .assistant-close').click());
  for(let i=0;i<30;i++){await p.evaluate(()=>document.querySelector('[data-tw-stage="canvas"]').click());await p.waitForTimeout(1500);if(await p.evaluate(()=>window.TeamWorkspace?.state?.().stage==='canvas'))break;}
  await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false&&window.TeamShell?.mounted(),null,{timeout:300000});
  await p.evaluate(()=>TeamCanvas.deselect());
  t=await tip(p,await p.evaluate(()=>document.querySelector('#team-canvas-root .tc-node')?'canvas':'canvas-empty'));console.log('PASS Canvas tip:',t.text.split('\n')[0]);await shot(p,'canvas');
  const pca=await add(p,'results_dashboard-plot_pca'),heat=await add(p,'results_dashboard-plot_heat');
  const settings=()=>p.evaluate(()=>{const v=s=>{const e=document.querySelector('[id$="'+s+'"]');if(!e)return null;const c=e.querySelector('input:checked');return c?c.value:e.value??null;};return {pcaT:v('-pca_transform'),pcaS:v('-pca_scale'),sig:v('-heat_significance'),norm:document.getElementById('qc_pca_tab-normalizationMethod')?.value};});
  const before=await settings();
  // PCA card
  await select(p,pca);t=await tip(p,'card');assert.match(t.text,/About this chart|principal components/i);
  await chartButton(p,'Explain this chart');let ans=await lastAnswer(p,'explain');
  assert.match(ans.text,/Principal components/);assert.match(ans.text,/does not test group differences/);assert.match(ans.text,/unit variance/);console.log('PASS PCA Explain is chart-specific');await shot(p,'pca-explain');
  await select(p,pca);await chartButton(p,'Suggest improvements');ans=await lastAnswer(p,'suggest');
  assert.ok(ans.actions.includes('data:-color_by'),'PCA suggestions: '+JSON.stringify(ans));console.log('PASS PCA Suggest is chart-specific',JSON.stringify(ans.checks));await shot(p,'pca-suggest');
  // One click: open the Colour by control in the Data tab.
  await p.locator('.cg-answer[data-cg-kind="suggest"]').last().locator('button[data-action="data:-color_by"]').click();
  await p.waitForFunction(()=>{const h=document.querySelector('.cg-highlight');return !!(h&&h.querySelector('[id$="-color_by"]')&&h.getClientRects().length);},null,{timeout:10000});
  console.log('PASS suggestion button opens the card controls at Colour by');await shot(p,'pca-action');
  // Heatmap card
  await select(p,heat);await tip(p,'card');
  await chartButton(p,'Explain this chart');ans=await lastAnswer(p,'explain');
  assert.match(ans.text,/z-scores/);assert.match(ans.text,/Significant only runs no test/);console.log('PASS heatmap Explain is chart-specific');await shot(p,'heat-explain');
  await select(p,heat);await chartButton(p,'Suggest improvements');ans=await lastAnswer(p,'suggest');
  assert.ok(ans.actions.some(x=>x==='data:-heat_significance'||x==='data:-top_n'),'heatmap suggestions: '+JSON.stringify(ans));
  assert.ok(ans.actions.includes('publication'),'no publication-style action');console.log('PASS heatmap Suggest is chart-specific',JSON.stringify(ans.checks));await shot(p,'heat-suggest');
  // One click presentation change: Publication style.
  await p.locator('.cg-answer[data-cg-kind="suggest"]').last().locator('button[data-action="publication"]').first().click();
  await p.waitForFunction(id=>/Arial/.test(document.querySelector('.tc-node[data-plot-id="'+id+'"] .js-plotly-plot')?.layout?.font?.family||''),heat,{timeout:20000});
  console.log('PASS Publication style applied to the card');await shot(p,'heat-action');
  assert.deepEqual(await settings(),before,'a suggestion changed a scientific setting');console.log('PASS scientific settings unchanged',JSON.stringify(before));
  // Chat about a chart and an unknown question, offline.
  await p.evaluate(()=>{window.__sent=[];});
  a=await ask(p,'what is a volcano plot?');assert.match(a,/log2 fold change/);
  a=await ask(p,'how do I bake a cake?');assert.match(a,/don.t have reviewed guidance/);
  assert.ok(!(await p.evaluate(()=>window.__sent.includes('assistant_request'))),'offline chat sent a server request');console.log('PASS chat: topic answer and graceful fallback, offline');await shot(p,'chat');
  // Fewer tips persists in this browser.
  await p.locator('.cg-panel-fewer input').check();
  assert.equal(await p.evaluate(()=>localStorage.getItem('lipidomic-companion-fewer-tips')),'1');await p.locator('.cg-panel-fewer input').uncheck();console.log('PASS Fewer tips toggle persists');
  await p.evaluate(()=>document.querySelector('#lipidomic-assistant-panel .assistant-close').click());
  // Figure page tip.
  await p.evaluate(()=>document.getElementById('tc-preview-tab').click());
  t=await tip(p,'figure');assert.match(t.text,/figure/i);console.log('PASS figure page tip');await shot(p,'figure');
  await p.evaluate(()=>document.getElementById('tc-workspace-tab').click());
  assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
