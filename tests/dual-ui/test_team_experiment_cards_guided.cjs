// Run with: node tests/dual-ui/test_team_experiment_cards_guided.cjs
// R11 with the real guided.js (FIXR1B item 5). guided.js assigns window.navigateToDataUpload and
// window.navigateToSessionRestore again on every shiny:connected; the New/Resume reveal of
// experiment_cards.js must survive that (and a reconnect), whichever script loads first. Revealing or
// hiding a path or a collapsed step sends jQuery 'shown'/'hidden', so Shiny re-checks those outputs.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('../browser/ci/node_modules/playwright');

const jquery = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("www/shared/jquery.min.js",package="shiny"))'], { encoding: 'utf8' }).trim();
const fileInput = (id, label) => `<div class="form-group shiny-input-container"><label class="control-label" for="${id}">${label}</label>
  <div class="input-group"><label class="input-group-btn input-group-prepend"><span class="btn btn-default btn-file">Browse…<input id="${id}" type="file"></span></label>
  <input type="text" class="form-control" placeholder="No file selected" readonly></div></div>`;
// The page-header project library as project_library.R team_library_ui() renders it in guided mode, signed in
// (account, projects with the resume and save rows, recovery, status).
const LIBRARY = `<section class="team-library" style="background:white;border:1px solid #d9e5e8;border-radius:12px;margin:16px;padding:20px;">
  <h3>Project library</h3><p>Save a private checkpoint. Return to your analysis without uploading files again.</p>
  <div id="team_library_account" class="shiny-html-output"><p>Signed in as a@b.org</p><button id="team_library_logout" type="button" class="btn btn-default action-button">Sign out and clear this session</button></div>
  <div id="team_library_projects" class="shiny-html-output"><div class="team-library-grid">
    <div class="team-library-project"><div class="form-group shiny-input-container"><label class="control-label" for="team_library_project">Project</label><select id="team_library_project" class="form-control"><option value="p1">Pilot</option></select></div></div>
    <div class="team-library-resume"><div class="form-group shiny-input-container"><label class="control-label" for="team_library_checkpoint">Saved checkpoint</label><select id="team_library_checkpoint" class="form-control"><option value="f1">a.zip</option></select></div><button id="team_library_resume" type="button" class="btn btn-default action-button">Resume checkpoint</button></div>
    <div class="team-library-save"><div class="form-group shiny-input-container"><label class="control-label" for="team_library_label">New checkpoint name</label><input id="team_library_label" type="text" class="form-control" value="Analysis checkpoint"></div><button id="team_library_save" type="button" class="btn btn-default action-button">Save current analysis</button></div></div>
    <small>A checkpoint stores your files and settings.</small></div>
  <div id="team_library_recovery" class="shiny-html-output"></div><p role="status"><span id="team_library_status" class="shiny-text-output"></span></p></section>`;
const FIXTURE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
  <div class="navbar-header-slot">${LIBRARY}</div>
  <div class="tab-content"><div class="tab-pane active"><div class="guide-page">
    <div class="guide-heading"><h2>Start with your experiment</h2></div>
    <div class="guide-panel" id="guide-experiment-abundance"><h3>1. Add the abundance matrix</h3>
      ${fileInput('data_hub-files', 'Abundance files')}
      <div id="data_hub-loaded_files_display" class="shiny-html-output"></div>
      <div id="guide_experiment_summary" class="shiny-html-output"><p>No experiment loaded yet.</p></div>
      <div id="guide_local_experiments" class="shiny-html-output"></div></div>
    <div class="guide-panel" id="guide-experiment-metadata"><h3>2. Add sample metadata (optional)</h3>
      <div id="guide_experiment_metadata_prompt" class="shiny-html-output"></div></div>
    <div class="guide-panel" id="guide-experiment-design"><h3>3. Review the study design</h3>
      <div id="guide_experiment_next" class="shiny-html-output"></div></div>
    <details class="guide-panel"><summary>Resume from a saved session ZIP instead</summary>
      ${fileInput('data_hub-import_session_file', 'Saved session (.zip)')}
      <div id="data_hub-import_status_display" class="shiny-html-output"></div></details>
  </div></div></div>
  <script>
    window.sent = []; window.handlers = {};
    window.Shiny = { addCustomMessageHandler: (n, f) => { handlers[n] = f; }, setInputValue: (n, v) => sent.push([n, v]) };
  </script></body></html>`;

async function load(page, order) {
  await page.setContent(FIXTURE);
  await page.addStyleTag({ path: path.resolve('www/team/css/experiment_cards.css') });
  await page.addScriptTag({ path: jquery });
  await page.evaluate(() => { window.$ = window.jQuery; window.events = []; window.libEvents = [];
    jQuery(document).on('shown hidden', e => { if (e.target.id) events.push(e.type + ' ' + e.target.id);
      if (e.target.classList && e.target.classList.contains('team-library')) libEvents.push(e.type); }); });
  for (const f of order) await page.addScriptTag({ path: path.resolve('www/team/js', f) });
}
const connect = page => page.evaluate(() => new Promise(r => { jQuery(document).trigger('shiny:connected'); setTimeout(r, 20); }));
const state = page => page.evaluate(() => ({
  resume: !document.getElementById('tx-exp-resume').classList.contains('tx-exp-path-hidden'),
  upload: !document.getElementById('guide-experiment-abundance').classList.contains('tx-exp-path-hidden'),
  cards: [...document.querySelectorAll('#tx-exp-choice > .tx-exp-card')].map(c => c.getAttribute('aria-expanded'))
}));
// Where the project library is and whether it shows: 'header' (its page-header slot) or 'resume' (the Resume path).
const lib = page => page.evaluate(() => { const l = document.querySelector('.team-library');
  return { shown: l.getClientRects().length > 0, at: l.closest('#tx-exp-resume') ? 'resume' : l.closest('.navbar-header-slot') ? 'header' : 'elsewhere',
    count: document.querySelectorAll('.team-library,#team_library_resume').length }; });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const order of [['guided.js', 'experiment_cards.js'], ['experiment_cards.js', 'guided.js']]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await load(page, order);
      const label = order.join(' then ');
      assert.equal(await page.locator('#tx-exp-choice > .tx-exp-card').count(), 2, `${label}: the two cards`);
      // FIXR3B item 2: before a choice the Experiment step shows no library (the cards come first).
      assert.deepEqual(await lib(page), { shown: false, at: 'header', count: 2 }, `${label}: no library before a choice`);
      // guided.js replaces the entry points on connection, and again on a reconnect.
      for (const round of ['connected', 'reconnected']) {
        await connect(page);
        await page.evaluate(() => { sent.length = 0; events.length = 0; libEvents.length = 0; });
        await page.evaluate(() => window.navigateToSessionRestore());
        let s = await state(page);
        assert.deepEqual([s.resume, s.upload, s.cards], [true, false, ['false', 'true']], `${label}, ${round}: navigateToSessionRestore opens Resume ${JSON.stringify(s)}`);
        assert.deepEqual(await page.evaluate(() => sent), [['guide_step', 1]], `${label}, ${round}: guided.js's own navigation still runs`);
        assert.ok((await page.evaluate(() => events)).includes('shown tx-exp-resume'), `${label}, ${round}: Shiny hears that Resume is shown`);
        assert.deepEqual(await lib(page), { shown: true, at: 'resume', count: 2 }, `${label}, ${round}: Resume shows the library in its path`);
        assert.deepEqual(await page.evaluate(() => libEvents), ['shown'], `${label}, ${round}: Shiny hears that the library is shown`);
        await page.evaluate(() => { events.length = 0; libEvents.length = 0; window.navigateToDataUpload(); });
        s = await state(page);
        assert.deepEqual([s.resume, s.upload, s.cards], [false, true, ['true', 'false']], `${label}, ${round}: navigateToDataUpload opens New`);
        assert.deepEqual((await page.evaluate(() => events)).sort(), ['hidden tx-exp-resume', 'shown guide-experiment-abundance'], `${label}, ${round}: shown/hidden follow the switch`);
        assert.deepEqual(await lib(page), { shown: false, at: 'header', count: 2 }, `${label}, ${round}: New hides the library`);
        assert.deepEqual(await page.evaluate(() => libEvents), ['hidden'], `${label}, ${round}: Shiny hears that the library is hidden`);
      }
      // The server's matrix stage (guided.js paints it on <body>) opens steps 2 and 3: Shiny hears both.
      await page.evaluate(() => { events.length = 0; handlers['guide-state']({ step: 1, tool: '', goal: 'overview', experimentStage: 'metadata_pending' }); });
      await page.waitForFunction(() => document.querySelector('[aria-controls="tx-exp-step-body-2"]').getAttribute('aria-expanded') === 'true');
      const opened = await page.evaluate(() => events);
      for (const id of ['tx-exp-step-body-2', 'tx-exp-step-body-3']) assert.ok(opened.includes('shown ' + id), `${label}: 'shown' on ${id} (${opened.join(', ')})`);
      await page.evaluate(() => { events.length = 0; });
      await page.click('[aria-controls="tx-exp-step-body-3"]');
      assert.deepEqual(await page.evaluate(() => events), ['hidden tx-exp-step-body-3'], `${label}: folding a step sends 'hidden'`);
      // Library across steps, through guided.js's guide-state handler: on another step it is back in its
      // header slot and shown (it saves checkpoints there); back on Experiment it follows the choice again.
      // A focused library control keeps focus when the library moves.
      await page.click('#tx-exp-card-resume');
      await page.focus('#team_library_checkpoint');
      await page.evaluate(() => { libEvents.length = 0; handlers['guide-state']({ step: 4, tool: '', goal: 'overview', experimentStage: 'ready' }); });
      await page.waitForFunction(() => !document.querySelector('.team-library').closest('#tx-exp-resume'));
      assert.deepEqual(await lib(page), { shown: true, at: 'header', count: 2 }, `${label}: on step 4 the library is in its header slot`);
      assert.deepEqual(await page.evaluate(() => libEvents), ['shown'], `${label}: Shiny re-checks the moved library`);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'team_library_checkpoint', `${label}: focus stays on the moved control`);
      await page.evaluate(() => handlers['guide-state']({ step: 1, tool: '', goal: 'overview', experimentStage: 'ready' }));
      await page.waitForFunction(() => !!document.querySelector('.team-library').closest('#tx-exp-resume'));
      assert.deepEqual(await lib(page), { shown: true, at: 'resume', count: 2 }, `${label}: back on Experiment with Resume chosen, the library is in the Resume path`);
      await page.click('#tx-exp-card-new');
      assert.deepEqual(await lib(page), { shown: false, at: 'header', count: 2 }, `${label}: New hides it again`);
      await page.evaluate(() => handlers['guide-state']({ step: 2, tool: '', goal: 'overview', experimentStage: 'ready' }));
      await page.waitForFunction(() => document.querySelector('.team-library').getClientRects().length > 0);
      assert.deepEqual(await lib(page), { shown: true, at: 'header', count: 2 }, `${label}: with New chosen, other steps still show the library`);
      await page.evaluate(() => handlers['guide-state']({ step: 1, tool: '', goal: 'overview', experimentStage: 'ready' }));
      // No duplicate wrapping: one call, one navigation.
      await page.evaluate(() => { sent.length = 0; window.navigateToSessionRestore(); });
      assert.deepEqual(await page.evaluate(() => sent), [['guide_step', 1]], `${label}: one navigation per call`);
      assert.deepEqual(errors, [], `${label}: no page errors`);
      await page.close();
    }
    console.log('test_team_experiment_cards_guided: ok');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
