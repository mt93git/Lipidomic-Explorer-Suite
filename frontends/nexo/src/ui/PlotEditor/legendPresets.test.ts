import { describe, expect, it } from 'vitest';
import { LEGEND_PRESETS, legendPresetOf } from './legendPresets';
import { reduceEditor, serializeEditor } from '../../editor/editorState';
describe('F12 legend presets', () => {
  it('each preset is a Team-valid layout patch, idempotent and recognised', () => {
    for (const p of LEGEND_PRESETS) {
      const once = reduceEditor({}, { type: 'layoutPatch', patch: p.patch });
      expect(serializeEditor(once).layout).toEqual(p.patch);
      expect(reduceEditor(once, { type: 'layoutPatch', patch: p.patch })).toBe(once);
      expect(legendPresetOf(once)?.id).toBe(p.id);
    }
  });
  it('hidden is showlegend false; others show it', () => {
    expect(LEGEND_PRESETS.find(p => p.id === 'hidden')!.patch).toEqual({ showlegend: false });
    expect(LEGEND_PRESETS.find(p => p.id === 'right-outside')!.patch).toMatchObject({ showlegend: true, 'legend.x': 1.02, 'legend.xanchor': 'left' });
    expect(legendPresetOf({ layout: { 'legend.x': .3 } })).toBeNull();
  });
});
// Chart audit b12-cells: Team's cell plots hide their legend (R/cell_show.R:82, :86, :106 showlegend=FALSE), so the
// Legend position grid wrote legend.x/y that Plotly never draws: a click changed nothing. A position shows the legend.
describe('legend position grid', () => {
  it('a position also shows the legend, so it is visible on a plot that hides it', async () => {
    const { legendPositionPatch } = await import('./legendPresets');
    expect(legendPositionPatch('Top', 'Left')).toEqual({ showlegend: true, 'legend.x': 0, 'legend.y': 1, 'legend.xanchor': 'left', 'legend.yanchor': 'top' });
    expect(legendPositionPatch('Bottom', 'Right')).toMatchObject({ showlegend: true, 'legend.x': 1, 'legend.y': 0, 'legend.xanchor': 'right', 'legend.yanchor': 'bottom' });
    const hidden = reduceEditor({ layout: { showlegend: false } }, { type: 'layoutPatch', patch: legendPositionPatch('Middle', 'Center') });
    expect(serializeEditor(hidden).layout).toMatchObject({ showlegend: true, 'legend.x': .5, 'legend.y': .5 });
  });
});
