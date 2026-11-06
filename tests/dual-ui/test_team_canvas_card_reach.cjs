// Mock browser regression for three real-pointer failures on the Team Canvas (staging click suite, ux42):
// 1. A card in the navigation box's corner (minimap + zoom controls, bottom-left): its footer buttons Edit,
//    Duplicate and ⋯ are under the pointer (card_figure.js starts the docked bar right of the box, or floats it
//    clear of it) and a click on Edit opens the inspector; the zoom controls stay uncovered.
// 2. ⋯ → Data & settings opens the inspector on that card, on its Data tab (draft) or on the finished card's
//    panel (finished), within 5 s (card_frame.js).
// 3. Dragging the resize grip of an unselected card follows the pointer in both directions: the press selects the
//    card and opens the inspector, which used to move the camera mid-drag (canvas.js), so the height stuck.
// Real Team DOM/CSS/handlers (shell, inspector, inspector toggle) with a mocked Shiny server and an independent
// copy added from the catalog, real pointer, Canvas zoom 50/100/150 %. Chromium and, when installed, WebKit.
// Run with: node tests/dual-ui/test_team_canvas_card_reach.cjs
'use strict';
const assert=require('node:assert/strict');
const pw=require('../browser/ci/node_modules/playwright');
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
const SOURCE='results_dashboard-plot_pca',NAME='Principal components';
const CSS=['canvas','canvas_viewport','canvas_catalog','shell','card_figure','card_frame','card_status','canvas_inspector','inspector_toggle'];
const JS=['canvas_viewport','canvas_catalog','canvas','card_figure','card_frame','card_status','canvas_inspector','shell','inspector_toggle'];

async function page(browser){
  const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.setContent(`<body class="ts-shell-app"><section id="team-canvas-root"><div class="tc-layout"><aside class="tc-catalog"><input class="tc-search"><div class="tc-list"></div></aside><div class="tc-main"><div class="tc-toolbar"><button class="tc-library-toggle">Library</button><button class="tc-reset">Return all</button><button class="tc-arrange">Arrange</button></div><div class="tc-scroll"><div class="tc-board"><div class="tc-empty"></div></div></div><p class="tc-status"></p></div></div></section><div class="rd-card"><h3>${NAME}</h3><div id="${SOURCE}" class="plotly html-widget-output" style="height:400px"></div></div></body>`);
  for(const name of CSS)await p.addStyleTag({path:'www/team/css/'+name+'.css'});
  await p.evaluate(()=>{
    window.LIPIDOMIC_TEAM_WORKSPACE=true;window.__created=[];window.__handlers={};
    window.Shiny={shinyapp:{$socket:{},$inputValues:{},$values:{},$errors:{},$bindings:{}},
      setInputValue:(k,v)=>{if(k==='team_canvas_instance_create')__created.push(v);},
      addCustomMessageHandler:(n,f)=>{__handlers[n]=f;},bindAll:()=>Promise.resolve(),unbindAll:()=>{}};
    window.Plotly={Plots:{resize:g=>Promise.resolve(g)},relayout:g=>Promise.resolve(g),restyle:()=>Promise.resolve(),
      toImage:async(g,o)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}"><rect width="100%" height="100%" fill="#fff"/></svg>`)};
  });
  // The shell (it closes the library) mounts after the copy is added from the catalog.
  for(const name of JS.slice(0,JS.indexOf('shell')))await p.addScriptTag({path:'www/team/js/'+name+'.js'});
  await p.evaluate(()=>__handlers['team-preparation-state']({ready:true,pending:false,running:false,revision:1}));
  // An independent copy from the catalog (its host carries the copy's own Data & settings controls).
  await p.fill('.tc-search','Principal');await frames(p);
  await p.locator(`[data-catalog-action-id="${SOURCE}"]`).click();
  const id=await p.evaluate(source=>{const v=__created[__created.length-1],suffix=source.slice(source.indexOf('-')+1);
    const host=document.createElement('div');host.id=v.id+'_host';host.className='tc-instance-host';host.dataset.instanceId=v.id;
    host.innerHTML=`<div id="${v.id}-${suffix}" class="plotly html-widget-output" style="height:300px"></div><div class="form-group shiny-input-container"><label for="${v.id}-color_by">Color by</label><select id="${v.id}-color_by"><option>Group</option></select></div>`;
    document.body.appendChild(host);__handlers['team-canvas-instance-ready']({id:v.id,request:v.request,inputs:{},generation:1});return v.id+'-'+suffix;},SOURCE);
  const card=`.tc-node[data-plot-id="${id}"]`;
  await p.waitForSelector(card,{timeout:5000});
  await p.evaluate(id=>{const g=document.getElementById(id);g.classList.add('js-plotly-plot');g.data=[{type:'scatter',x:[1,2],y:[3,4]}];g.layout={};g._fullLayout={width:600,height:300};g.innerHTML='<svg class="main-svg" width="600" height="300"></svg>';},id);
  await p.waitForFunction(c=>!document.querySelector(c+' .tc-card-skeleton'),card,{timeout:5000});
  for(const name of JS.slice(JS.indexOf('shell')))await p.addScriptTag({path:'www/team/js/'+name+'.js'});
  await p.waitForFunction(()=>document.getElementById('team-canvas-root').dataset.tsShell==='true',null,{timeout:5000});
  return {p,errors,card};
}
// Camera and selection reset: nothing selected, inspector column hidden (its Canvas default), zoom z, scroll 0.
async function reset(p,card,z,geometry){
  await p.evaluate(({card,z,geometry})=>{
    if(window.TeamCanvas&&TeamCanvas.deselect)TeamCanvas.deselect();
    const close=document.querySelector('#tc-selection-inspector .tc-inspector-header button');if(close&&!document.getElementById('tc-selection-inspector').hidden)close.click();
    const toggle=document.querySelector('.tc-layout');if(toggle&&!toggle.classList.contains('ts-inspector-collapsed')){const b=[...document.querySelectorAll('button')].find(b=>/^Hide inspector/.test(b.getAttribute('aria-label')||b.textContent));if(b)b.click();}
    const n=document.querySelector(card);if(geometry)Object.assign(n.style,geometry);
    TeamCanvasViewport.setScale(z);const s=document.querySelector('#team-canvas-root .tc-scroll');s.scrollLeft=0;s.scrollTop=0;
  },{card,z,geometry});
  // Closing the inspector glides the camera back (ux40); the gesture class ends ~150 ms after it.
  await p.waitForTimeout(300);
  await p.waitForFunction(()=>!document.getElementById('team-canvas-root').classList.contains('tc-gesturing')&&!(TeamCanvasViewport.gliding&&TeamCanvasViewport.gliding()),null,{timeout:3000});
  await p.evaluate(({card,z,geometry})=>{const n=document.querySelector(card);if(geometry)Object.assign(n.style,geometry);if(TeamCanvasViewport.scale!==z)TeamCanvasViewport.setScale(z);const s=document.querySelector('#team-canvas-root .tc-scroll');s.scrollLeft=0;s.scrollTop=0;},{card,z,geometry});
  await p.waitForTimeout(200);
  await p.waitForFunction(()=>!document.getElementById('team-canvas-root').classList.contains('tc-gesturing'),null,{timeout:3000});
  await frames(p);
}
const centre=(p,sel)=>p.evaluate(sel=>{const el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
  return {x,y,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},hit:!!hit&&(hit===el||el.contains(hit)),on:hit&&(hit.className||hit.tagName)};},sel);
// The camera at rest: no glide and no gesture class, twice 200 ms apart (opening the inspector can move it again).
async function settle(p){
  for(let quiet=0,i=0;quiet<2&&i<30;i++){await p.waitForTimeout(200);quiet=await p.evaluate(()=>!document.getElementById('team-canvas-root').classList.contains('tc-gesturing')&&!TeamCanvasViewport.gliding())?quiet+1:0;}
  await frames(p);
}
const meets=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const inspector=p=>p.evaluate(()=>{const i=document.getElementById('tc-selection-inspector'),col=i&&i.closest('.ts-inspector-column'),tab=i&&i.querySelector('.tc-inspector-tab[aria-selected="true"]:not([hidden])');
  return {open:!!i&&!i.hidden&&i.getClientRects().length>0&&!(col&&col.inert),tab:tab?tab.textContent:null,selected:[...document.querySelectorAll('.tc-node.is-selected')].map(n=>n.dataset.plotId)};});

async function run(type){
  let browser;try{browser=await pw[type].launch({headless:true});}catch(e){if(type==='chromium')throw e;console.log('SKIP '+type+': not installed');return;}
  try{
    const {p,errors,card}=await page(browser);
    for(const z of [.5,1,1.5]){
      const tag=`${type} @${z*100}%`;
      // 1. The card's lower-left corner over the navigation box.
      await reset(p,card,z,null);
      const nav=await p.evaluate(()=>{const r=document.querySelector('#team-canvas-root .tc-navigation').getBoundingClientRect(),s=document.querySelector('#team-canvas-root .tc-scroll').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,viewLeft:s.left,viewTop:s.top};});
      const top=Math.round((nav.bottom-12-nav.viewTop)/z-400),left=Math.max(0,Math.round((nav.left+20-nav.viewLeft)/z));
      await reset(p,card,z,{left:left+'px',top:top+'px',width:'620px',height:'400px'});
      const cr=await p.locator(card).boundingBox();
      assert(meets({left:cr.x,top:cr.y+cr.height-40,right:cr.x+cr.width,bottom:cr.y+cr.height},nav),`${tag}: the card's footer is in the navigation box's corner`);
      await p.mouse.move(cr.x+cr.width-40,cr.y+cr.height/2);await frames(p);
      for(const q of ['.tc-card-edit','.tc-card-more','.tc-card-actions > button:not(.tc-card-edit)']){
        const b=await centre(p,`${card} ${q}`);
        assert(b&&b.hit,`${tag}: footer ${q} under the pointer, not under the navigation box ${JSON.stringify(b)}`);
        assert(!meets(b.rect,nav),`${tag}: footer ${q} clear of the navigation box ${JSON.stringify(b.rect)} vs ${JSON.stringify(nav)}`);
      }
      for(const q of ['.tc-zoom-out','.tc-zoom-reset','.tc-zoom-in','.tc-zoom-fit']){const b=await centre(p,`#team-canvas-root .tc-navigation ${q}`);assert(b&&b.hit,`${tag}: zoom control ${q} uncovered ${JSON.stringify(b)}`);}
      const edit=await centre(p,`${card} .tc-card-edit`);await p.mouse.move(edit.x,edit.y);await p.mouse.click(edit.x,edit.y);
      await p.waitForFunction(c=>{const i=document.getElementById('tc-selection-inspector'),col=i.closest('.ts-inspector-column');return !i.hidden&&!(col&&col.inert)&&document.querySelector(c).classList.contains('is-selected');},card,{timeout:5000}).catch(()=>{});
      const opened=await inspector(p);assert(opened.open&&opened.selected.length===1,`${tag}: Edit in the navigation box's corner opens the inspector on the card ${JSON.stringify({opened,edit,active:await p.evaluate(()=>{const i=document.getElementById('tc-selection-inspector'),col=i.closest('.ts-inspector-column');return [document.activeElement&&document.activeElement.className,i.hidden,col&&col.inert,document.querySelector('.tc-layout').className];})})}`);

      // 2. ⋯ → Data & settings, real pointer, on the draft card in open canvas.
      await reset(p,card,z,{left:'30px',top:'30px',width:'620px',height:'500px'});
      const dataTab=async(expectTab,label)=>{
        const c=await p.locator(card).boundingBox();await p.mouse.move(c.x+c.width/2,c.y+Math.min(c.height,400)/2);await frames(p);
        const more=await centre(p,`${card} .tc-card-more`);assert(more&&more.hit,`${tag} ${label}: ⋯ reachable ${JSON.stringify(more)}`);
        await p.mouse.click(more.x,more.y);
        // The camera may glide to the card the click selected: wait until it rests.
        await settle(p);
        await p.evaluate(c=>{const b=[...document.querySelectorAll(c+' .tc-card-menu > button')].find(b=>b.textContent.trim()==='Data & settings');if(b)b.dataset.dsTest='1';},card);
        const ds=await centre(p,`${card} [data-ds-test]`);assert(ds&&ds.hit,`${tag} ${label}: Data & settings under the pointer ${JSON.stringify(ds)} ${JSON.stringify(await p.evaluate(({c,x,y})=>{const bar=document.querySelector(c+' .tc-card-actions'),cs=getComputedStyle(bar);return {stack:document.elementsFromPoint(x,y).slice(0,6).map(e=>e.className||e.tagName),bar:[cs.position,cs.visibility,cs.opacity,cs.zIndex,cs.zoom,bar.className,bar.style.cssText],sel:document.querySelector(c).className,scale:TeamCanvasViewport.scale};},{c:card,x:ds.x,y:ds.y}))}`);
        const t0=Date.now();await p.mouse.click(ds.x,ds.y);
        await p.waitForFunction(({c,expectTab})=>{const i=document.getElementById('tc-selection-inspector'),col=i.closest('.ts-inspector-column'),tab=i.querySelector('.tc-inspector-tab[aria-selected="true"]:not([hidden])');
          return !i.hidden&&!(col&&col.inert)&&document.querySelector(c).classList.contains('is-selected')&&(!expectTab||(tab&&tab.textContent===expectTab));},{c:card,expectTab},{timeout:5000}).catch(()=>{});
        const s=await inspector(p);
        assert(s.open&&s.selected.length===1&&(!expectTab||s.tab===expectTab),`${tag} ${label}: Data & settings opens the inspector on the card within 5 s ${JSON.stringify(s)} after ${Date.now()-t0} ms`);
        await p.evaluate(()=>document.querySelectorAll('[data-ds-test]').forEach(b=>delete b.dataset.dsTest));
        return s;
      };
      await dataTab('Data','draft');
      const dataPanel=await p.evaluate(()=>{const d=document.getElementById('tc-inspector-panel-data');return !!d&&!d.hidden&&!!d.querySelector('.tc-inspector-data-settings');});
      assert(dataPanel,`${tag} draft: the Data tab is shown, with the copy's Data & settings button`);
      // The inspector's own Data & settings still opens the copy's panel.
      await p.locator('#tc-inspector-panel-data .tc-inspector-data-settings').click();
      await p.waitForFunction(()=>{const h=document.querySelector('.tc-instance-host');return h.classList.contains('is-open')&&getComputedStyle(h).visibility!=='hidden';},null,{timeout:5000});
      await p.evaluate(()=>{const b=document.querySelector('.tc-instance-host .tc-instance-panel-head button');if(b)b.click();});

      // 3. Resize grip of an unselected card: the size follows the pointer (the press opens the inspector). The card
      // fits the view but not beside the inspector, so a camera move on that press would also zoom out.
      const wide=await p.evaluate(z=>Math.round((document.querySelector('#team-canvas-root .tc-scroll').clientWidth-200)/z),z);
      await reset(p,card,z,{left:'30px',top:'30px',width:wide+'px',height:'400px'});
      const before=await p.evaluate(c=>{const n=document.querySelector(c);return {w:n.offsetWidth,h:n.offsetHeight};},card);
      const grip=await centre(p,`${card} .tc-node-resize`);assert(grip&&grip.hit,`${tag}: resize grip under the pointer ${JSON.stringify(grip)} ${JSON.stringify(await p.evaluate(c=>{const n=document.querySelector(c),g=n.querySelector('.tc-node-resize'),cs=getComputedStyle(g);return {st:n.scrollTop,sh:n.scrollHeight,ch:n.clientHeight,vis:cs.visibility,pe:cs.pointerEvents,z:cs.zIndex,disp:cs.display,pos:cs.position,root:document.getElementById('team-canvas-root').className,nodeRect:JSON.stringify(n.getBoundingClientRect())};},card))}`);
      const dx=120,dy=Math.min(240,860-grip.y);
      await p.mouse.move(grip.x,grip.y);await p.mouse.down();
      for(let i=1;i<=12;i++){await p.mouse.move(grip.x+dx*i/12,grip.y+dy*i/12);await p.waitForTimeout(16);}
      await frames(p);await p.mouse.up();await p.waitForTimeout(300);await frames(p);
      const after=await p.evaluate(c=>{const n=document.querySelector(c);return {w:n.offsetWidth,h:n.offsetHeight};},card);
      assert(Math.abs(after.w-(before.w+dx/z))<=2,`${tag}: width follows the pointer ${JSON.stringify({before,after,expected:before.w+dx/z})}`);
      assert(Math.abs(after.h-(before.h+dy/z))<=2,`${tag}: height follows the pointer ${JSON.stringify({before,after,expected:before.h+dy/z})}`);
    }
    // 2b. A finished card: Data & settings opens the inspector on it (a finished figure offers its Export panel).
    await reset(p,card,1,{left:'30px',top:'30px',width:'620px',height:'500px'});
    await p.evaluate(c=>{const b=[...document.querySelectorAll(c+' .tc-card-menu > button')].find(b=>b.textContent.trim()==='Finish plot');b.click();},card);
    await p.waitForFunction(c=>document.querySelector(c).classList.contains('tc-finished'),card,{timeout:8000});
    for(const z of [.5,1,1.5]){
      await reset(p,card,z,{left:'30px',top:'30px'});
      const c=await p.locator(card).boundingBox();await p.mouse.move(c.x+c.width/2,c.y+Math.min(c.height,400)/2);await frames(p);
      const more=await centre(p,`${card} .tc-card-more`);assert(more&&more.hit,`${type} finished @${z*100}%: ⋯ reachable ${JSON.stringify(more)}`);
      await p.mouse.click(more.x,more.y);
      await settle(p);
      await p.evaluate(c=>{const b=[...document.querySelectorAll(c+' .tc-card-menu > button')].find(b=>b.textContent.trim()==='Data & settings');if(b)b.dataset.dsTest='1';},card);
      const ds=await centre(p,`${card} [data-ds-test]`);assert(ds&&ds.hit,`${type} finished @${z*100}%: Data & settings under the pointer ${JSON.stringify(ds)}`);
      await p.mouse.click(ds.x,ds.y);
      await p.waitForFunction(c=>{const i=document.getElementById('tc-selection-inspector'),col=i.closest('.ts-inspector-column');return !i.hidden&&!(col&&col.inert)&&document.querySelector(c).classList.contains('is-selected');},card,{timeout:5000}).catch(()=>{});
      const s=await inspector(p);assert(s.open&&s.selected.length===1,`${type} finished @${z*100}%: Data & settings opens the inspector on the card ${JSON.stringify(s)}`);
      await p.evaluate(()=>document.querySelectorAll('[data-ds-test]').forEach(b=>delete b.dataset.dsTest));
    }
    assert.deepEqual(errors,[],`${type}: no page errors`);
    await p.close();
    console.log('PASS '+type+': footer Edit/Duplicate/⋯ clear of the navigation box (zoom controls uncovered), ⋯ → Data & settings opens the inspector (Data tab on a draft, finished card too), resize grip follows the pointer in height and width (zoom 50/100/150%)');
  }finally{await browser.close();}
}
(async()=>{for(const t of (process.env.ENGINES||'chromium,webkit').split(','))await run(t);})().catch(e=>{console.error(e);process.exitCode=1;});
