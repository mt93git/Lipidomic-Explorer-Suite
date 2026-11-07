// ux29/help: Plain help close returns focus to a visible control (F-24); a cancelled mascot drag does not
// swallow the next click (F-25); a style change on a finished plot reports "Choose Edit first" (F-03);
// an inconsistent statistics result is only logged, never changed or rejected (F-30).
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('../browser/ci/node_modules/playwright');

(async () => {
  // ---- F-30 (pure client contract, no browser).
  const stats = require(path.resolve('www/team/js/canvas_statistics.js'));
  const hex = c => c.repeat(64);
  const applied = {test: 'welch', correction: 'holm', scope: 'displayed', comparisons: [['A', 'B']], effect: 'hedges_g'};
  const result = {fingerprint: hex('a'), dataFingerprint: hex('b'), computedAt: '2026-10-30T12:00:00.000Z', lipid: 'PC(34:1)', grouping: 'Group1',
    family: {m: 1, features: 1, comparisons: 1, untestable: 0},
    groups: [{group: 'A', nSamples: 3, nExcluded: 0, nParticipants: 3}],
    rows: [{a: 'A', b: 'B', nA: 3, nB: 4, statistic: 2.5, df: 4.8, p: 0.0123, pAdj: 0.0123, effect: 1.2, note: ''}],
    provenance: {method: 'Welch', transformation: 'log10', normalization: 'PQN', imputation: 'No imputation', participantIds: 'unique', design: 'Independent.'}};
  const saved = {version: '1', presentation: {show: true, pValue: 'adjusted', label: 'both', fontSize: 12, spacing: 0.08, tip: 0.02, nDisplay: 'both', hidden: []}, applied, result};
  const warnings = [], warn = console.warn; console.warn = (...a) => warnings.push(a.join(' '));
  let out; try { out = stats.sanitize(JSON.parse(JSON.stringify(saved))); out = stats.sanitize(JSON.parse(JSON.stringify(saved))); } finally { console.warn = warn; }
  // The same module without the check: the sanitized (saved, drawn) state must be byte-identical.
  const src = require('node:fs').readFileSync(path.resolve('www/team/js/canvas_statistics.js'), 'utf8');
  assert.ok(src.includes('    warnInconsistentGroups(groups, rows, v.fingerprint);\n'));
  const mod = {exports: {}}; new Function('module', 'exports', src.replace('    warnInconsistentGroups(groups, rows, v.fingerprint);\n', ''))(mod, mod.exports);
  const without = mod.exports.sanitize(JSON.parse(JSON.stringify(saved)));
  assert.equal(JSON.stringify(out), JSON.stringify(without), 'the inconsistent result is byte-identical to the result without the check');
  assert.deepEqual(out, saved, 'and is kept as given (log only)');
  assert.equal(warnings.length, 1, 'one warning per result'); assert.match(warnings[0], /missing from groups: B/);
  const fine = JSON.parse(JSON.stringify(saved)); fine.result.fingerprint = hex('c'); fine.result.groups.push({group: 'B', nSamples: 4, nExcluded: 0, nParticipants: 4});
  console.warn = (...a) => warnings.push(a.join(' ')); try { stats.sanitize(fine); } finally { console.warn = warn; }
  assert.equal(warnings.length, 1, 'a consistent result logs nothing');

  const browser = await chromium.launch({headless: true});
  try {
    // ---- F-24 / F-25: the companion.
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent(`<!doctype html><html><head></head><body class="team-workspace-app" style="margin:0">
      <nav class="navbar" style="height:60px"></nav><div id="guide-context"></div><main style="height:1200px"><section id="team-workspace"></section></main></body></html>`);
    await page.addStyleTag({path: path.resolve('www/team/css/context_help.css')});
    await page.evaluate(() => { window.$ = () => ({on: () => {}}); try { localStorage.clear(); } catch (e) {} Element.prototype.setPointerCapture = () => {}; });
    for (const f of ['help_content', 'companion_art', 'context_help']) await page.addScriptTag({path: path.resolve(`www/team/js/${f}.js`)});
    await page.evaluate(() => window.LipidomicHelp.setContext({step: 1, tool: ''}));
    await page.waitForSelector('.companion-speech', {state: 'visible'});
    // F-25: a drag ended by pointercancel leaves the next click working.
    await page.evaluate(() => {
      const l = document.querySelector('.companion-launcher'), r = l.getBoundingClientRect(), o = {bubbles: true, pointerId: 7, button: 0, isPrimary: true};
      l.dispatchEvent(new PointerEvent('pointerdown', {...o, clientX: r.left + 10, clientY: r.top + 10}));
      l.dispatchEvent(new PointerEvent('pointermove', {...o, clientX: r.left + 40, clientY: r.top + 40}));
      l.dispatchEvent(new PointerEvent('pointercancel', o));
    });
    assert.equal(await page.locator('.companion-speech').count(), 1, 'speech still shown before the click');
    await page.evaluate(() => document.querySelector('.companion-launcher').click());
    assert.equal(await page.locator('.companion-speech').count(), 0, 'the click after a cancelled drag is not swallowed');
    // F-24: ⚙ → Plain help hides the dock; closing help puts focus on a visible control.
    await page.locator('.companion-settings').click();
    await page.locator('.companion-choice', {hasText: 'Plain help'}).click();
    await page.locator('.lipid-help-close').click();
    const focused = await page.evaluate(() => { const a = document.activeElement; return {tag: a.tagName, cls: a.className, visible: a.getClientRects().length > 0}; });
    assert.notEqual(focused.tag, 'BODY', 'focus is not lost to the page'); assert.ok(focused.visible, 'focus is on a visible control: ' + JSON.stringify(focused));
    assert.deepEqual(errors, []);
    await page.close();

    // ---- F-03: a style change on a locked (finished) plot calls onLocked and saves nothing.
    const library = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], {encoding: 'utf8'}).trim();
    const p2 = await browser.newPage();
    await p2.setContent('<div id="plot"></div><div id="editor"></div>');
    await p2.addScriptTag({path: library}); await p2.addScriptTag({path: path.resolve('www/team/js/plot_editor.js')});
    const r = await p2.evaluate(async () => {
      const gd = document.getElementById('plot'); await Plotly.newPlot(gd, [{x: [1, 2], y: [3, 4], name: 'A', marker: {color: '#112233'}}], {});
      let state = {layout: {}, traces: []}, calls = 0, locked = 0;
      TeamPlotEditor.mount({container: document.getElementById('editor'), getPlot: () => gd, isLocked: () => true, onLocked: () => locked++, getState: () => state, onChange: n => { calls++; state = n; }});
      Array.from(document.querySelectorAll('#editor button')).find(b => b.textContent.trim() === 'Publication style').click();
      return {calls, locked};
    });
    assert.deepEqual(r, {calls: 0, locked: 1});
    // canvas.js wires onLocked to the Canvas status (or TeamCanvasFeedback) with the agreed text.
    assert.match(require('node:fs').readFileSync('www/team/js/canvas.js', 'utf8'), /onLocked:function\(\)\{var m='Choose Edit first to change a finished plot\.'/);
    await p2.close();
    console.log('PASS help focus, cancelled drag, finished-plot notice, statistics log-only check');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
