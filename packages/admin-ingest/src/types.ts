/** Values are raw peak areas; zero is a value, null is a missing measurement. */
export interface Sample { name: string; type: string }
export interface Analyte { name: string; values: (number | null)[] }
export interface ParsedSciex { samples: Sample[]; analytes: Analyte[] }

export const IS_KITS = ['Ultimate_SPLASH_ONE', 'SPLASH', 'SphingoSPLASH_ONE', 'Sigma', 'other'] as const;
export type InternalStandardKit = typeof IS_KITS[number];
export interface InternalStandard extends Analyte { kit: InternalStandardKit }
export interface ClassificationRules { dropList?: readonly string[] }
export interface IngestionCounts {
  samplesByType: Record<string, number>;
  lipidsKept: number;
  internalStandardsByKit: Record<InternalStandardKit, number>;
  /** Fraction in [0,1], measured on kept lipids × Unknown sample columns. */
  nullCellShare: number;
  lipidsNeverDetected: number;
  detectedLipidsPerSample: { min: number; median: number; max: number };
}
export interface ClassifiedSciex {
  samples: Sample[];
  lipids: Analyte[];
  internalStandards: InternalStandard[];
  /** Blank and Quality Control columns, with all retained lipid AND IS rows. */
  qcInjections: ParsedSciex;
  droppedRows: string[];
  rules: { dropList: string[] };
  counts: IngestionCounts;
}

export interface CheckResult { id: string; status: 'ok' | 'warn' | 'stop'; message: string }
export interface RegistrySample { name: string; /** Optional planned SCIEX Sample Type. */ type?: string }
export type SampleRegistry = readonly (string | RegistrySample)[];

export interface SampleMetadata {
  /** Join key: exact SCIEX Sample Name. Not written as a seventh Metadata column. */
  sampleName: string;
  FullName: string;
  Group1Term?: string | number | null;
  Group2Term?: string | number | null;
  ReplicateTerm?: string | number | null;
  PatientTerm?: string | number | null;
  TimePointTerm?: string | number | null;
}
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface DatasetProvenance {
  /** Exact source string, before BOM removal or newline normalization. */
  sourceText: string;
  datasetVersion: string;
  sciexOsVersion?: string;
  processingMethod?: string;
  signatures?: readonly JsonValue[];
}
export interface BuildDatasetOptions {
  metadata?: readonly SampleMetadata[];
  headerMode: 'sampleName' | 'fullName';
  provenance: DatasetProvenance;
}
