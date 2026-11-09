import { describe, it, expect } from 'vitest';
import presetsJson from '../mock/exportPresets.json';
import { applyPreset, clampForm, defaultForm, exportRequest, imageSize, mmToInches, mmToPx, setFormat, validateForm, type ExportPresets } from './presets';
const presets = presetsJson as ExportPresets;
describe('publication export form', () => {
  it('starts from Team\'s Export studio defaults', () => {
    expect(defaultForm(presets)).toEqual({ figureKey: 'pca_2d', preset: 'nature', widthMm: 89, heightMm: 89, dpi: 600, basePt: 7.5, fontFamily: 'sans', hybridMode: true, formats: ['pdf', 'svg', 'png', 'tiff', 'csv', 'rscript'] });
    expect(defaultForm({ ...presets, svgAvailable: false }).formats).not.toContain('svg');
  });
  it('applies a preset: single column width, square height, target font', () => {
    const form = applyPreset({ ...defaultForm(presets), widthMm: 120, heightMm: 60, basePt: 10 }, presets, 'cell');
    expect([form.preset, form.widthMm, form.heightMm, form.basePt]).toEqual(['cell', 85, 85, 7.5]);
    expect(applyPreset(form, presets, 'science')).toMatchObject({ widthMm: 55, heightMm: 55, basePt: 7 });
  });
  it('keeps the current values for custom and ignores unknown presets', () => {
    const form = { ...defaultForm(presets), widthMm: 123, heightMm: 77, basePt: 9 };
    expect(applyPreset(form, presets, 'custom')).toEqual({ ...form, preset: 'custom' });
    expect(applyPreset(form, presets, 'nope')).toBe(form);
  });
  it('clamps numbers to the server limits and dpi to the allowed list', () => {
    const form = clampForm({ ...defaultForm(presets), widthMm: 500, heightMm: 10, basePt: 4, dpi: 700 }, presets);
    expect([form.widthMm, form.heightMm, form.basePt, form.dpi]).toEqual([250, 40, 5, 600]);
    expect(clampForm({ ...defaultForm(presets), widthMm: Number.NaN }, presets).widthMm).toBe(89);
  });
  it('validates against the limits with Team\'s field names', () => {
    expect(validateForm(defaultForm(presets), presets)).toEqual([]);
    expect(validateForm({ ...defaultForm(presets), widthMm: 30, basePt: 13, formats: [] }, presets)).toEqual([
      'Width must be between 40 and 250 mm.', 'Base font must be between 5 and 12 pt.', 'Choose at least one format.']);
    expect(validateForm({ ...defaultForm(presets), dpi: 72 }, presets)).toEqual(['Resolution must be 300, 600 or 1200 DPI.']);
  });
  it('converts millimetres to inches and pixels at a dpi', () => {
    expect(mmToInches(25.4)).toBe(1);
    expect(mmToPx(89, 600)).toBe(2102);
    expect(mmToPx(85, 300)).toBe(1004);
    const size = imageSize(85, 60, 300);
    expect(size.px).toEqual({ width: 1004, height: 709 });
    expect(size.scale).toBe(300 / 96);
    expect(size.width * size.scale).toBeCloseTo(1004);
    expect(size.height * size.scale).toBeCloseTo(709);
  });
  it('keeps rscript with its csv (Team) and svg only when available', () => {
    expect(setFormat(['pdf'], 'rscript', true, presets)).toEqual(['pdf', 'csv', 'rscript']);
    expect(setFormat(['pdf', 'csv', 'rscript'], 'csv', false, presets)).toEqual(['pdf', 'csv', 'rscript']);
    expect(setFormat(['pdf', 'csv', 'rscript'], 'rscript', false, presets)).toEqual(['pdf', 'csv']);
    expect(setFormat(['pdf'], 'svg', true, { ...presets, svgAvailable: false })).toEqual(['pdf']);
  });
  it('builds the request body in the API field names', () => {
    const form = { ...applyPreset(defaultForm(presets), presets, 'cell'), dpi: 300, formats: ['png', 'rscript'] as const };
    expect(exportRequest({ ...form, formats: [...form.formats] }, presets)).toEqual({ figureKey: 'pca_2d', preset: 'cell', widthMm: 85, heightMm: 85, dpi: 300, basePt: 7.5, fontFamily: 'sans', hybridMode: true, formats: ['png', 'csv', 'rscript'] });
    expect(exportRequest({ ...defaultForm(presets), formats: ['svg'] }, { ...presets, svgAvailable: false }).formats).toEqual([]);
  });
});
