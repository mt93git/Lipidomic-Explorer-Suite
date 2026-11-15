// H6c: mock figure composition on the shared world in Chromium and WebKit.
// node tests/dual-ui/test_nexo_figure_page.cjs
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
const camera = page => page.$eval('#world', el => el.style.transform);
async function focus(page) { await page.locator('#viewport').focus(); }
async function undo(page) { await focus(page); await page.keyboard.press('Control+z'); }
async function browserTests(pw,name,base) {
 const browser=await pw[name].launch();
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 context.on('console',m=>{if(m.type()==='error')errors.push(m.text());});context.on('weberror',e=>errors.push(e.error().message));
 const page=await context.newPage();await page.goto(`${base}/nexo/?checkpoint=${checkpoint}`);await page.waitForSelector('.card');
 const draft=await camera(page);
 await page.getByRole('button',{name:'Figure page →',exact:true}).click();
 await page.locator('#world #figure-layer .figure-sheet').waitFor();
 // H8 journeys 6.3: the status band hint follows the mode.
 assert.match(await page.locator('.status-band > span:not(.status-notice)').textContent(),/^Figure page: arrange finished plots/);console.log(`PASS H8 ${name} status-hint-follows-figure-mode`);
 assert.equal(await page.locator('.figure-sheet').getAttribute('aria-label'),'letter portrait figure page');
 const sheet=await page.locator('.figure-sheet').boundingBox(),vp=await page.locator('#viewport').boundingBox();assert(sheet.width<=vp.width&&sheet.height<=vp.height);
 assert(await page.locator('.figure-sheet svg svg').count());assert.match(await page.locator('.figure-sheet').textContent(),/PENDING/);
 await page.getByRole('button',{name:'Add text',exact:true}).click();await page.getByRole('textbox',{name:'Text',exact:true}).fill('Synthetic figure title');
 const textId=await page.evaluate(()=>window.__nexo.store.get().document.items.find(i=>i.type==='text').id);
 await page.getByText('Add shape ▾',{exact:true}).click();await page.getByRole('button',{name:'Add arrow',exact:true}).click();
 // P3: rounded rectangle uses Team's rectangle + radius schema and SVG output.
 await page.getByRole('button',{name:'Add rounded rectangle',exact:true}).click();
 assert(await page.evaluate(()=>window.__nexo.store.get().document.items.some(i=>i.shape==='rectangle'&&i.radius===12)));
 assert(await page.locator('.figure-sheet rect[rx="12"]').count());
 await page.getByRole('button',{name:'Delete object',exact:true}).click();
 console.log(`PASS P3 ${name} rounded-rectangle`);
 const box=await page.locator(`[data-item-id="${textId}"]`).boundingBox();await page.mouse.move(box.x+15,box.y+15);await page.mouse.down();await page.mouse.move(box.x+45,box.y+45,{steps:5});await page.mouse.up();
 const getText=()=>page.evaluate(id=>window.__nexo.store.get().document.items.find(i=>i.id===id),textId),moved=await getText();
 await undo(page);assert.notEqual((await getText()).x,moved.x);await page.keyboard.press('Control+Shift+z');assert.equal((await getText()).x,moved.x);
 // H8d: double click focuses Text; duplicate adds one object on top; locked figure resize keeps its ratio.
 await page.getByRole('tab',{name:'Page',exact:true}).click();const tb=await page.locator(`[data-item-id="${textId}"]`).boundingBox();await page.mouse.dblclick(tb.x+tb.width/2,tb.y+tb.height/2);
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Text');
 const count=()=>page.evaluate(()=>window.__nexo.store.get().document.items.length),before=await count();await page.getByRole('button',{name:'Duplicate object',exact:true}).click();assert.equal(await count(),before+1);
 assert(await page.getByRole('button',{name:'Bring forward',exact:true}).isDisabled());await page.getByRole('button',{name:'Send backward',exact:true}).click();assert(await page.getByRole('button',{name:'Bring forward',exact:true}).isEnabled());
 await undo(page);await undo(page);assert.equal(await count(),before);
 const fig=await page.evaluate(()=>window.__nexo.store.get().document.items.find(i=>i.type==='figure')),grip=await page.locator(`[data-item-id="${fig.id}"] .figure-resize`).boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+40,grip.y+grip.height/2+5,{steps:5});await page.mouse.up();
 const resized=await page.evaluate(id=>window.__nexo.store.get().document.items.find(i=>i.id===id),fig.id);assert(resized.width>fig.width);assert(Math.abs(resized.width/resized.height-fig.width/fig.height)<0.01,'figure aspect not locked');await undo(page);
 console.log(`PASS H8d ${name} figure dblclick-text duplicate z-order aspect-lock`);
 await page.getByRole('tab',{name:'Page',exact:true}).click();
 await page.getByLabel('Page guides',{exact:true}).check();assert(await page.locator('.figure-sheet.figure-guides').count());
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__nexo.store.get().document).includes('guides')),false);
 console.log(`PASS P3 ${name} page-guides-view-only`);
 // Pilot simulation step 9: a template layout hides free text and shapes; the page says so and names the way back.
 const hidden=page.locator('.figure-hidden-note');
 assert.equal(await hidden.count(),0);
 await page.getByLabel('Layout',{exact:true}).selectOption('figure1');
 await hidden.waitFor({timeout:3000});
 assert.match(await hidden.textContent(),/^\d+ (text or shape|texts and shapes) hidden by this layout\. Free shows (it|them)\.$/);
 assert.equal(await hidden.getAttribute('role'),'status');
 await undo(page);await hidden.waitFor({state:'detached',timeout:3000});
 console.log(`PASS pilot ${name} template-layout-says-it-hides-free-items`);
 await page.getByRole('tab',{name:'Page',exact:true}).click();await page.getByLabel('Paper',{exact:true}).selectOption('a4');await page.getByLabel('Orientation',{exact:true}).selectOption('landscape');
 assert(await page.evaluate(()=>window.__nexo.store.get().document.items.every(i=>i.x>=0&&i.y>=0&&i.x+i.width<=841.89&&i.y+i.height<=595.28)));
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();const file=await download;const stream=await file.createReadStream();const chunks=[];for await(const c of stream)chunks.push(c);const svg=Buffer.concat(chunks).toString();assert.match(svg,/Synthetic figure title/);assert(!svg.includes('figure-guides'));assert(await page.evaluate(s=>!new DOMParser().parseFromString(s,'image/svg+xml').querySelector('parsererror'),svg));
 await page.screenshot({path:`/tmp/nexo-figure-${name}-1440.png`});await page.setViewportSize({width:390,height:844});await page.screenshot({path:`/tmp/nexo-figure-${name}-390.png`});await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'← Draft',exact:true}).click();assert.equal(await camera(page),draft);
 await page.evaluate(()=>window.__nexo.autosave.flush());await page.waitForFunction(()=>document.querySelector('.save-pill').textContent.includes('Saved ·'));await page.reload();await page.waitForSelector('.card');await page.waitForFunction(()=>window.__nexo.store.get().document?.items.some(i=>i.text==='Synthetic figure title'));
 // H8 journeys 6.2: the Draft chip and the Plots tab say how many plots still need finishing; Finish works from the row.
 const plots=await page.evaluate(()=>window.__nexo.store.get().nodes.filter(n=>n.kind==='plot')),todo=plots.filter(n=>!n.finished);
 assert(todo.length>=1);assert.equal(await page.locator('.toolbar .draft').textContent(),`Draft · ${todo.length} to finish`);
 await page.getByRole('button',{name:'Figure page →',exact:true}).click();await page.locator('#world #figure-layer .figure-sheet').waitFor();
 await page.getByRole('tab',{name:/^Plots · /}).click();
 assert.equal(await page.locator('.figure-pending').textContent(),`${plots.length-todo.length} of ${plots.length} plots finished`);
 assert(await page.locator('.figure-plot-group legend').count());
 await page.getByRole('button',{name:'Reset order (tab order)',exact:true}).click();
 console.log(`PASS P3 ${name} figure-list-tab-groups-reset-order`);
 await page.getByRole('button',{name:`Finish ${todo[0].label}`,exact:true}).click();
 await page.waitForFunction(id=>!!window.__nexo.store.get().nodes.find(n=>n.id===id).finished,todo[0].id,{timeout:30000});
 await page.waitForFunction(t=>document.querySelector('.figure-pending')?.textContent===t,`${plots.length-todo.length+1} of ${plots.length} plots finished`);
 console.log(`PASS H8 ${name} figure-page-pending-count-and-finish-from-row`);
 // Steph review step 9: a finished plot the Figure 1 layout has no slot for is named in the page notice and marked in
 // the Plots column (the dashboard PCA fills panel B; the violin has no slot).
 const violin=await page.evaluate(()=>window.__nexo.store.get().nodes.find(n=>n.id==='results_dashboard-plot_violin'));
 if(!violin.finished){await page.getByRole('button',{name:`Finish ${violin.label}`,exact:true}).click();await page.waitForFunction(id=>!!window.__nexo.store.get().nodes.find(n=>n.id===id).finished,violin.id,{timeout:30000});}
 const leftOut=page.locator('.figure-left-out-note');
 assert.equal(await leftOut.count(),0,'Free shows every plot: no notice');
 await page.getByRole('tab',{name:'Page',exact:true}).click();await page.getByLabel('Layout',{exact:true}).selectOption('figure1');
 await leftOut.waitFor({timeout:3000});
 assert.equal(await leftOut.textContent(),`1 finished plot is not on this layout: ${violin.label}. Free shows it.`);
 assert.equal(await leftOut.getAttribute('role'),'status');
 await page.getByRole('tab',{name:/^Plots · /}).click();
 const row=page.locator('.figure-plot-group div',{hasText:violin.label});
 assert.match(await row.textContent(),/not on this layout/);
 assert.equal(await page.locator('.figure-plot-group .figure-left-out').count(),1);
 await undo(page);await leftOut.waitFor({state:'detached',timeout:3000});
 console.log(`PASS steph ${name} figure1-names-finished-plots-it-leaves-out`);
 await page.getByRole('button',{name:'← Draft',exact:true}).click();
 assert.deepEqual(errors,[]);console.log(`PASS H6c ${name} world-page editing undo redo bounds SVG reload 0 console errors screenshots 1440/390`);await context.close();
 } finally {await browser.close();}
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H6c Playwright: ${e.message}`); return; } throw e; }
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
  console.log('H6c OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
