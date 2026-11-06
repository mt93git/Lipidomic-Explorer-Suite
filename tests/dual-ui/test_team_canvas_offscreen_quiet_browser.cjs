// Pan, zoom and select do no Plotly work on cards (above all, off-screen ones). Canvas zoom is a
// CSS transform: a card's plot keeps its logical size, so Shiny reporting a new on-screen box
// (pan across the viewport edge, zoom, a window resize) must not relayout it. Before the fix each
// such report was a full Plotly redraw of every mounted card, on-screen or not.
// Uses tests/dual-ui/fixture_team_canvas_lazy_live_app.R (started here), every card mounted.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const port=45000+Math.floor(Math.random()*900);
const make=(id,lipid,color,x,y)=>({id:id+'-plot_violin',label:'Saved '+id.slice(11),x,y,width:620,height:720,visual:{},finished:null,instance:{id,source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipid,color_by:color}}});
const state={version:'1',libraryHidden:false,nodes:[
 make('tcinstance_quieta','PC(34:1)','Group1',30,30),
 make('tcinstance_quietb','PE(36:2)','Group2',700,30),
 make('tcinstance_quietc','TG(50:1)','Group1',30,3000),
 make('tcinstance_quietd','PC(34:1)','Group2',700,3000),
 make('tcinstance_quiete','PE(36:2)','Group1',30,6000)]};
const ids=state.nodes.map(n=>n.id);
(async()=>{
 const app=spawn('Rscript',['--vanilla',path.join(__dirname,'fixture_team_canvas_lazy_live_app.R')],{env:{...process.env,TEAM_LAZY_LIVE_PORT:String(port)},stdio:['ignore','ignore','pipe']});
 let log='';app.stderr.on('data',d=>{log+=d;});
 const browser=await chromium.launch();
 try{
  for(let i=0;;i++){try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok)break;}catch(e){}if(i>160)throw new Error('fixture did not start\n'+log);await new Promise(r=>setTimeout(r,250));}
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // The lazy fixture page has no camera: load the Team viewport (zoom as a transform) before canvas.js.
  await page.addInitScript({path:path.join(__dirname,'../../www/team/js/canvas_viewport.js')});
  await page.goto(`http://127.0.0.1:${port}/?team_canvas_lazy=0`);
  await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.isConnected()&&Shiny.shinyapp.$inputValues['results_dashboard-violin_lipid']);
  await page.evaluate(s=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));
   window.restoreEvents=[];window.addEventListener('team-canvas-restore-status',e=>restoreEvents.push(e.detail.status));
   Shiny.setInputValue('test_import_state',s,{priority:'event'});},state);
  await page.waitForFunction(ids=>ids.every(i=>{const el=document.getElementById(i);return el&&el.data&&el._fullLayout;}),ids,{timeout:90000});
  await page.waitForTimeout(2500);
  // Count every Plotly layout/style call per card from here on, and whether the card was on screen.
  await page.evaluate(()=>{window.calls=[];const P=Plotly;
   const card=gd=>{const g=typeof gd==='string'?document.getElementById(gd):gd,n=g&&g.closest&&g.closest('.tc-node');if(!n)return null;const s=n.closest('.tc-scroll').getBoundingClientRect(),r=n.getBoundingClientRect();return {id:n.dataset.plotId,on:r.right>s.left&&r.left<s.right&&r.bottom>s.top&&r.top<s.bottom};};
   const hook=(o,k)=>{const f=o[k];o[k]=function(gd){const c=card(gd);if(c)calls.push(k+(c.on?' on ':' OFF ')+c.id);return f.apply(this,arguments);};};
   ['relayout','restyle','react','newPlot','update'].forEach(k=>hook(P,k));hook(P.Plots,'resize');});
  const scroll='.tc-scroll';
  for(let round=0;round<3;round++){
   await page.evaluate(()=>TeamCanvasViewport.setScale(0.5));await page.waitForTimeout(150);
   await page.evaluate(s=>document.querySelector(s).scrollBy(0,900),scroll);await page.waitForTimeout(150);
   await page.mouse.move(700,500);await page.mouse.wheel(0,-600);await page.waitForTimeout(150);
   const head=await page.evaluate(()=>{const s=document.querySelector('.tc-scroll').getBoundingClientRect();const n=[...document.querySelectorAll('.tc-node')].map(n=>n.querySelector('.tc-node-head').getBoundingClientRect()).find(r=>r.top>s.top+4&&r.bottom<s.bottom-4&&r.left>s.left);return n&&{x:n.left+n.width*0.5,y:n.top+5};});
   if(head)await page.mouse.click(head.x,head.y);
   await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.waitForTimeout(700);
   await page.evaluate(()=>TeamCanvasViewport.setScale(1));await page.waitForTimeout(150);
   await page.evaluate(s=>document.querySelector(s).scrollBy(0,-900),scroll);await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1200);
  const calls=await page.evaluate(()=>window.calls);
  const off=calls.filter(c=>c.includes(' OFF '));
  assert.deepEqual(off,[],'off-screen cards got no Plotly calls during pan/zoom/select/window resize: '+off.slice(0,8).join(', '));
  assert.ok(calls.length<=2,'on-screen cards were not redrawn on every camera move: '+calls.slice(0,8).join(', '));
  // The plots still have their logical (unzoomed) size.
  const sizes=await page.evaluate(ids=>ids.map(i=>{const el=document.getElementById(i);return [Math.round(el._fullLayout.width),el.clientWidth,Math.round(el._fullLayout.height),el.clientHeight];}),ids);
  sizes.forEach((s,i)=>{assert.ok(Math.abs(s[0]-s[1])<=1&&Math.abs(s[2]-s[3])<=1,ids[i]+' keeps its logical size: '+s);});
  assert.deepEqual(errors,[]);
  console.log('PASS: 3 rounds of zoom, pan, select and window resize with 5 mounted Plotly cards: 0 Plotly calls on off-screen cards, '+calls.length+' on screen; every plot keeps its logical size');
 }finally{await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
