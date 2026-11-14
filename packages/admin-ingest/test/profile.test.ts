import { describe, expect, it } from 'vitest';
import { checks, detectionProfile, parseSciexTxt } from '../src/index.js';

const rows = (blank: string) => [
  'Sample Name\tS1\tS2\tS3\tBLANK1\tQC1',
  'Sample Type\tUnknown\tUnknown\tUnknown\tBlank\tQuality Control',
  `L1\t1\t2\t3\t${blank}\t4`,
  `L2\tN/A\t0\t3\t${blank}\t4`,
  'L3\tN/A\tN/A\t3\tN/A\t4',
  'L4\tN/A\tN/A\tN/A\tN/A\t4',
  'IS1_SPLASH.IS\t1\t1\t1\t1\t1',
  'DAG(20:0_20:4)+NH4 b\t1\t1\t1\t1\t1',
].join('\n');

describe('detectionProfile', () => {
  it('counts lipids per injection, IS and drop-list rows excluded, zero counted as a value', () => {
    const profile = detectionProfile(parseSciexTxt(rows('N/A')));
    expect(profile.perSample.map(s => s.detected)).toEqual([1, 2, 3, 0, 4]);
    expect(profile.bars).toEqual([
      { kind: 'min', sample: 'S1', detected: 1 }, { kind: 'median', detected: 2 }, { kind: 'max', sample: 'S3', detected: 3 },
      { kind: 'blank', sample: 'BLANK1', detected: 0, likeSample: false },
    ]);
    expect(profile.neverDetected).toEqual(['L4']);
  });
  it('flags a blank that detects about as many lipids as a sample, in step with the blank check', () => {
    const parsed = parseSciexTxt(rows('5'));
    expect(detectionProfile(parsed).bars.at(-1)).toEqual({ kind: 'blank', sample: 'BLANK1', detected: 2, likeSample: true });
    expect(checks(parsed).find(c => c.id === 'blank-detection')?.status).toBe('stop');
  });
  it('does not change the parsed input', () => {
    const parsed = parseSciexTxt(rows('5'));
    const before = structuredClone(parsed);
    detectionProfile(parsed);
    expect(parsed).toEqual(before);
  });
});
