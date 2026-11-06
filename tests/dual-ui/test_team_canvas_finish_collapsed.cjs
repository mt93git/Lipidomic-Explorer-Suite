// Real Plotly: Finish must never freeze a plot laid out at a collapsed size, and must
// never refuse a figure production accepts unless its frame was actually collapsed.
// Regression for the Synthetic 8 composition card whose checkpoint held a 268x92
// SVG (full-size fonts, "100"/"0" overprinted, zero-height plot area).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const rscript = code => execFileSync('Rscript', ['--vanilla', '-e', code], {encoding:'utf8'}).trim();
// The Team square heatmap geometry, from the production view builder (16 px per group).
const heatView = groups => JSON.parse(rscript(`suppressMessages(library(htmltools)); source("R/frontends/team/results_dashboard.R");
  z <- matrix(seq(-1, 1, length.out = ${3 * groups}), 3, ${groups}, dimnames = list(c("PC 34:1","PE 36:2","TG 52:3"), c("Ctrl","Treated")[seq_len(${groups})]));
  v <- rd_team_heatmap_view(z, rep(5L, ${groups})); v$yaxis$tickvals <- I(v$yaxis$tickvals); v$yaxis$ticktext <- I(v$yaxis$ticktext); v$y <- I(v$y)
  cat(jsonlite::toJSON(v[c("x","y","z","width","height","colorbar","margin","xaxis","yaxis")], auto_unbox = TRUE, digits = NA))`));
const pngOf = (w, h) => rscript(`f <- tempfile(fileext = ".png"); png(f, ${w}, ${h}); par(mar = c(0,0,0,0)); plot.new(); rect(0,0,1,1,col="steelblue"); invisible(dev.off()); cat(base64enc::base64encode(f))`);
(async () => {
  const jquery = rscript('cat(system.file("www/shared/jquery.min.js",package="shiny"))');
  const plotly = rscript('cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))');
  const heat1 = heatView(1), heat2 = heatView(2), smallPng = pngOf(150, 100), bigPng = pngOf(1800, 1400), dpr2Small = pngOf(300, 200), zoomPng = pngOf(110, 70);
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1400,height:1100}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent(`<div class="rd-dashboard"><div class="rd-card"><div id="results_dashboard-plot_comp" class="plotly html-widget-output" style="height:420px"></div></div>
      <div class="rd-card"><div id="results_dashboard-plot_heat" class="plotly html-widget-output" style="height:420px"></div></div></div>
      <div id="analysis"><div id="barchart-barPlotUnfiltered" class="shiny-plot-output" style="height:600px"></div></div>
      <section id="team-canvas-root"><button class="tc-library-toggle"></button><div class="tc-layout"><input class="tc-search"><div class="tc-list"></div><button class="tc-reset"></button><button class="tc-arrange"></button><div class="tc-scroll" style="height:900px"><div class="tc-board"><div class="tc-empty"></div></div></div><div class="tc-status"></div></div></section>`);
    await page.addStyleTag({path:path.resolve('www/team/css/canvas.css')});
    await page.addScriptTag({path:jquery}); await page.addScriptTag({path:plotly});
    const data = [{type:'bar',x:['#1','#2','#3'],y:[60,50,70],name:'TAG'},{type:'bar',x:['#1','#2','#3'],y:[40,50,30],name:'LPC'}];
    const layout = {barmode:'stack',margin:{l:60,r:15,t:10,b:100},yaxis:{title:'Share of selected signal (%)',range:[0,100]},xaxis:{title:'Sample'}};
    await page.evaluate(({data,layout}) => Plotly.newPlot('results_dashboard-plot_comp',data,layout),{data,layout});
    await page.addStyleTag({path:path.resolve('www/team/css/canvas_viewport.css')});
    await page.addScriptTag({path:path.resolve('www/team/js/canvas_viewport.js')});
    await page.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
    await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_comp'));
    const comp = page.locator('.tc-node[data-plot-id="results_dashboard-plot_comp"]');
    async function output(l) { await page.evaluate(async ({data,l}) => {const gd=document.getElementById('results_dashboard-plot_comp');jQuery(gd).trigger({type:'shiny:value',value:{x:{data,layout:l}}});await Plotly.react(gd,data,l);},{data,l}); await page.waitForTimeout(450); }
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:false,running:false,revision:1}})));
    await output(layout);
    await page.evaluate(()=>{window.captures=[];const original=Plotly.toImage;Plotly.toImage=function(gd,opts){window.captures.push({id:gd.id,opts,full:{w:gd._fullLayout.width,h:gd._fullLayout.height,pw:gd._fullLayout._size.w,ph:gd._fullLayout._size.h}});
      const fault=window.toImageFault;window.toImageFault=null;const self=this,args=arguments;
      if(fault==='reject')return Promise.reject(new Error('injected toImage failure'));
      // A card resize lands while the image is being captured.
      if(fault==='resize')return window.realRelayout(gd,{width:500,height:400}).then(()=>{const l=gd.layout;window.newerLayout={autosize:l.autosize==null?null:l.autosize,width:l.width,height:l.height};return original.apply(self,args);});
      return original.apply(this,arguments);};
      // Relayout faults: 'reject' applies the update, then rejects; 'throw' throws synchronously before any change.
      window.realRelayout=Plotly.relayout;window.relayoutFault=null;
      Plotly.relayout=function(gd,update){const f=window.relayoutFault;
        if(f&&update&&update.width===f.width&&(f.autosize===undefined||update.autosize===f.autosize)){window.relayoutFault=null;
          if(f.mode==='throw')throw new Error('injected relayout throw');
          return window.realRelayout.apply(this,arguments).then(()=>{throw new Error('injected relayout rejection');});}
        return window.realRelayout.apply(this,arguments);};});
    const finish = comp.locator('.tc-node-head button',{hasText:'Finish plot'}), edit = comp.locator('.tc-node-head button',{hasText:'Edit'});
    const liveLayout = () => page.evaluate(() => { const l=document.getElementById('results_dashboard-plot_comp').layout; return {autosize:l.autosize==null?null:l.autosize,width:l.width==null?null:l.width,height:l.height==null?null:l.height}; });

    // 1. The live layout collapsed to an on-screen (zoomed) size, as an old zoomed resize left it.
    // The canvas' real logical Plots.resize re-frames it first; the pre-Finish layout is restored.
    const frame=await page.evaluate(async()=>{const gd=document.getElementById('results_dashboard-plot_comp');await Plotly.relayout(gd,{autosize:false,width:268,height:92});return {w:gd.clientWidth,h:gd.clientHeight,fw:gd._fullLayout.width,fh:gd._fullLayout.height};});
    assert.ok(frame.w>400 && frame.h>300 && frame.fw===268 && frame.fh===92,'precondition: logical frame is large, live layout collapsed '+JSON.stringify(frame));
    const before = await liveLayout();
    await finish.click(); await comp.locator('.tc-snapshot img').waitFor();
    const first=await page.evaluate(()=>({capture:window.captures.at(-1),url:TeamCanvas.serialize().nodes[0].finished.url}));
    assert.equal(first.capture.opts.width,frame.w); assert.equal(first.capture.opts.height,frame.h);
    assert.equal(first.capture.full.w,frame.w,'layout relaid out to the logical width before capture');
    assert.ok(first.capture.full.ph>=200,'plot area has real height at capture: '+first.capture.full.ph);
    assert.match(decodeURIComponent(first.url.split(',')[1]),new RegExp('width="'+frame.w+'" height="'+frame.h+'"'),'frozen SVG has the card size');
    // Autosize restored: the capture relayout does not leave its own autosize/width/height behind.
    assert.deepEqual(await liveLayout(), before, 'live layout autosize/width/height restored after capture');

    // The real resize had changed autosize and size before capture.
    assert.equal(await page.evaluate(()=>!!Plotly.Plots.resize.teamLogical), true, 'precondition: the canvas logical resize is installed');

    // From here the logical Plots.resize is held off so that Finish's own relayout and its
    // restore are exercised (an unguarded resize leaves a stale layout in place).
    await edit.click(); await page.waitForTimeout(300);
    await page.evaluate(()=>{window.logicalResize=Plotly.Plots.resize;const held=()=>Promise.resolve();held.teamLogical=true;Plotly.Plots.resize=held;});
    const collapse = () => page.evaluate(async()=>{await window.realRelayout(document.getElementById('results_dashboard-plot_comp'),{autosize:false,width:268,height:92});});
    const statusText = () => page.evaluate(()=>document.querySelector('.tc-status').textContent);
    async function refused(pattern, label) {
      await collapse(); const pre = await liveLayout();
      await finish.click();
      await page.waitForFunction(p=>new RegExp(p).test(document.querySelector('.tc-status').textContent), pattern.source);
      assert.equal(await comp.locator('.tc-snapshot').count(), 0, label+': not finished');
      assert.deepEqual(await liveLayout(), pre, label+': live layout equals the pre-Finish state');
      assert.equal(await finish.isEnabled(), true);
    }
    // F1. The corrective relayout applies its change, then rejects.
    await page.evaluate(w=>{window.relayoutFault={mode:'reject',width:w,autosize:false};}, frame.w);
    await refused(/injected relayout rejection/, 'settle relayout rejects');
    // F2. The corrective relayout throws synchronously.
    await page.evaluate(w=>{window.relayoutFault={mode:'throw',width:w,autosize:false};}, frame.w);
    await refused(/injected relayout throw/, 'settle relayout throws');
    // F3. The restore relayout applies, then rejects: Finish is aborted, never reported as done.
    await page.evaluate(()=>{window.relayoutFault={mode:'reject',width:268};});
    await refused(/could not be returned to its previous layout/, 'restore rejects');
    // F4. The capture itself fails.
    await page.evaluate(()=>{window.toImageFault='reject';});
    await refused(/injected toImage failure/, 'toImage fails');
    // F5. A card resize during capture owns the layout afterwards: it is not overwritten.
    await collapse(); await page.evaluate(()=>{window.toImageFault='resize';});
    await finish.click(); await comp.locator('.tc-snapshot img').waitFor();
    const newer = await page.evaluate(()=>window.newerLayout);
    assert.equal(newer.width, 500); assert.equal(newer.height, 400);
    assert.deepEqual(await liveLayout(), newer, 'a newer resize is kept, not replaced by the pre-Finish layout');

    // 1b. Autosize restored when the live figure had no explicit autosize at all.
    await edit.click(); await page.waitForTimeout(300);
    await page.evaluate(async()=>{const gd=document.getElementById('results_dashboard-plot_comp');await Plotly.relayout(gd,{autosize:null,width:300,height:110});});
    const bare = await liveLayout();
    assert.ok(bare.autosize!==false && bare.width===300,'precondition: no explicit autosize:false '+JSON.stringify(bare));
    await finish.click(); await comp.locator('.tc-snapshot img').waitFor();
    assert.equal((await page.evaluate(()=>window.captures.at(-1))).full.w, frame.w);
    assert.deepEqual(await liveLayout(), bare, 'autosize is not left false after Finish');
    await page.evaluate(()=>{Plotly.Plots.resize=window.logicalResize;});

    // 2. Normal path unchanged: Edit, then Finish at the settled size captures the same frame without a relayout.
    await edit.click(); await page.waitForTimeout(600);
    const relayouts=await page.evaluate(()=>{window.frameRelayouts=0;const original=Plotly.relayout;Plotly.relayout=function(){if(/finishSnapshot/.test(new Error().stack))window.frameRelayouts++;return original.apply(this,arguments);};return 0;});
    await finish.click(); await comp.locator('.tc-snapshot img').waitFor();
    const second=await page.evaluate(()=>({capture:window.captures.at(-1),relayouts:window.frameRelayouts}));
    assert.deepEqual(second.capture.opts,first.capture.opts,'settled frame captures at the same size');
    assert.equal(second.relayouts,relayouts,'a settled plot is not relaid out by Finish');

    // 3. Intentional geometry production accepts is accepted: a tiny plot area inside a normal frame.
    await edit.click(); await page.waitForTimeout(300);
    await output(Object.assign({},layout,{margin:{l:60,r:15,t:300,b:400}}));
    await finish.click(); await comp.locator('.tc-snapshot img').waitFor();
    await edit.click(); await page.waitForTimeout(300); await output(layout);

    // 4. A collapsed frame (below 160x120) is refused, not frozen, and nothing is captured.
    await page.evaluate(()=>{const gd=document.getElementById('results_dashboard-plot_comp');window.savedHeight=gd.style.cssText;['width:140px','height:90px','min-width:0','min-height:0'].forEach(d=>{const [k,v]=d.split(':');gd.style.setProperty(k,v,'important');});});
    const count=await page.evaluate(()=>window.captures.length), preCollapsed=await liveLayout();
    await finish.click();
    await page.waitForFunction(()=>document.querySelector('.tc-status').textContent.includes('plot frame is too small'));
    assert.equal(await comp.locator('.tc-snapshot').count(),0,'collapsed plot stays live');
    assert.equal(await page.evaluate(()=>window.captures.length),count,'no capture attempted');
    assert.deepEqual(await liveLayout(), preCollapsed, 'the refused Finish leaves the pre-Finish layout');
    assert.equal(await finish.isEnabled(),true);
    await page.evaluate(()=>{document.getElementById('results_dashboard-plot_comp').style.cssText=window.savedHeight;});

    // 5. One- and two-group square heatmaps (16 px per group by design) finish, as in production.
    const heat = page.locator('.tc-node[data-plot-id="results_dashboard-plot_heat"]');
    for (const view of [heat1, heat2]) {
      await page.evaluate(async v => {
        const gd=document.getElementById('results_dashboard-plot_heat'); if(gd.data) Plotly.purge(gd);
        await Plotly.newPlot(gd,[{type:'heatmap',x:v.x,y:v.y,z:v.z,zmin:-1,zmax:1,xgap:0,ygap:0,colorbar:v.colorbar}],{width:v.width,height:v.height,margin:v.margin,xaxis:v.xaxis,yaxis:v.yaxis,
          meta:{teamHeatmap:{version:1,geometry:'square-horizontal',naturalWidth:v.width,naturalHeight:v.height,rowCount:v.x.length,columnCount:v.y.length}}});
      }, view);
      if (!(await heat.count())) await page.evaluate(() => TeamCanvas.addPlot('results_dashboard-plot_heat'));
      await page.evaluate(async () => {const gd=document.getElementById('results_dashboard-plot_heat');jQuery(gd).trigger({type:'shiny:value',value:{x:{data:gd.data,layout:gd.layout}}});await Plotly.react(gd,gd.data,gd.layout);});
      await page.waitForTimeout(600);
      const area = await page.evaluate(()=>{const gd=document.getElementById('results_dashboard-plot_heat');return {ph:gd._fullLayout._size.h,w:gd.clientWidth,h:gd.clientHeight};});
      assert.ok(area.ph < 40, 'precondition: plot area is below the old 40 px check ('+area.ph+')');
      await heat.locator('.tc-node-head button',{hasText:'Finish plot'}).click();
      await heat.locator('.tc-snapshot img').waitFor({timeout:5000});
      const cap = await page.evaluate(()=>window.captures.at(-1));
      assert.equal(cap.id,'results_dashboard-plot_heat'); assert.equal(cap.opts.width,area.w); assert.equal(cap.opts.height,area.h);
      await heat.locator('.tc-node-head button',{hasText:'Edit'}).click(); await page.waitForTimeout(300);
    }

    // 6. Static Shiny image path: the same minimum applies before drawImage.
    await page.evaluate(() => TeamCanvas.addPlot('barchart-barPlotUnfiltered'));
    const bar = page.locator('.tc-node[data-plot-id="barchart-barPlotUnfiltered"]');
    // css: the logical size Shiny gives the <img> (its bitmap follows the device pixel ratio and zoom).
    async function staticImage(b64, css) { await page.evaluate(async ({b64,css}) => { const el=document.getElementById('barchart-barPlotUnfiltered'); jQuery(el).trigger('shiny:value'); el.innerHTML=''; const img=document.createElement('img'); img.src='data:image/png;base64,'+b64; if(css){img.style.width=css[0]+'px';img.style.height=css[1]+'px';} el.appendChild(img); await img.decode(); }, {b64,css}); await page.waitForTimeout(450); }
    const barFinish = bar.locator('.tc-node-head button',{hasText:'Finish plot'});
    async function staticRefused(pattern) { await page.evaluate(()=>{document.querySelector('.tc-status').textContent='';}); await barFinish.click(); await page.waitForFunction(p=>new RegExp(p).test(document.querySelector('.tc-status').textContent), pattern.source); assert.equal(await bar.locator('.tc-snapshot').count(),0); }
    await staticImage(smallPng);
    await bar.locator('.tc-node-head button',{hasText:'Finish plot'}).click();
    await page.waitForFunction(()=>document.querySelector('.tc-status').textContent.includes('plot frame is too small'));
    assert.equal(await bar.locator('.tc-snapshot').count(),0,'a collapsed static image stays live');
    // Device pixel ratio 2: a 300x200 bitmap drawn for a 150x100 logical frame is still collapsed.
    await staticImage(dpr2Small, [150,100]);
    await staticRefused(/plot frame is too small/);
    // Low canvas zoom: a bitmap drawn at 20% for a full-size frame is refused with the zoom advice
    // (the same image would read as collapsed in its card, so it could not loop through the caption).
    await page.evaluate(()=>TeamCanvasViewport.setScale(0.2)); await page.waitForTimeout(400);
    const barFrame = await page.evaluate(()=>{const n=document.querySelector('.tc-node[data-plot-id="barchart-barPlotUnfiltered"]');return [parseFloat(n.style.width),parseFloat(n.style.height)];});
    await staticImage(zoomPng, [barFrame[0]-40, 300]);
    await staticRefused(/Zoom in to 100% and Finish again/);
    await page.evaluate(()=>TeamCanvasViewport.setScale(1)); await page.waitForTimeout(400);
    // Device pixel ratio 2, normal frame: accepted, captured at its full bitmap.
    await staticImage(bigPng, [900,700]);
    await barFinish.click();
    await bar.locator('.tc-snapshot img').waitFor({timeout:5000});
    assert.equal(await bar.evaluate(n=>n.querySelector('.tc-snapshot img').naturalWidth), 1800);
    assert.doesNotMatch(await bar.locator('.tc-snapshot-status').textContent(), /smaller than its card/);

    // 7. Caption scope: only a restored image that looks collapsed (below the minimum and far
    // smaller than its card) gets the note; a legitimately small image in a small card does not.
    const svg = (w,h) => 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/></svg>`);
    async function restoreCard(id, url, size) {
      const state = await page.evaluate(()=>TeamCanvas.serialize());
      const node = state.nodes.find(n=>n.id===id);
      if (size) { node.width=size.width; node.height=size.height; }
      node.finished = {url, createdAt:'2026-10-29T00:52:38.056Z', stale:false};
      await page.evaluate(s=>TeamCanvas.restore(s),state);
      await page.waitForFunction(id=>{const i=document.querySelector('.tc-node[data-plot-id="'+id+'"] .tc-snapshot img');return i&&i.complete&&i.naturalWidth>0;},id);
      await page.waitForTimeout(100);
      return page.locator('.tc-node[data-plot-id="'+id+'"] .tc-snapshot-status').textContent();
    }
    const restoreComp = (url, size) => restoreCard('results_dashboard-plot_comp', url, size);
    assert.match(await restoreComp(svg(268,92)), /much smaller than its card \(268×92 px\)/);
    // 7b. The broken image is not shown stretched; exports and the figure page refuse it, and the
    // saved state is the checkpoint's own (the flag is derived on display, never written back).
    const broken = await page.evaluate(() => { const n=document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_comp"]'),pv=n.querySelector('.tc-snapshot');
      const st=TeamCanvas.previewState(),saved=TeamCanvas.serialize().nodes.find(x=>x.id==='results_dashboard-plot_comp').finished;
      return {defect:n.classList.contains('tc-snapshot-defect'),stale:n.classList.contains('tc-stale'),img:getComputedStyle(pv.querySelector('img')).display,exports:[...pv.querySelectorAll('.tc-snapshot-exports button')].map(b=>b.disabled),
        caption:pv.querySelector('.tc-snapshot-status').textContent,usable:st.usableIds.includes('results_dashboard-plot_comp'),reason:(st.unusable.find(u=>u.id==='results_dashboard-plot_comp')||{}).reason,saved:Object.keys(saved).sort(),savedStale:saved.stale}; });
    assert.deepEqual({defect:broken.defect,stale:broken.stale,img:broken.img,exports:broken.exports,usable:broken.usable,reason:broken.reason,saved:broken.saved,savedStale:broken.savedStale},
      {defect:true,stale:true,img:'none',exports:[true,true,true],usable:false,reason:'stale',saved:['createdAt','stale','url'],savedStale:false});
    assert.match(broken.caption,/^Saved image looks broken\. Choose Edit, then Finish plot to regenerate it\./);
    // A violin captured before the capture stamp whose shapes leave the plot clip is broken too; the
    // same image with the stamp, and a violin whose shapes stay inside the clip, are not.
    const violin = (top) => 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><clipPath id="c1xyplot" class="plotclip"><rect width="500" height="300"/></clipPath></defs><g class="plot" transform="translate(60,50)" clip-path="url(#c1xyplot)"><g class="violinlayer"><path class="violin" d="M100,${top}Q120,150 100,290L80,290Q60,150 80,${top}Z"/></g></g></svg>`);
    const variant = (body) => 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><clipPath id="c2" class="plotclip"><rect width="500" height="300"/></clipPath></defs>${body}</svg>`);
    const cases = await page.evaluate(v => Object.fromEntries(Object.entries(v).map(([k,u])=>[k,TeamCanvas.snapshotDefectOf(u,620,720,k==='stamped'?{captureVersion:2}:null)])),
      {cut:violin(-40),stamped:violin(-40),inside:violin(10),bad:'data:image/svg+xml,%E0%A4%A',
       spaces:variant(`<g clip-path="url('#c2')"><path class="violin" d="M100 -4e+1 L100 290 Z"/></g>`),
       transformed:variant(`<g clip-path="url(#c2)"><g transform="scale(0.5)"><path class="violin" d="M100,-40L100,290Z"/></g></g>`),
       relative:variant(`<g clip-path="url(#c2)"><path class="violin" d="m100,-40l0,290z"/></g>`),
       base64:'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><clipPath id="c3"><rect width="500" height="300"/></clipPath></defs><g clip-path="url(#c3)"><path class="violin" d="M1,-50L1,10Z"/></g></svg>`).toString('base64')});
    // Round 2: an escaped class name, a multi-byte character across the 4 KB probe boundary, a transformed clip.
    // Choose a padding whose 4 KB probe ends inside 'é' (%C3|%A9): the decoder must back off.
    let pad = '';
    for (let k = 0; k < 6 && !pad; k++) { const p = 'a'.repeat(k) + 'é'.repeat(700), u = variant(`<desc>${p}</desc><g/>`), c = u.indexOf(',') + 1; if (u.slice(c, c + 4096).endsWith('%C3')) pad = p; }
    assert.ok(pad, 'fixture: a padding that splits a UTF-8 character at the probe edge');
    const more = await page.evaluate(v => Object.fromEntries(Object.entries(v).map(([k,u])=>[k,TeamCanvas.snapshotDefectOf(u,620,720)])),
      {escaped:variant(`<g clip-path="url(#c2)"><path class="violin" d="M100,-40L100,290Z"/></g>`).replace('violin','%76iolin'),
       multibyte:variant(`<desc>${pad}</desc><g clip-path="url(#c2)"><path class="violin" d="M100,-40L100,290Z"/></g>`),
       charRef:variant(`<g clip-path="url(#c2)"><path class="v&#105;olin" d="M100,-40L100,290Z"/></g>`),
       nestedClip:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><clipPath id="c5"><g transform="translate(0,-100)"><rect y="100" width="500" height="300"/></g></clipPath></defs><g clip-path="url(#c5)"><path class="violin" d="M100,10L100,290Z"/></g></svg>`),
       clipTransform:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><clipPath id="c4" transform="translate(0,-100)"><rect y="100" width="500" height="300"/></clipPath></defs><g clip-path="url(#c4)"><path class="violin" d="M100,10L100,290Z"/></g></svg>`)});
    assert.deepEqual(more,{escaped:'clipped',multibyte:'clipped',charRef:'clipped',nestedClip:null,clipTransform:null});
    assert.deepEqual(cases,{cut:'clipped',stamped:null,inside:null,bad:null,spaces:'clipped',transformed:null,relative:null,base64:'clipped'});
    assert.doesNotMatch(await restoreComp(svg(600,400)), /smaller than its card/, 'a normal image is not flagged');
    // A small static image in a small card: below the minimum, but not collapsed relative to its frame.
    const smallCard = await restoreCard('barchart-barPlotUnfiltered', svg(150,110), {width:240,height:240});
    assert.doesNotMatch(smallCard, /smaller than its card/, 'small image in a small card is not flagged');

    // 8. A flagged checkpoint image is recaptured at the card size on Edit + Finish.
    await restoreComp(svg(268,92), {width:900,height:640});
    await edit.click(); await page.waitForTimeout(600);
    await output(layout); // the server re-renders the restored source
    await finish.click(); await comp.locator('.tc-snapshot img').waitFor();
    await page.waitForTimeout(100);
    const repaired=await page.evaluate(()=>({url:TeamCanvas.serialize().nodes.find(n=>n.id==='results_dashboard-plot_comp').finished.url,caption:document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_comp"] .tc-snapshot-status').textContent,w:document.getElementById('results_dashboard-plot_comp').clientWidth}));
    assert.doesNotMatch(repaired.caption,/smaller than its card/);
    assert.match(decodeURIComponent(repaired.url.split(',')[1]),new RegExp('width="'+repaired.w+'"'),'repaired at the card size');
    const regenerated=await page.evaluate(()=>{const n=document.querySelector('.tc-node[data-plot-id="results_dashboard-plot_comp"]');return {defect:n.classList.contains('tc-snapshot-defect'),stale:n.classList.contains('tc-stale'),stamp:(TeamCanvas.serialize().nodes.find(x=>x.id==='results_dashboard-plot_comp').finished.provenance||{}).captureVersion};});
    assert.deepEqual(regenerated,{defect:false,stale:false,stamp:2},'a new capture is clean and stamped');
    assert.deepEqual(errors,[]);
    console.log('PASS: Finish relays out a collapsed Plotly layout and restores its autosize, refuses only collapsed frames (Plotly and static images), accepts 1- and 2-group square heatmaps, and flags only collapsed-looking checkpoint images');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
