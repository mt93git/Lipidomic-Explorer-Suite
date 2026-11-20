import { describe, expect, it } from 'vitest';
import { applyEditor, presetEditor, type Figure } from './applyEditor';

// Synthetic lipids. Team's dashboard heatmap now sends one full-name tick per row (results_dashboard.R
// rd_team_heatmap_view); Nexo draws that figure and must keep every row label, under every preset.
const rows = Array.from({ length: 30 }, (_, i) => `TAG(${40 + i}:1_FA16:1)+NH4 synthetic`);
const figure: Figure = {
  data: [{ type: 'heatmap', x: ['A', 'B'], y: rows, z: rows.map((_, i) => [i, -i]) }],
  layout: { yaxis: { type: 'category', tickmode: 'array', tickvals: rows, ticktext: rows, tickfont: { size: 10 } } },
};
describe('dashboard heatmap row labels', () => {
  for (const preset of ['team', 'nexo', 'publication'] as const) {
    it(`keeps one full lipid name per row under the ${preset} preset`, () => {
      const out = applyEditor(figure, presetEditor(preset, figure));
      expect(out.layout.yaxis.tickvals).toEqual(rows);
      expect(out.layout.yaxis.ticktext).toEqual(rows);
    });
  }
});
