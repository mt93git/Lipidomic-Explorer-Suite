// Shared mock page for Canvas layout-stability tests (no Shiny server).
// Real canvas markup (R/frontends/team/canvas.R), real Plotly and jQuery from the
// installed R packages, and the real Team Canvas scripts and styles in app order.
// Every write to a card's left/top/width/height is logged with its caller stack
// (window.__writes), whether it comes through element.style.<prop>, setProperty,
// cssText or a style attribute change (a MutationObserver backs up the setters).
'use strict';
const path = require('node:path');
const {execFileSync} = require('node:child_process');

let cached = null;
function assets() {
  if (cached) return cached;
  const markup = execFileSync('Rscript', ['--vanilla', '-e', 'source("R/frontends/team/canvas.R");cat(as.character(team_canvas_ui()))'], {encoding: 'utf8'});
  const plotly = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], {encoding: 'utf8'}).trim();
  const jquery = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("www/shared/jquery.min.js",package="shiny"))'], {encoding: 'utf8'}).trim();
  cached = {markup, plotly, jquery};
  return cached;
}

const svg = n => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Ctext y='20'%3E${n}%3C/text%3E%3C/svg%3E`;
// 13 static plots + 2 Plotly plots (one a square class heatmap) + 2 illustrations = 17 cards.
const STATIC = ['pca', 'volcano', 'violin', 'comp', 'dist', 'bar', 'donut', 'lollipop', 'ratio', 'corr', 'scree', 'loadings', 'box'];
const PLOTLY = ['results_dashboard-plot_heat', 'results_dashboard-plot_scatter'];
const staticId = n => `results_dashboard-plot_${n}`;

// Instrumentation installed before any page script runs.
const INSTRUMENT = `(() => {
  window.__writes = []; window.__logWrites = false;
  const KEYS = ['left', 'top', 'width', 'height'];
  const card = s => { const el = window.__styleOwner && window.__styleOwner.get(s); return el && el.classList && el.classList.contains('tc-node') ? el : null; };
  window.__styleOwner = new WeakMap();
  const styleGet = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style').get;
  Object.defineProperty(HTMLElement.prototype, 'style', {configurable: true, get() { const s = styleGet.call(this); window.__styleOwner.set(s, this); window.__patchStyle && window.__patchStyle(this, s); return s; }, set(v) { styleGet.call(this).cssText = v; }});
  const record = (el, prop, before, after) => {
    if (!window.__logWrites || before === after) return;
    const stack = (new Error().stack || '').split('\\n').slice(3, 10).map(l => l.trim().replace(/^at /, '').replace(/\\(?[^ (]*\\/([^/]+\\.js):(\\d+):\\d+\\)?/, '$1:$2')).filter(l => !/^eval|UtilityScript/.test(l)).join(' <- ');
    window.__writes.push({id: el.dataset.canvasOrderId || el.dataset.plotId || '?', prop, before, after, t: Math.round(performance.now()), stack});
  };
  // Chromium exposes left/top/width/height as own accessors of each style object, so each
  // card's style object gets its own logged accessors (cards are <article> elements).
  const patched = new WeakSet(), setProp = CSSStyleDeclaration.prototype.setProperty;
  window.__patchStyle = (el, s) => {
    if (patched.has(s) || el.tagName !== 'ARTICLE') return; patched.add(s);
    KEYS.forEach(prop => Object.defineProperty(s, prop, {configurable: true, get() { return s.getPropertyValue(prop); }, set(v) { s.setProperty(prop, v == null ? '' : String(v)); }}));
  };
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (prop, v, p) { const el = KEYS.includes(prop) ? card(this) : null, before = el ? this.getPropertyValue(prop) : null; const out = setProperty.call(this, prop, v, p); if (el) record(el, prop, before, this.getPropertyValue(prop)); return out; };
  // Geometry the page shows: every card's computed box, read on demand.
  window.__geometry = () => Array.from(document.querySelectorAll('#team-canvas-root .tc-node')).map(n => ({id: n.dataset.canvasOrderId || n.dataset.plotId, left: n.style.left, top: n.style.top, width: n.style.width, height: n.style.height})).sort((a, b) => a.id < b.id ? -1 : 1);
})();`;

async function layoutPage(browser, {viewport = {width: 1500, height: 1000}, shell = true} = {}) {
  const {markup, plotly, jquery} = assets();
  const page = await browser.newPage({viewport});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const plots = STATIC.map(n => `<div class="rd-card"><h3>${n}</h3><div id="${staticId(n)}" class="shiny-plot-output"><img src="${svg(n)}"></div></div>`).join('') +
    PLOTLY.map(id => `<div class="rd-card"><h3>${id}</h3><div id="${id}" class="plotly html-widget-output" style="height:420px"></div></div>`).join('');
  await page.setContent(`<!doctype html><html lang="en"><head><style>*,::before,::after{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui}</style></head><body class="team-workspace-app${shell ? ' ts-shell-app' : ''}" data-guide-step="5" data-team-stage="canvas" data-tw-screen="canvas">${markup}<div class="tc-sources" style="position:absolute;left:-5000px;width:900px">${plots}</div>
    <script>window.handlers={};window.sent=[];window.Shiny={addCustomMessageHandler:(n,f)=>handlers[n]=f,setInputValue:(n,v)=>{sent.push(n);if(n==='team_canvas_state')setTimeout(()=>handlers['team-canvas-state-ack']&&handlers['team-canvas-state-ack']({token:v.token,ok:true}),5);}};
    window.TeamBusy={begin:()=>'t',end:()=>{},fail:()=>{}};window.changes=[];window.addEventListener('team-canvas-changed',e=>changes.push(e.detail||{}));</script></body></html>`);
  await page.addScriptTag({content: INSTRUMENT});
  for (const css of ['canvas_header', 'card_frame', 'canvas_feedback', 'canvas', 'workspace_minimal', 'canvas_viewport', 'shell', 'card_figure', 'card_status', 'canvas_tabs', 'illustrations']) await page.addStyleTag({path: path.resolve(`www/team/css/${css}.css`)});
  await page.addScriptTag({path: jquery}); await page.addScriptTag({path: plotly});
  const scripts = ['canvas_tabs_model', 'canvas_tabs', 'illustrations', 'canvas_feedback', 'card_frame', 'canvas_viewport', 'canvas', 'figure_toolbar'].concat(shell ? ['shell', 'card_figure', 'card_status'] : []);
  for (const js of scripts) await page.addScriptTag({path: path.resolve(`www/team/js/${js}.js`)});
  await page.waitForFunction(() => window.TeamCanvas && document.querySelector('#team-canvas-root .tc-board'));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: true, pending: false, running: false, revision: 1}})));
  return {page, errors};
}

// A 17-card checkpoint: 15 plots on a loose grid with mixed sizes (one square heatmap) and 2 illustrations.
function seventeenCardState() {
  const ids = STATIC.map(staticId).concat(PLOTLY);
  const nodes = ids.map((id, i) => ({id, label: 'Saved ' + id.replace(/^.*plot_/, ''), x: 30 + (i % 4) * 660, y: 30 + Math.floor(i / 4) * 560, width: id.endsWith('heat') ? 640 : 600 + (i % 3) * 10, height: id.endsWith('heat') ? 520 : 480 + (i % 2) * 20, visual: {background: '#ffffff'}, finished: null}));
  nodes.push({kind: 'illustration', assetVersion: '1', id: 'illustration_whole-blood_901', assetId: 'whole-blood', label: 'Whole blood', x: 30, y: 2300, width: 340, height: 260, visual: {background: '#ffffff'}, color: '#235c77', finished: null});
  nodes.push({kind: 'illustration', assetVersion: '1', id: 'illustration_pipette_902', assetId: 'pipette', label: 'Pipette', x: 400, y: 2300, width: 340, height: 260, visual: {background: '#ffffff'}, color: '#235c77', finished: null});
  return {version: '1', libraryHidden: false, nodes};
}

module.exports = {layoutPage, seventeenCardState, STATIC, PLOTLY, staticId};
