// Pilot F1 (P2): Team's session palette in Nexo. The rail's Palettes opens it (Team's palette names, the session's group
// colours); a group colour set there redraws every group-coloured card (the dashboard PCA's Control trace, the QC 2D
// PCA image); it is one undo step (undo and redo send the earlier/later state back); a preset is Team's Use palette.
// Mock API (src/mock/palette.ts, session-wide as Team), Chromium and WebKit.
// node tests/dual-ui/test_nexo_session_palette.cjs
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
const percent = page => page.$eval('#hud', el => parseInt(el.textContent.split('|')[1]));
async function undo(page) { await page.locator('#viewport').focus(); await page.keyboard.press('Control+z'); }
const traceColour = (page, name) => page.evaluate(name => { const p = document.querySelector('#world .card[data-id="results_dashboard-plot_pca"] .js-plotly-plot');
  const t = (p?.data || []).find(t => t.name === name); return t ? String(t.marker?.color ?? '') : null; }, name);
const label = (page, instance) => page.evaluate(i => window.__nexoMock.labels[i] || '', instance);
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    await page.waitForFunction(() => ![...document.querySelectorAll('.card .body')].some(b => /Restoring/.test(b.textContent)));
    const qc = await page.evaluate(async () => { await window.__nexo.handle.addCard('qc_pca_tab-pca2dPlot'); const n = window.__nexo.store.get().nodes.find(n => n.instance?.source === 'qc_pca_tab-pca2dPlot'); return n.instance.instanceId ?? n.instance.id; });
    await page.evaluate(() => window.__nexo.handle.focusNode('results_dashboard-plot_pca'));
    await page.waitForFunction(() => (document.querySelector('#world .card[data-id="results_dashboard-plot_pca"] .js-plotly-plot')?.data || []).length > 0, null, { timeout: 15000 });
    const control0 = await traceColour(page, 'Control');
    // The rail opens the session palette: Team's palettes, the session's Group 1 colours.
    const rail = page.locator('nav.rail').getByRole('button', { name: 'Palettes', exact: true });
    await rail.click();
    const panel = page.getByRole('dialog', { name: 'Colors & palettes', exact: true });
    const choices = panel.getByRole('group', { name: 'Choose a palette', exact: true }).getByRole('button');
    await choices.first().waitFor();
    assert.deepEqual(await choices.evaluateAll(bs => bs.map(b => b.querySelector('.session-palette-name').textContent)),
      ['Default', 'Tableau Classic', 'Ocean & Coral', 'Earth & Garden', 'Colorblind Friendly']);
    assert.equal(await choices.first().getAttribute('aria-pressed'), 'true');
    const group1 = panel.getByRole('group', { name: 'Sample groups (Group 1)', exact: true });
    const control = group1.getByLabel('Colour for Control', { exact: true });
    assert.equal(await control.inputValue(), '#377eb8');
    console.log(`PASS F1 ${name} rail-palettes-opens-team-session-palette`);
    // A group colour: one PATCH (Team's Apply color changes), every group-coloured card redraws with it.
    const patches = await page.evaluate(() => window.__nexoPaletteMock.patches.length);
    await control.fill('#aa3300'); await control.blur();
    await page.waitForFunction(n => window.__nexoPaletteMock.patches.length > n, patches);
    assert.deepEqual(await page.evaluate(n => window.__nexoPaletteMock.patches.slice(n), patches), [{ context: 'Group1', colors: { Control: '#AA3300' } }]);
    await page.waitForFunction(() => { const p = document.querySelector('#world .card[data-id="results_dashboard-plot_pca"] .js-plotly-plot'); return (p?.data || []).some(t => t.name === 'Control' && String(t.marker?.color).toUpperCase() === '#AA3300'); }, null, { timeout: 15000 });
    await page.waitForFunction(i => /#AA3300/i.test(window.__nexoMock.labels[i] || ''), qc, { timeout: 15000 });
    console.log(`PASS F1 ${name} group-colour-redraws-the-dashboard-pca-and-the-qc-pca (${control0} -> #AA3300)`);
    // One undo step: Undo sends the earlier state back and the cards redraw; Redo sends the later one.
    await page.locator('#viewport').focus(); await page.keyboard.press('Control+z');
    await page.waitForFunction(c0 => { const p = document.querySelector('#world .card[data-id="results_dashboard-plot_pca"] .js-plotly-plot'); return (p?.data || []).some(t => t.name === 'Control' && String(t.marker?.color) === c0); }, control0, { timeout: 15000 });
    assert.deepEqual(await page.evaluate(() => window.__nexoPaletteMock.patches.at(-1)), { restore: { useCustomColors: false, customColors: {}, activePalette: 'Default' } });
    await page.waitForFunction(() => document.querySelector('[aria-label="Colour for Control"]')?.value === '#377eb8');
    await page.locator('#viewport').focus(); await page.keyboard.press('Control+Shift+z');
    await page.waitForFunction(i => /#AA3300/i.test(window.__nexoMock.labels[i] || ''), qc, { timeout: 15000 });
    assert.equal((await traceColour(page, 'Control')).toUpperCase(), '#AA3300');
    console.log(`PASS F1 ${name} one-undo-step-undo-and-redo-send-the-state-back`);
    // A preset is Team's Use palette: every group takes the preset's colours; the preset is pressed.
    await choices.filter({ hasText: 'Tableau Classic' }).click();
    await page.waitForFunction(() => { const p = document.querySelector('#world .card[data-id="results_dashboard-plot_pca"] .js-plotly-plot'); return (p?.data || []).some(t => t.name === 'Case' && String(t.marker?.color).toUpperCase() === '#4E79A7'); }, null, { timeout: 15000 });
    assert.equal(await choices.filter({ hasText: 'Tableau Classic' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await group1.getByLabel('Colour for Case', { exact: true }).inputValue(), '#4e79a7');
    console.log(`PASS F1 ${name} preset-is-team-use-palette`);
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' });
    assert.equal(await rail.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errors, []); console.log(`PASS F1 ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F1 Playwright: ${e.message}`); return; } throw e; }
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
  console.log('F1 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
