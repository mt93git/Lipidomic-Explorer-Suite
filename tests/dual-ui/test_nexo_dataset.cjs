// Admin → Nexo open (docs/integration/admin-nexo-open.md), against the mock API: ?dataset=<uuid> asks for Team's choices,
// the Prepare page (nexo-entry-build.md, scene 3) shows every sample ticked by group with Team's defaults and the live
// preview, one sample unticked and "Prepare and check" opens the prepared session through the quality check (title ORD041 · v1,
// the band's lipid count, an empty canvas); Cancel goes to Start and opens nothing; at 390 px the one action stays on screen;
// an unknown id says so; signed out of Admin (docs/integration/admin-identity.md) it asks once and links to Admin's sign-in.
// node tests/dual-ui/test_nexo_dataset.cjs      (NEXO_BROWSERS=chromium limits the run; NEXO_PLOTLY_JS for the build)
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
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
// Team's guided defaults (nexo-entry-build.md C3).
const defaults = { minDetectionPct: 0, detectionScope: 'global', dropNonDetected: true, normalizationMethod: 'median', useImputation: true, imputeZerosPerFile: true, imputeRemainingNAtoZero: false };
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    // The released dataset the mock serves (src/mock/dataset.ts), read from the mock itself.
    const page = await context.newPage();
    await page.goto(`${base}/nexo/`); await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    const dataset = await page.evaluate(() => window.__nexoDatasetMock.datasets[0]);
    assert.equal(dataset.orderCode, 'ORD041'); assert.ok(dataset.samples.length >= 2);

    // 1. ?dataset= → the Prepare page: every sample ticked in its group, Team's defaults in words, the preview's count.
    await page.goto(`${base}/nexo/?dataset=${encodeURIComponent(dataset.adminDatasetId)}`);
    const prep = page.locator('.prep');
    await prep.getByRole('heading', { name: /^Prepare (the data|ORD\d+ · v\d+)$/, level: 1 }).waitFor(); // UX3-C names the dataset when it is known
    assert.deepEqual(await prep.locator('.grp > b').allTextContents(), ['Control', 'Treated']);
    for (const sample of dataset.samples) assert.equal(await prep.getByLabel(sample, { exact: true }).isChecked(), true, `${sample} ticked`);
    assert.equal(await prep.locator('.sampletools > span').textContent(), `${dataset.samples.length} of ${dataset.samples.length} selected`);
    const slider = prep.getByLabel('Keep lipids detected in at least', { exact: true });
    assert.equal(await slider.inputValue(), '0');
    assert.equal(await prep.locator('.slider output').textContent(), '0 %');
    assert.equal(await prep.getByRole('button', { name: 'All selected samples', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await prep.getByRole('button', { name: 'Median (log scale)', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await prep.getByRole('switch', { name: 'Estimate with QRILC', exact: true }).isChecked(), true);
    await prep.locator('summary', { hasText: 'More settings' }).click();
    assert.equal(await prep.getByLabel('Leave out lipids never detected in the selected samples', { exact: true }).isChecked(), true);
    assert.equal(await prep.getByLabel('For each file, set entirely missing lipids to zero', { exact: true }).isChecked(), true);
    assert.equal(await prep.getByLabel('Replace remaining missing values with zero', { exact: true }).isChecked(), false);
    assert.equal(await prep.getByLabel('Imputation seed', { exact: true }).inputValue(), '42');
    const bar = page.locator('.stickybar');
    assert.equal(await bar.locator('.grow').textContent(), 'All settings are Team’s defaults.');
    await prep.locator('.side .hero').getByText(`of ${dataset.lipids} lipids kept`, { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.__nexoDatasetMock.opened), 0);
    console.log(`PASS dataset ${name} prepare-defaults-and-preview`);

    // 2. Untick one sample, nudge the integer slider one step: the preview asks again, two changes are counted; "Prepare and
    //    check" opens the prepared session (the quality check passes on) as a checkpoint opens.
    const dropped = dataset.samples[dataset.samples.length - 1], kept = dataset.samples.slice(0, -1);
    await prep.getByLabel(dropped, { exact: true }).uncheck();
    assert.equal(await prep.locator('.sampletools > span').textContent(), `${kept.length} of ${dataset.samples.length} selected`);
    await slider.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await prep.locator('.slider output').textContent(), '5 %');
    assert.equal(await bar.locator('.grow').textContent(), '2 changes from Team’s defaults · Reset');
    await page.waitForFunction(k => window.__nexoDatasetMock.preview?.minDetectionPct === 5 && window.__nexoDatasetMock.preview.samples.length === k, kept.length);
    assert.deepEqual(await page.evaluate(() => window.__nexoDatasetMock.preview), { adminDatasetId: dataset.adminDatasetId, samples: kept, minDetectionPct: 5, detectionScope: 'global', dropNonDetected: true });
    await bar.getByRole('button', { name: 'Prepare and check', exact: true }).click();
    await page.getByRole('heading', { name: 'Quality check', exact: true }).waitFor();
    // The band reports what the check shows: the lipids kept, not the workbook's total.
    const [, lipids, samples] = /(\d+) lipids, (\d+) samples/.exec(await page.locator('.check-lede').textContent());
    assert.equal(Number(samples), kept.length); assert.ok(Number(lipids) < dataset.lipids);
    await page.getByRole('button', { name: /^Open the Canvas/ }).click();
    const summary = page.locator('.status-band .dataset-summary');
    await summary.waitFor();
    assert.equal(await summary.textContent(), `${lipids} lipids · ${samples} samples`);
    assert.equal((await page.locator('.topbar .project').textContent()).trim(), 'ORD041 · v1 ▾');
    assert.equal(await page.title(), 'ORD041 · v1');
    await page.locator('.canvas-empty').waitFor();
    assert.equal(await page.evaluate(() => window.__nexo.store.get().nodes.length), 0);
    assert.equal(new URL(page.url()).searchParams.get('checkpoint'), null);
    const mock = await page.evaluate(() => window.__nexoDatasetMock);
    assert.equal(mock.opened, 1);
    assert.deepEqual(mock.last, { samples: kept, ...defaults, minDetectionPct: 5 });
    assert.equal(Number.isInteger(mock.last.minDetectionPct), true);
    // Both requests carried the signed-in Admin user's token, asked of Admin once (cached until 60 s before it expires).
    assert.match(mock.authorization, /^mock-admin-token$/);
    assert.equal(mock.admin.requests, 1);
    console.log(`PASS dataset ${name} untick-prepare-open`);

    // 3. Cancel opens nothing: Start, with the checkpoints to choose from, and no session prepared.
    const second = await context.newPage();
    await second.goto(`${base}/nexo/?dataset=${encodeURIComponent(dataset.adminDatasetId)}`);
    await second.locator('.prep').waitFor();
    await second.locator('.stickybar').getByRole('button', { name: 'Cancel', exact: true }).click();
    await second.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    assert.equal(await second.locator('.prep').count(), 0);
    assert.equal(await second.locator('#canvas-host').count(), 0);
    assert.equal(await second.evaluate(() => window.__nexoDatasetMock.opened), 0);
    console.log(`PASS dataset ${name} cancel-to-start`);

    // 3b. On a phone the one action stays on screen, the form scrolls under it, and nothing sticks out sideways.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    phone.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const small = await phone.newPage();
    await small.goto(`${base}/nexo/?dataset=${encodeURIComponent(dataset.adminDatasetId)}`);
    const go = small.getByRole('button', { name: 'Prepare and check', exact: true });
    await go.waitFor();
    for (const at of ['top', 'bottom']) {
      if (at === 'bottom') await small.locator('.entry').evaluate(e => { e.scrollTop = e.scrollHeight; });
      const box = await go.boundingBox();
      assert(box && box.y >= 0 && box.y + box.height <= 844, `Prepare and check off screen at the ${at} (${JSON.stringify(box)})`);
    }
    assert.equal(await small.evaluate(() => document.documentElement.scrollWidth <= 390 && [...document.querySelectorAll('.entry *')].every(e => e.getBoundingClientRect().right <= 391)), true, 'nothing wider than the phone');
    await phone.close();
    console.log(`PASS dataset ${name} phone-action-in-view`);

    // 4. An id the store does not serve (404 dataset_not_found) is a sentence, with Try again and the checkpoints to fall back on.
    const third = await context.newPage();
    await third.goto(`${base}/nexo/?dataset=00000000-0000-4000-8000-000000000000`);
    const alert = third.locator('.picker p[role=alert]');
    await alert.waitFor();
    assert.equal(await alert.textContent(), 'This dataset is not available to Nexo: it is not released, or it was withdrawn or superseded. Ask the lab for the current release.');
    await third.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    await third.getByRole('button', { name: 'Choose checkpoint', exact: true }).click();
    await third.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    console.log(`PASS dataset ${name} not-found-message`);

    // 5. Signed out of Admin: one token request (no retry storm), a sentence and a Sign in to Admin link back to this page; nothing opens.
    const fourth = await context.newPage();
    await fourth.addInitScript(() => sessionStorage.setItem('nexo-mock-admin', 'signed-out'));
    const here = `${base}/nexo/?dataset=${encodeURIComponent(dataset.adminDatasetId)}`;
    await fourth.goto(here);
    await fourth.getByRole('heading', { name: 'Your analysis starts here', exact: true }).waitFor();
    const forgot = fourth.getByRole('link', { name: 'Forgot password?', exact: true });
    assert.equal(await forgot.getAttribute('href'), `/admin/forgot-password?next=${encodeURIComponent(new URL(here).pathname + new URL(here).search)}`);
    await fourth.waitForTimeout(1500);
    const out = await fourth.evaluate(() => window.__nexoDatasetMock);
    assert.equal(out.admin.requests, 1); assert.equal(out.opened, 0); assert.equal(out.authorization, null);
    assert.equal(await fourth.getByRole('dialog').count(), 0);
    assert.equal(await fourth.locator('#canvas-host').count(), 0);
    console.log(`PASS dataset ${name} signed-out-sign-in-link`);

    assert.deepEqual(errors, []); console.log(`PASS dataset ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP dataset Playwright: ${e.message}`); return; } throw e; }
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
  for (const name of (process.env.NEXO_BROWSERS || 'chromium,webkit').split(',')) await browserTests(pw, name, base);
  console.log('dataset OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
