import { describe, expect, it } from 'vitest';
import { prepareState, setSample, setSamples, setValue, settingsBody, canConfirm } from './datasetPrepare';
import type { PreparationChoices } from '../api/types';

// The 422 preparation_choices_required body as frontends/nexo-api/datasets.R builds it: Team's QC widget
// defaults in teamControlDefault, every Abundance sample in availableSamples.
const samples = ['Control_1', 'Control_2', 'Control_3', 'Treated_1', 'Treated_2', 'Treated_3'];
const body: PreparationChoices = {
  error: 'unprocessable', reason: 'preparation_choices_required',
  message: 'Team asks for these preparation choices: samples, minDetectionPct, detectionScope, dropNonDetected, normalizationMethod, useImputation, imputeZerosPerFile, imputeRemainingNAtoZero',
  missing: [
    { name: 'samples', label: 'Samples', kind: 'samples', choices: samples, teamControlDefault: samples },
    { name: 'minDetectionPct', label: 'Minimum detection (%)', kind: 'number', min: 0, max: 100, step: 5, teamControlDefault: 0 },
    { name: 'detectionScope', label: 'Detection across', kind: 'choice', choices: ['global', 'group'], teamControlDefault: 'global' },
    { name: 'dropNonDetected', label: 'Drop lipids not detected in any sample', kind: 'boolean', teamControlDefault: false },
    { name: 'normalizationMethod', label: 'Normalization', kind: 'choice', choices: ['median', 'pqn', 'none'], teamControlDefault: 'median' },
    { name: 'useImputation', label: 'Impute missing values (QRILC)', kind: 'boolean', teamControlDefault: true },
    { name: 'imputeZerosPerFile', label: 'For each file, impute all-NA lipids to 0', kind: 'boolean', teamControlDefault: true },
    { name: 'imputeRemainingNAtoZero', label: 'Final cleanup: impute any remaining NAs to 0', kind: 'boolean', teamControlDefault: true }
  ],
  availableSamples: samples
};
const defaults = { minDetectionPct: 0, detectionScope: 'global', dropNonDetected: false, normalizationMethod: 'median', useImputation: true, imputeZerosPerFile: true, imputeRemainingNAtoZero: true };

describe('prepareState', () => {
  it('ticks every available sample and prefills each setting with Team\'s control default', () => {
    const state = prepareState(body);
    expect(state.samples).toEqual(samples);
    expect(state.selected).toEqual(samples);
    expect(state.fields.map(f => f.name)).toEqual(Object.keys(defaults));
    expect(state.values).toStrictEqual(defaults);
  });
  it('keeps each field\'s label, kind, choices and bounds for the form', () => {
    const state = prepareState(body);
    expect(state.fields[0]).toMatchObject({ name: 'minDetectionPct', label: 'Minimum detection (%)', kind: 'number', min: 0, max: 100, step: 5 });
    expect(state.fields[1]).toMatchObject({ kind: 'choice', choices: ['global', 'group'] });
    expect(state.fields[2]).toMatchObject({ kind: 'boolean' });
  });
  it('takes the samples from availableSamples when the samples choice is absent', () => {
    const state = prepareState({ ...body, missing: body.missing.filter(m => m.name !== 'samples') });
    expect(state.samples).toEqual(samples);
    expect(state.selected).toEqual(samples);
  });
});

describe('settingsBody', () => {
  it('sends the untouched defaults exactly as received, with every sample', () => {
    expect(settingsBody(prepareState(body))).toStrictEqual({ samples, ...defaults });
  });
  it('leaves out an unticked sample and keeps the workbook order', () => {
    let state = prepareState(body);
    state = setSample(state, 'Control_2', false);
    state = setSample(state, 'Treated_1', false);
    state = setSample(state, 'Control_2', true);
    expect(settingsBody(state).samples).toEqual(['Control_1', 'Control_2', 'Control_3', 'Treated_2', 'Treated_3']);
  });
  it('keeps the integer slider integer: the slider\'s string becomes a number, never text', () => {
    const sent = settingsBody(setValue(prepareState(body), 'minDetectionPct', '25'));
    expect(sent.minDetectionPct).toBe(25);
    expect(Number.isInteger(sent.minDetectionPct)).toBe(true);
    expect(JSON.stringify(sent)).toContain('"minDetectionPct":25');
  });
  it('rounds a fractional value on an integer slider and keeps a decimal step as it is', () => {
    expect(setValue(prepareState(body), 'minDetectionPct', '12.6').values.minDetectionPct).toBe(13);
    const decimal: PreparationChoices = { ...body, missing: [...body.missing, { name: 'alpha', label: 'Alpha', kind: 'number', min: 0, max: 1, step: 0.05, teamControlDefault: 0.7 }] };
    expect(setValue(prepareState(decimal), 'alpha', '0.35').values.alpha).toBe(0.35);
  });
  it('ignores a value that is not a number and keeps the previous one', () => {
    expect(setValue(prepareState(body), 'minDetectionPct', 'abc').values.minDetectionPct).toBe(0);
  });
  it('changes a choice and a boolean', () => {
    let state = setValue(prepareState(body), 'normalizationMethod', 'pqn');
    state = setValue(state, 'dropNonDetected', true);
    expect(settingsBody(state)).toMatchObject({ normalizationMethod: 'pqn', dropNonDetected: true });
  });
  it('ignores a name that is not a field', () => {
    expect(setValue(prepareState(body), 'imputationSeed', '7').values).toStrictEqual(defaults);
  });
});

describe('canConfirm', () => {
  it('needs at least one sample', () => {
    const state = setSamples(prepareState(body), []);
    expect(canConfirm(state)).toBe(false);
    expect(canConfirm(setSamples(state, ['Control_1']))).toBe(true);
  });
});
