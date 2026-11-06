// Run with: node tests/dual-ui/test_team_quick_wins.cjs
// Team wave-1 quick wins: <html lang>/single h1, AA text contrast, Plot controls in
// place of the lone sidebar chevron, and group colours on the guided Quality PCA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

function ratio(a, b) {
  const lum = c => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Wiring: Team links its fonts itself (no bslib font dependency) and registers the new assets.
const teamUi = fs.readFileSync('R/frontends/team/ui.R', 'utf8');
assert.ok(!/font_google\(/.test(teamUi), 'Team theme carries no bslib font dependency');
assert.match(teamUi, /fonts\.googleapis\.com\/css2\?family=Nunito\+Sans&family=Cormorant\+Garamond/);
for (const asset of ['css/qw_contrast.css', 'css/qw_a11y.css', 'js/qw_a11y.js', 'js/qw_plot_controls.js', 'js/qw_pca_groups.js'])
  assert.ok(teamUi.includes(`"www/team/${asset}"`), asset + ' is registered in the Team head');
assert.match(teamUi, /if \(!team_workspace_enabled\(\)\) includeScript\("www\/team\/js\/qw_pca_groups\.js"\)/, 'guided PCA groups never collide with review_shell.js');

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // ---- lang and exactly one h1 ----------------------------------------------------
    let page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head></head><body>
      <div class="bslib-sidebar-layout"><div class="main">
        <nav id="guide-navigation"><button data-guide-step="3" aria-current="step"><span>3</span>Quality</button></nav>
        <section class="guide-page"><div class="guide-heading"><h2>Check quality and prepare your data</h2></div></section>
        <section id="ws" hidden><h1>From samples to insight</h1></section>
      </div></div></body></html>`);
    await page.addStyleTag({path: path.resolve('www/team/css/qw_a11y.css')});
    await page.addScriptTag({path: path.resolve('www/team/js/qw_a11y.js')});
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    const visibleH1 = () => page.evaluate(() => Array.from(document.querySelectorAll('h1')).filter(h => h.getClientRects().length).map(h => h.textContent));
    assert.deepEqual(await visibleH1(), ['Lipidomic Explorer: Check quality and prepare your data'], 'a hidden screen-name h1 fills the gap');
    // axe "region": without a main landmark the h1 sits in a top-level <header> (banner).
    const h1Landmark = () => page.locator('#team-page-title').evaluate(h => {
      const p = h.parentElement;
      return p.tagName === 'HEADER' && p.parentElement === document.body ? 'banner' : (p.matches('main,[role="main"]') ? 'main' : 'none');
    });
    assert.equal(await h1Landmark(), 'banner', 'the h1 lives in a banner landmark when there is no main');
    assert.equal(await page.locator('header').count(), 1, 'one banner');
    await page.evaluate(() => { document.getElementById('ws').hidden = false; });
    await page.waitForFunction(() => document.getElementById('team-page-title').hidden);
    assert.deepEqual(await visibleH1(), ['From samples to insight'], 'a visible page h1 is never duplicated');
    await page.evaluate(() => { document.getElementById('ws').hidden = true; document.querySelector('.guide-page').remove(); });
    await page.waitForFunction(() => !document.getElementById('team-page-title').hidden);
    assert.deepEqual(await visibleH1(), ['Lipidomic Explorer: Quality'], 'falls back to the current step label');
    await page.evaluate(() => { const s = document.createElement('section'); s.className = 'team-library'; s.innerHTML = '<h3>Project library</h3><div class="team-library-login">Sign in</div>'; document.querySelector('.main').appendChild(s); });
    await page.waitForFunction(() => document.getElementById('team-page-title').textContent === 'Lipidomic Explorer: Sign in');
    // axe "heading-order": h1 then the sign-in h3 would skip level 2.
    await page.waitForFunction(() => document.querySelector('.team-library > h3').getAttribute('aria-level') === '2');
    assert.equal(await page.locator('.team-library > h3').getAttribute('role'), 'heading');
    await page.evaluate(() => document.querySelector('.main').setAttribute('role', 'main'));
    await page.waitForFunction(() => document.getElementById('team-page-title').parentElement.matches('[role="main"]'));
    assert.equal(await h1Landmark(), 'main', 'with a main landmark the h1 moves into it');
    assert.equal(await page.locator('header, #team-page-banner').count(), 0, 'the fallback banner is removed');
    assert.deepEqual(await visibleH1(), ['Lipidomic Explorer: Sign in'], 'still exactly one h1');
    await page.evaluate(() => { const h = document.createElement('h2'); h.textContent = 'Workspace'; document.querySelector('.team-library').before(h); });
    await page.waitForFunction(() => !document.querySelector('.team-library > h3').hasAttribute('aria-level'));
    assert.equal(await page.locator('.team-library > h3').getAttribute('role'), null, 'a real h2 before it restores the plain h3');
    await page.close();

    // ---- contrast ---------------------------------------------------------------------
    page = await browser.newPage();
    await page.setContent(`<!doctype html><body style="background:#fff">
      <style>.btn{color:var(--bs-btn-color)}.btn-default{--bs-btn-color:#57819f}</style>
      <div class="guide-panel" style="background:#fff"><span class="btn btn-default btn-file">Browse…</span></div>
      <aside class="companion-speech" style="background:#fffdf7"><span class="speech-eyebrow">YOU ARE HERE · 3 / 7</span></aside>
      <div class="targeted-scope-pill"><button class="btn btn-sm targeted-scope-segment targeted-scope-targeted is-inactive"><span>Single Lipid Analysis Mode</span><span class="ms-1 targeted-pill-num">(0)</span></button><button class="btn btn-sm targeted-scope-edit"><span>Edit</span></button></div>
    </body>`);
    await page.addStyleTag({path: path.resolve('www/team/css/custom.css')});
    await page.addStyleTag({path: path.resolve('www/team/css/context_help.css')});
    await page.addStyleTag({path: path.resolve('www/team/css/qw_contrast.css')});
    // custom.css gives .btn "transition: all 0.15s" and these sheets arrive after first paint
    // (in the app they load in <head>), so settle the colour transition before reading it.
    const color = sel => page.locator(sel).evaluate(n => { n.getAnimations().forEach(a => a.finish()); return getComputedStyle(n).color; });
    assert.ok(ratio(await color('.btn-file'), 'rgb(255,255,255)') >= 4.5, 'file input text');
    assert.ok(ratio(await color('.speech-eyebrow'), 'rgb(255,253,247)') >= 4.5, 'speech eyebrow');
    assert.ok(ratio(await color('.targeted-scope-segment'), 'rgb(241,245,249)') >= 4.5, 'scope segment');
    assert.ok(ratio(await color('.targeted-scope-edit'), 'rgb(241,245,249)') >= 4.5, 'scope edit');
    assert.equal(await page.locator('.targeted-pill-num').evaluate(n => getComputedStyle(n).opacity), '1', 'the count is not faded below AA');
    await page.close();

    // ---- Plot controls instead of a lone chevron ---------------------------------------
    page = await browser.newPage({viewport: {width: 1440, height: 900}});
    await page.setContent(`<!doctype html><body class="guided-app" data-guide-analysis="true">
      <div class="bslib-sidebar-layout ts-has-main-sidebar sidebar-collapsed"><aside id="main_sidebar" class="sidebar"></aside>
        <button class="collapse-toggle" aria-expanded="false" aria-controls="main_sidebar">›</button>
        <div class="main"><div id="guide-analysis-toolbar"><button id="guide-narrow-controls" class="guide-button guide-narrow-controls" aria-expanded="false" aria-controls="main_sidebar">Plot controls</button></div></div></div>
      <script>window.toggled=0;window.drawer=0;
        document.querySelector('.collapse-toggle').addEventListener('click',function(){window.toggled++;var l=this.parentElement,open=l.classList.contains('sidebar-collapsed');l.classList.toggle('sidebar-collapsed',!open);this.setAttribute('aria-expanded',String(open));});
        document.getElementById('guide-narrow-controls').onclick=function(){window.drawer++;};</script></body>`);
    await page.addStyleTag({content: '.guide-narrow-controls{display:none}.bslib-sidebar-layout > .collapse-toggle{display:flex !important}'});
    await page.addStyleTag({path: path.resolve('www/team/css/qw_a11y.css')});
    await page.addScriptTag({path: path.resolve('www/team/js/qw_plot_controls.js')});
    await page.waitForFunction(() => document.body.classList.contains('qw-plot-controls-proxy'));
    assert.equal(await page.locator('.collapse-toggle').isVisible(), false, 'no chevron without a visible sidebar');
    assert.equal(await page.locator('#guide-narrow-controls').isVisible(), true, 'the sidebar stays reachable from the toolbar');
    await page.locator('#guide-narrow-controls').click();
    assert.equal(await page.evaluate(() => [window.toggled, window.drawer].join()), '1,0', 'the button drives the bslib toggle, not the narrow drawer');
    await page.waitForFunction(() => document.getElementById('guide-narrow-controls').getAttribute('aria-expanded') === 'true');
    assert.equal(await page.locator('.collapse-toggle').isVisible(), true, 'with a real open sidebar the chevron is kept');
    await page.setViewportSize({width: 390, height: 800});
    await page.waitForFunction(() => !document.body.classList.contains('qw-plot-controls-proxy'));
    await page.close();

    // ---- guided Quality PCA coloured by group ------------------------------------------
    page = await browser.newPage();
    await page.setContent(`<!doctype html><body><div id="guide-qc-review"><div id="qc_pca_tab-guided_qc_plot"></div></div>
      <script>window.handlers={};window.restyles=[];window.Shiny={addCustomMessageHandler:(n,f)=>handlers[n]=f};
        window.jQuery=function(){return {on:function(){return this;}}};
        var g=document.getElementById('qc_pca_tab-guided_qc_plot');g.data=[{customdata:['S1','S2','S3'],marker:{color:'#176b73'}}];g.on=function(){};
        window.Plotly={restyle:function(el,update){restyles.push(update);el.data[0].marker.color=update['marker.color'][0];}};</script></body>`);
    await page.addStyleTag({path: path.resolve('www/team/css/qw_a11y.css')});
    await page.addScriptTag({path: path.resolve('www/team/js/qw_pca_groups.js')});
    await page.evaluate(() => handlers['team-review-groups']({column: 'Group1', levels: ['Control', 'Treated <b>'], samples: {S1: 'Control', S2: 'Treated <b>', S3: 'Control'}, colors: {Control: '#1b9e77', 'Treated <b>': '#d95f02'}}));
    await page.waitForFunction(() => restyles.length === 1);
    assert.deepEqual(await page.evaluate(() => restyles[0]['marker.color'][0]), ['#1b9e77', '#d95f02', '#1b9e77']);
    assert.deepEqual(await page.locator('.qw-pca-legend li').allTextContents(), ['Control 2', 'Treated <b> 1'], 'legend names each group as text');
    assert.equal(await page.locator('.qw-pca-legend').getAttribute('aria-label'), 'Sample groups');
    await page.evaluate(() => handlers['team-review-groups']({column: 'Group1', levels: ['Control'], samples: {S1: 'Control'}, colors: {Control: '#1b9e77'}}));
    await page.waitForFunction(() => restyles.length === 2);
    assert.equal(await page.evaluate(() => restyles[1]['marker.color'][0][1]), '#9aa5b1', 'samples without a group stay neutral');
    // Group names that are also Object.prototype keys count as ordinary groups.
    await page.evaluate(() => handlers['team-review-groups']({column: 'Group1', levels: ['constructor', 'toString'], samples: {S1: 'constructor', S2: 'toString', S3: 'constructor'}, colors: {constructor: '#1b9e77', toString: '#d95f02'}}));
    await page.waitForFunction(() => restyles.length === 3);
    assert.deepEqual(await page.locator('.qw-pca-legend li').allTextContents(), ['constructor 2', 'toString 1'], 'prototype-named groups are counted');
    assert.deepEqual(await page.evaluate(() => restyles[2]['marker.color'][0]), ['#1b9e77', '#d95f02', '#1b9e77']);
    await page.close();
  } finally {
    await browser.close();
  }
  console.log('PASS: Team quick wins (lang/h1, contrast, plot controls, guided PCA groups)');
})().catch(err => { console.error(err); process.exit(1); });
