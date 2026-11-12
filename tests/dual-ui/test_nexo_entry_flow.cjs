// NEXO-ENTRY task ENTRY-INT: the entry screens wired together on the real page (mock path), Chromium and WebKit:
// signed out → sign in → Start → Prepare → Check → board, the board's banner and its decision, a 390 px pass.
// Screenshots of each screen at 1440 and 390 px go to <tmp>/ENTRY-INT/. node tests/dual-ui/test_nexo_entry_flow.cjs
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const shots = process.env.NEXO_SHOTS || path.join(os.tmpdir(), 'ENTRY-INT');
let server;
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
/** A fresh context at `url` with sessionStorage `storage` set before the page's scripts run. */
async function open(browser, base, { storage = {}, width = 1440, url = '/nexo/' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
  await context.addInitScript(values => { try { for (const [k, v] of Object.entries(values)) sessionStorage.setItem(k, v); } catch { /* about:blank */ } }, storage);
  const errors = [];
  context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('weberror', e => errors.push(e.error().message));
  const page = await context.newPage();
  await page.goto(`${base}${url}`);
  return { context, page, errors };
}
const shot = (page, name, engine, width) => page.screenshot({ path: path.join(shots, `${engine}-${width}-${name}.png`), fullPage: false });
/** Start → Prepare (Team's defaults) → Check with Treated_3 flagged. */
async function toCheck(page) {
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Prepare ORD041 · v1', exact: true }).click();
  await button(page, 'Prepare and check').click();
  await page.getByRole('heading', { name: 'Quality check', exact: true }).waitFor();
  await page.getByRole('heading', { name: '1 sample to review', exact: true }).waitFor();
}
const board = page => page.waitForSelector('#viewport', { timeout: 30_000 });
/** The whole way at `width`, a screenshot of each screen: signed out → sign in → Start → Prepare → Check with Treated_3
 *  left undecided → the board's banner → Keep on the board → no banner. */
async function wholeWay(browser, name, base, width) {
  const { context, page, errors } = await open(browser, base, { storage: { 'nexo-mock-admin': 'signed-out' }, width });
  await page.getByRole('heading', { name: 'Your analysis starts here', exact: true }).waitFor();
  await shot(page, 'signin', name, width);
  await page.getByRole('textbox', { name: 'Email' }).fill('ana@synthetic.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await button(page, 'Continue').click();
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
  await page.locator('.start-rows li').first().waitFor();
  await shot(page, 'start', name, width);
  await page.getByRole('button', { name: 'Prepare ORD041 · v1', exact: true }).click();
  await button(page, 'Prepare and check').waitFor();
  await shot(page, 'prepare', name, width);
  await button(page, 'Prepare and check').click();
  await page.getByRole('heading', { name: '1 sample to review', exact: true }).waitFor();
  await shot(page, 'check', name, width);
  await page.getByRole('button', { name: /^Open the Canvas/ }).click();
  await board(page);
  const banner = page.locator('.notice-banner');
  assert.match(await banner.textContent(), /Treated_3 looks like an outlier and is still undecided/);
  await page.waitForTimeout(300); // the board's first layout
  await shot(page, 'board-banner', name, width);
  await button(banner, 'Review').click();
  const card = page.locator('.notice-card');
  assert.match(await card.textContent(), /Prepared by Lab staff.*Treated_3 sits far from the other samples/);
  // The notice sits in the board's status band: the board's bar stays in view and the card opens inside the viewport.
  assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0, 'the page does not scroll past the board');
  const box = await card.boundingBox(), keep = await button(card, 'Keep Treated_3').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= width && keep.y + keep.height <= page.viewportSize().height, `the review card fits the viewport: ${JSON.stringify(box)}`);
  await shot(page, 'board-review', name, width);
  await button(card, 'Keep Treated_3').click();
  await banner.waitFor({ state: 'detached' });
  assert.match(await card.textContent(), /Quality checkTreated_3 flagged, kept by Lab staff/);
  // The decision line in the card is whole, its Undo in view (the band's one-line rule must not reach into the card).
  const line = card.locator('.notice-decided');
  assert.ok(await line.evaluate(e => e.scrollWidth <= e.clientWidth), 'the decision line is cut');
  const undo = await button(line, 'Undo').boundingBox(), inside = await card.boundingBox();
  assert.ok(undo && undo.x + undo.width <= inside.x + inside.width, `Undo sits outside the card: ${JSON.stringify(undo)}`);
  await shot(page, 'board-kept', name, width);
  console.log(`PASS ENTRY-INT ${name} ${width}px signed-out-sign-in-start-prepare-check-undecided-board-banner-keep-banner-gone`);
  assert.deepEqual(errors, []);
  await context.close();
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    await wholeWay(browser, name, base, 1440);
    await wholeWay(browser, name, base, 390);
    { // Signed out on the bare page: the sign-in page alone under one bar named Lipidomic Explorer; signing in goes to Start.
      const { context, page, errors } = await open(browser, base, { storage: { 'nexo-mock-admin': 'signed-out' } });
      await page.getByRole('heading', { name: 'Your analysis starts here', exact: true }).waitFor();
      assert.equal(await page.title(), 'Lipidomic Explorer');
      assert.equal(await page.locator('header').count(), 1, 'one bar');
      assert.match(await page.locator('header').textContent(), /Lipidomic Explorer/);
      await page.getByRole('textbox', { name: 'Email' }).fill('ana@synthetic.invalid');
      await page.getByLabel('Password').fill('synthetic-password');
      await button(page, 'Continue').click();
      await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
      assert.equal(await page.title(), 'Lipidomic Explorer');
      console.log(`PASS ENTRY-INT ${name} signed-out-signs-in-to-start`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    { // Check → board after an exclusion: the board opens on the session Team prepared without the sample, with the decision.
      const { context, page, errors } = await open(browser, base);
      await toCheck(page);
      await button(page, 'Exclude…').click();
      await page.getByRole('textbox', { name: 'Reason for excluding Treated_3 (optional)' }).fill('failed injection');
      await button(page, 'Exclude Treated_3').click();
      await page.getByRole('heading', { name: 'Ready for the Canvas', exact: true }).waitFor();
      await page.getByRole('button', { name: /^Open the Canvas/ }).click();
      await board(page);
      const mock = await page.evaluate(() => window.__nexoDatasetMock);
      assert.equal(mock.opened, 2, 'Exclude prepared once more, the board opened on that session without a third open');
      assert.equal(await page.locator('.notice-banner').count(), 0, 'no banner once decided');
      await page.locator('.notice-chip').click();
      const card = await page.locator('.notice-card').textContent();
      assert.match(card, /Samples5/);
      assert.match(card, /Treated_3 excluded by Lab staff · failed injection/);
      assert.deepEqual(mock.last.outlierTreatments, { Treated_3: 'remove' }, "Team's sample decision, not a shorter sample list");
      assert.equal(mock.last.samples.length, 6);
      console.log(`PASS ENTRY-INT ${name} check-exclude-opens-board-on-the-re-run`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    { // Undecided on the check, excluded on the board: Team prepares again without it and the board says so.
      const { context, page, errors } = await open(browser, base);
      await toCheck(page);
      await page.getByRole('button', { name: /^Open the Canvas/ }).click();
      await board(page);
      await button(page.locator('.notice-banner'), 'Review').click();
      const card = page.locator('.notice-card');
      await button(card, 'Exclude…').click();
      await card.getByRole('textbox', { name: 'Reason for excluding Treated_3 (optional)' }).fill('failed injection');
      await button(card, 'Exclude Treated_3').click();
      await board(page);
      await page.locator('.notice-chip').waitFor();
      assert.equal(await page.locator('.notice-banner').count(), 0, 'no banner once excluded');
      const last = (await page.evaluate(() => window.__nexoDatasetMock)).last;
      assert.deepEqual(last.outlierTreatments, { Treated_3: 'remove' }, "prepared again with Team's sample decision");
      assert.equal(last.samples.length, 6, 'the samples as chosen');
      if (!await page.locator('.notice-card').count()) await page.locator('.notice-chip').click();
      assert.match(await page.locator('.notice-card').textContent(), /Samples5.*Treated_3 excluded by Lab staff · failed injection/);
      console.log(`PASS ENTRY-INT ${name} board-exclude-prepares-again`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    { // Start: Import opens the file chooser (today's Upload ZIP); Upload an Excel workbook goes to Prepare with its new id.
      const { context, page, errors } = await open(browser, base);
      await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button(page, 'Import a Team checkpoint (.zip)').click()]);
      assert.equal(chooser.isMultiple(), false);
      await button(page, 'Upload an Excel workbook').click();
      const dialog = page.getByRole('dialog', { name: 'Upload an Excel workbook' });
      await dialog.locator('input[type=file]').first().setInputFiles({ name: 'extra-synthetic.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('synthetic') });
      await button(dialog, 'Continue').click();
      await button(page, 'Prepare and check').waitFor();
      assert.match(new URL(page.url()).searchParams.get('dataset'), /^upload-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
      console.log(`PASS ENTRY-INT ${name} start-import-picker-and-excel-upload-to-prepare`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    { // A client member whose client prepares, with nothing released: the upload is offered on the empty Start.
      const { context, page, errors } = await open(browser, base, { storage: { 'nexo-mock-admin': 'client', 'nexo-mock-entry': 'empty', 'nexo-mock-members-prepare': '1' } });
      await page.getByRole('heading', { name: 'Nothing here yet', exact: true }).waitFor();
      await button(page, 'Upload an Excel workbook').waitFor();
      assert.equal(await page.getByText('Import a Team checkpoint (.zip)').count(), 0);
      console.log(`PASS ENTRY-INT ${name} start-client-members-prepare-uploads-with-nothing-released`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP ENTRY-INT Playwright: ${e.message}`); return; } throw e; }
  fs.mkdirSync(shots, { recursive: true });
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
  for (const name of process.env.ENGINES?.split(',') ?? ['chromium', 'webkit']) await browserTests(pw, name, base);
  console.log('ENTRY-INT OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
