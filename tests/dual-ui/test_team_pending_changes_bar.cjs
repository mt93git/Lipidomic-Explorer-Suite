// Run with: node tests/dual-ui/test_team_pending_changes_bar.cjs
// The guided "Changes pending" bar replaces the exclusion/restore toasts, blocks Continue
// to My question until the data is updated, forwards Update/Undo to the existing controls,
// keeps keyboard focus across re-renders and clears earlier notifications when the step changes.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body class="guided-app" data-guide-step="3">
      <div id="guide-context"><span class="guide-run-status is-ready">Analysis ready</span></div>
      <div id="guide-analysis-toolbar"></div>
      <div id="tw-pending-bar" role="status" aria-live="polite"><div id="team_pending_changes_bar" class="shiny-html-output"></div></div>
      <div class="tab-content"><div class="tab-pane active"><div class="guide-page"><div class="guide-heading"><h2>Check quality</h2></div>
        <button id="data_hub-runAnalysis" type="button">Update prepared data</button>
        <button id="qc_pca_tab-guided_undo_1" type="button" data-sample="S01">Undo</button>
        <div id="guide_quality_next" class="shiny-html-output"><div class="guide-actions"><button type="button" class="guide-button" data-guide-step="4">Continue with the previous applied run →</button></div></div>
      </div></div></div>
      <script>
        window.sent=[];window.clicked=[];window.jq={};
        window.jQuery=function(){return {on:function(name,fn){jq[name]=fn;return this;}};};
        window.Shiny={setInputValue:(id,value)=>sent.push([id,value]),notifications:{remove:id=>{const el=document.getElementById('shiny-notification-'+id);if(el)el.remove();}}};
        // Stands in for guided.js: a delegated bubbling handler for step buttons.
        document.addEventListener('click',e=>{const b=e.target.closest('button[data-guide-step]');if(b)sent.push(['guide_step',Number(b.dataset.guideStep)]);});
        document.getElementById('data_hub-runAnalysis').addEventListener('click',()=>clicked.push('update'));
        document.getElementById('qc_pca_tab-guided_undo_1').addEventListener('click',()=>clicked.push('undo:S01'));
        window.toast=(id,text,cls)=>{let p=document.getElementById('shiny-notification-panel');if(!p){p=document.createElement('div');p.id='shiny-notification-panel';document.body.appendChild(p);}
          const el=document.createElement('div');el.id='shiny-notification-'+id;el.className='shiny-notification'+(cls?' '+cls:'');el.innerHTML='<div class="shiny-notification-close">×</div><div class="shiny-notification-content"><div class="shiny-notification-content-text">'+text+'</div></div>';p.appendChild(el);return el;};
      </script>
    </body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/pending_changes_bar.css')});
    await page.addScriptTag({path:path.resolve('www/team/js/pending_changes_bar.js')});
    const continueBtn = page.locator('#guide_quality_next button[data-guide-step="4"]');

    assert.equal(await page.evaluate(() => document.getElementById('guide-context').nextElementSibling.id), 'tw-pending-bar', 'the bar sits under the run strip');
    assert.equal(await continueBtn.getAttribute('aria-disabled'), null, 'Continue works with nothing pending');

    // The server renders the bar after an exclusion.
    await page.evaluate(() => { document.getElementById('team_pending_changes_bar').innerHTML =
      '<div class="tw-pending-bar" data-tw-pending="true"><p class="tw-pending-text"><strong>Changes pending: </strong>S01 excluded — results shown are from the previous run.</p>' +
      '<div class="tw-pending-actions"><button type="button" class="btn btn-sm tw-pending-update" data-tw-pending-update="data_hub-runAnalysis">Update prepared data</button>' +
      '<button type="button" class="btn btn-sm tw-pending-undo" data-tw-pending-undo="S01" aria-label="Undo exclusion of S01">Undo</button></div></div>'; });
    await page.waitForFunction(() => document.body.classList.contains('tw-changes-pending'));
    assert.equal(await continueBtn.getAttribute('aria-disabled'), 'true');
    assert.equal(await continueBtn.getAttribute('aria-describedby'), 'tw-continue-reason');
    assert.equal(await page.locator('#tw-continue-reason').textContent(), 'Update prepared data first.');
    assert.equal(await continueBtn.textContent(), 'Continue to My question →');
    assert.equal(await page.locator('.guide-run-status.is-ready').isVisible(), false, '"Analysis ready" never shows beside the bar');

    // Playwright refuses to click aria-disabled controls, so assert the blocked state and
    // dispatch the click the way a keyboard or assistive technology would.
    assert.equal(await continueBtn.getAttribute('title'), 'Update prepared data first.');
    assert.equal(await page.evaluate(() => document.getElementById(document.querySelector('#guide_quality_next button[data-guide-step="4"]').getAttribute('aria-describedby')).textContent), 'Update prepared data first.');
    assert.equal(await page.evaluate(() => { const b = document.querySelector('#guide_quality_next button[data-guide-step="4"]'); b.click(); return document.body.dataset.guideStep; }), '3', 'the step does not change');
    assert.deepEqual(await page.evaluate(() => sent.filter(x => x[0]==='guide_step')), [], 'a blocked Continue does not navigate');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'btn btn-sm tw-pending-update', 'focus moves to Update prepared data');

    await page.locator('.tw-pending-update').click();
    await page.locator('.tw-pending-undo').click();
    assert.deepEqual(await page.evaluate(() => clicked), ['update', 'undo:S01'], 'bar buttons forward to the existing controls');

    // Keyboard focus survives a re-render of the shown bar (renderUI replaces its buttons).
    const barHtml = ids => '<div class="tw-pending-bar" data-tw-pending="true"><p class="tw-pending-text"><strong>Changes pending: </strong>' + ids.join(', ') + ' excluded — results shown are from the previous run.</p>' +
      '<div class="tw-pending-actions"><button type="button" class="btn btn-sm tw-pending-update" data-tw-pending-update="data_hub-runAnalysis">Update prepared data</button>' +
      ids.map(id => '<button type="button" class="btn btn-sm tw-pending-undo" data-tw-pending-undo="' + id + '">Undo ' + id + '</button>').join('') + '</div></div>';
    const rerender = async (ids, focusSel) => {
      await page.evaluate(([html, sel]) => { if (sel) document.querySelector(sel).focus(); document.getElementById('team_pending_changes_bar').innerHTML = html; }, [barHtml(ids), focusSel]);
      return page.waitForFunction(() => document.activeElement !== document.body, null, {timeout: 2000}).then(() => page.evaluate(() => document.activeElement.dataset.twPendingUndo || document.activeElement.dataset.twPendingUpdate || document.activeElement.tagName)).catch(() => 'BODY');
    };
    await rerender(['S01', 'S02'], null);
    assert.equal(await rerender(['S01', 'S02'], '[data-tw-pending-undo="S02"]'), 'S02', 'focus returns to the same Undo');
    assert.equal(await rerender(['S01', 'S02', 'S03'], '.tw-pending-update'), 'data_hub-runAnalysis', 'focus returns to Update');
    assert.equal(await rerender(['S01'], '[data-tw-pending-undo="S03"]'), 'data_hub-runAnalysis', 'a removed Undo falls back to the first button');
    await page.evaluate(() => document.activeElement.blur());
    await page.evaluate(() => new Promise(r => setTimeout(r, 20)));
    await page.evaluate(() => { document.getElementById('team_pending_changes_bar').innerHTML =
      '<div class="tw-pending-bar" data-tw-pending="true"><p class="tw-pending-text"><strong>Changes pending: </strong>S01 excluded — results shown are from the previous run.</p>' +
      '<div class="tw-pending-actions"><button type="button" class="btn btn-sm tw-pending-update" data-tw-pending-update="data_hub-runAnalysis">Update prepared data</button>' +
      '<button type="button" class="btn btn-sm tw-pending-undo" data-tw-pending-undo="S01" aria-label="Undo exclusion of S01">Undo</button></div></div>'; });
    await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'focus outside the bar is never pulled into it');

    // Toasts: the two scheduling messages are never shown, with or without the bar; others stay.
    const notify = (id, html) => page.evaluate(([id, html]) => jq['shiny:message']({message:{notification:{type:'show',message:{html,id}}}}), [id, html]);
    const gone = id => page.waitForFunction(id => !document.getElementById('shiny-notification-' + id), id, {timeout: 2000}).then(() => true, () => false);
    await notify('sched', 'Exclusion scheduled. Update prepared data to apply it.');
    await page.evaluate(() => { toast('old','Some earlier warning.'); toast('sched',''); });
    assert.equal(await gone('sched'), true, 'an exclusion toast is removed (identified by its message event)');
    assert.equal(await page.locator('#shiny-notification-old').isVisible(), true, 'other toasts are kept');
    await page.evaluate(() => toast('restored1','Sample restored for the next preparation. Update prepared data to apply it.'));
    assert.equal(await gone('restored1'), true, 'a restore toast is removed (identified by its text)');

    // Step change: every remaining notification goes (messages, warnings, errors, fresh or not), except a
    // running progress and a fresh design-guard warning that explains the redirect it arrived with.
    const guardText = 'This tool currently uses an unpaired test. Use a validated repeated-measures analysis for matched samples; do not change the design label to bypass this check.';
    await page.evaluate(g => { toast('fresh','Redirected to Quality.'); toast('guard', g, 'shiny-notification-warning');
      toast('warn','Paired design needs a paired test.','shiny-notification-warning');
      toast('err','Update failed.','shiny-notification-error');
      toast('oldguard', g, 'shiny-notification-warning');
      toast('prog','<div id="shiny-progress-p1" class="shiny-progress-notification"><div class="progress-text">Preparing</div></div>');
      // Back-date the arrival stamp before the script stamps it (it keeps an existing one).
      document.getElementById('shiny-notification-oldguard').dataset.twShownAt = String(Date.now() - 5000); }, guardText);
    await page.evaluate(() => { document.body.dataset.guideStep = '4'; });
    assert.equal(await gone('old'), true, 'an earlier toast is dismissed on step change');
    assert.equal(await gone('fresh'), true, 'a fresh message toast is dismissed on step change too');
    assert.equal(await gone('warn'), true, 'a fresh warning that is not a design guard is dismissed');
    assert.equal(await gone('err'), true, 'a fresh error is dismissed');
    assert.equal(await gone('oldguard'), true, 'a design-guard warning older than 1.5 s is dismissed');
    assert.equal(await page.locator('#shiny-notification-guard').isVisible(), true, 'a fresh design-guard warning survives the step change');
    assert.equal(await page.locator('#shiny-notification-prog').isVisible(), true, 'a progress toast survives the step change');
    await page.evaluate(() => ['guard','prog'].forEach(id => document.getElementById('shiny-notification-' + id).remove()));
    // The kept texts are the guards' own: each one is shown by R/frontends/team/guided_workflow.R.
    const guardsSrc = /var GUARDS=\[([\s\S]*?)\];/.exec(fs.readFileSync(path.resolve('www/team/js/pending_changes_bar.js'), 'utf8'))[1];
    const guards = [...guardsSrc.matchAll(/'([^']+)'/g)].map(m => m[1]);
    const workflow = fs.readFileSync(path.resolve('R/frontends/team/guided_workflow.R'), 'utf8');
    assert.equal(guards.length, 5);
    for (const g of guards) assert.ok(workflow.includes("showNotification('" + g), 'guard text is shown by guided_workflow.R: ' + g);

    // After updating, the bar clears and Continue is restored.
    await page.evaluate(() => { document.getElementById('team_pending_changes_bar').innerHTML = ''; });
    await page.waitForFunction(() => !document.body.classList.contains('tw-changes-pending'));
    assert.equal(await continueBtn.getAttribute('aria-disabled'), null);
    assert.equal(await continueBtn.textContent(), 'Continue with the previous applied run →');
    assert.equal(await page.locator('#tw-continue-reason').count(), 0);
    await continueBtn.click();
    assert.deepEqual(await page.evaluate(() => sent.filter(x => x[0]==='guide_step')), [['guide_step', 4]]);

    // Without the bar (e.g. invalid settings) an exclusion toast is still never shown.
    await notify('sched2', 'Exclusion scheduled. Update prepared data to apply it.');
    await page.evaluate(() => toast('sched2',''));
    assert.equal(await gone('sched2'), true, 'no exclusion toast without the bar');

    // Undo of the last exclusion: the restore toast arrives, then the bar goes; it never reappears.
    await page.evaluate(() => { document.getElementById('team_pending_changes_bar').innerHTML =
      '<div class="tw-pending-bar" data-tw-pending="true"><p class="tw-pending-text"><strong>Changes pending: </strong>S01 excluded — results shown are from the previous run.</p></div>'; });
    await page.waitForFunction(() => document.body.classList.contains('tw-changes-pending'));
    await page.evaluate(() => toast('restored2','Sample restored for the next preparation. Update prepared data to apply it.'));
    await page.evaluate(() => { document.getElementById('team_pending_changes_bar').innerHTML = ''; });
    await page.waitForFunction(() => !document.body.classList.contains('tw-changes-pending'));
    await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
    assert.equal(await page.locator('#shiny-notification-restored2').count(), 0, 'the restore toast does not come back after the bar goes');
    assert.equal(await page.locator('#shiny-notification-panel .shiny-notification:visible').count(), 0, 'no toast is visible');
    console.log('PASS: pending changes bar replaces toasts and blocks Continue until update');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
