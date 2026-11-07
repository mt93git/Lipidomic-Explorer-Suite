// Opening a restored Canvas shows one "Preparing your canvas" dialog (the Team busy dialog,
// canvas.js gate*, busy_presentation.js renderOpening) instead of cards appearing one by one:
//  1. Restored while the Canvas is hidden (Review), then shown: the dialog opens with
//     "Preparing your canvas · n of N figures", the Canvas is aria-busy, the count only goes up,
//     and the dialog closes once every figure is mounted and the cards in view are drawn. The
//     "awaiting their analysis" message never shows while it is open; a saved plot whose analysis
//     is missing is reported once afterwards, in plain words.
//  2. Leaving and showing the Canvas again (same restore): no dialog.
//  3. A card in view that never settles: the dialog closes on its own after about 60 s.
//  4. A lost connection closes it at once; a failed restore does not open it (its Retry shows);
//     another operation failing in the dialog, or a figure error (mounted or not yet), closes it at once; a new restore
//     while it is up is covered by the same dialog.
// Screenshots of the dialog and of the ready Canvas: SHOTS env (a directory), when set.
const {chromium}=require('../browser/ci/node_modules/playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const port=45000+Math.floor(Math.random()*900);
const make=(k,lipid,color,x,y)=>({id:'tcinstance_gate'+k+'-plot_violin',label:'Figure '+k,x,y,width:420,height:380,visual:{background:'#eef3fa'},finished:null,instance:{id:'tcinstance_gate'+k,source:'results_dashboard-plot_violin',inputs:{violin_lipid:lipid,color_by:color}}});
const lipids=['PC(34:1)','PE(36:2)','TG(50:1)'];
const cards=[...Array(7)].map((_,i)=>make(String.fromCharCode(97+i),lipids[i%3],i%2?'Group2':'Group1',30+(i%4)*450,30+Math.floor(i/4)*420));
// A saved plot whose analysis is not available in this session (it waits, never mounts).
const gone={id:'gone_tab-gonePlot',label:'Gone plot',x:1830,y:450,width:420,height:380,visual:{},finished:null};
const state={version:'1',libraryHidden:false,nodes:[...cards,gone]};
async function open(browser){
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(()=>window.TeamCanvas&&window.TeamBusy&&window.Shiny?.shinyapp?.isConnected()&&Shiny.shinyapp.$inputValues['results_dashboard-violin_lipid']);
  await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}}));
    window.restoreEvents=[];window.addEventListener('team-canvas-restore-status',e=>restoreEvents.push(e.detail.status));
    window.drawn=id=>{const el=document.getElementById(id);const gd=el&&(el.classList.contains('js-plotly-plot')?el:el.querySelector('.js-plotly-plot'));return !!(gd&&gd.data&&gd._fullLayout);};
    // What the person sees, every 50 ms: the dialog, its title and count, the Canvas busy state, the status pill.
    window.seen=[];const root=document.getElementById('team-canvas-root');
    setInterval(()=>{const d=document.getElementById('team-foreground');seen.push({t:performance.now(),open:!!(d&&d.open),title:d&&d.open?(d.querySelector('h2')||{}).textContent:'',phase:d&&d.open?((d.querySelector('.tbp-phase')||{}).textContent||''):'',live:d?((d.querySelector('.tbp-live')||{}).textContent||''):'',busy:root.getAttribute('aria-busy'),status:(root.querySelector('.tc-status')||{}).textContent||''});},50);
    window.statusTexts=[];new MutationObserver(()=>{const s=root.querySelector('.tc-status');statusTexts.push({t:performance.now(),open:!!document.getElementById('team-foreground')?.open,text:s?s.textContent:''});}).observe(root,{subtree:true,childList:true,characterData:true});
  });
  return {page,errors};
}
const hide=page=>page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='none';});
const reveal=page=>page.evaluate(()=>{document.getElementById('team-canvas-root').style.display='';});
const restore=(page,st)=>page.evaluate(s=>Shiny.setInputValue('test_import_state',s,{priority:'event'}),st);
(async()=>{
  const app=spawn('Rscript',['--vanilla',path.join(__dirname,'fixture_team_canvas_open_gate_app.R')],{env:{...process.env,TEAM_OPEN_GATE_PORT:String(port)},stdio:['ignore','ignore','pipe']});
  let log='';app.stderr.on('data',d=>{log+=d;});
  const browser=await chromium.launch();
  try{
    for(let i=0;i<120;i++){try{const r=await fetch(`http://127.0.0.1:${port}/`);if(r.ok)break;}catch(e){}await new Promise(r=>setTimeout(r,500));}
    // 1. Restored on a hidden Canvas, then shown.
    const {page,errors}=await open(browser);
    await hide(page);await restore(page,state);
    await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>document.getElementById('team-foreground').open),false,'nothing shows while the Canvas is hidden');
    const shownAt=await page.evaluate(()=>performance.now());
    await reveal(page);
    await page.waitForFunction(()=>document.getElementById('team-foreground').open,null,{timeout:3000});
    if(process.env.SHOTS){await page.waitForFunction(()=>/ of \d+ figures/.test(document.querySelector('#team-foreground .tbp-phase')?.textContent||''),null,{timeout:10000});await page.screenshot({path:path.join(process.env.SHOTS,'canvas-preparing.png')});}
    await page.waitForFunction(()=>!document.getElementById('team-foreground').open,null,{timeout:70000,polling:50});
    const closedAt=await page.evaluate(()=>performance.now());
    await page.waitForTimeout(800);
    if(process.env.SHOTS)await page.screenshot({path:path.join(process.env.SHOTS,'canvas-ready.png')});
    const seen=await page.evaluate(t0=>seen.filter(s=>s.t>=t0),shownAt);
    const opened=seen.filter(s=>s.open);
    assert.ok(opened.length>0,'the dialog opened');
    assert.ok(opened.every(s=>s.title==='Preparing your canvas…'),'its title: '+[...new Set(opened.map(s=>s.title))]);
    assert.ok(opened.every(s=>s.busy==='true'),'the Canvas is aria-busy while it is open');
    assert.ok(opened.some(s=>s.live==='Preparing your canvas'),'the polite live region names it');
    const counts=opened.map(s=>s.phase.match(/^Preparing your canvas · (\d+) of (\d+) figures$/)).filter(Boolean).map(m=>[+m[1],+m[2]]);
    assert.ok(counts.length>0,'the count shows: '+[...new Set(opened.map(s=>s.phase))].join(' | '));
    assert.ok(counts.every(c=>c[1]===state.nodes.length),'of every saved figure ('+state.nodes.length+')');
    assert.ok(counts.every((c,i)=>i===0||c[0]>=counts[i-1][0]),'the count never goes back');
    const distinct=[...new Set(counts.map(c=>c[0]))];
    assert.ok(distinct.length>=2&&distinct[distinct.length-1]>distinct[0],'the count advances: '+distinct.join(','));
    // Ready: every figure mounted and every card in view drawn when it closed.
    const ready=await page.evaluate(ids=>({drawn:ids.filter(i=>!drawn(i)),pending:TeamCanvas.restoreProgress().pending,busy:document.getElementById('team-canvas-root').getAttribute('aria-busy')}),cards.map(c=>c.id));
    assert.deepEqual(ready.drawn,[],'every card in view is drawn when the dialog closes');
    assert.equal(ready.pending,1,'only the plot whose analysis is missing is still pending');
    assert.equal(ready.busy,null,'the Canvas is no longer aria-busy');
    // The "awaiting" message: never under the dialog, once afterwards, in plain words.
    const texts=await page.evaluate(()=>statusTexts);
    assert.ok(texts.every(s=>!/awaiting their analysis/.test(s.text)),'the old "awaiting their analysis" toast never shows');
    assert.ok(texts.filter(s=>s.open).every(s=>!/appear once their analysis is ready/.test(s.text)),'no awaiting message while the dialog is open');
    const statusNow=await page.evaluate(()=>document.querySelector('#team-canvas-root .tc-status').textContent);
    assert.equal(statusNow,'Some saved figures will appear once their analysis is ready: Gone plot.','reported once afterwards, in plain words');
    // 2. Leaving and showing the Canvas again: no dialog.
    const leaveAt=await page.evaluate(()=>performance.now());
    await hide(page);await page.waitForTimeout(400);await reveal(page);await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(t0=>seen.some(s=>s.t>=t0&&s.open),leaveAt),false,'no dialog when the Canvas is shown again after the same restore');
    assert.deepEqual(errors,[]);
    await page.close();
    // 3. A card in view that never settles: the dialog closes on its own after about 60 s.
    {
      const {page,errors}=await open(browser);
      await hide(page);
      await page.evaluate(id=>{new MutationObserver(()=>{const el=document.getElementById(id);if(el&&el.closest('.tc-node')&&!el.classList.contains('recalculating'))el.classList.add('recalculating');}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});},cards[0].id);
      await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      await reveal(page);
      await page.waitForFunction(()=>document.getElementById('team-foreground').open,null,{timeout:3000});
      const t0=Date.now();
      await page.waitForFunction(()=>!document.getElementById('team-foreground').open,null,{timeout:75000,polling:100});
      const held=(Date.now()-t0)/1000;
      assert.ok(held>=58&&held<=64,'closes on its own at the cap (held '+held.toFixed(1)+' s)');
      assert.equal(await page.evaluate(()=>document.getElementById('team-canvas-root').getAttribute('aria-busy')),null);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    // 4a. A lost connection closes it at once.
    {
      const {page,errors}=await open(browser);
      await hide(page);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      await reveal(page);
      await page.waitForFunction(()=>document.getElementById('team-foreground').open&&/Preparing your canvas/.test(document.querySelector('#team-foreground h2').textContent),null,{timeout:3000});
      await page.evaluate(()=>jQuery(document).trigger('shiny:disconnected'));
      await page.waitForFunction(()=>!/Preparing your canvas/.test(document.getElementById('team-foreground').open?document.querySelector('#team-foreground h2').textContent:''),null,{timeout:2000});
      assert.equal(await page.evaluate(()=>document.getElementById('team-canvas-root').getAttribute('aria-busy')),null,'not busy after a lost connection');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    // 4b. A failed restore (a restored copy's analysis fails while the Canvas is hidden): showing
    //     the Canvas then opens no dialog; the restore's Retry shows.
    {
      const {page,errors}=await open(browser);
      await page.evaluate(()=>{window.creates=[];const send=Shiny.setInputValue.bind(Shiny);Shiny.setInputValue=function(name,value,options){if(name==='team_canvas_instance_create')creates.push({id:value.id,request:value.request});return send(name,value,options);};});
      await hide(page);await restore(page,state);
      await page.waitForFunction(()=>creates.length>0,null,{timeout:30000,polling:20});
      await page.evaluate(()=>Shiny.setInputValue('test_instance_error',{id:creates[0].id,request:creates[0].request},{priority:'event'}));
      await page.waitForFunction(()=>restoreEvents.includes('failed'),null,{timeout:30000});
      await reveal(page);await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(()=>seen.some(s=>s.open)),false,'no dialog for a failed restore');
      assert.equal(await page.evaluate(()=>{const b=document.querySelector('#team-canvas-root .tc-restore-retry');return !!b&&!b.hidden;}),true,'the restore Retry shows');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    // 4c. Another operation in the dialog fails while it is up: the dialog gives way at once,
    //     its error shows with Dismiss, and Dismiss leaves nothing blocking.
    const stuck=(page,id)=>page.evaluate(id=>{new MutationObserver(()=>{const el=document.getElementById(id);if(el&&el.closest('.tc-node')&&!el.classList.contains('recalculating'))el.classList.add('recalculating');}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});},id);
    const gateUp=async page=>{await page.waitForFunction(()=>document.getElementById('team-foreground').open&&/Preparing your canvas/.test(document.querySelector('#team-foreground h2').textContent),null,{timeout:5000});};
    {
      const {page,errors}=await open(browser);
      await hide(page);await stuck(page,cards[0].id);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      await reveal(page);await gateUp(page);
      await page.evaluate(()=>{const t=TeamBusy.begin('Opening your saved analysis…');TeamBusy.fail(t,'Your saved analysis could not be opened.');});
      await page.waitForFunction(()=>{const d=document.getElementById('team-foreground');return d.open&&d.classList.contains('has-error')&&TeamBusy.pending()===1;},null,{timeout:2000});
      await page.evaluate(()=>[...document.querySelectorAll('#team-foreground button')].find(b=>b.textContent==='Dismiss').click());
      await page.waitForFunction(()=>!document.getElementById('team-foreground').open,null,{timeout:2000});
      assert.equal(await page.evaluate(()=>document.getElementById('team-canvas-root').getAttribute('aria-busy')),null,'nothing blocks after Dismiss');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    // 4d. A figure shows an error while the dialog is up: it closes at once (the card's error shows).
    {
      const {page,errors}=await open(browser);
      await hide(page);await stuck(page,cards[0].id);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      await reveal(page);await gateUp(page);
      await page.waitForFunction(id=>!!document.getElementById(id)?.closest('.tc-node'),cards[1].id,{timeout:30000});
      const t0=Date.now();
      await page.evaluate(id=>Shiny.shinyapp.receiveError(id,{message:'The analysis failed.',type:null}),cards[1].id);
      await page.waitForFunction(()=>!document.getElementById('team-foreground').open,null,{timeout:3000,polling:50});
      assert.ok(Date.now()-t0<1500,'closed at once on a card error');
      assert.equal(await page.evaluate(()=>document.getElementById('team-canvas-root').getAttribute('aria-busy')),null);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    // 4f. An output error for a restored copy that is not mounted yet (its output still in a
    //     hidden host): the dialog closes at once, as for a DOM error alone; a silent req() does not.
    for(const how of ['event','dom']){
      const {page,errors}=await open(browser);
      await page.evaluate(()=>{window.creates=[];const send=Shiny.setInputValue.bind(Shiny);Shiny.setInputValue=function(name,value,options){if(name==='team_canvas_instance_create')creates.push(value.id);return send(name,value,options);};});
      await hide(page);await stuck(page,cards[0].id);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      await reveal(page);await gateUp(page);
      const pendingId=await page.waitForFunction(()=>{const id=creates.find(i=>!document.querySelector('#'+i+'-plot_violin')?.closest('.tc-node'));return id||false;},null,{timeout:10000,polling:20}).then(h=>h.jsonValue());
      const t0=Date.now();
      await page.evaluate(([id,how])=>{const host=document.createElement('div');host.style.display='none';const el=document.createElement('div');el.id=id+'-plot_violin_probe';host.appendChild(el);document.body.appendChild(host);
        jQuery(el).trigger({type:'shiny:error',error:{message:'',type:['shiny.silent.error']}});
        if(how==='event')jQuery(el).trigger({type:'shiny:error',error:{message:'The analysis failed.',type:null}});else el.className='shiny-output-error';},[pendingId,how]);
      await page.waitForFunction(()=>!document.getElementById('team-foreground').open,null,{timeout:3000,polling:50});
      assert.ok(Date.now()-t0<1500,'closed at once on an error of a copy not mounted yet ('+how+')');
      assert.equal(await page.evaluate(()=>document.getElementById('team-canvas-root').getAttribute('aria-busy')),null);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    {
      // A silent req() alone keeps it open.
      const {page,errors}=await open(browser);
      await hide(page);await stuck(page,cards[0].id);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      await reveal(page);await gateUp(page);
      await page.evaluate(id=>jQuery(document.getElementById(id)||document.body).trigger({type:'shiny:error',error:{message:'',type:['shiny.silent.error']}}),cards[2].id);
      await page.waitForTimeout(1200);
      assert.equal(await page.evaluate(()=>document.getElementById('team-foreground').open),true,'a silent req() does not close the dialog');
      // An output unrelated to this restore fails (event and DOM): the dialog stays.
      await page.evaluate(()=>{const el=document.createElement('div');el.id='analysis_tab-unrelatedPlot';document.body.appendChild(el);jQuery(el).trigger({type:'shiny:error',error:{message:'Unrelated failure.',type:null}});el.className='shiny-output-error';});
      await page.waitForTimeout(1200);
      assert.equal(await page.evaluate(()=>document.getElementById('team-foreground').open),true,'an unrelated output error does not close the dialog');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    // 4c'. Another operation fails and is dismissed at once (before any polling tick): the
    //      dialog still gives way.
    {
      const {page,errors}=await open(browser);
      await hide(page);await stuck(page,cards[0].id);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      await reveal(page);await gateUp(page);
      await page.evaluate(()=>{const t=TeamBusy.begin('Opening your saved analysis…');TeamBusy.fail(t,'Your saved analysis could not be opened.');[...document.querySelectorAll('#team-foreground button')].find(b=>b.textContent==='Dismiss').click();});
      await page.waitForFunction(()=>!document.getElementById('team-foreground').open&&TeamBusy.pending()===0,null,{timeout:2000,polling:50});
      assert.deepEqual(errors,[]);
      await page.close();
    }
    // 4g. An error of a restored figure that is not an independent copy and not mounted (its
    //     output still in its analysis view): the dialog closes at once.
    {
      const {page,errors}=await open(browser);
      await hide(page);await stuck(page,cards[0].id);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      await reveal(page);await gateUp(page);
      await page.evaluate(id=>{const el=document.createElement('div');el.id=id;el.className='shiny-output-error';el.style.display='none';document.body.appendChild(el);},gone.id);
      await page.waitForFunction(()=>!document.getElementById('team-foreground').open,null,{timeout:3000,polling:50});
      assert.deepEqual(errors,[]);
      await page.close();
    }
    // 4e. A new restore while the dialog is up: the same dialog stands for it (it stays open,
    //     never reopens), and showing the Canvas again afterwards opens nothing.
    {
      const {page,errors}=await open(browser);
      await hide(page);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.includes('pending'),null,{timeout:30000});
      const t0=await page.evaluate(()=>performance.now());
      await reveal(page);await gateUp(page);
      await page.waitForTimeout(500);
      await restore(page,state);
      await page.waitForFunction(()=>!document.getElementById('team-foreground').open,null,{timeout:70000,polling:50});
      await page.waitForTimeout(600);
      const opens=await page.evaluate(t0=>{let n=0,prev=false;seen.filter(s=>s.t>=t0).forEach(s=>{if(s.open&&!prev)n++;prev=s.open;});return n;},t0);
      assert.equal(opens,1,'one dialog for both restores');
      // A restore arriving while it fades out: it stays open (no second opening).
      await hide(page);await restore(page,state);
      await page.waitForFunction(()=>restoreEvents.filter(s=>s==='pending').length>=3,null,{timeout:30000});
      const t2=await page.evaluate(()=>performance.now());
      await reveal(page);
      await page.waitForFunction(()=>document.getElementById('team-foreground').classList.contains('tc-gate-closing'),null,{timeout:70000,polling:10});
      await restore(page,state);
      await page.waitForTimeout(400);
      await page.waitForFunction(()=>!document.getElementById('team-foreground').open,null,{timeout:70000,polling:50});
      await page.waitForTimeout(600);
      const opens2=await page.evaluate(t0=>{let n=0,prev=false;seen.filter(s=>s.t>=t0).forEach(s=>{if(s.open&&!prev)n++;prev=s.open;});return n;},t2);
      assert.equal(opens2,1,'a restore during the fade keeps the same dialog');
      const t1=await page.evaluate(()=>performance.now());
      await hide(page);await page.waitForTimeout(400);await reveal(page);await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(t1=>seen.some(s=>s.t>=t1&&s.open),t1),false,'no dialog when shown again after the second restore');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS: one "Preparing your canvas" dialog on first showing a restored Canvas (aria-busy, count of '+state.nodes.length+' figures advancing '+distinct.join('→')+', closed in '+((closedAt-shownAt)/1000).toFixed(1)+' s with every card in view drawn); no "awaiting" toast under it, the missing plot reported once afterwards in plain words; no dialog on showing it again; closes on its own at the 60 s cap, at once on a lost connection; never for a failed restore');
  }finally{await browser.close();app.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
