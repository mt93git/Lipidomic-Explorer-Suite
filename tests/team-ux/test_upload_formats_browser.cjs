// www/team/js/upload_formats.js in Chromium with the real shiny.js and the real Team server code
// (tests/team-ux/upload_formats_harness/app.R). No Team library or credentials needed.
// node tests/team-ux/test_upload_formats_browser.cjs        (from the repository root; needs R
// with shiny, readxl, xml2, zip, jsonlite and tests/browser/ci/node_modules/playwright)
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

function freePort() { return new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }); }
async function startHarness(delay) {
  const port = await freePort();
  const proc = spawn(process.env.RSCRIPT || 'Rscript', ['-e', `shiny::runApp('${path.join(__dirname, 'upload_formats_harness')}', port=${port}, launch.browser=FALSE)`],
    { env: { ...process.env, TEAM_UPLOAD_ROOT: root, TEAM_UPLOAD_HARNESS_DELAY: String(delay) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', d => log += d); proc.stderr.on('data', d => log += d);
  for (let i = 0; i < 120 && !/Listening on/.test(log); i++) await new Promise(r => setTimeout(r, 250));
  if (!/Listening on/.test(log)) { proc.kill(); throw Error('harness did not start:\n' + log); }
  return { url: `http://127.0.0.1:${port}/`, stop: () => proc.kill(), log: () => log };
}
const uploads = page => page.evaluate(() => { try { return JSON.parse(document.getElementById('uploads').textContent.trim() || '[]'); } catch (e) { return []; } });
async function waitUploads(page, n, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const u = await uploads(page); if (u.length >= n) return u; await page.waitForTimeout(100); }
  return uploads(page);
}
const idle = page => page.waitForFunction(() => !window.TeamUploadFormats.state().active && !window.TeamUploadFormats.state().queued, null, { timeout: 30000 });
const file = (name, text) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) });

(async () => {
  let checks = 0; const ok = (label, cond) => { assert.ok(cond, label); checks++; console.log('ok  ', label); };
  const harness = await startHarness(1.5);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(harness.url); await page.waitForFunction(() => window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected());
    const input = '#data_hub-files';

    // 1. Mixed .tsv + .csv: one final upload, the .csv byte-identical, the .tsv as CSV text.
    const tsv = 'Lipid_Name\tS1\tS,2\n"PC(16:0)"\t1.50\tNA\nTG(1,2)\t0.000123456789012345678\t\n';
    const csv = 'Lipid_Name,S9\r\nPC(1),7\r\n';
    await page.setInputFiles(input, [file('lipids.tsv', tsv), file('other.csv', csv)]);
    let u = await waitUploads(page, 1); await idle(page); await page.waitForTimeout(500); u = await uploads(page);
    ok('mixed selection: exactly one upload reaches the shared input', u.length === 1);
    ok('mixed selection: both files in it, in order', u[0].map(f => f.name).join('|') === 'lipids.tsv.csv|other.csv');
    ok('mixed selection: .csv byte-identical', u[0][1].md5 === md5(Buffer.from(csv)));
    ok('mixed selection: .tsv converted, values unchanged', u[0][0].text === 'Lipid_Name,S1,"S,2"\nPC(16:0),1.50,NA\n"TG(1,2)",0.000123456789012345678,');

    // 2. Plain .csv with nothing in progress: untouched path, one upload, bytes identical.
    await page.setInputFiles(input, [file('plain.csv', csv)]);
    u = await waitUploads(page, 2); await page.waitForTimeout(500); u = await uploads(page);
    ok('plain .csv: one more upload, byte-identical', u.length === 2 && u[1].length === 1 && u[1][0].md5 === md5(Buffer.from(csv)));

    // 3. Overlapping selections while a conversion runs (harness delay 1.5 s): Escape does not
    //    close the progress dialog, the second selection waits, nothing is aborted or repeated.
    await page.setInputFiles(input, [file('slow.tsv', 'Lipid_Name\tS1\nPC(1)\t1\n')]);
    await page.waitForFunction(() => document.getElementById('team-upload-dialog')?.open);
    await page.keyboard.press('Escape');
    ok('Escape keeps the progress dialog open while converting', await page.evaluate(() => document.getElementById('team-upload-dialog').open));
    await page.setInputFiles(input, [file('second.csv', csv)]);
    await page.setInputFiles(input, [file('third.tsv', 'Lipid_Name\tS3\nPC(3)\t3\n')]);
    ok('selections made during a conversion are queued', await page.evaluate(() => window.TeamUploadFormats.state().queued === 2));
    await idle(page); await page.waitForTimeout(500); u = await uploads(page);
    ok('overlap: three uploads, in the order chosen, none lost or repeated',
       u.length === 5 && u[2].map(f => f.name).join() === 'slow.tsv.csv' && u[3].map(f => f.name).join() === 'second.csv' && u[4].map(f => f.name).join() === 'third.tsv.csv');
    ok('overlap: queued .csv byte-identical', u[3][0].md5 === md5(Buffer.from(csv)));

    // 4. Name collision with a CSV of the same selection.
    await page.setInputFiles(input, [file('run.tsv', 'Lipid_Name\tS1\nPC(1)\t1\n'), file('run.tsv.csv', csv)]);
    await idle(page); await page.waitForTimeout(500); u = await uploads(page);
    ok('collision: converted file renamed, the .csv keeps its name and bytes',
       u.length === 6 && u[5].map(f => f.name).join('|') === 'run.tsv (converted).csv|run.tsv.csv' && u[5][1].md5 === md5(Buffer.from(csv)));

    // 4b. Two selected files with the same name: matched by id, both kept, neither replaced.
    await page.setInputFiles(input, [file('dup.tsv', 'Lipid_Name\tA\nPC(1)\t1\n'), file('dup.tsv', 'Lipid_Name\tB\nPC(2)\t2\n')]);
    await idle(page); await page.waitForTimeout(500); u = await uploads(page);
    ok('same-name files: both converted from their own content, distinct names',
       u.length === 7 && u[6].map(f => f.name).join('|') === 'dup.tsv.csv|dup.tsv (converted).csv' && u[6][0].text === 'Lipid_Name,A\nPC(1),1' && u[6][1].text === 'Lipid_Name,B\nPC(2),2');

    // 5. A refused file: nothing uploaded, message names the cell, the next selection still works.
    await page.setInputFiles(input, [file('euro.txt', 'Lipid;S1\nPC(1);1,5\n'), file('ok.csv', csv)]);
    await page.waitForFunction(() => /not a number/.test(document.getElementById('team-upload-dialog')?.innerText || ''), null, { timeout: 20000 });
    const msg = await page.evaluate(() => document.getElementById('team-upload-dialog').innerText);
    ok('refusal names the value, row and column', /"1,5" in row 2, column "S1"/.test(msg));
    // A selection made while the error is shown waits until the error is closed (here with Escape).
    const beforeQueued = (await uploads(page)).length;
    await page.setInputFiles(input, [file('waiting.csv', csv)]);
    await page.waitForTimeout(1500);
    ok('error stays up and the queued selection waits', await page.evaluate(() => document.getElementById('team-upload-dialog').open && /not a number/.test(document.getElementById('team-upload-dialog').innerText)) && (await uploads(page)).length === beforeQueued);
    await page.keyboard.press('Escape');
    await idle(page); await page.waitForTimeout(500);
    const afterEsc = await uploads(page);
    ok('closing the error starts the queued selection', afterEsc.length === beforeQueued + 1 && afterEsc[beforeQueued][0].name === 'waiting.csv');
    await page.setInputFiles(input, [file('after.csv', csv)]);
    await idle(page); await page.waitForTimeout(500); u = await uploads(page);
    ok('refused batch uploads nothing; the next selection loads', u.length === 9 && u[8][0].name === 'after.csv');

    // 6. Drag and drop onto the input routes through the same path.
    await page.evaluate(() => {
      const zone = document.getElementById('data_hub-files').closest('.shiny-input-container');
      const dt = new DataTransfer(); dt.items.add(new File(['Lipid_Name\tS7\nPC(9)\t9.25\n'], 'dropped.tsv'));
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await idle(page); await page.waitForTimeout(500); u = await uploads(page);
    ok('drop: converted and uploaded once', u.length === 10 && u[9][0].name === 'dropped.tsv.csv');
    ok('accept attribute widened to .txt and .tsv', (await page.getAttribute(input, 'accept')) === '.csv,.xlsx,.xls,.txt,.tsv');
    console.log(`\n${checks} browser checks passed`);
  } finally { await browser.close(); harness.stop(); }
})().catch(e => { console.error(e); process.exit(1); });
