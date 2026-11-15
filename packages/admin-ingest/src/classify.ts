import { IS_KITS } from './types.js';
import type { Analyte, ClassificationRules, ClassifiedSciex, InternalStandardKit, ParsedSciex } from './types.js';
import { matrixProblems } from './validation.js';

/** Exact names, not suffix heuristics. An explicit [] disables the default exclusions. */
export const DEFAULT_RULES: Readonly<{ dropList: readonly string[] }> = Object.freeze({
  dropList: Object.freeze(['DAG(20:0_20:4)+NH4 b']),
});

export function internalStandardKit(name: string): InternalStandardKit | null {
  if (!name.endsWith('.IS') && !name.includes('(IS)')) return null;
  for (const kit of IS_KITS) {
    if (kit !== 'other' && (name.endsWith(`_${kit}.IS`) || name === `${kit}.IS`)) return kit;
  }
  return 'other';
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function classify(parsed: ParsedSciex, rules: ClassificationRules = {}): ClassifiedSciex {
  const problems = matrixProblems(parsed);
  if (problems.length) throw new Error(problems.join(' '));
  const dropList = [...(rules.dropList ?? DEFAULT_RULES.dropList)];
  const dropped = new Set(dropList);
  const sampleIndices: number[] = [];
  const injectionIndices: number[] = [];
  const samplesByType: Record<string, number> = {};
  parsed.samples.forEach((sample, index) => {
    samplesByType[sample.type] = (samplesByType[sample.type] ?? 0) + 1;
    (sample.type === 'Unknown' ? sampleIndices : injectionIndices).push(index);
  });
  const project = (row: Analyte, indices: number[]): Analyte => ({ name: row.name, values: indices.map(index => row.values[index]!) });
  const result: ClassifiedSciex = {
    samples: sampleIndices.map(i => ({ ...parsed.samples[i]! })),
    lipids: [], internalStandards: [],
    qcInjections: { samples: injectionIndices.map(i => ({ ...parsed.samples[i]! })), analytes: [] },
    droppedRows: [], rules: { dropList },
    counts: {
      samplesByType, lipidsKept: 0,
      internalStandardsByKit: { Ultimate_SPLASH_ONE: 0, SPLASH: 0, SphingoSPLASH_ONE: 0, Sigma: 0, other: 0 },
      nullCellShare: 0, lipidsNeverDetected: 0,
      detectedLipidsPerSample: { min: 0, median: 0, max: 0 },
    },
  };
  for (const row of parsed.analytes) {
    if (dropped.has(row.name)) { result.droppedRows.push(row.name); continue; }
    const kit = internalStandardKit(row.name);
    if (kit === null) result.lipids.push(project(row, sampleIndices));
    else {
      result.internalStandards.push({ ...project(row, sampleIndices), kit });
      result.counts.internalStandardsByKit[kit]++;
    }
    result.qcInjections.analytes.push(project(row, injectionIndices));
  }
  const detected = sampleIndices.map(() => 0);
  let nulls = 0;
  for (const row of result.lipids) {
    let anyDetected = false;
    row.values.forEach((value, index) => {
      if (value === null) nulls++;
      else { detected[index] = detected[index]! + 1; anyDetected = true; }
    });
    if (!anyDetected) result.counts.lipidsNeverDetected++;
  }
  const total = result.lipids.length * sampleIndices.length;
  result.counts.lipidsKept = result.lipids.length;
  result.counts.nullCellShare = total ? nulls / total : 0;
  const sorted = detected.sort((a,b) => a-b);
  result.counts.detectedLipidsPerSample = { min: sorted[0] ?? 0, median: median(sorted), max: sorted.at(-1) ?? 0 };
  return result;
}
