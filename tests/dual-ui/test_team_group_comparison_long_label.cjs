// Run with: node tests/dual-ui/test_team_group_comparison_long_label.cjs
// Round 5, item 7: a long condition name (146 characters) on a 604 px card. Production (84a24e5) wraps legend labels
// with a <br> every 18 characters and keeps the condition ticks. Wave 5 must wrap the same way (same number of lines),
// and every condition must stay identifiable: either the whole legend fits inside the card, or the condition tick
// labels are shown.
const { chromium } = require('../browser/ci/node_modules/playwright');
const assert = require('node:assert/strict'), path = require('node:path'), { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const LONG = 'Patients_with_long_term_inflammatory_disease_treated_with_high_dose_omega_3_supplementation_for_twelve_weeks_and_followed_up_at_week_twenty_four_X';
const GROUPS = ['Control', LONG, 'Healthy_volunteers'];

async function render(browser, lib, source, groups = GROUPS, features = ['PC']) {
  const p = await browser.newPage({ viewport: { width: 900, height: 1200 } }); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.setContent('<div style="width:604px"><div class="gc-root" data-gc-instance="tcinstance_a"><div class="gc-plot"></div><div class="gc-controls"></div></div></div>');
  await p.evaluate(() => { window.Shiny = { handlers: {}, addCustomMessageHandler: (n, f) => Shiny.handlers[n] = f, setInputValue: () => {} }; });
  for (const f of [lib, path.join(ROOT, 'www/team/js/plot_editor.js')]) await p.addScriptTag({ path: f });
  await p.addScriptTag({ content: source });
  await p.addStyleTag({ path: path.join(ROOT, 'www/team/css/group_comparison.css') });
  await p.evaluate(({ groups, features }) => {
    const rows = []; features.forEach((c, i) => groups.forEach((g, k) => Array.from({ length: 8 }, (_, j) => rows.push({ Sample: 's' + k + '-' + j, Feature: c, GroupingVal: g, Plot_Value: Math.sin(j * .7) + k + i * .3, Is_Baseline: k === 0, P_Value: null, Significance: k ? 'ns' : 'Reference', Facet_Grp: 'All' }))));
    Shiny.handlers['team-group-comparison-data']({ id: 'tcinstance_a', rows, groups, baseline: [groups[0]], inferenceAllowed: false, scienceSignature: 'a'.repeat(64), requiresConfirmation: false, settings: { method: 'non_parametric', comparison: 'Global (Combined Reference)', scale: 'log2fc', significance: 'star', test: 'Wilcoxon rank-sum', grouping: ['Group1'] } });
  }, { groups, features }).catch(() => {});
  await p.waitForFunction(() => document.querySelector('.gc-plot').data?.length > 0);
  if (features.length > 1) {
    await p.getByText('Display controls', { exact: true }).first().click().catch(() => {});
    for (const c of features.slice(1)) { const b = p.locator('.gc-controls').getByRole('button', { name: c, exact: true }); if (await b.count()) await b.first().click(); }
    await p.waitForFunction(n => new Set(document.querySelector('.gc-plot').data.map(t => t.meta?.teamPanel).filter(Boolean)).size === n, features.length, { timeout: 10000 }).catch(() => {});
  }
  await p.waitForTimeout(1500);
  const r = await p.evaluate(long => {
    const gd = document.querySelector('.gc-plot'), card = gd.getBoundingClientRect();
    const texts = Array.from(gd.querySelectorAll('.legendtext'));
    const longText = texts.find(t => t.textContent.replace(/\s/g, '').startsWith(long.slice(0, 18)));
    const lines = longText ? Math.max(1, longText.querySelectorAll('tspan.line').length) : 0;
    const overflow = texts.some(t => t.getBoundingClientRect().right > card.right + 1 || t.getBoundingClientRect().left < card.left - 1);
    const ticks = Array.from(gd.querySelectorAll('.xtick text')).filter(t => t.textContent.trim()).length;
    const sz = gd._fullLayout._size, panels = new Set(gd.data.map(t => t.meta?.teamPanel).filter(Boolean)).size;
    const yaxes = Object.keys(gd._fullLayout).filter(k => /^yaxis\d*$/.test(k)).map(k => gd._fullLayout[k]._length);
    const leg = gd.querySelector('.legend'), lb = leg ? leg.getBoundingClientRect() : null;
    // clipped: the legend box starts above the card, or runs into the plotting area below the top margin
    const clipped = !!lb && (lb.top < card.top - 1 || lb.bottom > card.top + sz.t + 1);
    return { lines, overflow, ticks, width: card.width, drawable: Math.round(sz.h), panelHeight: Math.round(Math.min(...yaxes)), panels, clipped, legendHeight: lb ? Math.round(lb.height) : 0, top: Math.round(sz.t) };
  }, LONG);
  await p.close();
  return Object.assign(r, { errors });
}

(async () => {
  const lib = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], { encoding: 'utf8' }).trim();
  const prod = execFileSync('git', ['show', '84a24e5:www/team/js/group_comparison.js'], { cwd: ROOT, encoding: 'utf8' });
  const here = require('node:fs').readFileSync(path.join(ROOT, 'www/team/js/group_comparison.js'), 'utf8');
  const browser = await chromium.launch({ headless: true });
  try {
    const p = await render(browser, lib, prod), w = await render(browser, lib, here);
    console.log('production', JSON.stringify(p), '\nwave 5   ', JSON.stringify(w));
    assert.deepEqual(w.errors, [], 'no page errors');
    assert.equal(Math.round(w.width), 604, 'the card is 604 px wide');
    assert.equal(p.lines, Math.ceil(Array.from(LONG).length / 18), 'production wraps the long label every 18 characters');
    assert.equal(w.lines, p.lines, 'Wave 5 wraps the long condition label exactly as production');
    assert.ok(!w.overflow || w.ticks >= GROUPS.length, 'every condition stays identifiable: the legend fits the card, or the condition ticks are shown');
    // Two panels, nine 8-character names and one 146-character name on the same 604 px card: the drawable height is at
    // least production's (240 px at 84a24e5).
    const MANY = Array.from({ length: 9 }, (_, i) => 'Group_' + String.fromCharCode(65 + i) + String(i)).concat([LONG]);
    assert.ok(MANY.slice(0, 9).every(g => g.length === 8));
    const p2 = await render(browser, lib, prod, MANY, ['PC', 'PE']), w2 = await render(browser, lib, here, MANY, ['PC', 'PE']);
    console.log('2 panels production', JSON.stringify(p2), '\n2 panels wave 5   ', JSON.stringify(w2));
    assert.equal(p2.panels, 2, 'production shows two panels'); assert.equal(w2.panels, 2, 'Wave 5 shows two panels');
    assert.ok(w2.drawable >= p2.drawable, `two panels: drawable height ${w2.drawable} px is at least production's ${p2.drawable} px`);
    assert.ok(!w2.clipped, 'two panels: the legend is not clipped');
    // Four 146-character conditions on the same 604 px card (several wrapped legend rows): every wrapped row counts in
    // the legend height, the legend is not clipped, and the drawable height is at least production's (235 px, one panel).
    const FOUR = ['A', 'B', 'C', 'D'].map(c => c + LONG.slice(1));
    assert.ok(FOUR.every(g => Array.from(g).length === 146));
    for (const feats of [['PC'], ['PC', 'PE']]) {
      const pf = await render(browser, lib, prod, FOUR, feats), wf = await render(browser, lib, here, FOUR, feats);
      console.log(feats.length + ' panel(s), four long labels production', JSON.stringify(pf), '\n                              wave 5   ', JSON.stringify(wf));
      assert.deepEqual(wf.errors, [], 'no page errors');
      assert.equal(wf.panels, feats.length, feats.length + ' panel(s) shown');
      assert.ok(wf.drawable >= pf.drawable, `four long labels, ${feats.length} panel(s): drawable height ${wf.drawable} px is at least production's ${pf.drawable} px`);
      if (feats.length === 1) assert.ok(wf.drawable >= 235, 'one panel: drawable height at least 235 px');
      assert.ok(!wf.clipped, `four long labels, ${feats.length} panel(s): the legend is not clipped (legend ${wf.legendHeight} px, top margin ${wf.top} px)`);
      assert.ok(!wf.overflow || wf.ticks >= FOUR.length, 'every condition stays identifiable');
    }
    console.log('PASS: a 146-character condition on a 604 px card wraps like production (' + w.lines + ' lines) and every condition stays identifiable' + (w.overflow ? ' (ticks shown)' : ' (legend fits the card)') + '; two panels and four 146-character labels (1 and 2 panels) keep at least production\'s drawable height with the legend unclipped');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
