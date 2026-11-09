// Steph review 7c: the session palette warns when two groups of one grouping are hard to tell apart.
// Criterion: CIEDE2000 deltaE < 20, or hue difference < 25° with both chroma > 20 (CIELAB, sRGB D65).
import { describe, expect, it } from 'vitest';
import { ciede2000, hardToTellApart, hexToLab, similarGroups } from './groupContrast';
import { MOCK_PRESETS } from '../mock/palette';
describe('CIELAB and CIEDE2000', () => {
  it('converts sRGB hex to CIELAB (D65)', () => {
    const white = hexToLab('#FFFFFF'), red = hexToLab('#FF0000');
    expect(white[0]).toBeCloseTo(100, 1); expect(Math.abs(white[1])).toBeLessThan(0.01); expect(Math.abs(white[2])).toBeLessThan(0.01);
    expect(red[0]).toBeCloseTo(53.24, 1); expect(red[1]).toBeCloseTo(80.09, 0); expect(red[2]).toBeCloseTo(67.20, 0);
  });
  it('matches the published CIEDE2000 test pairs (Sharma, Wu and Dalal 2005)', () => {
    expect(ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    expect(ciede2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 3);
    expect(ciede2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(1.2644, 3);
    expect(ciede2000([90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447])).toBeCloseTo(1.4441, 3);
  });
});
describe('hard to tell apart', () => {
  // The pilot (live 7c): Control set to #0055aa while Treatment keeps Team's default Set1 blue (#377EB8).
  it('warns for #0055aa against the Treatment blue the pilot shows', () => {
    expect(hardToTellApart('#0055aa', '#377EB8')).toBe(true);
    expect(similarGroups([{ name: 'Control', color: '#0055AA' }, { name: 'Treatment', color: '#377EB8' }])).toEqual([['Control', 'Treatment']]);
  });
  it('does not warn for the pilot\'s first choice (#aa3300) or Team\'s default pair', () => {
    expect(similarGroups([{ name: 'Control', color: '#AA3300' }, { name: 'Treatment', color: '#377EB8' }])).toEqual([]);
    expect(similarGroups([{ name: 'Control', color: '#E41A1C' }, { name: 'Treatment', color: '#377EB8' }])).toEqual([]);
  });
  it('the hue rule needs both colours saturated: two greys of different lightness are not flagged by hue', () => {
    expect(hardToTellApart('#333333', '#BBBBBB')).toBe(false);
  });
  it('the hue rule flags two saturated colours of one hue even when deltaE is large', () => {
    expect(hardToTellApart('#003399', '#6699FF')).toBe(true);
  });
  it('lists every close pair once, in group order', () => {
    expect(similarGroups([{ name: 'A', color: '#0055AA' }, { name: 'B', color: '#E41A1C' }, { name: 'C', color: '#377EB8' }, { name: 'D', color: '#0055AB' }]))
      .toEqual([['A', 'C'], ['A', 'D'], ['C', 'D']]);
  });
});
// Team's palette_preset_colors (R/utils_colors.R): the groups of a context, sorted, take the preset's swatches in order,
// so two groups take its first two swatches; "Default" is Team's initialize_color_map (RColorBrewer Set1).
describe('built-in palettes with two groups', () => {
  const two = (colors: string[]) => [{ name: 'Control', color: colors[0] }, { name: 'Treatment', color: colors[1] }];
  it('Default, Tableau Classic and Colorblind Friendly give no warning', () => {
    expect(similarGroups(two(['#E41A1C', '#377EB8']))).toEqual([]);
    for (const name of ['Tableau Classic', 'Colorblind Friendly']) expect(similarGroups(two(MOCK_PRESETS[name])), name).toEqual([]);
  });
  // Coordinator's spec expected no warning for every built-in palette. Team's own assignment gives two groups the
  // first two swatches, and in these two presets those are one hue (teal #155E75/#0E7490, deltaE 7.7; greens
  // #365314/#65A30D, hue 0.9°): the warning is right there, and it is shown as for any other pair.
  it('Ocean & Coral and Earth & Garden give two groups one hue, and warn', () => {
    expect(similarGroups(two(MOCK_PRESETS['Ocean & Coral']))).toEqual([['Control', 'Treatment']]);
    expect(similarGroups(two(MOCK_PRESETS['Earth & Garden']))).toEqual([['Control', 'Treatment']]);
  });
});
