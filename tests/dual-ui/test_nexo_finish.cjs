// H6b: real finished snapshots and illustrations, mock only, Chromium and WebKit.
// node tests/dual-ui/test_nexo_finish.cjs
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
async function focus(page) { await page.locator('#viewport').focus(); }
async function undo(page) { await focus(page); await page.keyboard.press('Control+z'); }
async function browserTests(pw,name,base) {
 const browser=await pw[name].launch();
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  const errors=[];context.on('console',m=>{if(m.type()==='error')errors.push(m.text());});context.on('weberror',e=>errors.push(e.error().message));
  const page=await context.newPage();await page.goto(`${base}/nexo/?checkpoint=${checkpoint}`);await page.waitForSelector('.card');
  const id='results_dashboard-plot_violin', c=card(page,id);
  await page.evaluate(()=>window.__nexo.handle.zoomTo(1));
  await c.locator('.js-plotly-plot').waitFor();
  await page.waitForFunction(id=>document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state==='current',id);
  await c.getByRole('button',{name:'More card actions',exact:true}).click();
  await c.getByRole('button',{name:'Finish plot',exact:true}).click();
  await c.locator('.card-status[data-state="finished"]').waitFor();
  assert.match(await c.locator('.body img').getAttribute('src'),/^data:image\/svg\+xml/);
  assert.equal(await c.locator('.card-status').getAttribute('aria-label'),'Finished');
  await undo(page);await c.locator('.js-plotly-plot').waitFor();
  await focus(page);await page.keyboard.press('Control+Shift+z');await c.locator('.body img').waitFor();
  await c.getByRole('button',{name:'More card actions',exact:true}).click();await c.getByRole('button',{name:'Edit figure',exact:true}).click();await c.locator('.js-plotly-plot').waitFor();
  await page.waitForFunction(id=>document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state==='current',id);
  await page.evaluate(id=>window.__nexo.handle.finishCard(id),id);await c.locator('.card-status[data-state="finished"]').waitFor();
  console.log(`PASS H6b ${name} violin-svg-undo-redo-edit`);
  // H7b: Finish right after adding a plot waits for the in-flight render instead of refusing.
  const refusals=[];await page.exposeFunction('__h7bRefusal',text=>refusals.push(text));
  await page.evaluate(text=>new MutationObserver(()=>{if(document.body.innerText.includes(text))window.__h7bRefusal(text);}).observe(document.body,{childList:true,subtree:true,characterData:true}),'Wait for preparation and this plot to finish updating');
  const plotSource=require(path.join(nexo,'src/mock/catalog.json')).outputs.find(e=>e.render==='plotly'&&!e.id.startsWith('results_dashboard')&&!/VectorPlot$/.test(e.id));assert(plotSource);
  const fresh=(await nodes(page)).map(n=>n.id);
  await page.evaluate(source=>window.__nexo.handle.addCard(source),plotSource.id);
  const added=(await nodes(page)).find(n=>!fresh.includes(n.id));assert(added);
  const a=card(page,added.id);
  await a.getByRole('button',{name:'More card actions',exact:true}).click();
  await a.getByRole('button',{name:'Finish plot',exact:true}).click();
  await a.locator('.card-status[data-state="finished"]').waitFor({timeout:15000});
  assert.match((await nodes(page)).find(n=>n.id===added.id).finished.url,/^data:image\/svg\+xml/);
  assert.deepEqual(refusals,[]);
  console.log(`PASS H7b ${name} finish-immediately-after-add waits-no-refusal`);
  const imageSource=require(path.join(nexo,'src/mock/catalog.json')).outputs.find(e=>e.render==='png');assert(imageSource);
  const before=(await nodes(page)).map(n=>n.id);
  await page.evaluate(source=>window.__nexo.handle.addCard(source),imageSource.id);
  const image=(await nodes(page)).find(n=>!before.includes(n.id));assert(image);
  await page.evaluate(()=>window.__nexo.handle.fit());
  await card(page,image.id).locator('.body img').waitFor();
  await page.waitForFunction(id=>{const img=document.querySelector(`.card[data-id="${id}"] .body img`);return img?.complete&&img.naturalWidth>0;},image.id);
  await page.evaluate(id=>window.__nexo.handle.finishCard(id),image.id);
  await card(page,image.id).locator('.card-status[data-state="finished"]').waitFor();
  assert.match((await nodes(page)).find(n=>n.id===image.id).finished.url,/^data:image\/png/);
  console.log(`PASS H6b ${name} image-png`);
  // Live journeys: Team's pathway network draws live (Team's vis-network); frozen, it is the image of that
  // drawing; Finish captures it as a PNG. Before, the card asked the API for a PNG it cannot make.
  const netBefore=(await nodes(page)).map(n=>n.id);
  await page.evaluate(()=>window.__nexo.handle.addCard('pathway_tab-pathwayVisNetwork'));
  const net=(await nodes(page)).find(n=>!netBefore.includes(n.id));assert(net);
  await page.evaluate(id=>{window.__nexo.handle.zoomTo(1);window.__nexo.handle.focusNode(id);},net.id);
  const nc=card(page,net.id);
  await nc.locator('.body .network canvas').waitFor({timeout:15000});
  await page.waitForFunction(id=>document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state==='current',net.id,{timeout:15000});
  await page.evaluate(()=>window.__nexo.handle.zoomTo(.3));
  await page.waitForFunction(id=>{const img=document.querySelector(`.card[data-id="${id}"] .body img`);return img?.complete&&img.naturalWidth>0;},net.id,{timeout:15000});
  await page.evaluate(id=>window.__nexo.handle.finishCard(id),net.id);
  await nc.locator('.card-status[data-state="finished"]').waitFor({timeout:15000});
  assert.match((await nodes(page)).find(n=>n.id===net.id).finished.url,/^data:image\/png/);
  console.log(`PASS H8 ${name} pathway-network-live-frozen-finish`);
  await page.getByRole('button',{name:'+ Add plot',exact:true}).click();
  await page.getByRole('tab',{name:'Illustrations',exact:true}).click();
  await page.getByRole('button',{name:'Add LC–MS instrument',exact:true}).click();
  const art=(await nodes(page)).filter(n=>n.assetId==='lc-ms').at(-1);assert(art);
  await page.evaluate(()=>window.__nexo.handle.fit());
  if (await page.locator('.library-panel').isVisible()) await page.locator('.rail').getByRole('button',{name:'Plots',exact:true}).click();
  await card(page,art.id).locator('.body').click();
  await card(page,art.id).locator('.card-actions').getByRole('button',{name:'Edit',exact:true}).click();
  const accent=page.locator('#inspector input[type="color"]');await accent.evaluate(input=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'#abcdef');
   input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(id=>window.__nexo.store.get().nodes.find(n=>n.id===id)?.color==='#abcdef',art.id);
  const svgUrl=(await nodes(page)).find(n=>n.id===art.id).finished.url;assert(decodeURIComponent(svgUrl).includes('#abcdef'));
  const allSvgParse=await page.evaluate(()=>window.__nexo.store.get().nodes.filter(n=>n.finished?.url.startsWith('data:image/svg+xml')).every(n=>!new DOMParser().parseFromString(decodeURIComponent(n.finished.url.split(',').slice(1).join(',')),'image/svg+xml').querySelector('parsererror')));assert(allSvgParse);
  console.log(`PASS H6b ${name} illustration-accent-svg-parses`);
  await page.evaluate(()=>window.__nexo.autosave.flush());
  await page.waitForFunction(()=>document.querySelector('.save-pill').textContent.includes('Saved ·'));
  await page.reload();await page.waitForSelector('.card');
  const restored=await nodes(page);assert.match(restored.find(n=>n.id===id).finished.url,/^data:image\/svg\+xml/);assert.equal(restored.find(n=>n.id===art.id).finished.url,svgUrl);
  const fs=require('node:fs');fs.mkdirSync('/tmp/nexo-h6b',{recursive:true});await page.screenshot({path:`/tmp/nexo-h6b/${name}-1440.png`});
  assert.deepEqual(errors,[]);console.log(`PASS H6b ${name} save-reload screenshot-1440 no-console-errors`);
  await context.close();
 }finally{await browser.close();}
}

(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H6b Playwright: ${e.message}`); return; } throw e; }
  run('sh', ['scripts/vendor-plotly.sh']);
  run('sh', ['scripts/vendor-visnetwork.sh']);
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
  console.log('H6b OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
