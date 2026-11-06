// Mock browser regression: Save while added plots are still Generating (no server reply yet) must keep them.
// Before the fix, collectState held only mounted cards, so a checkpoint saved during the ~30-50 s a new copy
// takes to mount lost every Generating card (staging repro 2026-11-06: 7 adds, 2 saved).
// Real Team DOM/CSS/handlers with a mocked Shiny server, real pointer clicks. Chromium and WebKit.
// Run with: node tests/dual-ui/test_team_canvas_save_generating.cjs
const assert=require('node:assert/strict');
const pw=require('../browser/ci/node_modules/playwright');
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
const SOURCE='results_dashboard-plot_pca',NAME='Principal components';
async function run(type){
  let browser;try{browser=await pw[type].launch({headless:true});}catch(e){if(type==='chromium')throw e;console.log('SKIP '+type+': not installed');return;}
  try{
    for(const z of [1]){
      const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
      await p.setContent(`<body class="ts-shell-app"><section id="team-canvas-root" class="ts-shell"><div class="tc-layout"><aside class="tc-catalog"><input class="tc-search"><div class="tc-list"></div></aside><div class="tc-main"><div class="tc-toolbar"><button class="tc-library-toggle">Library</button><button class="tc-reset">Return all</button><button class="tc-arrange">Arrange</button></div><div class="tc-scroll"><div class="tc-board"><div class="tc-empty"></div></div></div><p class="tc-status"></p></div></div></section><div class="rd-card"><h3>${NAME}</h3><div id="${SOURCE}" class="plotly html-widget-output" style="height:300px"></div></div></body>`);
      for(const name of ['canvas','canvas_viewport','canvas_catalog','shell','card_figure','card_frame','card_status'])await p.addStyleTag({path:'www/team/css/'+name+'.css'});
      await p.evaluate(()=>{
        // The server side, by hand: create requests are recorded; the test answers them.
        window.__created=[];window.__states=[];window.__handlers={};
        window.Shiny={shinyapp:{$socket:{},$inputValues:{},$values:{},$errors:{},$bindings:{}},
          setInputValue:(k,v)=>{if(k==='team_canvas_instance_create')__created.push(v);if(k==='team_canvas_state')__states.push(v);},
          addCustomMessageHandler:(n,f)=>{__handlers[n]=f;},bindAll:()=>Promise.resolve(),unbindAll:()=>{}};
        // jQuery is not loaded here: a stub that only delivers shiny:disconnected (every other jQuery path stays off).
        window.__disconnected=[];const $=()=>({on(n,f){if(n==='shiny:disconnected')__disconnected.push(f);return this;},one(){return this;},trigger(){return this;},data(){},val(){}});$.Event=(t,o)=>Object.assign({type:t},o);window.jQuery=$;
        window.Plotly={Plots:{resize:g=>Promise.resolve(g)},relayout:(g,u)=>Promise.resolve(g),restyle:()=>Promise.resolve()};
      });
      for(const name of ['canvas_viewport','canvas_catalog','canvas','card_figure','card_frame','card_status'])await p.addScriptTag({path:'www/team/js/'+name+'.js'});
      await p.evaluate(z=>{__handlers['team-preparation-state']({ready:true,pending:false,running:false,revision:1});TeamCanvasViewport.setScale(z);},z);
      const tag=`${type}`;
      const clickAdd=async()=>{
        await p.fill('.tc-search','Principal');await frames(p);
        const box=await p.locator(`[data-catalog-action-id="${SOURCE}"]`).boundingBox();assert(box,tag+': catalog Add is shown');
        await p.mouse.click(box.x+box.width/2,box.y+box.height/2);await frames(p);
      };
      const saved=()=>p.evaluate(()=>TeamCanvas.previewState().state.nodes.map(n=>({id:n.id,src:n.instance&&n.instance.source,inst:n.instance&&n.instance.id,x:n.x,y:n.y,w:n.width,h:n.height})));
      // 1. Two adds still Generating (no server reply yet): a save holds both, at their skeleton places.
      await p.evaluate(()=>{window.__changes=0;window.addEventListener('team-canvas-changed',()=>__changes++);});
      await clickAdd();
      assert(await p.evaluate(()=>__changes)>0,tag+': an Add marks the workspace changed at once (autosave runs while it is Generating)');
      await clickAdd();
      assert.equal(await p.locator('.tc-board > .tc-node-placeholder').count(),2,tag+': two Generating cards');
      const created=await p.evaluate(()=>__created.map(v=>({id:v.id,inputs:v.inputs})));
      const places=await p.evaluate(()=>[...document.querySelectorAll('.tc-node-placeholder')].map(n=>[parseFloat(n.style.left),parseFloat(n.style.top),parseFloat(n.style.width),parseFloat(n.style.height)]));
      let nodes=await saved();
      assert.deepEqual(nodes.map(n=>n.id),created.map(c=>c.id+'-plot_pca'),tag+': both Generating copies are in the save');
      assert(nodes.every(n=>n.src===SOURCE),tag+': saved as independent copies of the source');
      assert.deepEqual(nodes.map(n=>[n.x,n.y,n.w,n.h]),places,tag+': saved at the skeleton cards\' places');
      // A real checkpoint (Save) is not refused while they are Generating, and sends both to the server.
      const ck=p.evaluate(()=>TeamCanvas.checkpoint().then(()=>'ok',e=>'refused: '+e.message));
      await p.waitForFunction(()=>__states.length>0,null,{timeout:5000});
      const sent=await p.evaluate(()=>{const v=__states[__states.length-1];__handlers['team-canvas-state-ack']({token:v.token,ok:true});return v.state.nodes.map(n=>n.id);});
      assert.equal(await ck,'ok',tag+': Save is not refused while plots are Generating');
      assert.deepEqual(sent,created.map(c=>c.id+'-plot_pca'),tag+': the saved checkpoint holds both Generating copies');
      // 2. The first mounts: it is saved once (as its card), the second is still held.
      await p.evaluate(source=>{const v=__created[0],suffix=source.slice(source.indexOf('-')+1);
        const host=document.createElement('div');host.id=v.id+'_host';host.className='tc-instance-host';host.innerHTML=`<div id="${v.id}-${suffix}" class="plotly html-widget-output" style="height:300px"></div>`;document.body.appendChild(host);
        __handlers['team-canvas-instance-ready']({id:v.id,request:v.request,inputs:{},generation:1});},SOURCE);
      await p.waitForSelector(`.tc-node[data-plot-id="${created[0].id}-plot_pca"]`,{timeout:5000});
      nodes=await saved();
      assert.deepEqual(nodes.map(n=>n.id).sort(),created.map(c=>c.id+'-plot_pca').sort(),tag+': mounted card saved once, Generating one still saved');
      // 3. The second fails: a failed card is not saved.
      await p.evaluate(()=>{const v=__created[1];__handlers['team-canvas-instance-error']({id:v.id,request:v.request});});await frames(p);
      nodes=await saved();
      assert.deepEqual(nodes.map(n=>n.id),[created[0].id+'-plot_pca'],tag+': failed card left out of the save');
      assert.deepEqual(errors,[],tag+': no page errors');
      await p.close();
    }
    console.log('PASS '+type+': a save taken while added plots are still Generating keeps them (place, source, inputs); mounted once; failed ones left out');
  }finally{await browser.close();}
}
(async()=>{for(const t of ['chromium','webkit'])await run(t);})().catch(e=>{console.error(e);process.exitCode=1;});
