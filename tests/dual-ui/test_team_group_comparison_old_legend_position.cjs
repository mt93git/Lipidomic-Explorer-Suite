// Run with: node tests/dual-ui/test_team_group_comparison_old_legend_position.cjs
// Old saved figures carry the previous automatic right-side legend anchor (legend.x 1.02, xanchor left).
// Under the horizontal top legend bar that anchor is ignored: the Canvas replay of such a saved figure
// ends with the bar at the top-left, above the panels, inside the figure, with the panels keeping their
// width. Only that exact anchor is reset ({x 1.02, xanchor left, y 1, yanchor top}). Any other saved position is the user's choice and is kept (here legend.x 1.25, and the editor's
// "Bottom Right" button): the bar stays where the user put it, inside the figure. In every case the legend
// fitter settles within the redraw limit of 20 relayouts, also after redraws.
const { chromium } = require('../browser/ci/node_modules/playwright');
const assert = require('node:assert/strict'), path = require('node:path'), { execFileSync } = require('node:child_process');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const lib = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], { encoding: 'utf8' }).trim();
    for (const saved of [
      { 'legend.x': 1.02, 'legend.xanchor': 'left', 'legend.y': 1, 'legend.yanchor': 'top' },
      { 'legend.x': 1.25, 'legend.xanchor': 'left' },
      { 'legend.x': 1, 'legend.xanchor': 'right', 'legend.y': 0, 'legend.yanchor': 'bottom' },
      // At x 1.02 only the exact old default is reset: a customised vertical position, or a bottom-anchored bar, is the user's.
      { 'legend.x': 1.02, 'legend.xanchor': 'left', 'legend.y': 0.25, 'legend.yanchor': 'middle' },
      { 'legend.x': 1.02, 'legend.xanchor': 'left', 'legend.y': 0, 'legend.yanchor': 'bottom' }]) {
      const kept = !(saved['legend.x'] === 1.02 && saved['legend.y'] === 1 && saved['legend.yanchor'] === 'top'), want = kept ? saved : { 'legend.x': 0, 'legend.xanchor': 'left' };
      const p = await browser.newPage({ viewport: { width: 900, height: 1000 } }); const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.setContent('<div style="width:604px" class="tc-node"><div class="gc-root" data-gc-instance="tcinstance_a"><div class="gc-plot"></div><div class="gc-controls"></div></div></div>');
      await p.evaluate(saved => {
        window.Shiny = { handlers: {}, addCustomMessageHandler: (n, f) => Shiny.handlers[n] = f, setInputValue: () => {} };
        // The Canvas replays the figure's saved editor state after every draw, as it does for a restored checkpoint.
        window.replays = 0; window.TeamCanvas = { reapplyGroupComparisonEditor: () => { window.replays++; return TeamPlotEditor.apply(document.querySelector('.gc-plot'), { layout: saved }); } };
      }, saved);
      for (const f of [lib, 'www/team/js/plot_editor.js', 'www/team/js/group_comparison.js']) await p.addScriptTag({ path: path.resolve(f) });
      await p.addStyleTag({ path: path.resolve('www/team/css/group_comparison.css') });
      await p.evaluate(() => {
        const rows = []; ['Acylcarnitine', 'Cardiolipin'].forEach((c, i) => ['Healthy', 'SC-PainCrisis', 'SC-SteadyState'].forEach((g, k) => Array.from({ length: 12 }, (_, j) => rows.push({ Sample: 's' + k + '-' + j, Feature: c, GroupingVal: g, Plot_Value: Math.sin(j * .7) + k + i * .2, Is_Baseline: k === 0, P_Value: null, Significance: k ? 'ns' : 'Reference', Facet_Grp: 'All' }))));
        Shiny.handlers['team-group-comparison-data']({ id: 'tcinstance_a', rows, groups: ['Healthy', 'SC-PainCrisis', 'SC-SteadyState'], baseline: ['Healthy'], inferenceAllowed: false, scienceSignature: 'a'.repeat(64), requiresConfirmation: false, settings: { method: 'non_parametric', comparison: 'Global (Combined Reference)', scale: 'log2fc', significance: 'star', test: 'Wilcoxon rank-sum', grouping: ['Group1'] } });
      });
      await p.waitForFunction(() => document.querySelector('.gc-plot').data?.length > 0 && window.replays > 0);
      await p.evaluate(() => { window.fitEvents = 0; document.querySelector('.gc-plot').on('plotly_relayout', () => window.fitEvents++); });
      const check = async label => {
        await p.waitForFunction(w => { const l = document.querySelector('.gc-plot').layout.legend; return Object.keys(w).every(k => l[k.slice(7)] === w[k]) && l.orientation === 'h'; }, want, { timeout: 10000 });
        await p.waitForTimeout(600); const settled = await p.evaluate(() => window.fitEvents); await p.waitForTimeout(500);
        assert.equal(await p.evaluate(() => window.fitEvents), settled, label + ': legend fit settles without a relayout loop');
        assert(settled < 20, label + ': legend fitting stays within the redraw limit (' + settled + ')');
        const g = await p.evaluate(() => {
          const gd = document.querySelector('.gc-plot'), r = gd.getBoundingClientRect(), size = gd._fullLayout._size, bar = gd.querySelector('.legend').getBoundingClientRect();
          return { w: r.width, plotW: size.w, marginR: size.r, plotTop: r.top + size.t, barBottom: bar.bottom, labels: [...gd.querySelectorAll('.legendtext')].map(e => { const b = e.getBoundingClientRect(); return { text: e.textContent, left: b.left - r.left, right: b.right - r.left, top: b.top - r.top, bottom: b.bottom - r.top }; }) };
        });
        assert.deepEqual(g.labels.map(x => x.text), ['Healthy', 'SC-PainCrisis', 'SC-SteadyState'], label + ': every condition is in the legend bar');
        for (const x of g.labels) assert(x.left >= -1 && x.right <= g.w + 1 && x.top >= -1, label + ': legend label inside the figure ' + JSON.stringify(x));
        if (!kept) {
          assert(g.barBottom <= g.plotTop + 1, label + ': the legend bar sits above the panels');
          assert(g.marginR <= 60 && g.plotW >= 0.7 * g.w, label + ': the panels keep their width (margin.r ' + g.marginR + ', plot ' + g.plotW + ' of ' + g.w + ')');
        }
        return settled;
      };
      const first = await check('restored ' + JSON.stringify(saved));
      // A redraw (one more panel) replays the saved state again; the old position is ignored again, still bounded.
      await p.evaluate(() => { window.fitEvents = 0; }); const before = await p.evaluate(() => window.replays);
      await p.getByText('Display controls', { exact: true }).click(); await p.getByRole('button', { name: 'Cardiolipin', exact: true }).click();
      await p.waitForFunction(n => document.querySelector('.gc-plot').data.length === 9 && window.replays > n, before);
      await check('redrawn ' + JSON.stringify(saved));
      assert.deepEqual(errors, []);
      console.log('ok', JSON.stringify(saved), 'relayouts after restore:', first);
      await p.close();
    }
    console.log('PASS: the old automatic right-side legend anchor (x 1.02) is ignored under the top legend bar; positions the user saved (x 1.25, Bottom Right, x 1.02 with a custom or bottom anchor) are kept; all fit the figure and settle within the redraw limit');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
