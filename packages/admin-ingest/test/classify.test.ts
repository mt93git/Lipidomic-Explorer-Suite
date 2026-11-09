import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify, parseSciexTxt } from '../src/index.js';

const fixture = readFileSync(new URL('./fixtures/sciex-synthetic.txt', import.meta.url), 'utf8');
describe('classify', () => {
  it('splits samples and injections; retains original order and input', () => {
    const parsed = parseSciexTxt(fixture);
    const before = structuredClone(parsed);
    const result = classify(parsed);
    expect(parsed).toEqual(before);
    expect(result.samples.map(s => s.name)).toEqual(['S1', 'S2', 'S3']);
    expect(result.qcInjections.samples.map(s => s.name)).toEqual(['BLANK1', 'QC1']);
    expect(result.lipids).toHaveLength(33);
    expect(result.lipids[0]?.values).toEqual([1400.123456789, null, 0]);
    expect(result.qcInjections.analytes[0]?.values).toEqual([null, 370000000]);
    expect(result.qcInjections.analytes).toHaveLength(39);
    expect(result.internalStandards).toHaveLength(6);
    expect(result.internalStandards[0]?.values).toEqual([1, 2, null]);
    expect(result.droppedRows).toEqual(['DAG(20:0_20:4)+NH4 b']);
    expect(result.counts.samplesByType).toEqual({ Unknown: 3, Blank: 1, 'Quality Control': 1 });
    expect(result.counts.lipidsKept).toBe(33);
    expect(result.counts.internalStandardsByKit).toEqual({ Ultimate_SPLASH_ONE: 1, SPLASH: 1, SphingoSPLASH_ONE: 1, Sigma: 1, other: 2 });
    expect(result.counts.lipidsNeverDetected).toBe(1);
    const detections = result.lipids[0]!.values.map((_, col) => result.lipids.filter(r => r.values[col] !== null).length).sort((a,b) => a-b);
    expect(result.counts.detectedLipidsPerSample).toEqual({ min: detections[0], median: detections[1], max: detections[2] });
    const nulls = result.lipids.flatMap(r => r.values).filter(v => v === null).length;
    expect(result.counts.nullCellShare).toBe(nulls / (33 * 3));
  });
  it('makes the drop rule configurable data, without dropping all b suffixes', () => {
    const parsed = parseSciexTxt(fixture);
    expect(classify(parsed, { dropList: [] }).lipids).toHaveLength(34);
    const result = classify(parsed, { dropList: ['Synthetic lipid 1'] });
    expect(result.lipids.some(r => r.name.endsWith(' b'))).toBe(true);
    expect(result.droppedRows).toEqual(['Synthetic lipid 1']);
  });
  it('matches suffix kits precisely, and recognises both IS forms', () => {
    const parsed = { samples: [{ name: 'A', type: 'Unknown' }], analytes: [
      { name: 'not.IS.extra', values: [1] },
      { name: 'PC_SPLASH.IS', values: [2] },
      { name: 'PC_Ultimate_SPLASH_ONE.IS', values: [3] },
      { name: 'PC_SphingoSPLASH_ONE.IS', values: [4] },
      { name: 'Cer (IS) extra', values: [5] },
      { name: 'PC_AlmostSPLASH.IS', values: [6] },
    ] };
    const result = classify(parsed);
    expect(result.lipids.map(r => r.name)).toEqual(['not.IS.extra']);
    expect(result.internalStandards.map(r => r.kit)).toEqual(['SPLASH', 'Ultimate_SPLASH_ONE', 'SphingoSPLASH_ONE', 'other', 'other']);
  });
  it('returns defined zero counts for an empty matrix and an even sample median', () => {
    const empty = classify({ samples: [], analytes: [] });
    expect(empty.counts.nullCellShare).toBe(0);
    expect(empty.counts.detectedLipidsPerSample).toEqual({ min: 0, median: 0, max: 0 });
    const result = classify({ samples: [{ name: 'A', type: 'Unknown' }, { name: 'B', type: 'Unknown' }], analytes: [{ name: 'L', values: [1, null] }] });
    expect(result.counts.detectedLipidsPerSample).toEqual({ min: 0, median: 0.5, max: 1 });
  });
  it('rejects unsupported sample types rather than silently losing columns', () => {
    expect(() => classify({ samples: [{ name: 'A', type: 'Typo' }], analytes: [] })).toThrow(/sample type.*Typo/i);
  });
});
