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
async function browserTests(pw, name, base) {
 const browser=await pw[name].launch();
 try {
  const context=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true});
  const errors=[];
  context.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  context.on('weberror',e=>errors.push(e.error().message));
  const page=await context.newPage();
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
  const violin=card(page,'results_dashboard-plot_violin');
  await violin.locator('.js-plotly-plot').waitFor();
  await violin.locator('header').click();
  const inspector=page.locator('#inspector');
  await inspector.getByRole('tab',{name:'Statistics',exact:true}).click();
  const test=inspector.getByLabel('Test',{exact:true});
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Violin statistics"] fieldset').disabled);
  assert.equal(await test.inputValue(),'welch');
  // Establish an applied baseline so the second review has exactly two changes.
  await inspector.getByRole('button',{name:'Review and confirm…',exact:true}).click();
  await inspector.getByRole('button',{name:'Confirm and compute',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-statistics-status]')?.dataset.statisticsStatus==='ok' && !!window.__nexo.store.get().nodes.find(n=>n.id==='results_dashboard-plot_violin').statistics?.result);
  const renders=await page.evaluate(()=>window.__nexoMock.renders);
  await test.selectOption('wilcoxon');
  assert.equal(await inspector.getByLabel('Effect size',{exact:true}).inputValue(),'cliffs_delta');
  await inspector.getByRole('button',{name:'Review and confirm…',exact:true}).click();
  assert.equal(await inspector.getByRole('table',{name:'Settings changes'}).locator('tbody tr').count(),2);
  await inspector.getByRole('button',{name:'Confirm and compute',exact:true}).click();
  await page.waitForFunction(()=>window.__nexo.store.get().nodes.find(n=>n.id==='results_dashboard-plot_violin').statistics?.applied?.test==='wilcoxon');
  await page.waitForFunction(()=>document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.layout.annotations.length>0);
  // A check may still be running right after Confirm; assert once the status line settles.
  await page.waitForFunction(()=>!document.querySelector('#inspector [data-statistics-status]')?.textContent.includes('Checking or computing statistics'));
  assert.match(await inspector.locator('[data-statistics-status]').textContent(),/Statistics match/);
  assert.ok(await inspector.getByRole('table',{name:'Results for the displayed lipid'}).locator('tbody tr').count()>=1);
  assert.equal(await page.evaluate(()=>window.__nexoMock.renders),renders);
  // Group-size labels are separate from significance annotations.
  await inspector.getByLabel('Group size labels',{exact:true}).selectOption('hidden');
  await inspector.getByLabel('Show significance annotations',{exact:true}).uncheck();
  await page.waitForFunction(()=>document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.layout.annotations.length===0);
  assert.equal(await page.evaluate(()=>window.__nexoMock.renders),renders);
  const download=page.waitForEvent('download');
  await inspector.getByRole('button',{name:'Statistics CSV',exact:true}).click();
  assert.equal((await download).suggestedFilename(),'statistics.csv');
  // Undo the two display edits, the second computation, then the baseline.
  for(let i=0;i<4;i++)await undo(page);
  await page.waitForFunction(()=>!window.__nexo.store.get().nodes.find(n=>n.id==='results_dashboard-plot_violin').statistics);
  assert.deepEqual(errors,[]);
  console.log('PASS H5 '+name+' analysis-diff-confirm-annotations-display-csv-undo-no-requests-no-console-errors');
  // H8 journeys 4.1/4.2: the card says it carries statistics; a Data change that alters the plotted values
  // clears them at once (one undo step with the change), and the card says they need review.
  const stats=()=>page.evaluate(()=>window.__nexo.store.get().nodes.find(n=>n.id==='results_dashboard-plot_violin').statistics);
  await inspector.getByRole('button',{name:'Review and confirm…',exact:true}).click();
  await inspector.getByRole('button',{name:'Confirm and compute',exact:true}).click();
  await page.waitForFunction(()=>!!window.__nexo.store.get().nodes.find(n=>n.id==='results_dashboard-plot_violin').statistics?.result);
  const marker=violin.locator('header .card-stats');
  await page.waitForFunction(()=>document.querySelector('.card[data-id="results_dashboard-plot_violin"] header .card-stats')?.textContent==='Statistics');
  const firstPrint=(await stats()).result.dataFingerprint;
  assert.match(firstPrint,/^[a-f0-9]{64}$/); // the canvas validator only saves 64-hex prints, as the server's sha256
  await inspector.getByRole('tab',{name:'Data',exact:true}).click();
  await inspector.locator('#violin_lipid[role=listbox]').getByRole('option',{name:'PE(18:0/20:4)',exact:true}).click();
  await page.waitForFunction(()=>{const st=window.__nexo.store.get().nodes.find(n=>n.id==='results_dashboard-plot_violin').statistics;return !!st?.applied&&!st.result;});
  assert.equal(await marker.textContent(),'Statistics out of date');
  await page.locator('.toast',{hasText:'Statistics cleared: the plotted data changed.'}).waitFor({timeout:3000});
  await page.waitForFunction(()=>!(document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.layout.annotations??[]).some(a=>String(a.name??'').startsWith('tcstat-')));
  await undo(page);
  await page.waitForFunction(()=>{const n=window.__nexo.store.get().nodes.find(n=>n.id==='results_dashboard-plot_violin');return !!n.statistics?.result&&window.__nexo.store.get().nexo.nodes[n.id]?.inputs?.violin_lipid==='PC(16:0/18:1)';});
  assert.equal(await marker.textContent(),'Statistics');
  assert.equal((await stats()).result.dataFingerprint,firstPrint); // back on PC(16:0/18:1), the print of that lipid's data
  assert.deepEqual(errors,[]);
  console.log('PASS H8 '+name+' statistics-marker-and-cleared-after-data-change-one-undo-step');
  // A violin added from the Library keeps its id in instance.instanceId (checkpoint cards use instance.id):
  // statistics, the marker and the Data-change recheck must reach the server with that id.
  if(!(await page.locator('.library-panel:not([hidden])').count()))await page.getByRole('button',{name:/^Plots/}).first().click();
  await page.evaluate(()=>document.querySelectorAll('.library-panel details').forEach(d=>{d.open=true;}));
  const before=(await nodes(page)).length;
  await page.locator('button.library-add[aria-label="Add Feature distributions"]').first().click();
  await page.waitForFunction(n=>window.__nexo.store.get().nodes.length>n&&document.querySelector('.card.selected'),before);
  const added=(await nodes(page)).at(-1);assert.ok(added.instance?.instanceId&&added.instance.source==='results_dashboard-plot_violin');
  const addedCard=card(page,added.id);
  await inspector.getByRole('tab',{name:'Statistics',exact:true}).click();
  await inspector.getByRole('button',{name:'Review and confirm…',exact:true}).click({timeout:10000});
  await inspector.getByRole('button',{name:'Confirm and compute',exact:true}).click({timeout:10000});
  await addedCard.locator('header .card-stats',{hasText:/^Statistics$/}).waitFor({timeout:10000});
  await inspector.getByRole('tab',{name:'Data',exact:true}).click();
  await inspector.locator('#violin_lipid[role=listbox]').getByRole('option',{name:'PE(18:0/20:4)',exact:true}).click();
  await addedCard.locator('header .card-stats',{hasText:'Statistics out of date'}).waitFor({timeout:10000});
  assert.deepEqual(errors,[]);
  console.log('PASS H8 '+name+' statistics-on-a-library-added-violin');
  await context.close();
 } finally {await browser.close();}
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H5 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('H5 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
