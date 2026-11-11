import type { DatasetPreview, DatasetPreviewRequest, DatasetSettings, PreparationChoice, PreparationChoices } from '../api/types';
/** A released Admin dataset the mock serves; its samples are those of tests/dual-ui's synthetic dataset v1 workbook. */
export interface MockDataset { adminDatasetId: string; orderCode: string; version: number; sha256: string; samples: string[]; lipids: number }
export const mockDatasets: MockDataset[] = [{
  adminDatasetId: '3f6c1e2a-7b4d-4a8e-9c01-5d2f8e7a0041', orderCode: 'ORD041', version: 1, sha256: '41'.repeat(32),
  samples: ['Control_1', 'Control_2', 'Control_3', 'Treated_1', 'Treated_2', 'Treated_3'], lipids: 76
}];
// An uploaded workbook (upload-<uuid>, C5) opens as the first synthetic dataset.
export const mockDatasetRecord = (adminDatasetId: string) => mockDatasets.find(d => d.adminDatasetId === adminDatasetId)
  ?? (adminDatasetId.startsWith('upload-') ? { ...mockDatasets[0], adminDatasetId, orderCode: 'Upload', version: 1 } : undefined);
// Team's QC widgets with Team's guided defaults, as frontends/nexo-api/datasets.R lists them (api_dataset_required_settings, C3).
export const mockRequiredSettings: Record<string, Omit<PreparationChoice, 'name'>> = {
  minDetectionPct: { label: 'Minimum detection (%)', kind: 'number', min: 0, max: 100, step: 5, teamControlDefault: 0 },
  detectionScope: { label: 'Detection across', kind: 'choice', choices: ['global', 'group'], teamControlDefault: 'global' },
  dropNonDetected: { label: 'Drop lipids not detected in any sample', kind: 'boolean', teamControlDefault: true },
  normalizationMethod: { label: 'Normalization', kind: 'choice', choices: ['median', 'pqn', 'none'], teamControlDefault: 'median' },
  useImputation: { label: 'Impute missing values (QRILC)', kind: 'boolean', teamControlDefault: true },
  imputeZerosPerFile: { label: 'For each file, impute all-NA lipids to 0', kind: 'boolean', teamControlDefault: true },
  imputeRemainingNAtoZero: { label: 'Final cleanup: impute any remaining NAs to 0', kind: 'boolean', teamControlDefault: false }
};
// The Metadata sheet's condition of a mock sample: its name without the replicate number (Control_1 → Control).
const group = (sample: string) => sample.replace(/_\d+$/, '');
/** The 422 body for the choices still missing, or null once every one is given (then the mock prepares). */
export function mockDatasetChoices(dataset: MockDataset, settings?: DatasetSettings): PreparationChoices | null {
  const given = (key: string) => settings !== undefined && settings[key] !== undefined && settings[key] !== null;
  const missing: PreparationChoice[] = [];
  if (!given('samples')) missing.push({ name: 'samples', label: 'Samples', kind: 'samples', choices: [...dataset.samples], teamControlDefault: [...dataset.samples] });
  for (const [name, choice] of Object.entries(mockRequiredSettings)) if (!given(name)) missing.push({ name, ...structuredClone(choice) });
  if (!missing.length) return null;
  return { error: 'unprocessable', reason: 'preparation_choices_required', message: `Team asks for these preparation choices: ${missing.map(m => m.name).join(', ')}`, missing, availableSamples: [...dataset.samples], sampleGroups: Object.fromEntries(dataset.samples.map(s => [s, group(s)])) };
}
/** Team's own check of the samples (api_dataset_choices): unique Abundance columns, at least one. */
export function mockDatasetSamples(dataset: MockDataset, settings: DatasetSettings): string[] {
  const samples = settings.samples;
  if (!Array.isArray(samples) || !samples.length || new Set(samples).size !== samples.length || samples.some(s => !dataset.samples.includes(s)))
    throw new Error('samples must be unique Abundance sample columns (at least one).');
  return samples;
}
/** What the browser suite reads (window.__nexoDatasetMock): the datasets served, how many sessions were prepared, the last settings
 *  received, the admin token header the last open carried (null without an Admin token). */
export const mockDatasetCounters: { datasets: MockDataset[]; opened: number; last: DatasetSettings | null; authorization: string | null; preview: DatasetPreviewRequest | null } = { datasets: mockDatasets, opened: 0, last: null, authorization: null, preview: null };
/** POST /datasets/preview (C3) with Team's detection rule on a synthetic pattern: lipid i is missing from the sample at index j
 *  when (7i + 11j) mod 13 is 0, and the first two lipids are never detected. The last body asked is kept for the browser suite. */
export function mockDatasetPreview(dataset: MockDataset, body: DatasetPreviewRequest): DatasetPreview {
  mockDatasetCounters.preview = structuredClone(body);
  return detection(dataset, body);
}
/** The prepared session's counts, as the quality check shows them: the lipids the detection rule keeps, and the chosen
 *  samples less those Team leaves out (outlierTreatments "remove", an Exclude). */
export function mockPreparedCounts(dataset: MockDataset, settings: DatasetSettings): { lipids: number; samples: number } {
  const samples = mockDatasetSamples(dataset, settings), removed = (settings.outlierTreatments ?? {}) as Record<string, string>;
  return { lipids: detection(dataset, { adminDatasetId: dataset.adminDatasetId, samples, minDetectionPct: settings.minDetectionPct, detectionScope: settings.detectionScope, dropNonDetected: settings.dropNonDetected }).kept, samples: samples.filter(s => removed[s] !== 'remove').length };
}
function detection(dataset: MockDataset, body: DatasetPreviewRequest): DatasetPreview {
  const samples = body.samples, n = samples.length, groups = [...new Set(samples.map(group))];
  const detected = (lipid: number, sample: string) => lipid >= 2 && (lipid * 7 + dataset.samples.indexOf(sample) * 11) % 13 !== 0;
  const histogram = Array.from({ length: n + 1 }, (_, k) => ({ detectedIn: k, kept: 0, leftOut: 0 })), leftOut: string[] = [];
  for (let lipid = 0; lipid < dataset.lipids; lipid++) {
    const k = samples.filter(sample => detected(lipid, sample)).length;
    const share = body.detectionScope === 'group'
      ? Math.max(...groups.map(g => { const members = samples.filter(s => group(s) === g); return members.filter(s => detected(lipid, s)).length / members.length; })) : k / n;
    const keep = !(k === 0 && body.dropNonDetected === true) && share * 100 >= Number(body.minDetectionPct);
    histogram[k][keep ? 'kept' : 'leftOut']++; if (!keep) leftOut.push(`Synthetic lipid ${lipid + 1}`);
  }
  const missing = histogram.reduce((sum, h) => sum + (h.kept + h.leftOut) * (n - h.detectedIn), 0);
  return { kept: dataset.lipids - leftOut.length, total: dataset.lipids, leftOut, histogram, samples: n, missing: { values: missing, cells: dataset.lipids * n } };
}
