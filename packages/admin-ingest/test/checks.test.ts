import { describe, expect, it } from 'vitest';
import { checks, parseSciexTxt } from '../src/index.js';
const text = 'Sample Name\tA\tB\tBlank1\tQC1\nSample Type\tUnknown\tUnknown\tBlank\tQuality Control\nL1\t1\t2\tN/A\t3\nL2\tN/A\t2\tN/A\t3';
describe('checks', () => {
  it('returns stable ids and explicit ok results for valid headers and names', () => {
    const results = checks(parseSciexTxt(text));
    expect(results.map(r => r.id)).toEqual(['header-rows', 'sample-names-unique', 'sample-registry', 'planned-sample-types', 'pooled-qc', 'blank-detection']);
    expect(results.every(r => r.status === 'ok')).toBe(true);
    expect(results.every(r => r.message.length > 0)).toBe(true);
  });
  it('reports malformed header structure, duplicate names, and unsupported types', () => {
    expect(checks({ samples: [{ name: '', type: 'Unknown' }], analytes: [] })[0]?.status).toBe('stop');
    expect(checks({ samples: [{ name: 'A', type: 'Other' }], analytes: [] })[0]?.status).toBe('stop');
    expect(checks({ samples: [{ name: 'A', type: 'Unknown' }], analytes: [{ name: 'L', values: [] }] })[0]?.status).toBe('stop');
    const parsed = parseSciexTxt(text.replace('A\tB', 'A\tA'));
    expect(checks(parsed).find(r => r.id === 'sample-names-unique')).toMatchObject({ status: 'stop', message: expect.stringContaining('A') });
  });
  it('checks an optional names-only registry and optional planned types', () => {
    const parsed = parseSciexTxt(text);
    expect(checks(parsed, ['A', 'B', 'Blank1', 'QC1']).find(r => r.id === 'sample-registry')?.status).toBe('ok');
    expect(checks(parsed, ['A']).find(r => r.id === 'sample-registry')).toMatchObject({ status: 'stop', message: expect.stringContaining('Blank1') });
    expect(checks(parsed, []).find(r => r.id === 'sample-registry')?.status).toBe('stop');
    const registry = [{ name: 'A', type: 'Blank' }, { name: 'B' }, { name: 'Blank1', type: 'Blank' }, { name: 'QC1', type: 'Quality Control' }];
    expect(checks(parsed, registry).find(r => r.id === 'planned-sample-types')).toMatchObject({ status: 'stop', message: expect.stringContaining('A') });
    registry[0]!.type = 'Unknown';
    expect(checks(parsed, registry).every(r => r.status === 'ok')).toBe(true);
  });
  it('warns when there are zero pooled QC injections', () => {
    const parsed = parseSciexTxt(text.replace('Quality Control', 'Unknown'));
    expect(checks(parsed).find(r => r.id === 'pooled-qc')).toMatchObject({ status: 'warn' });
  });
  it('stops and names a blank with sample-like detection, excluding IS/drop rows', () => {
    const parsed = parseSciexTxt('Sample Name\tA\tB\tSYNTHETIC_MISLABELLED_BLANK\nSample Type\tUnknown\tUnknown\tBlank\nL1\t1\t2\t3\nL2\t1\t2\t3\nL3\t1\t2\tN/A\nL4\t1\t2\t3\nL5\t1\t2\t3\nPC_SPLASH.IS\t1\t2\tN/A\nDAG(20:0_20:4)+NH4 b\t1\t2\tN/A');
    expect(checks(parsed).find(r => r.id === 'blank-detection')).toMatchObject({ status: 'stop', message: expect.stringContaining('SYNTHETIC_MISLABELLED_BLANK') });
    parsed.analytes[2]!.values[2] = 1;
    expect(checks(parsed).find(r => r.id === 'blank-detection')?.status).toBe('stop');
  });
  it('does not flag empty blanks against a zero median or divide by zero without Unknowns', () => {
    expect(checks(parseSciexTxt('Sample Name\tA\tBlank\nSample Type\tUnknown\tBlank\nL\tN/A\tN/A')).find(r => r.id === 'blank-detection')?.status).toBe('ok');
    expect(checks(parseSciexTxt('Sample Name\tBlank\nSample Type\tBlank\nL\t1')).find(r => r.id === 'blank-detection')?.status).toBe('ok');
  });
});
