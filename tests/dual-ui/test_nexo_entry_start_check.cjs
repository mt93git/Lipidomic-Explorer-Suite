// NEXO-ENTRY task ENTRY-4: Start → Prepare → Check → Canvas with ENTRY-4's screens (mock path), Chromium and WebKit, on
// the real page (main.tsx's screen switch) under the Vite dev server with VITE_API_MOCK=1 (the entry harness is gone,
// ENTRY-INT). node tests/dual-ui/test_nexo_entry_start_check.cjs
'use strict';
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
let server;
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
async function open(browser, base, storage = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(values => { try { for (const [k, v] of Object.entries(values)) sessionStorage.setItem(k, v); } catch { /* about:blank has no storage */ } }, storage);
  const errors = [];
  context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('weberror', e => errors.push(e.error().message));
  const page = await context.newPage();
  await page.goto(`${base}/nexo/`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  return { context, page, errors };
}
async function toCheck(page) {
  await page.getByRole('button', { name: 'Prepare ORD041 · v1', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare and check', exact: true }).click();
  await page.getByRole('heading', { name: 'Quality check', exact: true }).waitFor();
  await page.getByRole('heading', { name: '1 sample to review', exact: true }).waitFor();
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    { // Lab staff: projects and released datasets from the two routes, the client filter, the import.
      const { context, page, errors } = await open(browser, base);
      await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
      const projects = page.getByRole('region', { name: /^Projects/ }), released = page.getByRole('region', { name: /^Released datasets/ });
      assert.deepEqual(await projects.locator('.start-name').allTextContents(), ['ORD038 · v2', 'ORD036 · v1']);
      assert.deepEqual(await released.locator('.start-name').allTextContents(), ['ORD041 · v1 New'], 'datasets with a project are not listed as released');
      assert.equal(await page.getByRole('region', { name: 'Continue where you left off' }).getByRole('heading').textContent(), 'ORD038 · v2');
      await page.getByRole('group', { name: 'Filter by client' }).getByRole('button', { name: 'Marlow Bay lab', exact: true }).click();
      assert.deepEqual(await projects.locator('.start-name').allTextContents(), ['ORD038 · v2']);
      assert.equal(await released.getByRole('button').count(), 0);
      await page.getByRole('group', { name: 'Filter by client' }).getByRole('button', { name: 'All clients', exact: true }).click();
      await Promise.all([page.waitForEvent('filechooser'), button(page, 'Import a Team checkpoint (.zip)').click()]);
      console.log(`PASS ENTRY-4 ${name} start-staff-lists-filter-import`);

      // Prepare → Check: the warning names the sample; charts have tooltips and tables; Keep, Undo, Exclude with a reason.
      await toCheck(page);
      const verdict = page.locator('.check-verdict');
      assert.match(await verdict.textContent(), /Treated_3 looks like an outlier/);
      await page.locator('.check-svg circle.hit[data-tip^="Treated_3"]').hover();
      await page.getByRole('tooltip').waitFor();
      assert.match(await page.getByRole('tooltip').textContent(), /PC1 .* PC2/);
      await page.getByText('Show as table').first().click();
      assert.equal(await page.locator('.check-tbl table').first().isVisible(), true);
      await page.locator('.check-svg .hit').nth(1).focus();
      assert.match(await page.getByRole('tooltip').textContent(), /distance/);
      console.log(`PASS ENTRY-4 ${name} check-warns-names-sample-tooltip-table`);
      await button(page, 'Keep Treated_3').click();
      await page.getByRole('heading', { name: 'Ready for the Canvas', exact: true }).waitFor();
      await page.locator('.check-decisions', { hasText: 'Treated_3 kept' }).getByRole('button', { name: 'Undo' }).click();
      await page.getByRole('heading', { name: '1 sample to review', exact: true }).waitFor();
      await button(page, 'Exclude…').click();
      await page.getByRole('textbox', { name: 'Reason for excluding Treated_3 (optional)' }).fill('failed injection');
      await button(page, 'Exclude Treated_3').click();
      await page.getByRole('heading', { name: 'Ready for the Canvas', exact: true }).waitFor();
      assert.match(await verdict.textContent(), /Treated_3 excluded \(“failed injection”\)/);
      const mock = await page.evaluate(() => window.__nexoDatasetMock);
      assert.equal(mock.opened, 2, 'Exclude prepared again');
      // ENTRY-8: Team's sample decision (outlierTreatments), the samples unchanged.
      assert.deepEqual(mock.last.samples, ['Control_1', 'Control_2', 'Control_3', 'Treated_1', 'Treated_2', 'Treated_3']);
      assert.deepEqual(mock.last.outlierTreatments, { Treated_3: 'remove' });
      assert.equal(await page.locator('.check-svg .hit[data-tip^="Treated_3"]').count(), 0);
      console.log(`PASS ENTRY-4 ${name} check-keep-undo-exclude-reprepares`);
      await page.getByRole('button', { name: /^Open the Canvas/ }).click();
      await page.waitForSelector('#viewport', { timeout: 30_000 });
      assert.equal((await page.evaluate(() => window.__nexoDatasetMock)).opened, 2, 'the board opens on the session prepared without Treated_3');
      assert.equal(await page.locator('.notice-banner').count(), 0, 'no banner once decided');
      await button(page, 'Prepared by Lab staff · settings').click();
      assert.match(await page.locator('.notice-card').textContent(), /Samples5.*Treated_3 excluded by Lab staff · failed injection.*Everyone on this board sees the same prepared data\./);
      console.log(`PASS ENTRY-4 ${name} canvas-gets-decisions-and-session`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    { // Open the Canvas while undecided: never blocked; the board's banner names the sample and Review opens the decision.
      const { context, page, errors } = await open(browser, base);
      await toCheck(page);
      await page.getByRole('button', { name: /^Open the Canvas/ }).click();
      await page.waitForSelector('#viewport', { timeout: 30_000 });
      const banner = page.locator('.notice-banner');
      assert.match(await banner.textContent(), /Treated_3 looks like an outlier and is still undecided/);
      await button(banner, 'Review').click();
      assert.match(await page.locator('.notice-card').textContent(), /Treated_3 sits far from the other samples/);
      console.log(`PASS ENTRY-4 ${name} undecided-opens-canvas-with-banner`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    { // A client member whose client has membersPrepare off: their group only, no Prepare, no import.
      const { context, page, errors } = await open(browser, base, { 'nexo-mock-admin': 'client' });
      await page.getByRole('heading', { name: 'Welcome', exact: true }).waitFor();
      // The lede names the group once the datasets list has loaded; wait for it instead of reading it at once.
      await page.locator('.start-lede', { hasText: /^Fennel Hill group$/ }).waitFor();
      assert.equal(await page.getByRole('button', { name: /^Prepare/ }).count(), 0);
      assert.equal(await page.getByText('Waiting for the lab', { exact: true }).count(), 1);
      assert.equal(await page.getByText('Import a Team checkpoint (.zip)').count(), 0);
      assert.equal(await page.getByRole('region', { name: 'New from the lab' }).getByRole('heading').textContent(), 'ORD036 · v1');
      console.log(`PASS ENTRY-4 ${name} start-client-waits-for-the-lab`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    { // Nothing released yet: the empty state.
      const { context, page, errors } = await open(browser, base, { 'nexo-mock-admin': 'client', 'nexo-mock-entry': 'empty' });
      await page.getByRole('heading', { name: 'Nothing here yet', exact: true }).waitFor();
      assert.equal(await page.locator('.start-empty img').evaluate(img => img.complete && img.naturalWidth > 0), true, 'macrophage drawn');
      console.log(`PASS ENTRY-4 ${name} start-empty`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP ENTRY-4 Playwright: ${e.message}`); return; } throw e; }
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(p), '--strictPort'],
    { cwd: nexo, stdio: 'ignore', env: { ...process.env, VITE_API_MOCK: '1', VITE_COLLAB_URL: '' } });
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('dev server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  for (const name of ['chromium', 'webkit']) await browserTests(pw, name, base);
  console.log('ENTRY-4 OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
