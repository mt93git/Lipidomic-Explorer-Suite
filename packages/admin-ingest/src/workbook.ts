import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import type { Analyte, BuildDatasetOptions, ClassifiedSciex, SampleMetadata } from './types.js';
import { matrixProblems } from './validation.js';

export const METADATA_COLUMNS = ['FullName', 'Group1Term', 'Group2Term', 'ReplicateTerm', 'PatientTerm', 'TimePointTerm'] as const;

function unique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.trim()) throw new Error(`Missing ${label}.`);
    if (seen.has(value)) throw new Error(`Duplicated ${label}: "${value}".`);
    seen.add(value);
  }
}

/** Build dataset format 1 in memory. No filesystem, network, database, or value transformation. */
export async function buildDatasetV1(classified: ClassifiedSciex, options: BuildDatasetOptions): Promise<Buffer> {
  if (options.headerMode !== 'sampleName' && options.headerMode !== 'fullName') throw new Error('headerMode must be sampleName or fullName.');
  if (typeof options.provenance?.sourceText !== 'string') throw new Error('Provenance requires the exact sourceText for sha256.');
  if (!options.provenance.datasetVersion?.trim()) throw new Error('Provenance requires a datasetVersion.');
  const problems = [
    ...matrixProblems({ samples: classified.samples, analytes: [...classified.lipids, ...classified.internalStandards] }),
    ...matrixProblems(classified.qcInjections),
  ];
  if (problems.length) throw new Error(problems.join(' '));
  unique([...classified.samples, ...classified.qcInjections.samples].map(s => s.name), 'sample name');
  const metadata = options.metadata ?? [];
  unique(metadata.map(m => m.sampleName), 'metadata sampleName');
  const bySample = new Map<string, SampleMetadata>(metadata.map(m => [m.sampleName, m]));
  if (options.headerMode === 'fullName') {
    for (const sample of classified.samples) {
      if (!bySample.get(sample.name)?.FullName?.trim()) throw new Error(`Missing metadata FullName for sample "${sample.name}".`);
    }
    unique(metadata.map(m => m.FullName ?? ''), 'metadata FullName');
  }
  const headers = classified.samples.map(s => options.headerMode === 'fullName' ? bySample.get(s.name)!.FullName : s.name);
  unique(headers, 'Abundance header');
  const workbook = new ExcelJS.Workbook();
  const writeMatrix = (name: string, columns: string[], rows: readonly Analyte[]): void => {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(['Lipid', ...columns]);
    for (const row of rows) sheet.addRow([row.name, ...row.values]);
  };
  writeMatrix('Abundance', headers, classified.lipids);
  const metadataSheet = workbook.addWorksheet('Metadata');
  metadataSheet.addRow([...METADATA_COLUMNS]);
  classified.samples.forEach((sample, index) => {
    const row = bySample.get(sample.name);
    metadataSheet.addRow([headers[index]!, ...METADATA_COLUMNS.slice(1).map(key => row?.[key] ?? null)]);
  });
  writeMatrix('Internal_Standards', headers, classified.internalStandards);
  writeMatrix('QC_Injections', classified.qcInjections.samples.map(s => s.name), classified.qcInjections.analytes);
  const provenance = workbook.addWorksheet('Provenance');
  provenance.addRow(['Key', 'Value']);
  const entries: [string, string | number][] = [
    ['dataset_format', 1],
    ['dataset_version', options.provenance.datasetVersion],
    ['source_txt_sha256', createHash('sha256').update(options.provenance.sourceText, 'utf8').digest('hex')],
    ['sciex_os_version', options.provenance.sciexOsVersion ?? 'not provided'],
    ['processing_method', options.provenance.processingMethod ?? 'not provided'],
    ['value_type', 'raw peak area'],
    ['filters', JSON.stringify({ abundanceSampleType: 'Unknown', internalStandards: 'separate sheet', qcSampleTypes: ['Blank', 'Quality Control'], dropList: classified.rules.dropList })],
    ['exclusions', JSON.stringify(classified.droppedRows)],
    ['signatures', JSON.stringify(options.provenance.signatures ?? [])],
    ['header_mode', options.headerMode],
    ['sample_header_mapping', JSON.stringify(classified.samples.map((s,i) => ({ sampleName: s.name, header: headers[i] })))],
    ['qc_injection_types', JSON.stringify(classified.qcInjections.samples)],
  ];
  for (const entry of entries) provenance.addRow(entry);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
