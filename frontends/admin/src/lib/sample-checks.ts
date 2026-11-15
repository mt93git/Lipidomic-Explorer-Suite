// The checks the sample registry runs on every paste: column matching, errors that block saving and warnings with
// suggested fixes. Pure: no React, no server imports. Presentation only; nothing here changes a computed value.
import { columns, emptyDraft, fieldForHeader, isCanonicalHeader, parseVolume, pasteLines, type SampleDraft, type SampleField } from "./samples";

export type Mapping = (SampleField | null)[];
export type ReadPaste = { headers: string[] | null; cells: string[][]; mapping: Mapping };

const labelOf = (field: SampleField) => columns.find(column => column.field === field)?.label ?? field;

// First header to claim a column gets it; a later repeat is left unused.
export function matchColumns(headers: string[]): Mapping {
  const seen = new Set<SampleField>();
  return headers.map(header => {
    const field = fieldForHeader(header);
    if (!field || seen.has(field)) return null;
    seen.add(field);
    return field;
  });
}

// The matches worth telling the operator about: a header that was not already the column's own name.
export function columnMatches(headers: string[], mapping: Mapping): { from: string; to: SampleField }[] {
  return headers.flatMap((from, index) => { const to = mapping[index]; return to && !isCanonicalHeader(from, to) ? [{ from, to }] : []; });
}

// A first row is a header when its first cell, or at least two of its cells, name one of our columns. Without a
// header the cells are read in the grid's column order.
export function readPaste(text: string): ReadPaste {
  const lines = pasteLines(text);
  if (!lines.length) return { headers: null, cells: [], mapping: [] };
  const first = lines[0];
  const known = first.filter(cell => fieldForHeader(cell)).length;
  if (fieldForHeader(first[0]) || known >= 2) return { headers: first, cells: lines.slice(1), mapping: matchColumns(first) };
  const width = Math.max(...lines.map(cells => cells.length));
  return { headers: null, cells: lines, mapping: Array.from({ length: width }, (_, index) => columns[index]?.field ?? null) };
}

export function draftFromCells(line: string[], mapping: Mapping): SampleDraft {
  const draft = emptyDraft();
  line.forEach((cell, index) => { const field = mapping[index]; if (field) draft[field] = cell; });
  return draft;
}

export const rowsFromPaste = (cells: string[][], mapping: Mapping): SampleDraft[] => cells.map(line => draftFromCells(line, mapping)).filter(draft => Object.values(draft).some(Boolean));

// ---------------------------------------------------------------- checks

export type Severity = "error" | "warning";
// row null: the issue is about a whole column. fix: the value a warning suggests, only when it is unambiguous.
export type CheckIssue = { severity: Severity; row: number | null; field: SampleField; message: string; fix?: string };
export type CheckOptions = { existingNames?: string[]; manifest?: string[] | null };

// The six columns Nexo reads from the Metadata sheet.
export const metadataFields: SampleField[] = ["full_name", "group1_term", "group2_term", "replicate_term", "patient_term", "time_point_term"];
const groupFields: SampleField[] = ["group1_term", "group2_term"];

const isNA = (value: string) => /^n\/?a$/i.test(value.trim());
const normalLabel = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, " ");

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

// "Apoptotic cel" and "Apoptotic cells", "WT" and "wt": a likely typo. "Dose1" and "Dose2" are two levels, not a typo.
export function nearDuplicate(a: string, b: string): boolean {
  const x = normalLabel(a);
  const y = normalLabel(b);
  if (a.trim() === b.trim()) return false;
  if (x === y) return true;
  if (x.replace(/\d+/g, "#") === y.replace(/\d+/g, "#")) return false;
  const longest = Math.max(x.length, y.length);
  return Math.min(x.length, y.length) >= 4 && distance(x, y) <= Math.max(1, Math.floor(longest / 6));
}

// The replicate set a FullName belongs to: AC_2h_R3 → AC_2h, Ctrl_1 → Ctrl.
export const fullNameStem = (name: string) => name.trim().replace(/[_\-. ]*(?:rep|r)?\d+$/i, "");

const severityRank: Record<Severity, number> = { error: 0, warning: 1 };
const fieldRank = (field: SampleField) => columns.findIndex(column => column.field === field);

export function checkSamples(drafts: SampleDraft[], options: CheckOptions = {}): CheckIssue[] {
  const issues: CheckIssue[] = [];
  if (!drafts.length) return issues;
  const value = (row: number, field: SampleField) => drafts[row][field].trim();

  // FullName: present, unique in the list (the later row is the one to fix) and not already registered.
  const registered = new Set((options.existingNames ?? []).map(name => name.trim()));
  const firstRow = new Map<string, number>();
  drafts.forEach((_, row) => {
    const name = value(row, "full_name");
    if (!name) issues.push({ severity: "error", row, field: "full_name", message: "FullName is empty. Every sample needs one." });
    else if (registered.has(name)) issues.push({ severity: "error", row, field: "full_name", message: `FullName ${name} is already registered in this order. Nexo matches samples by FullName.` });
    else if (firstRow.has(name)) issues.push({ severity: "error", row, field: "full_name", message: `FullName ${name} is already used. Nexo matches samples by FullName.` });
    if (name && !firstRow.has(name)) firstRow.set(name, row);
  });

  // A Metadata column no row fills is a column the paste did not bring.
  for (const field of metadataFields.slice(1)) {
    if (drafts.every((_, row) => !value(row, field))) issues.push({ severity: "error", row: null, field, message: `${labelOf(field)} column is missing. Nexo needs the six Metadata columns: map a pasted column to it, or write NA where it does not apply.` });
  }

  // A time-course design (some row has a real time point) needs every TimePointTerm; NA says there is none.
  if (drafts.some((_, row) => value(row, "time_point_term") && !isNA(value(row, "time_point_term")))) {
    drafts.forEach((_, row) => { if (!value(row, "time_point_term")) issues.push({ severity: "error", row, field: "time_point_term", message: "TimePointTerm is empty in a time-course design. Write NA only if there is none." }); });
  }

  const manifest = (options.manifest ?? []).map(id => id.trim().toLowerCase()).filter(Boolean);
  if (manifest.length) {
    const listed = new Set(manifest);
    drafts.forEach((_, row) => {
      const id = value(row, "client_sample_id");
      if (!id) issues.push({ severity: "error", row, field: "client_sample_id", message: "Client ID is empty, so it cannot be matched to the client's manifest." });
      else if (!listed.has(id.toLowerCase())) issues.push({ severity: "error", row, field: "client_sample_id", message: `Client ID ${id} is not in the client's manifest.` });
    });
  }

  drafts.forEach((draft, row) => {
    if (draft.volume_ul.trim() && parseVolume(draft.volume_ul) === null) issues.push({ severity: "error", row, field: "volume_ul", message: "Volume must be a number of µL, 0 or more." });
  });

  // Group labels: near-duplicates (the rarer spelling is flagged, the commoner one suggested) and terms used once.
  for (const field of groupFields) {
    const counts = new Map<string, number>();
    drafts.forEach((_, row) => { const term = value(row, field); if (term && !isNA(term)) counts.set(term, (counts.get(term) ?? 0) + 1); });
    const flagged = new Map<string, { like: string; fix?: string }>();
    for (const [term, count] of counts) {
      const near = [...counts].filter(([other, otherCount]) => other !== term && otherCount >= count && nearDuplicate(term, other)).sort((a, b) => b[1] - a[1]);
      if (!near.length) continue;
      const commoner = near.filter(([, otherCount]) => otherCount > count);
      flagged.set(term, { like: near[0][0], fix: commoner.length === 1 && near.length === 1 ? commoner[0][0] : undefined });
    }
    drafts.forEach((_, row) => {
      const term = value(row, field);
      const near = flagged.get(term);
      if (near) { issues.push({ severity: "warning", row, field, message: `"${term}" looks like "${near.like}"`, ...(near.fix ? { fix: near.fix } : {}) }); return; }
      if (counts.get(term) !== 1) return;
      // The other replicates of this sample (same FullName stem) agreeing on one value make that value the fix.
      const name = value(row, "full_name");
      const stem = fullNameStem(name);
      const siblings = stem && stem !== name ? drafts.flatMap((_, other) => other !== row && fullNameStem(value(other, "full_name")) === stem ? [value(other, field)] : []) : [];
      const agreed = new Set(siblings);
      const fix = siblings.length >= 2 && agreed.size === 1 && siblings[0] && siblings[0] !== term ? siblings[0] : undefined;
      issues.push({ severity: "warning", row, field, message: `${labelOf(field)} "${term}" appears once`, ...(fix ? { fix } : {}) });
    });
  }

  const levels = new Set(drafts.map((_, row) => value(row, "group1_term")).filter(term => term && !isNA(term)));
  const group1Filled = drafts.some((_, row) => value(row, "group1_term"));
  if (group1Filled && levels.size < 2) issues.push({ severity: "warning", row: null, field: "group1_term", message: levels.size ? `Group1Term has only one level (${[...levels][0]}). A comparison needs at least 2.` : "Group1Term has no level: every row is NA. A comparison needs at least 2." });

  return issues.map((issue, order) => ({ issue, order })).sort((a, b) =>
    severityRank[a.issue.severity] - severityRank[b.issue.severity] || (a.issue.row ?? -1) - (b.issue.row ?? -1) || fieldRank(a.issue.field) - fieldRank(b.issue.field) || a.order - b.order,
  ).map(({ issue }) => issue);
}

// ---------------------------------------------------------------- what the screen shows

export type Fix = { field: SampleField; value: string };
export type CheckItem = { severity: Severity; row: number | null; text: string; fixes: Fix[] };
export type CheckSummary = { validRows: number[]; errors: number; warnings: number; items: CheckItem[] };

// One line per row and severity, as the "Fix before saving" list reads; column-wide issues first.
export function summarizeChecks(drafts: SampleDraft[], issues: CheckIssue[]): CheckSummary {
  const errorRows = new Set(issues.flatMap(issue => issue.severity === "error" && issue.row !== null ? [issue.row] : []));
  const items: CheckItem[] = [];
  for (const severity of ["error", "warning"] as const) {
    const ofSeverity = issues.filter(issue => issue.severity === severity);
    for (const issue of ofSeverity.filter(issue => issue.row === null)) items.push({ severity, row: null, text: issue.message, fixes: [] });
    const rows = [...new Set(ofSeverity.flatMap(issue => issue.row === null ? [] : [issue.row]))].sort((a, b) => a - b);
    for (const row of rows) {
      const own = ofSeverity.filter(issue => issue.row === row);
      const joined = severity === "error" ? own.map(issue => issue.message).join(" ") : `${own.map(issue => issue.message).join("; ")}.`;
      items.push({ severity, row, text: `Row ${row + 1}: ${joined}`, fixes: own.flatMap(issue => issue.fix === undefined ? [] : [{ field: issue.field, value: issue.fix }]) });
    }
  }
  return {
    validRows: drafts.flatMap((_, row) => errorRows.has(row) ? [] : [row]),
    errors: items.filter(item => item.severity === "error").length,
    warnings: items.filter(item => item.severity === "warning").length,
    items,
  };
}

// The suggested fixes of one row (or of every row), applied to a copy of the list.
export function applyFixes(drafts: SampleDraft[], issues: CheckIssue[], row?: number): SampleDraft[] {
  const next = drafts.map(draft => ({ ...draft }));
  for (const issue of issues) {
    if (issue.fix === undefined || issue.row === null || (row !== undefined && issue.row !== row)) continue;
    next[issue.row][issue.field] = issue.fix;
  }
  return next;
}
