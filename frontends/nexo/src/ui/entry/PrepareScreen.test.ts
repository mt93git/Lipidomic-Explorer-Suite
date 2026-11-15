import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { PreparationChoices } from '../../api/types';
// React's hooks as plain state, so the page is called as a function and its tree read (the Share.test.tsx pattern).
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[] }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [hooks.values[i], (v: unknown) => { hooks.values[i] = typeof v === 'function' ? (v as (p: unknown) => unknown)(hooks.values[i]) : v; }]; },
  useId: () => 'prep', useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
const edge = vi.hoisted(() => ({ openDatasetSession: vi.fn(), confirmDesign: vi.fn(), datasetPreview: vi.fn() }));
vi.mock('../../api', () => ({ openDatasetSession: edge.openDatasetSession, confirmDesign: edge.confirmDesign, AdminSignInRequired: class extends Error {}, adminSignInUrl: () => '' }));
vi.mock('../../api/datasetSession', () => ({ datasetPreview: edge.datasetPreview }));
import { PrepareScreen } from './PrepareScreen';

// The 422 preparation_choices_required body with Team's guided defaults (C3) and the Metadata sheet's groups.
const samples = ['Control_1', 'Control_2', 'Control_3', 'Treated_1', 'Treated_2', 'Treated_3'];
const choices: PreparationChoices = { error: 'unprocessable', reason: 'preparation_choices_required', message: 'Team asks for these preparation choices',
  missing: [
    { name: 'samples', label: 'Samples', kind: 'samples', choices: samples, teamControlDefault: samples },
    { name: 'minDetectionPct', label: 'Minimum detection (%)', kind: 'number', min: 0, max: 100, step: 5, teamControlDefault: 0 },
    { name: 'detectionScope', label: 'Detection across', kind: 'choice', choices: ['global', 'group'], teamControlDefault: 'global' },
    { name: 'dropNonDetected', label: 'Drop lipids not detected in any sample', kind: 'boolean', teamControlDefault: true },
    { name: 'normalizationMethod', label: 'Normalization', kind: 'choice', choices: ['median', 'pqn', 'none'], teamControlDefault: 'median' },
    { name: 'useImputation', label: 'Impute missing values (QRILC)', kind: 'boolean', teamControlDefault: true },
    { name: 'imputeZerosPerFile', label: 'For each file, impute all-NA lipids to 0', kind: 'boolean', teamControlDefault: true },
    { name: 'imputeRemainingNAtoZero', label: 'Final cleanup: impute any remaining NAs to 0', kind: 'boolean', teamControlDefault: false }
  ], availableSamples: samples, sampleGroups: Object.fromEntries(samples.map(s => [s, s.split('_')[0]])) };
const dataset = { adminDatasetId: '3f6c1e2a-7b4d-4a8e-9c01-5d2f8e7a0041', orderCode: 'ORD041', version: 1 };
const defaults = { minDetectionPct: 0, detectionScope: 'global', dropNonDetected: true, normalizationMethod: 'median', useImputation: true, imputeZerosPerFile: true, imputeRemainingNAtoZero: false };
const session = { sessionId: 'synthetic-session', design: { allowed: false, unit: null, type: null, confirmed: false } };
const prepared = vi.fn(), cancelled = vi.fn();
beforeEach(() => { hooks.values = []; hooks.effects = []; vi.useFakeTimers(); edge.datasetPreview.mockResolvedValue(null); edge.openDatasetSession.mockResolvedValue({ status: 'ready', session }); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const text = (node: any): string => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
function elements(node: any): ReactElement<any>[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function render() { hooks.cursor = 0; hooks.effects = []; return elements(PrepareScreen({ dataset, choices, onPrepared: prepared, onCancel: cancelled })); }
const byText = (tree: ReactElement<any>[], type: string, label: string) => tree.find(e => e.type === type && text(e) === label)!;
// A label's own words: a select's options are not part of its name.
const own = (e: ReactElement<any>) => text([e.props.children].flat().filter((c: any) => c?.type !== 'select'));
const input = (tree: ReactElement<any>[], label: string) => tree.find(e => e.type === 'label' && own(e) === label)!.props.children.find((c: any) => c?.type === 'input' || c?.type === 'select');
const changed = (tree: ReactElement<any>[]) => text(tree.find(e => e.props?.className === 'grow changed'));
// The preview effect of the last render, then the slider's pause.
async function settle() { hooks.effects.forEach(effect => effect()); await vi.advanceTimersByTimeAsync(300); }
async function submit(tree: ReactElement<any>[]) { await tree.find(e => e.type === 'form')!.props.onSubmit({ preventDefault() {} }); }

it('prefills Team\'s defaults: every sample ticked in its group, slider at 0, all selected samples, QRILC, median', () => {
  const tree = render();
  expect(tree.filter(e => e.props?.className === 'grp').map(g => text(g.props.children[0]))).toEqual(['Control', 'Treated']);
  for (const sample of samples) expect(input(tree, sample).props.checked).toBe(true);
  expect(tree.find(e => e.type === 'input' && e.props.type === 'range')!.props.value).toBe(0);
  expect(byText(tree, 'button', 'All selected samples').props['aria-pressed']).toBe(true);
  expect(input(tree, 'Estimate with QRILC').props.checked).toBe(true);
  expect(byText(tree, 'button', 'Median (log scale)').props['aria-pressed']).toBe(true);
  expect(input(tree, 'Leave out lipids never detected in the selected samples').props.checked).toBe(true);
  expect(input(tree, 'Replace remaining missing values with zero').props.checked).toBe(false);
  expect(input(tree, 'Imputation seed').props.value).toBe('42');
  expect(changed(tree)).toBe('All settings are Team’s defaults.');
});

it('counts the changes from Team\'s defaults', () => {
  byText(render(), 'button', 'PQN (linear scale)').props.onClick();
  input(render(), 'Treated_3').props.onChange({ target: { checked: false } });
  input(render(), 'Treated_2').props.onChange({ target: { checked: false } });
  const tree = render();
  expect(changed(tree)).toBe('2 changes from Team’s defaults · Reset');
  expect(byText(tree, 'button', 'PQN (linear scale)').props['aria-pressed']).toBe(true);
});

it('Reset puts Team\'s defaults back and keeps the study design', () => {
  byText(render(), 'button', 'None').props.onClick();
  input(render(), 'Control_1').props.onChange({ target: { checked: false } });
  input(render(), 'Experimental unit').props.onChange({ target: { value: 'Animal' } });
  input(render(), 'Imputation seed').props.onChange({ target: { value: '7' } });
  byText(render(), 'button', 'Reset').props.onClick();
  const tree = render();
  expect(changed(tree)).toBe('All settings are Team’s defaults.');
  expect(input(tree, 'Control_1').props.checked).toBe(true);
  expect(byText(tree, 'button', 'Median (log scale)').props['aria-pressed']).toBe(true);
  expect(input(tree, 'Imputation seed').props.value).toBe('42');
  expect(input(tree, 'Experimental unit').props.value).toBe('Animal');
});

it('asks the preview with the selected samples and detection settings once the slider stops', async () => {
  render(); await settle(); edge.datasetPreview.mockClear();
  render().find(e => e.type === 'input' && e.props.type === 'range')!.props.onChange({ target: { value: '50' } });
  input(render(), 'Treated_3').props.onChange({ target: { checked: false } });
  render();
  hooks.effects.forEach(effect => effect());
  await vi.advanceTimersByTimeAsync(299);
  expect(edge.datasetPreview).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(edge.datasetPreview).toHaveBeenCalledWith({ adminDatasetId: dataset.adminDatasetId, samples: samples.slice(0, 5), minDetectionPct: 50,
    detectionScope: 'global', dropNonDetected: true }, expect.any(AbortSignal));
});

it('shows Team\'s counts from the preview', async () => {
  edge.datasetPreview.mockResolvedValue({ kept: 74, total: 76, leftOut: ['PC 38:0', 'PS 36:1'], samples: 6, missing: { values: 78, cells: 456 },
    histogram: [0, 1, 2, 3, 4, 5, 6].map(n => ({ detectedIn: n, kept: n ? 6 : 0, leftOut: n ? 0 : 2 })) });
  render(); await settle();
  const tree = render();
  expect(text(tree.find(e => e.props?.className === 'hero'))).toBe('74of 76 lipids kept · 2 left out');
  expect(text(tree.find(e => e.type === 'dt' && text(e) === 'Left out')!)).toBe('Left out');
  expect(text(tree.filter(e => e.type === 'dd')[2])).toBe('PC 38:0, PS 36:1');
});

it('a failed preview shows the settings without counts, and Prepare and check still prepares', async () => {
  render(); await settle();
  const tree = render();
  expect(tree.some(e => e.props?.className === 'hero')).toBe(false);
  expect(text(tree.find(e => e.type === 'dl'))).toContain('NormalizationMedian (log scale)');
  expect(byText(tree, 'button', 'Prepare and check').props.disabled).toBe(false);
  await submit(tree);
  expect(edge.openDatasetSession).toHaveBeenCalledWith(dataset.adminDatasetId, { samples, ...defaults });
  expect(prepared).toHaveBeenCalledWith({ samples, ...defaults }, 'synthetic-session', session);
  expect(edge.confirmDesign).not.toHaveBeenCalled();
});

it('sends a changed seed and confirms the study design once the session opens', async () => {
  edge.confirmDesign.mockResolvedValue({ allowed: true, unit: 'Animal', type: 'paired', confirmed: true });
  input(render(), 'Imputation seed').props.onChange({ target: { value: '7' } });
  input(render(), 'Experimental unit').props.onChange({ target: { value: 'Animal' } });
  input(render(), 'Sample relationship').props.onChange({ target: { value: 'paired' } });
  await submit(render());
  expect(edge.openDatasetSession).toHaveBeenCalledWith(dataset.adminDatasetId, { samples, ...defaults, imputationSeed: 7 });
  expect(edge.confirmDesign).toHaveBeenCalledWith('synthetic-session', 'Animal', 'paired');
  expect(prepared).toHaveBeenCalledWith(expect.anything(), 'synthetic-session', expect.objectContaining({ design: { allowed: true, unit: 'Animal', type: 'paired', confirmed: true } }));
});

it('a design Team confirmed travels in the settings handed on, for the board\'s own session', async () => {
  edge.confirmDesign.mockResolvedValue({ allowed: true, unit: 'Animal', type: 'paired', confirmed: true });
  input(render(), 'Experimental unit').props.onChange({ target: { value: 'Animal' } });
  input(render(), 'Sample relationship').props.onChange({ target: { value: 'paired' } });
  await submit(render());
  expect(edge.openDatasetSession).toHaveBeenCalledWith(dataset.adminDatasetId, { samples, ...defaults });
  expect(prepared).toHaveBeenCalledWith({ samples, ...defaults, design: { unit: 'Animal', type: 'paired', confirmed: true } }, 'synthetic-session', expect.anything());
});
it('a design Team refused stays out of the settings (asked again on the Canvas)', async () => {
  edge.confirmDesign.mockRejectedValue(new Error('refused'));
  input(render(), 'Experimental unit').props.onChange({ target: { value: 'Animal' } });
  input(render(), 'Sample relationship').props.onChange({ target: { value: 'paired' } });
  await submit(render());
  expect(prepared).toHaveBeenCalledWith({ samples, ...defaults }, 'synthetic-session', session);
});

it('no sample selected: says so and does not prepare', async () => {
  byText(render(), 'button', 'Clear').props.onClick();
  const tree = render();
  expect(tree.some(e => text(e) === 'Select at least one sample.')).toBe(true);
  expect(byText(tree, 'button', 'Prepare and check').props.disabled).toBe(true);
  await submit(tree);
  expect(edge.openDatasetSession).not.toHaveBeenCalled();
});

it('Cancel goes back without preparing', () => {
  byText(render(), 'button', 'Cancel').props.onClick();
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(edge.openDatasetSession).not.toHaveBeenCalled();
});
