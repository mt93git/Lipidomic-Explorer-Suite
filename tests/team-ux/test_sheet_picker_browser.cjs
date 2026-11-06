// www/team/js/sheet_picker.js in Chromium with the real shiny.js and the real Team server code
// (tests/team-ux/sheet_picker_harness/app.R). No Team library or credentials needed.
// node tests/team-ux/test_sheet_picker_browser.cjs   (from the repository root; needs R with shiny,
// readxl, writexl, dplyr, jsonlite (RSCRIPT=path/to/Rscript) and tests/browser/ci/node_modules/playwright)
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

function freePort() { return new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
async function startHarness(fixtures) {
  const port = await freePort();
  const proc = spawn(process.env.RSCRIPT || 'Rscript', ['--vanilla', '-e', `shiny::runApp('${path.join(__dirname, 'sheet_picker_harness')}', port=${port}, host='127.0.0.1', launch.browser=FALSE)`],
    { env: { ...process.env, TEAM_SHEET_ROOT: root, TEAM_SHEET_FIXTURES: fixtures, TEAM_SHEET_MAX_ROWS: '6' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', d => log += d); proc.stderr.on('data', d => log += d);
  for (let i = 0; i < 240 && !/Listening on/.test(log); i++) await new Promise(r => setTimeout(r, 250));
  if (!/Listening on/.test(log)) { proc.kill(); throw Error('harness did not start:\n' + log); }
  return { url: `http://127.0.0.1:${port}/`, stop: () => proc.kill(), log: () => log };
}
const uploads = page => page.evaluate(() => { try { return JSON.parse(document.getElementById('uploads').textContent.trim() || '[]'); } catch (e) { return []; } });
async function waitUploads(page, n, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const u = await uploads(page); if (u.length >= n) return u; await page.waitForTimeout(100); }
  return uploads(page);
}
const idle = page => page.waitForFunction(() => !window.TeamSheetPicker.state().active && !window.TeamSheetPicker.state().queued, null, { timeout: 30000 });
const dialogOpen = page => page.waitForFunction(() => document.getElementById('team-sheet-dialog')?.open && !document.getElementById('team-sheet-dialog').dataset.locked.includes('true'), null, { timeout: 30000 });
const dialogText = page => page.evaluate(() => document.getElementById('team-sheet-dialog').textContent);
const clickButton = (page, label) => page.click(`#team-sheet-dialog button:text-is("${label}")`);

(async () => {
  let checks = 0; const ok = (label, cond) => { assert.ok(cond, label); checks++; console.log('ok  ', label); };
  const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-picker-'));
  const harness = await startHarness(fixtures);
  const browser = await chromium.launch();
  const fx = name => path.join(fixtures, name);
  const bytes = name => fs.readFileSync(fx(name));
  try {
    const page = await browser.newPage();
    await page.goto(harness.url); await page.waitForFunction(() => window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected());
    const input = '#data_hub-files';
    let u;

    // 1. Multi-sheet workbook: the picker lists the sheets; only the chosen sheet is loaded.
    await page.setInputFiles(input, fx('multi.xlsx'));
    await dialogOpen(page);
    const labels = await page.$$eval('#team-sheet-dialog label', ls => ls.map(l => l.textContent));
    ok('multi-sheet: picker shows every sheet name, then the explicit all-sheets option', labels.join('|') === 'Notes|Data|Other|All sheets combined into one table');
    ok('multi-sheet: nothing reached the shared input while the picker is open', (await uploads(page)).length === 0);
    await page.check('#team-sheet-dialog label:has-text("Data") input');
    await clickButton(page, 'Load sheet');
    u = await waitUploads(page, 1); await idle(page);
    ok('multi-sheet: one upload, a .csv named after the sheet', u.length === 1 && u[0].length === 1 && u[0][0].name === 'multi [Data].csv');

    // 2. Single-sheet workbook: no picker; the user's own bytes; read identical to the chosen sheet.
    await page.setInputFiles(input, fx('single.xlsx'));
    u = await waitUploads(page, 2); await idle(page);
    ok('single-sheet: handed on byte-identical, under its own name', u.length === 2 && u[1][0].name === 'single.xlsx' && u[1][0].md5 === md5(bytes('single.xlsx')));
    ok('single-sheet: no picker was shown', !(await page.evaluate(() => document.getElementById('team-sheet-dialog')?.open)));
    ok('chosen sheet: the shared reader gives identical() results to the same sheet saved alone', u[0][0].same_as_single === true);
    ok('single-sheet: the shared reader gives identical() results before vs after', u[1][0].same_as_single === true);

    // 3. Oversized workbook: refused with a message; nothing uploaded.
    fs.writeFileSync(fx('big.xlsx'), Buffer.alloc(50 * 1024 * 1024 + 1));
    await page.setInputFiles(input, fx('big.xlsx'));
    await dialogOpen(page);
    const bigText = await dialogText(page);
    ok('oversized: refused with the 50 MB message', /big\.xlsx is 50\.0 MB\. Excel workbooks up to 50 MB can be loaded/.test(bigText));
    await clickButton(page, 'Close'); await idle(page); await page.waitForTimeout(500);
    ok('oversized: nothing uploaded', (await uploads(page)).length === 2);

    // 4. Row cap (harness cap: 6 rows): a 7-row sheet is refused, not cut.
    await page.setInputFiles(input, fx('rows.xlsx'));
    await dialogOpen(page);
    await page.check('#team-sheet-dialog label:has-text("Long") input');
    await clickButton(page, 'Load sheet');
    await page.waitForFunction(() => /more than 6 rows/.test(document.getElementById('team-sheet-dialog')?.textContent || ''), null, { timeout: 30000 });
    ok('row cap: refusal names the cap', /Sheet "Long" of rows\.xlsx was not loaded: it has more than 6 rows/.test(await dialogText(page)));
    await clickButton(page, 'Close'); await idle(page); await page.waitForTimeout(500);
    ok('row cap: nothing uploaded', (await uploads(page)).length === 2);

    // 5. Cancel: nothing uploaded.
    await page.setInputFiles(input, fx('multi.xlsx'));
    await dialogOpen(page); await clickButton(page, 'Cancel'); await idle(page); await page.waitForTimeout(500);
    ok('cancel: nothing uploaded', (await uploads(page)).length === 2);

    // 6. All sheets, chosen explicitly: the original file, and a visible notice that sheets are combined.
    await page.setInputFiles(input, fx('multi.xlsx'));
    await dialogOpen(page);
    await page.check('#team-sheet-dialog label.tsp-all input');
    await clickButton(page, 'Load sheet');
    u = await waitUploads(page, 3); await idle(page);
    ok('all sheets: the original workbook, byte-identical', u.length === 3 && u[2][0].md5 === md5(bytes('multi.xlsx')) && u[2][0].sheets === 'Notes;Data;Other');
    await page.waitForFunction(() => /all 3 sheets of this workbook are combined/.test(document.querySelector('#shiny-notification-panel')?.textContent || ''), null, { timeout: 10000 });
    ok('all sheets: the server shows a notice that the sheets are combined', true);

    // 7. Mixed .csv + single-sheet workbook: one upload, both files, in order, bytes unchanged.
    const csv = 'Lipid_Name,S9\r\nPC(1),7\r\n';
    await page.setInputFiles(input, [{ name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }, { name: 'single.xlsx', mimeType: 'application/octet-stream', buffer: bytes('single.xlsx') }]);
    u = await waitUploads(page, 4); await idle(page);
    ok('mixed: one upload with both files in order, bytes unchanged', u.length === 4 && u[3].map(f => f.name).join('|') === 'other.csv|single.xlsx' &&
       u[3][0].md5 === md5(Buffer.from(csv)) && u[3][1].md5 === md5(bytes('single.xlsx')));

    // 8. .csv only: the existing path, untouched.
    await page.setInputFiles(input, { name: 'plain.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    u = await waitUploads(page, 5); await page.waitForTimeout(300);
    ok('.csv only: one upload, byte-identical', u.length === 5 && u[4][0].md5 === md5(Buffer.from(csv)));

    // 8b. A selection that already holds a file named like the chosen sheet's .csv: both kept.
    await page.setInputFiles(input, [{ name: 'multi [Data].csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }, { name: 'multi.xlsx', mimeType: 'application/octet-stream', buffer: bytes('multi.xlsx') }]);
    await dialogOpen(page);
    await page.check('#team-sheet-dialog label:has-text("Data") input');
    await clickButton(page, 'Load sheet');
    u = await waitUploads(page, 6); await idle(page);
    ok('name clash: the sheet .csv gets its own name, the other file is kept', u.length === 6 && u[5].map(f => f.name).join('|') === 'multi [Data].csv|multi [Data] (2).csv' &&
       u[5][0].md5 === md5(Buffer.from(csv)) && u[5][1].same_as_single === true);

    // 9. Drag and drop of a multi-sheet workbook on the input: held for the picker too.
    const b64 = bytes('multi.xlsx').toString('base64');
    await page.evaluate(b64 => {
      const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([arr], 'dropped.xlsx'));
      const zone = document.getElementById('data_hub-files').closest('.shiny-input-container').querySelector('.input-group') || document.getElementById('data_hub-files');
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, b64);
    await dialogOpen(page);
    ok('drop: the picker opens for the dropped workbook', /dropped\.xlsx has 3 sheets/.test(await dialogText(page)));
    await clickButton(page, 'Cancel'); await idle(page); await page.waitForTimeout(500);
    ok('drop: cancelled, nothing uploaded', (await uploads(page)).length === 6);

    // 9b. Together with the .txt/.tsv converter (upload_formats.js) and SCIEX import, loaded as in Team:
    //     a .tsv goes only to the converter, a workbook only to the picker; one final upload.
    const tsv = 'Lipid_Name\tS1\nPC(16:0)\t1.50\n';
    await page.setInputFiles(input, [{ name: 'lipids.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(tsv) }, { name: 'multi.xlsx', mimeType: 'application/octet-stream', buffer: bytes('multi.xlsx') }]);
    await dialogOpen(page);
    ok('with .tsv: the sheet picker opens for the workbook', /multi\.xlsx has 3 sheets/.test(await dialogText(page)));
    await page.check('#team-sheet-dialog label:has-text("Data") input');
    await clickButton(page, 'Load sheet');
    u = await waitUploads(page, 7); await idle(page); await page.waitForFunction(() => !window.TeamUploadFormats.state().active, null, { timeout: 30000 }); await page.waitForTimeout(800); u = await uploads(page);
    ok('with .tsv: exactly one upload, the converted .tsv and the chosen sheet, in order', u.length === 7 && u[6].map(f => f.name).join('|') === 'lipids.tsv.csv|multi [Data].csv');
    ok('with .tsv: the .tsv converted by upload_formats, values unchanged', u[6][0].text === 'Lipid_Name,S1\nPC(16:0),1.50');
    ok('with .tsv: the chosen sheet reads identical() to the sheet saved alone', u[6][1].same_as_single === true);
    await page.setInputFiles(input, { name: 'only.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(tsv) });
    u = await waitUploads(page, 8); await page.waitForFunction(() => !window.TeamUploadFormats.state().active, null, { timeout: 30000 }); await page.waitForTimeout(800); u = await uploads(page);
    ok('.tsv only: one upload, converted, the sheet picker not involved', u.length === 8 && u[7].length === 1 && u[7][0].name === 'only.tsv.csv' &&
       !(await page.evaluate(() => document.getElementById('team-sheet-dialog').open)) && !(await page.evaluate(() => window.TeamSheetPicker.state().active)));

    // 10. A browser that cannot move files between inputs: workbooks are refused, never passed on.
    const page2 = await browser.newPage();
    await page2.addInitScript(() => { window.DataTransfer = undefined; });
    await page2.goto(harness.url); await page2.waitForFunction(() => window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected());
    await page2.setInputFiles(input, fx('single.xlsx'));
    await dialogOpen(page2);
    ok('no DataTransfer: the workbook is refused with a message', /cannot check Excel workbooks in this browser/.test(await dialogText(page2)));
    await page2.waitForTimeout(1500);
    ok('no DataTransfer: nothing uploaded', (await uploads(page2)).length === 0);
    await page2.close();

    // 11. The picker did not start: the inline gate refuses workbooks; .csv still loads.
    const page3 = await browser.newPage();
    await page3.addInitScript(() => { Object.defineProperty(window, 'TeamSheetPicker', { get() { return undefined; }, set() {} }); });
    const alerts = []; page3.on('dialog', d => { alerts.push(d.message()); d.dismiss(); });
    await page3.goto(harness.url); await page3.waitForFunction(() => window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected());
    await page3.setInputFiles(input, fx('multi.xlsx'));
    await page3.waitForTimeout(1500);
    ok('picker not running: the gate refuses the workbook with a message', alerts.length === 1 && /Excel workbooks cannot be checked on this page/.test(alerts[0]));
    ok('picker not running: nothing uploaded', (await uploads(page3)).length === 0);
    await page3.setInputFiles(input, { name: 'plain.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    ok('picker not running: .csv still loads', (await waitUploads(page3, 1)).length === 1);
    await page3.close();

    console.log(`\n${checks} checks passed`);
  } catch (e) {
    console.error(e); console.error(harness.log().slice(-3000)); process.exitCode = 1;
    try { for (const p of browser.contexts().flatMap(c => c.pages())) console.error('dialog:', await p.evaluate(() => document.getElementById('team-sheet-dialog')?.textContent)); } catch (_) {}
  } finally { await browser.close(); harness.stop(); fs.rmSync(fixtures, { recursive: true, force: true }); }
})();
