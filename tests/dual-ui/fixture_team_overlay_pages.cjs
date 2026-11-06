// Shared fixtures for tests/dual-ui/test_team_overlay_layers.cjs and
// tests/dual-ui/test_team_unobstructed_controls.cjs (not a test on its own).
// Pages are built from the app's own markup (R/guided_workflow.R guide_header(), the R5 bar in
// R/frontends/team/pending_changes_bar.R, the login card, the palette modal in
// R/modules/1_shared_data_module.R) and load the real www/team CSS and JS. Nothing is read from
// ux-wave2-ref/. The assets are taken from the Team wiring itself (R/frontends/team/*.R, ui.R first,
// in order): the base files these pages need, plus every Team asset that is not in the wave-1 base,
// so an overlay that a wave-2 branch adds (and registers) is loaded and found by the same tests.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ORIGIN = 'http://team-overlays.test/';
const VIEWPORTS = [{width: 1280, height: 800}, {width: 1440, height: 900}, {width: 390, height: 844}];
const exists = rel => fs.existsSync(path.resolve(rel));

// Every www/team asset at the wave-1 base (1e4974a). Anything registered that is not listed here is new.
const BASE = new Set([
  ...['autosave', 'canvas', 'canvas_catalog', 'canvas_inspector', 'canvas_preview', 'canvas_tabs', 'canvas_viewport', 'card_figure',
    'card_status', 'cell_show', 'companion_assistant', 'companion_guidance', 'context_help', 'custom', 'dashboard', 'dashboard_selection',
    'foreground', 'group_comparison', 'guided', 'illustrations', 'libreros', 'login_validation', 'mascot_refine', 'palette_editor',
    'pending_changes_bar', 'plot_editor', 'qw_a11y', 'qw_contrast', 'qw_layers', 'review_live', 'review_shell', 'scientific_insight',
    'shell', 'workspace', 'workspace_minimal'].map(n => `css/${n}.css`),
  ...['app', 'autosave', 'canvas', 'canvas_assets', 'canvas_catalog', 'canvas_checkpoint', 'canvas_inspector', 'canvas_preview',
    'canvas_statistics', 'canvas_tabs', 'canvas_tabs_model', 'canvas_viewport', 'card_figure', 'card_status', 'cell_viewer', 'companion_art',
    'companion_assistant', 'companion_guidance', 'companion_guidance_data', 'companion_workspace', 'context_help', 'dashboard_selection',
    'dashboard_significance', 'data_shell', 'foreground', 'group_comparison', 'guided', 'has_classes', 'help_content',
    'illustration_library', 'illustrations', 'login_validation', 'palette_editor', 'pending_changes_bar', 'plot_editor', 'plot_exports',
    'project_records', 'qw_a11y', 'qw_pca_groups', 'qw_plot_controls', 'review_live', 'review_shell', 'scientific_insight', 'shell',
    'tour_guide', 'violin_display', 'workspace'].map(n => `js/${n}.js`)
]);
// Base files each page loads. The rest of the base needs the live Shiny session (canvas.js, guided.js,
// workspace.js, ...); the fixtures stand in for what those would have rendered.
const SAFE = {
  guided: new Set(['css/custom.css', 'css/libreros.css', 'css/guided.css', 'css/context_help.css', 'css/companion_assistant.css',
    'css/palette_editor.css', 'css/qw_contrast.css', 'css/qw_a11y.css', 'css/qw_layers.css', 'css/pending_changes_bar.css',
    'css/login_validation.css', 'js/help_content.js', 'js/companion_art.js', 'js/context_help.js', 'js/companion_assistant.js',
    'js/palette_editor.js', 'js/qw_plot_controls.js', 'js/pending_changes_bar.js', 'js/foreground.js', 'js/login_validation.js']),
  // libreros.css: the Team head links it in both modes (R/frontends/team/ui.R), so the Canvas is checked with its cascade.
  workspace: new Set(['css/custom.css', 'css/libreros.css', 'css/context_help.css', 'css/companion_assistant.css', 'css/palette_editor.css', 'css/qw_contrast.css',
    'css/qw_a11y.css', 'css/qw_layers.css', 'css/companion_guidance.css', 'css/workspace.css', 'css/canvas.css', 'css/workspace_minimal.css',
    'css/canvas_viewport.css', 'css/canvas_inspector.css', 'css/shell.css', 'css/mascot_refine.css', 'css/card_figure.css',
    'css/card_status.css', 'css/canvas_tabs.css', 'js/has_classes.js', 'js/help_content.js', 'js/companion_art.js', 'js/context_help.js',
    'js/companion_assistant.js', 'js/palette_editor.js', 'js/companion_guidance_data.js', 'js/companion_guidance.js',
    'js/canvas_viewport.js', 'js/canvas_inspector.js', 'js/shell.js', 'js/card_figure.js', 'js/card_status.js',
    'js/canvas_tabs_model.js', 'js/canvas_tabs.js'])
};

// Team assets in wiring order: R/frontends/team/ui.R first, then the other Team R files. A line that
// starts with `if (team_workspace_enabled())` or `if (!team_workspace_enabled())` registers its assets
// for one Team mode only (only: 'workspace' / 'guided'), as the app does; the pages load what their mode loads.
function wired() {
  const dir = 'R/frontends/team';
  const files = ['ui.R'].concat(fs.readdirSync(dir).filter(f => f.endsWith('.R') && f !== 'ui.R').sort());
  const seen = new Set(), out = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const cond = /^\s*if\s*\(\s*(!?)\s*team_workspace_enabled\(\)\s*\)/.exec(line);
      const only = cond ? (cond[1] ? 'guided' : 'workspace') : null;
      for (const m of line.matchAll(/www\/team\/(css|js)\/([\w.-]+?)\.(css|js)\b/g)) {
        if (m[1] !== m[3]) continue;
        const key = `${m[1]}/${m[2]}.${m[3]}`;
        if (seen.has(key)) continue;
        seen.add(key); out.push({key, rel: `www/team/${key}`, kind: m[1], only});
      }
    }
  }
  return out;
}
function assets(page, kind) {
  const list = wired().filter(a => a.kind === kind && exists(a.rel) && (!a.only || a.only === page) && (SAFE[page].has(a.key) || !BASE.has(a.key))).map(a => a.rel);
  // A file can be registered before its model (ui.R's file.exists() guard names canvas_tabs.js first);
  // the app's tags list loads the model first. Load each X_model.js before X.js, as the app does (Sol R3 H2).
  for (const m of list.filter(r => /_model\.js$/.test(r))) {
    const user = m.replace(/_model\.js$/, '.js'), i = list.indexOf(user), j = list.indexOf(m);
    if (i >= 0 && i < j) { list.splice(j, 1); list.splice(i, 0, m); }
  }
  return list;
}
// Wave-2 assets the fixtures load on this branch (registered, not in the base).
const extraAssets = () => wired().filter(a => exists(a.rel) && !BASE.has(a.key)).map(a => a.rel);

// Not in the repo: bslib's Bootstrap 5 modal rules (z-index 1055 / 1050), Shiny's notification panel
// rule (shiny.min.css, z-index 99999) and the bslib sidebar collapse. The Team stylesheets load after them.
const VENDOR = `
.modal{--bs-modal-zindex:1055;position:fixed;top:0;left:0;z-index:var(--bs-modal-zindex);display:none;width:100%;height:100%;overflow-x:hidden;overflow-y:auto;outline:0}
.modal.show{display:block}.modal-dialog{position:relative;width:auto;margin:1.75rem auto;max-width:800px;pointer-events:none}
.modal-content{position:relative;display:flex;flex-direction:column;pointer-events:auto;background:#fff;border-radius:8px;padding:16px}
.modal-backdrop{--bs-backdrop-zindex:1050;position:fixed;top:0;left:0;z-index:var(--bs-backdrop-zindex);width:100vw;height:100vh;background-color:#464646}
.modal-backdrop.show{opacity:.5}
#shiny-notification-panel{position:fixed;bottom:0;right:0;background-color:rgba(0,0,0,0);padding:2px;width:300px;max-width:100%;z-index:99999}
.shiny-notification{background:#e8e8e8;padding:10px 20px;margin:2px}
.bslib-sidebar-layout>.sidebar{display:none}.bslib-sidebar-layout:not(.sidebar-collapsed)>.sidebar{display:block}
.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}`;

// Shiny and jQuery are not loaded: inert stand-ins, so scripts that register handlers can start.
const STUBS = `<script>window.sent=[];window.$=window.jQuery=function(){return {on:function(){return this;},off:function(){return this;},trigger:function(){return this;}};};window.jQuery.fn={};
window.Shiny={setInputValue:function(id,value){window.sent.push([id,value]);},addCustomMessageHandler:function(){},notifications:{remove:function(){}}};</script>`;

// ---- Guided pages (R/guided_workflow.R) -------------------------------------------------------------
const STEP_LABELS = ['Experiment', 'Design', 'Quality', 'My question', 'Results', '3D Show', 'Share'];
function guideHeader(step, context) {
  const steps = STEP_LABELS.map((label, i) => `<button type="button" data-guide-step="${i + 1}" class="guide-step${i + 1 === step ? ' active' : ''}"${i + 1 === step ? ' aria-current="step"' : ''}><span>${i + 1}</span>${label}</button>`).join('');
  return `<div id="guide-navigation"><nav aria-label="Analysis workflow">${steps}</nav>
    <div class="guide-global-actions"><button type="button" class="guide-button" data-guide-step="5">All analysis tools</button><button type="button" class="guide-button" data-guide-tool="App Info">Help &amp; methods</button></div></div>
  <div id="guide-context"><div id="guide_context" class="shiny-html-output">${context}</div></div>
  <div id="guide-analysis-toolbar"><button type="button" class="guide-button" data-guide-step="4">← Question</button>
    <div class="form-group shiny-input-container"><label class="control-label" for="guide_tool"><span class="visually-hidden">Analysis tool</span></label><select id="guide_tool" class="form-control"><option value="">Choose a tool</option><option>Heatmap</option><option>Volcano Plot</option></select></div>
    <button type="button" class="guide-button" data-guide-step="3">Quality</button><button type="button" class="guide-button" data-guide-step="7">Share results</button>
    <button type="button" id="guide-narrow-controls" class="guide-button guide-narrow-controls" aria-expanded="false" aria-controls="main_sidebar">Plot controls</button></div>`;
}
const filler = h => `<div aria-hidden="true" style="height:${h}px"></div>`;
const GUIDED = {
  // Quality after one scheduled exclusion: the wave-1 capture r5-after-1440 (the mascot over Undo).
  'quality-pending': {step: 3, analysis: false, stage: 'update_pending',
    context: '<div class="guide-context-text"><strong>2,031 lipids</strong> · <strong>67 samples</strong> <span class="guide-run-status">Changes pending</span><p>Your results still use the last prepared data. <button type="button" class="guide-button">Review changes →</button></p></div>',
    body: `<div class="guide-page"><div class="guide-heading"><span class="ux-eyebrow">STEP 3 OF 7</span><h2>Check quality and prepare your data</h2><p>Review detection before imputation, then check distributions and unusual samples.</p></div>
      <div class="guide-columns"><div class="guide-panel"><h3>1. Keep sufficiently detected lipids</h3><div class="form-group shiny-input-container"><label class="control-label" for="qc_pca_tab-minDetectionPct">Minimum detection (%)</label><input id="qc_pca_tab-minDetectionPct" type="number" class="form-control" value="50"></div>${filler(260)}</div>
        <div class="guide-panel"><h3>Prepare</h3><button id="data_hub-runAnalysis" type="button" class="btn btn-default action-button">Update prepared data</button>${filler(260)}</div></div>
      <div id="guide-qc-review" class="guide-panel" data-qc-action="review"><h3>Review sample quality</h3>${filler(320)}<button id="qc_pca_tab-guided_undo_1" type="button" class="btn btn-default" data-sample="SteadyState2_Exp_037">Undo</button></div>
      <div id="guide_quality_next" class="shiny-html-output"><div class="guide-actions"><button type="button" class="guide-button" data-guide-step="4">Continue with the previous applied run →</button></div></div>${filler(160)}</div>`},
  // A tool page (Results): the toolbar's Plot controls button drives the collapsed sidebar.
  results: {step: 5, analysis: true,
    context: '<div class="guide-context-text"><strong>Volcano Plot</strong> · Control vs Treated</div>',
    body: `<div class="guide-page"><div class="guide-heading"><h2>Volcano Plot</h2><p>Each point is a lipid; hover for details.</p></div>
      <div class="guide-panel"><div class="shiny-plot-output" style="height:420px;background:#f4f6f8"></div><button type="button" class="btn btn-default">CSV</button></div>${filler(400)}</div>`},
  // The project library sign-in card (R/frontends/team/project_library.R), as test_team_login_validation.cjs.
  login: {step: 1, analysis: false,
    context: '<div class="guide-context-text">Sign in to open your projects.</div>',
    body: `<div class="guide-page"><section class="team-library"><h3>Project library</h3><div class="team-library-login">
      <div class="form-group shiny-input-container"><label for="team_library_email">Email</label><input id="team_library_email" class="form-control"><div id="team_library_email_error" class="team-login-field-error" hidden></div></div>
      <div class="form-group shiny-input-container"><label for="team_library_password">Password</label><input id="team_library_password" type="password" class="form-control"><div id="team_library_password_error" class="team-login-field-error" hidden></div></div>
      <div id="team_library_login_alert" class="team-login-alert" role="alert" hidden></div>
      <button id="team_library_login" type="button" class="btn btn-primary action-button">Sign in</button></div>
      <details class="team-library-activation"><summary>Reset password or activate your invitation</summary><p>Code</p></details></section>${filler(300)}</div>`}
};
// What output$team_pending_changes_bar renders for one excluded sample (R/frontends/team/pending_changes_bar.R).
const PENDING_BAR = '<div class="tw-pending-bar" data-tw-pending="true"><p class="tw-pending-text"><strong>Changes pending: </strong>SteadyState2_Exp_037 excluded — results shown are from the previous run.</p>' +
  '<div class="tw-pending-actions"><button type="button" class="btn btn-sm tw-pending-update" data-tw-pending-update="data_hub-runAnalysis">Update prepared data</button>' +
  '<button type="button" class="btn btn-sm tw-pending-undo" data-tw-pending-undo="SteadyState2_Exp_037" aria-label="Undo exclusion of SteadyState2_Exp_037">Undo</button></div></div>';

// The tools the drawer lists on every guided step. In the app the Results page (guide_results_ui(), its
// "All analysis tools (advanced)" grid) is a static nav_panel, so its links are in the page on every step
// (an inactive Bootstrap tab pane), and team_tools_drawer_catalog() (ui.R) adds the groups for both modes.
// The fixture keeps that grid in an inactive pane on every guided page (on Results the app shows it at the
// page's end; no control checked here sits there).
const TOOLS_CATALOG = '<script type="application/json" id="team-tools-drawer-catalog">{"groups":[{"title":"Big picture","tools":["Heatmap","Volcano Plot"]}],"descriptions":{}}</script>';
const RESULTS_TOOLS = '<details><summary>All analysis tools (advanced)</summary><div class="guide-tool-grid">' +
  '<button type="button" class="guide-button" data-guide-tool="Heatmap">Heatmap</button><button type="button" class="guide-button" data-guide-tool="Volcano Plot">Volcano Plot</button></div></details>';
function guidedHtml(kind) {
  const g = GUIDED[kind];
  const resultsPane = `<div class="tab-pane" style="display:none"><div class="guide-page">${RESULTS_TOOLS}</div></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${VENDOR}</style></head>
<body class="guided-app" data-guide-step="${g.step}" data-guide-analysis="${g.analysis}"${g.stage ? ` data-guide-preparation-stage="${g.stage}"` : ''} style="margin:0">
<nav class="navbar navbar-static-top"><div class="container-fluid"><span class="navbar-brand guide-app-name">Lipidomic Explorer</span></div></nav>
<div class="bslib-sidebar-layout sidebar-collapsed"><aside id="main_sidebar" class="sidebar"><h3>Plot settings</h3></aside>
<button type="button" class="collapse-toggle" aria-expanded="false" aria-controls="main_sidebar" aria-label="Toggle sidebar">›</button>
<div class="main">${guideHeader(g.step, g.context)}
<div id="tw-pending-bar" role="status" aria-live="polite"><div id="team_pending_changes_bar" class="shiny-html-output"></div></div>
<div class="tab-content"><div class="tab-pane active">${g.body}</div>${resultsPane}</div></div></div>
${TOOLS_CATALOG}${STUBS}</body></html>`;
}

// ---- Team workspace Canvas (R/frontends/team/canvas.R + workspace.R) ---------------------------------
function workspaceHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${VENDOR}</style></head>
<body class="team-workspace-app" data-tw-screen="canvas" data-team-stage="canvas" data-guide-step="5" data-guide-analysis="false" data-team-authenticated="true" style="margin:0">
  <nav class="navbar"><div class="container-fluid"><span class="guide-app-name">Lipidomic Explorer</span></div></nav>
  <!-- No #guide-navigation: the Team workspace unmounts the seven-step bar (R/frontends/team/ui.R, RC5). -->
  <script type="application/json" id="team-tools-drawer-catalog">{"groups":[{"title":"Big picture","tools":["Heatmap","Volcano Plot"]}],"descriptions":{}}</script>
  <div id="guide-context"></div>
  <main style="padding:20px">
  <section id="team-workspace"><nav class="tw-steps" aria-label="Workspace steps">
      <button type="button" data-tw-stage="data"><span>1</span><strong>Data</strong></button><button type="button" data-tw-stage="review"><span>2</span><strong>Review</strong></button><button type="button" data-tw-stage="canvas" aria-current="step"><span>3</span><strong>Canvas</strong></button></nav>
    <button type="button" class="tw-signout" data-tw-logout>Sign out</button>
    <div class="tw-canvas-tabs"><button type="button" class="guide-button">Figure canvas</button><button type="button" class="guide-button">3D cell</button><button type="button" class="guide-button">Save &amp; export</button>
      <details><summary>All analysis tools (advanced)</summary><div class="guide-tool-grid">
        <button type="button" class="guide-button" data-guide-tool="Heatmap">Heatmap</button><button type="button" class="guide-button" data-guide-tool="Volcano Plot">Volcano Plot</button></div></details></div></section>
  <section id="team-canvas-root" class="tc-workspace" aria-label="Figure canvas">
    <div class="tc-intro"><button type="button" class="tc-palette">Colors &amp; palettes</button></div>
    <div id="tc-workspace-panel"><div class="tc-layout">
      <aside class="tc-catalog"><h3>Plot library</h3><div class="tc-list"></div></aside>
      <div class="tc-main">
        <div class="tc-toolbar"><strong>Canvas</strong>
          <button type="button" class="tc-library-toggle" aria-expanded="true">Hide library</button>
          <button type="button" class="tc-arrange">Arrange</button><button type="button" class="tc-reset">Return all plots</button>
          <button type="button" class="tc-paste-plot">Paste plot</button></div>
        <div class="tc-global-wait" hidden><span class="tc-global-wait-text">Waiting for the analysis server…</span><button type="button">Keep waiting</button></div>
        <p class="tc-status" role="status" aria-live="polite"></p>
        <div class="tc-scroll" style="overflow:auto;height:600px"><div class="tc-board" style="position:relative;width:3200px;height:2000px">
          <article class="tc-node" tabindex="0" data-plot-id="p1" style="position:absolute;left:60px;top:90px;width:420px;height:300px">
            <div class="tc-node-head"><strong>PCA</strong><button type="button">Edit</button><button type="button">Duplicate</button><button type="button">Remove</button></div>
            <details class="tc-settings"><summary>Plot appearance</summary><input aria-label="Title"></details>
            <div class="tc-content"><div id="p1" style="height:220px;background:#f4f6f8">Graph</div></div></article>
          <article class="tc-node" tabindex="0" data-plot-id="p2" style="position:absolute;left:2600px;top:1500px;width:420px;height:300px">
            <div class="tc-node-head"><strong>Volcano</strong><button type="button">Remove</button></div><div class="tc-content">Graph</div></article>
        </div></div>
      </div>
    </div></div>
    <section id="tc-preview-panel" class="tc-preview" hidden><div class="tc-preview-toolbar"><h3>Compose your final figure</h3><button type="button" class="tc-preview-add-text">Add text</button></div></section>
  </section>
  </main>
${STUBS}</body></html>`;
}

function html(name) {
  if (name === 'workspace') return workspaceHtml();
  const m = /^guided\/([\w-]+)$/.exec(name);
  if (m && GUIDED[m[1]]) return guidedHtml(m[1]);
  return '<!doctype html><title>not a fixture</title>';
}
async function install(page) {
  await page.route(ORIGIN + '**', route => route.fulfill({status: 200, contentType: 'text/html', body: html(new URL(route.request().url()).pathname.replace(/^\//, ''))}));
}

// ---- Settling ------------------------------------------------------------------------------------------
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
const layoutKey = page => page.evaluate(() => ['lipidomic-companion', 'lipidomic-assistant-panel', 'lipidomic-help-panel', 'tc-selection-inspector'].map(id => {
  const n = document.getElementById(id); if (!n) return '-';
  const r = n.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(',');
}).join('|'));
// The companion re-places itself over a few frames (context_help.js schedule/positionDock/protectControls):
// wait until the floating layers stop moving, then let finite animations (fade-ins, transitions) end.
async function settle(page) {
  await page.waitForTimeout(150);
  for (let i = 0; i < 15; i++) {
    const a = await layoutKey(page); await frames(page); const b = await layoutKey(page);
    if (a === b) break;
  }
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))).then(() => true));
}

// Companion states: 'closed' (Plain help: no character), 'default' (character at its automatic place),
// 'opened' (the chat opened with its real opener, see openCompanionChat).
const companionChoice = state => state === 'closed' ? 'none' : 'neutrophil';
async function storage(page, companion, extra) {
  await page.evaluate(([choice, extra]) => {
    sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('lipidomic-companion', choice);
    Object.assign(window, extra || {});
  }, [companionChoice(companion), extra || null]);
}

async function setupGuided(page, kind, o = {}) {
  await page.goto(ORIGIN + 'guided/' + kind);
  for (const css of assets('guided', 'css')) await page.addStyleTag({path: path.resolve(css)});
  await storage(page, o.companion);
  for (const js of assets('guided', 'js')) await page.addScriptTag({path: path.resolve(js)});
  if (kind === 'quality-pending') {
    await page.evaluate(html => { document.getElementById('team_pending_changes_bar').innerHTML = html; }, PENDING_BAR);
    await page.waitForFunction(() => document.body.classList.contains('tw-changes-pending'), null, {timeout: 3000}).catch(() => {});
  }
  // guided.js passes the step to the companion on every step change.
  await page.evaluate(step => { if (window.LipidomicHelp) window.LipidomicHelp.setContext({step, tool: ''}); }, GUIDED[kind].step);
  await settle(page);
}

async function setupWorkspace(page, o = {}) {
  await page.goto(ORIGIN + 'workspace');
  for (const css of assets('workspace', 'css')) await page.addStyleTag({path: path.resolve(css)});
  // Server data, not an opener: every card reports an up-to-date figure (card_status.js draws the badge).
  await storage(page, o.companion, {LIPIDOMIC_TEAM_WORKSPACE: true});
  await page.evaluate(() => { window.TeamCanvas = {cardStatus: () => 'current', selected: () => null}; });
  for (const js of assets('workspace', 'js')) {
    await page.addScriptTag({path: path.resolve(js)});
    // canvas.js mounts the viewport in the app; it is not loaded here.
    if (js.endsWith('/canvas_viewport.js')) await page.evaluate(() => { const root = document.getElementById('team-canvas-root'); window.TeamCanvasViewport.mount(root, root.querySelector('.tc-board')); });
  }
  await page.waitForFunction(() => window.TeamShell && window.TeamShell.mounted(), null, {timeout: 5000});
  await page.waitForSelector('#team-canvas-root .tc-canvas-tab-more', {timeout: 2000}).catch(() => {});
  if (o.figure) await figurePage(page);
  if (o.expand) {
    // The real toggle (the shell hides it and proxies "Expand canvas" to it from the ⋯ menu).
    await page.evaluate(() => document.querySelector('#team-canvas-root .tc-focus-toggle').click());
    await page.waitForFunction(() => document.getElementById('team-canvas-root').classList.contains('tc-focus-mode'));
  }
  await settle(page);
}
// Draft -> Figure page: the tab effects of canvas_preview.js select() (its other work needs the full canvas).
async function figurePage(page) {
  await page.evaluate(() => {
    document.getElementById('tc-workspace-panel').hidden = true; document.getElementById('tc-preview-panel').hidden = false;
    document.getElementById('team-canvas-root').classList.add('tc-figure-mode');
    window.dispatchEvent(new CustomEvent('team-canvas-mode', {detail: {mode: 'figure'}}));
  });
  await settle(page);
}
// Select the first card the way a click does (canvas_inspector.js opens its properties).
async function selectCard(page) {
  await page.locator('#team-canvas-root .tc-node').first().dispatchEvent('click');
  await page.waitForFunction(() => { const i = document.getElementById('tc-selection-inspector'); return i && !i.hidden; }, null, {timeout: 3000}).catch(() => {});
  await settle(page);
}

// The chat, opened with the first opener that is shown: the floating character (context_help.js, as in
// d814775), the expanded-canvas fallback button, then the help bar's "Ask companion".
const CHAT_OPENERS = ['#lipidomic-companion .companion-launcher', '.team-companion-fallback',
  '#lipidomic-help-bar .assistant-launcher', '#lipidomic-assistant-root .assistant-launcher'];
async function openCompanionChat(page) {
  const used = await page.evaluate(list => {
    const shown = n => !!n && !n.closest('[hidden]') && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
    const isOpen = () => { const p = document.getElementById('lipidomic-assistant-panel'); return !!p && !p.hidden; };
    for (const sel of list) { const n = document.querySelector(sel); if (!shown(n)) continue; n.click(); if (isOpen()) return sel; }
    return null;
  }, CHAT_OPENERS);
  if (used) { await page.waitForTimeout(60); await settle(page); }
  return used;
}

// Layers that can sit over the page. Their descendants are hit-tested with pointer events forced on,
// so a layer that only lets clicks through (pointer-events:none) still counts as covering what it paints over.
const OVERLAY_DESCENDANTS = ['#lipidomic-companion', '#lipidomic-assistant-root', '#lipidomic-help-panel',
  '#team-tools-drawer', '.tc-instance-host'];
const FORCE_POINTER_CSS = OVERLAY_DESCENDANTS.map(s => `${s} *`).join(',') + ',#lipidomic-help-panel,#team-tools-drawer,#team-canvas-root .tc-status{pointer-events:auto!important}';

module.exports = {ORIGIN, VIEWPORTS, GUIDED, PENDING_BAR, exists, wired, assets, extraAssets, install, settle, frames,
  setupGuided, setupWorkspace, figurePage, selectCard, openCompanionChat, CHAT_OPENERS, FORCE_POINTER_CSS};
