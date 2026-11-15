'use strict';
// b04 probe: barchart-donutPlotFiltered answers HTTP 500 on its first render. Does any Inspector change (a % Value
// Mode, as Team's donut observer selects; Single Replicates) or another size make it render? Synthetic checkpoint only.
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5184', T = 180000;
(async () => {
  const browser = await pw.chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on('response', async r => { if (/\/cards\//.test(r.url()) && r.request().method() !== 'GET') console.log(r.status(), r.request().method(), r.url().replace(/^.*\/cards\//, ''), r.request().postData()?.slice(0, 120) || '', r.status() >= 400 ? (await r.text().catch(() => '')).slice(0, 200) : ''); });
    await page.goto(`${base}/nexo/?checkpoint=nexo-complete-synthetic`);
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
    await page.waitForTimeout(2500);
    if (await page.locator('#library-panel-plots').isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
    await page.locator('#library-panel-plots button.library-add').first().waitFor({ state: 'attached', timeout: T });
    await page.evaluate(() => document.querySelectorAll('#library-panel-plots details').forEach(d => { d.open = true; }));
    await page.locator('#library-panel-plots button.library-add[aria-label="Confirm study design… (Composition share · filtered)"]').click();
    const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
    await design.getByLabel('Experimental unit').selectOption('Animal'); await design.getByLabel('Sample relationship').selectOption('independent');
    await design.getByRole('button', { name: 'Confirm study design', exact: true }).click(); await design.waitFor({ state: 'hidden' });
    await page.locator('#library-panel-plots button.library-add[aria-label="Add Composition share · filtered"]').click();
    const state = () => page.locator('#world .card .card-status').first().getAttribute('data-state');
    await page.waitForFunction(() => ['current', 'error', 'failed'].includes(document.querySelector('#world .card .card-status')?.dataset.state), null, { timeout: T });
    console.log('first state', await state());
    await page.getByRole('button', { name: /^(Close library|Hide library)$/ }).first().click();
    await page.locator('#world .card header').first().click();
    const insp = page.locator('#inspector');
    const opts = await insp.getByRole('radiogroup').allInnerTexts().catch(() => []);
    console.log('radiogroups', JSON.stringify(opts.map(t => t.replace(/\s+/g, ' ').slice(0, 120))));
    for (const [role, name] of [['radio', 'Absolute (%)'], ['radio', 'Single Replicates (Group Order)']]) {
      const c = insp.getByRole(role, { name, exact: true }); if (!(await c.count())) { console.log('no', name); continue; }
      await c.check(); await page.waitForTimeout(1000);
      await page.waitForFunction(() => ['current', 'error', 'failed'].includes(document.querySelector('#world .card .card-status')?.dataset.state), null, { timeout: T });
      console.log('after', name, await state());
    }
    await page.screenshot({ path: path.join(root, 'docs/integration/chart-audit/b04-composition/donutPlotFiltered-1-draws.png') });
  } finally { await browser.close(); }
})().catch(e => { console.error(String(e.message).split('\n').slice(0, 3).join(' ')); process.exitCode = 1; });
