import { describe, expect, it } from 'vitest';
import { networkData, rows } from './visData';
describe('visNetwork widget payload', () => {
  it('turns R columns into rows and dotted names into nested objects, dropping NA', () => {
    expect(rows({ id: ['TG', 'DG'], 'color.background': ['#f7f7f7', null], 'font.size': [14, 12], shape: 'dot' })).toEqual([
      { id: 'TG', color: { background: '#f7f7f7' }, font: { size: 14 }, shape: 'dot' },
      { id: 'DG', font: { size: 12 }, shape: 'dot' },
    ]);
  });
  it('accepts rows already (nodesToDataframe false) and empty data', () => {
    expect(rows([{ id: 1, 'color.border': '#000' }])).toEqual([{ id: 1, color: { border: '#000' } }]);
    expect(rows(null)).toEqual([]);
  });
  it('keeps Team options but leaves the wheel and the arrow keys to the canvas', () => {
    const d = networkData({ nodes: { id: ['a'] }, edges: { from: ['a'], to: ['a'] }, options: { physics: { enabled: true }, interaction: { zoomView: true, keyboard: true, navigationButtons: true, hover: true }, height: '720px' } });
    expect(d.options).toEqual({ physics: { enabled: true }, width: '100%', height: '100%', autoResize: false, interaction: { zoomView: false, keyboard: false, navigationButtons: true, hover: true } });
    expect(d.edges).toEqual([{ from: 'a', to: 'a' }]);
  });
});
