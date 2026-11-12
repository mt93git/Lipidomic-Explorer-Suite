import { describe, expect, it } from 'vitest';
import { API_RENDER_MAX_PX, downloadBlockedReason, fileSizeLabel, previewPixels, svgBlockedReason, transparentLayout, uses3d } from './honest';
describe('download disabled reasons', () => {
  it('a card drawing a module placeholder blocks its module downloads with the shortened message', () => {
    expect(downloadBlockedReason({ status: 'error', message: 'Please configure at least 2 BQC replicate samples to view plot.' }))
      .toBe('Please configure at least 2 BQC replicate samples to view plot.');
    const long = downloadBlockedReason({ status: 'error', message: 'word '.repeat(40) })!;
    expect(long.length).toBeLessThanOrEqual(90); expect(long.endsWith('…')).toBe(true);
  });
  // NEXO-P6 item 2: Team's sentence is now a quiet note on an up-to-date card; it still blocks the module's downloads.
  it('a card showing Team\'s validation note blocks its module downloads too', () => {
    expect(downloadBlockedReason({ status: 'current', note: true, message: 'Please configure at least 2 BQC replicate samples to view plot.' }))
      .toBe('Please configure at least 2 BQC replicate samples to view plot.');
  });
  it('a drawn, updating or empty card does not block', () => {
    expect(downloadBlockedReason({ status: 'current', message: '' })).toBeNull();
    expect(downloadBlockedReason({ status: 'updating', message: 'Loading figure…' })).toBeNull();
    expect(downloadBlockedReason({ status: 'error', message: '' })).toBeNull();
  });
});
describe('SVG reasons', () => {
  it('a 3D (WebGL) Plotly figure states the Plotly limitation', () => {
    expect(uses3d([{ type: 'scatter3d' }])).toBe(true); expect(uses3d([{ type: 'scatter' }, {}])).toBe(false);
    expect(svgBlockedReason({ illustration: false, svgSnapshot: false, plotly: true, webgl: true })).toMatch(/3D/);
  });
  it('raster images keep their reason; live 2D Plotly and SVG sources are allowed', () => {
    expect(svgBlockedReason({ illustration: false, svgSnapshot: false, plotly: false, webgl: false })).toMatch(/raster/);
    expect(svgBlockedReason({ illustration: false, svgSnapshot: false, plotly: true, webgl: false })).toBeNull();
    expect(svgBlockedReason({ illustration: true, svgSnapshot: false, plotly: false, webgl: false })).toBeNull();
    expect(svgBlockedReason({ illustration: false, svgSnapshot: true, plotly: false, webgl: false })).toBeNull();
  });
});
describe('preview pixels', () => {
  it('89 mm at 300 DPI is 1051 px', () => { expect(previewPixels(89, 60, 300)).toEqual({ width: 1051, height: 709, capped: false }); });
  it('says when the API render cap applies', () => {
    const p = previewPixels(250, 250, 1200); expect(p.width).toBe(11811); expect(p.capped).toBe(true);
    expect(API_RENDER_MAX_PX).toBe(4000);
  });
  it('file size label', () => { expect(fileSizeLabel(900)).toBe('900 B'); expect(fileSizeLabel(2048)).toBe('2 KB'); expect(fileSizeLabel(3.4 * 1024 * 1024)).toBe('3.4 MB'); });
});
describe('transparent layout', () => {
  it('clears paper, plot and 3D scene backgrounds without touching the rest', () => {
    const layout = { title: { text: 'A' }, paper_bgcolor: '#fff', plot_bgcolor: '#eee', scene: { bgcolor: '#ddd', xaxis: {} }, legend: { bgcolor: '#fff' } };
    const out = transparentLayout(layout);
    expect(out).toMatchObject({ paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', scene: { bgcolor: 'rgba(0,0,0,0)', xaxis: {} }, title: { text: 'A' } });
    expect(layout.paper_bgcolor).toBe('#fff'); expect(layout.scene.bgcolor).toBe('#ddd');
  });
});
