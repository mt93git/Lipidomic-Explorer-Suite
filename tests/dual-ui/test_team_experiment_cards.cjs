// Run with: node tests/dual-ui/test_team_experiment_cards.cjs
// Guided Experiment step (R11): two equal cards, "Start a new analysis" and "Resume a saved checkpoint", at
// 1440 and 390 px; choosing one reveals that path; no grey empty-state lines; steps 2 and 3 stay collapsed
// until a matrix exists; keyboard order is card 1, card 2, then the revealed path; every control keeps its ID.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('../browser/ci/node_modules/playwright');

const teamUi = fs.readFileSync('R/frontends/team/ui.R', 'utf8');
assert.match(teamUi, /if \(!team_workspace_enabled\(\)\) tagList\(includeCSS\("www\/team\/css\/experiment_cards\.css"\), includeScript\("www\/team\/js\/experiment_cards\.js"\)\)/,
  'the cards load in the guided Team head only');
const css = fs.readFileSync('www/team/css/experiment_cards.css', 'utf8');
assert.ok(!/z-index/.test(css), 'the cards add no overlay layer');

const fileInput = (id, label) => `<div class="form-group shiny-input-container"><label class="control-label" for="${id}">${label}</label>
  <div class="input-group"><label class="input-group-btn input-group-prepend"><span class="btn btn-default btn-file">Browse…<input id="${id}" type="file"></span></label>
  <input type="text" class="form-control" placeholder="No file selected" readonly></div></div>`;

function fixture(withLibrary, withWorkbooks) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="guided-app" data-guide-step="1">
  ${withLibrary ? '<section class="team-library"><h3>Project library</h3><div id="team_library_account"><input id="team_login_email" type="email"></div></section>' : ''}
  <button id="before" type="button">Help with Experiment</button>
  <div class="tab-content"><div class="tab-pane active"><div class="guide-page">
    <div class="guide-heading"><span class="ux-eyebrow">STEP 1 OF 7</span><h2>Start with your experiment</h2><p>Add the abundance matrix first.</p></div>
    <div class="guide-panel" id="guide-experiment-abundance"><h3>1. Add the abundance matrix</h3><p>Upload an Excel or CSV abundance matrix. Original files are kept unchanged.</p>
      ${fileInput('data_hub-files', 'Abundance files')}
      <div id="data_hub-loaded_files_display" class="shiny-html-output"></div>
      <div id="guide_experiment_summary" class="shiny-html-output"><p>No experiment loaded yet.</p></div>
      <p class="guide-upload-limit">Uploads over 90 MB: open the workbook from the lab server instead.</p>
      <div id="guide_local_experiments" class="shiny-html-output">${withWorkbooks
        ? '<div class="guide-panel"><h3>Existing data on this computer</h3><select id="guide_local_file"><option value="1">LPS.xlsx</option></select><button id="guide_load_local" type="button">Open this workbook</button></div>'
        : '<p>No saved workbooks found on this computer. Upload your abundance files above.</p>'}</div></div>
    <div class="guide-panel" id="guide-experiment-metadata"><h3>2. Add sample metadata (optional)</h3>
      <div id="guide_experiment_metadata_prompt" class="shiny-html-output"><p class="guide-pending">First add an abundance matrix in step 1.</p></div>
      ${fileInput('sample_metadata_import-file', 'Sample metadata file')}<button id="sample_metadata_import-confirm" type="button" disabled>Confirm sample metadata</button></div>
    <div class="guide-panel" id="guide-experiment-design"><h3>3. Review the study design</h3><p>Check sample names.</p>
      <div id="guide_experiment_next" class="shiny-html-output"><p class="guide-pending">Add the abundance matrix in step 1 before Design.</p></div></div>
    <details class="guide-panel"><summary>Resume from a saved session ZIP instead</summary>
      ${fileInput('data_hub-import_session_file', 'Saved session (.zip)')}
      <div id="data_hub-import_status_display" class="shiny-html-output"></div><p>Restores source data and saved settings.</p></details>
  </div></div></div>
  <script>
    window.jq={};window.jQuery=function(){return {on:function(name,fn){jq[name]=fn;return this;}};};
    window.navigated=[];window.navigateToSessionRestore=function(){navigated.push('restore');};
  </script></body></html>`;
}

const IDS = ['data_hub-files','data_hub-loaded_files_display','guide_experiment_summary','guide_local_experiments',
  'guide_experiment_metadata_prompt','sample_metadata_import-file','sample_metadata_import-confirm','guide_experiment_next',
  'data_hub-import_session_file','data_hub-import_status_display'];
const GREY = ['No experiment loaded yet.','No saved workbooks found','Uploads over 90 MB','Files over 90 MB'];

async function load(page, withLibrary, withWorkbooks) {
  await page.setContent(fixture(withLibrary, withWorkbooks));
  await page.addStyleTag({path:path.resolve('www/team/css/experiment_cards.css')});
  await page.addScriptTag({path:path.resolve('www/team/js/experiment_cards.js')});
}
const visibleText = (page, text) => page.evaluate(t => Array.from(document.querySelectorAll('p,span,div')).some(e =>
  e.childElementCount === 0 && e.textContent.includes(t) && e.getClientRects().length > 0), text);
const active = page => page.evaluate(() => { const a = document.activeElement; return {id:a.id,
  inNew:!!a.closest('#guide-experiment-abundance'), inResume:!!a.closest('#tx-exp-resume')}; });

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    await load(page, false, false);

    // Two equal cards side by side, nothing else of step 1 yet.
    const cards = page.locator('#tx-exp-choice > .tx-exp-card');
    assert.equal(await cards.count(), 2);
    assert.equal(await page.locator('#tx-exp-card-new .tx-exp-card-title').textContent(), 'Start a new analysis');
    assert.equal(await page.locator('#tx-exp-card-resume .tx-exp-card-title').textContent(), 'Resume a saved checkpoint');
    assert.equal(await page.locator('#tx-exp-card-resume .tx-exp-card-text').textContent(), 'Open a session ZIP you saved earlier from Share.');
    let [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    assert.ok(Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1, 'equal cards in one row at 1440');
    for (const c of ['#tx-exp-card-new','#tx-exp-card-resume']) assert.equal(await page.locator(c).getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#guide-experiment-abundance').isVisible(), false, 'no path before a choice');
    assert.equal(await page.locator('#tx-exp-resume').isVisible(), false);
    assert.equal(await page.locator('details.tx-exp-old-resume').isVisible(), false, 'the bottom ZIP disclosure is gone');

    // Every bound ID is still present exactly once; the ZIP controls now live in the Resume path.
    for (const id of IDS) assert.equal(await page.locator('#' + id).count(), 1, id);
    assert.ok(await page.evaluate(() => document.getElementById('tx-exp-resume').contains(document.getElementById('data_hub-import_session_file'))));
    assert.ok(await page.evaluate(() => document.getElementById('tx-exp-resume').contains(document.getElementById('data_hub-import_status_display'))));

    // Steps 2 and 3 are collapsed until a matrix exists.
    for (const n of [2, 3]) {
      const toggle = page.locator(`[aria-controls="tx-exp-step-body-${n}"]`);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator(`#tx-exp-step-body-${n}`).isVisible(), false);
    }
    assert.equal(await page.locator('#sample_metadata_import-confirm').isVisible(), false);

    // Keyboard: card 1, card 2, then the revealed path.
    await page.focus('#before');
    await page.keyboard.press('Tab'); assert.equal((await active(page)).id, 'tx-exp-card-new');
    await page.keyboard.press('Tab'); assert.equal((await active(page)).id, 'tx-exp-card-resume');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#tx-exp-card-resume').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#tx-exp-resume').isVisible(), true);
    assert.equal(await page.locator('#guide-experiment-abundance').isVisible(), false);
    await page.keyboard.press('Tab'); assert.ok((await active(page)).inResume, 'Tab after card 2 enters the Resume path');
    await page.focus('#tx-exp-card-new'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#tx-exp-card-new').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#tx-exp-card-resume').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#tx-exp-resume').isVisible(), false);
    await page.keyboard.press('Tab'); assert.equal((await active(page)).id, 'tx-exp-card-resume');
    await page.keyboard.press('Tab'); assert.ok((await active(page)).inNew, 'Tab after card 2 enters the New path');

    // No grey negative lines on the open path.
    for (const t of GREY) assert.equal(await visibleText(page, t), false, t + ' is hidden');

    // A server focus request for a control in a hidden path reveals that path.
    await page.focus('#tx-exp-card-resume'); await page.keyboard.press('Enter');
    await page.evaluate(() => jq['shiny:message']({message:{custom:{'guide-focus':{id:'data_hub-files'}}}}));
    assert.equal(await page.locator('#guide-experiment-abundance').isVisible(), true);
    assert.equal(await page.locator('#tx-exp-card-new').getAttribute('aria-expanded'), 'true');
    await page.evaluate(() => window.navigateToSessionRestore());
    assert.equal(await page.locator('#tx-exp-resume').isVisible(), true, 'the legacy restore entry point opens Resume');
    assert.deepEqual(await page.evaluate(() => navigated), ['restore']);

    // The matrix arrives (guided.js mirrors the server stage on <body>): steps 2 and 3 open.
    await page.evaluate(() => { document.body.dataset.guideExperimentStage = 'metadata_pending';
      document.getElementById('guide_experiment_summary').innerHTML = '<div class="guide-next-task" role="status"><strong>Abundance matrix loaded</strong></div>'; });
    await page.waitForFunction(() => document.querySelector('[aria-controls="tx-exp-step-body-2"]').getAttribute('aria-expanded') === 'true');
    assert.equal(await page.locator('[aria-controls="tx-exp-step-body-3"]').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#sample_metadata_import-confirm').isVisible(), true);
    assert.equal(await visibleText(page, 'Opens when your abundance matrix is loaded'), false);
    // The user can still fold a step.
    await page.click('[aria-controls="tx-exp-step-body-3"]');
    assert.equal(await page.locator('#tx-exp-step-body-3').isVisible(), false);

    // 390 px, with a project library and server workbooks: the cards stack, both whole and on screen.
    const mobile = await browser.newPage({viewport:{width:390,height:844}});
    await load(mobile, true, true);
    const mc = mobile.locator('#tx-exp-choice > .tx-exp-card');
    [a, b] = [await mc.nth(0).boundingBox(), await mc.nth(1).boundingBox()];
    assert.ok(b.y >= a.y + a.height && Math.abs(a.width - b.width) < 1, 'cards stack at 390');
    assert.ok(a.x >= 0 && a.x + a.width <= 390 && b.x + b.width <= 390, 'cards fit the viewport');
    assert.equal(await mobile.locator('#tx-exp-card-resume .tx-exp-card-text').textContent(),
      'Open a checkpoint from your project library or a session ZIP you saved earlier.');
    // The project library belongs to the Resume path (FIXR3B item 2): hidden before a choice, so the keyboard
    // starts on the cards from the top of the page; Resume moves it into its path; New hides it again.
    assert.equal(await mobile.locator('.team-library').isVisible(), false, 'no library before a choice');
    await mobile.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    await mobile.keyboard.press('Tab'); assert.equal((await active(mobile)).id, 'before', 'the first Tab stop is not inside the hidden library');
    await mobile.keyboard.press('Tab'); assert.equal((await active(mobile)).id, 'tx-exp-card-new');
    await mobile.keyboard.press('Tab'); assert.equal((await active(mobile)).id, 'tx-exp-card-resume');
    await mobile.keyboard.press('Enter');
    assert.equal(await mobile.locator('.team-library').isVisible(), true, 'Resume shows the library');
    assert.equal(await mobile.evaluate(() => document.getElementById('tx-exp-resume').contains(document.querySelector('.team-library'))), true, 'the library sits in the Resume path');
    assert.equal(await mobile.evaluate(() => { const l = document.querySelector('.team-library'), z = document.getElementById('data_hub-import_session_file'); return !!(l.compareDocumentPosition(z) & Node.DOCUMENT_POSITION_FOLLOWING); }), true, 'library first, then the ZIP restore');
    await mobile.keyboard.press('Tab'); assert.equal((await active(mobile)).id, 'team_login_email', 'Tab after card 2 enters the library in the Resume path');
    assert.equal(await mobile.locator('#team_login_email').count(), 1, 'moved, not cloned');
    await mobile.click('#tx-exp-card-new');
    assert.equal(await mobile.locator('.team-library').isVisible(), false, 'New hides the library');
    await mobile.focus('#tx-exp-card-resume'); await mobile.keyboard.press('Tab');
    assert.ok((await active(mobile)).inNew, 'with New chosen, Tab after card 2 enters the upload path');
    // With workbooks listed, the size hint is positive and points at them.
    assert.equal(await mobile.locator('.guide-upload-limit').textContent(), 'Files over 90 MB? Open them from the lab server below.');
    assert.equal(await mobile.locator('.guide-upload-limit').isVisible(), true);
    assert.equal(await visibleText(mobile, 'No saved workbooks found'), false);
    console.log('test_team_experiment_cards: ok');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
