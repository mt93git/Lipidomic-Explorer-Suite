// Run with: node tests/dual-ui/test_team_metadata_minimal.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body class="team-workspace-app" data-tw-screen="data-metadata">
      <section data-value="Experiment"><main class="guide-page">
        <header class="guide-heading"><h2>Start with your experiment</h2><p>Redundant page-level intro</p></header>
        <section id="guide-experiment-metadata" class="guide-panel">
          <h3>2. Add sample metadata (optional)</h3>
          <div id="guide_experiment_metadata_prompt"><div class="guide-next-task" role="status"><strong>Next: add sample metadata</strong><p>Choose a matching file.</p><div class="guide-actions"><button>Continue without additional metadata</button></div></div></div>
          <h4>Sample metadata</h4><p>Sample identifiers must exactly match the abundance matrix column names.</p>
          <label>Sample metadata file <input type="file"></label>
          <div id="metadata-matching"><strong>Resolve matching errors</strong><p>1 unmatched matrix sample</p><button>Confirm sample metadata</button></div>
        </section>
        <section id="guide-experiment-design" class="guide-panel"><h3>3. Review the study design</h3><p>Check labels.</p><div id="guide_experiment_next"><p class="guide-pending">Confirm metadata first.</p></div></section>
      </main></section>
      <section data-value="Design"><main class="guide-page"><header class="guide-heading"><h2>Confirm the study design</h2></header>
        <div id="guide_design_status" class="guide-design-status" role="status"><h3>2 items left before Quality</h3><p>Review these details.</p><ol><li>Set the independent unit</li><li>Choose sample relationship</li></ol></div>
        <section class="guide-panel"><h3>1. Review sample labels</h3></section>
      </main></section>
    </body>`);
    await page.addStyleTag({ path: path.resolve('www/team/css/workspace_minimal.css') });

    const metadata = page.locator('#guide-experiment-metadata');
    assert.equal(await metadata.locator('h3').isVisible(), true, 'the task title stays visible');
    assert.equal(await metadata.locator('h4').isVisible(), false, 'the repeated static importer heading is removed from presentation');
    assert.equal(await page.getByRole('heading', {name:'Sample metadata', exact:true}).count(), 0, 'duplicate heading is absent from the accessibility tree');
    assert.equal(await page.locator('#guide_experiment_metadata_prompt strong').isVisible(), true, 'the dynamic metadata status remains visible');
    assert.equal(await page.locator('#guide_experiment_metadata_prompt p').isVisible(), true, 'unique matching guidance remains available');
    assert.equal(await metadata.locator('input[type=file]').isVisible(), true);
    assert.equal(await page.locator('#metadata-matching strong').isVisible(), true, 'matching errors remain visible');
    assert.equal(await page.locator('#metadata-matching button').isVisible(), true, 'confirmation remains available');
    assert.equal(await page.locator('#guide-experiment-design .guide-pending').isVisible(), true, 'the downstream gate remains visible');

    await page.evaluate(() => { document.body.dataset.twScreen = 'review-design'; });
    assert.equal(await page.getByRole('heading', {name:'Confirm the study design', exact:true}).count(), 0, 'duplicate Design heading is absent from the accessibility tree');
    const design = page.locator('#guide_design_status');
    assert.equal(await design.isVisible(), true, 'the design gate stays visible');
    assert.equal(await design.locator('ol').isVisible(), true, 'all design issues stay visible');
    assert.equal(await page.locator('[data-value="Design"] .guide-panel h3').isVisible(), true);

    await page.evaluate(() => { document.body.classList.remove('team-workspace-app'); });
    assert.equal(await metadata.locator('h4').evaluate(el => getComputedStyle(el).position), 'static', 'styles do not alter the non-Team shell');
    console.log('PASS: metadata and design screens reduce repeated headings while preserving matching, warnings, controls, and non-Team markup');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
