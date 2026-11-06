// Run with: node tests/dual-ui/test_team_tool_header.cjs
// R4: an analysis tool opened from Team has one header. The Classic sub-tab row, the Analytical
// Ensemble bar, the "Tab info" toggle and the quick-access rows are hidden, and one Team bar at the
// top of the tool card offers each of them (View, Lipids, About this view, Shortcuts) by clicking
// the original control. The chart title starts above 300 px at 1440 in both Team modes (guided
// steps and the Canvas workspace shell), the page uses only Team fonts, every hidden control stays
// reachable by mouse and keyboard, and nothing is hidden when the bar cannot offer it.
// Real tool_header.js and the Team stylesheets in their app order (R/frontends/team/ui.R); the
// stand-ins below replace Bootstrap/bslib, app.js pill routing and the scope uiOutput.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

// Wiring: one separate statement in the Team head, for both Team modes.
const teamUi = fs.readFileSync('R/frontends/team/ui.R', 'utf8');
assert.match(teamUi, /^ *tagList\(includeCSS\("www\/team\/css\/tool_header\.css"\), includeScript\("www\/team\/js\/tool_header\.js"\)\),$/m, 'tool_header assets are registered on their own line');

// Strip @import (the fonts fetch) by its quoted URL: libreros.css imports `...wght@400;500...`, and
// cutting at that `;` leaves a stray string that swallows its :root tokens (--lab-body and the rest).
const css = name => fs.readFileSync(path.resolve(`www/team/css/${name}.css`), 'utf8').replace(/@import\s+(?:url\(\s*)?(['"])[^'"]*\1\s*\)?[^;]*;/g, '');
const GUIDED_CSS = ['custom', 'libreros', 'guided', 'context_help', 'qw_contrast', 'qw_a11y', 'qw_layers', 'tool_header'];
const WORKSPACE_CSS = GUIDED_CSS.concat(['workspace', 'workspace_minimal', 'canvas_viewport', 'shell']);
const VIEWS = ['Unfiltered Heatmap', 'Filtered Heatmap', 'Violin View'];
const TEAM_FONTS = ['Nunito Sans', 'Cormorant Garamond', 'IBM Plex Mono'];

const standIns = `*,::before,::after{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui}button,input,select{font:inherit;margin:0}
h1,h2,h3,h4,h5,h6{font-family:'Cormorant Garamond',serif;font-weight:500;line-height:1.2;margin:0 0 .5rem}
.d-flex{display:flex!important}.align-items-center{align-items:center!important}.justify-content-between{justify-content:space-between!important}.justify-content-end{justify-content:flex-end!important}
.gap-2{gap:.5rem!important}.gap-3{gap:1rem!important}.py-1{padding-top:.25rem!important;padding-bottom:.25rem!important}.mb-0{margin-bottom:0!important}.mb-2{margin-bottom:.5rem!important}.mt-2{margin-top:.5rem!important}.pe-3{padding-right:1rem!important}
.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important}
.collapse:not(.show){display:none}.tab-content>.tab-pane{display:none}.tab-content>.active{display:block}
.navbar{display:flex;align-items:center;padding:.5rem 1rem}.navbar>.container-fluid{display:flex;align-items:center;width:100%}.navbar-brand{padding:.3125rem 0;margin-right:1rem}
.btn{display:inline-block;padding:.375rem .75rem;border:1px solid transparent;border-radius:.375rem;line-height:1.5}.btn-sm{padding:.25rem .5rem;font-size:.875rem}
.card{display:flex;flex-direction:column;min-width:0}.card-header{padding:.5rem 1rem}.card-body{flex:1 1 auto;padding:1rem}
.form-select{display:block;width:100%;padding:.375rem 2.25rem .375rem .75rem;line-height:1.5;border:1px solid #dee2e6}
.bslib-sidebar-layout{display:grid;grid-template-columns:0 minmax(0,1fr)}.bslib-sidebar-layout>#main_sidebar{grid-column:1;grid-row:1}
.bslib-sidebar-layout>.main{grid-column:2;grid-row:1;display:flex;flex-direction:column;gap:1.5rem;padding:1.5rem;min-width:0}`;

const STEPS = ['Experiment', 'Design', 'Quality', 'My question', 'Results', '3D Show', 'Share'];
function html(workspace) {
  const bodyAttrs = workspace
    ? 'class="guided-app team-workspace-app ts-shell-app ts-has-workspace" data-tw-screen="canvas" data-team-authenticated="true" data-team-stage="canvas"'
    : 'class="guided-app"';
  return `<!doctype html><html lang="en"><head><style>${standIns}</style></head>
<body ${bodyAttrs} data-guide-step="5" data-guide-goal="overview" data-guide-analysis="true">
<nav class="navbar"><div class="container-fluid"><a class="navbar-brand" href="#"><div class="guide-brand-lockup"><img id="navbar_brand_logo_img" class="navbar-brand-logo-full" alt="Libreros Lab" width="120" height="54" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><span class="guide-app-name">LIPIDOMIC EXPLORER</span></div></a></div></nav>
<div class="bslib-sidebar-layout ts-has-main-sidebar sidebar-collapsed"><aside id="main_sidebar" class="sidebar sidebar-collapsed"></aside><div class="main">
  ${workspace ? '<section id="team-workspace"><div class="tw-top"><button type="button" class="tw-signout">Sign out</button></div><nav class="tw-steps"><button type="button" data-tw-stage="canvas" aria-current="step"><strong>Canvas</strong></button></nav></section>' : ''}
  <div id="guide-navigation"><nav aria-label="Analysis workflow">${STEPS.map((s, i) => `<button type="button" data-guide-step="${i + 1}" class="guide-step" aria-current="${i === 4 ? 'step' : 'false'}"><span>${i + 1}</span>${s}</button>`).join('')}</nav>
    <div class="guide-global-actions"><button type="button" class="guide-button" data-guide-step="5">All analysis tools</button><button type="button" class="guide-button" data-guide-tool="App Info">Help &amp; methods</button></div></div>
  <div id="guide-context"><div id="guide_context" class="shiny-html-output"><div class="guide-run-summary"><div class="guide-run-top"><div class="guide-run-counts"><strong>12 lipids</strong><span>·</span><strong>8 samples</strong></div><span class="guide-run-status">Analysis ready</span><details class="guide-method-details"><summary>Preparation details</summary><div class="guide-method-copy"><p>Median normalization.</p></div></details></div></div></div></div>
  <div class="lipid-help-bar" id="lipidomic-help-bar"><button type="button" class="lipid-help-trigger help-context-button" id="lipidomic-context-help">About Heatmap</button><button type="button" class="help-text-button" id="lipidomic-tour">Seven-step tour</button><button type="button" class="help-text-button help-bar-settings" aria-label="Customize companion">Companion</button></div>
  <div id="guide-analysis-toolbar"><button type="button" class="guide-button" data-guide-step="4">← Question</button><div class="form-group shiny-input-container"><label class="control-label" for="guide_tool"><span class="visually-hidden">Analysis tool</span></label><select id="guide_tool" class="shiny-input-select form-select"><option value="Heatmap" selected>Heatmap</option></select></div><button type="button" class="guide-button" data-guide-step="3">Quality</button><button type="button" class="guide-button" data-guide-step="7" id="share-results">Share results</button></div>
  <div id="tertiary_subsubtab_bar" class="tertiary-horizontal-subsubnavbar" data-workflow="quantitative"><div class="subsubnavbar-container"><svg class="dendrogram-canvas"></svg><div class="subsubnavbar-pills-wrapper"><div class="subsubnavbar-category-label"><span class="subsub-parent-name">Heatmap</span></div><div class="subsubnavbar-pills-list">${VIEWS.map((v, i) => `<button type="button" class="subsubtab-pill${i ? '' : ' active'}" data-subtab="Heatmap" data-target="${v}"><i class="fas"></i><span>${v}</span></button>`).join('')}</div></div></div></div>
  <div id="targeted_lipids_top_dock" class="targeted-lipids-top-dock d-flex justify-content-end align-items-center mb-2 pe-3"><div id="targeted_lipids_hub-scope_pill_ui" class="shiny-html-output"></div></div>
  <div class="tab-content" data-tabsetid="1"><div class="tab-pane" data-value="Experiment"><p>Experiment</p></div><div class="tab-pane active" data-value="Heatmap">
    <div style="min-height:400px;padding-bottom:12px;margin-bottom:15px;position:relative;overflow:hidden">
      <div id="heatmap_barchart_tab-intro_collapse_wrapper" class="tab-intro-wrapper mb-2">
        <div class="d-flex align-items-center justify-content-between tab-intro-permanent-header py-1"><div class="d-flex align-items-center gap-3"><h5 class="fw-bold mb-0 tab-intro-permanent-title">Heatmap</h5><button id="heatmap_barchart_tab-intro_collapse_btn" class="btn btn-sm tab-intro-pill-btn" type="button" data-bs-toggle="collapse" data-bs-target="#heatmap_barchart_tab-intro_collapse_body" aria-expanded="false" aria-controls="heatmap_barchart_tab-intro_collapse_body"><span class="tab-intro-btn-label">Tab info</span></button></div></div>
        <div id="heatmap_barchart_tab-intro_collapse_body" class="collapse tab-intro-drawer-collapse mt-2"><div class="card tab-intro-drawer-card"><p class="text-muted small mb-2">This module provides interactive clustering of lipid abundance profiles.</p></div></div>
      </div>
      <div class="heatmap-card-tabs hide-redundant-nav-tabs"><div class="card bslib-card"><div class="card-header"><ul class="nav nav-tabs"><li><a data-bs-toggle="tab" data-value="Unfiltered Heatmap">Unfiltered Heatmap</a></li></ul></div><div class="card-body"><div class="tab-content"><div class="tab-pane active" data-value="Unfiltered Heatmap">
        <div class="quick-access-strip mb-2.5 mt-2"><span class="quick-access-label">Quick Access:</span><button type="button" class="btn-quick-access" onclick="window.quick.push('scaling')">Scaling Mode (Z / Rel)</button><button type="button" class="btn-quick-access" onclick="window.quick.push('aesthetics')">Bottom Menu: Advanced Aesthetics</button></div>
        <div class="card" id="chart-card"><div class="card-header d-flex justify-content-between align-items-center"><span id="chart-title">Unfiltered Heatmap</span><div><button type="button" class="btn btn-sm btn-outline-secondary">Data</button><button type="button" class="btn btn-sm btn-outline-secondary">PDF</button></div></div><div class="card-body"><div style="height:500px;background:#fff"></div></div></div>
      </div><div class="tab-pane" data-value="Filtered Heatmap"></div><div class="tab-pane" data-value="Violin View"></div></div></div></div></div>
    </div>
  </div></div>
</div></div>
<script>
  window.quick = []; window.pillClicks = []; window.scopeClicks = [];
  // The scope uiOutput (R/modules/utils_targeted_lipids.R markup); the server re-renders it after a click.
  window.renderScope = function (targeted) {
    document.getElementById('targeted_lipids_hub-scope_pill_ui').innerHTML = '<div class="targeted-scope-bar d-flex align-items-center gap-2"><div class="targeted-scope-label-wrapper"><span class="targeted-scope-label text-uppercase">Analytical Ensemble:</span></div><div class="targeted-scope-pill d-inline-flex align-items-center shadow-sm">'
      + '<button id="targeted_lipids_hub-btn_scope_all" type="button" class="btn btn-sm targeted-scope-segment targeted-scope-all ' + (targeted ? 'is-inactive' : 'is-active') + '" title="Full Dataset" onclick="scopeClicks.push(\\'all\\');setTimeout(function(){renderScope(false)},0)"><span class="fw-bold">All</span><span class="ms-1 targeted-pill-num">(12)</span></button>'
      + '<button id="targeted_lipids_hub-btn_scope_targeted" type="button" class="btn btn-sm targeted-scope-segment targeted-scope-targeted ' + (targeted ? 'is-active' : 'is-inactive') + '" title="Single Lipid Analysis Mode" onclick="scopeClicks.push(\\'targeted\\');setTimeout(function(){renderScope(true)},0)"><span class="fw-bold">Single Lipid Analysis Mode</span><span class="ms-1 targeted-pill-num">(0)</span></button>'
      + '<button id="targeted_lipids_hub-btn_scope_edit" type="button" class="btn btn-sm targeted-scope-edit" title="Configure Cohort" onclick="scopeClicks.push(\\'edit\\')"><span class="fw-semibold">Edit</span></button></div></div>';
  };
  renderScope(false);
  // app.js routes a sub-tab pill click (delegated on document) and marks the pill active.
  document.addEventListener('click', function (e) {
    var pill = e.target.closest('#tertiary_subsubtab_bar .subsubtab-pill');
    if (pill) { pillClicks.push(pill.dataset.target); document.querySelectorAll('#tertiary_subsubtab_bar .subsubtab-pill').forEach(function (p) { p.classList.toggle('active', p === pill); }); }
    // Bootstrap's collapse data API (delegated on document; it also acts on a hidden trigger).
    var t = e.target.closest('[data-bs-toggle=collapse]');
    if (t) { var body = document.querySelector(t.dataset.bsTarget), open = !body.classList.contains('show');
      body.dispatchEvent(new Event(open ? 'show.bs.collapse' : 'hide.bs.collapse', {bubbles: true}));
      body.classList.toggle('show', open); t.setAttribute('aria-expanded', String(open));
      body.dispatchEvent(new Event(open ? 'shown.bs.collapse' : 'hidden.bs.collapse', {bubbles: true})); }
  });
</script>
</body></html>`;
}

const probe = `window.__v = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  window.__r = el => { const r = el.getBoundingClientRect(); return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height}; };
  window.__name = el => (el.getAttribute('aria-label') || el.textContent).replace(/\\s+/g, ' ').trim();
  window.__frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`;

async function open(browser, {width, height = 900, workspace = false}) {
  const page = await browser.newPage({viewport: {width, height}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setContent(html(workspace));
  for (const name of workspace ? WORKSPACE_CSS : GUIDED_CSS) await page.addStyleTag({content: css(name)});
  await page.addScriptTag({path: path.resolve('www/team/js/tool_header.js')});
  await page.addScriptTag({content: probe});
  await page.waitForSelector('.r4-tool-head');
  await page.evaluate(() => __frames());
  return {page, errors};
}
const bar = page => page.evaluate(() => {
  const head = document.querySelector('.r4-tool-head');
  return {
    inCard: !!head.closest('.tab-pane[data-value="Heatmap"]'), firstInWrapper: head.parentElement.matches('.tab-intro-wrapper') && head.parentElement.firstElementChild === head,
    title: __name(head.querySelector('.r4-tool-title')), titleFont: getComputedStyle(head.querySelector('.r4-tool-title')).fontFamily,
    groups: Array.from(head.querySelectorAll('[role=group]')).map(g => ({label: g.getAttribute('aria-label'), buttons: Array.from(g.querySelectorAll('button')).map(b => ({name: __name(b), pressed: b.getAttribute('aria-pressed')}))})),
    tools: Array.from(head.querySelectorAll('.r4-end button')).map(b => ({name: __name(b), expanded: b.getAttribute('aria-expanded'), controls: b.getAttribute('aria-controls')})),
    rect: __r(head)
  };
});
// Exact names: hasText is a case-insensitive substring ("Unfiltered Heatmap" contains "filtered heatmap").
const exact = name => new RegExp('^' + name.replace(/[.*+?^$|()[\]{}\\]/g, '\\$&') + '$');
const proxy = (page, name) => page.locator('.r4-tool-head button').filter({hasText: exact(name)});
// Every visible bar button is on screen, uncovered (its centre hits itself) and clear of the other key rows.
const unobstructed = page => page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('.r4-tool-head button')).filter(__v);
  const others = Array.from(document.querySelectorAll('#guide-analysis-toolbar button, #guide-analysis-toolbar select, #guide-navigation button, #lipidomic-help-bar button, #chart-card .card-header button')).filter(__v);
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  return buttons.map(b => { const r = __r(b), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2, at = document.elementFromPoint(x, y);
    return {name: __name(b), onScreen: r.left >= 0 && r.right <= innerWidth && r.top >= 0, covered: !(at && at.closest('button') === b), overlaps: others.filter(o => hit(r, __r(o))).map(__name)}; });
});
function ratio(a, b) {
  const lum = c => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const colours = page => page.evaluate(() => {
  const bg = el => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
  return Array.from(document.querySelectorAll('.r4-tool-head button, .r4-tool-head .r4-group-label, .r4-tool-head .r4-tool-title')).filter(__v).map(el => ({name: __name(el), fg: getComputedStyle(el).color, bg: bg(el)}));
});

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // ---- 1440, guided Team: one header, the originals hidden, the chart title above 300 px ------
    let {page, errors} = await open(browser, {width: 1440});
    let b = await bar(page);
    assert.ok(b.inCard && b.firstInWrapper, 'the bar is the first row of the tool card (in place of the Tab info row)');
    assert.equal(b.title, 'Heatmap');
    assert.match(b.titleFont, /^"?Cormorant Garamond/, 'the tool name uses the Team heading face');
    assert.deepEqual(b.groups, [
      {label: 'View', buttons: [{name: 'Unfiltered Heatmap', pressed: 'true'}, {name: 'Filtered Heatmap', pressed: 'false'}, {name: 'Violin View', pressed: 'false'}]},
      {label: 'Lipids', buttons: [{name: 'All (12)', pressed: 'true'}, {name: 'Selected (0)', pressed: 'false'}, {name: 'Edit selection', pressed: null}]}
    ]);
    assert.deepEqual(b.tools, [{name: 'About this view', expanded: 'false', controls: 'heatmap_barchart_tab-intro_collapse_body'}, {name: 'Shortcuts', expanded: 'false', controls: null}]);
    const hidden = await page.evaluate(() => ['#tertiary_subsubtab_bar', '#targeted_lipids_top_dock', '.tab-intro-permanent-header', '.tab-intro-pill-btn', '.quick-access-strip'].map(s => [s, __v(document.querySelector(s))]));
    assert.deepEqual(hidden, hidden.map(([s]) => [s, false]), 'the Classic sub-tabs, ensemble bar, Tab info and quick access are hidden');
    let geo = await page.evaluate(() => ({title: __r(document.getElementById('chart-title')), card: __r(document.getElementById('chart-card')), bar: __r(document.querySelector('.r4-tool-head')), toolbar: __r(document.getElementById('guide-analysis-toolbar'))}));
    assert.ok(geo.title.top < 300 && geo.card.top < 300, `the chart title starts above 300 px at 1440 (title ${geo.title.top}, card ${geo.card.top})`);
    assert.ok(geo.bar.top >= geo.toolbar.bottom - 1 && geo.bar.bottom <= geo.card.top + 1, 'the bar sits between the toolbar and the chart card');
    const headings = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(__v).filter(h => /Heatmap/.test(h.textContent)).map(h => h.tagName));
    assert.deepEqual(headings, ['H2'], 'one heading names the tool');
    // Team typography across the page: every visible text box uses a Team face.
    const fonts = await page.evaluate(() => {
      const out = new Set();
      document.querySelectorAll('body *').forEach(el => {
        if (el.closest('svg,script,style') || !__v(el)) return;
        if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return;
        out.add(getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() + ' <' + el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + '>');
      });
      return Array.from(out);
    });
    const foreign = fonts.filter(f => !TEAM_FONTS.some(t => f.startsWith(t + ' <')));
    assert.deepEqual(foreign, [], `only Team faces on the page (${fonts.join('; ')})`);
    for (const c of await colours(page)) assert.ok(ratio(c.fg, c.bg) >= 4.5, `${c.name}: ${c.fg} on ${c.bg} is at least 4.5:1`);
    for (const u of await unobstructed(page)) assert.ok(u.onScreen && !u.covered && !u.overlaps.length, `${u.name} is on screen and unobstructed at 1440 (${JSON.stringify(u)})`);

    // ---- Every hidden control stays reachable through the bar -----------------------------------
    await proxy(page, 'Filtered Heatmap').click();
    await page.waitForFunction(() => document.querySelector('.r4-tool-head [data-r4-view="Filtered Heatmap"]').getAttribute('aria-pressed') === 'true');
    assert.deepEqual(await page.evaluate(() => pillClicks), ['Filtered Heatmap'], 'View clicks the original sub-tab pill');
    assert.equal(await page.evaluate(() => document.querySelector('.r4-tool-head [data-r4-view="Unfiltered Heatmap"]').getAttribute('aria-pressed')), 'false');

    await proxy(page, 'Selected (0)').click();
    await page.waitForFunction(() => document.querySelector('.r4-tool-head [data-r4-scope="targeted_lipids_hub-btn_scope_targeted"]').getAttribute('aria-pressed') === 'true');
    await proxy(page, 'Edit selection').click();
    assert.deepEqual(await page.evaluate(() => scopeClicks), ['targeted', 'edit'], 'Lipids clicks the original scope buttons, including Edit');
    assert.equal(await page.evaluate(() => document.querySelector('.r4-tool-head [data-r4-scope="targeted_lipids_hub-btn_scope_all"]').getAttribute('aria-pressed')), 'false', 'the scope state follows the server re-render');

    await proxy(page, 'About this view').click();
    await page.waitForFunction(() => document.querySelector('.r4-tool-head [data-r4-about]').getAttribute('aria-expanded') === 'true');
    assert.equal(await page.evaluate(() => __v(document.getElementById('heatmap_barchart_tab-intro_collapse_body'))), true, 'About this view opens the Tab info drawer');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.r4About), 'true', 'focus stays on About this view');
    let drawer = await page.evaluate(() => ({bar: __r(document.querySelector('.r4-tool-head')), body: __r(document.getElementById('heatmap_barchart_tab-intro_collapse_body'))}));
    assert.ok(drawer.body.top >= drawer.bar.bottom - 1, 'the drawer opens under the bar');
    await proxy(page, 'About this view').click();
    await page.waitForFunction(() => document.querySelector('.r4-tool-head [data-r4-about]').getAttribute('aria-expanded') === 'false');

    await proxy(page, 'Shortcuts').click();
    await page.waitForFunction(() => document.querySelector('.r4-tool-head [data-r4-shortcuts]').getAttribute('aria-expanded') === 'true');
    assert.equal(await page.evaluate(() => __v(document.querySelector('.quick-access-strip'))), true, 'Shortcuts shows the quick-access row');
    await page.locator('.btn-quick-access', {hasText: 'Scaling Mode'}).click();
    assert.deepEqual(await page.evaluate(() => quick), ['scaling'], 'a quick-access shortcut still works');
    await proxy(page, 'Shortcuts').click();
    await page.waitForFunction(() => !__v(document.querySelector('.quick-access-strip')));

    // ---- Keyboard: Tab walks from the toolbar into the bar, with a visible focus ring -----------
    await page.focus('#share-results');
    const order = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return {name: __name(a), inBar: !!a.closest('.r4-tool-head'), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2}; }));
    }
    assert.deepEqual(order.map(o => o.name), ['Unfiltered Heatmap', 'Filtered Heatmap', 'Violin View', 'All (12)', 'Selected (0)', 'Edit selection', 'About this view', 'Shortcuts'], 'every bar control is in the Tab order, right after the toolbar');
    assert.ok(order.every(o => o.inBar && o.ring), 'each has a visible focus ring');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.r4-tool-head [data-r4-about]').getAttribute('aria-expanded') === 'true');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.r4About), 'true', 'Enter on About this view opens it and keeps focus');

    // ---- Nothing is hidden that the bar cannot offer ---------------------------------------------
    await page.evaluate(() => { document.getElementById('tertiary_subsubtab_bar').style.display = 'none'; document.getElementById('targeted_lipids_hub-scope_pill_ui').innerHTML = ''; TeamToolHeader.sync(); });
    b = await bar(page);
    assert.deepEqual(b.groups, [], 'no View without sub-tabs, no Lipids without the scope buttons');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('tertiary_subsubtab_bar').classList.contains('r4-proxied'), document.getElementById('targeted_lipids_top_dock').classList.contains('r4-proxied'), __v(document.getElementById('targeted_lipids_top_dock'))]), [false, false, true], 'their originals are no longer gated');
    await page.evaluate(() => { document.body.dataset.guideAnalysis = 'false'; TeamToolHeader.sync(); });
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('.r4-tool-head').length, document.querySelectorAll('.r4-proxied,.r4-intro-proxied').length, ['r4-tool-header', 'r4-shortcuts', 'r4-shortcuts-open'].filter(c => document.body.classList.contains(c)), __v(document.querySelector('.tab-intro-permanent-header'))]),
      [0, 0, [], true], 'off a tool page the bar and every gate are gone and Tab info is back');
    assert.deepEqual(errors, []);
    await page.close();

    // ---- 1280, guided: nothing the bar adds covers a key control ---------------------------------
    ({page, errors} = await open(browser, {width: 1280}));
    for (const u of await unobstructed(page)) assert.ok(u.onScreen && !u.covered && !u.overlaps.length, `${u.name} is unobstructed at 1280 (${JSON.stringify(u)})`);
    assert.deepEqual(errors, []);
    await page.close();

    // ---- 1440, Team Canvas workspace shell: the 48 px bar is the only chrome above the tool ------
    ({page, errors} = await open(browser, {width: 1440, workspace: true}));
    b = await bar(page);
    assert.deepEqual(b.groups.map(g => g.label), ['View'], 'the Canvas hides the ensemble bar itself, so the bar does not offer it there');
    assert.equal(await page.evaluate(() => document.getElementById('targeted_lipids_top_dock').classList.contains('r4-proxied')), false, 'the scope dock is left to workspace.css');
    assert.equal(await page.evaluate(() => __v(document.getElementById('tertiary_subsubtab_bar'))), false, 'the Classic sub-tab row is hidden');
    geo = await page.evaluate(() => ({title: __r(document.getElementById('chart-title')), nav: __r(document.querySelector('.navbar')), bar: __r(document.querySelector('.r4-tool-head'))}));
    assert.ok(geo.title.top < 300, `the chart title starts above 300 px in the Canvas shell (${geo.title.top})`);
    assert.ok(geo.bar.top >= geo.nav.bottom - 1, 'the bar sits under the step bar');
    for (const u of await unobstructed(page)) assert.ok(u.onScreen && !u.covered && !u.overlaps.length, `${u.name} is unobstructed in the Canvas shell (${JSON.stringify(u)})`);
    assert.deepEqual(errors, []);
    await page.close();

    // ---- 390, guided: the bar wraps, every control on screen and uncovered -----------------------
    ({page, errors} = await open(browser, {width: 390, height: 844}));
    b = await bar(page);
    assert.equal(b.groups.length, 2);
    assert.ok(b.rect.right <= 390 && b.rect.left >= 0, `the bar fits the phone width (${JSON.stringify(b.rect)})`);
    await page.evaluate(() => document.querySelector('.r4-tool-head').scrollIntoView({block: 'start'}));
    for (const u of await unobstructed(page)) assert.ok(u.onScreen && !u.covered, `${u.name} is on screen and unobstructed at 390 (${JSON.stringify(u)})`);
    assert.equal(await page.evaluate(() => { const h = document.querySelector('.r4-tool-head'); return h.scrollWidth <= h.clientWidth + 1; }), true, 'the bar wraps instead of overflowing at 390');
    assert.deepEqual(errors, []);
    await page.close();

    console.log('PASS: Team tool pages have one header; the Classic chrome is offered in the tool card and stays reachable');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
