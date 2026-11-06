// Run with: node tests/dual-ui/test_team_figure_shell.cjs
// UX3/F Option A, block A1: the Figure page is the second mode of the shell grid. The real Canvas markup
// (R/frontends/team/canvas.R) loads with the Team workspace assets as wired (tests/dual-ui/
// fixture_team_overlay_pages.cjs assets(), plus canvas_preview, without the canvas tabs, which need the
// live canvas). At 1440x900: the page opens at Fit page with ≥700 px of it visible, the rail stays, the
// companion's home keeps its Draft rect, the page strip carries the status node, the zoom box sits where
// the Draft's navigation box does, and every old Figure page control is the same node and still works.
// Synthetic fixture only.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('../browser/ci/node_modules/playwright');
const fixture = require('./fixture_team_overlay_pages.cjs');

const ORIGIN = 'http://team-figure-shell.test/';
const markup = execFileSync('Rscript', ['--vanilla', '-e', 'source("R/frontends/team/canvas.R");cat(as.character(team_canvas_section()))'], {encoding: 'utf8'});
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head>
<body class="team-workspace-app" data-tw-screen="canvas" data-team-stage="canvas" data-guide-step="5" data-guide-analysis="false" data-team-authenticated="true" style="margin:0">
  <nav class="navbar"><div class="container-fluid"><span class="guide-app-name">Lipidomic Explorer</span></div></nav>
  <div id="guide-context"></div>
  <main style="padding:0;margin:0">
  <section id="team-workspace"><nav class="tw-steps" aria-label="Workspace steps">
    <button type="button" data-tw-stage="data"><span>1</span><strong>Data</strong></button><button type="button" data-tw-stage="review"><span>2</span><strong>Review</strong></button><button type="button" data-tw-stage="canvas" aria-current="step"><span>3</span><strong>Canvas</strong></button></nav>
    <button type="button" class="tw-signout" data-tw-logout>Sign out</button></section>
  ${markup}
  </main>
  <script>window.sent=[];window.$=window.jQuery=function(){return {on:function(){return this;},off:function(){return this;},trigger:function(){return this;}};};window.jQuery.fn={};
  window.Shiny={setInputValue:function(id,value){window.sent.push([id,value]);},addCustomMessageHandler:function(){},notifications:{remove:function(){}}};</script>
</body></html>`;

// Wiring order of the app; canvas_preview is wired for the workspace but needs a canvas reader (stubbed below).
function list(kind) {
  const order = fixture.wired().map(a => a.rel);
  const own = `www/team/${kind}/canvas_preview.${kind}`;
  return [...new Set(fixture.assets('workspace', kind).concat(own))]
    .filter(rel => !/\/canvas_tabs(_model)?\.(css|js)$/.test(rel))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
const rect = n => { if (!n || !n.getClientRects().length) return null; const b = n.getBoundingClientRect(); return {left: b.left, top: b.top, width: b.width, height: b.height, bottom: b.bottom}; };

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(ORIGIN + '**', route => route.fulfill({status: 200, contentType: 'text/html', body: html}));
    await page.goto(ORIGIN + 'workspace');
    for (const css of list('css')) await page.addStyleTag({path: path.resolve(css)});
    await page.evaluate(() => {
      sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('lipidomic-companion', 'neutrophil');
      window.LIPIDOMIC_TEAM_WORKSPACE = true;
      // canvas.js adds Paste plot; the shell waits for it.
      const paste = document.createElement('button'); paste.type = 'button'; paste.className = 'tc-paste-plot'; paste.textContent = 'Paste plot';
      document.querySelector('#team-canvas-root .tc-toolbar').appendChild(paste);
      // One finished plot (as tests/dual-ui/test_team_preview_navigation.cjs) and a document store.
      const url = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#315c89"/></svg>');
      window.fixtureState = {state: {version: '1', nodes: [{id: 'plot0', label: 'Plot 0', x: 0, y: 0, width: 400, height: 300, finished: {url, stale: false}}]}, ready: true};
      window.savedDocuments = [];
      window.TeamCanvas = {cardStatus: () => 'current', selected: () => null, previewState: () => structuredClone(window.fixtureState),
        getDocument: () => window.savedDocuments.length ? structuredClone(window.savedDocuments[window.savedDocuments.length - 1]) : null,
        setDocument: doc => { window.savedDocuments.push(structuredClone(doc)); }};
    });
    for (const js of list('js')) {
      await page.addScriptTag({path: path.resolve(js)});
      if (js.endsWith('/canvas_viewport.js')) await page.evaluate(() => { const root = document.getElementById('team-canvas-root'); window.TeamCanvasViewport.mount(root, root.querySelector('.tc-board')); });
    }
    await page.waitForFunction(() => window.TeamShell && window.TeamShell.mounted() && window.TeamCanvasCompose, null, {timeout: 5000});
    await fixture.settle(page);

    // Handles taken before anything moves: the same nodes must come back (moved, not recreated).
    await page.evaluate(() => {
      const q = s => document.querySelector('#team-canvas-root ' + s);
      window.originals = {status: q('.tc-preview-status'), zoomIn: q('[aria-label="Zoom in print preview"]'), zoomOut: q('[aria-label="Zoom out print preview"]'),
        reset: q('[aria-label="Reset print preview zoom to 100%"]'), fitPage: q('[aria-label="Fit whole page"]'), fitWidth: q('[aria-label="Fit page width"]'),
        navigation: q('.tc-preview-navigation'), pages: q('.tc-preview-pages'), back: q('.tc-preview-back'), stephania: q('.tc-preview-stephania'),
        addText: q('.tc-preview-add-text'), svg: q('.tc-preview-svg'), pdf: q('.tc-preview-pdf'), print: q('.tc-preview-print'), layout: q('.tc-preview-layout'),
        paper: q('.tc-preview-paper'), orientation: q('.tc-preview-orientation'), shapes: q('.tc-shape-menu'), setup: q('.tc-page-settings')};
    });
    assert.equal(await page.evaluate(() => Object.entries(originals).filter(([, n]) => !n).map(([k]) => k).join(',')), '', 'every Figure page control exists');

    const measure = () => page.evaluate(rectSource => {
      const rect = eval(rectSource), root = document.getElementById('team-canvas-root');
      const dock = document.getElementById('lipidomic-companion');
      return {home: rect(root.querySelector('.ts-inspector-column>.tc-companion-home')), column: rect(root.querySelector('.ts-inspector-column')),
        rail: rect(root.querySelector('.ts-rail')), main: rect(root.querySelector('.tc-layout>.tc-main')), panel: rect(root.querySelector('#tc-preview-panel')),
        draftNav: rect(root.querySelector('.tc-navigation')), figureNav: rect(root.querySelector('#tc-preview-panel>.tc-preview-navigation')),
        figureColumn: rect(root.querySelector('.ts-inspector-column>#tc-figure-column')),
        dock: dock && getComputedStyle(dock).visibility !== 'hidden' ? rect(dock) : null};
    }, rect.toString());
    const same = (a, b, what, tol = 1) => { assert.ok(a && b, what + ' measured in both modes'); for (const k of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(a[k] - b[k]) <= tol, `${what} ${k}: draft ${a[k]} vs figure ${b[k]}`); };

    // ---- Draft ----------------------------------------------------------------------------------------
    const draft = await measure();
    assert.equal(await page.evaluate(() => TeamCanvasCompose.mode()), 'draft');
    // ux27: the home is a small box anchored at the column's edge (no reserved strip); same rect in both modes below.
    assert.ok(draft.home && draft.home.height >= 150 && draft.home.width > 0, 'the Draft has the companion home box');
    assert.ok(draft.main && draft.rail, 'Draft canvas and rail shown');
    assert.equal(draft.figureColumn, null, '#tc-figure-column is not shown in the Draft');

    // ---- Figure page (the shell's own switch) -----------------------------------------------------------
    await page.locator('.ts-mode-switch .ts-tool', {hasText: 'Figure page'}).click();
    await page.locator('#tc-preview-panel .tc-paper').first().waitFor();
    await fixture.settle(page);
    assert.equal(await page.evaluate(() => TeamCanvasCompose.mode()), 'figure');
    const figure = await measure();
    assert.ok(figure.rail && figure.rail.width > 0, 'rail stays visible on the Figure page');
    assert.equal(figure.main, null, 'the draft board steps out of the canvas cell');
    assert.ok(figure.column && figure.column.width > 0, 'right column stays visible');
    same(draft.column, figure.column, 'right column');
    same(draft.home, figure.home, 'companion home', 0.5);
    if (draft.dock && figure.dock) same(draft.dock, figure.dock, 'companion', 2);
    assert.ok(figure.figureColumn, '#tc-figure-column is in the right column in figure mode');
    // The panel is the canvas cell: between the rail/library and the right column, full height.
    assert.ok(Math.abs(figure.panel.left - draft.main.left) <= 1 && Math.abs(figure.panel.width - draft.main.width) <= 1, 'panel takes the canvas cell');
    assert.ok(Math.abs(figure.panel.top - draft.main.top) <= 1 && Math.abs(figure.panel.height - draft.main.height) <= 1, 'panel has the cell height');
    const desk = await page.evaluate(() => {
      const desk = document.querySelector('#tc-preview-panel .tc-preview-pages'), sheet = desk.querySelector('.tc-paper'), a = desk.getBoundingClientRect(), b = sheet.getBoundingClientRect();
      return {visible: Math.min(a.bottom, b.bottom, innerHeight) - Math.max(a.top, b.top, 0), sheet: b.height, deskHeight: desk.clientHeight, inline: desk.style.height, zoom: originals.reset.textContent};
    });
    assert.ok(desk.visible >= 700, `page visible ${desk.visible}px at 1440x900 (needs ≥700)`);
    assert.ok(desk.sheet <= desk.deskHeight, 'opens at Fit page: the whole sheet fits the desk');
    assert.equal(desk.inline, '', 'the grid, not a window-height formula, sizes the desk');
    // Page strip in the tab row's place, with the status node (still aria-live) truncated in it.
    const strip = await page.evaluate(() => {
      const s = document.querySelector('#tc-preview-panel>.tc-figure-strip'), status = s && s.querySelector('.tc-preview-status'), cs = status && getComputedStyle(status);
      return s && {first: s === s.parentElement.firstElementChild, title: s.querySelector('.tc-figure-strip-title').textContent, same: status === originals.status,
        live: status.getAttribute('aria-live'), role: status.getAttribute('role'), nowrap: cs.whiteSpace, ellipsis: cs.textOverflow, height: s.getBoundingClientRect().height,
        slotNext: s.nextElementSibling && s.nextElementSibling.id, slotBeforeDesk: !!(document.getElementById('tc-figure-toolbar-slot').compareDocumentPosition(originals.pages) & Node.DOCUMENT_POSITION_FOLLOWING)};
    });
    assert.ok(strip && strip.first, 'page strip opens the canvas cell');
    assert.equal(strip.title, 'Figure page · US Letter · Portrait · 1 page');
    assert.ok(strip.same && strip.live === 'polite' && strip.role === 'status', 'status node moved into the strip, still the live region');
    assert.equal(strip.nowrap, 'nowrap'); assert.equal(strip.ellipsis, 'ellipsis');
    assert.ok(Math.abs(strip.height - 42) <= 1, 'strip has the draft header height');
    assert.equal(strip.slotNext, 'tc-figure-toolbar-slot', 'toolbar slot under the strip'); assert.ok(strip.slotBeforeDesk, 'toolbar slot above the desk');
    // Zoom box: the old nodes, where the Draft's navigation box sits (bottom left of the canvas cell).
    assert.ok(figure.figureNav, 'zoom box shown');
    // The Draft box may be gated off on an empty board: then its stylesheet corner (12 px in, shell.css).
    const corner = draft.draftNav ? {left: draft.draftNav.left, bottom: draft.draftNav.bottom} : {left: draft.main.left + 12, bottom: draft.main.bottom - 12};
    assert.ok(Math.abs(figure.figureNav.left - corner.left) <= 1 && Math.abs(figure.figureNav.bottom - corner.bottom) <= 1, `zoom box at the Draft navigation box corner (${JSON.stringify([figure.figureNav, corner])})`);
    assert.ok(await page.evaluate(() => ['zoomIn', 'zoomOut', 'reset', 'fitPage', 'fitWidth'].every(k => originals[k].isConnected && originals.navigation.contains(originals[k])) && document.querySelectorAll('.tc-preview-navigation').length === 1), 'zoom buttons are the same nodes, not recreated');

    // ---- Old controls still work --------------------------------------------------------------------------
    const root = page.locator('#team-canvas-root');
    // With the figure toolbar (figure_toolbar.js) in the slot the original page actions stay in the DOM and
    // are driven through its proxies: Export figure ▾ for SVG / PDF / Print, Add shape ▾ for the shapes.
    // Page setup is the figure column's Page tab (figure_column.js).
    const tools = root.locator('#tc-figure-toolbar-slot .tc-figure-tools');
    const tool = name => tools.getByRole('button', {name, exact: true});
    for (const name of ['Publication layout', 'Add text', 'Add shape ▾', 'Undo', 'Redo', '← Back to draft', 'Export figure ▾']) assert.ok(await tool(name).isVisible(), name + ' visible in the figure toolbar');
    assert.ok(await page.evaluate(() => ['svg', 'pdf', 'print', 'addText', 'stephania', 'back', 'shapes', 'setup'].every(k => originals[k].isConnected)), 'the original page controls stay in the DOM');
    await tool('Export figure ▾').click();
    for (const name of ['SVG', 'PDF', 'Print']) assert.ok(await tool(name).isVisible(), name + ' in Export figure');
    await page.keyboard.press('Escape');
    // ux27: the inspector starts hidden on Canvas; on the Figure page the user shows it with the rail's
    // inspector toggle (I) to reach the page settings.
    const railToggle = root.locator('.ts-rail .ts-inspector-toggle');
    if (await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed'))) { await railToggle.click(); await fixture.settle(page); }
    await root.locator('#tc-figure-column [role=tab]', {hasText: 'Page'}).click();
    assert.ok(await root.locator('.tc-page-settings>summary').isVisible(), 'Page setup in the Page tab');
    // Zoom: + then the reset label, Fit width, Fit page.
    const before = await page.evaluate(() => originals.reset.textContent);
    await page.getByRole('button', {name: 'Zoom in print preview', exact: true}).click();
    const after = parseInt(await page.evaluate(() => originals.reset.textContent), 10);
    assert.ok(Math.abs(after - parseInt(before, 10) * 1.25) <= 1, `zoom in: ${before} -> ${after}%`);
    await page.getByRole('button', {name: 'Zoom out print preview', exact: true}).click();
    await page.getByRole('button', {name: 'Reset print preview zoom to 100%', exact: true}).click();
    assert.equal(await page.evaluate(() => originals.reset.textContent), '100%', 'reset to 100%');
    await page.getByRole('button', {name: 'Fit page width', exact: true}).click();
    assert.ok(await page.evaluate(() => { const v = originals.pages; return v.scrollWidth <= v.clientWidth + 1; }), 'fit width');
    await page.getByRole('button', {name: 'Fit whole page', exact: true}).click();
    assert.ok(await page.evaluate(() => { const v = originals.pages, s = v.querySelector('.tc-paper'); return s.offsetHeight <= v.clientHeight && v.scrollTop === 0; }), 'fit page');
    // Page setup: A4 reaches the strip.
    // The Page tab opens Page setup itself (figure_column.js).
    if (!(await root.locator('.tc-page-settings').evaluate(d => d.open))) await root.locator('.tc-page-settings>summary').click();
    await root.locator('.tc-preview-paper').selectOption('a4');
    await page.waitForFunction(() => /· A4 · Portrait · 1 page$/.test(document.querySelector('.tc-figure-strip-title').textContent));
    // Add text and Add shape edit the document.
    const texts = () => page.evaluate(() => { const d = savedDocuments[savedDocuments.length - 1]; return d ? d.items.filter(i => i.type === 'text').length : 0; });
    const shapes = () => page.evaluate(() => { const d = savedDocuments[savedDocuments.length - 1]; return d ? d.items.filter(i => i.type === 'shape').length : 0; });
    const t0 = await texts();
    await tool('Add text').click();
    await page.waitForFunction(n => { const d = savedDocuments[savedDocuments.length - 1]; return d && d.items.filter(i => i.type === 'text').length > n; }, t0);
    const s0 = await shapes();
    await tool('Add shape ▾').click();
    await tool('Rectangle').click();
    await page.waitForFunction(n => { const d = savedDocuments[savedDocuments.length - 1]; return d && d.items.filter(i => i.type === 'shape').length > n; }, s0);
    // Publication layout asks first, under the toolbar slot and above the page; Cancel closes it.
    await tool('Publication layout').click();
    const dialog = page.getByRole('alertdialog', {name: 'Arrange this page for publication?'});
    await dialog.waitFor();
    assert.ok(await page.evaluate(() => { const box = document.querySelector('.tc-publication-confirmation'); return box.parentElement.id === 'tc-preview-panel' && box.nextElementSibling.classList.contains('tc-document-editor'); }), 'confirmation above the desk');
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    assert.equal(await page.locator('.tc-publication-confirmation').count(), 0);
    // SVG downloads; Print prints the physical page size (as test_team_preview_navigation.cjs).
    assert.equal(await root.locator('.tc-preview-svg').isEnabled(), true, 'SVG enabled in Free layout');
    const download = page.waitForEvent('download', {timeout: 10000});
    await tool('Export figure ▾').click(); await tool('SVG').click();
    assert.match((await download).suggestedFilename(), /\.svg$/i, 'SVG downloaded');
    await page.evaluate(() => { window.printResult = null; const append = document.body.appendChild.bind(document.body); document.body.appendChild = function (el) { const value = append(el); if (el.tagName === 'IFRAME') { el.contentWindow.focus = () => {}; el.contentWindow.print = () => { window.printResult = Array.from(el.contentDocument.querySelectorAll('.tc-paper')).length; }; } return value; }; });
    await page.waitForFunction(() => !originals.print.disabled);
    await tool('Export figure ▾').click(); await tool('Print').click();
    await page.waitForFunction(() => window.printResult !== null);
    assert.equal(await page.evaluate(() => printResult), 1, 'Print sends the page');

    // ---- Back to the draft and forth again -----------------------------------------------------------------
    await tool('← Back to draft').click();
    await fixture.settle(page);
    assert.equal(await page.evaluate(() => TeamCanvasCompose.mode()), 'draft');
    // This fixture's #team-workspace row (40 px) pushes the grid past the 900 px fold, so clicking the zoom
    // box scrolled the window; the comparison is about layout, so measure from the top again.
    await page.evaluate(() => window.scrollTo(0, 0));
    const again = await measure();
    assert.ok(again.main && again.rail && !again.panel && !again.figureColumn, 'Draft restored: board, rail, no figure page or column');
    // ux27: the inspector was shown on the Figure page (an explicit choice, kept), so the home now sits at the
    // column's left edge instead of the canvas's right edge: same size and height, anchored to the column.
    for (const k of ['top', 'width', 'height']) assert.ok(Math.abs(draft.home[k] - again.home[k]) <= 0.5, `companion home after returning ${k}: ${draft.home[k]} vs ${again.home[k]}`);
    assert.ok(Math.abs(again.home.left + again.home.width - again.column.left) <= 1, `companion home sits left of the shown inspector ${JSON.stringify([again.home, again.column])}`);
    assert.equal(await page.evaluate(() => document.getElementById('tc-workspace-panel').hidden), false, 'the shell grid stays shown');
    await page.evaluate(() => TeamCanvasCompose.showFigure());
    await page.locator('#tc-preview-panel .tc-paper').first().waitFor();
    assert.equal(await page.evaluate(() => TeamCanvasCompose.mode()), 'figure', 'API opens the Figure page again');
    assert.deepEqual(errors, [], 'no page errors');
    console.log(JSON.stringify({draft, figure, desk, strip}, null, 1));
    console.log('PASS figure shell: page ≥700 px at Fit page in the canvas cell, rail and companion home unchanged, strip + status, zoom box at the Draft corner, old controls work');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
