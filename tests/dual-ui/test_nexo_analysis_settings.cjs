// H3: schema inspector and renderer invalidation in Chromium and WebKit.
// node tests/dual-ui/test_nexo_inspector.cjs
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
const camera = page => page.$eval('#world', el => el.style.transform);
const percent = page => page.$eval('#hud', el => el.textContent.split('|')[1].trim());
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function focus(page) { await page.locator('#viewport').focus(); }
async function undo(page) { await focus(page); await page.keyboard.press('Control+z'); }
async function drag(page, id, dx, dy, resize = false) {
  const box = await card(page, id).locator(resize ? '.resize-handle' : 'header').boundingBox();
  assert(box, 'missing drag target');
  const x = box.x + (resize ? box.width / 2 : 40), y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
async function browserTests(pw,name,base) {
 const browser=await pw[name].launch();
 try {
 const context=await browser.newContext({viewport:{width:1920,height:1080}}), errors=[];
 context.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 context.on('weberror',e=>errors.push(e.error().message));
 const page=await context.newPage();
 await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
 await page.waitForSelector('.card .js-plotly-plot');
 const button=page.getByRole('button',{name:'Analysis settings',exact:true});
 await button.click();
 const panel=page.getByRole('dialog',{name:'Analysis settings',exact:true});
 await panel.getByLabel('Interaction',{exact:true}).check();
 await panel.locator('#int_ref_t2').waitFor();
 assert.equal(await panel.locator('#deReferenceGroups').count(),0);
 await panel.getByRole('button',{name:'Discard',exact:true}).click();
 await panel.locator('#deReferenceGroups').waitFor();
 assert.equal(await panel.locator('#int_ref_t2').count(),0);
 const before=await page.evaluate(()=>window.__nexoMock.renders);
 await panel.locator('#log2fcThreshold').fill('2');
 await panel.getByRole('button',{name:'Apply (1)',exact:true}).click();
 await page.waitForFunction(()=>window.__nexoAnalysisMock.patches.length===1);
 assert.deepEqual(await page.evaluate(()=>window.__nexoAnalysisMock.patches[0]),{log2fcThreshold:2});
 await page.waitForFunction(n=>window.__nexoMock.renders>n,before);
 assert.equal(await page.locator('.save-pill').getAttribute('data-state'),'dirty');
 console.log('PASS analysis '+name+' draft-conditions-apply-render');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForFunction(()=>window.__nexoAnalysisMock.patches.length===2);
 assert.deepEqual(await page.evaluate(()=>window.__nexoAnalysisMock.patches[1]),{log2fcThreshold:1});
 await page.waitForFunction(()=>document.querySelector('#log2fcThreshold')?.value==='1');
 await page.keyboard.press('Escape');
 await panel.waitFor({state:'hidden'});
 assert.equal(await button.evaluate(el=>el===document.activeElement),true);
 console.log('PASS analysis '+name+' undo-escape-focus');
 assert.deepEqual(errors,[]);console.log('PASS analysis '+name+' no-console-errors');
 await context.close();
 } finally {await browser.close();}
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP analysis Playwright: ${e.message}`); return; } throw e; }
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
  console.log('analysis OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
