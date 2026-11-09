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
// Computed controls (Team's renderUI per group / per sample): a group colour and a pch shape on the QC boxplot,
// two BQC samples on the BQC card; they survive save/reopen in Nexo's member and the mock render shows them.
async function computedJourney(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const inspector = page.locator('#inspector');
    const add = source => page.evaluate(async source => { const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard(source); return window.__nexo.store.get().nodes.find(n => !before.has(n.id) && n.instance?.source === source).id; }, source);
    const instanceOf = id => page.evaluate(id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); return n.instance.instanceId ?? n.instance.id; }, id);
    const open = async id => { await page.evaluate(id => window.__nexo.handle.focusNode(id), id); await card(page, id).locator('header').click();
      await inspector.getByRole('tab', {name:'Data',exact:true}).click(); };
    // Pilot F1: per-group pickers are offered where they reach a canvas copy's plot (the cellular polar map).
    const boxId = await add('cellular_org_tab-polarPlot'), bqcId = await add('qc_pca_tab-bqcPlot');
    await open(boxId);
    const colour = inspector.getByLabel('Colour for Control', {exact:true}), shape = inspector.getByRole('combobox', {name:'Shape for Control',exact:true});
    await shape.waitFor();
    // Team's shape choices: names shown, ggplot pch numbers sent.
    assert.deepEqual(await shape.locator('option').evaluateAll(os => os.map(o => [o.value, o.textContent.replace(/^\S+\s/, '')])),
      [['16','Circle'],['15','Square'],['17','Triangle'],['18','Diamond'],['3','Plus'],['4','Cross'],['8','Star']]);
    let start = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await colour.fill('#aa3300');
    await shape.selectOption('17');
    await page.waitForFunction(start => { const ps = window.__nexoMock.cardPatches.slice(start);
      return ps.some(p => p.body.inputs.customCol_Control === '#aa3300') && ps.some(p => p.body.inputs.customShape_Control === '17'); }, start);
    await open(bqcId);
    const samples = inspector.getByRole('group', {name:'Selected BQC Samples',exact:true});
    // Real checkpoints carry dozens of long sample ids: no sample name may spill past its own row (an unclipped
    // overflow drew ids over the next column's checkboxes on a 66-sample pilot checkpoint).
    const spill = await samples.evaluate(g => [...g.querySelectorAll('label, label *')].filter(e => e.scrollWidth > e.clientWidth + 1 &&
      getComputedStyle(e).overflowX === 'visible').map(e => e.textContent));
    assert.deepEqual(spill, [], 'BQC sample names overflow their rows: ' + spill.slice(0, 3).join(', '));
    start = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await samples.getByRole('checkbox', {name:'Pool_QC_Replicate_S02',exact:true}).check();
    await samples.getByRole('checkbox', {name:'Pool_QC_Replicate_S05',exact:true}).check();
    await page.waitForFunction(start => window.__nexoMock.cardPatches.slice(start).some(p => JSON.stringify(p.body.inputs.bqcSamples) === '["Pool_QC_Replicate_S02","Pool_QC_Replicate_S05"]'), start);
    assert.equal(await inspector.getByRole('status').filter({hasText:'samples selected'}).textContent(), '2 of 66 samples selected');
    await page.getByTitle('Open or save a checkpoint',{exact:true}).click();
    const checkpoints = page.getByRole('dialog',{name:'Checkpoints',exact:true});
    await checkpoints.getByLabel('New checkpoint name',{exact:true}).fill('Nexo computed round trip');
    await checkpoints.getByRole('button',{name:'Save current analysis',exact:true}).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('checkpoint')?.length === 64);
    await checkpoints.waitFor({state:'detached'});
    await page.reload(); await page.waitForSelector(`.card[data-id="${boxId}"]`);
    const boxInstance = await instanceOf(boxId), bqcInstance = await instanceOf(bqcId);
    // The reopen re-sends the member: the mock render label carries the values again.
    await page.waitForFunction(([b, q]) => /· #aa3300 Triangle$/.test(window.__nexoMock.labels[b] ?? '') && /· 2 BQC samples$/.test(window.__nexoMock.labels[q] ?? ''), [boxInstance, bqcInstance]);
    await open(boxId);
    await shape.waitFor();
    assert.equal(await colour.inputValue(), '#aa3300');
    assert.equal(await shape.inputValue(), '17');
    await open(bqcId);
    await samples.waitFor();
    assert.deepEqual(await samples.getByRole('checkbox', {checked:true}).evaluateAll(cs => cs.map(c => c.parentElement.textContent)), ['Pool_QC_Replicate_S02','Pool_QC_Replicate_S05']);
    assert.deepEqual(errors, []);
    console.log('PASS C1 ' + name + ' computed-colour-shape-bqc-save-reopen-render-label');
    await context.close();
  } finally { await browser.close(); }
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const violin = card(page, 'results_dashboard-plot_violin');
    await violin.locator('header').click();
    await page.waitForFunction(() => document.querySelector('#inspector')?.textContent.includes('Feature distributions'));
    const inspector = page.locator('#inspector');
    assert.equal(await inspector.getByRole('tab', {name:'Data',exact:true}).count(),1);
    const select = inspector.getByRole('listbox', {name:'Lipid',exact:true});
    await select.waitFor();
    await page.waitForFunction(() => document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.data?.length > 0);
    const before = await page.evaluate(() => window.__nexoMock.renders);
    const lipidFilter = inspector.getByRole('searchbox', {name:'Filter Lipid',exact:true});
    await lipidFilter.fill('20:4');
    assert.equal(await select.getByRole('option').count(), 3);
    await select.getByRole('option', {name:'PE(18:0/20:4)',exact:true}).click();
    await lipidFilter.fill('');
    await page.waitForFunction(n => window.__nexoMock.renders > n,before);
    await page.waitForFunction(() => document.querySelector('#inspector [role=status]')?.textContent === 'Up to date');
    // A fixed dashboard card keeps its inputs in Nexo's member: Team's node stays without an instance (it must save).
    assert.equal((await nodes(page)).find(n=>n.id==='results_dashboard-plot_violin').instance,undefined);
    assert.equal(await page.evaluate(()=>window.__nexo.store.get().nexo.nodes['results_dashboard-plot_violin'].inputs.violin_lipid),'PE(18:0/20:4)');
    // H8: a Data-tab change is one undo step: Ctrl+Z restores the value on the server, on the card and in the form.
    const lipid = () => page.evaluate(() => window.__nexo.store.get().nexo.nodes['results_dashboard-plot_violin'].inputs.violin_lipid);
    const rendersBeforeUndo = await page.evaluate(() => window.__nexoMock.renders);
    await undo(page);
    await page.waitForFunction(() => document.querySelector('#violin_lipid[role=listbox]')?.dataset.value === 'PC(16:0/18:1)');
    assert.equal(await lipid(),'PC(16:0/18:1)');
    await page.waitForFunction(n => window.__nexoMock.renders > n, rendersBeforeUndo);
    await focus(page); await page.keyboard.press('Control+Shift+z');
    await page.waitForFunction(() => document.querySelector('#violin_lipid[role=listbox]')?.dataset.value === 'PE(18:0/20:4)');
    assert.equal(await lipid(),'PE(18:0/20:4)');
    await page.waitForFunction(() => document.querySelector('#inspector [role=status]')?.textContent === 'Up to date');
    console.log('PASS H8 ' + name + ' data-change-undo-redo-restores-server-card-form');
    // H8b (chart audit b04 F1): Redo before the Undo PATCH has answered (busy server) still sends the redone value,
    // so the server ends where the document is (a save, then a reopen that reuses the live session, showed the undone one).
    const patchesBefore = await page.evaluate(() => { window.__nexoPrefetchMock.patchDelayMs = 700; return window.__nexoMock.cardPatches.length; });
    await undo(page); await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(2500);
    const sentLipids = await page.evaluate(n => { window.__nexoPrefetchMock.patchDelayMs = 0; return window.__nexoMock.cardPatches.slice(n).filter(p => 'violin_lipid' in (p.body.inputs || {})).map(p => p.body.inputs.violin_lipid); }, patchesBefore);
    assert.equal(sentLipids.at(-1), 'PE(18:0/20:4)', `PATCHes after a fast Undo/Redo: ${JSON.stringify(sentLipids)}`);
    assert.equal(await lipid(),'PE(18:0/20:4)');
    await page.waitForFunction(() => document.querySelector('#violin_lipid[role=listbox]')?.dataset.value === 'PE(18:0/20:4)');
    await page.waitForFunction(() => document.querySelector('#inspector [role=status]')?.textContent === 'Up to date');
    console.log('PASS H8b ' + name + ' fast-undo-redo-ends-at-the-redone-value-on-the-server');
    // H8c (chart audit round 2, b04 donutPlotUnfiltered / b11 pathwayPlot): a Data change followed at once by another
    // Inspector tab (within the form's 250 ms debounce) must still reach the server; leaving the tab dropped it silently.
    const quickStart = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await inspector.getByRole('listbox', {name:'Lipid',exact:true}).getByRole('option', {name:'PC(16:0/18:1)',exact:true}).click();
    await inspector.getByRole('tab', {name:'Appearance',exact:true}).click();
    await page.waitForTimeout(1500);
    const quickSent = await page.evaluate(n => window.__nexoMock.cardPatches.slice(n).filter(p => 'violin_lipid' in (p.body.inputs || {})).map(p => p.body.inputs.violin_lipid), quickStart);
    assert.deepEqual(quickSent, ['PC(16:0/18:1)'], `PATCHes after a Data change and an immediate tab switch: ${JSON.stringify(quickSent)}`);
    assert.equal(await lipid(), 'PC(16:0/18:1)');
    await inspector.getByRole('tab', {name:'Data',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#violin_lipid[role=listbox]')?.dataset.value === 'PC(16:0/18:1)');
    await inspector.getByRole('listbox', {name:'Lipid',exact:true}).getByRole('option', {name:'PE(18:0/20:4)',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#inspector [role=status]')?.textContent === 'Up to date');
    await page.waitForFunction(() => document.querySelector('#violin_lipid[role=listbox]')?.dataset.value === 'PE(18:0/20:4)');
    assert.equal(await lipid(), 'PE(18:0/20:4)');
    console.log('PASS H8c ' + name + ' data-change-then-tab-switch-still-reaches-the-server');
    // Picker polish: the single picker is a listbox driven from its filter field (aria-activedescendant);
    // ArrowDown/ArrowUp/Home/End move the active option, Enter picks it and PATCHes the card.
    const listbox = inspector.getByRole('listbox', {name:'Lipid',exact:true});
    assert.equal(await listbox.count(), 1);
    await lipidFilter.fill('20:4');
    const optionIds = await listbox.getByRole('option').evaluateAll(o => o.map(x => x.id));
    assert.equal(optionIds.length, 3);
    assert.equal(await lipidFilter.getAttribute('aria-controls'), await listbox.getAttribute('id'));
    await lipidFilter.press('Home');
    assert.equal(await lipidFilter.getAttribute('aria-activedescendant'), optionIds[0]);
    await lipidFilter.press('ArrowDown');
    assert.equal(await lipidFilter.getAttribute('aria-activedescendant'), optionIds[1]);
    await lipidFilter.press('End');
    assert.equal(await lipidFilter.getAttribute('aria-activedescendant'), optionIds[2]);
    await lipidFilter.press('ArrowUp');
    assert.equal(await lipidFilter.getAttribute('aria-activedescendant'), optionIds[1]);
    const labels = await listbox.getByRole('option').allTextContents();
    const pick = labels.findIndex(l => l.trim() !== 'PE(18:0/20:4)');
    await lipidFilter.press('Home');
    for (let i = 0; i < pick; i++) await lipidFilter.press('ArrowDown');
    const rendersBeforeEnter = await page.evaluate(() => window.__nexoMock.renders);
    await lipidFilter.press('Enter');
    await page.waitForFunction(v => window.__nexo.store.get().nexo.nodes['results_dashboard-plot_violin'].inputs.violin_lipid === v, labels[pick].trim());
    await page.waitForFunction(n => window.__nexoMock.renders > n, rendersBeforeEnter);
    assert.equal(await listbox.getByRole('option', {name:labels[pick].trim(),exact:true}).getAttribute('aria-selected'), 'true');
    assert.equal(await listbox.getAttribute('data-value'), labels[pick].trim());
    await lipidFilter.fill('');
    // The selected row is in view and whole rows show (no half row at the bottom).
    const fit = await listbox.evaluate(el => { const o = el.querySelector('[aria-selected=true]'), r = el.getBoundingClientRect(), s = o.getBoundingClientRect(); return {inView: s.top >= r.top - 1 && s.bottom <= r.bottom + 1, rows: el.clientHeight / o.offsetHeight}; });
    assert(fit.inView, 'selected option out of view'); assert.equal(Math.abs(fit.rows - Math.round(fit.rows)) < 0.05, true, `half row: ${fit.rows}`);
    await listbox.getByRole('option', {name:'PE(18:0/20:4)',exact:true}).click();
    await page.waitForFunction(() => window.__nexo.store.get().nexo.nodes['results_dashboard-plot_violin'].inputs.violin_lipid === 'PE(18:0/20:4)');
    await page.waitForFunction(() => document.querySelector('#inspector [role=status]')?.textContent === 'Up to date');
    console.log('PASS P3 ' + name + ' listbox-picker-activedescendant-arrows-enter-patch');
    console.log('PASS H3 ' + name + ' schema-edit-render-status');
    await inspector.getByRole('tab', {name:'Appearance',exact:true}).click();
    // Nexo-only presentation lives beside Team's canvas and survives save/open.
    await inspector.locator('.nexo-style details').first().locator('summary').click();
    await inspector.getByLabel('y Scale',{exact:true}).selectOption('log');
    const minimum=inspector.getByLabel('y Minimum',{exact:true});await minimum.fill('1');await minimum.press('Enter');
    const maximum=inspector.getByLabel('y Maximum',{exact:true});await maximum.fill('100');await maximum.press('Enter');
    await page.waitForFunction(()=>document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.layout?.yaxis?.type==='log');
    assert.equal(await violin.locator('.nexo-style-badge').isVisible(),true);
    assert.deepEqual(await violin.locator('.js-plotly-plot').evaluate(el=>el.layout.yaxis.range),[0,2]);
    const teamView=inspector.getByLabel('Show as Team draws it',{exact:true});await teamView.check();
    await page.waitForFunction(()=>document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.layout?.yaxis?.type!=='log');
    assert.equal(await violin.locator('.nexo-style-badge').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__nexo.store.get().nexo.nodes['results_dashboard-plot_violin'].style.yaxis.type),'log');
    await teamView.uncheck();
    // Use the UI save path, which also exercises autosave's checkpoint payload.
    await page.getByTitle('Open or save a checkpoint',{exact:true}).click();
    const checkpoints=page.getByRole('dialog',{name:'Checkpoints',exact:true});await checkpoints.getByLabel('New checkpoint name',{exact:true}).fill('Nexo style round trip');
    await checkpoints.getByRole('button',{name:'Save current analysis',exact:true}).click();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('checkpoint')?.length===64);
    await checkpoints.waitFor({state:'detached'});
    await page.reload();await page.waitForSelector('.card');
    await page.evaluate(()=>window.__nexo.handle.focusNode('results_dashboard-plot_violin'));
    await violin.locator('header').click();await inspector.getByRole('tab',{name:'Appearance',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.layout?.yaxis?.type==='log');
    assert.equal(await violin.locator('.nexo-style-badge').isVisible(),true);
    assert.deepEqual(await violin.locator('.js-plotly-plot').evaluate(el=>el.layout.yaxis.range),[0,2]);
    // Clear the style before the existing independent inspector journeys.
    await inspector.getByRole('button',{name:'Reset Nexo style',exact:true}).click();
    console.log('PASS F13 '+name+' nexo-log-range-badge-team-view-save-reopen');
    await inspector.getByText('Color palette',{exact:true}).first().click();
    const renderCount = await page.evaluate(()=>window.__nexoMock.renders);
    const oldColor = await violin.locator('.js-plotly-plot').evaluate(el=>el.data[0].marker?.color);
    await inspector.getByRole('group',{name:'Color palette',exact:true}).getByRole('button',{name:'Okabe–Ito',exact:true}).click();
    // Pilot simulation step 5: choosing a palette applies it; there is no separate Apply button.
    assert.equal(await inspector.getByRole('button',{name:'Apply palette',exact:true}).count(),0);
    await page.waitForFunction(old=>document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.data[0].marker?.color!==old,oldColor);
    assert.equal(await page.evaluate(()=>window.__nexoMock.renders),renderCount);
    await inspector.getByLabel('Background',{exact:true}).fill('#123456');
    assert.equal(await violin.evaluate(el=>el.style.background),'rgb(18, 52, 86)');
    await undo(page);
    assert.notEqual(await violin.evaluate(el=>el.style.background),'rgb(18, 52, 86)');
    console.log('PASS H3 ' + name + ' appearance-palette-background-undo-no-request');
    // F4: Copy style from the violin (button), Paste style on another Plotly card (Ctrl+Alt+V), one Undo restores.
    const violinId = 'results_dashboard-plot_violin';
    await inspector.getByRole('button',{name:'Copy style',exact:true}).click();
    const targetId = await page.evaluate(id => window.__nexo.store.get().nodes.find(n => n.kind === 'plot' && n.id !== id && !n.finished && window.__nexo.handle.figureOf(n.id))?.id, violinId);
    assert(targetId, 'no second Plotly card in the mock checkpoint');
    const beforePaste = await nodes(page);
    await card(page, targetId).locator('header').click();
    await page.keyboard.press('Control+Alt+KeyV');
    await page.waitForFunction(([s, t]) => { const ns = window.__nexo.store.get().nodes, a = ns.find(n => n.id === s), b = ns.find(n => n.id === t); return b.width === a.width && b.visual?.editor?.palette === a.visual?.editor?.palette; }, [violinId, targetId]);
    await undo(page); assert.deepEqual(await nodes(page), beforePaste);
    console.log('PASS H3 ' + name + ' copy-style-violin-paste-single-undo');
    // F5: Ctrl+Alt+Shift+V opens the confirmation naming the counts; Apply is one undo step.
    await violin.locator('header').click(); await inspector.getByRole('tab', {name:'Appearance',exact:true}).click(); await focus(page);
    const plan = await page.evaluate(id => window.__nexo.handle.applyStyleToTab(id, false), violinId);
    await page.keyboard.press('Control+Alt+Shift+KeyV');
    const dialog = inspector.getByRole('dialog', {name:'Apply to tab…', exact:true});
    await dialog.waitFor();
    const text = await dialog.textContent();
    assert(text.includes(`${plan.full} Plotly`) && text.includes(`${plan.sizeOnly} image`) && text.includes('One undo step'), text);
    await dialog.getByRole('button',{name:'Apply',exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('.style-confirm'));
    if (plan.full + plan.sizeOnly) assert.notDeepEqual(await nodes(page), beforePaste);
    await undo(page); assert.deepEqual(await nodes(page), beforePaste);
    console.log('PASS H3 ' + name + ' apply-style-to-tab-confirm-counts-single-undo');
    // Wave 2A F12: a legend chip writes Team's legend keys in one step; one Undo restores.
    {
      await violin.locator('header').click(); await inspector.getByRole('tab', {name:'Appearance',exact:true}).click();
      const before = await nodes(page);
      await inspector.locator('summary').filter({hasText:/^Legend/}).click();
      await inspector.getByRole('group',{name:'Legend presets',exact:true}).getByRole('button',{name:'Right outside',exact:true}).click();
      await page.waitForFunction(id => window.__nexo.store.get().nodes.find(n => n.id === id).visual?.editor?.layout?.['legend.x'] === 1.02, violinId);
      assert.match(await inspector.locator('summary').filter({hasText:/^Legend/}).textContent(), /Right outside/);
      await undo(page); assert.deepEqual(await nodes(page), before);
      console.log('PASS F12 ' + name + ' legend-chip-right-outside-single-undo');
      // F6: save the violin's style as "Lab style" and apply it to another Plotly card: one Undo restores.
      await inspector.locator('summary').filter({hasText:/^Saved styles/}).click();
      await inspector.getByLabel('Style name',{exact:true}).fill('Lab style');
      await inspector.getByRole('button',{name:'Save current style',exact:true}).click();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nexo.savedStyles.v1'))[0].name), 'Lab style');
      assert.equal(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('nexo.savedStyles.v1'))).includes('inputs')), false);
      await card(page, targetId).locator('header').click(); await inspector.getByRole('tab', {name:'Appearance',exact:true}).click();
      const summary = inspector.locator('summary').filter({hasText:/^Saved styles/});
      if (!(await summary.evaluate(el => el.parentElement.open))) await summary.click();
      await inspector.getByRole('button',{name:'Apply Lab style',exact:true}).click();
      await page.waitForFunction(([s, t]) => { const ns = window.__nexo.store.get().nodes, a = ns.find(n => n.id === s), b = ns.find(n => n.id === t); return JSON.stringify(b.visual?.editor?.layout ?? {}) === JSON.stringify(a.visual?.editor?.layout ?? {}) && b.visual?.editor?.palette === a.visual?.editor?.palette; }, [violinId, targetId]);
      await undo(page); assert.deepEqual(await nodes(page), before);
      console.log('PASS F6 ' + name + ' saved-style-apply-to-another-card-single-undo');
      // F7: a colour-blind preview filters the card only; nothing is saved.
      const doc = await page.evaluate(() => JSON.stringify(window.__nexo.store.get()));
      await inspector.locator('summary').filter({hasText:/^Colour-blind check/}).click();
      await inspector.getByRole('group',{name:'Colour-blind check',exact:true}).getByRole('button',{name:'Deuteranopia',exact:true}).click();
      assert.match(await card(page, targetId).evaluate(el => el.style.filter), /nexo-cvd-deuteranopia/);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__nexo.store.get())), doc);
      await inspector.getByRole('group',{name:'Colour-blind check',exact:true}).getByRole('button',{name:'Normal',exact:true}).click();
      assert.equal(await card(page, targetId).evaluate(el => el.style.filter), '');
      console.log('PASS F7 ' + name + ' colour-blind-preview-nothing-saved');
    }
    await card(page,'instrument').locator('header').click();
    // P3: an illustration also has Export (PNG/SVG of the artwork, as Team's illustration downloads).
    assert.deepEqual(await inspector.getByRole('tab').allTextContents(),['Appearance','Export']);
    await focus(page); await page.keyboard.press('i');
    // H6-0: the inspector column is reserved; closing it shows the empty-state text instead of hiding the panel.
    assert.equal(await inspector.getAttribute('data-open'),'false');
    assert.equal(await inspector.getByRole('tab').count(),0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.card.selected').count(),0);
    console.log('PASS H3 ' + name + ' illustration-toggle-escape');
    // H8: a Team dashboard selection bar renders as a checklist (never the raw "__ALL__" token) and writes Team's
    // own encoding back: a JSON array in choice order, or the all-token. A control without a label must not crash.
    const heatId = await page.evaluate(async () => { await window.__nexo.handle.addCard('results_dashboard-plot_heat'); return window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat').id; });
    const heat = card(page, heatId); await heat.waitFor();
    await heat.locator('header').click();
    await inspector.getByRole('tab', {name:'Data',exact:true}).click();
    const groups = inspector.getByRole('group', {name:'Sample groups',exact:true});
    await groups.waitFor();
    assert.equal(await inspector.locator('input[value="__ALL__"]').count(),0);
    assert.equal((await groups.locator('.selection-count').textContent()).trim(),'2 of 6');
    assert.deepEqual(await groups.getByRole('checkbox').evaluateAll(els=>els.map(e=>e.checked)),[true,true,false,false,false,false]);
    const heatInput = () => page.evaluate(() => window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat')?.instance?.inputs?.heat_group_selection);
    await groups.getByRole('checkbox',{name:'Treatment',exact:true}).uncheck();
    await page.waitForFunction(() => window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat')?.instance?.inputs?.heat_group_selection === '["Control"]');
    await groups.getByRole('button',{name:'All',exact:true}).click();
    await page.waitForFunction(() => window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat')?.instance?.inputs?.heat_group_selection === '__EVERY__');
    assert.equal((await groups.locator('.selection-count').textContent()).trim(),'6 of 6');
    await groups.getByRole('button',{name:'Default',exact:true}).click();
    await page.waitForFunction(() => window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat')?.instance?.inputs?.heat_group_selection === '__ALL__');
    assert.equal(await heatInput(),'__ALL__');
    assert.equal(await inspector.locator('#heat_significance').count(),1);
    // Searchable long multi-picker: selection stays intact outside the filter; bulk actions cover all choices.
    const lipids = inspector.getByRole('group', {name:'Lipids',exact:true});
    await lipids.getByRole('searchbox', {name:'Filter Lipids',exact:true}).fill('18:0/20:4');
    assert.equal(await lipids.locator('.choice-list').last().getByRole('checkbox').count(),2);
    await lipids.getByRole('checkbox',{name:'PC(18:0/20:4)',exact:true}).check();
    // The write is debounced: until it lands the input still holds Team's '__ALL__' token (not JSON).
    await page.waitForFunction(() => { const v = window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat').instance.inputs.heat_lipid_selection; return typeof v === 'string' && v.startsWith('[') && JSON.parse(v).includes('PC(18:0/20:4)'); });
    await lipids.getByRole('button',{name:'All',exact:true}).click();
    await page.waitForFunction(() => window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat').instance.inputs.heat_lipid_selection === '__EVERY__');
    assert.equal((await lipids.locator('.selection-count').textContent()).trim(),'45 of 45');
    await lipids.getByRole('button',{name:'None',exact:true}).click();
    await page.waitForFunction(() => window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat').instance.inputs.heat_lipid_selection === '[]');
    await lipids.getByRole('checkbox',{name:'Select class PC',exact:true}).check();
    await page.waitForFunction(() => JSON.parse(window.__nexo.store.get().nodes.find(n=>n.instance?.source==='results_dashboard-plot_heat').instance.inputs.heat_lipid_selection).length === 5);
    await lipids.getByRole('searchbox').fill('');
    assert.equal(await lipids.getByRole('checkbox',{name:'Select class PC',exact:true}).isChecked(), true);
    console.log('PASS P2 ' + name + ' lipid-filter-pick-all-none-class');

    // Wave 2A F10: a heat scale preset writes Team's scale stops on the heatmap; one Undo restores.
    {
      await page.evaluate(id => window.__nexo.handle.focusNode(id), heatId);
      await page.waitForFunction(id => !!window.__nexo.handle.figureOf(id), heatId);
      await inspector.getByRole('tab', {name:'Appearance',exact:true}).click();
      const before = await nodes(page);
      await inspector.locator('summary').filter({hasText:/^Heat scale presets/}).click();
      await inspector.getByRole('group',{name:'Sequential',exact:true}).getByRole('button',{name:'Viridis (3-stop)',exact:true}).click();
      await page.waitForFunction(id => window.__nexo.store.get().nodes.find(n => n.id === id).visual?.editor?.traces?.some(t => t.scaleLow === '#440154'), heatId);
      await page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"] .js-plotly-plot`)?.data.some(t => JSON.stringify(t.colorscale ?? '').includes('#440154')), heatId);
      await undo(page); assert.deepEqual(await nodes(page), before);
      console.log('PASS F10 ' + name + ' heat-preset-viridis-single-undo');
      await inspector.getByRole('tab', {name:'Data',exact:true}).click();
    }
    console.log('PASS H8 ' + name + ' selection-bar-checklist-team-encoding-null-label');
    // Live journeys: zoomed out below 50 %, a Data change on an image (ggplot) card kept showing the old figure while
    // the inspector said Up to date. The selected card stays live at any zoom, and a frozen image card whose inputs
    // changed (Undo after deselecting) asks for its new image.
    const imgSource = 'heatmap_barchart_tab-violin_plot_render';
    const imgId = await page.evaluate(async s => { await window.__nexo.handle.addCard(s); return window.__nexo.store.get().nodes.find(n=>n.instance?.source===s).id; }, imgSource);
    const imgSel = `.card[data-id="${imgId}"]`, imgSrc = () => page.$eval(imgSel + ' img', i => i.getAttribute('src'));
    await page.waitForFunction(sel => document.querySelector(sel + ' img')?.naturalWidth > 0, imgSel);
    await page.evaluate(id => { window.__nexo.handle.zoomTo(.3); window.__nexo.handle.focusNode(id); }, imgId);
    await card(page, imgId).locator('header').click();
    // H9: a click below 40 % brings the card up; go back out so the card is frozen again.
    await page.waitForTimeout(400); await page.evaluate(id => { window.__nexo.handle.zoomTo(.3); window.__nexo.handle.focusNode(id); }, imgId);
    await page.waitForFunction(sel => document.querySelector(sel)?.dataset.tier === 'frozen', imgSel);
    await inspector.getByRole('tab', {name:'Data',exact:true}).click();
    const zoomedOut = await imgSrc();
    await inspector.locator('#violin_lipid[role=listbox]').getByRole('option', {name:'PE(18:0/20:4)',exact:true}).click();
    await page.waitForFunction(([sel, s0]) => { const i = document.querySelector(sel + ' img'); return i && i.getAttribute('src') !== s0 && i.naturalWidth > 0; }, [imgSel, zoomedOut], {timeout:10000});
    const edited = await imgSrc();
    await page.locator('#viewport').click({position:{x:5,y:5}}); // deselect: Undo reaches a frozen card
    await page.waitForFunction(sel => !document.querySelector(sel)?.classList.contains('selected'), imgSel);
    await undo(page);
    await page.waitForFunction(([sel, s1]) => { const i = document.querySelector(sel + ' img'); return i && i.getAttribute('src') !== s1 && i.naturalWidth > 0; }, [imgSel, edited], {timeout:10000});
    assert.equal(await page.$eval(imgSel, el => el.dataset.tier), 'frozen');
    console.log('PASS H8 ' + name + ' zoomed-out-image-card-follows-data-change-and-undo');
    // The same for a frozen Plotly card: its snapshot is retaken for the new inputs (the figure may come from the
    // card's cache, so count the snapshots themselves).
    await page.evaluate(() => { const P = window.Plotly, f = P.toImage; window.__snapshots = 0; P.toImage = (...a) => { window.__snapshots++; return f.apply(P, a); }; });
    await page.evaluate(() => window.__nexo.handle.focusNode('results_dashboard-plot_violin'));
    await violin.locator('header').click();
    await page.waitForTimeout(400); await page.evaluate(() => { window.__nexo.handle.zoomTo(.3); window.__nexo.handle.focusNode('results_dashboard-plot_violin'); });
    await page.waitForFunction(() => document.querySelector('.card[data-id="results_dashboard-plot_violin"]')?.dataset.tier === 'frozen');
    await inspector.getByRole('tab', {name:'Data',exact:true}).click();
    assert.equal(await violin.getAttribute('data-tier'), 'frozen');
    await page.waitForTimeout(500); const snapshotsBefore = await page.evaluate(() => window.__snapshots);
    const lipidNow = await inspector.locator('#violin_lipid[role=listbox]').getAttribute('data-value');
    await inspector.locator('#violin_lipid[role=listbox]').getByRole('option', {name:lipidNow === 'PE(18:0/20:4)' ? 'PC(16:0/18:1)' : 'PE(18:0/20:4)',exact:true}).click();
    await page.waitForFunction(n => window.__snapshots > n, snapshotsBefore, {timeout:10000});
    assert.equal(await violin.getAttribute('data-tier'), 'frozen');
    console.log('PASS H8 ' + name + ' zoomed-out-plotly-card-retakes-its-snapshot-after-data-change');
    // Feature 1: a module's action buttons (Team's "Data & settings") are live in the Data tab; a dialog the
    // module opens shows in Nexo's dialog, sanitised (the mock QC action's body carries a script and a link).
    const qcId = await page.evaluate(async () => { await window.__nexo.handle.addCard('qc_pca_tab-pca2dPlot'); return window.__nexo.store.get().nodes.find(n=>n.instance?.source==='qc_pca_tab-pca2dPlot').id; });
    await card(page, qcId).locator('header').click();
    await inspector.getByRole('tab', {name:'Data',exact:true}).click();
    const action = inspector.getByRole('button', {name:'Show Statistic Detail',exact:true});
    await action.waitFor();
    const rendersBefore = await page.evaluate(() => window.__nexoMock.renders);
    await action.click();
    const modal = page.getByRole('dialog', {name:'Statistics Console'});
    await modal.waitFor();
    assert.match(await modal.textContent(), /Statistic detail for this view/);
    assert.equal(await modal.locator('script, a, [onclick], img').count(), 0);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    await page.waitForFunction(n => window.__nexoMock.renders > n, rendersBefore);
    await modal.getByRole('button', {name:'Close',exact:true}).click();
    await modal.waitFor({state:'detached'});
    assert.equal(await action.isEnabled(), true);
    console.log('PASS F1 ' + name + ' module-action-button-redraws-the-card-and-shows-its-dialog');
    // Pilot F1 (replaces round 2's per-card colours): a QC copy's per-group pickers never reach its PCA, so the Data tab
    // offers none even with "Override sample colors" ticked; it says the group colours follow the session palette and
    // opens it, and a group colour set there redraws the 2D PCA.
    const qcInstance = await page.evaluate(id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); return n.instance.instanceId ?? n.instance.id; }, qcId);
    await inspector.getByLabel('Override sample colors in this QC tab?', {exact:true}).check();
    await page.waitForTimeout(500);
    assert.equal(await inspector.locator('input[type=color][aria-label^="Colour for "]').count(), 0, 'a QC copy offers no per-group colour');
    const note = inspector.locator('.session-palette-note');
    assert.equal((await note.textContent()).startsWith('Group colours and shapes follow the session palette.'), true);
    await note.getByRole('button', {name:'Session palette…', exact:true}).click();
    const panel = page.getByRole('dialog', {name:'Colors & palettes', exact:true});
    const groupColour = panel.getByRole('group', {name:'Sample groups (Group 1)', exact:true}).getByLabel('Colour for Control', {exact:true});
    await groupColour.fill('#aa3300');
    await page.waitForFunction(i => (window.__nexoMock.labels[i] || '').toLowerCase().includes('#aa3300'), qcInstance, {timeout:10000});
    await panel.getByRole('button', {name:'Close Colors & palettes', exact:true}).click();
    await panel.waitFor({state:'detached'});
    console.log('PASS F1 ' + name + ' qc-data-tab-points-to-the-session-palette-which-redraws-the-pca');
    // Ordered grouping: read the PATCH-equivalent body from the in-memory mock.
    const orderedId = await page.evaluate(async () => {
      const before = new Set(window.__nexo.store.get().nodes.map(n => n.id));
      await window.__nexo.handle.addCard('logratio_tab-logratioPlot');
      return window.__nexo.store.get().nodes.find(n => !before.has(n.id)).id;
    });
    await page.evaluate(id => window.__nexo.handle.focusNode(id), orderedId);
    await card(page, orderedId).locator('header').click();
    await inspector.getByRole('tab', {name:'Data',exact:true}).click();
    const ordered = inspector.getByRole('group', {name:'Primary Grouping (Order matters)',exact:true});
    const patchStart = await page.evaluate(() => window.__nexoMock.cardPatches.length);
    await ordered.getByRole('listitem').filter({hasText:'Time'}).focus();
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await ordered.locator('.ordered-selection-label').allTextContents(), ['Time', 'Condition']);
    await page.waitForFunction(start => window.__nexoMock.cardPatches.slice(start).some(p =>
      JSON.stringify(p.body.inputs.primary_grouping) === '["Time","Condition"]'), patchStart);
    assert.deepEqual(await page.evaluate(start => window.__nexoMock.cardPatches.slice(start)
      .find(p => p.body.inputs.primary_grouping)?.body.inputs.primary_grouping, patchStart), ['Time','Condition']);
    assert.equal(await ordered.getByRole('listitem').filter({hasText:'Time'}).evaluate(el => el === document.activeElement), true);
    await ordered.getByRole('button', {name:'Move down: Time',exact:true}).click();
    assert.deepEqual(await ordered.locator('.ordered-selection-label').allTextContents(), ['Condition', 'Time']);
    await ordered.getByRole('button', {name:'Remove: Time',exact:true}).click();
    await ordered.getByRole('combobox').selectOption('Sex');
    assert.deepEqual(await ordered.locator('.ordered-selection-label').allTextContents(), ['Condition', 'Sex']);
    console.log('PASS P1 ' + name + ' ordered-grouping-keyboard-patch-buttons-add-remove');
    assert.deepEqual(errors,[]); console.log('PASS H3 ' + name + ' no-console-errors');
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H3 Playwright: ${e.message}`); return; } throw e; }
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
  // The computed journey first, in both engines, so it reports even when a later journey fails.
  for (const name of ['chromium', 'webkit']) await computedJourney(pw, name, base);
  for (const name of ['chromium', 'webkit']) await browserTests(pw, name, base);
  console.log('H3 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
