import { DEFAULT_RULES, internalStandardKit, median } from './classify.js';
import type { CheckResult, ParsedSciex, SampleRegistry } from './types.js';
import { matrixProblems } from './validation.js';

/** Conservative review gate: blanks at or above 80% of Unknown median detections stop. */
export const BLANK_DETECTION_RATIO = 0.8;

export function checks(parsed: ParsedSciex, registry?: SampleRegistry): CheckResult[] {
  const problems = matrixProblems(parsed);
  if (parsed.samples.length === 0) problems.push('No sample columns.');
  const results: CheckResult[] = [{
    id: 'header-rows', status: problems.length ? 'stop' : 'ok',
    message: problems.length ? problems.join(' ') : 'Sample Name and Sample Type rows parsed; matrix structure is valid.',
  }];
  const seen = new Set<string>(); const duplicates = new Set<string>();
  for (const sample of parsed.samples) {
    if (seen.has(sample.name)) duplicates.add(sample.name);
    seen.add(sample.name);
  }
  results.push({ id: 'sample-names-unique', status: duplicates.size ? 'stop' : 'ok',
    message: duplicates.size ? `Duplicated sample names: ${[...duplicates].join(', ')}.` : 'Sample names are unique.' });
  const registered = registry === undefined ? undefined : new Map(registry.map(r => typeof r === 'string' ? [r, undefined] : [r.name, r.type]));
  const missing = registered === undefined ? [] : parsed.samples.filter(s => !registered.has(s.name)).map(s => s.name);
  results.push({ id: 'sample-registry', status: missing.length ? 'stop' : 'ok',
    message: registered === undefined ? 'No registry supplied; membership not checked.' : missing.length ? `Sample names absent from registry: ${missing.join(', ')}.` : 'All injection names are present in the registry.' });
  const mismatches = parsed.samples.flatMap(sample => {
    const planned = registered?.get(sample.name);
    return planned !== undefined && planned !== sample.type ? [`${sample.name} (planned ${planned}, observed ${sample.type})`] : [];
  });
  results.push({ id: 'planned-sample-types', status: mismatches.length ? 'stop' : 'ok',
    message: mismatches.length ? `Sample Type differs from plan: ${mismatches.join('; ')}.` : 'No supplied planned Sample Type conflicts.' });
  const qcCount = parsed.samples.filter(s => s.type === 'Quality Control').length;
  results.push({ id: 'pooled-qc', status: qcCount ? 'ok' : 'warn',
    message: qcCount ? `${qcCount} pooled QC injection(s).` : 'Zero pooled QC injections (Sample Type Quality Control).' });
  if (problems.length) {
    results.push({ id: 'blank-detection', status: 'stop', message: 'Blank detection cannot be checked until header/matrix problems are resolved.' });
    return results;
  }
  const dropped = new Set(DEFAULT_RULES.dropList);
  const lipids = parsed.analytes.filter(row => !dropped.has(row.name) && internalStandardKit(row.name) === null);
  const detections = parsed.samples.map((_, index) => lipids.reduce((sum, row) => sum + (row.values[index] === null ? 0 : 1), 0));
  const unknownCounts = detections.filter((_, index) => parsed.samples[index]!.type === 'Unknown');
  const sampleMedian = median(unknownCounts);
  const suspicious = parsed.samples.flatMap((sample, index) => sample.type === 'Blank' && sampleMedian > 0 && detections[index]! >= BLANK_DETECTION_RATIO * sampleMedian ? [`${sample.name} (${detections[index]} detected lipids)`] : []);
  results.push({ id: 'blank-detection', status: suspicious.length ? 'stop' : 'ok',
    message: suspicious.length ? `Blank injection(s) ${suspicious.join(', ')} have sample-like detection: at least ${BLANK_DETECTION_RATIO * 100}% of Unknown sample median ${sampleMedian}. Review Sample Type before proceeding.` : unknownCounts.length === 0 ? 'No Unknown samples; blank comparison unavailable.' : sampleMedian === 0 ? 'Unknown sample median is zero; blank comparison unavailable.' : `Blank detection is below ${BLANK_DETECTION_RATIO * 100}% of Unknown sample median ${sampleMedian}.` });
  return results;
}
