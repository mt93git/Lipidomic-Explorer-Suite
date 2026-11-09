// P3 card chrome: mock build, Chromium and WebKit.
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
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:'',contentType:'text/css'}));
    await page.goto(`${base}/nexo/`);
    assert.equal(await page.getByLabel('Upload ZIP').count(), 1, 'start page accepts Team ZIPs');
    let failScript = true, releaseScript; const scriptPending = new Promise(resolve => { releaseScript=resolve; });
    await page.route('**/vendor/plotly.min.js', async route => { await scriptPending; return failScript ? route.abort() : route.continue(); });
    await page.getByRole('button', {name:/Synthetic demo/}).click();
    await page.waitForSelector('.card');
    await page.waitForFunction(() => document.activeElement?.id === 'viewport');
    const pca=card(page,'results_dashboard-plot_pca');
    await pca.getByText('Restoring Principal components…',{exact:true}).waitFor(); releaseScript();
    await pca.getByText('Couldn’t bring back Principal components.',{exact:true}).waitFor();
    failScript=false; await pca.getByRole('button',{name:'Try again',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.card[data-id="results_dashboard-plot_pca"] .card-status')?.dataset.state==='current');
    await page.getByRole('button',{name:'Canvas tools',exact:true}).click();
    await page.getByRole('button',{name:'Canvas help',exact:true}).click();
    const help=page.getByRole('dialog',{name:'Canvas help',exact:true});
    await help.waitFor(); assert.match(await help.textContent(), /Finish captures/);
    await page.keyboard.press('Escape'); assert.equal(await help.count(),0);
    await page.evaluate(()=>window.__nexo.handle.addCard('results_dashboard-plot_heat'));
    const heat=(await nodes(page)).find(n=>n.id.endsWith('-plot_heat'));
    await page.evaluate(id=>window.__nexo.handle.focusNode(id),heat.id);
    const c=card(page,heat.id);
    await page.evaluate(()=>window.__nexo.handle.fit());
    // Fit animates the camera: read the grip once it stops moving.
    let grip=null;for(let i=0;i<40;i++){const b=await c.locator('.resize-handle').boundingBox();if(grip&&b&&Math.abs(b.x-grip.x)<0.5&&Math.abs(b.y-grip.y)<0.5)break;grip=b;await page.waitForTimeout(50);}
    await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
    await page.mouse.move(grip.x+grip.width/2+32,grip.y+grip.height/2+24,{steps:4});
    assert.match(await c.getAttribute('data-resize-size'),/\d+ × \d+/);
    await page.mouse.up();assert.equal(await c.getAttribute('data-resize-size'),null);await undo(page);
    await c.getByRole('button',{name:'More card actions',exact:true}).click();
    await c.getByRole('button',{name:'Enlarge plot',exact:true}).click();
    const grown=(await nodes(page)).find(n=>n.id===heat.id);
    assert.equal(grown.width,Math.max(1000,heat.width)); assert.equal(grown.height,Math.max(1100,heat.height));
    await undo(page); assert.equal((await nodes(page)).find(n=>n.id===heat.id).width,heat.width);
    // A queued Library request remains cancellable while the server is occupied.
    await page.evaluate(()=>{const h=window.__nexo.handle;const real=h.addCard.bind(h);h.addCard=(source,signal)=>new Promise(resolve=>{signal.addEventListener('abort',resolve,{once:true});});window.__p3restore=()=>h.addCard=real;});
    if(await page.locator('.library-panel').isHidden())await page.locator('.rail').getByRole('button',{name:'Plots',exact:true}).click(); // the library opens closed (wave 1)
    await page.getByRole('button',{name:'Add Principal components',exact:true}).click();
    await page.getByRole('button',{name:'Cancel adding Principal components',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Add Principal components',exact:true}).isEnabled(),true);
    await page.evaluate(()=>window.__p3restore());
    const beforeKeyboard=(await nodes(page)).length;
    await page.getByRole('button',{name:'Add Principal components',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.id==='locate-results_dashboard-plot_pca');
    assert.equal((await nodes(page)).length,beforeKeyboard+1);await page.keyboard.press('Enter');
    assert.equal((await nodes(page)).length,beforeKeyboard+1);
    const gated=require(path.join(nexo,'src/mock/catalog.json')).outputs.find(e=>e.needs==='de');
    await page.evaluate(({id,source})=>window.__nexo.store.set(v=>({...v,nodes:v.nodes.map(n=>n.id===id?{...n,instance:{...n.instance,source}}:n)})),{id:heat.id,source:gated.id});
    await page.evaluate(id=>window.__nexo.handle.focusNode(id),heat.id);
    await c.getByRole('button',{name:'Study design',exact:true}).click();
    const design=page.getByRole('dialog',{name:'Confirm study design',exact:true});await design.waitFor();
    await design.getByRole('button',{name:'Cancel',exact:true}).click();
    const phoneContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    await phoneContext.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
    const phone=await phoneContext.newPage();await phone.goto(`${base}/nexo/?checkpoint=${checkpoint}`);await phone.waitForSelector('.card');
    assert.equal(await phone.getByRole('button',{name:'Select',exact:true}).count(),1);
    assert.equal(await phone.getByRole('button',{name:'Select (V)',exact:true}).count(),0);await phoneContext.close();
    console.log(`PASS P3 ${name} start-upload-focus-help-enlarge-undo-cancel-card-restore-retry-study-design`);
  } finally { await browser.close(); }
}

(async () => {
  if (process.argv.includes('--unit')) return;
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP P3 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('P3 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
