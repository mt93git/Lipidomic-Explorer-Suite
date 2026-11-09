// Sample registry logic shared by the screens, the server actions and the demo store.
// Pure: no React, no server imports. The database contract it mirrors is docs/admin/admin-wave2-brief.md.
import { stages } from "./models";

// admin.shipment.condition
export const conditions = ["ok", "thawed", "damaged", "partial"] as const;
export type Condition = typeof conditions[number];
export const conditionLabels: Record<Condition, string> = {
  ok: "Intact and cold",
  thawed: "Thawed",
  damaged: "Damaged",
  partial: "Partial · items missing",
};
export const conditionNotes: Record<Condition, string> = {
  ok: "Frozen, sealed, nothing missing.",
  thawed: "Tubes warm or ice melted; flags the order for a condition review.",
  damaged: "Broken or leaking tubes; flags the order for a condition review.",
  partial: "Fewer items than the manifest; flags the order for a condition review.",
};

// An error whose message is written for the operator and may be shown as is.
export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataError";
  }
}

// Why an order's registry does not take samples, or null when it is open (Received or Registered). One wording
// for the demo store, the server action and a refusal by admin.register_samples.
export function registryClosedProblem(code: string, stage: number): string | null {
  if (stage < 1) return `${code} has not arrived yet. Receive the shipment before registering samples.`;
  if (stage > 2) return `${code} is already ${stages[stage] ?? "Released"}; its sample registry is closed. Reload the page to see the order as it is now.`;
  return null;
}

// admin."order".stage values, in pipeline order (index = Order.stage; 'released' is the terminal outcome).
export const dbStages = ["request", "received", "registered", "extracted", "in_batch", "sequence_exported", "acquired", "processed", "qc_checked", "excel_built", "released"] as const;
export function stageFromDb(stage: string): number {
  const index = (dbStages as readonly string[]).indexOf(stage);
  return index === -1 ? 0 : Math.min(index, stages.length - 1);
}

// Exactly the jsonb keys admin.register_samples expects for each element of p_samples.
export type SampleInput = {
  full_name: string;
  client_sample_id: string | null;
  group1_term: string | null;
  group2_term: string | null;
  replicate_term: string | null;
  patient_term: string | null;
  time_point_term: string | null;
  matrix: string | null;
  volume_ul: number | null;
};
export type SampleField = keyof SampleInput;
// A row while it is being edited: every cell is text.
export type SampleDraft = Record<SampleField, string>;

export type Column = { field: SampleField; label: string; required?: boolean; hint: string; aliases: string[]; width: number };
// The six Metadata columns first, in the dataset's order, then the lab's own fields. This is also the
// order a paste without a header row is read in.
export const columns: Column[] = [
  { field: "full_name", label: "FullName", required: true, hint: "Unique in the order; becomes the abundance column header", aliases: ["full_name", "sample name", "sample", "name"], width: 150 },
  { field: "group1_term", label: "Group1Term", hint: "Treatment or primary grouping (Control, Treated)", aliases: ["group1_term", "group1", "group 1", "treatment"], width: 112 },
  { field: "group2_term", label: "Group2Term", hint: "Cohort, tissue or genotype (WildType, Mutant)", aliases: ["group2_term", "group2", "group 2", "cohort", "genotype"], width: 112 },
  { field: "replicate_term", label: "ReplicateTerm", hint: "Replicate index within the group (1, 2, 3)", aliases: ["replicate_term", "replicate", "rep"], width: 72 },
  { field: "patient_term", label: "PatientTerm", hint: "Subject identifier for paired or repeated designs", aliases: ["patient_term", "patient", "subject"], width: 84 },
  { field: "time_point_term", label: "TimePointTerm", hint: "Time point or duration (0h, 24h, Day_7)", aliases: ["time_point_term", "timepoint", "time point", "time"], width: 84 },
  { field: "client_sample_id", label: "Client sample ID", hint: "The client's own tube label", aliases: ["client_sample_id", "client id", "sample id", "tube id", "tube", "label"], width: 112 },
  { field: "matrix", label: "Matrix", hint: "Plasma, serum, tissue…", aliases: ["material", "tissue", "sample type"], width: 100 },
  { field: "volume_ul", label: "Volume (µL)", hint: "Received volume in µL", aliases: ["volume_ul", "volume", "vol", "µl", "ul"], width: 72 },
];

export const emptyDraft = (): SampleDraft => Object.fromEntries(columns.map(column => [column.field, ""])) as SampleDraft;

const normalizeHeader = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const fieldByHeader = new Map<string, SampleField>(columns.flatMap(column => [column.label, ...column.aliases].map(alias => [normalizeHeader(alias), column.field] as const)));

// Excel wraps a cell in double quotes when it holds a comma, a quote or a line break, doubling inner quotes.
function unquote(cell: string): string {
  const trimmed = cell.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replace(/""/g, '"').trim();
  return trimmed;
}

export type PasteResult = { rows: SampleDraft[]; headerDetected: boolean; ignoredHeaders: string[] };

// Tab-separated rows as copied from Excel or Google Sheets. A first row whose first cell is a known
// column name is a header and maps the columns by name (any order, spelling variants); otherwise
// cells are read in the grid's column order. Blank lines and cells beyond the known columns are dropped.
export function parsePaste(text: string): PasteResult {
  const lines = text.split(/\r\n|\r|\n/).map(line => line.split("\t").map(unquote)).filter(cells => cells.some(Boolean));
  if (!lines.length) return { rows: [], headerDetected: false, ignoredHeaders: [] };
  const headerDetected = fieldByHeader.has(normalizeHeader(lines[0][0]));
  const ignoredHeaders: string[] = [];
  let mapping: (SampleField | null)[] = columns.map(column => column.field);
  if (headerDetected) {
    const seen = new Set<SampleField>();
    mapping = lines[0].map(cell => {
      const field = fieldByHeader.get(normalizeHeader(cell));
      if (!field || seen.has(field)) { if (cell) ignoredHeaders.push(cell); return null; }
      seen.add(field);
      return field;
    });
  }
  const rows = lines.slice(headerDetected ? 1 : 0).map(cells => {
    const draft = emptyDraft();
    cells.forEach((cell, index) => { const field = mapping[index]; if (field) draft[field] = cell; });
    return draft;
  }).filter(draft => Object.values(draft).some(Boolean));
  return { rows, headerDetected, ignoredHeaders };
}

// "12,5" is accepted as 12.5; anything that is not a finite number of µL, 0 or more, is null.
export function parseVolume(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() && Number.isFinite(value) && value >= 0 ? value : null;
}

export type RowIssue = { row: number; field: SampleField; message: string };
const times = (count: number) => count === 2 ? "twice" : `${count} times`;

// Inline checks before saving: FullName present and unique (in the list and against the order's registered
// samples); volume numeric. The database repeats the uniqueness check; this is the early, row-level version.
export function validateSamples(drafts: SampleDraft[], existingNames: string[] = []): RowIssue[] {
  const issues: RowIssue[] = [];
  const names = drafts.map(draft => draft.full_name.trim());
  const counts = new Map<string, number>();
  for (const name of names) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  const registered = new Set(existingNames.map(name => name.trim()));
  drafts.forEach((draft, row) => {
    const name = names[row];
    if (!name) issues.push({ row, field: "full_name", message: "FullName is required" });
    else if (registered.has(name)) issues.push({ row, field: "full_name", message: "Already registered in this order" });
    else if ((counts.get(name) ?? 0) > 1) issues.push({ row, field: "full_name", message: `FullName appears ${times(counts.get(name) ?? 0)} in this list` });
    if (draft.volume_ul.trim() && parseVolume(draft.volume_ul) === null) issues.push({ row, field: "volume_ul", message: "Volume must be a number of µL, 0 or more" });
  });
  return issues;
}

const textOrNull = (value: string) => { const trimmed = value.trim(); return trimmed ? trimmed : null; };

export function toSampleInput(draft: SampleDraft): SampleInput {
  return {
    full_name: draft.full_name.trim(),
    client_sample_id: textOrNull(draft.client_sample_id),
    group1_term: textOrNull(draft.group1_term),
    group2_term: textOrNull(draft.group2_term),
    replicate_term: textOrNull(draft.replicate_term),
    patient_term: textOrNull(draft.patient_term),
    time_point_term: textOrNull(draft.time_point_term),
    matrix: textOrNull(draft.matrix),
    volume_ul: draft.volume_ul.trim() ? parseVolume(draft.volume_ul) : null,
  };
}

export function toDraft(sample: SampleInput): SampleDraft {
  return Object.fromEntries(columns.map(column => [column.field, sample[column.field] === null ? "" : String(sample[column.field])])) as SampleDraft;
}

// A payload that crossed the network is untrusted: keep only the contract's keys, as text or null, volume as a number.
export function normalizeSampleInputs(value: unknown): SampleInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const draft = emptyDraft();
    for (const column of columns) {
      const cell = record[column.field];
      if (typeof cell === "string") draft[column.field] = cell;
      else if (typeof cell === "number" && Number.isFinite(cell)) draft[column.field] = String(cell);
    }
    return [toSampleInput(draft)];
  });
}

// The first thing wrong with a list about to be saved, worded for the operator; null when it is fine.
export function sampleListProblem(samples: SampleInput[], existingNames: string[] = []): string | null {
  if (!samples.length) return "Add at least one sample.";
  const issue = validateSamples(samples.map(toDraft), existingNames)[0];
  return issue ? `Row ${issue.row + 1}: ${issue.message}.` : null;
}

// ---------------------------------------------------------------- receive shipment

// What the receive_shipment contract takes, in the app's words.
export type ShipmentInput = { orderId: string; carrier: string; trackingNumber: string | null; condition: Condition; boxCount: number; notes: string | null };
export const shipmentFields = ["orderId", "carrier", "trackingNumber", "condition", "boxCount", "notes"] as const;
export type ShipmentField = typeof shipmentFields[number];
export type ShipmentFormErrors = Partial<Record<ShipmentField, string>>;
export type ShipmentFormResult = { ok: true; value: ShipmentInput } | { ok: false; errors: ShipmentFormErrors };

const field = (form: FormData, name: ShipmentField) => String(form.get(name) ?? "").trim();

// What was typed, to put back into the form when the server refuses it.
export function shipmentFormValues(form: FormData): Record<ShipmentField, string> {
  return Object.fromEntries(shipmentFields.map(name => [name, field(form, name)])) as Record<ShipmentField, string>;
}

export function parseShipmentForm(form: FormData): ShipmentFormResult {
  const errors: ShipmentFormErrors = {};
  const orderId = field(form, "orderId");
  if (!orderId) errors.orderId = "Choose an order";
  const carrier = field(form, "carrier");
  if (!carrier) errors.carrier = "Enter the carrier";
  const condition = field(form, "condition");
  if (!(conditions as readonly string[]).includes(condition)) errors.condition = "Choose the condition on arrival";
  const boxes = field(form, "boxCount");
  const boxCount = Number(boxes);
  if (!boxes || !Number.isInteger(boxCount) || boxCount < 0) errors.boxCount = "Enter the number of boxes, 0 or more";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { orderId, carrier, trackingNumber: field(form, "trackingNumber") || null, condition: condition as Condition, boxCount, notes: field(form, "notes") || null } };
}

// ---------------------------------------------------------------- what the screens read

// One order as the receive and registry screens need it (demo: id = code; live: id = uuid).
export type OrderSummary = { id: string; code: string; clientId: string; clientName: string; description: string; stage: number; expectedSamples: number | null; sampleType: string | null };
export type ShipmentRecord = { id: string; carrier: string | null; trackingNumber: string | null; condition: Condition | null; boxCount: number | null; notes: string | null; receivedAt: string | null; receivedBy: string | null };
export type RegisteredSample = SampleInput & { id: string; code: string; sampleNumber: number };
export type RegistryDetail = { order: OrderSummary; shipment: ShipmentRecord | null; samples: RegisteredSample[] };

export const plural = (count: number, noun: string, many = `${noun}s`) => `${count} ${count === 1 ? noun : many}`;
