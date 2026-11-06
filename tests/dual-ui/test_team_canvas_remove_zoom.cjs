// Mock browser regression: Remove/Return from a card's ⋯ menu with real pointer clicks at Canvas zoom
// 50% and 150% (zoom is a CSS transform on the board; the card toolbar cancels it with CSS zoom).
// Real Team DOM/CSS/handlers, deterministic Plotly. Runs in Chromium and, when installed, WebKit (Safari).
// Run with: node tests/dual-ui/test_team_canvas_remove_zoom.cjs
const assert=require('node:assert/strict');
const pw=require('../browser/ci/node_modules/playwright');
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
async function run(type){
  let browser;try{browser=await pw[type].launch({headless:true});}catch(e){if(type==='chromium')throw e;console.log('SKIP '+type+': not installed');return;}
  try{
    for(const z of [.5,1.5,1.5625]){for(const kind of ['click','header-focus']){
      const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
      const ids=['mock_rm_1','mock_rm_2','mock_rm_3'];
      await p.setContent(`<body class="ts-shell-app"><section id="team-canvas-root" class="ts-shell"><div class="tc-layout tc-library-hidden"><aside class="tc-catalog"><input class="tc-search"><div class="tc-list"></div></aside><div class="tc-main"><div class="tc-toolbar"><button class="tc-library-toggle">Library</button><button class="tc-reset">Return all</button><button class="tc-arrange">Arrange</button></div><div class="tc-scroll"><div class="tc-board"><div class="tc-empty"></div></div></div><p class="tc-status"></p></div><aside class="ts-inspector-column"></aside></div></section>${ids.map(id=>`<div class="rd-card"><h3>${id}</h3><div id="${id}" class="plotly html-widget-output js-plotly-plot" style="height:400px"></div></div>`).join('')}</body>`);
      for(const name of ['canvas','canvas_viewport','shell','card_figure','card_frame','canvas_feedback'])await p.addStyleTag({path:'www/team/css/'+name+'.css'});
      await p.evaluate(()=>{
        document.querySelectorAll('.js-plotly-plot').forEach(g=>{g.data=[{type:'scatter',x:[1,2],y:[3,4]}];g.layout={width:600,height:400,autosize:false};g._fullLayout={width:600,height:400};});
        window.Plotly={Plots:{resize:g=>Promise.resolve(g)},relayout:(g,u)=>{Object.assign(g.layout,u);Object.assign(g._fullLayout,u);return Promise.resolve(g);},restyle:()=>Promise.resolve(),
          toImage:async(g,o)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}"></svg>`)};
      });
      for(const name of ['canvas_viewport','plot_exports','canvas','card_figure','card_frame','canvas_feedback'])await p.addScriptTag({path:'www/team/js/'+name+'.js'});
      await p.evaluate(ids=>ids.forEach(id=>{if(!TeamCanvas.addPlot(id))throw Error('Could not mount '+id);}),ids);
      await p.waitForTimeout(400);await frames(p);
      // Pan so the second card sits in the middle of the view, then zoom. At 156% its footer (docked ⋯ next to
      // the resize grip, which scales with the card) is centred instead.
      const sel=await p.evaluate(z=>{TeamCanvasViewport.setScale(z);const s=document.querySelector('.tc-scroll'),n=document.querySelectorAll('.tc-board > .tc-node')[1];n.id=n.id||'rm-target';
        s.scrollLeft=Math.max(0,(n.offsetLeft+n.offsetWidth/2)*z-s.clientWidth/2);s.scrollTop=Math.max(0,(n.offsetTop+(z>1.5?n.offsetHeight-60:n.offsetHeight/2))*z-s.clientHeight/2);return '#'+CSS.escape(n.id);},z);
      // The zoom and pan are a camera gesture (ux40): toolbars are hidden until ~150 ms after it.
      await p.waitForFunction(()=>!document.getElementById('team-canvas-root').classList.contains('tc-gesturing'),null,{timeout:3000});await frames(p);
      const card=await p.locator(sel).boundingBox();
      await p.mouse.move(card.x+card.width/2,card.y+card.height/2);await frames(p);
      const centre=async q=>p.evaluate(({sel,q})=>{const el=document.querySelector(sel+' '+q);if(!el)return null;const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,hit:!!hit&&(hit===el||el.contains(hit)),label:el.textContent.trim()};},{sel,q});
      const more=await centre('.tc-card-more');assert(more&&more.hit,`${type} ${kind} @${z}: ⋯ reachable ${JSON.stringify(more)}`);
      await p.mouse.click(more.x,more.y);await frames(p);
      await p.evaluate(sel=>{const b=[...document.querySelectorAll(sel+' .tc-card-menu > button')].find(b=>/^(Remove|Return)$/.test(b.textContent.trim()));if(b)b.dataset.rmTest='1';},sel);
      // Safari focuses the nearest focusable ancestor (the card header), not the clicked button, on mousedown:
      // 'header-focus' makes that happen in every engine. The open menu must survive it.
      if(kind==='header-focus')await p.evaluate(sel=>document.querySelector(sel+' > .tc-node-head').focus({preventScroll:true}),sel);
      const rm=await centre('[data-rm-test]');assert(rm&&rm.hit,`${type} ${kind} @${z}: Remove/Return is under the pointer ${JSON.stringify(rm)}`);
      await p.mouse.click(rm.x,rm.y);await p.waitForTimeout(700);
      const gone=await p.evaluate(sel=>!document.querySelector(sel),sel);
      assert(gone,`${type} ${kind} @${z}: the card left the canvas`);
      assert.deepEqual(errors,[],`${type} ${kind} @${z}: no page errors`);
      await p.close();
    }}
    console.log('PASS '+type+': ⋯ → Remove/Return removes a card at 50%, 150% and 156% (footer in view), also when focus moves to the card header (Safari)');
  }finally{await browser.close();}
}
(async()=>{for(const t of ['chromium','webkit'])await run(t);})().catch(e=>{console.error(e);process.exitCode=1;});
