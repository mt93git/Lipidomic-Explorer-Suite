import { afterEach, expect, it, vi } from 'vitest';
// b11 chart audit (pathwayVisNetwork #7): a live network card draws Team's vis-network on a canvas, not an <img>.
// Download PNG/PDF from the Inspector produced no file ("Wait for the figure to load."): the export looked for an img only.
const png = 'data:image/png;base64,iVBORw0KGgo=';
const node = { kind: 'plot', id: 'net1', label: 'Interactive pathway network', width: 620, height: 520, visual: {}, x: 0, y: 0 };
function mountCard(body: { img?: { src: string }; canvas?: { toDataURL: () => string } }) {
  const card = { dataset: { id: 'net1' }, querySelector: (sel: string) => sel === 'img' ? body.img ?? null : sel === '.network canvas' ? body.canvas ?? null : null };
  vi.stubGlobal('document', { querySelectorAll: () => [card] });
}
afterEach(() => vi.unstubAllGlobals());
it('takes the image of a live network card from its canvas', async () => {
  mountCard({ canvas: { toDataURL: () => png } });
  const { imageSource } = await import('./ExportDialog');
  expect(imageSource(node as never)).toBe(png);
});
it('still prefers the rendered image of an image card', async () => {
  mountCard({ img: { src: 'blob:card-png' }, canvas: { toDataURL: () => png } });
  const { imageSource } = await import('./ExportDialog');
  expect(imageSource(node as never)).toBe('blob:card-png');
});
