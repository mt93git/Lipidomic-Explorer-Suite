// Mock browser regression: real Team DOM/CSS/handlers and export downloads; deterministic Plotly.
// Run with: node tests/dual-ui/test_team_canvas_zoom_transform.cjs
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('../browser/ci/node_modules/playwright');
const F=require('./fixture_team_overlay_pages.cjs');
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    // App cascade, including the actual shell and companion, at both reported desktop widths.
    for(const width of [1280,1440]){
      const p=await browser.newPage({viewport:{width,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
      await F.install(p);await F.setupWorkspace(p);
      let anchor=null;
      for(const z of [.25,.5,1,1.25,1.5,2]){
        await p.evaluate(z=>TeamCanvasViewport.setScale(z),z);await frames(p);
        const result=await p.evaluate(()=>{
          const nav=document.querySelector('.tc-navigation'),pill=nav.querySelector('.tc-zoom-controls'),map=nav.querySelector('.tc-map'),board=document.querySelector('.tc-board');
          const nr=nav.getBoundingClientRect(),sr=nav.parentElement.getBoundingClientRect(),cs=getComputedStyle(nav);
          const b=nav.querySelector('.tc-zoom-reset'),br=b.getBoundingClientRect();
          return {outside:!board.contains(nav)&&nav.parentElement.classList.contains('tc-viewport-shell'),inside:nr.left>=sr.left&&nr.right<=sr.right&&nr.top>=sr.top&&nr.bottom<=sr.bottom&&nr.left>=0&&nr.right<=innerWidth&&nr.top>=0&&nr.bottom<=innerHeight,
            shown:cs.visibility==='visible'&&+cs.opacity>0&&pill.getBoundingClientRect().width>0&&map.getBoundingClientRect().width>0,hit:b.contains(document.elementFromPoint(br.x+br.width/2,br.y+br.height/2)),box:nr.toJSON(),scale:TeamCanvasViewport.scale};
        });
        assert(result.outside&&result.inside&&result.shown&&result.hit,`${width}@${z}: ${JSON.stringify(result)}`);
        const position=[result.box.left,result.box.top,result.box.width,result.box.height];
        if(anchor)assert(position.every((v,i)=>Math.abs(v-anchor[i])<1),`zoom keeps screen chrome stationary: ${JSON.stringify([anchor,position])}`);else anchor=position;
      }
      assert.deepEqual(errors,[]);await p.close();
    }
    const p=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    const ids=Array.from({length:16},(_,i)=>i?'mock_zoom_'+i:'results_dashboard-plot_pca');
    await p.setContent(`<body class="ts-shell-app"><section id="team-canvas-root" class="ts-shell"><div class="tc-layout tc-library-hidden"><aside class="tc-catalog"><input class="tc-search"><div class="tc-list"></div></aside><div class="tc-main"><div class="tc-toolbar"><button class="tc-library-toggle">Library</button><button class="tc-reset">Return all</button><button class="tc-arrange">Arrange</button></div><div class="tc-scroll"><div class="tc-board"><div class="tc-empty"></div></div></div><p class="tc-status"></p></div><aside class="ts-inspector-column"></aside></div></section>${ids.map(id=>`<div class="rd-card"><h3>${id}</h3><div id="${id}" class="plotly html-widget-output js-plotly-plot" style="height:400px"></div></div>`).join('')}</body>`);
    for(const name of ['canvas','canvas_viewport','shell','card_figure','card_frame'])await p.addStyleTag({path:'www/team/css/'+name+'.css'});
    await p.evaluate(()=>{
      window.plotCalls=0;window.fitCalls=0;window.longTasks=[];
      new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false});
      document.querySelectorAll('.js-plotly-plot').forEach(g=>{g.data=[{type:'scatter',x:[1,2],y:[3,4]}];g.layout={width:600,height:400,autosize:false};g._fullLayout={width:600,height:400};});
      window.Plotly={Plots:{resize:g=>{plotCalls++;return Promise.resolve(g);}},relayout:(g,u)=>{plotCalls++;Object.assign(g.layout,u);Object.assign(g._fullLayout,u);return Promise.resolve(g);},restyle:()=>Promise.resolve(),
        toImage:async(g,o)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}"><text>${JSON.stringify(g.data)}</text></svg>`)};
    });
    for(const name of ['canvas_viewport','plot_exports','canvas','card_figure','card_frame'])await p.addScriptTag({path:'www/team/js/'+name+'.js'});
    await p.evaluate(ids=>ids.forEach(id=>{if(!TeamCanvas.addPlot(id))throw Error('Could not mount '+id);}),ids);
    await p.waitForTimeout(600);await frames(p);
    const timing=await p.evaluate(async()=>{
      const orig=TeamCanvas.fitAllPlots;TeamCanvas.fitAllPlots=function(){fitCalls++;return orig.apply(this,arguments);};plotCalls=0;longTasks=[];
      const checkpoint=JSON.stringify(TeamCanvas.serialize()),out=[];
      for(const z of [.5,1,1.25,1.5,2,.25,.5,1,1.25,1.5,2]){
        const t=performance.now();TeamCanvasViewport.setScale(z);const handlerMs=performance.now()-t;
        await new Promise(requestAnimationFrame);out.push({z,handlerMs,frameMs:performance.now()-t});
      }
      return {out,checkpointUnchanged:checkpoint===JSON.stringify(TeamCanvas.serialize())};
    });
    await p.waitForTimeout(500);
    const costs=await p.evaluate(()=>({fitCalls,plotCalls,longTasks}));
    assert(timing.checkpointUnchanged,'camera never changes checkpoint geometry or data');
    assert.equal(costs.fitCalls,0,'no idle refit of any card');assert.equal(costs.plotCalls,0,'no Plotly resize or relayout while zooming or after idle');
    assert(timing.out.every(t=>t.handlerMs<50&&t.frameMs<50),JSON.stringify(timing.out));assert(costs.longTasks.every(ms=>ms<=100),JSON.stringify(costs));
    console.log('Browser zoom timings (ms)',JSON.stringify(timing.out),'long tasks',JSON.stringify(costs.longTasks));
    // Header dragging, resize capture, scroll during dragging, keyboard movement and minimap camera math.
    for(const z of [.5,1,1.25,1.5,2]){
      await p.evaluate(z=>{TeamCanvasViewport.setScale(z);const s=document.querySelector('.tc-scroll'),n=document.querySelector('.tc-node');n.style.left='100px';n.style.top='100px';n.style.width='620px';n.style.height='380px';s.scrollLeft=0;s.scrollTop=0;},z);await frames(p);
      const node=p.locator('.tc-node').first(),head=node.locator('.tc-node-head'),before=await node.evaluate(n=>({x:n.offsetLeft,y:n.offsetTop})),b=await head.boundingBox();
      await p.mouse.move(b.x+30*z,b.y+10*z);await p.mouse.down();await p.mouse.move(b.x+30*z+80,b.y+10*z+40,{steps:4});await p.mouse.up();
      const after=await node.evaluate(n=>({x:n.offsetLeft,y:n.offsetTop}));assert(Math.abs(after.x-before.x-80/z)<2);assert(Math.abs(after.y-before.y-40/z)<2);
      await head.focus();await p.keyboard.press('ArrowRight');assert(Math.abs(await node.evaluate(n=>n.offsetLeft)-after.x-10)<2,'keyboard move is in world coordinates');
      // Keep bottom-right in view even at 200% so the browser tests actual handle hit-testing.
      await p.evaluate(()=>{const n=document.querySelector('.tc-node');n.style.width='340px';n.style.height='260px';});await frames(p);
      const handle=node.locator('.tc-node-resize'),hr=await handle.boundingBox(),size=await node.evaluate(n=>({w:n.offsetWidth,h:n.offsetHeight}));
      await p.mouse.move(hr.x+hr.width/2,hr.y+hr.height/2);await p.mouse.down();await p.mouse.move(hr.x+hr.width/2+40,hr.y+hr.height/2+30,{steps:4});await p.mouse.up();
      const resized=await node.evaluate(n=>({w:n.offsetWidth,h:n.offsetHeight}));assert(Math.abs(resized.w-size.w-40/z)<2);assert(Math.abs(resized.h-size.h-30/z)<2);
      const map=await p.evaluate(()=>{const s=document.querySelector('.tc-scroll'),m=document.querySelector('.tc-map-window');return {x:+m.getAttribute('x'),width:+m.getAttribute('width'),sx:s.scrollLeft,w:s.clientWidth,z:TeamCanvasViewport.scale};});assert(Math.abs(map.x-map.sx/map.z)<1);assert(Math.abs(map.width-map.w/map.z)<1);
    }
    // Actual plot_exports.js download path, comparing file bytes at each zoom, without a round trip.
    const bytes=[];
    for(const z of [.5,1,1.5]){
      await p.evaluate(z=>TeamCanvasViewport.setScale(z),z);await frames(p);
      const download=p.waitForEvent('download');
      await p.evaluate(()=>document.querySelector('.tc-node .plot-export-bar button[aria-label^="Download SVG"]').click());
      const file=await download;bytes.push(fs.readFileSync(await file.path()));
    }
    assert(bytes.every(b=>b.equals(bytes[0])),'export bytes identical at 50/100/150%');assert.deepEqual(errors,[]);
    console.log('PASS browser mock: controls at 25–200% / 1280 & 1440; drag, resize, minimap, shortcuts; zoom <50ms, no task >100ms; identical export bytes');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
