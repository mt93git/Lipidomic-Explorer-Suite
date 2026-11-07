// FIXR3B item 1 (Sol M3): a live Group comparison card's own downloads (button.tc-chip rows built by
// group_comparison.js) are in the inspector's Export tab. Real group_comparison.js, canvas_inspector.js and
// canvas_inspector_export.js: the Export tab mirrors Download data CSV, PNG, JPG, SVG and PDF; a mirror runs
// the chip's own handler and keeps the inspector open; the chips stay on the card and work as before; no
// other Group chip (All, None, conditions, panels) is recognised as a download or moved.
const { chromium } = require('../browser/ci/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
(async () => {
  const plotly = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], { encoding: 'utf8' }).trim();
  const b = await chromium.launch({ headless: true });
  try {
    const p = await b.newPage({ viewport: { width: 1400, height: 1100 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.setContent(`<section id="team-canvas-root"><div class="tc-toolbar"></div><div class="tc-layout"><main class="tc-main"><div class="tc-board"><article class="tc-node" data-plot-id="tcinstance_a-comparisonPlot"><header class="tc-node-head"><strong>Group comparison</strong></header><details class="tc-settings"><summary>Appearance</summary><label>Existing appearance<input id="existing-control"></label></details><div class="tc-content"><div id="tcinstance_a-comparisonPlot"><div class="gc-root" data-gc-instance="tcinstance_a"><div class="gc-plot"></div><div class="gc-controls"></div></div></div></div></article></div></main></div></section>`);
    await p.addStyleTag({ content: '[hidden]{display:none!important}.tc-node{width:760px}.tc-contextual-editing .tc-node>.tc-settings{display:none}.tc-selection-inspector{position:fixed;right:20px;top:10px;width:320px;max-height:90vh;overflow:auto;background:white;border:1px solid black;z-index:20}' });
    await p.evaluate(() => {
      window.TeamCanvas = { selected: () => null, getGroupComparison: () => null, setGroupComparison: () => true };
      window.Shiny = { handlers: {}, addCustomMessageHandler: (n, f) => Shiny.handlers[n] = f, setInputValue: () => {} };
      // Record downloads instead of navigating: group_comparison.js saves through a temporary <a download>.
      window.downloads = []; const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (this.download) { downloads.push(this.download); return; } return click.call(this); };
    });
    await p.addScriptTag({ path: plotly });
    for (const file of ['group_comparison.js', 'canvas_inspector_export.js', 'canvas_inspector.js']) await p.addScriptTag({ path: 'www/team/js/' + file });
    await p.evaluate(() => {
      const rows = [];
      for (const c of ['PC', 'PE']) for (const g of ['Healthy', 'A']) for (let i = 0; i < 3; i++) rows.push({ Feature: c, GroupingVal: g, Plot_Value: i + (g === 'A' ? 1 : 0), Is_Baseline: g === 'Healthy', P_Value: g === 'Healthy' ? null : .02, Significance: '*', Facet_Grp: 'All' });
      Shiny.handlers['team-group-comparison-data']({ id: 'tcinstance_a', rows, groups: ['Healthy', 'A'], baseline: ['Healthy'], requiresConfirmation: false, scienceSignature: 'a'.repeat(64), settings: { method: 'non_parametric', test: 'Wilcoxon rank-sum', comparison: 'Global (Combined Reference)', scale: 'log2fc', significance: 'star', grouping: ['Group1'] } });
    });
    await p.waitForFunction(() => document.querySelector('.gc-plot').data?.length > 0);
    const FORMATS = ['Download data CSV', 'Download PNG', 'Download JPG', 'Download SVG', 'Download PDF'];

    // Recognition: the download row and each download chip are exports; the other Group rows are not.
    const rec = await p.evaluate(() => {
      const sections = [...document.querySelectorAll('.gc-controls .gc-section')];
      const exportsRow = sections.find(s => /^Download plot/.test(s.querySelector('strong').textContent));
      const classes = sections.find(s => s.querySelector(':scope > strong').textContent === 'Lipid classes');
      const conditions = sections.find(s => s.querySelector(':scope > strong').textContent === 'Conditions');
      return {
        row: TeamInspectorExport.isExport(exportsRow),
        chips: [...exportsRow.querySelectorAll('button.tc-chip')].map(c => [c.textContent, TeamInspectorExport.isExport(c)]),
        classes: TeamInspectorExport.isExport(classes), conditions: TeamInspectorExport.isExport(conditions),
        other: [...document.querySelectorAll('.gc-controls button.tc-chip')].filter(c => !exportsRow.contains(c)).some(c => TeamInspectorExport.isExport(c))
      };
    });
    assert.equal(rec.row, true, 'the Group comparison download row is recognised as an export row');
    assert.deepEqual(rec.chips, [['Download data CSV', true], ['PNG', true], ['JPG', true], ['SVG', true], ['PDF', true]], 'each Group download chip is recognised');
    assert.equal(rec.classes || rec.conditions || rec.other, false, 'no other Group chip is recognised as a download');

    // Export tab: every download, mirrored; the chips themselves stay on the card.
    await p.evaluate(() => { window.chips = [...document.querySelectorAll('.gc-controls .gc-download')]; });
    const dialog = p.locator('#tc-selection-inspector');
    await p.locator('.tc-node-head strong').click();
    assert.equal(await dialog.isVisible(), true);
    await dialog.getByRole('tab', { name: 'Export', exact: true }).click();
    const exp = dialog.locator('#tc-inspector-panel-export');
    assert.deepEqual(await exp.locator('.tc-export-mirror').allTextContents(), FORMATS, 'Export holds every Group comparison download');
    const stay = await p.evaluate(() => ({
      onCard: chips.every(c => c.isConnected && c.closest('.tc-node .gc-controls') && !c.closest('#tc-selection-inspector')),
      movedChips: document.querySelectorAll('#tc-inspector-panel-export .tc-chip').length
    }));
    assert.equal(stay.onCard, true, 'the download chips stay on the card');
    assert.equal(stay.movedChips, 0, 'no Group chip is moved into Export');

    // A mirror runs the chip's own handler and keeps the inspector (and its Export tab) open.
    await exp.getByRole('button', { name: 'Download data CSV', exact: true }).click();
    await p.waitForFunction(() => downloads.includes('lipidomic-group-comparison.csv'));
    assert.equal(await dialog.isVisible(), true, 'a mirrored download keeps the inspector open');
    assert.equal(await dialog.getByRole('tab', { name: 'Export', exact: true }).getAttribute('aria-selected'), 'true');
    await exp.getByRole('button', { name: 'Download PNG', exact: true }).click();
    await p.waitForFunction(() => downloads.includes('lipidomic-group-comparison.png'), null, { timeout: 15000 });
    assert.equal(await dialog.isVisible(), true);

    // The chip on the card works as before (same handler), with or without the inspector.
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.getElementById('tc-selection-inspector').hidden);
    await p.locator('.gc-controls').getByRole('button', { name: 'Download data CSV', exact: true }).click();
    await p.waitForFunction(() => downloads.filter(d => d === 'lipidomic-group-comparison.csv').length === 2);

    // While a baseline awaits confirmation the chips are disabled: so are their mirrors.
    await p.evaluate(() => {
      const rows = [{ Feature: 'PC', GroupingVal: 'Healthy', Plot_Value: 1, Is_Baseline: true, P_Value: null, Facet_Grp: 'All' }, { Feature: 'PC', GroupingVal: 'A', Plot_Value: 2, Is_Baseline: false, P_Value: .02, Facet_Grp: 'All' }];
      Shiny.handlers['team-group-comparison-data']({ id: 'tcinstance_a', rows, groups: ['Healthy', 'A'], baseline: ['Healthy'], requiresConfirmation: true, confirmationToken: 't', scienceSignature: 'b'.repeat(64), settings: { method: 'non_parametric', test: 'Wilcoxon rank-sum', comparison: 'Global (Combined Reference)', scale: 'log2fc', significance: 'star', grouping: ['Group1'] } });
    });
    await p.locator('.tc-node-head strong').click();
    await dialog.getByRole('tab', { name: 'Export', exact: true }).click();
    await p.waitForFunction(() => { const m = [...document.querySelectorAll('#tc-inspector-panel-export .tc-export-mirror')]; return m.length === 5 && m.every(b => b.disabled); });
    assert.deepEqual(errors, []);
    console.log('PASS Group comparison downloads: recognised, mirrored in Export (CSV/PNG/JPG/SVG/PDF), same handlers, inspector stays open, chips stay on the card, other chips untouched');
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
