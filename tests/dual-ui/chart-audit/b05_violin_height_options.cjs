'use strict';
// Chart audit b05, finding F5 (decision material, not a fix): how the Violin View card could follow Team's plot height
// (`violin_zoom_pct`, module R/modules/4_heatmap_module.R:698-703, 720, 727-728). Adds the card as a user does, asks the
// audit API for the module's own render at Team's height, and shows it two ways in the page (a DOM mock, nothing in the
// app changes):
//   A  the card grows to Team's height (620 x violin_zoom_pct), the whole plot at once;
//   B  the card keeps its size and the plot scrolls inside the card body at Team's height.
// Also screenshots today's behaviour (the plot squeezed into 620x720). Synthetic checkpoint only.
//   NEXO_AUDIT_BASE=http://127.0.0.1:5285 node tests/dual-ui/chart-audit/b05_violin_height_options.cjs
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5185';
const shots = path.join(root, 'docs/integration/chart-audit/b05-heatmaps');
const T = 180000;

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const paths = new Set();
  page.on('request', r => { const m = r.url().match(/\/api\/v1(\/sessions\/[^/]+\/cards\/[^/]+)\/render/); if (m) paths.add(m[1]); });
  try {
    await page.goto(`${base}/nexo/?checkpoint=nexo-complete-synthetic`);
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
    await page.waitForTimeout(2500);
    if (await page.locator('.library-panel').isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
    await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
    await page.locator('button.library-add[aria-label="Add Selected-feature distributions"]').first().click();
    await page.waitForFunction(() => document.querySelector('#world .card .card-status')?.dataset.state === 'current', null, { timeout: T });
    const close = page.getByRole('button', { name: /^(Close library|Hide library)$/ }).first();
    if (await close.isVisible()) await close.click();
    const card = page.locator('#world .card').first();
    await card.locator('header').click();
    await page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true }).click();
    const h = Number(await page.locator('#inspector').getByLabel('Plot Height (px)').inputValue().catch(() => '3000')) || 3000;
    await page.locator('.zoom-pill').getByRole('button', { name: '100%', exact: true }).click().catch(() => {});
    await page.waitForTimeout(800);
    await card.screenshot({ path: path.join(shots, 'violin_plot_render-F5-today.png') });
    const p = [...paths].pop(); // the only card on the canvas
    // The module's own render at Team's height (as plotOutput(height = violin_zoom_pct) draws it).
    const url = await page.evaluate(async ([p, h]) => {
      const r = await fetch(`/api/v1${p}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ width: 620, height: h, format: 'png' }) });
      if (!r.ok) throw new Error(`render ${r.status}`);
      return URL.createObjectURL(await r.blob());
    }, [p, h]);
    // Option B: same card size, the body scrolls over the plot drawn at Team's height.
    await card.evaluate((c, u) => { const b = c.querySelector('.body'), i = b.querySelector('img');
      b.style.overflowY = 'auto'; i.src = u; i.style.objectFit = 'none'; i.style.width = '100%'; i.style.height = 'auto'; i.style.maxHeight = 'none'; }, url);
    await page.waitForTimeout(800);
    await card.evaluate(c => { c.querySelector('.body').scrollTop = 0; });
    await card.screenshot({ path: path.join(shots, 'violin_plot_render-F5-option-B-scroll.png') });
    // Option A: the card is as tall as Team's plot; at 100 % only its top is on screen, so show it at Fit.
    await card.evaluate((c, h) => { const b = c.querySelector('.body'), i = b.querySelector('img');
      b.style.overflowY = ''; c.style.height = `${h + (c.getBoundingClientRect().height - b.getBoundingClientRect().height)}px`; i.style.objectFit = 'contain'; i.style.height = '100%'; }, h);
    await page.waitForTimeout(500);
    await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(shots, 'violin_plot_render-F5-option-A-tall-card.png') });
    console.log(`Team height ${h} px; screenshots violin_plot_render-F5-{today,option-B-scroll,option-A-tall-card}.png`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
