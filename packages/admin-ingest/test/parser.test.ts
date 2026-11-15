import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSciexTxt } from '../src/index.js';

export const fixture = readFileSync(new URL('./fixtures/sciex-synthetic.txt', import.meta.url), 'utf8');
describe('parseSciexTxt', () => {
  it('preserves sample order, names, doubles, true zeros and missing values', () => {
    const parsed = parseSciexTxt(fixture);
    expect(parsed.samples).toEqual([
      { name: 'S1', type: 'Unknown' }, { name: 'S2', type: 'Unknown' },
      { name: 'S3', type: 'Unknown' }, { name: 'BLANK1', type: 'Blank' },
      { name: 'QC1', type: 'Quality Control' },
    ]);
    expect(parsed.analytes).toHaveLength(40);
    expect(parsed.analytes[0]).toEqual({ name: 'PC(14:0_16:0)+AcO', values: [1400.123456789, null, 0, null, 370000000] });
    expect(parsed.analytes[1]?.values[1]).toBeNull();
  });
  it('accepts a BOM, CRLF, and a final newline', () => {
    expect(parseSciexTxt('\uFEFF' + fixture.replace(/\n/g, '\r\n'))).toEqual(parseSciexTxt(fixture));
  });
  it.each([
    ['Wrong\tS\nSample Type\tUnknown', /row 1.*Sample Name/i],
    ['Sample Name\tS\nWrong\tUnknown', /row 2.*Sample Type/i],
    ['', /row 1.*Sample Name/i],
    ['Sample Name\tS', /row 2.*Sample Type/i],
    ['Sample Name\nSample Type', /sample column/i],
    ['Sample Name\t\nSample Type\tUnknown', /sample name/i],
    ['Sample Name\tS\nSample Type\tUnknown\tBlank', /row 2.*columns/i],
    ['Sample Name\tS\nSample Type\tUnknown\nL\t1\t2', /row 3.*columns/i],
    ['Sample Name\tS\nSample Type\tUnknown\nL\tNaN', /row 3.*numeric/i],
    ['Sample Name\tS\nSample Type\tUnknown\nL\tInfinity', /numeric/i],
    ['Sample Name\tS\nSample Type\tUnknown\nL\t0x10', /numeric/i],
    ['Sample Name\tS\nSample Type\tUnknown\n\t1', /analyte name/i],
  ])('rejects invalid input with context: %s', (input, error) => {
    expect(() => parseSciexTxt(input)).toThrow(error);
  });
});
