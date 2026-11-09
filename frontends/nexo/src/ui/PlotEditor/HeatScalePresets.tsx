import { HEAT_PRESETS, hasHeatScale, heatPresetActions, heatState, heatSummary } from './heatPresets';
import type { PlotEditorProps } from './PlotEditor';
import { proStrings as s } from '../strings';
/** F10: one-click heat scales for heatmap cards; hidden on other plots. */
export default function HeatScalePresets(p: PlotEditorProps) {
  if (!hasHeatScale(p.traces)) return null;
  const state = heatState(p.traces, p.editor), symmetric = !!p.nexoStyle?.heatSymmetric;
  const preset = state && HEAT_PRESETS.find(x => x.id === state.id), diverging = preset?.kind === 'diverging';
  const pick = (id: string, reverse: boolean, sym: boolean) => {
    const { action, heatSymmetric } = heatPresetActions(p.traces, id, reverse, sym);
    if (action) p.onChange(action);
    if (p.onNexoStyle && heatSymmetric !== symmetric) { const { heatSymmetric: _, ...rest } = p.nexoStyle ?? {}; p.onNexoStyle(heatSymmetric ? { ...rest, heatSymmetric } : rest); }
  };
  const group = (kind: 'sequential' | 'diverging', label: string) => <div className="plot-editor-chips" role="group" aria-label={label}>
    {HEAT_PRESETS.filter(x => x.kind === kind).map(x => <button key={x.id} type="button" aria-pressed={state?.id === x.id} onClick={() => pick(x.id, state?.reverse ?? false, symmetric || kind === 'diverging')}>
      <span className="palette-swatches" aria-hidden="true">{x.stops.map(c => <i key={c} style={{ background: c }} />)}</span>{x.name}</button>)}
  </div>;
  return <details className="pro-heat-presets"><summary>{s.heatPresets} <span className="pro-summary">{heatSummary(state, symmetric)}</span></summary>
    <p>{s.heatNote}</p>
    <p>{s.heatSequential}</p>{group('sequential', s.heatSequential)}
    <p>{s.heatDiverging}</p>{group('diverging', s.heatDiverging)}
    <label>{s.heatReverse}<input type="checkbox" disabled={!preset} checked={!!state?.reverse} onChange={e => preset && pick(preset.id, e.target.checked, symmetric)} /></label>
    <label title={diverging ? undefined : s.heatSymmetricOff}>{s.heatSymmetric}<input type="checkbox" disabled={!diverging || !p.onNexoStyle} checked={diverging && symmetric} onChange={e => preset && pick(preset.id, state!.reverse, e.target.checked)} /></label>
    {!diverging && <p>{s.heatSymmetricOff}</p>}
  </details>;
}
