// F12 legend presets: Team layout keys only (legend.x/y/anchors/orientation, showlegend); Plotly auto-margins make room outside.
import type { Editor, EditorLayout } from '../../state/document';
export interface LegendPreset { id: string; name: string; patch: EditorLayout }
export const LEGEND_PRESETS: readonly LegendPreset[] = [
  { id: 'top-right-inside', name: 'Top right inside', patch: { showlegend: true, 'legend.x': .98, 'legend.y': .98, 'legend.xanchor': 'right', 'legend.yanchor': 'top', 'legend.orientation': 'v' } as EditorLayout },
  { id: 'right-outside', name: 'Right outside', patch: { showlegend: true, 'legend.x': 1.02, 'legend.y': 1, 'legend.xanchor': 'left', 'legend.yanchor': 'top', 'legend.orientation': 'v' } as EditorLayout },
  { id: 'bottom-horizontal', name: 'Bottom horizontal', patch: { showlegend: true, 'legend.x': .5, 'legend.y': -.2, 'legend.xanchor': 'center', 'legend.yanchor': 'top', 'legend.orientation': 'h' } as EditorLayout },
  { id: 'hidden', name: 'Hidden', patch: { showlegend: false } as EditorLayout },
];
/** A cell of the Legend position grid. It also shows the legend: Team plots that hide theirs (showlegend=FALSE) would
 * otherwise take the position and draw nothing. */
export function legendPositionPatch(vertical: 'Top' | 'Middle' | 'Bottom', horizontal: 'Left' | 'Center' | 'Right'): EditorLayout {
  const col = ['Left', 'Center', 'Right'].indexOf(horizontal), row = ['Top', 'Middle', 'Bottom'].indexOf(vertical);
  return { showlegend: true, 'legend.x': [0, .5, 1][col], 'legend.y': [1, .5, 0][row], 'legend.xanchor': (['left', 'center', 'right'] as const)[col], 'legend.yanchor': (['top', 'middle', 'bottom'] as const)[row] } as EditorLayout;
}
/** The preset the editor's legend keys match exactly; null when custom or untouched. */
export function legendPresetOf(editor: Editor | undefined): LegendPreset | null {
  const layout = (editor?.layout ?? {}) as Record<string, unknown>;
  if (layout.showlegend === false) return LEGEND_PRESETS.find(p => p.id === 'hidden')!;
  return LEGEND_PRESETS.find(p => p.id !== 'hidden' && Object.entries(p.patch).every(([k, v]) => layout[k] === v)) ?? null;
}
/** Whether the figure has anything to list in a legend: a series that is not hidden from it and has a name, or a
 * pie-like trace (its legend lists its labels). Team's guided QC plot (one unnamed trace) has none; Plotly would only
 * show "trace 0". */
export function hasLegendEntries(data: readonly { type?: string; name?: unknown; showlegend?: boolean; labels?: unknown }[]): boolean {
  return data.some(t => t.showlegend !== false && ((typeof t.name === 'string' && t.name.trim() !== '') || ['pie', 'funnelarea'].includes(t.type ?? '')));
}
