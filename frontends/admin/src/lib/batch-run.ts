// Batch page shapes (what /batch-run shows) and the small pure helpers for its files. The database reads are in
// data/batches.ts; the demo's record of batches is in batch-demo.ts.
import type { Injection } from "./batch";

export type BatchStatus = "planned" | "sequence_exported" | "acquired" | "processed" | "qc_checked";
export const batchStatusLabels: Record<BatchStatus, string> = {
  planned: "Planned", sequence_exported: "Sequence exported", acquired: "Acquired", processed: "Processed", qc_checked: "QC checked",
};
export const batchStatusLabel = (status: string) => batchStatusLabels[status as BatchStatus] ?? status;

// One row of the saved sequence, with the sample it belongs to (controls have none). sample_name is the sample code;
// FullName is not stored on the injection, it is read from the registry sample for the bench sheet (null for controls).
export type BatchInjection = Injection & { sampleCode: string | null; orderCode: string | null; status: string };
export type BatchDetail = {
  id: string; name: string; status: BatchStatus; panel: string; version: number; createdAt: string;
  exportedAt: string | null; exportedBy: string | null; sequenceSha256: string | null;
  rules: unknown; injections: BatchInjection[]; orderCodes: string[];
};
export type BatchSummary = { name: string; status: BatchStatus; panel: string; createdAt: string; injectionCount: number };

export type BatchFile = "sequence" | "bench-sheet";
export const batchFileNames: Record<BatchFile, (batch: string) => string> = {
  sequence: batch => `${batch}-sequence.csv`,
  "bench-sheet": batch => `${batch}-bench-sheet.csv`,
};

// A batch name as the database allows it (B2026-031); anything else never reaches a query or a file name.
export const BATCH_NAME = /^B\d{4}-\d{3,}$/;

// What the batch page offers next. Files can be downloaded at any time; export freezes the sequence (planned only);
// acquisition is recorded only for an exported sequence. The database enforces the same order.
export function batchSteps(status: BatchStatus): { canExport: boolean; canAcquire: boolean; summary: string } {
  if (status === "planned") return { canExport: true, canAcquire: false, summary: "Download the sequence and the bench sheet, load the instrument, then mark the sequence exported." };
  if (status === "sequence_exported") return { canExport: false, canAcquire: true, summary: "The sequence is frozen. When the instrument has run it, mark the batch acquired." };
  return { canExport: false, canAcquire: false, summary: status === "acquired" ? "Acquired. Accept the results file in Ingest results." : `${batchStatusLabel(status)}.` };
}
