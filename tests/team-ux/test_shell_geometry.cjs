// Team shell zones never overlap; the companion stays usable. Synthetic fixture only.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD,out=process.env.TEAM_UX_SHOTS;
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
const SIZES=[[1280,800],[1440,900],[1920,1080]];
async function ready(p){
 await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
 await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
 await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
 // Resume the seeded fixture checkpoint, not autosaves written by earlier runs.
 if(process.env.TEAM_CHECKPOINT)await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));},process.env.TEAM_CHECKPOINT);
 await p.evaluate(()=>document.getElementById('team_library_resume').click());
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled;},null,{timeout:300000});
 await p.evaluate(()=>document.querySelector('[data-tw-stage="canvas"]').click());
 await p.waitForFunction(()=>window.TeamAutosave?.state().restorePending===false&&window.TeamShell?.mounted(),null,{timeout:300000});
}
function zones(){
 const r=s=>{const n=document.querySelector(s);if(!n||!n.getClientRects().length||getComputedStyle(n).visibility==='hidden')return null;const b=n.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom};};
 const dock=document.querySelector('#lipidomic-companion');let companion=null;
 if(dock&&!dock.hidden&&getComputedStyle(dock).visibility!=='hidden'){const parts=['.companion-launcher','.companion-help-label','.companion-actions'].map(s=>dock.querySelector(s)).filter(n=>n&&n.getClientRects().length).map(n=>n.getBoundingClientRect());
  if(parts.length)companion={left:Math.min(...parts.map(b=>b.left)),top:Math.min(...parts.map(b=>b.top)),right:Math.max(...parts.map(b=>b.right)),bottom:Math.max(...parts.map(b=>b.bottom))};}
 return {topbar:r('.navbar'),rail:r('.ts-rail'),library:r('.tc-catalog'),canvas:r('.tc-main'),toolbar:r('.tc-toolbar'),minimap:r('.tc-navigation'),inspector:r('.tc-selection-inspector:not([hidden])')||r('.ts-inspector-empty'),companion,viewport:{left:0,top:0,right:innerWidth,bottom:innerHeight}};
}
const area=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
function check(z,label){
 const pairs=[['topbar','rail'],['topbar','library'],['topbar','canvas'],['topbar','inspector'],['rail','library'],['rail','canvas'],['library','canvas'],['canvas','inspector'],['library','inspector'],['toolbar','minimap'],
  ['companion','topbar'],['companion','rail'],['companion','library'],['companion','toolbar'],['companion','minimap'],['companion','inspector'],['companion','canvas']];
 for(const k of ['topbar','rail','canvas','toolbar','minimap','inspector','companion'])assert.ok(z[k],label+': missing zone '+k);
 for(const [a,b] of pairs)if(z[a]&&z[b])assert.equal(Math.round(area(z[a],z[b])),0,`${label}: ${a} overlaps ${b} ${JSON.stringify([z[a],z[b]])}`);
 for(const k of ['toolbar','minimap'])assert.ok(z[k].left>=z.canvas.left-1&&z[k].right<=z.canvas.right+1&&z[k].top>=z.canvas.top-1&&z[k].bottom<=z.canvas.bottom+1,`${label}: ${k} outside canvas`);
 assert.ok(z.companion.right<=z.viewport.right&&z.companion.bottom<=z.viewport.bottom&&z.companion.left>=0&&z.companion.top>=0,label+': companion off-screen');
 assert.ok(z.topbar.bottom-z.topbar.top<=49,label+': top bar taller than 48px');
}
(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await ready(p);
  await p.waitForTimeout(1500);
  // With nothing selected the companion offers its canvas action (add the suggested plot).
  const before=await p.locator('.tc-node[data-plot-id]').count();
  await p.locator('#lipidomic-companion .companion-launcher').click();
  await p.waitForSelector('#lipidomic-assistant-panel:not([hidden])',{timeout:30000});await p.waitForTimeout(800);
  const panel=await p.evaluate(()=>{const b=document.querySelector('#lipidomic-assistant-panel').getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom};});
  const z=await p.evaluate(zones);
  for(const k of ['topbar','minimap','toolbar','companion'])if(z[k])assert.equal(Math.round(area(panel,z[k])),0,'open companion panel overlaps '+k);
  console.log('PASS open companion panel stays clear of the bar, toolbar, minimap and character');
  if(out)await p.screenshot({path:path.join(out,'companion-expanded-1440x900.png')});
  const add=p.locator('#lipidomic-assistant-panel .assistant-action').filter({hasNotText:/^(Ask|Explain|Open Data|Close)/}).first();
  assert.ok(await add.count(),'companion offers a canvas action');await add.click();
  await p.waitForFunction(n=>document.querySelectorAll('.tc-node[data-plot-id]').length>n,before,{timeout:180000});
  console.log('PASS companion opens and its canvas action adds a plot');
  await p.locator('#lipidomic-assistant-panel').getByRole('button',{name:/close/i}).first().click().catch(()=>{});
  for(const src of ['results_dashboard-plot_pca','results_dashboard-plot_violin','results_dashboard-plot_comp'])await p.evaluate(s=>TeamCanvas.addCatalogPlot(s),src);
  await p.waitForFunction(()=>document.querySelectorAll('.tc-node[data-plot-id]').length>=4,null,{timeout:180000});await p.waitForTimeout(2500);
  for(const [w,h] of SIZES)for(const state of ['library-open','library-closed','selected']){
   await p.setViewportSize({width:w,height:h});
   if(state==='library-closed'){const open=await p.evaluate(()=>!document.querySelector('.tc-layout').classList.contains('tc-library-hidden'));if(open)await p.locator('.ts-rail-item[aria-label="Plots"]').click();}
   if(state==='library-open'){const open=await p.evaluate(()=>!document.querySelector('.tc-layout').classList.contains('tc-library-hidden'));if(!open)await p.locator('.ts-rail-item[aria-label="Plots"]').click();}
   if(state==='selected')await p.locator('.tc-node .tc-node-head').first().click({position:{x:6,y:6}});
   await p.evaluate(()=>window.dispatchEvent(new Event('resize')));await p.waitForTimeout(1200);
   check(await p.evaluate(zones),`${w}x${h} ${state}`);
   if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,`shell-${w}x${h}-${state}.png`)});}
   console.log(`PASS zones ${w}x${h} ${state}`);
  }
  assert.equal(errors.length,0,'page errors: '+errors.join(' | '));console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
