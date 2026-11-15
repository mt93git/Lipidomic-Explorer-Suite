'use strict';
// Chart audit, batch b01-dashboard, DESIGN role: before/after screenshots of each dashboard plot as Paula sees it
// (card at 100 %, zoomed out, enlarged, Inspector on Data and Appearance) against the designer's synthetic-only API
// (Vite :5281 proxies /api to 127.0.0.1:3962). Also dumps each figure's JSON for offline preset design.
//   node tests/dual-ui/chart-audit/design_b01-dashboard.cjs <before|after|nexo> [pca,violin,dist,comp,heat] [width]
// Env: NEXO_AUDIT_BASE (default http://127.0.0.1:5281), NEXO_AUDIT_SHOTS (default docs/integration/chart-audit/b01-dashboard-design).
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = (process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5281').replace(/\/$/, '');
const shots = path.resolve(root, process.env.NEXO_AUDIT_SHOTS || 'docs/integration/chart-audit/b01-dashboard-design');
const CHECKPOINT = 'nexo-complete-synthetic';
const T = 180000;
const PLOTS = {
  pca: { source: 'results_dashboard-plot_pca', label: 'Principal components' },
  violin: { source: 'results_dashboard-plot_violin', label: 'Feature distributions' },
  dist: { source: 'results_dashboard-plot_dist', label: 'Signal distribution' },
  comp: { source: 'results_dashboard-plot_comp', label: 'Composition overview' },
  heat: { source: 'results_dashboard-plot_heat', label: 'Abundance heatmap' },
};
const mode = process.argv[2] || 'before';
const wanted = (process.argv[3] || Object.keys(PLOTS).join(',')).split(',').map(s => s.trim()).filter(Boolean);
const width = Number(process.argv[4] || 1440), height = width <= 390 ? 844 : width <= 1024 ? 768 : 900;
const cardFor = (page, id) => page.locator(`#world .card[data-id="${id}"]`);
const ids = page => page.locator('#world .card').evaluateAll(cs => cs.map(c => c.dataset.id));
const inspector = page => page.locator('#inspector');
async function settled(page, id) { await page.waitForFunction(sel => document.querySelector(sel + ' .card-status')?.dataset.state === 'current', `#world .card[data-id="${id}"]`, { timeout: T }); }
async function drawn(page, id, kind = 'any') {
  await page.waitForFunction(([sel, kind]) => {
    const c = document.querySelector(sel); if (!c) return false;
    const img = [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0);
    const plot = [...c.querySelectorAll('.js-plotly-plot')].some(p => (p.data?.length ?? 0) > 0);
    return kind === 'plot' ? plot : kind === 'img' ? img : img || plot;
  }, [`#world .card[data-id="${id}"]`, kind], { timeout: T });
}
async function fit(page) { await page.getByRole('button', { name: 'Fit', exact: true }).click(); await page.waitForTimeout(400); }
async function hundred(page) { await page.getByRole('button', { name: '100%', exact: true }).last().click(); await page.waitForTimeout(400); }
async function selectCard(page, id) {
  const box = await cardFor(page, id).locator('header').boundingBox(), view = page.viewportSize();
  if (!box || box.x < 0 || box.y < 60 || box.x + 60 > view.width || box.y + 30 > view.height) await fit(page);
  await cardFor(page, id).locator('header strong').first().click();
  await page.waitForFunction(sel => document.querySelector(sel)?.classList.contains('selected'), `#world .card[data-id="${id}"]`, { timeout: T });
}
async function inspectorTab(page, name) {
  const tab = inspector(page).getByRole('tab', { name, exact: true });
  if (!(await tab.count())) return false;
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await page.waitForTimeout(300);
  return true;
}
async function openPlots(page) {
  const panel = page.getByRole('complementary', { name: 'Library' });
  if (!(await panel.isVisible().catch(() => false))) await page.getByRole('navigation', { name: 'Canvas tools' }).getByRole('button', { name: 'Plots', exact: true }).click();
  const tab = panel.getByRole('tab', { name: 'Plots', exact: true });
  if (await tab.getAttribute('aria-selected', { timeout: T }) !== 'true') await tab.click();
  return panel;
}
async function closeLibrary(page) {
  for (const name of ['Close library', 'Hide library']) { const b = page.getByRole('button', { name, exact: true }); if (await b.isVisible().catch(() => false)) { await b.click(); return; } }
}
async function addPlot(page, label) {
  const panel = await openPlots(page);
  await panel.getByRole('searchbox', { name: 'Search plots' }).fill(label);
  const before = await ids(page);
  await panel.getByRole('button', { name: `Add ${label}`, exact: true }).click({ timeout: T });
  await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before.length, { timeout: T });
  const id = (await ids(page)).find(x => !before.includes(x));
  if (!id) throw new Error(`no new card for ${label}`);
  await panel.getByRole('searchbox', { name: 'Search plots' }).fill('');
  return id;
}
async function shot(page, name, locator) {
  const file = path.join(shots, `${name}.png`);
  if (locator) await locator.screenshot({ path: file }).catch(() => page.screenshot({ path: file }));
  else await page.screenshot({ path: file });
  if (fs.statSync(file).size > 400 * 1024) await page.screenshot({ path: file, clip: { x: 0, y: 0, width: Math.min(1100, width), height: Math.min(700, height) } });
  console.log('shot', path.relative(root, file), fs.statSync(file).size);
}
async function waitShell(page) { await page.getByRole('button', { name: /^Export figure/ }).first().waitFor({ timeout: T }); }
async function applyPreset(page, name) {
  const b = inspector(page).getByRole('button', { name, exact: true });
  await b.click(); await page.waitForTimeout(1200);
}
(async () => {
  const browser = await pw.chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(CHECKPOINT)}`);
  await waitShell(page); await page.waitForTimeout(1500);
  const existing = await ids(page);
  console.log('cards on canvas:', existing.length, existing.slice(0, 12).join(', '));
  const sfx = width === 1440 ? '' : `-w${width}`;
  for (const key of wanted) {
    const { source, label } = PLOTS[key];
    let id = existing.find(x => x === source || x.startsWith(source));
    if (!id) { id = await addPlot(page, label); await closeLibrary(page); }
    await hundred(page);
    await selectCard(page, id); await settled(page, id); await drawn(page, id, 'plot');
    if (mode === 'nexo') { await inspectorTab(page, 'Appearance'); await applyPreset(page, 'Nexo'); }
    if (mode === 'team') { await inspectorTab(page, 'Appearance'); await applyPreset(page, 'Team original'); }
    await page.waitForTimeout(600);
    // figure JSON for offline design
    const fig = await cardFor(page, id).evaluate(c => { const p = c.querySelector('.js-plotly-plot'); return p ? { data: p.data.map(t => { const o = {}; for (const k of Object.keys(t)) o[k] = Array.isArray(t[k]) && t[k].length > 8 ? { _len: t[k].length, head: t[k].slice(0, 4) } : t[k]; return o; }), layout: p.layout, size: [p._fullLayout.width, p._fullLayout.height] } : null; });
    fs.writeFileSync(`/tmp/nexo-design-b01/${key}-${mode}.json`, JSON.stringify(fig, null, 1));
    await shot(page, `${key}-${mode}-card-100${sfx}`, cardFor(page, id));
    if (width === 1440) {
      await inspectorTab(page, 'Data'); await shot(page, `${key}-${mode}-inspector-data`, inspector(page));
      await inspectorTab(page, 'Appearance');
      // open every section so the controls can be judged
      await inspector(page).locator('details:not([open]) > summary').evaluateAll(ss => ss.forEach(s => s.parentElement.open = true));
      await page.waitForTimeout(300);
      await shot(page, `${key}-${mode}-inspector-appearance`, inspector(page));
      await inspector(page).locator('details[open] > summary').evaluateAll(ss => ss.forEach(s => s.parentElement.open = false));
      // zoomed out
      for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await page.waitForTimeout(1500); await drawn(page, id, 'any');
      await shot(page, `${key}-${mode}-zoomed-out`, cardFor(page, id));
      await hundred(page); await drawn(page, id, 'plot');
      // enlarged: drag resize handle
      await selectCard(page, id);
      const handle = cardFor(page, id).getByLabel('Resize card');
      const b = await handle.boundingBox();
      if (b) { const x = b.x + b.width / 2, y = b.y + b.height / 2; await page.mouse.move(x, y); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(x + 300 * i / 8, y + 220 * i / 8); await page.mouse.up(); await page.waitForTimeout(1500); }
      await fit(page); await hundred(page); await selectCard(page, id); await page.waitForTimeout(800);
      await shot(page, `${key}-${mode}-card-large`, cardFor(page, id));
      // undo the resize so the next plot starts clean
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await page.waitForTimeout(800);
    }
  }
  console.log('console errors:', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
