import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrepareDatasetDialog } from './PrepareDatasetDialog';
import type { PreparationChoices } from '../../api/types';

// The dialog as the 422 body draws it: every sample ticked, Team's defaults in each control, the slider's value printed.
const samples = ['Control_1', 'Control_2', 'Treated_1'];
const choices: PreparationChoices = { error: 'unprocessable', reason: 'preparation_choices_required', message: 'Team asks for these preparation choices: samples, minDetectionPct',
  missing: [
    { name: 'samples', label: 'Samples', kind: 'samples', choices: samples, teamControlDefault: samples },
    { name: 'minDetectionPct', label: 'Minimum detection (%)', kind: 'number', min: 0, max: 100, step: 5, teamControlDefault: 0 },
    { name: 'normalizationMethod', label: 'Normalization', kind: 'choice', choices: ['median', 'pqn', 'none'], teamControlDefault: 'median' },
    { name: 'dropNonDetected', label: 'Drop lipids not detected in any sample', kind: 'boolean', teamControlDefault: false },
    { name: 'useImputation', label: 'Impute missing values (QRILC)', kind: 'boolean', teamControlDefault: true }
  ], availableSamples: samples };
const html = renderToStaticMarkup(createElement(PrepareDatasetDialog, { choices, onConfirm: async () => {}, onCancel: () => {} }));

it('ticks every sample and counts them', () => {
  expect(html.match(/name="samples"[^>]*checked=""/g)).toHaveLength(3);
  expect(html).toContain('3 of 3 samples selected');
});
it('draws each setting with Team\'s default: the integer slider prints 0, the choice selects median, booleans follow their default', () => {
  expect(html).toMatch(/<input id="[^"]+-minDetectionPct" type="range" min="0" max="100" step="5" value="0"/);
  expect(html).toMatch(/<output[^>]*for="[^"]+-minDetectionPct"[^>]*>0<\/output>/);
  expect(html).toMatch(/<option value="median" selected="">median<\/option>/);
  expect(html).toMatch(/<input id="[^"]+-dropNonDetected" type="checkbox"\/>/);
  expect(html).toMatch(/<input id="[^"]+-useImputation" type="checkbox" checked=""\/>/);
});
it('is a labelled modal with Cancel and Open dataset', () => {
  expect(html).toMatch(/<dialog class="prepare-dialog" aria-labelledby="([^"]+)">.*<h2 id="\1">Prepare dataset<\/h2>/s);
  expect(html).toContain('>Cancel</button>');
  expect(html).toContain('>Open dataset</button>');
});
