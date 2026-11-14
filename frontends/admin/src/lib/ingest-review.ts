import type { CheckResult, DetectionBar } from "@lipidomic/admin-ingest";

// Presentation of a parsed SCIEX OS export on Ingest results: tiles, file-check rows, comparison with the
// previously accepted file, and the dictionary's import list. Pure and client-safe: it reads counts, it never
// computes or changes a peak area.

export type ReviewSummary = {
  injections: Record<string, number>;
  analytes: string[];
  internalStandards: number;
  internalStandardsByKit?: Record<string, number>;
  duplicatesDropped: number;
  droppedRows?: string[];
  naShare: number;
  neverDetected?: string[];
  detection?: DetectionBar[];
  checks: CheckResult[];
};
export type CheckStatus = CheckResult["status"];
export type Tile = { value: string; label: string; tone?: "warn" };
export type FileCheckRow = { check: string; result: string; status?: CheckStatus; list?: string[]; note?: string };

const number = (value: number) => value.toLocaleString("en-US");
const typeOrder = ["Unknown", "Blank", "Quality Control"];
const typeLabel = (type: string) => type === "Quality Control" ? "QC" : type;

export function sampleTotal(summary: Pick<ReviewSummary, "injections">) {
  return Object.values(summary.injections).reduce((sum, count) => sum + count, 0);
}

export function statTiles(summary: ReviewSummary, toMap: number): Tile[] {
  const types = Object.entries(summary.injections).sort(([a], [b]) => (typeOrder.indexOf(a) + 1 || 99) - (typeOrder.indexOf(b) + 1 || 99));
  return [
    { value: number(sampleTotal(summary)), label: `samples · ${types.map(([type, count]) => `${number(count)} ${typeLabel(type)}`).join(", ")}` },
    { value: number(summary.analytes.length), label: "lipids" },
    { value: number(summary.internalStandards), label: "internal standards" },
    { value: `${(summary.naShare * 100).toFixed(1)} %`, label: "cells N/A → NA" },
    { value: number(toMap), label: "names to map", tone: "warn" },
  ];
}

const worst = (...statuses: (CheckStatus | undefined)[]): CheckStatus =>
  statuses.includes("stop") ? "stop" : statuses.includes("warn") ? "warn" : "ok";

export function fileCheckRows(summary: ReviewSummary): FileCheckRow[] {
  const check = (id: string) => summary.checks.find(item => item.id === id);
  const header = check("header-rows");
  const unique = check("sample-names-unique");
  const registry = check("sample-registry");
  const planned = check("planned-sample-types");
  const qc = check("pooled-qc");
  const blank = check("blank-detection");
  const total = sampleTotal(summary);
  const duplicates = unique?.status === "stop" ? (unique.message.replace(/^Duplicated sample names: |\.$/g, "").split(", ").filter(Boolean)) : [];
  const registryNote = registry?.message.startsWith("No registry") ? "Registry not supplied with this file; names checked for uniqueness only." : undefined;
  const mismatches = planned?.status === "stop" ? (planned.message.match(/\(planned /g) ?? []).length : 0;
  const kits = Object.entries(summary.internalStandardsByKit ?? {}).filter(([, count]) => count > 0).map(([kit, count]) => `${kit.replaceAll("_", " ")} ${number(count)}`);
  const qcCount = summary.injections["Quality Control"] ?? 0;
  const blanksLikeSamples = (summary.detection ?? []).filter(bar => bar.kind === "blank" && bar.likeSample).length;
  const rows: FileCheckRow[] = [
    { check: "Row 1 is Sample Name", result: "", status: header?.status ?? "ok" },
    { check: "Row 2 is Sample Type", result: "", status: header?.status ?? "ok" },
    { check: "Sample Names unique and in registry", result: `${number(total - duplicates.length)} / ${number(total)}`, status: worst(unique?.status, registry?.status), note: registryNote, list: duplicates.length ? duplicates : undefined },
    { check: "Sample Type matches the batch", result: mismatches ? `${mismatches} mismatch${mismatches === 1 ? "" : "es"}` : "no mismatch", status: planned?.status ?? "ok", note: mismatches ? planned?.message : undefined },
    { check: "Rows ending in .IS", result: `${number(summary.internalStandards)} → ISTD sheet` },
    { check: "ISTD kits", result: kits.length ? kits.join(" · ") : "none" },
  ];
  if (summary.duplicatesDropped) rows.push({ check: "Rows on the drop list", result: `${number(summary.duplicatesDropped)} → dropped, listed`, list: summary.droppedRows });
  if (summary.neverDetected) rows.push({ check: "Lipids never detected", result: `${number(summary.neverDetected.length)} → kept, listed`, list: summary.neverDetected.length ? summary.neverDetected : undefined });
  rows.push({ check: "Pooled QC injections", result: number(qcCount), status: qc?.status ?? (qcCount ? "ok" : "warn") });
  if (blank) rows.push({ check: "Blanks detect few lipids", result: blanksLikeSamples ? `${blanksLikeSamples} like a sample` : blank.status === "stop" ? "not checked" : "yes", status: blank.status, note: blank.status === "stop" ? blank.message : undefined });
  return rows;
}

export function openStops(checks: CheckResult[]) {
  return checks.filter(check => check.status === "stop").length;
}

export type ResultCounts = { samples: number; unknown: number; blank: number; qc: number; lipids: number; internalStandards: number; naShare: number; neverDetected?: number; medianDetected?: number };

// Tolerates older accepted summaries, saved before the detection profile existed (those fields stay undefined).
export function resultCounts(summary: Partial<ReviewSummary>): ResultCounts {
  const injections = summary.injections ?? {};
  return {
    samples: sampleTotal({ injections }), unknown: injections.Unknown ?? 0, blank: injections.Blank ?? 0, qc: injections["Quality Control"] ?? 0,
    lipids: summary.analytes?.length ?? 0, internalStandards: summary.internalStandards ?? 0, naShare: summary.naShare ?? 0,
    neverDetected: summary.neverDetected?.length, medianDetected: summary.detection?.find(bar => bar.kind === "median")?.detected,
  };
}

export type CountDiff = { label: string; previous: string; current: string; change: string; changed: boolean };

export function diffCounts(current: ResultCounts, previous: ResultCounts): CountDiff[] {
  const rows: [string, keyof ResultCounts][] = [["Samples", "samples"], ["Unknown", "unknown"], ["Blank", "blank"], ["Pooled QC", "qc"], ["Lipids", "lipids"], ["Internal standards", "internalStandards"], ["Lipids never detected", "neverDetected"], ["Median detected lipids", "medianDetected"]];
  const out: CountDiff[] = rows.flatMap(([label, key]) => {
    const now = current[key]; const before = previous[key];
    if (now === undefined || before === undefined) return [];
    const delta = now - before;
    return [{ label, previous: number(before), current: number(now), change: delta === 0 ? "=" : `${delta > 0 ? "+" : "−"}${number(Math.abs(delta))}`, changed: delta !== 0 }];
  });
  const points = Math.round((current.naShare - previous.naShare) * 1000) / 10;
  out.push({ label: "Cells N/A", previous: `${(previous.naShare * 100).toFixed(1)} %`, current: `${(current.naShare * 100).toFixed(1)} %`, change: points === 0 ? "=" : `${points > 0 ? "+" : "−"}${Math.abs(points).toFixed(1)} pt`, changed: points !== 0 });
  return out;
}

// Import list: a CSV (or tab-separated) file of "export name, clean name" rows. A header row is optional.
export const MAX_IMPORT_ROWS = 5000;
export function parseNameList(text: string): { rows: { export_name: string; clean_name: string }[]; errors: string[] } {
  const rows: { export_name: string; clean_name: string }[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const cells = splitRow(line);
    if (index === 0 && /export/i.test(cells[0] ?? "")) return;
    const [exportName = "", cleanName = ""] = cells;
    const row = index + 1;
    if (cells.length < 2 || !exportName.trim() || !cleanName.trim()) { errors.push(`Row ${row}: needs an export name and a clean name.`); return; }
    if (exportName.length > 500 || cleanName.trim().length > 500) { errors.push(`Row ${row}: names are limited to 500 characters.`); return; }
    if (seen.has(exportName)) { errors.push(`Row ${row}: ${exportName} appears twice in the list.`); return; }
    seen.add(exportName);
    rows.push({ export_name: exportName, clean_name: cleanName.trim() });
  });
  if (rows.length > MAX_IMPORT_ROWS) return { rows: [], errors: [`The list has ${rows.length} rows; import up to ${MAX_IMPORT_ROWS} at a time.`] };
  return { rows, errors };
}

function splitRow(line: string): string[] {
  const separator = line.includes("\t") ? "\t" : ",";
  const cells: string[] = [];
  let cell = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && !cell) quoted = true;
    else if (char === separator) { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  // Export names are kept exactly as written (they must match the SCIEX export); only the clean name is trimmed.
  return cells;
}
