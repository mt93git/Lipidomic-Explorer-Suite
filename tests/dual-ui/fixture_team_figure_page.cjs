// Shared harness for the integrated Figure page tests (test_team_figure_hand_mode.cjs,
// test_team_figure_review.cjs): the real Canvas markup (R/frontends/team/canvas.R) with the Team workspace
// assets as wired (fixture_team_overlay_pages.cjs), a stub canvas reader and document store, as
// test_team_figure_shell.cjs does. Synthetic fixture only.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('../browser/ci/node_modules/playwright');
const fixture = require('./fixture_team_overlay_pages.cjs');

const ORIGIN = 'http://team-figure-hand.test/';
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

function list(kind) {
  const order = fixture.wired().map(a => a.rel);
  const own = `www/team/${kind}/canvas_preview.${kind}`;
  return [...new Set(fixture.assets('workspace', kind).concat(own))]
    .filter(rel => !/\/canvas_tabs(_model)?\.(css|js)$/.test(rel))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
// The centre of the part of a page object that is on screen inside the desk (the desk is clipped by the
// right column), checked to hit that object.
async function aim(page, locator) {
  const p = await locator.evaluate(n => {
    const d = n.closest('.tc-preview-pages').getBoundingClientRect(), r = n.getBoundingClientRect();
    const l = Math.max(d.left, r.left), t = Math.max(d.top, r.top), rr = Math.min(d.right - 20, r.right), b = Math.min(d.bottom - 20, r.bottom);
    const x = (l + rr) / 2, y = (t + b) / 2, hit = document.elementFromPoint(x, y);
    return {x, y, ok: rr - l > 20 && b - t > 20 && !!hit && n.contains(hit)};
  });
  assert.ok(p.ok, 'aim point on the object, inside the desk ' + JSON.stringify(p));
  return p;
}

async function open(browser, viewport, before) {
  const page = await browser.newPage({viewport});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route(ORIGIN + '**', route => route.fulfill({status: 200, contentType: 'text/html', body: html}));
  await page.goto(ORIGIN + 'workspace');
  for (const css of list('css')) await page.addStyleTag({path: path.resolve(css)});
  await page.evaluate(() => {
    sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('lipidomic-companion', 'neutrophil');
    window.LIPIDOMIC_TEAM_WORKSPACE = true;
    const paste = document.createElement('button'); paste.type = 'button'; paste.className = 'tc-paste-plot'; paste.textContent = 'Paste plot';
    document.querySelector('#team-canvas-root .tc-toolbar').appendChild(paste);
    const url = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#315c89"/></svg>');
    window.fixtureState = {state: {version: '1', nodes: [{id: 'plot0', label: 'Plot 0', x: 0, y: 0, width: 400, height: 300, finished: {url, stale: false}}]}, ready: true};
    window.savedDocuments = [];
    window.TeamCanvas = {cardStatus: () => 'current', selected: () => null, previewState: () => structuredClone(window.fixtureState),
      getDocument: () => window.savedDocuments.length ? structuredClone(window.savedDocuments[window.savedDocuments.length - 1]) : null,
      setDocument: doc => { window.savedDocuments.push(structuredClone(doc)); }};
  });
  if (before) await page.evaluate(before);
  for (const js of list('js')) {
    await page.addScriptTag({path: path.resolve(js)});
    if (js.endsWith('/canvas_viewport.js')) await page.evaluate(() => { const root = document.getElementById('team-canvas-root'); window.TeamCanvasViewport.mount(root, root.querySelector('.tc-board')); });
  }
  await page.waitForFunction(() => window.TeamShell && window.TeamShell.mounted() && window.TeamCanvasCompose && window.TeamCanvasPointerMode && window.TeamCanvasPointerMode.setMode, null, {timeout: 5000});
  await page.waitForFunction(() => document.querySelector('#team-canvas-root .ts-rail>.ts-inspector-toggle'), null, {timeout: 5000});
  await fixture.settle(page);
  return {page, errors};
}

async function toFigure(page) {
  await page.locator('.ts-mode-switch .ts-tool', {hasText: 'Figure page'}).click();
  await page.locator('#tc-preview-panel .tc-paper').first().waitFor();
  await fixture.settle(page);
  assert.equal(await page.evaluate(() => TeamCanvasCompose.mode()), 'figure');
}
async function toDraft(page) {
  await page.evaluate(() => TeamCanvasCompose.showDraft());
  await fixture.settle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.evaluate(() => TeamCanvasCompose.mode()), 'draft');
}

module.exports = {open, toFigure, toDraft, aim, near, list, fixture};
