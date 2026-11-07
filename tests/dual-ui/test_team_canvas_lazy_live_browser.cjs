// Lazy mount (W16b, reduced design). A restored checkpoint's independent Plotly copies are
// left unbound until their card first comes near the Canvas viewport (or is worked with, or
// exported); Shiny keeps their latest value or error and binding renders it. Checks:
//  1. cards in view draw; cards far below stay unbound (placeholder, no Plotly graph) while
//     Shiny holds their current values; new data for an unmounted card draws nothing until it
//     mounts, then only the current value;
//  2. the saved canvas state is identical before and after every card has mounted, and with
//     lazy mounting off;
//  3. scrolling a card into view mounts it with no layout shift;
//  4. exports (PNG, CSV), Finish mount first; Codex's stale-export counterexamples (newer B/C,
//     B then error, server recalculating at export time, overlapping renders) never export or
//     draw a stale value (page runs with ?team_canvas_assert=1: any capture of an unmounted or
//     unclean card is recorded and fails the test); an export that cannot settle is refused;
//  5. a finished card in view keeps its saved image without mounting; Edit mounts;
//  6. ?team_canvas_lazy=0 draws every card at once (previous behaviour);
//  7. right after opening (no scrolling): save, edit-then-export of an off-screen card, and
//     exporting every card at once.
// Starts tests/dual-ui/fixture_team_canvas_lazy_live_app.R itself.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const port=44000+Math.floor(Math.random()*900);
const snapshot='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%2F%3E%3C%2Fsvg%3E';
const make=(id,lipid,color,x,y,finished)=>({id:id+'-plot_violin',label:'Saved '+id.slice(11),x,y,width:620,height:720,visual:{background:'#eef3fa'},finished:finished?{url:snapshot,createdAt:'2026-10-29T00:00:00Z',stale:false}:null,instance:{id,source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipid,color_by:color}}});
// Saved (creation) order puts the farthest cards first: the Canvas being shown, the copies
// are requested nearest-the-view first.
const state={version:'1',libraryHidden:false,nodes:[
 make('tcinstance_lazydata','PC(34:1)','Group1',700,15000,false),
 make('tcinstance_lazyend','TG(50:1)','Group2',700,12000,false),
 make('tcinstance_lazycsv','TG(50:1)','Group1',30,12000,false),
 make('tcinstance_lazypng','PC(34:1)','Group2',30,9000,false),
 make('tcinstance_lazyfar','PE(36:2)','Group2',30,6000,false),
 make('tcinstance_lazyfin','PE(36:2)','Group1',700,30,true),
 make('tcinstance_lazynear','PC(34:1)','Group1',30,30,false)]};
const id=k=>'tcinstance_lazy'+k+'-plot_violin';
async function open(browser,query){
 const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/${query||'?team_canvas_assert=1'}`);
 await page.waitForFunction(()=>window.TeamCanvas&&window.Shiny?.shinyapp?.isConnected()&&Shiny.shinyapp.$inputValues['results_dashboard-violin_lipid']);
 await page.evaluate(()=>{
  window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));
  window.creates=[];const send=Shiny.setInputValue.bind(Shiny);Shiny.setInputValue=function(name,value,options){if(name==='team_canvas_instance_create')creates.push(value.id);return send(name,value,options);};
  window.restoreEvents=[];window.addEventListener('team-canvas-restore-status',e=>restoreEvents.push(e.detail.status));
  window.shifts=[];new PerformanceObserver(l=>{for(const e of l.getEntries())shifts.push({value:e.value,input:e.hadRecentInput,t:e.startTime});}).observe({type:'layout-shift',buffered:true});
  window.draws={};const fpv=d=>JSON.stringify((d||[]).map(t=>[t.name,(t.y||[]).length,(t.y||[]).slice(0,3)]));window.fpv=fpv;
  for(const k of ['newPlot','react']){const o=Plotly[k].bind(Plotly);Plotly[k]=function(gd,data,...rest){const el=typeof gd==='string'?document.getElementById(gd):gd,o2=el&&el.closest&&el.closest('[id$=plot_violin]');if(o2)(draws[o2.id]=draws[o2.id]||[]).push(fpv(Array.isArray(data)?data:data&&data.data));return o(gd,data,...rest);};}
  window.drawn=id=>{const el=document.getElementById(id);const gd=el&&(el.classList.contains('js-plotly-plot')?el:el.querySelector('.js-plotly-plot'));return !!(gd&&gd.data&&gd._fullLayout);};
  window.box=id=>{const el=document.getElementById(id),n=el.closest('.tc-node');return {left:n.style.left,top:n.style.top,w:n.offsetWidth,h:n.offsetHeight,plotW:el.offsetWidth,plotH:el.offsetHeight,plotTop:el.offsetTop};};
 });
 await page.evaluate(s=>Shiny.setInputValue('test_import_state',s,{priority:'event'}),state);
 await page.waitForFunction(n=>restoreEvents.includes('success')&&document.querySelectorAll('.tc-node').length===n,state.nodes.length,{timeout:90000});
 return {page,errors};
}
const savedPart=n=>({id:n.id,label:n.label,x:n.x,y:n.y,width:n.width,height:n.height,visual:n.visual,finished:n.finished||null,instance:{id:n.instance.id,source:n.instance.source,inputs:{violin_lipid:n.instance.inputs.violin_lipid,color_by:n.instance.inputs.color_by}}});
// (Astra round 1, P2; Codex round 2) The clean check's trace signature, against the axis swap of
// plot_editor.js (x and y exchanged, z transposed for heatmap, contour, histogram2d).
{
  const src=require('node:fs').readFileSync(path.join(__dirname,'../../www/team/js/canvas.js'),'utf8');
  const body=src.slice(src.indexOf('  function lazyTraceSignature(data, swapped) {'),src.indexOf('  var lazySourceSignatures'));
  const sig=new Function(body+'; return lazyTraceSignature;')();
  const source=[{type:'heatmap',x:['a','b','c'],y:['r1','r2'],z:[[1,2,3],[4,5,6]]},{type:'violin',x:['g1','g1'],y:[1.5,2.5]}];
  const tr=z=>z[0].map((_,j)=>z.map(r=>r[j]));
  const shown=source.map(t=>{const c={...t,x:t.y,y:t.x};if(t.type==='heatmap')c.z=tr(t.z);return c;});
  assert.equal(sig(shown,false),sig(source,true),'a swapped heatmap and violin match their source');
  const other=JSON.parse(JSON.stringify(shown));other[0].z[1][0]=99;
  assert.notEqual(sig(other,false),sig(source,true),'other heatmap values do not match');
}
// (Astra round 2, P2) plot_editor.js leaves a ragged matrix as it is when it swaps the axes:
// so does the signature (else a ragged heatmap could never be clean after a rotation).
{
  const src=require('node:fs').readFileSync(path.join(__dirname,'../../www/team/js/canvas.js'),'utf8');
  const sig=new Function(src.slice(src.indexOf('  function lazyTraceSignature(data, swapped) {'),src.indexOf('  var lazySourceSignatures'))+'; return lazyTraceSignature;')();
  const ed=require('node:fs').readFileSync(path.join(__dirname,'../../www/team/js/plot_editor.js'),'utf8');
  const editorTranspose=new Function(ed.match(/  function transpose\(m\)\{.*\}\n/)[0]+'; return transpose;')();
  const ragged={type:'heatmap',x:['a','b','c'],y:['r1','r2'],z:[[1,2,3],[4,5]]};
  const shown={...ragged,x:ragged.y,y:ragged.x,z:editorTranspose(ragged.z)};
  assert.deepEqual(shown.z,ragged.z,'the editor keeps a ragged matrix');
  assert.equal(sig([shown],false),sig([ragged],true),'a rotated ragged heatmap matches its source');
  const rect={type:'contour',x:[1,2],y:[1,2,3],z:[[1,2],[3,4],[5,6]]};
  assert.equal(sig([{...rect,x:rect.y,y:rect.x,z:editorTranspose(rect.z)}],false),sig([rect],true),'a rotated rectangular contour matches its source');
}
// (Astra round 2) The export revision: Group Comparison data changes (invalidateGroupComparison,
// the real function), statistics display changes and new renders break a token; an equivalent
// render (no r.revision change) and a different key order do not.
{
  const src=require('node:fs').readFileSync(path.join(__dirname,'../../www/team/js/canvas.js'),'utf8');
  const epochSrc=src.slice(src.indexOf('  function stableJSON(v) {'),src.indexOf('  function exportRevision(el) {'));
  const inv=src.match(/invalidateGroupComparison: (function\(id\)\{.*?return true;\}),/)[1];
  const records=new Map();
  const api=new Function('records','editDuringHydration','staleSnapshot','watchRender',epochSrc+'; return {epoch:lazyExportEpoch, invalidate:'+inv+'};')(records,()=>{},()=>{},()=>{});
  const r={revision:3,instance:{source:'group_comparison_tab-comparisonPlot'},visual:{title:'T',font:12},statistics:{presentation:{show:true,label:'both',hidden:[]}}};
  records.set('g',r);
  const t0=api.epoch(r);
  r.visual={font:12,title:'T'};r.statistics.presentation={hidden:[],label:'both',show:true};
  assert.equal(api.epoch(r),t0,'key order does not change the revision');
  assert.equal(api.invalidate('g'),true);
  assert.notEqual(api.epoch(r),t0,'a Group Comparison data change breaks an export token');
  const t1=api.epoch(r);r.statistics.presentation.show=false;
  assert.notEqual(api.epoch(r),t1,'hiding significance annotations breaks an export token');
  const t2=api.epoch(r);r.revision++;
  assert.notEqual(api.epoch(r),t2,'a new render breaks an export token');
}
(async()=>{
 const app=spawn('Rscript',['--vanilla',path.join(__dirname,'fixture_team_canvas_lazy_live_app.R')],{env:{...process.env,TEAM_LAZY_LIVE_PORT:String(port)},stdio:['ignore','ignore','pipe']});
 let log='';app.stderr.on('data',d=>{log+=d;});
 const browser=await chromium.launch();
 try{
  for(let i=0;;i++){try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok)break;}catch(e){}if(i>160)throw new Error('fixture did not start\n'+log);await new Promise(r=>setTimeout(r,250));}
  const {page,errors}=await open(browser);
  // 1. In view: drawn. Far below: undrawn placeholder, value already delivered.
  await page.waitForFunction(i=>drawn(i),id('near'),{timeout:30000});
  await page.waitForFunction(ids=>ids.every(i=>Shiny.shinyapp.$values[i]!==undefined)&&!document.querySelector('.tc-restore-settling'),['far','csv','png','end'].map(id),{timeout:30000});
  await page.waitForTimeout(800);
  const far=await page.evaluate(ids=>ids.map(i=>({drawn:drawn(i),live:TeamCanvas.isLive(i),placeholder:document.getElementById(i).classList.contains('tc-lazy-placeholder'),status:TeamCanvas.cardStatus(i)})),['far','csv','png','end'].map(id));
  far.forEach(f=>assert.deepEqual(f,{drawn:false,live:false,placeholder:true,status:'current'},'a card far below the viewport is not drawn, shows the placeholder and reads as current'));
  assert.equal(await page.evaluate(i=>TeamCanvas.isLive(i),id('near')),true,'a card in view is live');
  // 1b. The placeholder is announced as a plot not drawn yet (busy card, labelled image).
  assert.deepEqual(await page.evaluate(i=>{const el=document.getElementById(i),n=el.closest('.tc-node');return {busy:n.getAttribute('aria-busy'),role:el.getAttribute('role'),label:/not drawn yet/.test(el.getAttribute('aria-label')||'')};},id('far')),{busy:'true',role:'img',label:true},'an undrawn card is aria-busy and its plot area is labelled');
  assert.deepEqual(await page.evaluate(i=>{const el=document.getElementById(i),n=el.closest('.tc-node');return [n.getAttribute('aria-busy'),el.getAttribute('role'),el.getAttribute('aria-label')];},id('near')),[null,null,null],'a drawn card carries no placeholder semantics');
  // 1c. New data for an unmounted card (its lipid changed): nothing is drawn while it stays
  //     unmounted; mounting it draws only the current (new) value, never the restore value,
  //     and it settles current with the presentation a dashboard copy keeps.
  await page.waitForFunction(i=>Shiny.shinyapp.$values[i]!==undefined&&!TeamCanvas.isLive(i),id('data'),{timeout:30000});
  const firstFp=await page.evaluate(i=>fpv(Shiny.shinyapp.$values[i].x.data),id('data'));
  await page.evaluate(()=>Shiny.setInputValue('tcinstance_lazydata-violin_lipid','TG(50:1)'));
  await page.waitForFunction(([i,f])=>fpv(Shiny.shinyapp.$values[i].x.data)!==f,[id('data'),firstFp],{timeout:30000,polling:100});
  assert.deepEqual(await page.evaluate(i=>({live:TeamCanvas.isLive(i),drawn:drawn(i),draws:(draws[i]||[]).length}),id('data')),{live:false,drawn:false,draws:0},'new data for an unmounted card draws nothing');
  assert.equal(await page.evaluate(i=>TeamCanvas.ensureMounted(i),id('data')),true,'it mounts clean');
  const dataDraws=await page.evaluate(i=>({draws:draws[i],shown:fpv(document.getElementById(i).data),current:fpv(Shiny.shinyapp.$values[i].x.data)}),id('data'));
  assert.ok(dataDraws.draws.length>=1&&dataDraws.draws.every(d=>d===dataDraws.current)&&dataDraws.shown===dataDraws.current&&!dataDraws.draws.includes(firstFp),'only the current value is drawn: '+JSON.stringify(dataDraws).slice(0,300));
  assert.equal(await page.evaluate(i=>TeamCanvas.cardStatus(i),id('data')),'current');
  assert.deepEqual(await page.evaluate(i=>TeamCanvas.serialize().nodes.find(n=>n.id===i).visual,id('data')),{background:'#eef3fa'},'the saved presentation is kept (a dashboard copy keeps it)');
  // 5. A finished card in view keeps its saved image and does not draw.
  assert.equal(await page.evaluate(i=>drawn(i)||TeamCanvas.isLive(i),id('fin')),false,'a finished card in view does not draw its live plot');
  // 2. The saved state with undrawn cards.
  const lazySaved=await page.evaluate(()=>TeamCanvas.serialize());
  assert.deepEqual(lazySaved.nodes.map(savedPart),state.nodes.map(savedPart),'the saved state holds every restored card unchanged while some are undrawn');
  // 3. Scroll a far card into view: it draws with no layout shift.
  const before=await page.evaluate(i=>box(i),id('far'));
  await page.evaluate(()=>{window.shifts=[];});
  await page.evaluate(i=>{const n=document.getElementById(i).closest('.tc-node'),s=n.closest('.tc-scroll');s.scrollTop=n.offsetTop-20;},id('far'));
  await page.waitForFunction(i=>drawn(i),id('far'),{timeout:15000});
  await page.waitForTimeout(500);
  const after=await page.evaluate(i=>box(i),id('far'));
  assert.deepEqual(after,before,'the card and its plot box keep their size and place when it draws');
  const cls=await page.evaluate(()=>shifts.filter(s=>!s.input).reduce((a,s)=>a+s.value,0));
  assert.ok(cls<0.01,'no layout shift when a card draws (CLS '+cls+')');
  assert.equal(await page.evaluate(i=>document.getElementById(i).classList.contains('tc-lazy-placeholder'),id('far')),false,'the placeholder is gone once drawn');
  // 4a. PNG export of an undrawn card draws it first, then exports the live plot.
  assert.equal(await page.evaluate(i=>drawn(i),id('png')),false);
  const [png]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.evaluate(i=>{const b=[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG');b.click();},id('png'))]);
  assert.match(png.suggestedFilename(),/\.png$/,'the PNG export downloads');
  assert.equal(await page.evaluate(i=>drawn(i)&&TeamCanvas.isLive(i),id('png')),true,'the exported card was drawn live first');
  const pngTraces=await page.evaluate(i=>{const el=document.getElementById(i);return {shown:el.data.length,current:Shiny.shinyapp.$values[i].x.data.length};},id('png'));
  assert.equal(pngTraces.shown,pngTraces.current,'the export draws the current value');
  // 4b. The data CSV of an undrawn card (its module's download link, in the card): the card
  //     draws, then the server's current data downloads.
  assert.equal(await page.evaluate(i=>drawn(i),id('csv')),false);
  const [csv]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.evaluate(()=>document.getElementById('tcinstance_lazycsv-dl_violin').click())]);
  assert.match(csv.suggestedFilename(),/\.csv$/,'the data CSV downloads');
  assert.equal(await page.evaluate(i=>drawn(i),id('csv')),true,'the CSV export drew the card first');
  // 4c. Finish on an undrawn card draws it and captures the live plot.
  assert.equal(await page.evaluate(i=>drawn(i),id('end')),false);
  await page.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.tc-node-head button')].find(b=>b.textContent==='Finish plot').click(),id('end'));
  await page.waitForFunction(i=>document.getElementById(i).closest('.tc-node').classList.contains('tc-finished'),id('end'),{timeout:30000});
  assert.equal(await page.evaluate(i=>drawn(i),id('end')),true,'Finish drew the live plot it captured');
  // 5b. Edit on the finished card draws its live plot.
  await page.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.tc-node-head button')].find(b=>b.textContent==='Edit').click(),id('fin'));
  await page.waitForFunction(i=>drawn(i),id('fin'),{timeout:15000});
  // 2b. With every card drawn the saved state equals the one taken while they were undrawn,
  //     except the two figures changed above (Finish and Edit).
  await page.evaluate(()=>Promise.all(Array.from(document.querySelectorAll('.tc-node')).map(n=>TeamCanvas.ensureMounted(n.dataset.plotId))));
  const liveSaved=await page.evaluate(()=>TeamCanvas.serialize());
  const unchanged=s=>({...s,nodes:s.nodes.filter(n=>n.id!==id('end')&&n.id!==id('fin')&&n.id!==id('data'))});
  assert.deepEqual(unchanged(liveSaved),unchanged(lazySaved),'drawing the cards changes nothing in the saved state');
  assert.deepEqual(errors,[]);
  assert.deepEqual(await page.evaluate(()=>window.TEAM_CANVAS_ASSERT_FAILURES||[]),[],'no capture read an unmounted or unclean card');
  await page.close();
  // 4d. An export of an undrawn card that cannot settle (the preparation is not ready, so
  //     no current figure) is refused with a message: nothing unsettled is exported.
  {
    const again=await open(browser);
    await again.page.waitForFunction(ids=>ids.every(i=>Shiny.shinyapp.$values[i]!==undefined&&!TeamCanvas.isLive(i)),[id('png'),id('far'),id('csv')],{timeout:30000});
    // A result with other data: trace names tagged and y values scaled (tag '=k': same names, only y differs).
    const named=(v,tag)=>{const c=JSON.parse(JSON.stringify(v));const k={' B':2,' C':3,' N':4,' R2':5,' B2':6,' C2':7,'=8':8,'=9':9}[tag]||1;c.x.data.forEach(t=>{if(tag[0]!=='=')t.name=String(t.name)+tag;if(Array.isArray(t.y))t.y=t.y.map(v=>typeof v==='number'?v*k:v);});return c;};
    // (Astra round 1, P2) An equivalent value for an unmounted card is not announced as a new
    // result (verified statistics kept, as on an eager card); a changed one is.
    {
      const pg=again.page;
      await pg.evaluate(i=>{window.fwd=0;jQuery(document.getElementById(i)).on('shiny:value',()=>{fwd++;});Shiny.shinyapp.receiveOutput(i,JSON.parse(JSON.stringify(Shiny.shinyapp.$values[i])));},id('far'));
      assert.equal(await pg.evaluate(()=>fwd),0,'an equivalent value is not announced');
      assert.equal(await pg.evaluate(i=>TeamCanvas.isLive(i),id('far')),false);
    }
    // 4e. (Codex round 3, P1) Two newer results for an unmounted card (B, then C): mounting
    //     draws C only; neither the restore value nor B is ever drawn.
    await again.page.evaluate(([i,nf])=>{const named=eval(nf);const a=Shiny.shinyapp.$values[i];Shiny.shinyapp.receiveOutput(i,named(a,' B'));Shiny.shinyapp.receiveOutput(i,named(a,' C'));},[id('far'),named.toString()]);
    await again.page.evaluate(i=>{window.mountEvents=0;jQuery(document.getElementById(i)).on('shiny:value shiny:error',()=>{mountEvents++;});},id('far'));
    assert.equal(await again.page.evaluate(i=>TeamCanvas.ensureMounted(i),id('far')),true);
    assert.equal(await again.page.evaluate(()=>mountEvents),0,'mounting announces no value (the Canvas heard B and C when they arrived): statistics and presentation are not reset by scrolling');
    const seqFar=await again.page.evaluate(i=>({draws:draws[i]||[],shown:document.getElementById(i).data.map(t=>t.name).join(',')}),id('far'));
    assert.ok(seqFar.draws.length>=1&&seqFar.draws.every(d=>/ C"/.test(d)&&!/ B"/.test(d))&&/ C(,|$)/.test(seqFar.shown),'only the latest result is drawn: '+JSON.stringify(seqFar).slice(0,300));
    // 4e'. (Codex round 3, P1) A newer result B then an error for an unmounted card: B is never
    //      drawn; mounting shows the error state; an export is refused (nothing stale exported).
    await again.page.evaluate(([i,nf])=>{const named=eval(nf);Shiny.shinyapp.receiveOutput(i,named(Shiny.shinyapp.$values[i],' B'));Shiny.shinyapp.receiveError(i,{message:'The analysis failed.',type:null});},[id('end'),named.toString()]);
    await again.page.evaluate(()=>{window.TEAM_CANVAS_LAZY_WAIT_MS=4000;});
    assert.equal(await again.page.evaluate(i=>TeamCanvas.ensureMounted(i),id('end')),false,'a card in error is never clean');
    const endState=await again.page.evaluate(i=>({live:TeamCanvas.isLive(i),drawn:drawn(i),draws:(draws[i]||[]).length,status:TeamCanvas.cardStatus(i)}),id('end'));
    assert.deepEqual(endState,{live:true,drawn:false,draws:0,status:'error'},'the error shows, nothing drawn: '+JSON.stringify(endState));
    let endDownloaded=false;const onDl=()=>{endDownloaded=true;};again.page.on('download',onDl);
    await again.page.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG')?.click(),id('end'));
    await again.page.waitForTimeout(5500);again.page.off('download',onDl);
    assert.equal(endDownloaded,false,'no export of a card in error');
    // 4g. (Codex w16b3, P1) The server invalidates an unmounted card (it starts recalculating)
    //     and its export is asked before the new value arrives: the export waits (the card is
    //     recalculating once bound) and exports the new value, never the old one.
    await again.page.evaluate(()=>{window.TEAM_CANVAS_LAZY_WAIT_MS=20000;});
    const pngOld=await again.page.evaluate(i=>fpv(Shiny.shinyapp.$values[i].x.data),id('png'));
    await again.page.evaluate(i=>(async()=>{await Shiny.shinyapp.dispatchMessage(JSON.stringify({progress:{type:'binding',message:{id:i}}}));await Shiny.shinyapp.dispatchMessage(JSON.stringify({recalculating:{name:i,status:'recalculating'}}));})(),id('png'));
    const pngDl=again.page.waitForEvent('download',{timeout:30000});
    await again.page.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click(),id('png'));
    await again.page.waitForTimeout(1500);
    assert.equal(await again.page.evaluate(i=>document.getElementById(i).classList.contains('recalculating'),id('png')),true,'bound while recalculating: shown as recalculating');
    await again.page.evaluate(([i,nf])=>{const named=eval(nf);(async()=>{await Shiny.shinyapp.dispatchMessage(JSON.stringify({recalculating:{name:i,status:'recalculated'}}));await Shiny.shinyapp.dispatchMessage(JSON.stringify({values:{[i]:named(Shiny.shinyapp.$values[i],' N')},errors:{},inputMessages:[]}));})();},[id('png'),named.toString()]);
    await pngDl;
    const pngState=await again.page.evaluate(i=>({shown:fpv(document.getElementById(i).data),current:fpv(Shiny.shinyapp.$values[i].x.data)}),id('png'));
    assert.ok(pngState.shown===pngState.current&&pngState.current!==pngOld&&/ N"/.test(pngState.shown),'the export used the new value: '+JSON.stringify(pngState).slice(0,200));
    // 4h. (Codex w16b3, P1) Overlapping renders on a mounted card (B then C at once) and an
    //     export at once: assert mode would throw if the export read B; the export shows C.
    await again.page.evaluate(([i,nf])=>{const named=eval(nf);const a=Shiny.shinyapp.$values[i];Shiny.shinyapp.receiveOutput(i,named(a,' B2'));Shiny.shinyapp.receiveOutput(i,named(a,' C2'));[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click();},[id('png'),named.toString()]);
    await again.page.waitForEvent('download',{timeout:30000});
    assert.ok(await again.page.evaluate(i=>document.getElementById(i).data.every(t=>/ C2$/.test(t.name)),id('png')),'the overlapping renders end on C');
    // 4h'. (Codex lazy review, P1) Overlapping renders with the same names and sizes, only the
    //      values differ (=8 then =9), and an export at once: the export shows =9's values.
    {
      const base=await again.page.evaluate(i=>JSON.stringify(Shiny.shinyapp.$values[i].x.data.map(t=>t.y)),id('png'));
      const dl=again.page.waitForEvent('download',{timeout:30000});
      await again.page.evaluate(([i,nf])=>{const named=eval(nf);const a=Shiny.shinyapp.$values[i];Shiny.shinyapp.receiveOutput(i,named(a,'=8'));Shiny.shinyapp.receiveOutput(i,named(a,'=9'));[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click();},[id('png'),named.toString()]);
      await dl;
      const ys=await again.page.evaluate(i=>({shown:JSON.stringify(document.getElementById(i).data.map(t=>t.y)),current:JSON.stringify(Shiny.shinyapp.$values[i].x.data.map(t=>t.y))}),id('png'));
      assert.ok(ys.shown===ys.current&&ys.current!==base,'the export shows the latest values');
    }
    // 4i. (Codex lazy review, P1) A kept "Save PNG file" link holds the previous image: a new
    //     result for the card withdraws it.
    await again.page.waitForFunction(i=>!!document.getElementById(i).closest('.tc-node').querySelector('.plot-export-fallback'),id('png'),{timeout:10000});
    await again.page.evaluate(([i,nf])=>{const named=eval(nf);Shiny.shinyapp.receiveOutput(i,named(Shiny.shinyapp.$values[i],' B'));},[id('png'),named.toString()]);
    assert.equal(await again.page.evaluate(i=>!!document.getElementById(i).closest('.tc-node').querySelector('.plot-export-fallback'),id('png')),false,'the old image link is withdrawn');
    // 4j. (Codex lazy review round 2) Kept image links carry the card's revision; wherever they
    //     are, they are withdrawn on a new result, refused after a presentation change, and an
    //     export that was running when the result changed publishes nothing.
    {
      const pg=again.page, png=()=>pg.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click(),id('png'));
      let dls=0;const count=()=>{dls++;};pg.on('download',count);
      // R1: a link held outside the card (as the properties panel holds bars) is withdrawn on a new result.
      await png();await pg.waitForFunction(()=>!!document.querySelector('a.plot-export-fallback[data-card-id][data-revision]'),null,{timeout:30000});
      await pg.evaluate(()=>{const a=document.querySelector('a.plot-export-fallback[data-card-id]');window.heldLink=a;document.body.appendChild(a);});
      await pg.evaluate(([i,nf])=>{const named=eval(nf);Shiny.shinyapp.receiveOutput(i,named(Shiny.shinyapp.$values[i],' C'));},[id('png'),named.toString()]);
      assert.equal(await pg.evaluate(()=>heldLink.isConnected),false,'a link held outside the card is withdrawn on a new result');
      // R3: a presentation change makes a kept link stale: clicking it is refused and removes it.
      await png();await pg.waitForFunction(()=>!!document.querySelector('a.plot-export-fallback[data-card-id]'),null,{timeout:30000});
      const before=dls;
      await pg.evaluate(i=>{const n=document.getElementById(i).closest('.tc-node');const f=n.querySelector('input[data-visual-key][type=text]');f.value='Changed title';f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));},id('png'));
      await pg.waitForTimeout(800);
      await pg.evaluate(()=>{const a=document.querySelector('a.plot-export-fallback[data-card-id]');window.staleLink=a;a.click();});
      await pg.waitForTimeout(1200);
      assert.equal(dls,before,'a link made before a presentation change downloads nothing');
      assert.equal(await pg.evaluate(()=>staleLink.isConnected),false,'and is removed');
      // R2: the result changes while an export is converting: nothing is published.
      await pg.evaluate(()=>{const o=Plotly.toImage.bind(Plotly);window.releaseExport=null;window.exportWaiting=false;Plotly.toImage=async function(...a){window.exportWaiting=true;await new Promise(r=>{window.releaseExport=r;});Plotly.toImage=o;return o(...a);};});
      const before2=dls;
      await png();await pg.waitForFunction(()=>window.exportWaiting,null,{timeout:30000});
      await pg.evaluate(([i,nf])=>{const named=eval(nf);Shiny.shinyapp.receiveOutput(i,named(Shiny.shinyapp.$values[i],' N'));},[id('png'),named.toString()]);
      await pg.evaluate(()=>window.releaseExport());
      await pg.waitForFunction(i=>/Plot changed/.test(document.getElementById(i).closest('.tc-node').querySelector('.plot-export-status')?.textContent||''),id('png'),{timeout:15000});
      await pg.waitForTimeout(1000);
      assert.equal(dls,before2,'an export overtaken by a new result publishes nothing');
      assert.equal(await pg.evaluate(i=>!!document.querySelector('a.plot-export-fallback[data-card-id="'+i+'"]'),id('png')),false,'and leaves no link');
      pg.off('download',count);
    }
    // 4k. (Astra round 2, P1) Plotly's own camera downloads whatever is drawn when its
    //     conversion ends, unchecked: a Canvas card does not offer it (eager cards: section 6).
    //     The Team export bar stays.
    {
      const pg=again.page;
      const cam=await pg.evaluate(i=>{const el=document.getElementById(i);return {camera:!!el.querySelector('.modebar-btn[data-title^="Download plot"],.modebar-btn[data-attr="toImage"]'),removed:(el._context&&el._context.modeBarButtonsToRemove)||[],modebar:!!el.querySelector('.modebar'),bar:!!el.closest('.tc-node').querySelector('.plot-export-button')};},id('png'));
      assert.equal(cam.camera,false,'a mounted lazy card has no Plotly camera');
      assert.ok(cam.removed.includes('toImage'),'its config removes toImage');
      assert.ok(cam.modebar&&cam.bar,'its modebar and the Team export bar stay');
    }
    // 4l. (Astra round 2, P2) An equivalent value (same data, same preparation and presentation)
    //     delivered while an export converts is not a new render: the export publishes.
    {
      const pg=again.page;
      await pg.waitForFunction(i=>!document.getElementById(i).classList.contains('recalculating'),id('png'),{timeout:10000});
      // The value as the server sends it (Plotly's render changes the stored object in place).
      await pg.evaluate(i=>{window.pristine=JSON.stringify(Shiny.shinyapp.$values[i]);Shiny.shinyapp.receiveOutput(i,JSON.parse(window.pristine));},id('png'));
      await pg.waitForTimeout(2500);
      let dls=0;const count=()=>{dls++;};pg.on('download',count);
      await pg.evaluate(()=>{const o=Plotly.toImage.bind(Plotly);window.releaseExport=null;window.exportWaiting=false;Plotly.toImage=async function(...a){window.exportWaiting=true;await new Promise(r=>{window.releaseExport=r;});Plotly.toImage=o;return o(...a);};});
      await pg.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click(),id('png'));
      await pg.waitForFunction(()=>window.exportWaiting,null,{timeout:30000});
      await pg.evaluate(i=>Shiny.shinyapp.receiveOutput(i,JSON.parse(window.pristine)),id('png'));
      await pg.evaluate(()=>window.releaseExport());
      for(let t=0;t<30&&!dls;t++)await pg.waitForTimeout(500);
      assert.equal(dls,1,'an export across an equivalent value publishes');
      assert.equal(await pg.evaluate(i=>/Plot changed/.test(document.getElementById(i).closest('.tc-node').querySelector('.plot-export-status')?.textContent||''),id('png')),false,'and is not reported as changed');
      pg.off('download',count);
    }
    // 4f. A new preparation (revision 2) with new data for an unmounted card: mounting draws the
    //     new data and the card settles current (nothing waits forever).
    await again.page.evaluate(([i,nf])=>{const named=eval(nf);window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:2}}));Shiny.shinyapp.receiveOutput(i,named(Shiny.shinyapp.$values[i],' R2'));},[id('csv'),named.toString()]);
    assert.equal(await again.page.evaluate(i=>TeamCanvas.ensureMounted(i),id('csv')),true);
    assert.ok(await again.page.evaluate(i=>document.getElementById(i).data.every(t=>/ R2$/.test(t.name))&&TeamCanvas.cardStatus(i)==='current',id('csv')),'revision 2 drawn and current');
    // 4d. An export of a card that cannot settle (the preparation is not ready): refused.
    await again.page.evaluate(()=>{window.TEAM_CANVAS_LAZY_WAIT_MS=4000;});
    await again.page.evaluate(()=>window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:false,pending:true,running:false,revision:2}})));
    let downloaded=false;again.page.on('download',()=>{downloaded=true;});
    await again.page.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click(),id('png'));
    await again.page.waitForFunction(()=>document.body.innerText.includes('This plot is still updating. Export it again when it has finished.'),null,{timeout:45000,polling:250});
    await again.page.waitForTimeout(1500);
    assert.equal(downloaded,false,'an unsettled card is not exported');
    assert.deepEqual(again.errors,[]);
    assert.deepEqual(await again.page.evaluate(()=>window.TEAM_CANVAS_ASSERT_FAILURES||[]),[],'no capture read an unmounted or unclean card');
    await again.page.close();
  }
  // 7. Right after opening, without scrolling: a save with cards unmounted stores them as
  //    saved; an off-screen card edited while unmounted then exported exports its new data;
  //    exporting every card at once mounts each and exports its current value.
  {
    const third=await open(browser);const pg=third.page;
    await pg.waitForFunction(ids=>ids.every(i=>Shiny.shinyapp.$values[i]!==undefined&&!TeamCanvas.isLive(i)),[id('far'),id('csv'),id('png'),id('end'),id('data')],{timeout:30000});
    await pg.evaluate(()=>TeamCanvas.checkpoint());
    const exported=await new Promise(async res=>{await pg.exposeFunction('reportExport',res);await pg.evaluate(()=>{Shiny.addCustomMessageHandler('test-export',m=>window.reportExport(m));Shiny.setInputValue('test_report_export',Date.now(),{priority:'event'});});});
    const geo=n=>({id:n.id,x:n.x,y:n.y,width:n.width,height:n.height,inputs:{violin_lipid:n.instance.inputs.violin_lipid,color_by:n.instance.inputs.color_by}});
    assert.deepEqual(exported.nodes.map(geo).sort((a,b)=>a.id<b.id?-1:1),state.nodes.map(geo).sort((a,b)=>a.id<b.id?-1:1),'a save with unmounted cards stores every card as saved');
    assert.equal(await pg.evaluate(i=>TeamCanvas.isLive(i),id('far')),false,'saving mounted nothing');
    // Edit an off-screen card (its lipid), then export it at once.
    const before=await pg.evaluate(i=>fpv(Shiny.shinyapp.$values[i].x.data),id('data'));
    await pg.evaluate(()=>Shiny.setInputValue('tcinstance_lazydata-violin_lipid','PE(36:2)'));
    const editDl=pg.waitForEvent('download',{timeout:60000});
    await pg.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click(),id('data'));
    await editDl;
    const edited=await pg.evaluate(i=>({shown:fpv(document.getElementById(i).data),current:fpv(Shiny.shinyapp.$values[i].x.data),lipid:Shiny.shinyapp.$inputValues['tcinstance_lazydata-violin_lipid']}),id('data'));
    assert.ok(edited.shown===edited.current&&edited.current!==before,'the edited off-screen card exported its new data: '+JSON.stringify(edited).slice(0,200));
    // Export every live card at once.
    const all=['near','far','csv','png','end'].map(id);
    const downloads=[];pg.on('download',d=>downloads.push(d.suggestedFilename()));
    await pg.evaluate(ids=>ids.forEach(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click()),all);
    for(let t=0;t<120&&downloads.length<all.length;t++)await pg.waitForTimeout(500);
    assert.equal(downloads.length,all.length,'every card exported: '+downloads.join(','));
    assert.ok(await pg.evaluate(ids=>ids.every(i=>fpv(document.getElementById(i).data)===fpv(Shiny.shinyapp.$values[i].x.data)),all),'each export shows the current value');
    assert.deepEqual(await pg.evaluate(()=>window.TEAM_CANVAS_ASSERT_FAILURES||[]),[],'no capture read an unmounted or unclean card');
    assert.deepEqual(third.errors,[]);
    await pg.close();
  }
  // 6. Lazy drawing off: every card draws at once.
  const eager=await open(browser,'?team_canvas_lazy=0');
  await eager.page.waitForFunction(ids=>ids.every(i=>drawn(i)),['near','far','csv','png','end'].map(id),{timeout:60000});
  const eagerSaved=await eager.page.evaluate(()=>TeamCanvas.serialize());
  assert.deepEqual(eagerSaved.nodes.map(savedPart),lazySaved.nodes.map(savedPart),'the saved state is the same with lazy drawing off');
  // (Astra round 2, P1) Eager cards do not offer Plotly's camera either.
  assert.ok(await eager.page.evaluate(ids=>ids.every(i=>{const el=document.getElementById(i);return !!el.querySelector('.modebar')&&!el.querySelector('.modebar-btn[data-title^="Download plot"],.modebar-btn[data-attr="toImage"]')&&el._context.modeBarButtonsToRemove.includes('toImage');}),['near','far','csv','png','end'].map(id)),'eager cards have no Plotly camera');
  // (Astra round 2, P2) Eager too: an equivalent value during an export does not discard it.
  {
    const pg=eager.page;let dls=0;const count=()=>{dls++;};pg.on('download',count);
    await pg.evaluate(i=>{window.pristine=JSON.stringify(Shiny.shinyapp.$values[i]);Shiny.shinyapp.receiveOutput(i,JSON.parse(window.pristine));},id('near'));
    await pg.waitForTimeout(2500);
    await pg.evaluate(()=>{const o=Plotly.toImage.bind(Plotly);window.releaseExport=null;window.exportWaiting=false;Plotly.toImage=async function(...a){window.exportWaiting=true;await new Promise(r=>{window.releaseExport=r;});Plotly.toImage=o;return o(...a);};});
    await pg.evaluate(i=>[...document.getElementById(i).closest('.tc-node').querySelectorAll('.plot-export-button')].find(x=>x.textContent==='PNG').click(),id('near'));
    await pg.waitForFunction(()=>window.exportWaiting,null,{timeout:30000});
    await pg.evaluate(i=>Shiny.shinyapp.receiveOutput(i,JSON.parse(window.pristine)),id('near'));
    await pg.evaluate(()=>window.releaseExport());
    for(let t=0;t<30&&!dls;t++)await pg.waitForTimeout(500);
    assert.equal(dls,1,'an eager export across an equivalent value publishes');
    pg.off('download',count);
  }
  assert.deepEqual(eager.errors,[]);
  console.log('PASS: off-screen restored Plotly copies stay unbound (placeholder, aria-busy, values kept by Shiny) and mount once near the view with no layout shift (CLS '+cls.toFixed(4)+'); mounting draws only the current value (new data, B then C, revision 2: never the restore value or an intermediate one); an error shows as an error and is never exported; an export asked while the server recalculates waits and exports the new value; overlapping renders export the latest; PNG, CSV and Finish mount first; a finished card in view stays an image until Edit; an export that cannot settle is refused; saved state identical before/after mounting and with lazy off; right after opening: a save with cards unmounted stores them as saved, an off-screen card edited then exported exports its new data, exporting every card at once exports each current value; assert mode saw no capture of an unmounted or unclean card; Canvas cards (eager and lazy) offer no Plotly camera; an equivalent value during an export does not discard it (eager and lazy); a rotated ragged heatmap can be clean; Group Comparison data and statistics display changes break export tokens');
 }finally{await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
