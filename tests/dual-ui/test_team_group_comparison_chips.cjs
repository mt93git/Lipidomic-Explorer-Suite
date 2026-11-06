// Run with: node tests/dual-ui/test_team_group_comparison_chips.cjs
// Optional: UX19_SHOTS=/some/dir writes before/after PNGs of the inspector.
// The group comparison's lipid-class chips (and its other toggle buttons) in the Team inspector were
// unstyled native buttons: grey, bevelled, clipped on the right of the 290 px column, with headings
// flush against the edge. gc_chips.css restyles them as Team pills. Only visuals change: clicking a
// chip must send exactly the same calls (TeamCanvas.setGroupComparison, Shiny inputs) as before.
const { chromium } = require('../browser/ci/node_modules/playwright');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const SHOTS = process.env.UX19_SHOTS || '';
const FAMILIES = {
  Glycerophospholipids: ['Cardiolipin', 'Lysophosphatidic Acid', 'Lysophosphatidylcholine', 'Lysophosphatidylethanolamine', 'Lysophosphatidylglycerol', 'Lysophosphatidylinositol', 'Lysophosphatidylserine', 'Phosphatidic Acid', 'Phosphatidylcholine', 'Phosphatidylethanolamine', 'Phosphatidylglycerol', 'Phosphatidylinositol', 'Phosphatidylserine'],
  Sphingolipids: ['Ceramide', 'Glucosylceramide', 'Lactosylceramide', 'Sphingomyelin'],
  Glycerolipids: ['Diacylglycerol', 'Triacylglycerol'],
  'Sterol Lipids': ['Cholesteryl Ester'],
  'Fatty Acyls': ['Acylcarnitine'],
};
// Team CSS in the order R/frontends/team/ui.R includes it (the subset that reaches the Canvas card).
const BASE_CSS = ['custom.css', 'libreros.css', 'workspace.css', 'canvas.css', 'workspace_minimal.css', 'group_comparison.css', 'canvas_inspector.css', 'shell.css'];

async function render(browser, lib, withChips, shot, width = 290, extra = []) {
  const p = await browser.newPage({ viewport: { width: 1000, height: 1000 } }); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.setContent(`<!DOCTYPE html><html><body class="ts-shell-app team-workspace-app"><div class="tc-contextual-editing">
    <div class="tc-main" style="margin-right:300px"><div class="tc-node" style="width:604px"><details class="tc-settings"><summary>Data &amp; settings</summary></details>
      <div class="tc-content"><div class="gc-root" data-gc-instance="gc1"><div class="gc-status"></div><div class="gc-plot"></div><div class="gc-controls"></div></div></div></div></div>
    <div class="ts-inspector-column" style="position:fixed;top:0;right:0;height:100vh;width:${width}px;display:flex;flex-direction:column;background:#fff;border-left:1px solid #e3e7ec">
      <aside class="tc-selection-inspector" style="position:static;width:auto;flex:1;overflow:auto;border:0;box-shadow:none;border-radius:0"><div class="tc-inspector-body"></div></aside></div>
  </div></body></html>`);
  await p.evaluate(() => {
    window.calls = [];
    window.Shiny = { handlers: {}, addCustomMessageHandler: (n, f) => Shiny.handlers[n] = f, setInputValue: (k, v) => calls.push(['input', k, v]) };
    window.TeamCanvas = { getGroupComparison: () => null, setGroupComparison: (id, v) => { calls.push(['canvas', id, JSON.parse(JSON.stringify(v))]); return true; }, invalidateGroupComparison: () => true };
  });
  for (const f of BASE_CSS) await p.addStyleTag({ path: path.join(ROOT, 'www/team/css', f) });
  if (withChips) await p.addStyleTag({ path: path.join(ROOT, 'www/team/css/gc_chips.css') });
  for (const f of [lib, path.join(ROOT, 'www/team/js/plot_editor.js'), path.join(ROOT, 'www/team/js/group_comparison.js')].concat(withChips ? [path.join(ROOT, 'www/team/js/gc_chips.js')] : [])) await p.addScriptTag({ path: f });
  await p.evaluate(({ FAMILIES, extra }) => {
    const families = {}, features = []; Object.entries(FAMILIES).forEach(([fam, cs]) => cs.forEach(c => { families[c] = fam; features.push(c); })); features.push(...extra);
    const groups = ['Control', 'Treated'], rows = [];
    features.forEach((c, i) => groups.forEach((g, k) => [0, 1, 2, 3].forEach(j => rows.push({ Sample: 's' + k + j, Feature: c, GroupingVal: g, Plot_Value: j + k + i * .1, Is_Baseline: k === 0, P_Value: null, Significance: k ? 'ns' : 'Reference', Facet_Grp: 'All' }))));
    Shiny.handlers['team-group-comparison-data']({ id: 'gc1', rows, groups, baseline: ['Control'], families, inferenceAllowed: false, scienceSignature: 'a'.repeat(64), requiresConfirmation: false,
      settings: { method: 'non_parametric', comparison: 'Global (Combined Reference)', scale: 'log2fc', significance: 'star', test: 'Wilcoxon rank-sum', grouping: ['Group1'] } });
  }, { FAMILIES, extra });
  await p.waitForSelector('.gc-inspector .tc-chip', { state: 'attached' });
  // canvas_inspector.js moves the selected card's .tc-settings into the inspector column.
  await p.evaluate(() => { const s = document.querySelector('.tc-node > .tc-settings'); document.querySelector('.tc-inspector-body').appendChild(s); s.open = true; });
  await p.waitForTimeout(300);
  if (process.env.UX19_DEBUG) console.log(await p.evaluate(() => { let e = document.querySelector('.gc-inspector'), out = [e.innerText.slice(0, 400)]; while (e) { const r = e.getBoundingClientRect(), c = getComputedStyle(e); out.push([e.tagName, e.className, c.display, c.visibility, Math.round(r.width), Math.round(r.height)].join(' ')); e = e.parentElement; } return out.join('\n'); }));
  if (shot) await p.locator('.tc-selection-inspector').screenshot({ path: shot });
  const m = await p.evaluate(() => {
    const box = document.querySelector('.gc-inspector'), boxR = box.getBoundingClientRect(), col = document.querySelector('.tc-selection-inspector');
    const classes = box.querySelector('.gc-section'); // "Lipid classes"
    const rows = Array.from(classes.querySelectorAll(':scope > .gc-section'));
    const chips = rows.flatMap(r => Array.from(r.querySelectorAll(':scope > button.tc-chip')));
    const cs = e => getComputedStyle(e);
    const on = chips.find(b => b.getAttribute('aria-pressed') === 'true'), off = chips.find(b => b.getAttribute('aria-pressed') === 'false');
    return {
      chips: chips.length,
      columnOverflow: col.scrollWidth - col.clientWidth,
      clipped: chips.filter(b => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > boxR.right + 0.5 || b.getBoundingClientRect().right > col.getBoundingClientRect().right).map(b => b.textContent),
      rowOverflow: rows.map(r => r.scrollWidth - r.clientWidth),
      heights: Array.from(new Set(chips.map(b => Math.round(b.getBoundingClientRect().height)))),
      onStyle: on && { bg: cs(on).backgroundColor, color: cs(on).color, glyph: getComputedStyle(on, '::before').content, radius: cs(on).borderTopLeftRadius },
      offStyle: off && { bg: cs(off).backgroundColor, color: cs(off).color, border: cs(off).borderTopColor + ' ' + cs(off).borderTopWidth, font: cs(off).fontSize, glyph: getComputedStyle(off, '::before').content },
      headings: rows.map(r => { const h = r.querySelector(':scope > strong'), b = r.querySelector(':scope > button'); return { text: h.textContent, dx: Math.round(b.getBoundingClientRect().left - h.getBoundingClientRect().left), font: cs(h).fontSize, transform: cs(h).textTransform, spacing: cs(h).letterSpacing, color: cs(h).color }; }),
      gap: cs(rows[0]).columnGap,
      cut: Array.from(box.querySelectorAll('button.tc-chip')).filter(b => b.scrollWidth > b.clientWidth + 1).map(b => ({ text: b.textContent, title: b.title })),
      outside: Array.from(box.querySelectorAll('button.tc-chip')).filter(b => b.offsetParent && b.getBoundingClientRect().right > col.getBoundingClientRect().right - 1).map(b => b.textContent),
    };
  });
  // Selection behaviour: click an unselected chip, a selected one, then None and All; record every call.
  const clicks = extra.length ? [] : ['Ceramide', 'Cardiolipin', 'Ceramide', 'None', 'All', 'Triacylglycerol'];
  const trail = [];
  for (const name of clicks) {
    await p.evaluate(() => { calls.length = 0; });
    await p.locator('.gc-inspector').getByRole('button', { name, exact: true }).first().click();
    await p.waitForTimeout(50);
    trail.push(await p.evaluate(() => ({ calls: calls.slice(), pressed: Array.from(document.querySelectorAll('.gc-inspector .gc-section .gc-section > button.tc-chip[aria-pressed=true]')).map(b => b.textContent) })));
  }
  await p.close();
  return Object.assign(m, { trail, errors });
}

(async () => {
  const lib = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], { encoding: 'utf8' }).trim();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const before = await render(browser, lib, false, SHOTS && path.join(SHOTS, 'gc_chips_before.png'));
    const after = await render(browser, lib, true, SHOTS && path.join(SHOTS, 'gc_chips_after.png'));
    console.log('before', JSON.stringify({ clipped: before.clipped, columnOverflow: before.columnOverflow, heights: before.heights, on: before.onStyle, dx: before.headings.map(h => h.dx) }));
    console.log('after ', JSON.stringify({ clipped: after.clipped, columnOverflow: after.columnOverflow, heights: after.heights, on: after.onStyle, off: after.offStyle, headings: after.headings, gap: after.gap }));
    assert.deepEqual(after.errors, [], 'no page errors');
    assert.equal(after.chips, 21, 'all 21 class chips render in the inspector');
    // No clipping
    assert.deepEqual(after.clipped, [], 'no chip is clipped or runs past the inspector');
    assert.ok(after.columnOverflow <= 0, 'the inspector column does not scroll sideways');
    assert.ok(after.rowOverflow.every(x => x <= 0), 'no family row overflows');
    // Pill style
    assert.deepEqual(after.heights, [28], 'every chip is 28 px tall');
    assert.equal(after.offStyle.bg, 'rgb(255, 255, 255)'); assert.equal(after.offStyle.color, 'rgb(20, 27, 36)');
    assert.equal(after.offStyle.border, 'rgb(227, 231, 236) 1px'); assert.equal(after.offStyle.font, '13px');
    assert.equal(after.offStyle.glyph, 'none', 'unselected chips carry no check');
    assert.equal(after.onStyle.bg, 'rgb(45, 95, 138)', 'selected chip filled with the Team accent');
    assert.equal(after.onStyle.color, 'rgb(255, 255, 255)');
    assert.match(after.onStyle.glyph, /✓/, 'selected chip shows a check');
    assert.equal(after.gap, '8px', 'chips sit 8 px apart');
    // Headings: aligned with the chips, Team label style
    assert.deepEqual(after.headings.map(h => h.text), Object.keys(FAMILIES));
    for (const h of after.headings) {
      assert.equal(h.dx, 0, `${h.text}: heading starts where its chips start`);
      assert.equal(h.font, '13px'); assert.equal(h.transform, 'uppercase'); assert.equal(h.color, 'rgb(90, 104, 120)');
    }
    // Behaviour identical to before the restyle
    assert.deepEqual(after.trail, before.trail, 'clicks send the same calls and leave the same selection as before');
    assert.deepEqual(after.trail[0].pressed, ['Cardiolipin', 'Ceramide'], 'clicking Ceramide adds it to the first class');
    assert.ok(after.trail[0].calls.some(c => c[0] === 'canvas' && c[1] === 'gc1-comparisonPlot' && c[2].features.includes('Ceramide')), 'the selection reaches TeamCanvas.setGroupComparison');
    assert.deepEqual(after.trail[3].pressed, [], 'None clears every class');
    assert.equal(after.trail[4].pressed.length, 21, 'All selects every class');
    // A narrow column (240 px) and a long label: nothing runs past the column; the cut label keeps its full text as a tooltip.
    const LONG = 'Phosphatidylethanolamine plasmalogen and ether species combined';
    const narrowBefore = await render(browser, lib, false, SHOTS && path.join(SHOTS, 'gc_chips_narrow_before.png'), 240, [LONG]);
    const narrow = await render(browser, lib, true, SHOTS && path.join(SHOTS, 'gc_chips_narrow_after.png'), 240, [LONG]);
    console.log('narrow before', JSON.stringify({ outside: narrowBefore.outside, columnOverflow: narrowBefore.columnOverflow }), '\nnarrow after ', JSON.stringify({ outside: narrow.outside, columnOverflow: narrow.columnOverflow, cut: narrow.cut }));
    assert.deepEqual(narrow.errors, []);
    assert.deepEqual(narrow.outside, [], 'narrow column: no chip runs past the inspector edge');
    assert.ok(narrow.columnOverflow <= 0, 'narrow column: no sideways scroll');
    assert.ok(narrow.rowOverflow.every(x => x <= 0), 'narrow column: no family row overflows');
    assert.deepEqual(narrow.cut, [{ text: LONG, title: LONG }], 'only the long label is cut, and its tooltip holds the full label');
    // Classic untouched: every rule in gc_chips.css is scoped under the Team shell.
    const css = fs.readFileSync(path.join(ROOT, 'www/team/css/gc_chips.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = css.split('}').map(r => r.split('{')[0].trim()).filter(Boolean).flatMap(s => s.split(/,(?![^(]*\))/).map(x => x.trim()));
    assert.ok(selectors.length > 5 && selectors.every(s => s.startsWith('body.ts-shell-app ')), 'every gc_chips.css selector starts with body.ts-shell-app');
    const ui = fs.readFileSync(path.join(ROOT, 'R/frontends/team/ui.R'), 'utf8');
    assert.match(ui, /www\/team\/css\/gc_chips\.css/, 'the Team UI includes gc_chips.css');
    console.log('PASS group comparison chips: unclipped Team pills, aligned headings, identical selection calls');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
