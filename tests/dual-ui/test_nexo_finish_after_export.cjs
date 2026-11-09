// Chart audit b06 row 8 (Astra review 2026-11-08): logratio_tab-logratioPlot never reached "Finished" after the export
// check (Export tab: Download PNG, every "More downloads from this analysis" file, the Export dialog's PDF), while a
// fresh card finished in 5 s. This replays the audit's sequence on the mock (no server timing): the card must finish
// within 20 s. Mock build, Chromium, 1440x900.  node tests/dual-ui/test_nexo_finish_after_export.cjs
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
const SOURCE = 'logratio_tab-logratioPlot';
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
const state = (page, id) => card(page, id).locator('.card-status').getAttribute('data-state');
async function download(page, click) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), click()]);
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
}
async function select(page, id) {
  await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click();
  await card(page, id).locator('header').click();
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    await page.evaluate(source => window.__nexo.handle.addCard(source), SOURCE);
    await page.waitForFunction(source => window.__nexo.store.get().nodes.some(n => n.instance?.source === source), SOURCE, { timeout: 10000 });
    const id = (await page.evaluate(source => window.__nexo.store.get().nodes.find(n => n.instance?.source === source).id, SOURCE));
    await page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state === 'current', id, { timeout: 30000 });
    const insp = page.locator('#inspector');
    // The audit's check 7.
    await select(page, id);
    await page.getByRole('tab', { name: 'Export', exact: true }).click();
    const png = await download(page, () => insp.getByRole('button', { name: 'Download PNG', exact: true }).click());
    assert.equal(png.bytes.subarray(1, 4).toString(), 'PNG');
    const more = insp.getByRole('group', { name: 'More downloads from this analysis', exact: true });
    const names = (await more.count()) ? await more.getByRole('button').allTextContents() : [];
    for (let i = 0; i < names.length; i++) await download(page, () => more.getByRole('button').nth(i).click());
    await insp.getByRole('button', { name: 'More export options…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export', exact: true }); await dialog.waitFor();
    const pdfBox = dialog.getByRole('button', { name: 'Download PDF', exact: true });
    if (await pdfBox.count()) await download(page, () => pdfBox.click());
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    // The audit's check 8.
    await select(page, id);
    await insp.getByRole('button', { name: 'Finish plot', exact: true }).click();
    await page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"] .card-status`)?.dataset.state === 'finished', id, { timeout: 20000 })
      .catch(async () => { throw new Error(`not finished in 20 s after the export check: state=${await state(page, id)}, toasts "${(await page.locator('.toast, [role=alert]').allInnerTexts()).join(' | ')}"`); });
    console.log(`PASS b06-8 ${name} finish-after-export (${names.length} module downloads: ${names.join(' / ')})`);
    assert.deepEqual(errors.filter(e => !/Failed to load resource/.test(e)), []);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP b06-8 Playwright: ${e.message}`); return; } throw e; }
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
  await browserTests(pw, 'chromium', base);
  console.log('b06-8 finish after export OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
