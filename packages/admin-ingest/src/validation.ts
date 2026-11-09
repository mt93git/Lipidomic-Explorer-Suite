import type { ParsedSciex } from './types.js';
export const SAMPLE_TYPES: readonly string[] = ['Unknown', 'Blank', 'Quality Control'];

/** Header literals are enforced by the parser; verify the resulting matrix structure here. */
export function matrixProblems(parsed: ParsedSciex): string[] {
  const problems: string[] = [];
  for (const sample of parsed.samples) {
    if (!sample.name.trim()) problems.push('Empty sample name.');
    if (!SAMPLE_TYPES.includes(sample.type)) problems.push(`Unsupported Sample Type "${sample.type}" for "${sample.name}".`);
  }
  for (const row of parsed.analytes) {
    if (!row.name.trim()) problems.push('Empty analyte name.');
    if (row.values.length !== parsed.samples.length) problems.push(`Analyte "${row.name}" has ${row.values.length} values; expected ${parsed.samples.length}.`);
    if (row.values.some(v => v !== null && (typeof v !== 'number' || !Number.isFinite(v)))) problems.push(`Analyte "${row.name}" contains a nonfinite or nonnumeric value.`);
  }
  return problems;
}
