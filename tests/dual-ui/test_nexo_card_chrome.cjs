// H6-0 card chrome: mock build, Chromium and WebKit.
// node tests/dual-ui/test_nexo_card_chrome.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
let server;
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: nexo, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
const nodes = page => page.evaluate(() => window.__nexo.store.get().nodes);
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function undo(page) { await page.locator('#viewport').focus(); await page.keyboard.press('Control+z'); }
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    // Fonts are external presentation assets; keep the mock suite deterministic offline.
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({body:'',contentType:'text/css'}));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const original = await nodes(page), id = original[0].id;
    for (const n of original) {
      const c = card(page,n.id);
      assert.equal(await c.locator('header .card-title').getAttribute('title'), n.label);
      assert.equal(await c.locator('.card-footer').count(),0,'the card carries no action bar');
      for (const name of ['Edit','Duplicate','More card actions']) assert.equal(await c.locator('header').getByRole('button',{name,exact:true}).count(),1,`header has ${name}`);
      assert.equal(await c.locator('header').evaluate(el=>el.offsetHeight),36);
    }
    const c = card(page,id);
    await page.evaluate(()=>window.__nexo.handle.zoomTo(1));
    await c.hover();
    for (const label of ['Edit','Duplicate','More card actions']) {
      const action=c.locator('.card-actions').getByRole('button',{name:label,exact:true});
      await page.waitForFunction(el=>getComputedStyle(el).opacity==='1',await action.elementHandle());
    }
    await page.mouse.move(0,0);
    await c.focus();
    // Tab reaches all three actions, including when a title is also in the tab order.
    for (const label of ['Edit','Duplicate','More card actions']) {
      let reached=false;
      for(let i=0;i<3;i++) {
        await page.keyboard.press(name === 'webkit' ? 'Alt+Tab' : 'Tab'); // Safari moves to buttons with Option+Tab (as in test_nexo_access).
        const action=c.locator('.card-actions').getByRole('button',{name:label,exact:true});
        if(!await action.evaluate(el=>el===document.activeElement))continue;
        // Focused: the opacity fade (var(--motion)) must finish at fully visible while focus stays here.
        reached=await page.waitForFunction(el=>el===document.activeElement&&getComputedStyle(el).opacity==='1',await action.elementHandle(),{timeout:2000}).then(()=>true,()=>false);
        break;
      }
      assert(reached,`Tab reaches visible ${label}`);
    }
    await page.keyboard.press('Enter');
    assert.equal(await c.locator('.card-menu').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await c.locator('.card-menu').isVisible(),false);
    console.log(`PASS W2 ${name} header-actions-hover-and-tab`);
    await page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state === 'current', id);
    assert.equal(await c.locator('.card-status').getAttribute('aria-label'),'Up to date');
    assert.equal(await page.locator('#hud').isVisible(),false);
    const inspector = page.locator('#inspector');
    // The title owns double-click/Enter; Edit continues to open the inspector.
    const title=c.locator('.card-title'), titleInput=c.getByRole('textbox',{name:'Card title',exact:true});
    await title.dblclick();
    await titleInput.fill('Study overview');
    assert.equal((await nodes(page)).find(n=>n.id===id).label,original[0].label,'draft does not enter history');
    await titleInput.press('Enter');
    assert.equal((await nodes(page)).find(n=>n.id===id).label,'Study overview');
    assert.equal(await c.getAttribute('aria-label'),'Study overview');
    await undo(page);
    assert.equal((await nodes(page)).find(n=>n.id===id).label,original[0].label,'one undo restores the whole title');
    await title.focus(); await page.keyboard.press('Enter');
    await titleInput.fill('Cancelled title'); await titleInput.press('Escape');
    assert.equal(await titleInput.count(),0);
    assert.equal((await nodes(page)).find(n=>n.id===id).label,original[0].label);
    assert.equal(await title.evaluate(el=>el===document.activeElement),true);
    assert.equal(await inspector.getAttribute('data-open'),'true','Escape in title does not close the inspector');
    await page.locator('#viewport').focus(); await page.keyboard.press('F2');
    await titleInput.fill('Keyboard title'); await titleInput.press('Enter');
    assert.equal((await nodes(page)).find(n=>n.id===id).label,'Keyboard title');
    await undo(page);
    assert.equal((await nodes(page)).find(n=>n.id===id).label,original[0].label);
    console.log(`PASS F11 ${name} inline-rename-enter-escape-f2-single-undo`);
    await c.locator('.card-actions').getByRole('button',{name:'Edit',exact:true}).click();
    await page.waitForSelector('#inspector[data-open="true"]');
    for (const label of ['Duplicate','Finish plot','More plot actions']) assert.equal(await inspector.locator('header').getByRole('button',{name:label,exact:true}).count(),1,`inspector header has ${label}`);
    // Row 16 (with the inspector open, so its header controls count): every icon-only control has a tooltip that supplements its accessible name and prints the key when it has one;
    // the name carries no key, no native title doubles it; keyboard focus and hover show it.
    const icons=await page.evaluate(()=>[...document.querySelectorAll('.rail button,.zoom-pill button,.card-actions button,.inspector-head>button,.tabsbar>button,.menu-wrap>button,.topbar .avatar')]
      .filter(el=>el.checkVisibility()&&el.textContent.trim().length<=2)
      .map(el=>({name:el.getAttribute('aria-label'),text:el.textContent.trim(),tip:el.dataset.tip??null,title:el.getAttribute('title'),keys:el.getAttribute('aria-keyshortcuts')})));
    assert(icons.length>=12,`icon-only controls found: ${icons.length}`);
    for(const b of icons){
      assert(b.name,`icon control "${b.text}" has no accessible name`);
      assert.doesNotMatch(b.name,/\(.+\)|·/,`${b.name}: the name must not carry the key`);
      assert.equal(b.title,null,`${b.name}: a native title would double the tooltip`);
      assert(b.tip&&b.tip.startsWith(b.name),`${b.name}: tooltip "${b.tip}" must start with the name`);
      if(b.keys)assert.match(b.tip,/ · .+$/,`${b.name}: tooltip "${b.tip}" prints no key for ${b.keys}`);
    }
    for(const [n,printed] of [['Plots','L'],['Illustrations','Shift + L'],['Select','V'],['Move','H'],['Inspector','I'],['Duplicate','Ctrl/⌘ + D'],['Zoom in','+'],['Zoom out','−'],['Close inspector','Esc']])
      assert(icons.some(b=>b.name===n&&b.keys&&b.tip===`${n} · ${printed}`),`${n} prints ${printed}: ${JSON.stringify(icons.find(b=>b.name===n))}`);
    const tipOf=el=>{const cs=getComputedStyle(el,'::after');return {content:cs.content,visibility:cs.visibility};};
    const zoomIn=page.locator('.zoom-pill').getByRole('button',{name:'Zoom in',exact:true}),zoomOut=page.locator('.zoom-pill').getByRole('button',{name:'Zoom out',exact:true});
    await page.mouse.move(0,0);
    assert.equal((await zoomIn.evaluate(tipOf)).visibility,'hidden','tooltip shows while idle');
    await zoomOut.focus();await page.keyboard.press(name==='webkit'?'Alt+Tab':'Tab');
    assert.equal(await zoomIn.evaluate(el=>el===document.activeElement),true,'Tab reaches Zoom in');
    const focused=await zoomIn.evaluate(tipOf);assert.equal(focused.visibility,'visible','keyboard focus shows the tooltip');assert.match(focused.content,/Zoom in · \+/);
    await page.locator('#viewport').focus();await page.mouse.move(0,0);
    await page.waitForFunction(el=>getComputedStyle(el,'::after').visibility==='hidden',await zoomIn.elementHandle());
    await zoomIn.hover();await page.waitForFunction(el=>getComputedStyle(el,'::after').visibility==='visible',await zoomIn.elementHandle());
    await page.mouse.move(0,0);
    console.log(`PASS R16 ${name} tooltips-supplement-names-focus-hover`);
    // Closing the inspector gives its column back to the canvas on a wide screen too.
    await inspector.getByRole('button',{name:'Close inspector',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.inspector-column').getBoundingClientRect().width <= 1);
    await c.locator('.card-actions').getByRole('button',{name:'Edit',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.inspector-column').getBoundingClientRect().width > 200);
    await inspector.getByRole('button',{name:'More plot actions',exact:true}).click();
    for (const label of ['Copy settings','Copy to tab…','Move to tab…','Remove']) assert.equal(await inspector.getByRole('button',{name:label,exact:true}).isVisible(),true,`inspector menu has ${label}`);
    await inspector.getByRole('button',{name:'Remove',exact:true}).click();
    assert.equal((await nodes(page)).length,original.length-1);
    await undo(page);
    assert.equal((await nodes(page)).length,original.length);
    await c.getByRole('button',{name:'More card actions',exact:true}).click();
    for(const label of ['Finish plot','Duplicate','Data & settings','Copy to tab…','Move to tab…','Remove']) assert.equal(await c.locator('.card-menu').getByRole('button',{name:label,exact:true}).isVisible(),true);
    await c.locator('.card-menu').getByRole('button',{name:'Remove',exact:true}).click();
    assert.equal((await nodes(page)).length,original.length-1);
    assert.equal(await page.locator('.toast').getByRole('button',{name:'Undo',exact:true}).isVisible(),true);
    // H9 (review R15): a notice is announced and shown once, by the toast; the status band keeps the mode hint.
    const toastText=await page.locator('.toast').evaluate(e=>e.firstChild.textContent);
    const shown=await page.evaluate(t=>[...document.querySelectorAll('[role=status],[role=alert]')].filter(e=>e.checkVisibility()&&e.textContent.includes(t)).length,toastText);
    assert.equal(shown,1,`notice "${toastText}" shown/announced ${shown} times`);
    assert.equal(await page.locator('.status-band > span:not(.status-notice)').isVisible(),true,'mode hint stays');
    console.log(`PASS H9 ${name} notice-once-toast-only`);
    await undo(page);
    assert.equal((await nodes(page)).length,original.length);
    await c.getByRole('button',{name:'More card actions',exact:true}).click();
    await c.getByRole('button',{name:'Remove',exact:true}).click();
    await page.locator('.toast').getByRole('button',{name:'Undo',exact:true}).click();
    assert.equal((await nodes(page)).length,original.length);
    await c.locator('.card-actions').getByRole('button',{name:'Edit',exact:true}).click();
    await page.waitForSelector('#inspector[data-open="true"]');
    await inspector.locator('header').getByRole('button',{name:'Duplicate',exact:true}).click();
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length===n,original.length+1);
    const copy=(await nodes(page)).find(n=>!original.some(o=>o.id===n.id));
    const source = require(path.join(nexo,'src/mock/catalog.json')).outputs.find(e=>e.output==='plot_pca').id;
    assert.equal(copy.instance.source,source);
    await undo(page);
    await c.getByRole('button',{name:'More card actions',exact:true}).click();
    await c.getByRole('button',{name:'Finish plot',exact:true}).click();
    assert.ok(['Finishing…','Finished'].includes(await c.locator('.card-status').getAttribute('aria-label')),'Finish shows Finishing… until the snapshot lands (a fast engine may already be done)');
    await page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state === 'finished',id);
    { const finished=(await nodes(page)).find(n=>n.id===id).finished;
      assert.match(finished?.url??'',/^data:image\/(svg\+xml|png)/,'Finish stores the snapshot in the node (H6b)');
      assert.equal(finished.provenance.captureVersion,2); }
    await c.locator('.card-actions').getByRole('button',{name:'Edit',exact:true}).click();
    await inspector.locator('header').getByRole('button',{name:'Edit figure',exact:true}).click();
    for (const [state,label,action] of [['pending','Changes pending','Review'],['needs-data','Needs data','Review'],['waiting','Needs settings','Data & settings'],['error','Could not update','Data & settings'],['finished-stale','Finished · out of date','Edit figure']]) {
      await page.evaluate(({id,state})=>window.__nexo.handle.setCardStatus(id,state),{id,state});
      assert.equal(await c.locator('.card-status').getAttribute('aria-label'),label);
      assert.equal(await c.locator('.card-status button').count(),1);
      assert.equal(await c.locator('.card-status button').textContent(),action);
      // Row 11: the card itself carries the state and its tone, from the one mapping (src/cardView.ts).
      assert.equal(await c.getAttribute('data-state'),state);
      assert.equal(await c.getAttribute('data-tone'),state==='error'?'red':'amber');
    }
    // Loading is a neutral skeleton: no bars, no numbers, a busy marker and the visible text for the status machine.
    const skeleton=await page.evaluate(()=>{const s=document.querySelector('.card-skeleton');return s?{busy:s.getAttribute('aria-busy'),bars:s.querySelectorAll('*:not(span)').length,text:s.textContent.trim()}:null;});
    if(skeleton){assert.equal(skeleton.busy,'true');assert.equal(skeleton.bars,0);assert.match(skeleton.text,/^(Loading figure…|Restoring .*…)$/);}
    assert.equal(await page.locator('.card-skeleton[aria-busy="true"]').count()+await page.locator('.card .body img,.card .body .js-plotly-plot').count()>0,true);
    await page.evaluate(id=>window.__nexo.handle.setCardStatus(id,'current'),id);
    await page.evaluate(id=>window.__nexo.handle.setCardStatus(id,'updating'),id);
    assert.equal(await c.locator('.card-status').getAttribute('aria-label'),'Up to date');
    await page.waitForFunction(id=>document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state==='updating',id);
    await page.evaluate(id=>window.__nexo.handle.setCardStatus(id,'current'),id);
    assert.equal(await c.getAttribute('data-state'),'current');assert.equal(await c.getAttribute('data-tone'),'green');
    console.log(`PASS H6-0 ${name} anatomy-menu-remove-undo-duplicate-badge-finish`);
    console.log(`PASS R11 ${name} card-state-mapping-on-card`);
    // H9 (review R07): with no card footer the live Plotly figure fills the whole card body.
    await page.evaluate(()=>window.__nexo.handle.zoomTo(1));
    await page.waitForFunction(()=>document.querySelectorAll('.card .body .main-svg').length>0);
    const fill=await page.evaluate(()=>[...document.querySelectorAll('.card')].filter(c=>c.querySelector('.body .main-svg')).map(c=>({body:c.querySelector('.body').clientHeight,plot:Math.round(c.querySelector('.body .main-svg').getBoundingClientRect().height)})));
    assert(fill.length>0,'no live Plotly card');
    for(const f of fill) assert(Math.abs(f.body-f.plot)<=1,`Plotly ${f.plot}px in a ${f.body}px body`);
    assert.equal(original[0].width,440); assert.equal(original[0].height,330);
    assert(await c.locator('.body').evaluate(el=>el.clientHeight)>=290,'440×330 card keeps at least 290px for its plot');
    assert.equal(await c.locator('.resize-handle').evaluate(el=>getComputedStyle(el).opacity),'1','selected grip is visible');
    console.log(`PASS H9 ${name} plot-fills-card-body`);
    // Thumbnail chrome does not change rendering tiers or rerender the cached image.
    await page.evaluate(()=>window.__nexo.handle.zoomTo(.15));
    await page.waitForFunction(()=>[...document.querySelectorAll('.card:not([hidden])')].every(c=>c.dataset.tier==='frozen'&&c.querySelector('.body img')?.complete));
    const thumbs=await page.locator('.card:not([hidden])').evaluateAll(cards=>cards.map(c=>({
      header:c.querySelector('header').offsetHeight,inert:c.querySelector('header').inert,
      title:c.querySelector('.card-thumb-title').textContent,label:c.getAttribute('aria-label'),
      font:parseFloat(getComputedStyle(c.querySelector('.card-thumb-title')).fontSize)*.15,
      image:c.querySelector('.body img').getAttribute('src'),body:c.querySelector('.body').clientHeight,height:c.clientHeight
    })));
    assert(thumbs.length>0);
    for(const t of thumbs) {
      assert.equal(t.header,0); assert.equal(t.inert,true); assert.equal(t.title,t.label);
      assert(t.font>=11.9,'thumbnail title stays legible in screen pixels');
      assert.equal(t.body,t.height,'thumbnail uses the full card body');
    }
    await page.evaluate(()=>window.__nexo.handle.zoomTo(.25));
    const restored=await page.locator('.card:not([hidden])').evaluateAll(cards=>cards.map(c=>({
      header:c.querySelector('header').offsetHeight,inert:c.querySelector('header').inert,
      overlay:getComputedStyle(c.querySelector('.card-thumb-title')).display,
      image:c.querySelector('.body img').getAttribute('src')
    })));
    restored.forEach((t,i)=>{assert.equal(t.header,36);assert.equal(t.inert,false);assert.equal(t.overlay,'none');assert.equal(t.image,thumbs[i].image);});
    for(const [scale,target] of [[.25,'.card-title'],[.15,'.body']]) {
      await page.evaluate(scale=>window.__nexo.handle.zoomTo(scale),scale);
      await c.locator(target).click();
      await page.waitForFunction(id=>document.querySelector(`.card[data-id="${id}"]`)?.dataset.tier==='live',id);
      assert.equal(await c.locator('.card-title-input').count(),0,'single click focuses, without renaming');
    }
    console.log(`PASS W2 ${name} thumb-15-header-25-frozen-image-click-focus`);
    const fs=require('node:fs'); const out=process.env.NEXO_SCREENSHOTS || '/tmp/nexo-h6-0';fs.mkdirSync(out,{recursive:true});
    for(const width of [1440,1024,390]) {
      await page.setViewportSize({width,height:1000});
      await page.screenshot({path:path.join(out,`${name}-${width}.png`)});
      console.log(`PASS H6-0 ${name} screenshot ${width}`);
    }
    assert.deepEqual(errors, []); console.log(`PASS H6-0 ${name} no-console-errors`);
    await context.close();
    const touch = await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true});
    await touch.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
    const tablet = await touch.newPage();
    await tablet.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await tablet.waitForSelector('.card');
    await tablet.evaluate(()=>window.__nexo.handle.zoomTo(1));
    assert.equal(await tablet.evaluate(()=>matchMedia('(hover:none)').matches),true);
    for(const label of ['Edit','Duplicate','More card actions']) {
      const action=tablet.locator('.card').first().locator('.card-actions').getByRole('button',{name:label,exact:true});
      assert.equal(await action.evaluate(el=>getComputedStyle(el).opacity),'1',`touch shows ${label} without hover`);
      await action.focus();
      assert.equal(await action.evaluate(el=>getComputedStyle(el,'::after').content),'none',`touch-only pointer: no tooltip for ${label}`);
    }
    await touch.close();
    console.log(`PASS W2 ${name} touch-actions-without-hover`);
    // Both a view-only link and a phone reject every inline-edit entry point.
    for(const phone of [false,true]) {
      const view=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:1000},hasTouch:phone});
      await view.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
      const readonly=await view.newPage();
      await readonly.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}${phone?'':'&mode=view'}`);
      await readonly.waitForSelector('.card');
      const before=await nodes(readonly), first=readonly.locator('.card').first();
      // Dispatch avoids relying on a tiny fitted phone title as a pointer target.
      await first.locator('.card-title').dispatchEvent('dblclick');
      await first.locator('.card-title').dispatchEvent('keydown',{key:'Enter'});
      await first.focus(); await readonly.keyboard.press('Enter'); await readonly.keyboard.press('F2');
      assert.equal(await readonly.locator('.card-title-input').count(),0);
      assert.deepEqual(await nodes(readonly),before);
      await view.close();
    }
    console.log(`PASS F11 ${name} view-only-link-and-phone-cannot-rename`);
  } finally { await browser.close(); }
}

function unitTests() {
  const esbuild = require(require.resolve('esbuild', {paths:[nexo]}));
  const code = esbuild.buildSync({stdin:{contents:"export { cardMenuPlacement } from './src/cards.ts'",resolveDir:nexo},bundle:true,write:false,platform:'node',format:'cjs',define:{'import.meta.env.VITE_API_MOCK':'"0"','import.meta.env.VITE_API_BASE':'"/api/v1"','import.meta.env.VITE_ADMIN_TOKEN_URL':'undefined'}}).outputFiles[0].text;
  const mod = {exports:{}}; new Function('module','exports','require',code)(mod,mod.exports,require);
  const place=mod.exports.cardMenuPlacement;
  assert.deepEqual(place({top:400,bottom:440,left:300,right:500},{top:0,bottom:800,left:0,right:800},200),{below:false,maxHeight:396,shiftX:0});
  assert.deepEqual(place({top:100,bottom:140,left:-20,right:180},{top:0,bottom:800,left:0,right:800},200),{below:true,maxHeight:656,shiftX:20});
  assert.deepEqual(place({top:130,bottom:170,left:700,right:900},{top:0,bottom:280,left:0,right:800},200),{below:false,maxHeight:126,shiftX:-100});
  console.log('PASS H6-0 unit menu upward-downward-clamp');
}
(async () => {
  unitTests();
  if (process.argv.includes('--unit')) return;
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H6-0 Playwright: ${e.message}`); return; } throw e; }
  run('sh', ['scripts/vendor-plotly.sh']);
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1' });
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  for (const name of ['chromium', 'webkit']) await browserTests(pw, name, base);
  console.log('H6-0 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
