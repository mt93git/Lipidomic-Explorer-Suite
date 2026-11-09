// F10 heat scale presets: three Team stops (scaleLow/Mid/High); "symmetric around 0" is Nexo's heatSymmetric.
import { supportsHeatScale, type PlotObject } from '../../editor/applyEditor';
import type { Editor } from '../../state/document';
import type { EditorAction } from '../../editor/editorState';
export interface HeatPreset { id: string; name: string; kind: 'sequential' | 'diverging'; stops: readonly [string, string, string] }
export const HEAT_PRESETS: readonly HeatPreset[] = [
  { id: 'viridis', name: 'Viridis (3-stop)', kind: 'sequential', stops: ['#440154', '#21918c', '#fde725'] },
  { id: 'magma', name: 'Magma (3-stop)', kind: 'sequential', stops: ['#000004', '#b73779', '#fcfdbf'] },
  { id: 'cividis', name: 'Cividis (3-stop)', kind: 'sequential', stops: ['#00204c', '#7c7b78', '#ffe945'] },
  { id: 'grey', name: 'Grey', kind: 'sequential', stops: ['#f0f0f0', '#969696', '#252525'] },
  { id: 'bwr', name: 'Blue-white-red', kind: 'diverging', stops: ['#2166ac', '#f7f7f7', '#b2182b'] },
];
export type HeatState = { id: string; reverse: boolean } | null;
/** The colour at stop 0, .5 or 1 of a Plotly colorscale; a named scale ('Viridis') or a missing one has no editable stop. */
export const heatStop = (colorscale: unknown, i: number): unknown => Array.isArray(colorscale) ? (colorscale.find(s => Array.isArray(s) && s[0] === [0, .5, 1][i]) as unknown[] | undefined)?.[1] : undefined;
const heatIndexes = (traces: readonly PlotObject[]) => traces.flatMap((t, i) => supportsHeatScale(t) ? [i] : []);
export const hasHeatScale = (traces: readonly PlotObject[]) => heatIndexes(traces).length > 0;
/** One editor action over every editable heatmap of the card, plus whether Nexo's symmetric flag stays on. */
export function heatPresetActions(traces: readonly PlotObject[], id: string, reverse: boolean, symmetric: boolean): { action: EditorAction | null; heatSymmetric: boolean } {
  const preset = HEAT_PRESETS.find(p => p.id === id), indexes = heatIndexes(traces);
  if (!preset || !indexes.length) return { action: null, heatSymmetric: false };
  const [scaleLow, scaleMid, scaleHigh] = reverse ? [...preset.stops].reverse() : preset.stops;
  return { action: { type: 'traces', patches: indexes.map(index => ({ index, scaleLow, scaleMid, scaleHigh })) }, heatSymmetric: symmetric && preset.kind === 'diverging' };
}
/** The preset the first editable heatmap currently shows, either direction; null when custom. */
export function heatState(traces: readonly PlotObject[], editor: Editor | undefined): HeatState {
  const index = heatIndexes(traces)[0]; if (index === undefined) return null;
  const patch = editor?.traces?.find(t => t.index === index), trace = traces[index];
  const stops = (['scaleLow', 'scaleMid', 'scaleHigh'] as const).map((k, i) => String(patch?.[k] ?? heatStop(trace.colorscale, i) ?? '').toLowerCase());
  for (const p of HEAT_PRESETS) {
    if (p.stops.every((s, i) => s === stops[i])) return { id: p.id, reverse: false };
    if (p.stops.every((s, i) => s === stops[2 - i])) return { id: p.id, reverse: true };
  }
  return null;
}
export function heatSummary(state: HeatState, symmetric: boolean): string {
  const preset = state && HEAT_PRESETS.find(p => p.id === state.id);
  if (!preset) return 'Custom';
  return [preset.kind === 'diverging' ? 'Diverging' : preset.name, ...(state!.reverse ? ['reversed'] : []), ...(symmetric && preset.kind === 'diverging' ? ['symmetric'] : [])].join(' · ');
}
