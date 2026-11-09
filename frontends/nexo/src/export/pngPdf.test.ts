import { expect, it } from 'vitest';
import { pngPdf } from './pngPdf';
// Team offers PDF next to PNG/SVG on every Plotly plot (www/team/js/plot_exports.js): one page, the plot as a raster.
it('wraps the plot PNG in a one-page PDF of the export size (points), filling the page', async () => {
  const calls: unknown[][] = [];
  class Fake { constructor(public options: object) { calls.push(['new', options]); }
    addImage(...args: unknown[]) { calls.push(['addImage', ...args]); }
    output(type: string) { calls.push(['output', type]); return new Blob(['%PDF-1.3'], { type: 'application/pdf' }); } }
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  const pdf = await pngPdf(png, 120, 90, Fake);
  const w = 120 / 25.4 * 72, h = 90 / 25.4 * 72;
  expect(calls[0]).toEqual(['new', { orientation: 'landscape', unit: 'pt', format: [w, h], compress: true }]);
  expect(calls[1].slice(0, 6)).toEqual(['addImage', new Uint8Array([137, 80, 78, 71]), 'PNG', 0, 0, w]);
  expect(calls[1][6]).toBe(h);
  expect(pdf.type).toBe('application/pdf');
});
