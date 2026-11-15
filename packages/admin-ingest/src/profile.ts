import { DEFAULT_RULES, internalStandardKit, median } from './classify.js';
import { BLANK_DETECTION_RATIO } from './checks.js';
import type { ParsedSciex } from './types.js';

export interface SampleDetection { name: string; type: string; detected: number }
export interface DetectionBar {
  kind: 'min' | 'median' | 'max' | 'blank';
  /** Sample name; absent for the median, which is not one sample. */
  sample?: string;
  detected: number;
  /** Blank only: detects at least BLANK_DETECTION_RATIO of the Unknown median, like a sample would. */
  likeSample?: boolean;
}
export interface DetectionProfile {
  perSample: SampleDetection[];
  /** min, median and max over Unknown samples, then every Blank, in file order. */
  bars: DetectionBar[];
  /** Lipids (drop list and IS rows excluded) with no value in any Unknown sample. */
  neverDetected: string[];
}

/**
 * Detected lipids per injection, counted the same way as the blank-detection check: lipid rows only
 * (drop-list and internal-standard rows excluded), a cell counts when it has a value (zero included).
 */
export function detectionProfile(parsed: ParsedSciex): DetectionProfile {
  const dropped = new Set(DEFAULT_RULES.dropList);
  const lipids = parsed.analytes.filter(row => !dropped.has(row.name) && internalStandardKit(row.name) === null);
  const perSample = parsed.samples.map((sample, index) => ({
    name: sample.name, type: sample.type,
    detected: lipids.reduce((sum, row) => sum + (row.values[index] === null || row.values[index] === undefined ? 0 : 1), 0),
  }));
  const unknown = perSample.filter(sample => sample.type === 'Unknown');
  const bars: DetectionBar[] = [];
  const sampleMedian = median(unknown.map(sample => sample.detected));
  if (unknown.length) {
    const min = unknown.reduce((a, b) => (b.detected < a.detected ? b : a));
    const max = unknown.reduce((a, b) => (b.detected > a.detected ? b : a));
    bars.push({ kind: 'min', sample: min.name, detected: min.detected }, { kind: 'median', detected: sampleMedian }, { kind: 'max', sample: max.name, detected: max.detected });
  }
  for (const blank of perSample.filter(sample => sample.type === 'Blank')) {
    bars.push({ kind: 'blank', sample: blank.name, detected: blank.detected, likeSample: sampleMedian > 0 && blank.detected >= BLANK_DETECTION_RATIO * sampleMedian });
  }
  const unknownIndices = parsed.samples.flatMap((sample, index) => (sample.type === 'Unknown' ? [index] : []));
  const neverDetected = unknownIndices.length ? lipids.filter(row => unknownIndices.every(index => row.values[index] === null)).map(row => row.name) : [];
  return { perSample, bars, neverDetected };
}
