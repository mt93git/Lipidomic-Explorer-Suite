// Run with: node tests/dual-ui/test_team_group_editor.cjs
// UX22: Review "Edit groups" drawer. Review-only button; the drawer overlays the page (Review's
// columns do not move); inline edit, bulk assign to selected rows; validation (empty values block
// Apply, <2-sample groups and typo-similar names warn); Apply sends only changed fields and, on
// success, the same Review update request as Next from "Add sample labels"; keyboard: Escape closes
// and returns focus, Enter moves down a column. Screenshots in $SHOTS (default: no screenshots).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
const CSS = ['www/team/css/libreros.css', 'www/team/css/workspace.css', 'www/team/css/workspace_minimal.css', 'www/team/css/shell.css', 'www/team/css/status_slot.css', 'www/team/css/review_live.css', 'www/team/css/replace_metadata.css', 'www/team/css/group_editor.css'];
const JS = ['www/team/js/status_hold.js', 'www/team/js/workspace.js', 'www/team/js/replace_metadata.js', 'www/team/js/group_editor.js'];
const SHOTS = process.env.SHOTS || '';
const HTML = `<!doctype html><body class="team-workspace-app" data-guide-step="1" data-guide-analysis="false">
  <section id="team-workspace">
    <nav class="tw-steps" aria-label="Analysis steps"><button type="button" data-tw-stage="data"><span>01</span><strong>Data</strong></button><button type="button" data-tw-stage="review"><span>02</span><strong>Review</strong></button><button type="button" data-tw-stage="canvas"><span>03</span><strong>Canvas</strong></button></nav>
    <div class="tw-journey"><div class="tw-journey-copy"><span class="tw-progress" id="tw-progress"></span><h2 id="tw-screen-title" tabindex="-1">Choose how to begin</h2><p id="tw-screen-help">Help</p></div>
      <div class="tw-journey-actions"><button type="button" class="tw-back" data-tw-back="true">← Back</button><button type="button" class="tw-next" data-tw-next="true">Next →</button></div></div>
    <div class="tw-choice-card"><button type="button" data-tw-choice="matrix">Upload a new matrix</button></div>
    <p id="tw-next" role="status" aria-live="polite"></p>
  </section>
  <section class="tab-pane" data-value="Experiment"><div class="guide-page"><div id="guide-experiment-abundance">Matrix</div><div id="guide-experiment-metadata">Add sample labels</div><div id="guide-experiment-design"></div></div></section>
  <div class="tw-simple-review" style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px"><div id="col1" style="height:300px;background:#eef">Detection</div><div id="col2" style="height:300px;background:#efe">PCA</div><div id="col3" style="height:300px;background:#fee">Samples</div></div>
  <div id="guide_experiment_summary">Abundance matrix loaded</div><div id="guide_experiment_next"></div>
  <script>window.sent=[];window.handlers={};window.jqueryEvents={};window.jQuery=function(){return {on:function(names,fn){names.split(' ').forEach(name=>jqueryEvents[name]=fn);return this;},trigger:function(){return this;}}};window.Shiny={setInputValue:(id,value)=>sent.push([id,JSON.parse(JSON.stringify(value))]),addCustomMessageHandler:(name,fn)=>handlers[name]=fn,shinyapp:{isConnected:()=>true}};</script>
</body>`;
const samples = ['S01_Ctrl', 'S02_Ctrl', 'S03_Ctrl', 'S04_Exp', 'S05_Exp', 'S06_Exp'];
const TABLE = {version: 'v1', max_label: 200, samples, columns: [
  {field: 'Group1', label: 'Group 1', source: 'Condition', values: ['Healthy', 'Healthy', 'Healthy', 'Crisis', 'Crisis', 'Crisis']},
  {field: 'Group2', label: 'Group 2', source: '', values: ['Control', 'Control', 'Control', 'Exp', 'Exp', 'Exp']}]};

async function load(browser, width) {
  const page = await browser.newPage({viewport: {width, height: 900}});
  await page.setContent(HTML);
  for (const f of CSS) await page.addStyleTag({path: path.resolve(f)});
  for (const f of JS) await page.addScriptTag({path: path.resolve(f)});
  return page;
}
async function toReview(page, withTable = true) {
  await page.evaluate(() => { handlers['team-auth-state']({authenticated: true}); document.body.dataset.guideStep = '3'; });
  await page.waitForFunction(() => TeamWorkspace.state().substep === 'review-single');
  if (withTable) await page.evaluate(t => handlers['team-groups-table'](t), TABLE);
}
const trigger = '.tw-groups-trigger', drawer = '#tw-groups-drawer';
const cell = (field, row) => `${drawer} .tw-groups-cell[data-field="${field}"][data-row="${row}"]`;
const rects = page => page.evaluate(() => ['col1', 'col2', 'col3', 'tw-screen-title'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
const issues = page => page.locator(`${drawer} .tw-groups-issues li`).allTextContents();

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // A. Review only; disabled until the table arrives; the default Review is unchanged (drawer closed).
    let page = await load(browser, 1440);
    assert.equal(await page.locator(trigger).count(), 1);
    assert.equal(await page.locator(trigger).isVisible(), false, 'hidden before Review');
    await toReview(page, false);
    assert.equal(await page.locator(trigger).isVisible(), true, 'visible on Review');
    assert.equal(await page.locator(trigger).isDisabled(), true, 'disabled until the groups table arrives');
    await page.evaluate(t => handlers['team-groups-table'](t), TABLE);
    assert.equal(await page.locator(trigger).isDisabled(), false);
    assert.equal(await page.locator(drawer).isVisible(), false, 'the drawer starts closed');
    const order = await page.locator('.tw-journey-actions button:visible').allTextContents();
    assert.deepEqual(order.slice(0, 2), ['Edit groups', 'Replace sample metadata'], 'next to Replace sample metadata');
    await page.evaluate(() => { document.body.dataset.guideStep = '5'; });
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'canvas');
    assert.equal(await page.locator(trigger).isVisible(), false, 'hidden on Canvas');
    await page.close();

    // B. Opening does not move Review's columns; table, headers and focus.
    for (const width of [390, 1280, 1440]) {
      page = await load(browser, width);
      await toReview(page);
      await page.waitForTimeout(300);
      const before = await rects(page);
      await page.locator(trigger).click();
      assert.equal(await page.locator(drawer).isVisible(), true);
      assert.deepEqual(await rects(page), before, `no layout jump at ${width}px`);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'tw-groups-title', 'focus on the drawer title');
      assert.equal(await page.locator(`${drawer} tbody tr`).count(), 6);
      const heads = await page.locator(`${drawer} thead th`).allTextContents();
      assert.ok(heads[2].includes('Group 1') && heads[2].includes('Condition') && heads[3].includes('from sample names'), heads.join('|'));
      if (SHOTS) await page.screenshot({path: path.join(SHOTS, `group-editor-${width}.png`)});
      await page.close();
    }

    // C. Inline edit, typo + small-group warnings, empty value blocks Apply; Enter moves down.
    page = await load(browser, 1440);
    await toReview(page);
    await page.locator(trigger).click();
    assert.equal(await page.locator('.tw-groups-apply').isDisabled(), true, 'nothing to apply yet');
    await page.locator(cell('Group1', 0)).fill('Healty');
    let list = await issues(page);
    assert.ok(list.some(t => /"Healty" looks like "Healthy"/.test(t)), list.join('\n'));
    assert.ok(list.some(t => /"Healty" has only 1 sample/.test(t)), list.join('\n'));
    assert.equal(await page.locator(cell('Group1', 0)).evaluate(n => n.classList.contains('is-flagged') && n.classList.contains('is-changed')), true);
    assert.equal(await page.locator('.tw-groups-apply').isDisabled(), false, 'warnings do not block');
    assert.equal((await page.locator('.tw-groups-count').textContent()).trim(), '1 change not applied');
    await page.locator(cell('Group1', 1)).fill('');
    list = await issues(page);
    assert.ok(list.some(t => /^Fix: Group 1: 1 sample has no value/.test(t)), list.join('\n'));
    assert.equal(await page.locator(cell('Group1', 1)).getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('.tw-groups-apply').isDisabled(), true, 'an empty edited value blocks Apply');
    await page.locator(cell('Group1', 1)).fill('Healthy');
    await page.locator(cell('Group1', 0)).fill('Healthy');
    assert.equal(await page.locator('.tw-groups-apply').isDisabled(), true, 'back to no changes');
    await page.locator(cell('Group2', 2)).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.row), '3', 'Enter moves to the next row');
    assert.equal(await page.evaluate(() => TeamGroupEditor.similar('Batch 1', 'Batch 2')), false, 'digit-only differences are intended');
    assert.equal(await page.evaluate(() => TeamGroupEditor.similar('SC-Steady', 'sc steady')), true);
    await page.close();

    // D. Bulk assign to selected rows (filter + select all shown), then Apply: only the changed field is
    //    sent, then the Review update (team_review_prepare entry) after the server confirms.
    page = await load(browser, 1440);
    await toReview(page);
    await page.locator(trigger).click();
    await page.locator(`${drawer} .tw-groups-filter input`).fill('exp');
    assert.equal(await page.locator(`${drawer} tbody tr:visible`).count(), 3, 'filter shows the Exp samples');
    await page.locator(`${drawer} .tw-groups-pick-all`).check();
    await page.locator(`${drawer} .tw-groups-filter input`).fill('');
    await page.locator(`${drawer} .tw-groups-pick[data-sample="S01_Ctrl"]`).check();
    await page.locator(`${drawer} .tw-groups-bulk select`).selectOption('Group2');
    await page.locator('.tw-groups-bulk-value').fill('Pilot');
    assert.equal((await page.locator('.tw-groups-assign').textContent()).trim(), 'Assign to 4 selected');
    await page.locator('.tw-groups-bulk-value').press('Enter');
    assert.deepEqual(await page.locator(`${drawer} .tw-groups-cell[data-field="Group2"]`).evaluateAll(ns => ns.map(n => n.value)), ['Pilot', 'Control', 'Control', 'Pilot', 'Pilot', 'Pilot']);
    if (SHOTS) await page.screenshot({path: path.join(SHOTS, 'group-editor-bulk.png')});
    await page.locator('.tw-groups-apply').click();
    let sent = await page.evaluate(() => sent.filter(x => x[0] === 'team_groups_apply'));
    assert.equal(sent.length, 1);
    assert.deepEqual(Object.keys(sent[0][1].values), ['Group2'], 'only the changed field is sent');
    assert.deepEqual(sent[0][1].samples, samples);
    assert.equal(sent[0][1].version, 'v1', 'the edited table version is sent for the server check');
    assert.equal(await page.locator('.tw-groups-apply').isDisabled(), true, 'disabled while applying');
    assert.equal(await page.locator(cell('Group1', 0)).isDisabled(), true, 'cells are read-only while applying');
    assert.equal(await page.locator('.tw-groups-bulk-value').isDisabled(), true, 'bulk value is read-only while applying');
    assert.equal(await page.locator(drawer).getAttribute('aria-busy'), 'true');
    // A failed apply keeps the edits and shows the reason.
    await page.evaluate(token => handlers['team-groups-applied']({token, ok: false, message: 'Mapped design field Group2 contains missing values.'}), sent[0][1].token);
    assert.match(await page.locator('.tw-groups-result').textContent(), /missing values/);
    assert.equal((await page.locator('.tw-groups-count').textContent()).trim(), '4 changes not applied');
    await page.locator('.tw-groups-apply').click();
    sent = await page.evaluate(() => sent.filter(x => x[0] === 'team_groups_apply'));
    // Server order: the new table arrives first (still pending), then the reply.
    const applied = JSON.parse(JSON.stringify(TABLE)); applied.version = 'v2'; applied.columns[1].values = ['Pilot', 'Control', 'Control', 'Pilot', 'Pilot', 'Pilot']; applied.columns[1].source = 'Group2';
    await page.evaluate(t => handlers['team-groups-table'](t), applied);
    assert.equal(await page.locator(cell('Group1', 0)).isDisabled(), true, 'still read-only until the reply');
    await page.evaluate(token => handlers['team-groups-applied']({token, ok: true, prepared: true, message: 'Groups applied. Review is updating with the new groups.'}), sent[1][1].token);
    assert.equal(await page.evaluate(() => sent.filter(x => x[0] === 'team_review_prepare').length), 0, 'the server requests the Review update itself');
    assert.equal(await page.locator(cell('Group1', 0)).isDisabled(), false, 'editable again');
    assert.equal((await page.locator('.tw-groups-count').textContent()).trim(), 'No changes');
    assert.ok((await page.locator(`${drawer} thead th`).nth(3).textContent()).includes('column “Group2”'));
    await page.close();

    // F. Stale edits: a new table version (metadata replaced / checkpoint switched) with the SAME samples
    //    clears unapplied edits, open or closed; a version-mismatch failure also clears them.
    page = await load(browser, 1440);
    await toReview(page);
    await page.locator(trigger).click();
    await page.locator(cell('Group1', 0)).fill('Edited');
    await page.keyboard.press('Escape');
    const replaced = JSON.parse(JSON.stringify(TABLE)); replaced.version = 'v9'; replaced.columns[0].values = ['A', 'A', 'A', 'B', 'B', 'B'];
    await page.evaluate(t => handlers['team-groups-table'](t), replaced);
    await page.locator(trigger).click();
    assert.equal((await page.locator('.tw-groups-count').textContent()).trim(), 'No changes', 'stale edits cleared');
    assert.deepEqual(await page.locator(`${drawer} .tw-groups-cell[data-field="Group1"]`).evaluateAll(ns => ns.map(n => n.value)), ['A', 'A', 'A', 'B', 'B', 'B'], 'the replaced labels are shown');
    assert.match(await page.locator('.tw-groups-result').textContent(), /unapplied edits were cleared/);
    await page.locator(cell('Group1', 0)).fill('C'); await page.locator(cell('Group1', 1)).fill('C');
    await page.locator('.tw-groups-apply').click();
    let s2 = await page.evaluate(() => sent.filter(x => x[0] === 'team_groups_apply'));
    const again = JSON.parse(JSON.stringify(replaced)); again.version = 'v10';
    await page.evaluate(t => handlers['team-groups-table'](t), again);
    await page.evaluate(token => handlers['team-groups-applied']({token, ok: false, message: 'The sample labels changed since this table was loaded. Nothing was applied.'}), s2[0][1].token);
    assert.equal((await page.locator('.tw-groups-count').textContent()).trim(), 'No changes', 'a version-mismatch failure clears the old edits');
    // Datalists are not duplicated across renders; sample IDs that are Object.prototype names are data.
    for (let k = 0; k < 3; k++) await page.locator('.tw-groups-reset').evaluate(b => b.click());
    assert.equal(await page.evaluate(() => document.querySelectorAll('#tw-groups-list-Group1').length), 1, 'one datalist per column');
    const proto = {version: 'p1', max_label: 200, samples: ['__proto__', 'constructor', 'toString', 'S4'], columns: [
      {field: 'Group1', label: 'Group 1', source: 'Condition', values: ['constructor', 'constructor', 'toString', 'toString']},
      {field: 'Group2', label: 'Group 2', source: '', values: ['x', 'x', 'y', 'y']}]};
    await page.evaluate(t => handlers['team-groups-table'](t), proto);
    assert.equal(await page.locator(`${drawer} .tw-groups-pick:checked`).count(), 0, '__proto__/constructor rows are not pre-selected');
    assert.equal(await page.evaluate(() => TeamGroupEditor.validate().warnings.length), 0, 'prototype-named labels count as normal groups');
    await page.locator(`${drawer} .tw-groups-pick[data-sample="constructor"]`).check();
    await page.locator(`${drawer} .tw-groups-bulk select`).selectOption('Group2');
    await page.locator('.tw-groups-bulk-value').fill('z');
    assert.equal((await page.locator('.tw-groups-assign').textContent()).trim(), 'Assign to 1 selected');
    await page.locator('.tw-groups-assign').click();
    assert.deepEqual(await page.locator(`${drawer} .tw-groups-cell[data-field="Group2"]`).evaluateAll(ns => ns.map(n => n.value)), ['x', 'z', 'y', 'y']);
    // NFC: a decomposed "Café" typed in a cell is stored composed, and the pair is flagged as similar.
    assert.equal(await page.evaluate(() => TeamGroupEditor.similar('Caf\u00e9', 'Cafe\u0301')), true);
    await page.locator(cell('Group1', 3)).fill('Cafe\u0301'); await page.locator(cell('Group1', 3)).blur();
    assert.equal(await page.locator(cell('Group1', 3)).inputValue(), 'Caf\u00e9', 'typed labels are NFC-normalized');
    await page.locator(cell('Group1', 2)).fill('\u{1F9EA}'.repeat(150));
    assert.equal(await page.locator(cell('Group1', 2)).inputValue(), '\u{1F9EA}'.repeat(150), '150 emoji (300 UTF-16 units) fit the 200-character limit');
    await page.locator(cell('Group1', 2)).fill('x'.repeat(201));
    assert.ok((await issues(page)).some(t => /longer than 200 characters/.test(t)), 'over-long labels block Apply');
    assert.equal(await page.locator('.tw-groups-apply').isDisabled(), true);
    await page.close();

    // E. Escape closes and returns focus to the button; leaving Review closes the drawer.
    page = await load(browser, 1440);
    await toReview(page);
    await page.locator(trigger).click();
    await page.locator(cell('Group1', 2)).focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(drawer).isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('tw-groups-trigger')), true);
    await page.locator(trigger).click();
    await page.evaluate(() => { document.body.dataset.guideStep = '5'; });
    await page.waitForFunction(() => TeamWorkspace.state().substep === 'canvas');
    assert.equal(await page.locator(drawer).isVisible(), false, 'leaving Review closes the drawer');
    await page.close();
    console.log('PASS test_team_group_editor');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
