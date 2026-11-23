import { expect, it } from 'vitest';
import { pngPdf } from './pngPdf';
import { HEADER_HEIGHT, type JsPdf } from './pdfHeader';
import source from '../../public/vendor/jspdf.umd.min.js?raw';
const holder = { exports: {} as { jsPDF: JsPdf } }; new Function('module', 'exports', source)(holder, holder.exports);
// A 1×1 white PNG (synthetic).
const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
const png = new Blob([bytes], { type: 'image/png' }), pt = (mm: number) => mm / 25.4 * 72;
// Team offers PDF next to PNG/SVG on every Plotly plot (www/team/js/plot_exports.js): one page, the plot as a raster.
// Every PDF Nexo downloads is A4 portrait with the lab header; the plot keeps its export size under the header.
class Fake { static calls: unknown[][] = []; constructor(options: object) { Fake.calls.push(['new', options]); }
  addImage(...a: unknown[]) { Fake.calls.push(['addImage', ...a]); } text(...a: unknown[]) { Fake.calls.push(['text', ...a]); } line(...a: unknown[]) { Fake.calls.push(['line', ...a]); }
  setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {} addPage() {}
  output() { return new Blob(['%PDF-1.3'], { type: 'application/pdf' }); } }
it('puts the plot PNG at its export size on one A4 page under the lab header', async () => {
  Fake.calls = [];
  await pngPdf(png, 120, 90, Fake as unknown as JsPdf, { png: bytes, width: 240, height: 115 });
  expect(Fake.calls[0]).toEqual(['new', { orientation: 'portrait', unit: 'pt', format: 'a4', compress: true }]);
  const images = Fake.calls.filter(c => c[0] === 'addImage');
  expect(images[0].slice(2, 7)).toEqual(['PNG', 34, 9, 27 * 240 / 115, 27]);
  expect(images[1].slice(2, 7)).toEqual(['PNG', 34, HEADER_HEIGHT + 6, pt(120), pt(90)]);
  expect(Fake.calls.find(c => c[0] === 'text')?.[1]).toBe('Lipidomic Explorer');
  const real = await pngPdf(png, 120, 90, holder.exports.jsPDF, { png: bytes, width: 240, height: 115 });
  const text = new TextDecoder('latin1').decode(await real.arrayBuffer());
  expect([...text.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map(m => m[1].trim().split(/\s+/).map(Number).map(v => Math.round(v * 100) / 100))).toEqual([[0, 0, 595.28, 841.89]]);
  expect(real.type).toBe('application/pdf');
});
it('shrinks a plot larger than the A4 area to fit, keeping its shape', async () => {
  Fake.calls = [];
  await pngPdf(png, 400, 300, Fake as unknown as JsPdf, null);
  const [, , , x, y, w, h] = Fake.calls.find(c => c[0] === 'addImage') as number[];
  expect(x + w).toBeLessThanOrEqual(595.28 - 34 + 1e-9); expect(y).toBeGreaterThanOrEqual(HEADER_HEIGHT); expect(y + h).toBeLessThanOrEqual(841.89 - 34 + 1e-9);
  expect(w / h).toBeCloseTo(4 / 3);
});
