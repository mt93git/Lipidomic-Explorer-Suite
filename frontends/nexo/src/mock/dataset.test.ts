import { afterEach, expect, it, vi } from 'vitest';
import { mockDatasets } from './dataset';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
const defaults = { minDetectionPct: 0, detectionScope: 'global', dropNonDetected: true, normalizationMethod: 'median', useImputation: true, imputeZerosPerFile: true, imputeRemainingNAtoZero: false };
async function mockApi() {
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {});
  const memory = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) });
  vi.resetModules();
  return { api: await import('../api'), entry: await import('./entry') };
}
const { adminDatasetId, samples } = mockDatasets[0];

it('the mock session reports the kept lipids, as the check does', async () => {
  const { api, entry } = await mockApi();
  const opened = await api.openDatasetSession(adminDatasetId, { samples, ...defaults });
  if (opened.status !== 'ready') throw new Error('not prepared');
  expect(opened.session.lipids).toBe(entry.mockQuality().missing[0].of);
  expect(opened.session.lipids).toBeLessThan(mockDatasets[0].lipids);
});

it('the mock session leaves an excluded sample out of its count', async () => {
  const { api } = await mockApi();
  const opened = await api.openDatasetSession(adminDatasetId, { samples, ...defaults, outlierTreatments: { Treated_3: 'remove' } });
  if (opened.status !== 'ready') throw new Error('not prepared');
  expect(opened.session.samples).toBe(samples.length - 1);
});
