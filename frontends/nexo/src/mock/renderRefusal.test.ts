import { afterEach, expect, it, vi } from 'vitest';
import checkpoints from './checkpoints.json';
import catalog from './catalog.json';
import { MOCK_MODULE_REFUSAL, mockCounters, mockRenderRefusal } from './schema';
import { nexoSource } from '../pcaDesign';
// Browser suites (test_nexo_perf.cjs, test_nexo_small_fixes.cjs) need a Plotly card Team's module refuses. Nexo no
// longer adds the QC editable vector PCA views (pcaDesign.ts), so they name a served source in
// window.__nexoMock.refuseRender; this pins that mock refusal here, where it runs on every machine.
const refused = 'qc_pca_tab-load3dPlot';
afterEach(() => { delete mockCounters.refuseRender; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('the refused source is still served, drawn with Plotly and not replaced by the dashboard PCA', () => {
  const entry = catalog.outputs.find(e => e.id === refused);
  expect(entry?.render).toBe('plotly');
  expect(nexoSource(refused)).toBe(refused);
});
it('the mock refuses a source only while a suite names it, with the module message', () => {
  expect(mockRenderRefusal(refused)).toBeUndefined();
  mockCounters.refuseRender = [refused];
  expect(mockRenderRefusal(refused)).toBe(MOCK_MODULE_REFUSAL);
  expect(mockRenderRefusal('qc_pca_tab-pca3dPlot')).toBeUndefined();
  expect(MOCK_MODULE_REFUSAL).toMatch(/^Editable vector view unavailable/);
});
it('a card of that source fails to render in the mock API with the module message', async () => {
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {});
  const memory = new Map<string, string>(); vi.stubGlobal('sessionStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) });
  vi.resetModules();
  const api = await import('../api'), schema = await import('./schema');
  const id = (await api.openSession(checkpoints[0].id)).sessionId;
  const card = await api.createCard(id, refused, {});
  expect(card.source).toBe(refused);
  await expect(api.renderCard(id, card.instanceId, 620, 720, 'auto')).resolves.toBeTruthy();
  schema.mockCounters.refuseRender = [refused];
  await expect(api.renderCard(id, card.instanceId, 620, 720, 'auto')).rejects.toThrow(/^Editable vector view unavailable/);
  delete schema.mockCounters.refuseRender;
});
