// Targeted lipid cohort panel (Team's Single Lipid Analysis Mode) in Chromium and WebKit (mock build).
// node tests/dual-ui/test_nexo_cohort.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const axePath = path.join(nexo, 'node_modules/axe-core/axe.min.js');
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

async function seriousAxe(page, selector) {
 await page.addScriptTag({ path: axePath });
 const violations = await page.evaluate(async s => (await window.axe.run(document.querySelector(s), { resultTypes: ['violations'] })).violations
  .filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`), selector);
 assert.deepEqual(violations, [], 'axe serious/critical in the cohort panel');
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
 const trigger=page.locator('[data-cohort-trigger]'), chip=page.locator('.cohort-chip');
 assert.equal(await chip.count(),0);
 await trigger.click();
 const panel=page.getByRole('dialog',{name:'Targeted lipids',exact:true});
 await panel.getByText('0 of 19 selected').waitFor();
 await seriousAxe(page,'.cohort-sheet');
 await panel.getByRole('searchbox',{name:'Search lipids'}).fill('d18:1');
 assert.deepEqual(await panel.locator('.cohort-class-head span[id]').allTextContents(),['Cer','SM']);
 await panel.getByRole('searchbox',{name:'Search lipids'}).fill('');
 await panel.getByRole('checkbox',{name:'Select class TG',exact:true}).check();
 await panel.getByText('5 of 19 selected').waitFor();
 await panel.getByRole('checkbox',{name:'TG(50:1)',exact:true}).uncheck();
 await panel.getByRole('button',{name:'Invert',exact:true}).click();
 await panel.getByText('15 of 19 selected').waitFor();
 await panel.getByRole('button',{name:'Invert',exact:true}).click();
 const before=await page.evaluate(()=>window.__nexoMock.renders);
 await panel.getByRole('button',{name:'Apply (4)',exact:true}).click();
 await panel.waitFor({state:'hidden'});
 assert.deepEqual(await page.evaluate(()=>window.__nexoCohortMock.puts.at(-1)),['TG(52:2)','TG(52:3)','TG(54:3)','TG(54:4)']);
 await page.waitForFunction(n=>window.__nexoMock.renders>n,before);
 await page.locator('.toast').getByText('Targeted lipids applied: 4 lipids').waitFor();
 assert.equal(await chip.getByRole('button',{name:/^Targeted: 4 lipids/}).count(),1);
 assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
 console.log('PASS cohort '+name+' search-class-invert-apply-render-chip');
 // Reload keeps the cohort: autosave writes the checkpoint, the URL names it.
 await page.evaluate(()=>window.__nexo.autosave.flush());
 await page.waitForFunction(()=>document.querySelector('.save-pill').textContent.includes('Saved ·'));
 await page.reload();await page.waitForSelector('.card .js-plotly-plot');
 await chip.getByText('Targeted: 4 lipids').waitFor();
 console.log('PASS cohort '+name+' reload-keeps-cohort');
 const cleared=await page.evaluate(()=>window.__nexoMock.renders);
 await chip.getByRole('button',{name:'Clear targeted lipids',exact:true}).click();
 await chip.waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>window.__nexoCohortMock.puts.at(-1)),[]);
 await page.waitForFunction(n=>window.__nexoMock.renders>n,cleared);
 console.log('PASS cohort '+name+' clear-restores');
 await trigger.click();
 await panel.getByRole('checkbox',{name:'Select class PC',exact:true}).check();
 await panel.getByRole('button',{name:'Apply (4)',exact:true}).waitFor();
 await panel.getByRole('button',{name:'Cancel',exact:true}).click();
 await panel.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS cohort '+name+' no-console-errors');
 await context.close();
 } finally {await browser.close();}
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP cohort Playwright: ${e.message}`); return; } throw e; }
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
  console.log('cohort OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
