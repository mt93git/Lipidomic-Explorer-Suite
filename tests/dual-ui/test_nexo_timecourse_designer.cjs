// Chart audit b10 F4: Team's longitudinal time-course designer in Nexo's Inspector Data tab (mock build, Chromium and
// WebKit, 1440x900). Buckets come from the card schema (computed controls case_bucket_<id>); every move is keyboard
// operable; a change sets the bucket like sortable's JS, presses Generate Analysis and redraws the card; duplicate and
// save/reopen keep it (Nexo's member). Check 11: a card waiting for Generate Analysis is not asked to render again.
// node tests/dual-ui/test_nexo_timecourse_designer.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/timecourse-designer');
const SOURCE = 'longitudinal_tab-macroclass_plot';
const B1 = 'case_bucket_case_673990', B2 = 'case_bucket_case_934241';
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
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
const instanceOf = (page, id) => page.evaluate(id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); return n.instance.instanceId ?? n.instance.id; }, id);
const label = (page, instance) => page.evaluate(i => window.__nexoMock.labels[i] ?? '', instance);
async function waitLabel(page, instance, re, what) {
  await page.waitForFunction(([i, src]) => new RegExp(src).test(window.__nexoMock.labels[i] ?? ''), [instance, re.source], { timeout: 10000 })
    .catch(async () => { throw new Error(`${what}: label ${JSON.stringify(await label(page, instance))}`); });
}
// The time courses are offered once the design is confirmed (the mock's time points, as in the layout sweep).
async function confirmDesign(page) {
  const panel = page.locator('.library-panel');
  if (await panel.isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
  await page.evaluate(() => document.querySelectorAll('#library-panel-plots details').forEach(d => { d.open = true; }));
  const row = page.locator('#library-panel-plots .library-row', { has: page.locator('strong', { hasText: /^Differential volcano$/ }) });
  await row.getByRole('button', { name: 'Confirm study design… (Differential volcano)', exact: true }).first().click();
  const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
  await design.getByLabel('Experimental unit').selectOption('Animal');
  await design.getByLabel('Sample relationship').selectOption('independent');
  await design.getByRole('button', { name: 'Confirm study design', exact: true }).click();
  await design.waitFor({ state: 'hidden' });
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    // The synthetic checkpoint reports time points (as the real one does, b10 F1): the mock's switch, set before load.
    await context.addInitScript(() => { const t = setInterval(() => { if (window.__nexoPrefetchMock) { window.__nexoPrefetchMock.timePoints = true; clearInterval(t); } }, 5); });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const inspector = page.locator('#inspector');
    await confirmDesign(page);
    const add = source => page.evaluate(async source => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard(source); return window.__nexo.store.get().nodes.find(n => !before.has(n.id) && n.instance?.source === source).id; }, source);
    const open = async id => { await page.evaluate(id => window.__nexo.handle.focusNode(id), id); await card(page, id).locator('header').click();
      await inspector.getByRole('tab', { name: 'Data', exact: true }).click(); };
    const id = await add(SOURCE), instance = await instanceOf(page, id);
    // 1. Check 11: before Generate Analysis the card names the step; it is not asked again while it waits.
    await card(page, id).getByRole('button', { name: 'Generate analysis', exact: true }).waitFor();
    const refusals = await page.evaluate(() => window.__nexoMock.refusals ?? 0);
    await page.evaluate(id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); window.__nexo.handle.setCardSize(id, { width: n.width + 60, height: n.height + 40 }); }, id);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.__nexoMock.refusals ?? 0), refusals, 'no render request while the card waits for Generate analysis');
    await card(page, id).getByRole('button', { name: 'Generate analysis', exact: true }).waitFor();
    console.log(`PASS F4 ${name} check11-no-render-while-waiting (${refusals} refusal before)`);
    // 2. The designer: one bucket per Timecourse with the module's items, in order.
    await open(id);
    const designer = inspector.getByRole('group', { name: 'Time courses', exact: true });
    await designer.waitFor();
    const items = bucket => designer.getByRole('region', { name: bucket, exact: true }).locator('.tc-item-name').allTextContents();
    assert.deepEqual(await items('Timecourse 1'), ['Cohort_A_T1', 'Cohort_A_T2']);
    assert.deepEqual(await items('Timecourse 2'), ['Cohort_B_T1', 'Cohort_B_T2']);
    console.log(`PASS F4 ${name} buckets-from-schema`);
    // 3. Keyboard only: Move… on Cohort_A_T1, Enter, the menu's "Move to Timecourse 2", Enter.
    let start = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await designer.getByRole('button', { name: 'Move Cohort_A_T1 to another time course', exact: true }).focus();
    await page.keyboard.press('Enter');
    const target = designer.getByRole('menuitem', { name: 'Move to Timecourse 2', exact: true });
    await target.waitFor();
    assert.equal(await target.evaluate(el => el === document.activeElement), true, 'the menu takes focus');
    await page.keyboard.press('Enter');
    await page.waitForFunction(([s, b1, b2]) => window.__nexoMock.cardPatches.slice(s).some(p => JSON.stringify(p.body.inputs[b1]) === '["Cohort_A_T2"]'
      && JSON.stringify(p.body.inputs[b2]) === '["Cohort_B_T1","Cohort_B_T2","Cohort_A_T1"]' && p.body.actions.includes('submit_longitudinal_btn')), [start, B1, B2]);
    await waitLabel(page, instance, /TC1: A_T2 \| TC2: B_T1\+B_T2\+A_T1$/, 'card redraws after the move');
    assert.deepEqual(await items('Timecourse 2'), ['Cohort_B_T1', 'Cohort_B_T2', 'Cohort_A_T1']);
    console.log(`PASS F4 ${name} keyboard-move-to-timecourse-2-redraws`);
    // 4. Remove one item with its × (keyboard: focus + Enter; Space is the canvas's pan key).
    start = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await designer.getByRole('button', { name: 'Remove Cohort_B_T1 from Timecourse 2', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(([s, b2]) => window.__nexoMock.cardPatches.slice(s).length > 0, [start, B2], { timeout: 5000 }).catch(async () => {
      await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'nexo-timecourse-debug.png') });
      throw new Error('no PATCH after the remove; focused: ' + await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200)) + ' items ' + JSON.stringify(await items('Timecourse 2'))); });
    await page.waitForFunction(([s, b2]) => window.__nexoMock.cardPatches.slice(s).some(p => JSON.stringify(p.body.inputs[b2]) === '["Cohort_B_T2","Cohort_A_T1"]'), [start, B2]);
    await waitLabel(page, instance, /TC1: A_T2 \| TC2: B_T2\+A_T1$/, 'card redraws after the remove');
    const member = await page.evaluate(id => window.__nexo.store.get().nexo.nodes[id]?.inputs, id);
    assert.deepEqual(member[B1], ['Cohort_A_T2']); assert.deepEqual(member[B2], ['Cohort_B_T2', 'Cohort_A_T1']);
    // Nexo's member only: the instance inputs (Team's validator) never carry a bucket.
    const instanceInputs = await page.evaluate(id => window.__nexo.store.get().nodes.find(n => n.id === id).instance.inputs ?? {}, id);
    assert.ok(!Object.keys(instanceInputs).some(k => k.startsWith('case_bucket_')), 'no bucket in the instance inputs');
    fs.mkdirSync(evidence, { recursive: true });
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-designer.png') });
    console.log(`PASS F4 ${name} remove-item-redraws-member-not-instance`);
    // 5. Duplicate: the copy carries the buckets in its own member.
    const before = new Set(await page.evaluate(() => window.__nexo.store.get().nodes.map(n => n.id)));
    await page.evaluate(id => window.__nexo.handle.duplicate(id), id);
    await page.waitForFunction(ids => window.__nexo.store.get().nodes.some(n => !ids.includes(n.id) && n.instance?.source === 'longitudinal_tab-macroclass_plot'), [...before]);
    const copy = await page.evaluate(ids => window.__nexo.store.get().nodes.find(n => !ids.includes(n.id) && n.instance?.source === 'longitudinal_tab-macroclass_plot').id, [...before]);
    const copied = await page.evaluate(id => window.__nexo.store.get().nexo.nodes[id]?.inputs, copy);
    assert.deepEqual(copied[B2], ['Cohort_B_T2', 'Cohort_A_T1']);
    console.log(`PASS F4 ${name} duplicate-keeps-buckets`);
    // 6. Save and reopen: the member is re-sent; the designer shows it and the card draws it after Generate analysis.
    await page.getByTitle('Open or save a checkpoint', { exact: true }).click();
    const checkpoints = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await checkpoints.getByLabel('New checkpoint name', { exact: true }).fill('Nexo time-course designer');
    await checkpoints.getByRole('button', { name: 'Save current analysis', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('checkpoint')?.length === 64);
    await checkpoints.waitFor({ state: 'detached' });
    await page.reload(); await page.waitForSelector(`.card[data-id="${id}"]`);
    // Steph review rows 2/12: saved with a confirmed design, the reopen asks for it at once, prefilled: one click.
    const asked = page.getByRole('dialog', { name: 'Confirm study design', exact: true });
    await asked.waitFor({ timeout: 10000 });
    await asked.getByRole('button', { name: 'Confirm study design', exact: true }).click(); await asked.waitFor({ state: 'hidden' });
    const reopened = await instanceOf(page, id);
    await page.waitForFunction(([i, b2]) => window.__nexoMock.cardPatches.some(p => p.instance === i && JSON.stringify(p.body.inputs[b2]) === '["Cohort_B_T2","Cohort_A_T1"]'), [reopened, B2]);
    await open(id);
    await designer.waitFor();
    assert.deepEqual(await items('Timecourse 2'), ['Cohort_B_T2', 'Cohort_A_T1']);
    assert.deepEqual(await items('Timecourse 1'), ['Cohort_A_T2']);
    const run = card(page, id).getByRole('button', { name: 'Generate analysis', exact: true });
    if (await run.isVisible()) await run.click();
    await waitLabel(page, reopened, /TC1: A_T2 \| TC2: B_T2\+A_T1$/, 'reopened card draws the saved time courses');
    console.log(`PASS F4 ${name} save-reopen-keeps-buckets`);
    // 7. Add Timecourse (Team's button in the Data tab) shows a new empty bucket.
    await inspector.getByRole('button', { name: 'Add Timecourse', exact: true }).click();
    await designer.getByRole('region', { name: 'Timecourse 3', exact: true }).waitFor();
    assert.deepEqual(await items('Timecourse 3'), []);
    await designer.getByRole('combobox', { name: 'Add a cohort to Timecourse 3', exact: true }).selectOption('Cohort_C_T1');
    await page.waitForFunction(() => window.__nexoMock.cardPatches.some(p => JSON.stringify(p.body.inputs.case_bucket_case_100001) === '["Cohort_C_T1"]'));
    await waitLabel(page, reopened, /TC3: C_T1$/, 'card redraws with the third time course');
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-add-timecourse.png') });
    console.log(`PASS F4 ${name} add-timecourse-empty-bucket`);
    assert.deepEqual(errors, []); console.log(`PASS F4 ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F4 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('F4 time-course designer OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
