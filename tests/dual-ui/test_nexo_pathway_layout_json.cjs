// Chart audit b11 F3: Team's "Download Layout JSON" (download_config) and "Upload Layout JSON (.json):"
// (upload_config) on the pathway cards. Export tab lists the download; the Data tab has the file input; an uploaded
// layout redraws the card and is kept in Nexo's member; a bad file shows Team's message. Mock build, Chromium and WebKit.
// node tests/dual-ui/test_nexo_pathway_layout_json.cjs
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
const evidence = path.join(root, 'docs/integration/nexo-phase1-evidence/h9/pathway-layout-json');
const SOURCE = 'pathway_tab-pathwayPlot';
const UPLOAD_LABEL = 'Upload Layout JSON (.json):';
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
const member = (page, id) => page.evaluate(id => window.__nexo.store.get().nexo.nodes[id]?.inputs, id);
const bySource = list => list.filter(n => n.instance?.source === SOURCE);
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function waitFor(page, fn, arg, label) {
  await page.waitForFunction(fn, arg, { timeout: 10000 }).catch(async () => { throw new Error(`${label}: ${JSON.stringify(bySource(await nodes(page)))}`); });
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error' && !/Error loading layout JSON|Upload a \.json file/.test(m.text())) errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    await page.evaluate(source => window.__nexo.handle.addCard(source), SOURCE);
    await waitFor(page, source => window.__nexo.store.get().nodes.some(n => n.instance?.source === source), SOURCE, 'pathway card added');
    let v = bySource(await nodes(page))[0];
    const instance = v.instance.instanceId ?? v.instance.id;
    await page.evaluate(id => window.__nexo.handle.focusNode(id), v.id);
    await page.waitForTimeout(600);
    await card(page, v.id).locator('header').click();
    // 1. Export tab: Team's "Download Layout JSON", served as a .json file that parses.
    await page.getByRole('tab', { name: 'Export', exact: true }).click();
    const link = page.getByRole('group', { name: 'More downloads from this analysis' }).getByRole('button', { name: 'Download Layout JSON', exact: true });
    await link.waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    assert.equal(download.suggestedFilename(), 'pathway_layout_config.json');
    const layout = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(Object.keys(layout).sort(), ['active_classes', 'added_edges', 'custom_nodes', 'position_overrides', 'removed_edges']);
    fs.mkdirSync(evidence, { recursive: true });
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-export-download.png') });
    console.log(`PASS F3 ${name} export-tab-lists-download-layout-json-and-it-parses`);
    // 2. Data tab: Team's file input; upload the edited layout (one node moved): the card redraws with it.
    await page.getByRole('tab', { name: 'Data', exact: true }).click();
    const input = page.getByLabel(UPLOAD_LABEL, { exact: true });
    await input.waitFor({ state: 'attached' });
    assert.equal(await input.getAttribute('accept'), '.json');
    layout.position_overrides = { PC: [123, -45] };
    const before = await page.evaluate(() => window.__nexoMock.renders);
    await input.setInputFiles({ name: 'pathway_layout_config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(layout, null, 2)) });
    await waitFor(page, id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); return /"PC":\[123,-45\]/.test(n?.instance?.inputs?.position_overrides_json ?? ''); }, v.id, 'layout input after upload');
    await waitFor(page, ([i, n]) => window.__nexoMock.renders > n && window.__nexoMock.labels[i] === 'Lipid pathway map · layout: 1 moved node', [instance, before], 'card redraws with the uploaded layout');
    await card(page, v.id).locator('.gtitle').filter({ hasText: '1 moved node' }).waitFor();
    const kept = await member(page, v.id);
    assert.equal(kept?.upload_config?.name, 'pathway_layout_config.json', 'the uploaded file is kept in the member');
    assert.deepEqual(JSON.parse(kept.upload_config.content).position_overrides, { PC: [123, -45] });
    await page.getByText('Loaded pathway_layout_config.json', { exact: true }).waitFor();
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-upload-redrawn.png') });
    console.log(`PASS F3 ${name} upload-redraws-card-and-member-keeps-layout`);
    // 3. A file that is not JSON: Team's message, the layout unchanged.
    await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('this is not json {') });
    const alert = page.getByRole('alert').filter({ hasText: 'Error loading layout JSON:' });
    await alert.waitFor();
    v = (await nodes(page)).find(n => n.id === v.id);
    assert.match(v.instance.inputs.position_overrides_json, /"PC":\[123,-45\]/, 'a bad file leaves the layout');
    // Nothing changed: the card is not flagged (no "Data & settings" error badge) and the Inspector says up to date.
    await page.getByRole('region', { name: 'Inspector' }).getByRole('status').filter({ hasText: /^Up to date$/ }).waitFor();
    assert.equal(await card(page, v.id).locator('.card-status-text').textContent(), 'Up to date', 'the card status stays up to date');
    await page.waitForTimeout(2500); // past the card's delayed "updating" paint (cards.ts setStatus)
    assert.equal(await card(page, v.id).locator('.card-status').getAttribute('data-state'), 'current', 'a refused file does not flag the card');
    assert.equal(await card(page, v.id).locator('.card-status button').count(), 0, 'no Data & settings action on the badge');
    if (name === 'chromium') await page.screenshot({ path: path.join(evidence, 'chromium-1440-bad-file.png') });
    await input.setInputFiles({ name: 'layout.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
    await page.getByRole('alert').filter({ hasText: 'Upload a .json file.' }).waitFor();
    console.log(`PASS F3 ${name} bad-file-shows-teams-message`);
    // 4. One undo reverts the upload (layout inputs sent back, file gone from the member); redo puts both back.
    await page.evaluate(() => window.__nexo.handle.undo());
    await waitFor(page, id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); return !/"PC"/.test(n?.instance?.inputs?.position_overrides_json ?? '') && !window.__nexo.store.get().nexo.nodes[id]?.inputs?.upload_config; }, v.id, 'undo reverts the upload');
    await page.waitForFunction(i => { const p = window.__nexoMock.cardPatches.at(-1); return p && p.instance === i && !/"PC"/.test(p.body.inputs.position_overrides_json ?? '"PC"'); }, instance, { timeout: 10000 });
    await page.evaluate(() => window.__nexo.handle.redo());
    await waitFor(page, id => { const n = window.__nexo.store.get().nodes.find(n => n.id === id); return /"PC":\[123,-45\]/.test(n?.instance?.inputs?.position_overrides_json ?? '') && !!window.__nexo.store.get().nexo.nodes[id]?.inputs?.upload_config; }, v.id, 'redo restores the upload');
    console.log(`PASS F3 ${name} one-undo-reverts-upload-redo-restores`);
    // 5. Duplicate: the copy keeps the layout (instance inputs) and the uploaded file (member).
    await page.evaluate(id => window.__nexo.handle.duplicate(id), v.id);
    await waitFor(page, source => window.__nexo.store.get().nodes.filter(n => n.instance?.source === source).length === 2, SOURCE, 'duplicate');
    const copy = bySource(await nodes(page)).find(n => n.id !== v.id);
    assert.match(copy.instance.inputs.position_overrides_json, /"PC":\[123,-45\]/, 'copy keeps the layout');
    assert.equal((await member(page, copy.id))?.upload_config?.name, 'pathway_layout_config.json', 'copy keeps the uploaded file');
    console.log(`PASS F3 ${name} duplicate-keeps-layout`);
    assert.deepEqual(errors, []); console.log(`PASS F3 ${name} no-console-errors`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F3 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('F3 pathway layout JSON OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
