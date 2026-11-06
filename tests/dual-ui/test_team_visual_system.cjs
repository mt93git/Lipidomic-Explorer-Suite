// Run with: node tests/dual-ui/test_team_visual_system.cjs
// RC5: the Team visual system.
//  1. Static, over every www/team/css file: no Tailwind blue / indigo / sky / violet / purple and no
//     violet hue; no text below 13 px (also in R/frontends/team/*.R markup and www/team/js inline
//     styles); exactly one !important :focus-visible rule (libreros.css); no new dead per-file
//     :focus-visible outlines (none in the wave-2 files, a ratchet on the older ones).
//  2. Wiring in R/frontends/team/ui.R: team_aria.js, and the workspace does not mount #guide-navigation.
//  3. Browser: a Tab walk of 26 stops on a guided page shows the one ring at every stop, including
//     inputs that custom.css strips with `outline:none!important`, the light ring on the navy bars and
//     the inset ring in menus; the workspace contexts (card footer, band notice, tab strip) keep their
//     tuned width and offset through the --lab-focus* tokens.
//  4. Browser: team_aria.js names the guided steps, hides the workspace numerals, names the Canvas
//     cards and gives the focusable card header a role. axe reports no critical issue on both
//     fixtures (axe-core is required; the six reference screens are the real-app axe run, not this test).
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('../browser/ci/node_modules/playwright');

const CSS_DIR = 'www/team/css';
// Remove @import by its quoted URL (the Google Fonts URL contains a `;`), as test_team_tool_header.cjs.
const IMPORT = /@import\s+(?:url\(\s*)?(['"])[^'"]*\1\s*\)?[^;]*;/g;
const css = name => fs.readFileSync(path.join(CSS_DIR, name), 'utf8').replace(IMPORT, '');
const REBOOT = '*,*::before,*::after{box-sizing:border-box}body{margin:0}';
const teamCss = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css')).sort()
  .map(f => [f, fs.readFileSync(path.join(CSS_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')]);
const rules = text => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({selector: m[1].trim(), body: m[2]}));

// ---- 1a. Colours ---------------------------------------------------------------------------------
const TAILWIND = [
  'eff6ff', 'dbeafe', 'bfdbfe', '93c5fd', '60a5fa', '3b82f6', '2563eb', '1d4ed8', '1e40af', '1e3a8a', '172554', // blue
  'eef2ff', 'e0e7ff', 'c7d2fe', 'a5b4fc', '818cf8', '6366f1', '4f46e5', '4338ca', '3730a3', '312e81', '1e1b4b', // indigo
  'f5f3ff', 'ede9fe', 'ddd6fe', 'c4b5fd', 'a78bfa', '8b5cf6', '7c3aed', '6d28d9', '5b21b6', '4c1d95', '2e1065', // violet
  'faf5ff', 'f3e8ff', 'e9d5ff', 'd8b4fe', 'c084fc', 'a855f7', '9333ea', '7e22ce', '6b21a8', '581c87', '3b0764', // purple
  'f0f9ff', 'e0f2fe', 'bae6fd', '7dd3fc', '38bdf8', '0ea5e9', '0284c7', '0369a1', '075985', '0c4a6e', '082f49'  // sky
];
const rgbOf = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
const TAILWIND_RGB = new Set(TAILWIND.map(h => rgbOf(h).join(',')));
function violet([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 255 && h <= 320 && s >= 0.2 && l > 0.08 && l < 0.97;
}
const colourHits = [];
for (const [file, text] of teamCss) {
  for (const {body} of rules(text)) {
    for (const m of body.matchAll(/#([0-9a-f]{6})(?:[0-9a-f]{2})?(?![0-9a-f])|#([0-9a-f]{3})(?![0-9a-f])/gi)) {
      const hex = (m[1] || m[2].replace(/./g, c => c + c)).toLowerCase(), rgb = rgbOf(hex);
      if (TAILWIND_RGB.has(rgb.join(','))) colourHits.push(`${file}: Tailwind ${m[0]}`);
      else if (violet(rgb)) colourHits.push(`${file}: violet ${m[0]}`);
    }
    for (const m of body.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
      const rgb = m.slice(1, 4).map(Number);
      if (TAILWIND_RGB.has(rgb.join(','))) colourHits.push(`${file}: Tailwind ${m[0]})`);
      else if (violet(rgb)) colourHits.push(`${file}: violet ${m[0]})`);
    }
  }
}
assert.deepEqual(colourHits, [], 'Team CSS uses the libreros.css palette: no Tailwind blue or violet');

// ---- 1b. Minimum text size -----------------------------------------------------------------------
// The Figure page paper (canvas_preview.css) scales its own furniture with clamp(…cqw…): that is the
// printed figure, not interface text, and is left to the page. font-size:0 hides text on purpose.
const SIZE = /font-size\s*:\s*(\.\d+|\d+(?:\.\d+)?)(px|rem)\b/gi;
const SHORTHAND = /(?:^|[;{\s])font\s*:\s*(?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00)\s+)*(\.\d+|\d+(?:\.\d+)?)(px|rem)\b/gi;
// The mascot is frozen at production d814775 (Gerardo, 2026-11-04; wave2b-carryover.md). Its own
// stylesheets and behaviour are not changed by any wave, so results that come only from the mascot
// itself are reported as 'frozen (as d814775)', not as FAIL. A control the RESTING mascot covers still FAILS.
// The exemption only holds while those files are byte-identical to production d814775.
// The approved Wave 5 exceptions (formatAnswer, guidance-wording getters, session-only getters, grounded-yield guard,
// namesLibraryTerm and kbTerms) live in one shared helper, also used by test_team_scope_guard.cjs and
// test_team_inspector_toggle.cjs. With them taken back out each file must be byte-identical to d814775.
const MASCOT_EXCEPTIONS = require('./mascot_exceptions.cjs');
for (const f of ['www/team/css/companion_assistant.css','www/team/css/companion_guidance.css','www/team/css/context_help.css','www/team/css/mascot_refine.css','www/team/js/companion_workspace.js','www/team/js/companion_assistant.js','www/team/js/companion_guidance.js','www/team/js/companion_guidance_data.js','www/team/js/context_help.js','www/team/js/companion_art.js']) {
  assert.ok(MASCOT_EXCEPTIONS.frozenMatches(f, 'd814775'), `mascot file ${f} must be byte-identical to d814775 (frozen; only the approved formatAnswer lines, guidance-wording getters, grounded-yield condition and session-only text getters may differ)`);
}
{ const leaks = MASCOT_EXCEPTIONS.negativeControl('d814775'); assert.deepEqual(leaks, [], 'negative control: a one-character change outside the approved exceptions must fail:\n' + leaks.join('\n')); }
const MASCOT_CSS = new Set(['companion_assistant.css', 'companion_guidance.css', 'context_help.css', 'mascot_refine.css']);
const small = [];
for (const [file, raw] of teamCss) {
  if (MASCOT_CSS.has(path.basename(file))) continue;
  const text = raw.replace(/[^{}]*\.companion-actions \.assistant-dock-chat\{[^}]*\}/g, '');
  for (const re of [SIZE, SHORTHAND]) for (const m of text.matchAll(re)) {
    const px = Number(m[1]) * (m[2].toLowerCase() === 'rem' ? 16 : 1);
    if (px !== 0 && px < 13) small.push(`${file}: ${m[0].trim()}`);
  }
}
assert.deepEqual(small, [], 'no Team text is set below 13 px');

// The same floor for text set in Team-rendered R markup (inline style= and tags$style blocks in
// R/frontends/team/*.R) and in inline styles written by www/team/js (style strings, .style.fontSize).
// No allowlist (FIXR3B item 4): the Lexicon badges in ui.R are 13 px now. em sizes are relative to their
// context and are not checked statically; Bootstrap's em-based classes (.small, small, .form-text,
// .help-block, .badge, .btn-xs) are measured in the browser block below instead.
// Residual exception, by design: the Figure page paper's clamp(…cqw…) furniture (printed figure, see above).
const R_DIR = 'R/frontends/team', JS_DIR = 'www/team/js';
const FONT_SIZE_ASSIGN = /fontSize\s*=\s*['"](\.\d+|\d+(?:\.\d+)?)(px|rem)\b/gi;
// SHORTHAND, also right after the quote that opens a style string.
const MARKUP_SHORTHAND = /(?:^|[;{\s'"`])font\s*:\s*(?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00)\s+)*(\.\d+|\d+(?:\.\d+)?)(px|rem)\b/gi;
const markupSmall = [];
const sources = fs.readdirSync(R_DIR).filter(f => f.endsWith('.R')).sort().map(f => [f, path.join(R_DIR, f)])
  .concat(fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort().map(f => [f, path.join(JS_DIR, f)]));
const MASCOT_SOURCES = new Set(['companion_workspace.js', 'companion_assistant.js', 'companion_guidance.js', 'companion_guidance_data.js', 'context_help.js', 'companion_art.js', 'companion_workspace.R']); // frozen at d814775
for (const [file, full] of sources) {
  if (MASCOT_SOURCES.has(file)) continue;
  const text = fs.readFileSync(full, 'utf8');
  for (const re of [SIZE, MARKUP_SHORTHAND, FONT_SIZE_ASSIGN]) for (const m of text.matchAll(re)) {
    const px = Number(m[1]) * (m[2].toLowerCase() === 'rem' ? 16 : 1);
    if (px === 0 || px >= 13) continue;
    markupSmall.push(`${file}: ${m[0].trim().replace(/^[;{'"`\s]+/, '')}`);
  }
}
assert.deepEqual(markupSmall, [], 'no Team R markup or Team script sets text below 13 px');

// ---- 1b'. Dead per-file focus outlines ----------------------------------------------------------
// libreros.css's !important ring (1c) wins over every other :focus-visible outline, so a per-file
// `outline` on a rule that only matches the focused element itself is dead code. Contexts tune the
// ring with --lab-focus* instead. Files cleaned in wave 2 must have none; the older files keep at most
// their current count (a ratchet: new dead rules fail, removing one is always fine).
const DEAD_FOCUS_BASELINE = {
  'canvas.css': 3, 'canvas_preview.css': 3, 'cell_show.css': 6, 'companion_assistant.css': 1,
  'context_help.css': 3, 'dashboard.css': 1, 'dashboard_selection.css': 1, 'guided.css': 2,
  'illustrations.css': 1, 'login_validation.css': 1, 'mobile_steps.css': 2, 'plot_editor.css': 2, 'scientific_insight.css': 2,
  'tools_drawer.css': 1, 'workspace_minimal.css': 2
};
const splitTop = s => { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(') depth++; else if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()).filter(Boolean); };
const lastCompound = sel => { let depth = 0, start = 0; for (let i = 0; i < sel.length; i++) { const ch = sel[i]; if (ch === '(') depth++; else if (ch === ')') depth--; else if (!depth && /[\s>+~]/.test(ch)) start = i + 1; } return sel.slice(start); };
const ownFocus = sel => { const c = lastCompound(sel).replace(/:not\((?:[^()]|\([^()]*\))*\)/g, ''); return /:focus-visible/.test(c) && !/::/.test(c.slice(c.indexOf(':focus-visible'))); };
const deadFocus = {};
for (const [file, text] of teamCss)
  for (const r of rules(text)) {
    const sels = splitTop(r.selector);
    if (!sels.length || !sels.every(ownFocus)) continue;
    if (!r.body.split(';').some(d => /^\s*outline(?:-[a-z]+)?\s*:/i.test(d) && !/!important/i.test(d))) continue;
    deadFocus[file] = (deadFocus[file] || 0) + 1;
  }
const overBaseline = Object.entries(deadFocus).filter(([file, n]) => n > (DEAD_FOCUS_BASELINE[file] || 0)).map(([file, n]) => `${file}: ${n} (allowed ${DEAD_FOCUS_BASELINE[file] || 0})`);
assert.deepEqual(overBaseline, [], 'no new dead per-file :focus-visible outline (use --lab-focus, --lab-focus-width, --lab-focus-offset)');
for (const file of ['card_frame.css', 'card_status.css', 'canvas_band_status.css', 'canvas_inspector.css', 'canvas_tabs.css', 'canvas_viewport.css',
  'experiment_cards.css', 'palette_editor.css', 'palette_swatches.css', 'pending_changes_bar.css'])
  assert.equal(deadFocus[file] || 0, 0, `${file}: its dead :focus-visible outlines were removed`);
const deadTotal = Object.values(deadFocus).reduce((a, b) => a + b, 0);

// ---- 1c. One :focus-visible rule -----------------------------------------------------------------
const forced = [];
for (const [file, text] of teamCss)
  for (const r of rules(text))
    if (/:focus-visible/.test(r.selector) && /(?:^|;)\s*outline(?:-[a-z]+)?\s*:[^;]*!important/i.test(r.body)) forced.push({file, selector: r.selector, body: r.body});
assert.equal(forced.length, 1, 'exactly one !important :focus-visible rule in Team CSS: ' + JSON.stringify(forced.map(f => f.file + ' ' + f.selector)));
assert.equal(forced[0].file, 'libreros.css');
assert.match(forced[0].body, /outline:var\(--lab-focus-width,3px\) solid var\(--lab-focus,#2d5f8a\)!important/);
assert.match(forced[0].body, /outline-offset:var\(--lab-focus-offset,3px\)!important/);
assert.match(fs.readFileSync(path.join(CSS_DIR, 'libreros.css'), 'utf8'), /--lab-focus:var\(--lab-blue\); --lab-focus-width:3px; --lab-focus-offset:3px;/);

// ---- 2. Wiring -----------------------------------------------------------------------------------
const teamUi = fs.readFileSync('R/frontends/team/ui.R', 'utf8');
assert.match(teamUi, /^ *includeScript\("www\/team\/js\/team_aria\.js"\),$/m, 'team_aria.js is registered on its own line');
assert.match(teamUi, /^ *if \(team_workspace_enabled\(\)\) tagList\(Filter\(function\(tag\) !identical\(tag\$attribs\$id, "guide-navigation"\), guide_header\(\)\)\) else guide_header\(\),$/m,
  'the workspace mounts guide_header() without the seven-step bar; guided Team keeps all of it');
assert.equal((teamUi.match(/guide_header\(\)/g) || []).length, 2, 'guide_header() is still the only source of #guide-context and #guide-analysis-toolbar');

// ---- 3 + 4. Browser ------------------------------------------------------------------------------
const STEPS = ['Experiment', 'Design', 'Quality', 'My question', 'Results', '3D Show', 'Share'];
const GUIDED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Guided</title></head><body class="guided-app">
<nav class="navbar" aria-label="Main"><a class="navbar-brand" href="#top">Lipidomic Explorer</a>
  <a class="nav-link" href="#experiment">Experiment</a>
  <div class="dropdown"><button type="button" class="nav-link dropdown-toggle">Data &amp; Overview</button>
    <ul class="dropdown-menu" style="display:block;position:static;background:#fff"><li><a class="dropdown-item" href="#info">App Info</a></li></ul></div></nav>
<div id="guide-navigation"><nav aria-label="Analysis workflow">${STEPS.map((s, i) => `<button type="button" class="guide-step" data-guide-step="${i + 1}" aria-current="${i === 2 ? 'step' : 'false'}"><span>${i + 1}</span>${s}</button>`).join('')}</nav>
  <div class="guide-global-actions"><button type="button" class="guide-button" data-guide-step="5">All analysis tools</button></div></div>
<div id="guide-context"><button type="button" class="guide-button">Review changes</button></div>
<div id="guide-analysis-toolbar"><select id="guide_tool" class="form-select" aria-label="Analysis tool"><option>Heatmap</option></select></div>
<main class="guide-page">
  <h1>Quality</h1>
  <input id="t-text" class="form-control" type="text" aria-label="Sample name">
  <input id="t-number" class="form-control" type="number" aria-label="Minimum detection">
  <div class="dataTables_wrapper"><div class="dataTables_filter"><input type="search" aria-label="Search table"></div></div>
  <button type="button" class="btn btn-primary">Update prepared data</button>
  <a href="#methods">Methods</a>
  <details><summary>Resume from a saved session</summary></details>
  <textarea aria-label="Design notes"></textarea>
  <label><input type="checkbox"> I reviewed the design</label>
  <label><input type="radio" name="d"> Independent</label>
  <button type="button" class="btn btn-outline-primary">Edit sample labels</button>
  <button type="button" class="accordion-button">Advanced preparation</button>
  <div class="nav-tabs"><button type="button" class="nav-link">Data table</button></div>
</main></body></html>`;
// Expected ring per stop: [label, colour, width, offset].
const BLUE = 'rgb(45, 95, 138)', LIGHT = 'rgb(120, 175, 224)';
const GUIDED_STOPS = [
  ['navbar brand', LIGHT, '3px', '3px'], ['navbar link', LIGHT, '3px', '3px'], ['navbar menu', LIGHT, '3px', '3px'],
  ['menu item (inset)', BLUE, '3px', '-3px'],
  ...STEPS.map(s => [`step ${s}`, LIGHT, '3px', '3px']), ['All analysis tools', LIGHT, '3px', '3px'],
  ['Review changes', BLUE, '3px', '3px'], ['Analysis tool select', BLUE, '3px', '3px'],
  ['text input (outline:none!important in custom.css)', BLUE, '3px', '3px'], ['number input', BLUE, '3px', '3px'],
  ['DataTables search', BLUE, '3px', '3px'], ['primary button', BLUE, '3px', '3px'], ['link', BLUE, '3px', '3px'],
  ['summary', BLUE, '3px', '3px'], ['textarea', BLUE, '3px', '3px'], ['checkbox', BLUE, '3px', '3px'], ['radio', BLUE, '3px', '3px'],
  ['outline button', BLUE, '3px', '3px'], ['accordion button', BLUE, '3px', '3px'], ['tab', BLUE, '3px', '3px']
];

const WORKSPACE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Canvas</title></head>
<body class="ts-shell-app team-workspace-app guided-app" data-tw-screen="canvas" data-guide-step="5" data-guide-analysis="false" data-team-authenticated="true">
<nav class="navbar" aria-label="Main"><div class="ts-topbar-extras">
  <nav class="ts-steps" aria-label="Analysis steps"><button type="button" class="ts-step"><em>1</em><span>Data</span></button><button type="button" class="ts-step is-current" aria-current="step"><em>2</em><span>Review</span></button><button type="button" class="ts-step"><em>3</em><span>Canvas</span></button></nav>
  <button type="button" class="ts-signout">Sign out</button></div></nav>
<main>
<section id="team-workspace"><nav class="tw-steps" aria-label="Workspace steps">
  <button type="button" data-tw-stage="data" aria-current="false"><span>01</span><strong>Data</strong></button>
  <button type="button" data-tw-stage="review" aria-current="step"><span>02</span><strong>Review</strong></button>
  <button type="button" data-tw-stage="canvas" aria-current="false" aria-label="Canvas is locked. Prepare the current data in Review first."><span>03</span><strong>Canvas</strong></button></nav></section>
<section id="team-canvas-root" class="ts-shell" aria-label="Figure canvas"><div class="tc-main">
  <div class="tc-canvas-tablist" role="tablist" aria-label="Canvas tabs"><button type="button" role="tab" aria-selected="true">Draft 1</button><button type="button" role="tab" aria-selected="false" tabindex="-1">Draft 2</button></div>
  <div class="tc-band-status"><p class="tc-status is-visible" tabindex="0">Added Volcano Plot</p></div>
  <div class="ts-menu" style="display:block;position:static"><button type="button" class="ts-menu-item">3D cell</button></div>
  <div class="tc-board" style="position:relative;height:900px">
    <article class="tc-node tc-card-framed" data-plot-id="volcano" style="position:absolute;left:20px;top:20px;width:520px;height:368px">
      <div class="tc-node-head" tabindex="0" aria-label="Move Volcano Plot with arrow keys"><strong>Volcano Plot</strong>
        <div class="tc-card-actions"><button type="button" class="tc-card-edit">Edit</button><button type="button">Duplicate</button></div></div>
      <div class="tc-content" style="height:280px"></div><div class="tc-card-foot" aria-hidden="true"></div></article>
    <article class="tc-node tc-illustration" style="position:absolute;left:580px;top:20px;width:300px;height:260px">
      <div class="tc-node-head" tabindex="0" aria-label="Move Cell membrane illustration with arrow keys"><strong>Cell membrane</strong></div></article>
  </div></div></section></main></body></html>`;
const WORKSPACE_STOPS = [
  // #team-workspace .tw-steps is hidden by shell.css (its .ts-steps mirror in the top bar is the one in the Tab order).
  ['Data (top bar)', LIGHT, '3px', '3px'], ['Review (top bar)', LIGHT, '3px', '3px'], ['Canvas (top bar)', LIGHT, '3px', '3px'], ['Sign out', LIGHT, '3px', '3px'],
  ['canvas tab (inset)', BLUE, '3px', '-3px'], ['band notice (navy, inset)', LIGHT, '2px', '-3px'], ['Analysis tools item (inset)', BLUE, '3px', '-3px'],
  ['card header (move handle)', BLUE, '3px', '3px'], ['card footer Edit', BLUE, '2px', '1px'], ['card footer Duplicate', BLUE, '2px', '1px'],
  ['illustration header', BLUE, '3px', '3px']
];

async function walk(page, stops) {
  const seen = [];
  for (const [label, colour, width, offset] of stops) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const a = document.activeElement, cs = getComputedStyle(a);
      return {tag: a.tagName, text: (a.getAttribute('aria-label') || a.textContent || a.type || '').trim().slice(0, 40),
        style: cs.outlineStyle, width: cs.outlineWidth, colour: cs.outlineColor, offset: cs.outlineOffset, visible: a.matches(':focus-visible')};
    });
    seen.push(ring.text);
    assert.equal(ring.visible, true, `${label}: keyboard focus is :focus-visible`);
    assert.equal(ring.style, 'solid', `${label} (${ring.tag} "${ring.text}"): the ring is drawn`);
    assert.equal(ring.colour, colour, `${label}: ring colour`);
    assert.equal(ring.width, width, `${label}: ring width`);
    assert.equal(ring.offset, offset, `${label}: ring offset`);
  }
  return seen;
}

function axePath() {
  for (const base of [path.resolve('tests/browser/ci/node_modules'), path.resolve('node_modules'), process.cwd()]) {
    try { return require.resolve('axe-core/axe.min.js', {paths: [base]}); } catch (e) { /* next */ }
  }
  return null;
}
// axe is required: a missing axe-core fails the test instead of skipping the check it claims.
// Install it next to Playwright: (cd tests/browser/ci && npm install --no-save axe-core).
async function axeCritical(page) {
  const file = axePath();
  assert.ok(file, 'axe-core is required for the axe checks: run (cd tests/browser/ci && npm install --no-save axe-core)');
  await page.addScriptTag({path: file});
  return page.evaluate(async () => (await window.axe.run(document, {resultTypes: ['violations']})).violations
    .filter(v => v.impact === 'critical').map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`));
}

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // ---- Guided page: 26 stops --------------------------------------------------------------------
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    await page.setContent(GUIDED);
    for (const f of ['custom.css', 'libreros.css', 'guided.css', 'qw_a11y.css', 'qw_layers.css']) await page.addStyleTag({content: css(f)});
    await page.addStyleTag({content: REBOOT});
    await page.addScriptTag({path: path.resolve('www/team/js/team_aria.js')});
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const guidedSeen = await walk(page, GUIDED_STOPS);
    assert.ok(GUIDED_STOPS.length >= 25, 'the Tab walk covers at least 25 stops');
    assert.equal(guidedSeen[6], 'Step 3 of 7: Quality', 'the third stop is the current step, named with its position');

    // ARIA on the guided steps.
    assert.equal(await page.getByRole('button', {name: 'Step 3 of 7: Quality', exact: true}).count(), 1);
    assert.equal(await page.getByRole('button', {name: 'Step 4 of 7: My question', exact: true}).count(), 1);
    assert.equal(await page.locator('#guide-navigation [data-guide-step="3"]').getAttribute('aria-current'), 'step', 'aria-current stays guided.js\'s');
    assert.equal(await page.locator('.guide-global-actions [data-guide-step]').getAttribute('aria-label'), null, 'only the seven steps are renamed');
    assert.deepEqual(await axeCritical(page), [], 'axe: no critical issue on the guided fixture');
    await page.close();

    // ---- 13 px floor on Bootstrap-sized module markup (FIXR3B item 4) ----------------------------------
    // The guided Quality page renders R/modules markup the Team frontend cannot edit: "All" / "None" as
    // a.btn.btn-xs (12 px) and a p.small helper (12.25 px). Bootstrap's em/rem rules come first (as bslib
    // and its BS3 compatibility layer set them), then the Team stylesheets: every visible text is >= 13 px.
    const floor = await browser.newPage({viewport: {width: 1440, height: 900}});
    await floor.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Quality</title></head><body class="guided-app">
      <main class="guide-page"><h1>Quality</h1>
        <div class="shiny-input-container"><label class="control-label">Samples</label>
          <a id="qc-all" class="btn btn-default btn-xs" href="#">All</a> <a id="qc-none" class="btn btn-default btn-xs" href="#">None</a>
          <button id="xs-inline" type="button" class="btn btn-xs btn-outline-secondary py-0 px-2" style="font-size: 0.7rem">1:1</button>
          <div class="btn-group btn-group-xs"><button id="xs-group" type="button" class="btn btn-default">4:3</button></div></div>
        <p id="helper" class="small text-muted">Select at least one sample before confirming the design.</p>
        <p>Detected in <small id="tag-small">8 of 12 samples</small></p>
        <div id="form-text" class="form-text">Samples flagged by the QC rule.</div>
        <span id="help-block" class="help-block">Optional.</span>
        <p><span id="badge" class="badge bg-secondary">3 groups</span> <small><small id="nested">nested</small></small></p>
      </main></body></html>`);
    await floor.addStyleTag({content: 'body{font-size:1rem}.small,small{font-size:.875em}.form-text{margin-top:.25rem;font-size:.875em}.badge{display:inline-block;font-size:.75em}' +
      '.btn{display:inline-block;font-size:1rem}.btn-xs,.btn-group-xs>.btn{padding:1px 5px;font-size:.75rem;line-height:1.5}.help-block{display:block;margin:5px 0 10px;color:#737373}'});
    for (const f of ['custom.css', 'libreros.css', 'guided.css', 'qw_a11y.css']) await floor.addStyleTag({content: css(f)});
    // custom.css gives .btn a 150 ms transition: measure once font sizes have settled.
    await floor.waitForTimeout(400);
    const sizes = await floor.evaluate(() => {
      const px = el => parseFloat(getComputedStyle(el).fontSize);
      const named = Object.fromEntries(['qc-all', 'qc-none', 'xs-inline', 'xs-group', 'helper', 'tag-small', 'form-text', 'help-block', 'badge', 'nested'].map(id => [id, px(document.getElementById(id))]));
      // Every element that paints text of its own.
      const below = [...document.querySelectorAll('main *')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && el.getClientRects().length && px(el) < 12.95)
        .map(el => `${el.id || el.tagName}: ${px(el)}px`);
      return {named, below};
    });
    for (const [id, size] of Object.entries(sizes.named)) assert.ok(size >= 12.95, `${id} renders at ${size}px (min 13)`);
    assert.deepEqual(sizes.below, [], 'no visible text below 13 px on the Quality fixture');
    await floor.close();

    // ---- Workspace page: tuned rings and card ARIA ---------------------------------------------
    const ws = await browser.newPage({viewport: {width: 1440, height: 900}});
    await ws.setContent(WORKSPACE);
    for (const f of ['custom.css', 'libreros.css', 'workspace.css', 'workspace_minimal.css', 'qw_a11y.css', 'qw_layers.css', 'shell.css', 'canvas_band_status.css', 'card_frame.css'])
      await ws.addStyleTag({content: css(f)});
    await ws.addStyleTag({content: REBOOT + '#team-canvas-root .tc-band-status{position:relative}'});
    await ws.addScriptTag({path: path.resolve('www/team/js/team_aria.js')});
    await ws.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await walk(ws, WORKSPACE_STOPS);

    // Stage bars: the numeral is hidden from assistive technology; workspace.js keeps its labels.
    assert.equal(await ws.locator('.ts-steps').getByRole('button', {name: 'Review', exact: true}).count(), 1, 'top bar stage named "Review", not "2Review"');
    assert.deepEqual(await ws.evaluate(() => Array.from(document.querySelectorAll('#team-workspace .tw-steps [data-tw-stage] > span, .ts-steps em'), n => n.getAttribute('aria-hidden'))), Array(6).fill('true'));
    assert.equal(await ws.locator('[data-tw-stage="data"]').getAttribute('aria-label'), null, 'a ready stage keeps no aria-label (workspace.js owns it)');
    assert.match(await ws.locator('[data-tw-stage="canvas"]').getAttribute('aria-label'), /Canvas is locked/, 'a lock reason is never overwritten');

    // Cards: named by their title; the focusable header is a named group.
    assert.equal(await ws.getByRole('article', {name: 'Volcano Plot', exact: true}).count(), 1);
    assert.equal(await ws.getByRole('article', {name: 'Cell membrane', exact: true}).count(), 1);
    assert.equal(await ws.getByRole('group', {name: 'Move Volcano Plot with arrow keys', exact: true}).count(), 1);
    await ws.evaluate(() => { document.querySelector('.tc-node strong').textContent = 'Volcano · KO vs WT'; });
    await ws.waitForFunction(() => document.querySelector('.tc-node').getAttribute('aria-label') === 'Volcano · KO vs WT');
    await ws.evaluate(() => {
      const node = document.createElement('article'); node.className = 'tc-node';
      node.innerHTML = '<div class="tc-node-head" tabindex="0" aria-label="Move PCA with arrow keys"><strong>PCA</strong></div>';
      document.querySelector('.tc-board').appendChild(node);
    });
    await ws.waitForFunction(() => document.querySelector('.tc-node:last-child').getAttribute('aria-label') === 'PCA');
    assert.equal(await ws.locator('.tc-node:last-child .tc-node-head').getAttribute('role'), 'group', 'a card added later is covered too');
    assert.equal(await ws.evaluate(() => document.querySelectorAll('[id]').length), await ws.evaluate(() => new Set(Array.from(document.querySelectorAll('[id]'), n => n.id)).size), 'no id is cloned or added twice');
    assert.deepEqual(await axeCritical(ws), [], 'axe: no critical issue on the workspace fixture');
    await ws.close();
  } finally {
    await browser.close();
  }
  console.log(`PASS: Team visual system (Libreros palette, 13 px floor in Team CSS, R markup and scripts, one focus ring at ${GUIDED_STOPS.length + WORKSPACE_STOPS.length} stops, ${deadTotal} legacy dead focus outlines left (none in wave-2 files), step and card ARIA, axe on the guided and workspace fixtures, workspace without the seven-step bar)`);
})().catch(err => { console.error(err); process.exit(1); });
