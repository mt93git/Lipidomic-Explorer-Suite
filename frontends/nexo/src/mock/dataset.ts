import type { DatasetSettings, PreparationChoice, PreparationChoices } from '../api/types';
/** A released Admin dataset the mock serves; its samples are those of tests/dual-ui's synthetic dataset v1 workbook. */
export interface MockDataset { adminDatasetId: string; orderCode: string; version: number; sha256: string; samples: string[]; lipids: number }
export const mockDatasets: MockDataset[] = [{
  adminDatasetId: '3f6c1e2a-7b4d-4a8e-9c01-5d2f8e7a0041', orderCode: 'ORD041', version: 1, sha256: '41'.repeat(32),
  samples: ['Control_1', 'Control_2', 'Control_3', 'Treated_1', 'Treated_2', 'Treated_3'], lipids: 76
}];
export const mockDatasetRecord = (adminDatasetId: string) => mockDatasets.find(d => d.adminDatasetId === adminDatasetId);
// Team's QC widgets with their defaults, as frontends/nexo-api/datasets.R lists them (api_dataset_required_settings).
export const mockRequiredSettings: Record<string, Omit<PreparationChoice, 'name'>> = {
  minDetectionPct: { label: 'Minimum detection (%)', kind: 'number', min: 0, max: 100, step: 5, teamControlDefault: 0 },
  detectionScope: { label: 'Detection across', kind: 'choice', choices: ['global', 'group'], teamControlDefault: 'global' },
  dropNonDetected: { label: 'Drop lipids not detected in any sample', kind: 'boolean', teamControlDefault: false },
  normalizationMethod: { label: 'Normalization', kind: 'choice', choices: ['median', 'pqn', 'none'], teamControlDefault: 'median' },
  useImputation: { label: 'Impute missing values (QRILC)', kind: 'boolean', teamControlDefault: true },
  imputeZerosPerFile: { label: 'For each file, impute all-NA lipids to 0', kind: 'boolean', teamControlDefault: true },
  imputeRemainingNAtoZero: { label: 'Final cleanup: impute any remaining NAs to 0', kind: 'boolean', teamControlDefault: true }
};
/** The 422 body for the choices still missing, or null once every one is given (then the mock prepares). */
export function mockDatasetChoices(dataset: MockDataset, settings?: DatasetSettings): PreparationChoices | null {
  const given = (key: string) => settings !== undefined && settings[key] !== undefined && settings[key] !== null;
  const missing: PreparationChoice[] = [];
  if (!given('samples')) missing.push({ name: 'samples', label: 'Samples', kind: 'samples', choices: [...dataset.samples], teamControlDefault: [...dataset.samples] });
  for (const [name, choice] of Object.entries(mockRequiredSettings)) if (!given(name)) missing.push({ name, ...structuredClone(choice) });
  if (!missing.length) return null;
  return { error: 'unprocessable', reason: 'preparation_choices_required', message: `Team asks for these preparation choices: ${missing.map(m => m.name).join(', ')}`, missing, availableSamples: [...dataset.samples] };
}
/** Team's own check of the samples (api_dataset_choices): unique Abundance columns, at least one. */
export function mockDatasetSamples(dataset: MockDataset, settings: DatasetSettings): string[] {
  const samples = settings.samples;
  if (!Array.isArray(samples) || !samples.length || new Set(samples).size !== samples.length || samples.some(s => !dataset.samples.includes(s)))
    throw new Error('samples must be unique Abundance sample columns (at least one).');
  return samples;
}
/** What the browser suite reads (window.__nexoDatasetMock): the datasets served, how many sessions were prepared, the last settings
 *  received, the Authorization header the last open carried (null without an Admin token). */
export const mockDatasetCounters: { datasets: MockDataset[]; opened: number; last: DatasetSettings | null; authorization: string | null } = { datasets: mockDatasets, opened: 0, last: null, authorization: null };
