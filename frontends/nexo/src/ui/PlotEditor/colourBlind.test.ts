import { describe, expect, it } from 'vitest';
import { CVD_MATRICES, colourReport, deltaE, seriesColours, simulate, toLab } from './colourBlind';
describe('F7 colour-blind check', () => {
  it('Lab and deltaE (CIE76) against known values', () => {
    const [L, a, b] = toLab('#ff0000');
    expect(L).toBeCloseTo(53.24, 1); expect(a).toBeCloseTo(80.09, 1); expect(b).toBeCloseTo(67.2, 1);
    expect(deltaE('#ffffff', '#000000')).toBeCloseTo(100, 3);
    expect(deltaE('#123456', '#123456')).toBe(0);
  });
  it('Machado 2009 matrices (severity 1) and simulation', () => {
    expect(CVD_MATRICES.deuteranopia[0]).toEqual([0.367322, 0.860646, -0.227968]);
    expect(CVD_MATRICES.protanopia[1]).toEqual([0.114503, 0.786281, 0.099216]);
    expect(CVD_MATRICES.tritanopia[2]).toEqual([0.004733, 0.691367, 0.3039]);
    for (const m of Object.values(CVD_MATRICES)) for (const row of m) expect(row.reduce((x, y) => x + y)).toBeCloseTo(1, 2);
    expect(simulate('#ffffff', 'deuteranopia')).toBe('#ffffff');
    expect(simulate('#808080', 'greyscale')).toBe('#808080');
    expect(deltaE(simulate('#ff0000', 'deuteranopia'), simulate('#00a000', 'deuteranopia'))).toBeLessThan(deltaE('#ff0000', '#00a000') / 2);
  });
  it('report: ok when all pairs apart, else the closest pair', () => {
    expect(colourReport([{ name: 'A', color: '#000000' }, { name: 'B', color: '#ffffff' }])).toEqual({ ok: true });
    const r = colourReport([{ name: 'Control', color: '#d62728' }, { name: 'Treated', color: '#2ca02c' }, { name: 'X', color: '#000000' }]);
    expect(r.ok).toBe(false);
    if (!r.ok && 'a' in r) { expect([r.a, r.b].sort()).toEqual(['Control', 'Treated']); expect(r.deltaE).toBeLessThan(15); }
    expect(colourReport([{ name: 'A', color: '#000000' }])).toEqual({ ok: false, few: true });
  });
  it('reads series colours from a Plotly figure', () => {
    expect(seriesColours({ data: [{ type: 'scatter', name: 'A', marker: { color: '#112233' } }, { type: 'bar', name: 'B', marker: { color: 'rgb(255, 0, 0)' } }, { type: 'scatter', name: 'C', visible: false, marker: { color: '#000000' } }, { type: 'heatmap', z: [[1]] }], layout: {} })).toEqual([{ name: 'A', color: '#112233' }, { name: 'B', color: '#ff0000' }]);
  });
});
