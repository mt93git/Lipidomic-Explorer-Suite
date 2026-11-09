// Admin → Nexo open (docs/integration/admin-nexo-open.md), against the mock API: ?dataset=<uuid> asks for Team's choices,
// the Prepare dataset dialog shows every sample ticked with Team's defaults, one sample unticked and confirmed opens the
// prepared session (title ORD041 · v1, the band's lipid count, an empty canvas); Cancel opens nothing; an unknown id says so;
// signed out of Admin (docs/integration/admin-identity.md) it asks once and links to Admin's sign-in, coming back here.
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
const defaults = { minDetectionPct: 0, detectionScope: 'global', dropNonDetected: false, normalizationMethod: 'median', useImputation: true, imputeZerosPerFile: true, imputeRemainingNAtoZero: true };
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    // The released dataset the mock serves (src/mock/dataset.ts), read from the mock itself.
    const page = await context.newPage();
    await page.goto(`${base}/nexo/`); await page.waitForSelector('.picker');
    const dataset = await page.evaluate(() => window.__nexoDatasetMock.datasets[0]);
    assert.equal(dataset.orderCode, 'ORD041'); assert.ok(dataset.samples.length >= 2);

    // 1. ?dataset= → the Prepare dataset dialog: every sample ticked, Team's defaults in each control.
    await page.goto(`${base}/nexo/?dataset=${encodeURIComponent(dataset.adminDatasetId)}`);
    const dialog = page.getByRole('dialog', { name: 'Prepare dataset', exact: true });
    await dialog.waitFor();
    for (const sample of dataset.samples) assert.equal(await dialog.getByLabel(sample, { exact: true }).isChecked(), true, `${sample} ticked`);
    assert.equal(await dialog.locator('.selection-count').textContent(), `${dataset.samples.length} of ${dataset.samples.length} samples selected`);
    const slider = dialog.getByLabel('Minimum detection (%)', { exact: true });
    assert.equal(await slider.inputValue(), '0');
    assert.equal(await dialog.locator('output').textContent(), '0');
    assert.equal(await dialog.getByLabel('Detection across', { exact: true }).inputValue(), 'global');
    assert.equal(await dialog.getByLabel('Normalization', { exact: true }).inputValue(), 'median');
    assert.equal(await dialog.getByLabel('Drop lipids not detected in any sample', { exact: true }).isChecked(), false);
    assert.equal(await dialog.getByLabel('Impute missing values (QRILC)', { exact: true }).isChecked(), true);
    assert.equal(await dialog.getByLabel('For each file, impute all-NA lipids to 0', { exact: true }).isChecked(), true);
    assert.equal(await dialog.getByLabel('Final cleanup: impute any remaining NAs to 0', { exact: true }).isChecked(), true);
    assert.equal(await page.evaluate(() => window.__nexoDatasetMock.opened), 0);
    console.log(`PASS dataset ${name} dialog-defaults`);

    // 2. Untick one sample, nudge the integer slider one step, confirm: the prepared session opens as a checkpoint does.
    const dropped = dataset.samples[dataset.samples.length - 1], kept = dataset.samples.slice(0, -1);
    await dialog.getByLabel(dropped, { exact: true }).uncheck();
    assert.equal(await dialog.locator('.selection-count').textContent(), `${kept.length} of ${dataset.samples.length} samples selected`);
    await slider.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await dialog.locator('output').textContent(), '5');
    await dialog.getByRole('button', { name: 'Open dataset', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const summary = page.locator('.status-band .dataset-summary');
    await summary.waitFor();
    assert.equal(await summary.textContent(), `${dataset.lipids} lipids · ${kept.length} samples`);
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
    assert.match(mock.authorization, /^Bearer mock-admin-token-\d+$/);
    assert.equal(mock.admin.requests, 1);
    console.log(`PASS dataset ${name} untick-confirm-open`);

    // 3. Cancel opens nothing: the start page says so, the dataset stays one click away, no session was prepared.
    const second = await context.newPage();
    await second.goto(`${base}/nexo/?dataset=${encodeURIComponent(dataset.adminDatasetId)}`);
    const again = second.getByRole('dialog', { name: 'Prepare dataset', exact: true });
    await again.waitFor();
    await again.getByRole('button', { name: 'Cancel', exact: true }).click();
    await again.waitFor({ state: 'hidden' });
    await second.getByText('The dataset was not opened. Prepare it again, or choose a checkpoint.', { exact: true }).waitFor();
    assert.equal(await second.locator('#canvas-host').count(), 0);
    assert.equal(await second.evaluate(() => window.__nexoDatasetMock.opened), 0);
    await second.getByRole('button', { name: 'Prepare dataset…', exact: true }).click();
    await again.waitFor();
    await second.keyboard.press('Escape');
    await again.waitFor({ state: 'hidden' });
    assert.equal(await second.locator('#canvas-host').count(), 0);
    console.log(`PASS dataset ${name} cancel-empty`);

    // 4. An id the store does not serve (404 dataset_not_found) is a sentence, with Try again and the checkpoints to fall back on.
    const third = await context.newPage();
    await third.goto(`${base}/nexo/?dataset=00000000-0000-4000-8000-000000000000`);
    const alert = third.locator('.picker p[role=alert]');
    await alert.waitFor();
    assert.equal(await alert.textContent(), 'This dataset is not available to Nexo: it is not released, or it was withdrawn or superseded. Ask the lab for the current release.');
    await third.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    await third.getByRole('button', { name: 'Choose checkpoint', exact: true }).click();
    await third.locator('.picker-row').first().waitFor();
    console.log(`PASS dataset ${name} not-found-message`);

    // 5. Signed out of Admin: one token request (no retry storm), a sentence and a Sign in to Admin link back to this page; nothing opens.
    const fourth = await context.newPage();
    await fourth.addInitScript(() => sessionStorage.setItem('nexo-mock-admin', 'signed-out'));
    const here = `${base}/nexo/?dataset=${encodeURIComponent(dataset.adminDatasetId)}`;
    await fourth.goto(here);
    const signedOut = fourth.locator('.picker p[role=alert]');
    await signedOut.waitFor();
    assert.equal(await signedOut.textContent(), 'Nexo opens lab datasets with your Admin account, and you are not signed in to Admin. Sign in, and Nexo opens this dataset again.');
    const signIn = fourth.locator('.picker').getByRole('link', { name: 'Sign in to Admin', exact: true });
    assert.equal(await signIn.getAttribute('href'), `/admin/sign-in?next=${encodeURIComponent(here)}`);
    assert.equal(await signIn.evaluate(a => a.classList.contains('primary')), true);
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
