// FIX-G11: a lazy panel whose chunk failed to load (offline) imports again once retried (Try again, back online) instead of failing forever.
import { expect, test } from 'vitest';
import { prerender } from 'react-dom/static';
import { retryFailedImports, retryLazy } from './retryLazy';
const html = async (element: React.ReactNode) => new Response((await prerender(element, { onError: () => {} })).prelude).text();
test('a failed import is dropped on retry and the next render imports again', async () => {
  let calls = 0;
  const Banner = retryLazy(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('Failed to fetch dynamically imported module: synthetic/EditingBanner.js');
    return { default: () => <p>Synthetic banner</p> };
  });
  await expect(html(<Banner/>)).rejects.toThrow('Failed to fetch dynamically imported module');
  await expect(html(<Banner/>)).rejects.toThrow('Failed to fetch dynamically imported module'); // until Try again or online
  retryFailedImports();
  expect(await html(<Banner/>)).toContain('Synthetic banner');
  expect(calls).toBe(2);
});
