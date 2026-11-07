// Live-checkpoint regression: persistent camera transform, no CSS zoom commit or output resize.
// Requires TEAM_URL, TEAM_EMAIL, TEAM_PASSWORD and optionally TEAM_CHECKPOINT.
const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {chromium}=require('../browser/ci/node_modules/playwright');
const url=process.env.TEAM_URL,email=process.env.TEAM_EMAIL,password=process.env.TEAM_PASSWORD;
if(!url||!email||!password)throw Error('TEAM_URL, TEAM_EMAIL and TEAM_PASSWORD are required (synthetic library only).');
const MIN_CARDS=+(process.env.TEAM_MIN_CARDS||10);
async function open(p,checkpoint){
 await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.Shiny?.shinyapp?.isConnected(),null,{timeout:120000});
 await p.locator('#team_library_email').fill(email);await p.locator('#team_library_password').fill(password);await p.locator('#team_library_login').click();
 await p.waitForFunction(()=>document.querySelector('#team_library_checkpoint')?.options.length>0,null,{timeout:120000});
 await p.evaluate(()=>{const x=document.querySelector('#team_library_password');if(x)x.value='';});
 await p.evaluate(name=>{const s=document.querySelector('#team_library_checkpoint');if(name){const o=[...s.options].find(o=>o.text.startsWith(name));if(!o)throw Error('checkpoint not found');s.value=o.value;}else s.selectedIndex=0;s.dispatchEvent(new Event('change',{bubbles:true}));},checkpoint||null);
 await p.evaluate(()=>{const d=document.querySelector('.ts-data-all');if(d)d.open=true;});await p.waitForTimeout(1000);await p.locator('#team_library_resume').click();
 await p.waitForFunction(()=>{const b=document.querySelector('[data-tw-stage="canvas"]');return b&&!b.disabled&&!document.documentElement.classList.contains('shiny-busy');},null,{timeout:600000});
 await p.evaluate(()=>window.TeamWorkspace&&TeamWorkspace.request?TeamWorkspace.request('canvas'):document.querySelector('[data-tw-stage="canvas"]').click());
 await p.waitForFunction(n=>document.querySelectorAll('.tc-node[data-plot-id]').length>=n&&!document.querySelector('.tc-node .tc-restore-settling,.tc-node .recalculating')&&window.TeamAutosave?.state().restorePending===false&&!document.documentElement.classList.contains('shiny-busy'),MIN_CARDS,{timeout:600000,polling:200});
}
const quiet=async p=>{await p.waitForTimeout(1500);await p.waitForFunction(()=>!document.documentElement.classList.contains('shiny-busy')&&!document.querySelector('.tc-node .recalculating'),null,{timeout:120000});await p.waitForTimeout(800);};
const state=p=>p.evaluate(()=>{
 const s=document.querySelector('#team-canvas-root .tc-scroll'),board=document.querySelector('.tc-world-board'),space=document.querySelector('.tc-world-space');
 return {scale:+TeamCanvasViewport.scale.toFixed(6),zoomOk:board.style.zoom===''&&Math.abs(board.getBoundingClientRect().width/board.offsetWidth-TeamCanvasViewport.scale)<.01,label:document.querySelector('.tc-zoom-reset').textContent,zoom:board.style.zoom,transform:board.style.transform,willChange:board.style.willChange,
  sl:Math.round(s.scrollLeft),st:Math.round(s.scrollTop),space:space.style.width+'x'+space.style.height,board:board.style.width+'x'+board.style.height,
  cards:[...document.querySelectorAll('.tc-node[data-plot-id]')].map(n=>{const gd=n.querySelector('.js-plotly-plot');return [n.dataset.plotId,n.style.left,n.style.top,n.style.width,n.style.height,gd?gd.style.height:'',gd&&gd._fullLayout?Math.round(gd._fullLayout.width)+'x'+Math.round(gd._fullLayout.height):''];})};});
// What the plot export bar uses (plot_exports.js plotSize) plus the SVG it produces at that size.
const exportsOf=p=>p.evaluate(async()=>{const out={};for(const n of document.querySelectorAll('.tc-node[data-plot-id]:not(.tc-finished)')){const gd=n.querySelector('.js-plotly-plot');if(gd&&gd._fullLayout){const w=gd.clientWidth,h=gd.clientHeight;out[n.dataset.plotId]={size:w+'x'+h,svg:await Plotly.toImage(gd,{format:'svg',width:w,height:h})};continue;}const img=n.querySelector('.tc-content img');if(img)out[n.dataset.plotId]={size:img.naturalWidth+'x'+img.naturalHeight,src:img.getAttribute('src')};}return out;});
// Plotly writes a random 6-character uid into its SVG ids (defs-ab12cd, clipab12cdxyplot): drop them.
const stable=svg=>svg.replace(/[0-9a-f]{6}/g,'');
const digest=e=>Object.fromEntries(Object.entries(e).map(([k,v])=>[k,v.size+' '+crypto.createHash('sha1').update(v.svg?stable(v.svg):(v.src||'')).digest('hex').slice(0,12)]));
(async()=>{const b=await chromium.launch({headless:true});const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let sent=null;p.on('websocket',ws=>ws.on('framesent',f=>{if(sent&&typeof f.payload==='string')sent.push(f.payload);}));
 try{
  await open(p,process.env.TEAM_CHECKPOINT);
  const cards=await p.locator('.tc-node[data-plot-id]').count();console.log('cards',cards);
  await p.evaluate(()=>TeamCanvasViewport.setScale(1));await quiet(p);
  const exports100=digest(await exportsOf(p)),again=digest(await exportsOf(p));
  // An export that differs between two identical calls (random ids left in it) is compared by size only.
  const comparable=d=>Object.fromEntries(Object.entries(d).map(([k,v])=>[k,again[k]===exports100[k]?v:v.split(' ')[0]]));
  // First frame after one step: everything the person sees has moved, nothing was laid out again.
  await p.locator('.tc-zoom-fit').click();await quiet(p);
  await p.evaluate(()=>{window.__frame=null;document.addEventListener('keydown',e=>{if(e.key!=='+')return;const t0=performance.now();requestAnimationFrame(()=>{const board=document.querySelector('.tc-world-board'),r=board.getBoundingClientRect();window.__frame={handlerMs:performance.now()-t0,label:document.querySelector('.tc-zoom-reset').textContent,scale:TeamCanvasViewport.scale,drawn:r.width/board.offsetWidth,zoom:board.style.zoom,frameWindow:+document.querySelector('.tc-map-window').getAttribute('width')};});},{capture:true,once:true});});
  const before=await state(p);
  await p.locator('.tc-scroll').hover({position:{x:300,y:300}});sent=[];await p.keyboard.press('+');
  await p.waitForFunction(()=>window.__frame);const f=await p.evaluate(()=>window.__frame);console.log('first frame',JSON.stringify(f));
  assert.equal(f.label,Math.round(f.scale*100)+'%','the percentage shows the new zoom on the first frame');
  assert.ok(Math.abs(f.scale-before.scale*1.25)<1e-5,'one step is x1.25');
  assert.ok(Math.abs(f.drawn-f.scale)<0.01,'the board is drawn at the new zoom on the first frame ('+f.drawn+' vs '+f.scale+')');
  assert.equal(f.zoom,before.zoom,'no CSS zoom (layout) on the first frame');
  assert.equal(sent.filter(s=>s.includes('clientdata_output')).length,0,'no output re-measure while previewing');
  await quiet(p);
  // Five quick steps and idle: no CSS zoom commit and no output remeasurement.
  const start=await state(p);sent=[];
  for(let i=0;i<5;i++){await p.keyboard.press('-');await p.waitForTimeout(60);}
  const mid=await p.evaluate(()=>({zoom:document.querySelector('.tc-world-board').style.zoom,transform:document.querySelector('.tc-world-board').style.transform}));
  assert.equal(mid.zoom,start.zoom,'quick steps never change CSS zoom');assert.ok(mid.transform.startsWith('scale('),'camera is a transform');
  await quiet(p);const gesture=await state(p);
  assert.ok(gesture.zoomOk,'the settled board retains its camera transform');assert.ok(gesture.transform.startsWith('scale('));assert.equal(gesture.willChange,'');
  const clientdata=sent.filter(s=>/clientdata_output_tcinstance/.test(s));
  assert.equal(clientdata.length,0,'a zoom does not re-measure canvas outputs: '+clientdata.map(s=>s.slice(0,160)).join(' | '));
  // The same five steps through setScale (as restore and tabs use) end identical.
  await p.evaluate(s=>{TeamCanvasViewport.setScale(s.scale);const el=document.querySelector('#team-canvas-root .tc-scroll');el.scrollLeft=s.sl;el.scrollTop=s.st;},start);
  await p.evaluate(()=>{for(let i=0;i<5;i++)TeamCanvasViewport.setScale(TeamCanvasViewport.scale/1.25);});await quiet(p);
  const immediate=await state(p);
  assert.deepEqual(gesture,immediate,'buttons and immediate camera calls end in the same state');
  // Card frames and plot heights stay in logical pixels.
  const frames=c=>c.map(x=>x.slice(0,6));
  assert.deepEqual(frames(gesture.cards),frames(before.cards),'card frames and plot heights never change with zoom');
  // Other canvas actions (Finish, drag, menus) use the current transform immediately.
  await p.keyboard.press('+');const card=p.locator('.tc-node[data-plot-id] .tc-node-head').first();const box=await card.boundingBox();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();
  const atDown=await p.evaluate(()=>({zoom:document.querySelector('.tc-world-board').style.zoom,transform:document.querySelector('.tc-world-board').style.transform,scale:TeamCanvasViewport.scale}));
  await p.mouse.up();
  assert.equal(atDown.zoom,'','pointerdown never commits CSS zoom');assert.equal(atDown.transform,'scale('+atDown.scale+')');
  await quiet(p);
  // Camera moves and other keys retain the persistent transform.
  const committedNow=()=>p.evaluate(()=>{const b=document.querySelector('.tc-world-board');return b.style.zoom===''&&b.style.transform==='scale('+TeamCanvasViewport.scale+')';});
  await p.keyboard.press('-');assert.equal(await committedNow(),true,'a step is already final');
  assert.equal(await p.evaluate(()=>{TeamCanvasViewport.focusNodeForPanel(document.querySelector('.tc-node[data-plot-id]'),0);const b=document.querySelector('.tc-world-board');return b.style.zoom===''&&b.style.transform==='scale('+TeamCanvasViewport.scale+')';}),true,'focusNodeForPanel preserves the transform camera');
  await quiet(p);await p.keyboard.press('-');await p.keyboard.press('Escape');assert.equal(await committedNow(),true,'another key preserves the transform camera');
  await quiet(p);
  // Exports after a round trip back to 100% equal the exports before any zoom.
  await p.locator('.tc-zoom-reset').click();await quiet(p);
  assert.deepEqual(comparable(digest(await exportsOf(p))),comparable(exports100),'exports unchanged by zooming');
  console.log('exports compared by content',Object.keys(exports100).filter(k=>again[k]===exports100[k]).length,'of',Object.keys(exports100).length);
  assert.deepEqual(errors,[],'no page errors');
  console.log('PASS test_canvas_zoom');
 }catch(e){console.error('FAIL',e.message);try{console.error('zoom calls',JSON.stringify(await p.evaluate(()=>window.__zc||null)));}catch(_){}process.exitCode=1;}finally{await b.close();}
})();
