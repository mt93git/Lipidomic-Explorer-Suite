// FIX-PROD-H 1: a Batch card restored from a checkpoint said "Couldn't bring back Batch quality check." where Team shows
// the module's sentence. The API answers that sentence as a refusal (422, cards.R api_bqc_placeholder); while restoring
// the card shows it as well, and keeps "Couldn't bring back …" for real failures (network, 5xx, timeouts).
import { expect, it } from 'vitest';
import { refusalMessage, UNAVAILABLE_INPUTS } from './runNeeds';
const bqc = 'Please configure at least 2 BQC replicate samples to view plot.';
const failure = (message: string, status?: number) => Object.assign(new Error(message), status === undefined ? {} : {status});

it('a 422 refusal carries the module\'s message', () => { expect(refusalMessage(failure(bqc, 422))).toBe(bqc); });
it('a server error is not a refusal', () => { expect(refusalMessage(failure('Request failed (500)', 500))).toBeUndefined(); });
it('a network failure is not a refusal', () => { expect(refusalMessage(new TypeError('Failed to fetch'))).toBeUndefined(); });
it('a silent req() stop has no module message', () => { expect(refusalMessage(failure(UNAVAILABLE_INPUTS, 422))).toBeUndefined(); });
it('the mock answers a Batch card without 2 BQC samples as a 422, as the server does', async () => {
  const { vi } = await import('vitest');
  vi.stubEnv('VITE_API_MOCK', '1'); vi.stubGlobal('window', {}); vi.resetModules();
  const checkpoints = (await import('./mock/checkpoints.json')).default;
  const { openSession, createCard, renderCard } = await import('./api');
  const session = await openSession(checkpoints[0].id);
  const card = await createCard(session.sessionId, 'qc_pca_tab-bqcPlot', {});
  const error = await renderCard(session.sessionId, card.instanceId, 620, 380, 'png').then(() => null, (e: Error) => e);
  expect((error as {status?: number}).status).toBe(422);
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules();
});
// No Card harness in vitest (cardBodyMessage.test.ts reads the source the same way): renderFailed uses the refusal.
it('a restoring card shows the refusal\'s message, else "Couldn\'t bring back …"', async () => {
  const fsName = 'node:fs', { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
  const src = readFileSync(new URL('./cards.ts', import.meta.url), 'utf8');
  const failed = src.slice(src.indexOf('  private renderFailed('), src.indexOf('  private snapshot('));
  expect(failed).toMatch(/this\.restoring \? refusalMessage\(error\) \?\? p\.restorePlotFailed\(this\.node\.label\)/);
});
