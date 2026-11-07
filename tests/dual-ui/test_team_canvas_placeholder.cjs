// Mock browser regression: a chart added from the catalog shows its card at once, at its final place and
// size, with a shimmer skeleton "Generating <name>…"; the mounted card replaces it in place and the plot
// swaps in under the skeleton without moving anything. A redraw (Shiny's recalculating) shows "Updating…".
// A failed request leaves an error state with Retry, which retries in the same place. A lost connection
// (shiny:disconnected) turns a Generating card into that failed state too.
// Real Team DOM/CSS/handlers with a mocked Shiny server, real pointer clicks, Canvas zoom 50/100/150 %.
// Runs in Chromium and, when installed, WebKit (Safari).
// Run with: node tests/dual-ui/test_team_canvas_placeholder.cjs
const assert=require('node:assert/strict');
const pw=require('../browser/ci/node_modules/playwright');
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
const SOURCE='results_dashboard-plot_pca',NAME='Principal components';
async function run(type){
  let browser;try{browser=await pw[type].launch({headless:true});}catch(e){if(type==='chromium')throw e;console.log('SKIP '+type+': not installed');return;}
  try{
    for(const z of [.5,1,1.5]){
      const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
      await p.setContent(`<body class="ts-shell-app"><section id="team-canvas-root" class="ts-shell"><div class="tc-layout"><aside class="tc-catalog"><input class="tc-search"><div class="tc-list"></div></aside><div class="tc-main"><div class="tc-toolbar"><button class="tc-library-toggle">Library</button><button class="tc-reset">Return all</button><button class="tc-arrange">Arrange</button></div><div class="tc-scroll"><div class="tc-board"><div class="tc-empty"></div></div></div><p class="tc-status"></p></div></div></section><div class="rd-card"><h3>${NAME}</h3><div id="${SOURCE}" class="plotly html-widget-output" style="height:300px"></div></div></body>`);
      for(const name of ['canvas','canvas_viewport','canvas_catalog','shell','card_figure','card_frame','card_status'])await p.addStyleTag({path:'www/team/css/'+name+'.css'});
      await p.evaluate(()=>{
        // The server side, by hand: create requests are recorded; the test answers them.
        window.__created=[];window.__handlers={};
        window.Shiny={shinyapp:{$socket:{},$inputValues:{},$values:{},$errors:{},$bindings:{}},
          setInputValue:(k,v)=>{if(k==='team_canvas_instance_create')__created.push(v);},
          addCustomMessageHandler:(n,f)=>{__handlers[n]=f;},bindAll:()=>Promise.resolve(),unbindAll:()=>{}};
        // jQuery is not loaded here: a stub that only delivers shiny:disconnected (every other jQuery path stays off).
        window.__disconnected=[];const $=()=>({on(n,f){if(n==='shiny:disconnected')__disconnected.push(f);return this;},one(){return this;},trigger(){return this;},data(){},val(){}});$.Event=(t,o)=>Object.assign({type:t},o);window.jQuery=$;
        window.Plotly={Plots:{resize:g=>Promise.resolve(g)},relayout:(g,u)=>Promise.resolve(g),restyle:()=>Promise.resolve()};
      });
      for(const name of ['canvas_viewport','canvas_catalog','canvas','card_figure','card_frame','card_status'])await p.addScriptTag({path:'www/team/js/'+name+'.js'});
      await p.evaluate(z=>{__handlers['team-preparation-state']({ready:true,pending:false,running:false,revision:1});TeamCanvasViewport.setScale(z);},z);
      const tag=`${type} @${z*100}%`;
      // The catalog's Add for the chart, by real pointer.
      const clickAdd=async()=>{
        await p.fill('.tc-search','Principal');await frames(p);
        const box=await p.locator(`[data-catalog-action-id="${SOURCE}"]`).boundingBox();assert(box,tag+': catalog Add is shown');
        await p.mouse.click(box.x+box.width/2,box.y+box.height/2);
      };
      const geometry=sel=>p.evaluate(sel=>{const n=document.querySelector(sel);return n&&{left:n.style.left,top:n.style.top,width:n.offsetWidth,height:n.offsetHeight};},sel);
      const skeleton=sel=>p.evaluate(sel=>{const s=document.querySelector(sel+' .tc-card-skeleton');return s?s.textContent.trim():null;},sel);
      // Answers the latest create request: its host and output arrive, then the ready message.
      const answer=()=>p.evaluate(source=>{const v=__created[__created.length-1],suffix=source.slice(source.indexOf('-')+1);
        const host=document.createElement('div');host.id=v.id+'_host';host.className='tc-instance-host';host.innerHTML=`<div id="${v.id}-${suffix}" class="plotly html-widget-output" style="height:300px"></div>`;document.body.appendChild(host);
        __handlers['team-canvas-instance-ready']({id:v.id,request:v.request,inputs:{},generation:1});return v.id+'-'+suffix;},SOURCE);

      // 1. Click: the card shows at once (before any server reply) with the skeleton.
      await clickAdd();await frames(p);
      assert.equal(await p.locator('.tc-board > .tc-node-placeholder').count(),1,tag+': skeleton card shown at once');
      assert.equal(await skeleton('.tc-node-placeholder'),'Generating '+NAME+'…',tag+': Generating text');
      const placed=await geometry('.tc-node-placeholder');
      // 2. The copy mounts: its card takes the skeleton card's place and size, still Generating.
      const id=await answer();const card=`.tc-node[data-plot-id="${id}"]`;
      await p.waitForSelector(card,{timeout:5000});await frames(p);
      assert.equal(await p.locator('.tc-node-placeholder').count(),0,tag+': skeleton card replaced');
      assert.deepEqual(await geometry(card),placed,tag+': card opens exactly where the skeleton card was');
      await p.waitForFunction(sel=>{const s=document.querySelector(sel+' .tc-card-skeleton');return s&&s.textContent.trim().indexOf('Generating')===0;},card,{timeout:4000});
      const outputBefore=await p.evaluate(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.left,r.top,r.width,r.height];},id);
      // 3. The plot arrives: the skeleton goes, nothing moves.
      await p.evaluate(id=>{const g=document.getElementById(id);g.classList.add('js-plotly-plot');g.data=[{type:'scatter',x:[1,2],y:[3,4]}];g._fullLayout={width:600,height:300};g.innerHTML='<svg class="main-svg" width="600" height="300"></svg>';},id);
      await p.waitForFunction(sel=>!document.querySelector(sel+' .tc-card-skeleton'),card,{timeout:4000});
      assert.deepEqual(await geometry(card),placed,tag+': card unchanged when the plot arrives');
      assert.deepEqual(await p.evaluate(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.left,r.top,r.width,r.height];},id),outputBefore,tag+': plot area did not reflow');
      // 4. A redraw (a parameter change): Updating… over the plot, gone when it finishes.
      await p.evaluate(id=>document.getElementById(id).classList.add('recalculating'),id);
      await p.waitForFunction(sel=>{const s=document.querySelector(sel+' .tc-card-skeleton');return s&&s.textContent.trim()==='Updating…';},card,{timeout:4000});
      assert.deepEqual(await geometry(card),placed,tag+': Updating keeps the card in place');
      // The skeleton is not card chrome: the inspector's Data tab (TeamCardFigure.chrome) never takes it.
      assert.deepEqual(await p.evaluate(sel=>{const n=document.querySelector(sel),s=n.querySelector('.tc-card-skeleton');return [TeamCardFigure.chrome(n).includes(s),s.classList.contains('tc-figure-chrome'),s.inert];},card),[false,false,false],tag+': Updating skeleton is not moved to the inspector');
      await p.evaluate(id=>document.getElementById(id).classList.remove('recalculating'),id);
      await p.waitForFunction(sel=>!document.querySelector(sel+' .tc-card-skeleton'),card,{timeout:4000});

      // 5. A failed add: error state with Retry, in the card; Retry reuses the same place.
      await clickAdd();await frames(p);
      const failedPlace=await geometry('.tc-node-placeholder');
      assert.notDeepEqual(failedPlace,placed,tag+': second card takes a free place');
      await p.evaluate(()=>{const v=__created[__created.length-1];__handlers['team-canvas-instance-error']({id:v.id,request:v.request});});
      await frames(p);
      assert.equal(await p.locator('.tc-node-placeholder.is-failed').count(),1,tag+': error state shown');
      assert.match(await skeleton('.tc-node-placeholder'),/^Could not generate Principal components\./,tag+': error text');
      const retry=await p.evaluate(()=>{const b=[...document.querySelectorAll('.tc-node-placeholder .tc-card-skeleton > button')].find(b=>b.textContent==='Retry');const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,hit:hit===b};});
      assert(retry.hit,tag+': Retry is under the pointer');
      const requests=await p.evaluate(()=>__created.length);
      await p.mouse.click(retry.x,retry.y);await frames(p);
      assert.equal(await p.evaluate(()=>__created.length),requests+1,tag+': Retry sends a new request');
      assert.equal(await p.locator('.tc-node-placeholder:not(.is-failed)').count(),1,tag+': back to Generating');
      assert.equal(await skeleton('.tc-node-placeholder'),'Generating '+NAME+'…',tag+': Generating again');
      assert.deepEqual(await geometry('.tc-node-placeholder'),failedPlace,tag+': Retry keeps the place');
      const id2=await answer();await p.waitForSelector(`.tc-node[data-plot-id="${id2}"]`,{timeout:5000});
      assert.deepEqual(await geometry(`.tc-node[data-plot-id="${id2}"]`),failedPlace,tag+': retried card opens in that place');

      // 6. The connection drops while a card is Generating: it shows the failed state (Retry, Remove), not a ghost.
      await clickAdd();await frames(p);
      assert.equal(await p.locator('.tc-node-placeholder:not(.is-failed)').count(),1,tag+': Generating before the disconnect');
      await p.evaluate(()=>__disconnected.forEach(f=>f()));await frames(p);
      assert.equal(await p.locator('.tc-node-placeholder.is-failed').count(),1,tag+': disconnect fails the Generating card');
      assert.match(await skeleton('.tc-node-placeholder'),/^Could not generate Principal components\./,tag+': failed text after disconnect');
      assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('.tc-node-placeholder .tc-card-skeleton > button')].map(b=>b.textContent)),['Retry','Remove'],tag+': Retry and Remove after disconnect');
      await p.locator('.tc-node-placeholder .tc-card-skeleton > button',{hasText:'Remove'}).click();await frames(p);
      assert.equal(await p.locator('.tc-node-placeholder').count(),0,tag+': Remove clears it');
      assert.deepEqual(errors,[],tag+': no page errors');
      await p.close();
    }
    console.log('PASS '+type+': catalog Add shows a Generating skeleton card at once in its final place; the plot swaps in with no reflow; Updating… on redraw; failure and a lost connection show Retry/Remove in the card (zoom 50/100/150%)');
  }finally{await browser.close();}
}
(async()=>{for(const t of ['chromium','webkit'])await run(t);})().catch(e=>{console.error(e);process.exitCode=1;});
