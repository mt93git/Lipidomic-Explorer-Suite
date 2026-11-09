// H6d: one Export dialog (selected plot and publication bundle) in Chromium and WebKit, mock build.
// node tests/dual-ui/test_nexo_export.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const out = process.env.NEXO_SCREENSHOTS || '/tmp/nexo-h6d';
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    await page.waitForFunction(() => document.querySelector('.card[data-id="results_dashboard-plot_violin"] .js-plotly-plot')?.data?.length > 0);

    // Toolbar → Publication export…
    const trigger = page.getByRole('button', { name: 'Export figure ▾', exact: true });
    await trigger.click();
    const menu = page.getByRole('group', { name: 'Export figure ▾', exact: true });
    assert.equal(await menu.getByRole('button', { name: 'Save checkpoint…', exact: true }).count(), 1);
    assert.equal(await menu.getByRole('button', { name: 'Download ZIP', exact: true }).count(), 1);
    assert.equal(await menu.getByRole('button', { name: 'Export selected plot…', exact: true }).count(), 1);
    await menu.getByRole('button', { name: 'Publication export…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export', exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('radio', { name: 'Publication figure', exact: true }).isChecked(), true);
    const width = dialog.getByLabel('Width (mm)', { exact: true }), height = dialog.getByLabel('Height (mm)', { exact: true }), base_ = dialog.getByLabel('Base font (pt)', { exact: true });
    await dialog.getByLabel('Journal preset', { exact: true }).selectOption('cell');
    assert.deepEqual([await width.inputValue(), await height.inputValue(), await base_.inputValue()], ['85', '85', '7.5']);
    await dialog.getByLabel('Resolution (DPI)', { exact: true }).selectOption('300');
    await dialog.getByText('1004 × 1004 px at 300 DPI').waitFor();
    console.log('PASS H6d ' + name + ' preset-cell-dpi');
    await dialog.getByLabel('TIFF', { exact: true }).uncheck();
    await dialog.getByLabel('PDF', { exact: true }).uncheck();
    // rscript keeps its csv (Team): the CSV box is checked and locked while R script is on.
    assert.equal(await dialog.getByLabel('Data (CSV)', { exact: true }).isDisabled(), true);
    for (const control of await dialog.locator('select,input').all())
      assert.ok(await control.evaluate(el => el.labels?.length > 0 || el.hasAttribute('aria-label')), 'unlabelled control');
    await page.screenshot({ path: path.join(out, `h6d-${name}-1440.png`) });
    const [bundle] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download bundle', exact: true }).click()]);
    assert.match(bundle.suggestedFilename(), /\.zip$/);
    const sent = await page.evaluate(() => window.__nexoExportMock.last);
    assert.deepEqual(sent, { figureKey: 'pca_2d', preset: 'cell', widthMm: 85, heightMm: 85, dpi: 300, basePt: 7.5, fontFamily: 'sans', hybridMode: true, formats: ['svg', 'png', 'csv', 'rscript'] });
    console.log('PASS H6d ' + name + ' bundle-download ' + bundle.suggestedFilename());
    // H8 journeys 7.1/7.2: the publication scope says what it exports, Volcano waits for the study design,
    // and a download is confirmed.
    await page.locator('.toast', { hasText: 'Downloaded ' + bundle.suggestedFilename() }).waitFor({ timeout: 3000 });
    assert.match(await dialog.locator('.export-scope-help').textContent(), /Export studio figures, drawn by R from the analysis, not from the canvas/);
    const allowed = await page.evaluate(() => !!window.__nexo.handle.getSession().design?.allowed);
    const volcano = dialog.getByLabel('Figure', { exact: true }).locator('option[value="volcano"]');
    assert.equal(await volcano.evaluate(o => o.disabled), !allowed);
    if (!allowed) assert.match(await volcano.textContent(), /confirm the study design first$/);
    console.log('PASS H8 ' + name + ' publication-scope-explained-volcano-gated-download-toast allowed=' + allowed);
    // Busy disables the button that had focus; focus must come back inside the dialog (Esc, Tab trap).
    await page.waitForFunction(() => !document.querySelector('dialog[aria-busy="true"]'));
    await page.waitForFunction(() => !!document.activeElement?.closest('dialog.export-dialog'), null, { timeout: 2000 });
    console.log('PASS H6d ' + name + ' focus-stays-in-dialog-after-download');

    // A field the server rejects (400) shows the server message inline.
    await page.evaluate(() => { window.__nexoExportMock.fault = { dpi: 72 }; });
    await dialog.getByRole('button', { name: 'Download bundle', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'dpi must be 300, 600 or 1200.' }).waitFor();
    await page.evaluate(() => { window.__nexoExportMock.fault = null; });
    console.log('PASS H6d ' + name + ' server-400-inline');

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Export figure ▾');
    console.log('PASS H6d ' + name + ' escape-focus-return');

    // Inspector Export tab: Plot data (CSV), then the plot scope of the dialog.
    await card(page, 'results_dashboard-plot_violin').locator('header').click();
    const inspector = page.locator('#inspector');
    await inspector.getByRole('tab', { name: 'Export', exact: true }).click();
    const [csv] = await Promise.all([page.waitForEvent('download'), inspector.getByRole('button', { name: 'Plot data (CSV)', exact: true }).click()]);
    assert.match(csv.suggestedFilename(), /\.csv$/);
    assert.deepEqual(await page.evaluate(() => window.__nexoExportMock.download), { instance: 'tcinstance_v0_violin', id: 'dl_violin' });
    assert.equal(await inspector.getByRole('group', { name: 'More downloads from this analysis', exact: true }).getByRole('button').count(), 1);
    console.log('PASS H6d ' + name + ' inspector-csv ' + csv.suggestedFilename());
    await inspector.getByRole('button', { name: 'More export options…', exact: true }).click();
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('radio', { name: 'Selected plot', exact: true }).isChecked(), true);
    // The PNG has the physical size at the dpi; the card keeps its size.
    const before = await card(page, 'results_dashboard-plot_violin').boundingBox();
    await dialog.getByLabel('Width (mm)', { exact: true }).fill('85');
    await dialog.getByLabel('Height (mm)', { exact: true }).fill('60');
    await dialog.getByLabel('Resolution (DPI)', { exact: true }).selectOption('600');
    const [png] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download PNG', exact: true }).click()]);
    assert.match(png.suggestedFilename(), /\.png$/);
    const bytes = fs.readFileSync(await png.path());
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [2008, 1417]);
    assert.deepEqual(await card(page, 'results_dashboard-plot_violin').boundingBox(), before);
    console.log('PASS H6d ' + name + ' plot-scope-png');
    // F8: the preview shows the export pixel size (89 mm at 300 DPI = 1051 px).
    await dialog.getByLabel('Width (mm)', { exact: true }).fill('89');
    await dialog.getByLabel('Resolution (DPI)', { exact: true }).selectOption('300');
    await dialog.getByRole('button', { name: 'Preview export at 300 DPI…', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Export preview', exact: true });
    await preview.locator('.export-preview-image').waitFor({ timeout: 10000 });
    assert.match(await preview.getByTestId('preview-size').textContent(), /^1051 × 709 px · 89 × 60 mm at 300 DPI$/);
    assert.match(await preview.locator('.export-summary').nth(1).textContent(), /^PNG about \d+(\.\d)? (KB|MB|B)$/);
    assert.equal(await preview.getByRole('img', { name: /Loupe at 1:1/ }).count(), 1);
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await preview.waitFor({ state: 'detached' });
    console.log('PASS F8 ' + name + ' preview-89mm-300dpi-1051px');
    // F21: transparent PNG (paper and plot background) has alpha in its corner; remembered in the session.
    const clearBox = dialog.getByLabel('Transparent background (PNG, SVG)', { exact: true });
    assert.equal(await clearBox.isChecked(), false);
    await clearBox.check();
    const [clearPng] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download PNG', exact: true }).click()]);
    const corner = await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      return ctx.getImageData(1, 1, 1, 1).data[3]; }, fs.readFileSync(await clearPng.path()).toString('base64'));
    assert.equal(corner, 0);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await dialog.waitFor({ state: 'detached' });
    await inspector.getByRole('button', { name: 'More export options…', exact: true }).click(); await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Transparent background (PNG, SVG)', { exact: true }).isChecked(), true);
    await dialog.getByLabel('Transparent background (PNG, SVG)', { exact: true }).uncheck();
    console.log('PASS F21 ' + name + ' transparent-png-alpha-remembered');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });

    // The one Export menu also exports the Figure page (H6c) without entering it.
    await trigger.click();
    const [pageSvg] = await Promise.all([page.waitForEvent('download'), menu.getByRole('button', { name: 'Figure page · SVG', exact: true }).click()]);
    assert.match(pageSvg.suggestedFilename(), /^figure-canvas-1\.svg$/);
    const svgText = fs.readFileSync(await pageSvg.path(), 'utf8');
    assert.match(svgText, /^<svg[\s\S]*<\/svg>$/);
    console.log('PASS H6d ' + name + ' menu-figure-page-svg ' + pageSvg.suggestedFilename());

    // "More downloads from this analysis": a Library-added plot offers its module's own buttons (Team's mirror).
    if (!(await page.locator('.library-panel:not([hidden])').count())) await page.getByRole('button', { name: /^Plots/ }).first().click();
    await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
    const count = await page.evaluate(() => window.__nexo.store.get().nodes.length);
    await page.locator('button.library-add[aria-label="Add Composition · unfiltered"]').first().click();
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length > n && document.querySelector('.card.selected'), count);
    const added = await page.evaluate(() => window.__nexo.store.get().nodes.at(-1));
    await inspector.getByRole('tab', { name: 'Export', exact: true }).click();
    const more = inspector.getByRole('group', { name: 'More downloads from this analysis', exact: true });
    await more.waitFor();
    assert.deepEqual(await more.getByRole('button').allTextContents(), ['CSV', 'PDF']);
    const [pdf] = await Promise.all([page.waitForEvent('download'), more.getByRole('button', { name: 'PDF', exact: true }).click()]);
    assert.match(pdf.suggestedFilename(), /\.pdf$/);
    assert.deepEqual(await page.evaluate(() => window.__nexoExportMock.download), { instance: added.instance.instanceId, id: 'downloadPlot' });
    console.log('PASS H8 ' + name + ' more-downloads-from-this-analysis ' + pdf.suggestedFilename());
    // P3: export an illustration directly, with its edited label and accent.
    await page.evaluate(()=>window.__nexo.handle.addIllustration('serum-vial'));
    const artId=await page.evaluate(()=>window.__nexo.handle.getSession().canvas.nodes.find(n=>n.kind==='illustration'&&n.assetId==='serum-vial').id);
    await page.evaluate(id=>{window.__nexo.handle.setAppearance(id,{label:'Synthetic sample',color:'#abcdef'});window.__nexo.handle.focusNode(id);},artId);
    await card(page,artId).locator('header').click();
    await inspector.getByRole('tab',{name:'Export',exact:true}).click();
    assert.equal(await inspector.getByRole('button',{name:'Plot data (CSV)',exact:true}).count(),0);
    assert.equal(await inspector.getByRole('group',{name:'More downloads from this analysis',exact:true}).count(),0);
    const [artSvg]=await Promise.all([page.waitForEvent('download'),inspector.getByRole('button',{name:'Download SVG',exact:true}).click()]);
    assert.equal(artSvg.suggestedFilename(),'Synthetic sample.svg');assert.match(fs.readFileSync(await artSvg.path(),'utf8'),/#abcdef/);
    const [artPng]=await Promise.all([page.waitForEvent('download'),inspector.getByRole('button',{name:'Download PNG',exact:true}).click()]);
    const artBytes=fs.readFileSync(await artPng.path());assert.equal(artBytes.toString('hex',0,8),'89504e470d0a1a0a');assert(artBytes.readUInt32BE(16)>0&&artBytes.readUInt32BE(20)>0);
    await inspector.getByRole('button',{name:'More export options…',exact:true}).click();await dialog.waitFor();
    assert(await dialog.getByRole('button',{name:'Download SVG',exact:true}).isEnabled());
    assert.equal(await dialog.getByRole('button',{name:'Plot data (CSV)',exact:true}).count(),0);
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    console.log(`PASS P3 ${name} illustration-png-svg-dialog`);

    // Honest downloads: a card that draws Team's placeholder disables its module downloads with the reason.
    const addSource = async source => { const n = await page.evaluate(() => window.__nexo.store.get().nodes.length);
      await page.evaluate(src => window.__nexo.handle.addCard(src), source);
      await page.waitForFunction(k => window.__nexo.store.get().nodes.length > k, n);
      const id = await page.evaluate(() => window.__nexo.store.get().nodes.at(-1).id);
      await page.evaluate(i => window.__nexo.handle.focusNode(i), id); return id; };
    const openExport = async id => { await page.evaluate(i => window.__nexo.handle.focusNode(i), id); await card(page, id).locator('header').click();
      await inspector.getByRole('tab', { name: 'Export', exact: true }).click(); };
    const devId = await addSource('qc_pca_tab-bqcDeviationPlot');
    await card(page, devId).getByText('Please configure at least 2 BQC replicate samples to view plot.').waitFor();
    await openExport(devId);
    const devMore = inspector.getByRole('group', { name: 'More downloads from this analysis', exact: true });
    await devMore.waitFor();
    const devButton = devMore.getByRole('button', { name: 'BQC PDF', exact: true });
    assert.equal(await devButton.isDisabled(), true);
    assert.match(await devMore.locator('.export-reason').textContent(), /^Please configure at least 2 BQC replicate samples/);
    assert.equal(await devButton.evaluate(b => document.getElementById(b.getAttribute('aria-describedby'))?.textContent ?? ''), await devMore.locator('.export-reason').textContent());
    console.log('PASS F-honest ' + name + ' placeholder-download-disabled-with-reason');
    // A module download the API refuses (422 {error,message}): one toast with the message, no console error.
    const bqcId = await addSource('qc_pca_tab-bqcPlot');
    await card(page, bqcId).locator('.body img').waitFor();
    await openExport(bqcId);
    const bqcButton = inspector.getByRole('group', { name: 'More downloads from this analysis', exact: true }).getByRole('button', { name: 'BQC PDF', exact: true });
    await bqcButton.waitFor(); assert.equal(await bqcButton.isEnabled(), true);
    const errorsBefore = errors.length;
    await bqcButton.click();
    const failed = page.locator('.toast', { hasText: 'Team could not build this PDF: select at least 2 BQC replicate samples first.' });
    await failed.waitFor({ timeout: 3000 }); assert.equal(await failed.count(), 1);
    assert.equal(errors.length, errorsBefore);
    console.log('PASS F-honest ' + name + ' failed-download-one-toast-no-console-error');
    // Plotly 3D: SVG is disabled with Plotly's real limitation, shown under the button.
    const pca3d = await addSource('qc_pca_tab-pca3dPlot');
    await page.waitForFunction(i => document.querySelector(`.card[data-id="${i}"] .js-plotly-plot`)?.data?.length > 0, pca3d, { timeout: 15000 });
    await openExport(pca3d);
    const svg3d = inspector.getByRole('button', { name: 'Download SVG', exact: true });
    assert.equal(await svg3d.isDisabled(), true);
    assert.match(await svg3d.evaluate(b => document.getElementById(b.getAttribute('aria-describedby'))?.textContent ?? ''), /3D and WebGL plots .*Plotly cannot save them as vector SVG/);
    assert.equal(await inspector.locator('.export-reason').isVisible(), true);
    console.log('PASS F-honest ' + name + ' 3d-svg-reason-visible');

    assert.deepEqual(errors, []); console.log('PASS H6d ' + name + ' no-console-errors');
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H6d Playwright: ${e.message}`); return; } throw e; }
  fs.mkdirSync(out, { recursive: true });
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
  console.log('H6d OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
