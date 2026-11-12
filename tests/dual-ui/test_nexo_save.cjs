// H2 F: mock canvas editing using real pointers in Chromium and WebKit.
// node tests/dual-ui/test_nexo_save.cjs
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
// Row 14 (nexo-canvas-redesign-review.md): the save pill reads as one quiet control in every state; its text is AAA on the navy bar.
const pillMetrics = `(() => { const p = document.querySelector('.save-pill'); if (!p) return null; const cs = getComputedStyle(p), bar = getComputedStyle(document.querySelector('.topbar'));
  const rgb = v => { const m = v.match(/[\\d.]+/g) || []; return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 }; };
  const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const own = rgb(cs.backgroundColor), bg = own.a > 0.99 ? own : rgb(bar.backgroundColor), fg = rgb(cs.color);
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return { state: p.dataset.state, tag: p.tagName, text: p.textContent.trim(), nested: p.querySelectorAll('button').length, contrast: (hi + 0.05) / (lo + 0.05),
    height: Math.round(p.getBoundingClientRect().height), radius: cs.borderTopLeftRadius, font: cs.fontSize, weight: cs.fontWeight, borderWidth: cs.borderTopWidth }; })()`;
const pill = page => page.evaluate(pillMetrics);
const pillWhen = (page, part) => page.evaluate(`new Promise(resolve => { const tick = () => { const p = document.querySelector('.save-pill'); if (p && p.textContent.includes(${JSON.stringify(part)})) resolve(${pillMetrics}); else requestAnimationFrame(tick); }; tick(); })`);
function quiet(states, label) {
  for (const s of states) { assert(s.contrast >= 7, `${label} ${s.state}: ${s.contrast.toFixed(2)}:1 is under AAA 7:1`); assert.equal(s.nested, 0, `${label} ${s.state}: nested button`); }
  const [first, ...rest] = states;
  for (const s of rest) for (const k of ['height', 'radius', 'font', 'weight', 'borderWidth']) assert.equal(s[k], first[k], `${label}: ${k} changes between ${first.state} (${first[k]}) and ${s.state} (${s[k]})`);
}
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
  const context=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true});
  const errors=[];context.on('console',m=>{if(m.type()==='error')errors.push(m.text());});context.on('weberror',e=>errors.push(e.error().message));
  const page=await context.newPage();await page.goto(`${base}/nexo/?checkpoint=${checkpoint}`);await page.waitForSelector('.card');
  const original=await nodes(page),id=original[0].id;
  const states=[await pill(page)];assert.equal(states[0].state,'idle');assert.equal(states[0].text,'Autosave ready');
  await drag(page,id,85,50);await page.waitForFunction(()=>document.querySelector('.save-pill').textContent.includes('Unsaved changes · Autosave on'));
  states.push(await pill(page));assert.equal(states[1].state,'dirty');
  const moved=(await nodes(page)).find(n=>n.id===id);assert.notEqual(moved.x,original[0].x);
  const saving=pillWhen(page,'Saving…');
  await page.evaluate(()=>{void window.__nexo.autosave.flush();});
  await page.waitForFunction(()=>document.querySelector('.save-pill').textContent.includes('Saving…'));
  states.push(await saving);assert.equal(states[2].state,'saving');
  await page.waitForFunction(()=>document.querySelector('.save-pill').textContent.includes('Saved ·'));
  states.push(await pill(page));assert.equal(states[3].state,'saved');assert.match(states[3].text,/^Saved · \d{1,2}:\d{2}( [AP]M)?$/);
  console.log(`PASS H4 ${name} move-dirty-saving-saved`);
  // H8 journeys 8.1: a failed autosave says why once, and the pill retries on click.
  await page.evaluate(()=>{window.__nexoMock.saveFault='Checkpoint storage is full';});
  await drag(page,id,20,0);await page.evaluate(()=>{void window.__nexo.autosave.flush();});
  const retryPill=page.getByRole('button',{name:'Save failed · Retrying. Retry now',exact:true});await retryPill.waitFor();
  assert.equal(await retryPill.getAttribute('title'),'Checkpoint storage is full');
  states.push(await pill(page));assert.equal(states[4].state,'error');assert.equal(states[4].tag,'BUTTON');assert.equal(states[4].text,'Save failed · Retrying');
  quiet(states,`${name} save pill`);
  console.log(`PASS R14 ${name} save-pill-one-quiet-control-aaa`);
  await page.locator('.toast.is-error',{hasText:'Autosave failed: Checkpoint storage is full. Nexo keeps retrying; Download ZIP keeps a copy of your work.'}).waitFor({timeout:3000});
  await page.evaluate(()=>{delete window.__nexoMock.saveFault;});await retryPill.click();
  await page.waitForFunction(()=>document.querySelector('.save-pill').textContent.includes('Saved ·'));
  await page.evaluate(()=>window.__nexo.handle.undo());await page.evaluate(()=>{void window.__nexo.autosave.flush();});
  await page.waitForFunction(x=>window.__nexo.store.get().nodes[0].x===x&&document.querySelector('.save-pill').textContent.includes('Saved ·'),moved.x);
  console.log(`PASS H8 ${name} autosave-failure-reason-toast-retry-now`);
  await page.getByRole('button',{name:'Export figure ▾',exact:true}).click();
  await page.getByRole('button',{name:'Save checkpoint…',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Checkpoints',exact:true});
  await dialog.getByRole('textbox',{name:'New checkpoint name'}).fill('demo');
  await dialog.getByRole('button',{name:'Save current analysis',exact:true}).click();
  // H8 journeys 8.3/8.4: saving closes the dialog and says which checkpoint is now open; it is listed first, marked Current.
  await page.locator('.toast',{hasText:'Saved checkpoint demo. You are now working on it'}).waitFor({timeout:5000});await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Export figure ▾',exact:true}).click();await page.getByRole('button',{name:'Save checkpoint…',exact:true}).click();
  const row=dialog.locator('article').first();await row.waitFor();
  assert.equal(await row.getAttribute('aria-current'),'true');assert.equal(await row.locator('strong').textContent(),'demoCurrent');
  console.log(`PASS H8 ${name} named-save-closes-dialog-current-first`);
  const download=page.waitForEvent('download');await row.getByRole('button',{name:'Download',exact:true}).click();assert.match((await download).suggestedFilename(),/demo.*zip/);
  const savedId=new URL(page.url()).searchParams.get('checkpoint');assert.match(savedId,/^[a-f0-9]{64}$/);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.reload();await page.waitForSelector('.card');
  const restored=(await nodes(page)).find(n=>n.id===id);assert.equal(restored.x,moved.x);assert.equal(restored.y,moved.y);
  console.log(`PASS H4 ${name} named-save-list-download-reload-position`);
  // H8: the start page groups checkpoints (Team first, then named saves, then autosaves) and says when and where each came from.
  await page.goto(`${base}/nexo/`);const team=page.getByRole('region',{name:'Prepared in Team',exact:true});await team.waitFor();
  const regions=await page.locator('.picker-group h2').allTextContents();assert.equal(regions[0],'Prepared in Team');assert(regions.includes('Saved checkpoints'));
  assert.match(await team.locator('li').first().textContent(),/Synthetic demo.*From Team/);
  const saves=page.getByRole('region',{name:'Saved checkpoints',exact:true});assert.match(await saves.locator('li').first().textContent(),/demo.*\d.*Saved in Nexo/);
  await team.getByRole('link').first().click();await page.waitForSelector('.card');
  console.log(`PASS H8 ${name} picker-groups-team-first-with-date-and-source`);
  assert.deepEqual(errors,[]);console.log(`PASS H4 ${name} no-console-errors`);await context.close();
  // H8: a checkpoint that fails to open offers Try again (the same checkpoint) besides choosing another.
  const failing=await browser.newContext({viewport:{width:1280,height:800}});const fp=await failing.newPage();
  await fp.goto(`${base}/nexo/?checkpoint=missing-checkpoint`);await fp.getByRole('alert').waitFor();
  const retry=fp.getByRole('button',{name:'Try again',exact:true});await retry.waitFor();
  assert.equal(await fp.getByRole('button',{name:'Choose checkpoint',exact:true}).count(),1);
  await retry.click();await fp.getByRole('alert').waitFor();assert.equal(await retry.count(),1);
  console.log(`PASS H8 ${name} failed-open-offers-try-again`);await failing.close();
 } finally {await browser.close();}
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H4 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('H4 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
