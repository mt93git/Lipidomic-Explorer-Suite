import "server-only";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { buildDatasetV1, classify, parseSciexTxt, type SampleMetadata } from "@lipidomic/admin-ingest";
import type { HeaderMode } from "./release";

// The server-side build step. From the accepted SCIEX OS results TXT, @lipidomic/admin-ingest builds the
// dataset v1 workbook; it is then split into the analysis file (what Team's library receives: Abundance +
// Metadata, since Team's loader merges every sheet of a workbook) and the companion Admin keeps
// (Internal_Standards + QC_Injections + Provenance). Cells are copied, never transformed. Digests and sizes
// are computed here, on the exact bytes that get stored, and recorded on admin.dataset by build_dataset.
export const DATASET_SHEETS = ["Abundance", "Metadata", "Internal_Standards", "QC_Injections", "Provenance"] as const;
export const ANALYSIS_SHEETS = ["Abundance", "Metadata"] as const;
export const COMPANION_SHEETS = ["Internal_Standards", "QC_Injections", "Provenance"] as const;

export type BuiltFile = { bytes: Buffer; sha256: string; sizeBytes: number; sheets: string[] };
export type BuildInput = {
  sourceText: string; metadata: SampleMetadata[]; headerMode: HeaderMode; datasetVersion: string;
  sciexOsVersion?: string | null; processingMethod?: string | null;
  // The digest of the accepted TXT bytes. When given, Provenance's source_txt_sha256 must equal it, or nothing is built.
  sourceSha256?: string;
};
export type BuildCounts = { samples: number; lipids: number; internalStandards: number; qcInjections: number; dropped: number };
export type BuildOutput = { full: BuiltFile; analysis: BuiltFile; companion: BuiltFile; counts: BuildCounts; sampleNames: string[] };

export const digest = (bytes: Buffer | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// The accepted TXT as text, byte for byte: strict UTF-8, and a leading BOM kept (the parser skips it), so the
// text re-encodes to exactly the accepted bytes and Provenance's source_txt_sha256 names those bytes.
export const sourceTextOf = (bytes: Buffer | Uint8Array) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);

// The Unknown injections of an export, in column order: what the registry is matched against.
export const unknownSampleNames = (sourceText: string) => parseSciexTxt(sourceText).samples.filter(sample => sample.type === "Unknown").map(sample => sample.name);

async function load(bytes: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
  return book;
}

// A new workbook holding copies of the named sheets, rows and cells as they are.
async function extract(source: ExcelJS.Workbook, names: readonly string[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  for (const name of names) {
    const from = source.getWorksheet(name)!;
    const to = book.addWorksheet(name);
    from.eachRow({ includeEmpty: true }, (row, number) => { to.getRow(number).values = row.values; });
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

// Split a dataset v1 workbook (the five sheets in order) into its two deliverables.
export async function splitDatasetV1(full: Buffer): Promise<{ analysis: Buffer; companion: Buffer }> {
  const book = await load(full);
  const names = book.worksheets.map(sheet => sheet.name);
  if (names.join("|") !== DATASET_SHEETS.join("|")) throw new Error(`Not a dataset v1 workbook: sheets are ${names.join(", ") || "none"}.`);
  return { analysis: await extract(book, ANALYSIS_SHEETS), companion: await extract(book, COMPANION_SHEETS) };
}

const file = (bytes: Buffer, sheets: readonly string[]): BuiltFile => ({ bytes, sha256: digest(bytes), sizeBytes: bytes.byteLength, sheets: [...sheets] });

export async function buildDatasetFiles(input: BuildInput): Promise<BuildOutput> {
  if (input.sourceSha256 && digest(Buffer.from(input.sourceText, "utf8")) !== input.sourceSha256) {
    throw new Error("The results text does not re-encode to the accepted bytes; its Provenance would name another file. Nothing was built.");
  }
  const classified = classify(parseSciexTxt(input.sourceText));
  const provenance = {
    sourceText: input.sourceText, datasetVersion: input.datasetVersion,
    ...(input.sciexOsVersion ? { sciexOsVersion: input.sciexOsVersion } : {}),
    ...(input.processingMethod ? { processingMethod: input.processingMethod } : {}),
  };
  const full = await buildDatasetV1(classified, { headerMode: input.headerMode, metadata: input.metadata, provenance });
  const { analysis, companion } = await splitDatasetV1(full);
  return {
    full: file(full, DATASET_SHEETS), analysis: file(analysis, ANALYSIS_SHEETS), companion: file(companion, COMPANION_SHEETS),
    counts: { samples: classified.samples.length, lipids: classified.lipids.length, internalStandards: classified.internalStandards.length, qcInjections: classified.qcInjections.samples.length, dropped: classified.droppedRows.length },
    sampleNames: classified.samples.map(sample => sample.name),
  };
}
