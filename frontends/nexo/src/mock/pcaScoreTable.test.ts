import { describe, expect, it } from 'vitest';
import { mockPcaGroups, mockPcaScoreFigure, pcaScoreTableLayout } from './pcaScore';
// Team R/frontends/team/results_dashboard.R rd_pca_score_table_layout: the PCA score card's group table sizes itself
// from the number of groups so every row stays inside the figure (a 10-group study showed only 4 rows). Up to four
// groups keep header 0.215, step 0.052, domain 0.28. The mock draws its canned figure with the same rule.
describe('PCA score group table layout', () => {
  it('keeps the original layout up to four groups', () => {
    for (const n of [2, 3, 4]) { const t = pcaScoreTableLayout(n); expect(t.head).toBeCloseTo(0.215); expect(t.step).toBeCloseTo(0.052); expect(t.domain).toBeCloseTo(0.28); }
  });
  it.each([[10, 0.0428, 0.435, 0.5], [16, 0.03, 0.487, 0.552]])('fits all %i rows inside the figure, as Team', (n, step, head, domain) => {
    const t = pcaScoreTableLayout(n);
    expect(t.step).toBeCloseTo(step, 6); expect(t.head).toBeCloseTo(head, 6); expect(t.domain).toBeCloseTo(domain, 6);
    const rows = Array.from({length: n}, (_, j) => t.head - t.step * (j + 1));
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(0); expect(t.head).toBeLessThan(t.domain);
  });
  it('draws the canned figure with that layout, colour dots on their rows', () => {
    const f = mockPcaScoreFigure({pcs_pc: 'PC1'}) as any, t = pcaScoreTableLayout(mockPcaGroups.length);
    expect(f.layout.yaxis2.domain).toEqual([0, t.domain]); expect(f.layout.yaxis2.range).toEqual([0, t.domain]); expect(f.layout.yaxis.domain).toEqual([t.domain, 1]);
    for (const g of mockPcaGroups) {
      const row = f.layout.annotations.find((a: any) => a.text === `${g} (n = 4)`), dot = f.data.find((d: any) => d.meta?.teamLegendProxy && d.name === g);
      expect(dot.y[0]).toBeCloseTo(row.y, 9); expect(row.y).toBeGreaterThanOrEqual(0);
    }
  });
});
