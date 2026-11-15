// Chart audit b03-qc-b round 2, "More downloads from this analysis": Team's BQC PDF (downloadBqcPdf) on a card with fewer
// than two BQC replicates fails inside the module and the API answers 500 with plumber's default body (no `message`).
// Nexo showed "Could not download the file: Request failed (500)", which does not say what went wrong or what to do.
import { afterEach, expect, it, vi } from 'vitest';
import { cardDownload } from './api';
afterEach(() => { vi.unstubAllGlobals(); });
const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
it('a module download that fails on the server without a message says the module could not make the file', async () => {
  vi.stubGlobal('fetch', answer(500, { error: '500 - Internal server error' }));
  const failure = await cardDownload('s1', 'tcinstance_0123456789ab-bqcPlot', 'downloadBqcPdf').then(() => null, (e: Error) => e.message);
  expect(failure).toMatch(/^Team's module could not make this file/);
  expect(failure).toMatch(/shows data/);
  expect(failure).not.toMatch(/Request failed/);
});
it("the API's own message is kept when it gives one", async () => {
  vi.stubGlobal('fetch', answer(422, { error: 'unprocessable', message: 'The plot data are unavailable for this session.' }));
  const failure = await cardDownload('s1', 'tcinstance_0123456789ab-bqcPlot', 'downloadBqcPdf').then(() => null, (e: Error) => e.message);
  expect(failure).toBe('The plot data are unavailable for this session.');
});
