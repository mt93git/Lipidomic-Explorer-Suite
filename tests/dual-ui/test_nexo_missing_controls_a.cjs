// missing-controls-a: two Team controls the Nexo Data tab lacked. Mock build, Chromium and WebKit, 1440x900.
// 1. Chart audit b07 F4: after "Initiate Structural Analysis" the species card's Data tab shows Team's
//    "Select Shifts to Visualize:" (selectedDetails, instance input) with Team's default; picking shifts and
//    "Load Species Plot" draws them. The differential tab's controls are titled as Team titles that tab.
// 2. Chart audit b09: the FLA logratio card offers Team's index picker (sel_<category>, computed, Nexo's member);
//    a change redraws the card; duplicate and save/reopen keep it.
// node tests/dual-ui/test_nexo_missing_controls_a.cjs
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
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/missing-controls-a');
const SPECIES = 'structural_tab-speciesPlotPlot', FLA = 'fla_tab-logratioPlot';
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
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.3));
    const inspector = page.locator('#inspector');
    // The species plot needs a confirmed design (the Library's "Confirm study design" dialog, covered by other
    // suites); this suite sets the confirmed design the mock API would return.
    await page.evaluate(() => Object.assign(window.__nexo.handle.getSession(), { design: { allowed: true, unit: 'animal', type: 'independent', confirmed: true } }));
    const add = source => page.evaluate(async source => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard(source); return window.__nexo.store.get().nodes.find(n => !before.has(n.id) && n.instance?.source === source).id; }, source);
    const instanceOf = id => page.evaluate(id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); return n.instance.instanceId ?? n.instance.id; }, id);
    const label = instance => page.evaluate(i => window.__nexoMock.labels[i] ?? '', instance);
    const waitLabel = (instance, re, what) => page.waitForFunction(([i, re]) => new RegExp(re).test(window.__nexoMock.labels[i] ?? ''), [instance, re.source], { timeout: 10000 })
      .catch(async () => { throw new Error(`${what}: label ${JSON.stringify(await label(instance))}`); });
    const open = async id => { await page.evaluate(id => window.__nexo.handle.focusNode(id), id); await card(page, id).locator('header').click();
      await inspector.getByRole('tab', { name: 'Data', exact: true }).click(); };
    fs.mkdirSync(evidence, { recursive: true });

    // --- 1. Species plot ---------------------------------------------------------------------------------------
    const speciesId = await add(SPECIES), species = await instanceOf(speciesId);
    await open(speciesId);
    const initiate = inspector.getByRole('button', { name: 'Initiate Structural Analysis', exact: true });
    await initiate.waitFor();
    assert.equal(await inspector.getByText('Select Shifts to Visualize:', { exact: true }).count(), 0, 'no shift selector before the action');
    await waitLabel(species, /Initiate Structural Analysis/, 'placeholder before the action');
    // The differential tab's controls: Team's tab title, never the raw value.
    assert.equal(await inspector.locator('legend', { hasText: 'Differential Acyl Chain Expression' }).count(), 1, 'differential tab titled as in Team');
    assert.equal(await inspector.locator('legend', { hasText: 'differential_view' }).count(), 0, 'no raw differential_view heading');
    console.log(`PASS MCA ${name} species-before-action-no-selector-titled-groups`);
    await initiate.click();
    const shifts = inspector.locator('select#selectedDetails');
    await shifts.waitFor({ timeout: 10000 }).catch(() => { throw new Error('no "Select Shifts to Visualize:" after Initiate Structural Analysis'); });
    assert.equal(await inspector.getByText('Select Shifts to Visualize:', { exact: true }).count(), 1);
    assert.deepEqual(await shifts.evaluate(s => [...s.selectedOptions].map(o => o.value)), ['PC | PC 34:1', 'PE | PE 36:2', 'TG | TG 52:2', 'SM | SM d18:1/16:0'], "Team's default: the first four shifts");
    assert.equal(await shifts.locator('option').count(), 6);
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-species-after-initiate.png') });
    console.log(`PASS MCA ${name} species-selector-after-initiate-team-default`);
    let start = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await shifts.selectOption(['TG | TG 52:2', 'CE | CE 18:2']);
    await page.waitForFunction(start => window.__nexoMock.cardPatches.slice(start).some(p => JSON.stringify(p.body.inputs.selectedDetails) === '["TG | TG 52:2","CE | CE 18:2"]'), start, { timeout: 10000 });
    await inspector.getByRole('button', { name: 'Load Species Plot', exact: true }).click();
    await waitLabel(species, /· 2 shifts: TG \| TG 52:2, CE \| CE 18:2$/, 'Load Species Plot draws the picked shifts');
    await page.waitForTimeout(300);
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-species-drawn.png') });
    console.log(`PASS MCA ${name} species-pick-shifts-load-draws`);

    // --- 2. FLA index picker -----------------------------------------------------------------------------------
    const flaId = await add(FLA), fla = await instanceOf(flaId);
    await open(flaId);
    const structural = inspector.getByRole('group', { name: 'Structural', exact: true });
    await structural.waitFor({ timeout: 10000 }).catch(() => { throw new Error('no FLA index picker (sel_Structural) in the Data tab'); });
    for (const category of ['Structural', 'Lysosomal Hydrolysis & Eicosanoids', 'Energy'])
      assert.equal(await inspector.getByRole('group', { name: category, exact: true }).count(), 1, `picker for ${category}`);
    const checked = async group => inspector.getByRole('group', { name: group, exact: true }).getByRole('checkbox', { checked: true })
      .evaluateAll(cs => cs.map(c => c.value));
    assert.deepEqual(await checked('Structural'), ['PE/PC_Index', '(LPC+LPE)/PL_Index']);
    assert.deepEqual(await checked('Energy'), ['Energy_Load_Index']);
    await waitLabel(fla, /· 3 indices: PE\/PC_Index, \(LPC\+LPE\)\/PL_Index, Energy_Load_Index$/, "Team's three default indices");
    start = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await structural.getByRole('checkbox', { name: 'SM/PC', exact: true }).check();
    await page.waitForFunction(start => window.__nexoMock.cardPatches.slice(start).some(p => JSON.stringify(p.body.inputs.sel_Structural) === '["PE/PC_Index","(LPC+LPE)/PL_Index","SM/PC_Index"]'), start, { timeout: 10000 });
    await waitLabel(fla, /· 4 indices: .*SM\/PC_Index/, 'the card redraws with the added index');
    const member = await page.evaluate(id => window.__nexo.store.get().nexo.nodes[id]?.inputs, flaId);
    assert.deepEqual(member, { sel_Structural: ['PE/PC_Index', '(LPC+LPE)/PL_Index', 'SM/PC_Index'] }, "kept in Nexo's member");
    const instanceInputs = await page.evaluate(id => window.__nexo.store.get().nodes.find(n => n.id === id).instance.inputs ?? {}, flaId);
    assert.ok(!('sel_Structural' in instanceInputs), 'not in the instance inputs Team saves');
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-fla-index-picker.png') });
    console.log(`PASS MCA ${name} fla-index-picker-member-redraw`);
    // Duplicate: the copy carries the pick and draws it.
    const before = await page.evaluate(() => window.__nexo.store.get().nodes.map(n => n.id));
    await page.evaluate(id => window.__nexo.handle.duplicate(id), flaId);
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length > n, before.length);
    const copyId = await page.evaluate(before => window.__nexo.store.get().nodes.find(n => !before.includes(n.id)).id, before);
    assert.deepEqual(await page.evaluate(id => window.__nexo.store.get().nexo.nodes[id]?.inputs, copyId), member, 'the duplicate keeps the pick');
    await waitLabel(await instanceOf(copyId), /· 4 indices: .*SM\/PC_Index/, 'the duplicate draws the pick');
    console.log(`PASS MCA ${name} fla-duplicate-keeps-pick`);
    // Save, reopen: the member is re-sent and the picker shows it.
    await page.getByTitle('Open or save a checkpoint', { exact: true }).click();
    const checkpoints = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await checkpoints.getByLabel('New checkpoint name', { exact: true }).fill('Nexo FLA index round trip');
    await checkpoints.getByRole('button', { name: 'Save current analysis', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('checkpoint')?.length === 64);
    await checkpoints.waitFor({ state: 'detached' });
    await page.reload(); await page.waitForSelector(`.card[data-id="${flaId}"]`);
    await waitLabel(await instanceOf(flaId), /· 4 indices: .*SM\/PC_Index/, 'reopen re-sends the pick');
    await open(flaId);
    await structural.waitFor();
    assert.deepEqual(await checked('Structural'), ['PE/PC_Index', '(LPC+LPE)/PL_Index', 'SM/PC_Index']);
    console.log(`PASS MCA ${name} fla-save-reopen-keeps-pick`);
    assert.deepEqual(errors, []); console.log(`PASS MCA ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP MCA Playwright: ${e.message}`); return; } throw e; }
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
  console.log('missing-controls-a OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
