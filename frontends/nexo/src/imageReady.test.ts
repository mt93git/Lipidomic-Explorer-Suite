// Pilot round 2 (2026-11-08): on a Retina screen, focusing a card asks for its 2x image; the new <img> is put in the
// card when the render answers and decodes asynchronously. "Finish plot" pressed in that window refused with
// "Plot is not ready." (cards.ts finish: img.complete was still false). finish() now waits for the image, bounded.
import { expect, it } from 'vitest';
it('waits for an image that is still decoding, and gives up after its bound', async () => {
  const mod = await import('./imageReady').catch(() => ({})) as { imageReady?: (img: {complete: boolean; naturalWidth: number; decode(): Promise<void>}, timeoutMs?: number) => Promise<boolean> };
  expect(typeof mod.imageReady).toBe('function');
  const decoding = { complete: false, naturalWidth: 0, decode() { return new Promise<void>(r => setTimeout(() => { this.complete = true; this.naturalWidth = 880; r(); }, 20)); } };
  expect(await mod.imageReady!(decoding, 1000)).toBe(true);
  const ready = { complete: true, naturalWidth: 440, decode: () => Promise.reject(new Error('not called')) };
  expect(await mod.imageReady!(ready, 1000)).toBe(true);
  const broken = { complete: true, naturalWidth: 0, decode: () => Promise.reject(new Error('EncodingError')) };
  expect(await mod.imageReady!(broken, 1000)).toBe(false);
  const stuck = { complete: false, naturalWidth: 0, decode: () => new Promise<void>(() => {}) };
  const t0 = Date.now(); expect(await mod.imageReady!(stuck, 50)).toBe(false); expect(Date.now() - t0).toBeLessThan(1000);
});
