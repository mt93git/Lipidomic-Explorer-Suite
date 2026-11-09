import { describe, expect, it } from 'vitest';
import { HEAT_PRESETS, heatPresetActions, heatState, heatStop, heatSummary } from './heatPresets';
import { reduceEditor } from '../../editor/editorState';
import { applyNexoStyle } from '../../editor/applyNexoStyle';
import { validateNexoStyle } from '../../state/nexo';
const heat = { type: 'heatmap', z: [[-2, 1], [3, 4]], colorscale: [[0, '#0047AB'], [.5, '#FFFFFF'], [1, '#FF0000']] };
const figure = { data: [heat, { type: 'scatter', x: [1], y: [2] }], layout: {} };
describe('F10 heat scale presets', () => {
  it('reads stops from an array scale and tolerates a named (string) Plotly colorscale', () => {
    expect(heatStop(heat.colorscale, 1)).toBe('#FFFFFF');
    expect(heatStop('Viridis', 0)).toBeUndefined();
    expect(heatStop(undefined, 2)).toBeUndefined();
    const named = [{ type: 'heatmap', z: [[1, 2]], colorscale: 'Viridis' }];
    expect(() => heatState(named, undefined)).not.toThrow();
    expect(heatState(named, undefined)).toBeNull();
    expect(heatState(named, reduceEditor({}, heatPresetActions(named, 'magma', false, false).action!))).toEqual({ id: 'magma', reverse: false });
  });
  it('writes Team scale keys on heatmap traces only, idempotently', () => {
    const { action } = heatPresetActions(figure.data, 'viridis', false, false);
    expect(action).toEqual({ type: 'traces', patches: [{ index: 0, scaleLow: '#440154', scaleMid: '#21918c', scaleHigh: '#fde725' }] });
    const once = reduceEditor({}, action!), twice = reduceEditor(once, action!);
    expect(twice).toBe(once);
    expect(heatState(figure.data, once)).toEqual({ id: 'viridis', reverse: false });
  });
  it('reverse swaps the ends and is recognised', () => {
    const { action } = heatPresetActions(figure.data, 'bwr', true, true);
    const ed = reduceEditor({}, action!);
    expect(ed.traces![0]).toMatchObject({ scaleLow: HEAT_PRESETS.find(p => p.id === 'bwr')!.stops[2] });
    expect(heatState(figure.data, ed)).toEqual({ id: 'bwr', reverse: true });
  });
  it('symmetric only for diverging presets, kept in Nexo style', () => {
    expect(heatPresetActions(figure.data, 'bwr', false, true).heatSymmetric).toBe(true);
    expect(heatPresetActions(figure.data, 'magma', false, true).heatSymmetric).toBe(false);
    expect(validateNexoStyle({ heatSymmetric: true })).toEqual({ heatSymmetric: true });
    expect(validateNexoStyle({ heatSymmetric: 'yes' })).toEqual({});
  });
  it('symmetric centres the scale on 0 without touching z', () => {
    const out = applyNexoStyle(structuredClone(figure) as never, { heatSymmetric: true });
    expect(out.data[0].zmid).toBe(0);
    expect(out.data[0].z).toEqual(heat.z);
    expect(out.data[1].zmid).toBeUndefined();
    expect(applyNexoStyle(out, { heatSymmetric: true })).toEqual(out);
  });
  it('summarises the state', () => {
    expect(heatSummary({ id: 'bwr', reverse: false }, true)).toBe('Diverging · symmetric');
    expect(heatSummary({ id: 'viridis', reverse: true }, false)).toBe('Viridis (3-stop) · reversed');
    expect(heatSummary(null, false)).toBe('Custom');
  });
});
