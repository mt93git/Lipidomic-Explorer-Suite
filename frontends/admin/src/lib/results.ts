import "server-only";
import { parseSciexTxt, classify, checks } from "@lipidomic/admin-ingest";
export function summarizeResults(text: string) {
  const parsed = parseSciexTxt(text);
  const classified = classify(parsed);
  return {
    injections: classified.counts.samplesByType,
    analytes: classified.lipids.map(row => row.name),
    internalStandards: classified.internalStandards.length,
    duplicatesDropped: classified.droppedRows.length,
    naShare: classified.counts.nullCellShare,
    checks: checks(parsed),
  };
}
export type ResultsSummary = ReturnType<typeof summarizeResults>;
export type NameEntry = { id?: string; export_name: string; clean_name: string };
export { canAcceptResults } from "./results-gate";
export function unmappedAnalytes(analytes: string[], entries: NameEntry[]) {
  const names = new Set(entries.map(entry => entry.export_name));
  return analytes.filter(name => !names.has(name));
}
