// FIX-PROD-C 1: Team's three "Batch …" views (R/modules/2_qc_boxplot_module.R bqcPlot, bqcDeviationPlot,
// bqcAbundancePlot) draw only a small grey sentence when fewer than 2 BQC replicate samples are chosen; on the board
// that image was a blank white card. The API now answers the sentence (422, test_api_bqc_placeholder.R) and the card
// body shows it as it is (cards.ts renderFailed: the error text, no run need). The mock answers as the server does.
import { afterEach, expect, it, vi } from 'vitest';
import checkpoints from './mock/checkpoints.json';
import { runNeedFor } from './runNeeds';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
const team = {
  'qc_pca_tab-bqcPlot': 'Please configure at least 2 BQC replicate samples to view plot.',
  'qc_pca_tab-bqcDeviationPlot': 'Please configure at least 2 BQC replicate samples.',
  'qc_pca_tab-bqcAbundancePlot': 'Please configure at least 2 BQC replicate samples.',
};

it('a Batch card answered with Team\'s message shows that message, not a run need', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'unprocessable', message: team['qc_pca_tab-bqcPlot'] }),
    { status: 422, headers: { 'Content-Type': 'application/json' } })));
  const { renderCard } = await import('./api');
  const failure = await renderCard('s1', 'tcinstance_0123456789ab', 620, 380, 'png').then(() => null, (e: Error) => e.message);
  expect(failure).toBe(team['qc_pca_tab-bqcPlot']);
  expect(runNeedFor('tcinstance_0123456789ab-bqcPlot', failure!)).toBeUndefined();
});

it('every Batch card without 2 BQC samples answers Team\'s message in the mock, as on the server', async () => {
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {}); vi.resetModules();
  const { openSession, createCard, renderCard } = await import('./api');
  const session = await openSession(checkpoints[0].id);
  for (const [source, message] of Object.entries(team)) {
    const card = await createCard(session.sessionId, source, {});
    const failure = await renderCard(session.sessionId, card.instanceId, 620, 380, 'png').then(() => null, (e: Error) => e.message);
    expect([source, failure]).toEqual([source, message]);
  }
});
