import "server-only";
import { parseSciexTxt, classify, checks, detectionProfile } from "@lipidomic/admin-ingest";
// Counts and lists for review only; the raw peak areas are kept as uploaded and never changed here.
export function summarizeResults(text: string) {
  const parsed = parseSciexTxt(text);
  const classified = classify(parsed);
  const profile = detectionProfile(parsed);
  return {
    injections: classified.counts.samplesByType,
    analytes: classified.lipids.map(row => row.name),
    internalStandards: classified.internalStandards.length,
    internalStandardNames: classified.internalStandards.map(row => row.name),
    internalStandardsByKit: classified.counts.internalStandardsByKit,
    duplicatesDropped: classified.droppedRows.length,
    droppedRows: classified.droppedRows,
    naShare: classified.counts.nullCellShare,
    neverDetected: profile.neverDetected,
    detection: profile.bars,
    checks: checks(parsed),
  };
}
export type ResultsSummary = ReturnType<typeof summarizeResults>;
export type NameEntry = { id?: string; export_name: string; clean_name: string; rule?: string | null };
export { canAcceptResults } from "./results-gate";
export function unmappedAnalytes(analytes: string[], entries: NameEntry[]) {
  const names = new Set(entries.map(entry => entry.export_name));
  return [...new Set(analytes)].filter(name => !names.has(name));
}
